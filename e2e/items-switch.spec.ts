import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateChartDocument, readChartDocument, toChartSpec, toCubeQuery } from '@wechart/core';
import { expect, test } from '@playwright/test';

import { CUBE, serviceToken, startApi, stopApi, type ApiProcess } from './api-process';
import { pushDevSigningKey, queryToken } from './tokens';

/**
 * T430 / AC-336: WHEN wechart first moves its model to xcube's items mode
 * (one items snapshot of its published files, each file a root item), THE
 * SYSTEM SHALL answer every existing dashboard with the same data as before,
 * and change no stored chart, dashboard, marking, bookmark or link.
 * `Fails when: after the move an existing dashboard's tile shows different
 * data, or an error, compared with before it; a stored chart, dashboard,
 * marking, bookmark or link differs from before it; or a root cube's rollup
 * is rebuilt because of the move.`
 *
 * Against compose's Cube on xcube's published image. A model of this spec's
 * own is put to xcube as a file set, as slice 2 left every model, with the
 * files the store seeds from. An API that can't reach xcube's admin routes
 * (a wrong admin token) serves it seeded, without moving it. Each seeded
 * chart's query, built as its tile builds it, is answered pinned to the file
 * set's revision, and the seed rollup's plan and built table are read, and
 * everything stored is recorded. The same API, restarted with the right
 * token, then moves the model (T449), and all of it is read again pinned to
 * the items revision, each answer's `x-xcube-revision` checked (T430's
 * review).
 */
const REPO = fileURLToPath(new URL('..', import.meta.url));

