import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';
import { changeSharedSource } from './shared-change';

/**
 * T501 (AC-161; the user's answer of 2026-09-27, "No and No"; research
 * xcube-bc18f82c01.md): a data source changed in place is served from its new
 * target at once. Once every Cube instance reports the new settings live, no
 * query through it answers from the old target: not from Cube's cache, and
 * not from a rollup built over the old one.
 *
 * Against compose's xcube and its sample database's server, through the API
 * as `super`. The cube answers the database it reads and is served from a
 * rollup, so an answer from the old target would name the old database.
 * Both are the root's, whose rollups Jobs builds (a folder's module isn't in
 * its build context until T371).
 */
const RUN = `m${Math.random().toString(36).slice(2, 7)}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
// A root cube keeps its bare name (R30).
const CUBE = `${RUN}_moved`;
const SOURCE = `${RUN}_src`;
const full = CUBE;
const fieldsOf = (database: string) => ({
  host: 'sample-db',
  port: 5432,
  database,
  user: 'sample',
  ssl: false,
});
const cubeYaml = [
  'cubes:',
  `  - name: ${CUBE}`,
  // As text: a rollup can't hold Postgres's own `name` type.
  '    sql: SELECT current_database()::text AS db, 1 AS n',
  // Kept an hour, so an old target's answer that outlived the move would be
  // served, not asked again on Cube's 10-second default (T501's review).
  '    refresh_key:',
  '      every: 1 hour',
  `    data_source: ${SOURCE}`,
  '    measures:',
  '      - name: count',
  '        type: count',
  '    dimensions:',
  '      - name: db',
  '        sql: db',
  '        type: string',
  // Not in the rollup: a query by it is Cube's own, answered from its cache.
  '      - name: n',
  '        sql: n',
  '        type: number',
  '    pre_aggregations:',
  '      - name: by_db',
  '        measures:',
  '          - CUBE.count',
  '        dimensions:',
  '          - CUBE.db',
  '        refresh_key:',
  '          every: 1 hour',
  '',
].join('\n');

let sourceId = '';
/** Whether the cube was published, so the clean-up removes it. */
let published = false as boolean;

/**
 * One read of the database the cube answers, or the error it answers
 * instead: through its rollup, or, with `rollup: false`, by a dimension the
 * rollup lacks, which Cube answers itself, from its result cache once asked.
 */
async function read(
  request: APIRequestContext,
  { rollup = true }: { rollup?: boolean } = {},
): Promise<{ db?: string; error?: string }> {
  // The same query each time: an old answer, cached or rolled up, would be reused.
  const answer = await request.post('/api/load', {
    data: {
      query: {
        measures: [`${full}.count`],
        dimensions: rollup ? [`${full}.db`] : [`${full}.db`, `${full}.n`],
      },
    },
  });
  const body = (await answer.json()) as { data?: Record<string, string>[]; error?: string };
  return answer.status() === 200
    ? { db: body.data?.[0]?.[`${full}.db`] ?? '' }
    : { error: body.error ?? String(answer.status()) };
}

/** A rollup table's name before the version Cube adds: `…_by_db`. */
const stemOf = (table: string) => {
  const name = table.split('.').at(-1) ?? '';
  return name.slice(0, name.indexOf('_by_db') + '_by_db'.length);
};

/**
 * Its rollup built through Cube's jobs API, as Jobs builds one (T155), and
 * followed to done; the table it was built into.
 */
async function built(request: APIRequestContext): Promise<string> {
  // Asked again until Cube has compiled the publish that declares it.
  let tokens: string[] = [];
  await expect
    .poll(
      async () => {
        const started = await request.post('/api/builds', {
          data: { preAggregation: `${full}.by_db` },
        });
        if (started.status() !== 200) return `${String(started.status())} ${await started.text()}`;
        tokens = ((await started.json()) as { tokens: string[] }).tokens;
        return tokens.length;
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  let table = '';
  await expect
    .poll(
      async () => {
        const answered = (await (
          await request.post('/api/builds/status', { data: { tokens } })
        ).json()) as { status: string; table?: string }[];
        table = answered.find((each) => each.table !== undefined)?.table ?? table;
        return answered.map((each) => each.status);
      },
      { timeout: 90_000, intervals: [1_000] },
    )
    .toEqual(tokens.map(() => 'done'));
  expect(table).not.toBe('');
  return table;
}

/**
 * The first database the cube answers, waiting out a rollup not built yet;
 * every answer it gave on the way, so an old one can't pass unseen.
 */
async function answers(request: APIRequestContext) {
  const seen: string[] = [];
  await expect
    .poll(
      async () => {
        const { db, error } = await read(request);
        seen.push(db ?? `error: ${error ?? ''}`);
        return db;
      },
      { timeout: 150_000, intervals: [2_000] },
    )
    .toBeTruthy()
    .catch((failure: unknown) => {
      throw new Error(
        `The cube answered no database. Its last answers: ${[...new Set(seen.slice(-5))].join(' | ')}`,
        { cause: failure },
      );
    });
  return seen.filter((each) => !each.startsWith('error: '));
}

/**
 * Changed as a shared one is (T502, AC-278): its copy in My workspace, changed
 * there from a passing test of exactly that change, proposed and approved,
 * which lands it in its folder. Awaited until Cube reports it live.
 */
async function moveTo(request: APIRequestContext, database: string) {
  const fields = fieldsOf(database);
  await changeSharedSource(
    request,
    sourceId,
    async (copyId) => {
      const tried = await request.post(`/api/data-sources/${copyId}/test`, {
        data: { fields },
        timeout: 90_000,
      });
      expect(tried.status(), await tried.text()).toBe(200);
      const { ok, testId } = (await tried.json()) as { ok: boolean; testId: string };
      expect(ok).toBe(true);
      return { fields, testId };
    },
    `Reads ${database} (${RUN}).`,
  );
  // Landed in its folder by the approval: the shared one reads it now.
  const landed = (await (await request.get(`/api/data-sources/${sourceId}`)).json()) as {
    fields: { database: string };
  };
  expect(landed.fields.database).toBe(database);
  await expect
    .poll(
      async () =>
        (
          (await (await request.get(`/api/data-sources/${sourceId}/cube-state`)).json()) as {
            state: string;
          }
        ).state,
      { timeout: 90_000, intervals: [1_000] },
    )
    .toBe('live');
}

test.describe.configure({ mode: 'serial' });

test.describe('a data source changed in place (T501, AC-161)', () => {
  test.use({ role: 'super' });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // The cube first: the data source can't go while a cube is bound to it.
    if (published)
      await request.delete(
        `/api/model/files?folder=root&path=${encodeURIComponent(`cubes/${CUBE}.yml`)}`,
      );
    if (sourceId !== '') await request.delete(`/api/data-sources/${sourceId}`);
    await context.close();
  });

  test('is served from its new target once Cube reports it live: never the old one’s cache or rollup', async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const request = page.request;
    const fields = fieldsOf('postgres');
    const made = await request.post('/api/data-sources', {
      data: await testedSource(request, {
        folderId: 'root',
        name: SOURCE,
        driver: 'postgres',
        authMethod: 'password',
        fields,
        sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, 'sample') },
      }),
    });
    expect(made.status(), await made.text()).toBe(201);
    sourceId = ((await made.json()) as { id: string }).id;
    // Through My workspace and a proposal `super` approves (T451, AC-278).
    const file = { path: `cubes/${CUBE}.yml`, content: cubeYaml };
    published = true;
    expect(await landed(request, 'root', [file])).toEqual([file]);

    // Built over its first target, and answered from it: through its rollup,
    // and by Cube itself, whose answer it now holds in its cache.
    // Its published name while its data source is at its first target (R38):
    // the cube's, with the publish-time alias a data source but `default`
    // adds (xcube e53cf2a8b8), never an alias of the connection's identity.
    const first = stemOf(await built(request));
    expect(first.startsWith(`${CUBE}_`), first).toBe(true);
    expect(await answers(request)).toEqual(['postgres']);
    expect(await read(request, { rollup: false })).toEqual({ db: 'postgres' });

    // Moved to another database: once live, never the old one again. Cube's
    // own answer is the new target's at once, not its cache of the old.
    await moveTo(request, 'template1');
    expect(await read(request, { rollup: false })).toEqual({ db: 'template1' });
    // The rollup answers "not built yet" at most, until it is built anew.
    const before = await read(request);
    if (before.db === undefined)
      expect(before.error).toMatch(/No pre-aggregation partitions were built yet/);
    else expect(before.db).toBe('template1');
    // Moved: an alias of its new target, so a table of its own (R38).
    const moved = stemOf(await built(request));
    expect(moved).not.toBe(first);
    expect(await answers(request)).toEqual(['template1']);

    // And back to its first target, the same way: its first names, and so
    // its first rollup, are that target's own (the user, 2026-09-28, R38).
    await moveTo(request, 'postgres');
    expect(await read(request, { rollup: false })).toEqual({ db: 'postgres' });
    expect(stemOf(await built(request))).toBe(first);
    expect(await answers(request)).toEqual(['postgres']);
  });
});