/** SQL in the metadata Postgres, as its admin, on stdin. */
const psql = (database: string, sql: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

/**
 * A token as wechart's API signs one, naming the model and the revision it
 * must be answered from (T421; research `xcube-slice-2.md`, "Query tokens"):
 * RS256 under the pushed development key (T437, `e2e/tokens.ts`).
 */
function tokenFor(model: string, revision: number): string {
  return queryToken({ wechartModel: model, wechartRevision: revision });
}

/** The plain YAML model files the store seeds from, as slice 2 sent them. */
function seedFiles(): { path: string; content: string }[] {
  const root = join(REPO, 'infra/cube/model');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return walk(root)
    .map((full) => ({ path: relative(root, full), content: readFileSync(full, 'utf8') }))
    .filter((file) => /\.ya?ml$/.test(file.path) && !/{%|%}|{{|}}/.test(file.content))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * This spec's own model gone from xcube's store: items mode never goes back
 * to a file set (research 3a). In the order the schema's foreign keys allow
 * (as `pg_constraint` shows them): the model's current revision let go, its
 * revisions, then the model.
 */
const forget = (model: string) =>
  psql(
    'wechart_meta',
    [
      `UPDATE xcube.models SET current_rev = NULL WHERE id = '${model}';`,
      `DELETE FROM xcube.revisions WHERE model = '${model}';`,
      `DELETE FROM xcube.models WHERE id = '${model}';`,
    ].join('\n'),
  );

async function xcube(model: string, path: string, init?: RequestInit) {
  const response = await fetch(`${CUBE}/v1/semantic/models/${model}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The model's current revision in xcube, and its mode. */
async function head(model: string): Promise<{ mode: string; revision: number }> {
  const { body } = await xcube(model, '/revision');
  const current = body['current'] as { revision?: number } | null;
  return { mode: String(body['mode']), revision: current?.revision ?? 0 };
}

/**
 * Cube's answer to a query, pinned to a revision: polled past a catch-up
 * `503` and Cube's "Continue wait" (a 200 with no `data`), and checked to
 * come from that revision by the header xcube sets on every answer.
 */
async function ask(
  model: string,
  revision: number,
  path: '/v1/load' | '/v1/sql',
  query: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let answer: Record<string, unknown> = {};
  await expect
    .poll(
      async () => {
        const response = await fetch(
          path === '/v1/sql'
            ? `${CUBE}${path}?query=${encodeURIComponent(JSON.stringify(query))}`
            : `${CUBE}${path}`,
          {
            method: path === '/v1/sql' ? 'GET' : 'POST',
            headers: {
              authorization: tokenFor(model, revision),
              'content-type': 'application/json',
            },
            ...(path === '/v1/load' ? { body: JSON.stringify({ query }) } : {}),
          },
        );
        answer = (await response.json()) as Record<string, unknown>;
        if (response.status !== 200) return String(answer['error'] ?? response.status);
        if (path === '/v1/load' && !Array.isArray(answer['data']))
          return String(answer['error'] ?? 'no data');
        return response.headers.get('x-xcube-revision');
      },
      { timeout: 120_000, intervals: [1_000] },
    )
    .toBe(`${model}@${String(revision)}`);
  return answer;
}

/** A load's rows, in an order its own sort can't leave ambiguous. */
const rowsOf = (answer: Record<string, unknown>) =>
  (answer['data'] as unknown[]).map((row) => JSON.stringify(row)).sort();

const ROLLUP_QUERY = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.status'] };

/**
 * The seed rollup as the revision plans it (`/v1/sql`): its table, and the
 * SQL its structure version hashes (research 3b, Gotcha 10).
 */
async function rollupPlan(model: string, revision: number) {
  const answer = await ask(model, revision, '/v1/sql', ROLLUP_QUERY);
  const plan = (answer['sql'] as { preAggregations?: Record<string, unknown>[] } | undefined)
    ?.preAggregations?.[0];
  return {
    tableName: plan?.['tableName'],
    loadSql: plan?.['loadSql'],
    indexesSql: plan?.['indexesSql'],
  };
}

/**
 * When the table the seed rollup's answer came from was built: Cube's
 * `usedPreAggregations[…].lastUpdatedAt` (this Cube answers no
 * `targetTableName` there, as observed on compose's Cube). A rebuild after
 * the move would answer from a table built later.
 */
async function builtAt(model: string, revision: number): Promise<number> {
  let at = 0;
  await expect
    .poll(
      async () => {
        const answer = await ask(model, revision, '/v1/load', ROLLUP_QUERY);
        const used = answer['usedPreAggregations'] as
          Record<string, { preAggregationId?: string; lastUpdatedAt?: number }> | undefined;
        const served = Object.values(used ?? {}).find(
          (each) => each.preAggregationId === 'monthly_orders.by_status_month',
        );
        at = served?.lastUpdatedAt ?? 0;
        return at;
      },
      { timeout: 180_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  return at;
}

test.describe.serial('the move to items mode (T430, AC-336)', () => {
  test.setTimeout(900_000);
  let database = '';
  let model = '';
  let port = 0;
  let api: ApiProcess | undefined;

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    database = `wechart_items_switch_${testInfo.project.name}`;
    model = `e2e-items-switch-${testInfo.project.name}`;
    port = 4520 + testInfo.parallelIndex;
    psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    psql('wechart_meta', `CREATE DATABASE ${database}`);
    forget(model);
    const put = await xcube(model, '/snapshot', {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: null, files: seedFiles(), source: { reason: 'T430' } }),
    });
    expect(put.status).toBe(201);
    // Its query tokens are RS256 (T437): the key an API serving it would push.
    await pushDevSigningKey(model);
  });

  test.afterAll(async () => {
    await stopApi(api?.process);
    if (database !== '') psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    if (model !== '') forget(model);
  });

  test('every seeded chart answers the same, nothing stored changes, and the rollup isn’t rebuilt', async () => {
    // Seeded, and kept from xcube: it can't move the model. No model and no
    // service key, so it sends xcube nothing (T447). A key xcube refuses no
    // longer does: the API then won't start, since it checks xcube's
    // credential keys with it first (T455).
    api = await startApi(port, {
      database,
      model,
      settings: {
        WECHART_SEED: '1',
        WECHART_XCUBE_MODEL: '',
        WECHART_SERVICE_KEY_FILE: '',
        WECHART_SIGNING_KEY_FILE: '',
      },
    });
    const files = await head(model);
    expect(files.mode).toBe('files');

    // What is stored that names members: a bookmark's filters and marks, and
    // a new dashboard with its markings.
    const bookmark = await fetch(`${api.url}/api/dashboards/seed-root-dashboard-1/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Shipped',
        state: {
          filters: { 'orders.status': ['shipped'] },
          marks: { marking: { 'orders.status': ['shipped'] } },
        },
      }),
    });
    expect(bookmark.status).toBe(201);
    const dashboard = await fetch(`${api.url}/api/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'dashboard', title: 'Marked', folderId: 'root' }),
    });
    expect(dashboard.status).toBe(201);

    const stored = () =>
      JSON.parse(
        psql(
          database,
          `SELECT coalesce(json_agg(json_build_object('kind', kind, 'id', id, 'body', body, 'version', version, 'updated', updated_at) ORDER BY kind, id), '[]') FROM documents`,
        ),
      ) as { kind: string; id: string; body: Record<string, unknown> }[];
    /** Each chart with fields, asked as its tile asks it (T430's review). */
    const answers = async (documents: ReturnType<typeof stored>, revision: number) => {
      const result: Record<string, string[]> = {};
      for (const chart of documents.filter((each) => each.kind === 'chart')) {
        // Migrated as the documents repository reads it for the app.
        const spec = toChartSpec(readChartDocument(migrateChartDocument(chart.body)));
        if (spec.measures.length + spec.dimensions.length + spec.timeDimensions.length === 0)
          continue;
        result[chart.id] = rowsOf(await ask(model, revision, '/v1/load', toCubeQuery(spec)));
      }
      return result;
    };

    const before = stored();
    expect(before.some((each) => each.kind === 'bookmark')).toBe(true);
    expect(
      before.some((each) => each.kind === 'dashboard' && Array.isArray(each.body['markings'])),
    ).toBe(true);
    const answeredBefore = await answers(before, files.revision);
    expect(Object.keys(answeredBefore).length).toBeGreaterThan(3);
    for (const [chart, rows] of Object.entries(answeredBefore))
      expect(rows.length, `${chart} answers something`).toBeGreaterThan(0);
    const planBefore = await rollupPlan(model, files.revision);
    expect(String(planBefore.tableName)).toMatch(/monthly_orders/);
    expect(planBefore.loadSql).toBeDefined();
    // Built now, through Cube's jobs API with the service credential, as Jobs
    // builds it (T420): the refresh worker's schedule isn't this spec's to
    // wait for, and this API is kept from xcube, its service key with it.
    const jobs = (body: Record<string, unknown>) =>
      fetch(`${CUBE}/v1/pre-aggregations/jobs`, {
        method: 'POST',
        headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((response) => response.json() as Promise<unknown>);
    const tokens = (await jobs({
      action: 'post',
      selector: {
        contexts: [{ securityContext: { wechartModel: model, wechartRevision: files.revision } }],
        timezones: ['UTC'],
        preAggregations: ['monthly_orders.by_status_month'],
      },
    })) as string[];
    expect(tokens.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const states = (await jobs({ action: 'get', tokens })) as { status: string }[];
          return states.length === tokens.length && states.every((job) => job.status === 'done');
        },
        { timeout: 180_000, intervals: [2_000] },
      )
      .toBe(true);
    const builtBefore = await builtAt(model, files.revision);

    // The same API, able to reach xcube now: it moves the model at start.
    await stopApi(api.process);
    api = await startApi(port, { database, model });
    await expect.poll(async () => (await head(model)).mode, { timeout: 60_000 }).toBe('items');
    const items = await head(model);
    expect(items.revision).toBeGreaterThan(files.revision);

    // Nothing stored changed: not a chart, dashboard, marking, bookmark or link.
    const after = stored();
    expect(after).toEqual(before);
    // Every chart answers from the items revision as it did from the file set.
    expect(await answers(after, items.revision)).toEqual(answeredBefore);
    // The root cube's rollup is planned alike, and answered from the table
    // built before the move: nothing rebuilt.
    expect(await rollupPlan(model, items.revision)).toEqual(planBefore);
    expect(await builtAt(model, items.revision)).toBe(builtBefore);
  });
});
