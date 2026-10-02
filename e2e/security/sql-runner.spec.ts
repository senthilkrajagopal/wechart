import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { APIRequestContext, Browser } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import {
  BASE_URL,
  expect,
  projectFolderOf,
  removeProjectFolder,
  signInThroughDex,
  test,
  testedSource,
} from './fixtures';

/**
 * F40, the SQL runner, against compose's xcube (`89628a0e88`) and its sample
 * PostgreSQL. A folder read-write for `sales-rw` (writer) and read-only for
 * `sales-ro` (reader), with a data source on the sample database, made by
 * `super`, who switches its runner on.
 *
 * T532 (AC-373, AC-375, AC-376, AC-377, AC-378, AC-383): runs through the
 * API, as the tab's own requests are.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const TABLE = `sqlrun_${RUN}`;
const SEQUENCE = `sqlrun_${RUN}_seq`;

/** The sample database, as its own user, from the host: what the runner reaches. */
const sample = (sql: string) =>
  execFileSync(
    'docker',
    ['exec', 'wechart-sample-db', 'psql', '-U', 'sample', '-d', 'sample', '-Atc', sql],
    { encoding: 'utf8' },
  ).trim();

const world = { folderId: '', sourceId: '' };

async function setUp(request: APIRequestContext) {
  const folder = await request.post('/api/documents', {
    data: { kind: 'folder', title: `SQL ${RUN}`, folderId: 'root' },
  });
  expect(folder.status()).toBe(201);
  world.folderId = ((await folder.json()) as { id: string }).id;
  expect(
    (
      await request.put(`/api/folders/${world.folderId}/access`, {
        data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
      })
    ).status(),
  ).toBe(200);
  const source = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId: world.folderId,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
    }),
  });
  expect(source.status(), await source.text()).toBe(201);
  world.sourceId = ((await source.json()) as { id: string }).id;
  const on = await request.put(`/api/data-sources/${world.sourceId}/sql-runner`, {
    data: { on: true, readOnlyConfirmed: true },
  });
  expect(on.status(), await on.text()).toBe(200);
}

/** A page of a role's, signed in afresh in a context of its own, with the suite's base URL. */
async function signedIn(browser: Browser, role: 'super' | 'writer' | 'reader') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signInThroughDex(page, role);
  return { context, page };
}

const runOn = (request: APIRequestContext, id: string, sql: string) =>
  request.post(`${BASE_URL}/api/data-sources/${id}/sql`, { data: { sql }, timeout: 90_000 });

test.use({ role: 'super' });

test.describe('SQL on a data source, through xcube (T532)', () => {
  // One world for the file's tests, in order, in one worker.
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async ({ browser }) => {
    const admin = await signedIn(browser, 'super');
    try {
      await setUp(admin.page.request);
    } finally {
      await admin.context.close();
    }
    sample(`CREATE TABLE ${TABLE} (id int); CREATE SEQUENCE ${SEQUENCE};`);
  });

  test.afterAll(async ({ browser }) => {
    sample(
      `DROP VIEW IF EXISTS ${TABLE}_view; DROP TABLE IF EXISTS ${TABLE}, ${TABLE}_into, ${TABLE}_made; DROP SEQUENCE IF EXISTS ${SEQUENCE};`,
    );
    const admin = await signedIn(browser, 'super');
    try {
      if (world.sourceId !== '')
        await admin.page.request.delete(`/api/data-sources/${world.sourceId}`);
      if (world.folderId !== '')
        await admin.page.request.delete(`/api/documents/folder/${world.folderId}`);
    } finally {
      await admin.context.close();
    }
  });

  test('runs for a Super-Admin and the folder’s read-write member, and refuses its read-only member (AC-373)', async ({
    page,
    browser,
  }) => {
    const ran = await runOn(page.request, world.sourceId, `SELECT 1 AS one, 'a' AS letter`);
    expect(ran.status(), await ran.text()).toBe(200);
    expect(await ran.json()).toEqual({
      outcome: 'finished',
      columns: [
        { name: 'one', type: 'int4' },
        { name: 'letter', type: 'text' },
      ],
      rows: [[1, 'a']],
      rowCount: 1,
      truncated: null,
      durationMs: expect.any(Number),
      statement: 'select',
    });

    const writer = await signedIn(browser, 'writer');
    const reader = await signedIn(browser, 'reader');
    try {
      expect((await runOn(writer.page.request, world.sourceId, 'SELECT 1')).status()).toBe(200);
      expect((await runOn(reader.page.request, world.sourceId, 'SELECT 1')).status()).toBe(404);
    } finally {
      await writer.context.close();
      await reader.context.close();
    }
  });

  test('refuses every write, lock, EXPLAIN ANALYZE and two statements, and nothing changes (AC-375)', async ({
    page,
  }) => {
    sample(`INSERT INTO ${TABLE} VALUES (7)`);
    for (const [sql, statement] of [
      [`INSERT INTO ${TABLE} VALUES (1)`, 'insert'],
      [`UPDATE ${TABLE} SET id = 8`, 'update'],
      [`DELETE FROM ${TABLE}`, 'delete'],
      [
        `MERGE INTO ${TABLE} t USING (SELECT 7 AS id) s ON t.id = s.id WHEN MATCHED THEN DELETE`,
        'merge',
      ],
      [`CREATE TABLE ${TABLE}_made (id int)`, 'create'],
      [`CREATE VIEW ${TABLE}_view AS SELECT 1`, 'create'],
      [`SELECT 1 INTO ${TABLE}_into`, 'select'],
      [`SELECT * FROM ${TABLE} FOR UPDATE`, 'select'],
      [`WITH d AS (DELETE FROM ${TABLE} RETURNING *) SELECT * FROM d`, 'select'],
      [`EXPLAIN ANALYZE SELECT count(*) FROM ${TABLE}`, 'explain'],
      [`SELECT 1; INSERT INTO ${TABLE} VALUES (1)`, null],
    ] as const) {
      const refused = await runOn(page.request, world.sourceId, sql);
      expect(refused.status(), sql).toBe(400);
      expect(await refused.json(), sql).toMatchObject({
        outcome: 'refused',
        error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
        statement,
      });
    }
    // Its one row as it was, and nothing made.
    expect(sample(`SELECT string_agg(id::text, ',') FROM ${TABLE}`)).toBe('7');
    for (const made of ['into', 'made', 'view'])
      expect(sample(`SELECT to_regclass('${TABLE}_${made}') IS NULL`), made).toBe('t');
  });

  test('runs a SELECT calling nextval() in a read-only transaction, so the sequence doesn’t move (AC-376)', async ({
    page,
  }) => {
    const before = sample(`SELECT last_value || ',' || is_called FROM ${SEQUENCE}`);
    const answer = await runOn(page.request, world.sourceId, `SELECT nextval('${SEQUENCE}')`);
    expect(answer.status()).toBe(422);
    expect(await answer.json()).toMatchObject({
      outcome: 'failed',
      error: 'cannot execute nextval() in a read-only transaction',
    });
    expect(sample(`SELECT last_value || ',' || is_called FROM ${SEQUENCE}`)).toBe(before);
  });

  test('gives 10,001 rows as 10,000, saying it was cut at the row cap (AC-377)', async ({
    page,
  }) => {
    const answer = await runOn(
      page.request,
      world.sourceId,
      'SELECT g FROM generate_series(1, 10001) g',
    );
    expect(answer.status()).toBe(200);
    const result = (await answer.json()) as {
      rows: unknown[];
      rowCount: number;
      truncated: string;
    };
    expect(result.rows).toHaveLength(10_000);
    expect(result.rowCount).toBe(10_000);
    expect(result.truncated).toBe('rows');
  });

  test('stops a run at 30 seconds, on the database (AC-378)', async ({ page }) => {
    test.setTimeout(120_000);
    const marker = `stop_${RUN}`;
    const started = Date.now();
    const answer = await runOn(page.request, world.sourceId, `SELECT pg_sleep(31) AS ${marker}`);
    expect(answer.status(), await answer.text()).toBe(422);
    expect(await answer.json()).toMatchObject({
      outcome: 'timeout',
      error: 'Stopped at 30 seconds: the run hadn’t finished, so it was stopped on the database.',
    });
    expect(Date.now() - started).toBeLessThan(40_000);
    expect(
      sample(
        `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%AS ${marker}%' AND pid <> pg_backend_pid()`,
      ),
    ).toBe('0');
  });

  test('holds a second run back while one goes, and Cancel stops the first on the database (T533, AC-379)', async ({
    page,
  }) => {
    const marker = `cancel_${RUN}`;
    const active = () =>
      sample(
        `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%AS ${marker}%' AND pid <> pg_backend_pid()`,
      );
    const first = runOn(page.request, world.sourceId, `SELECT pg_sleep(25) AS ${marker}`);
    await expect.poll(active, { timeout: 15_000 }).toBe('1');

    const second = await runOn(page.request, world.sourceId, 'SELECT 1');
    expect(second.status(), await second.text()).toBe(409);
    expect(await second.json()).toMatchObject({
      outcome: 'going',
      going: { dataSource: { id: world.sourceId, name: 'warehouse' } },
    });
    expect(await (await page.request.get('/api/sql-runs/going')).json()).toMatchObject({
      going: { dataSource: { id: world.sourceId } },
    });

    const started = Date.now();
    const cancelled = await page.request.post('/api/sql-runs/cancel');
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: true });
    const answer = await first;
    expect(answer.status(), await answer.text()).toBe(422);
    expect(await answer.json()).toMatchObject({
      outcome: 'cancelled',
      error: 'Cancelled: the run was stopped on the database.',
    });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(active()).toBe('0');
    expect(await (await page.request.get('/api/sql-runs/going')).json()).toEqual({ going: null });
  });

  test('keeps each run in its user’s own history, and records it with its literals replaced (T534, AC-381, AC-382)', async ({
    page,
    browser,
  }) => {
    const literal = `lit_${RUN}`;
    const writer = await signedIn(browser, 'writer');
    try {
      const ran = await runOn(
        writer.page.request,
        world.sourceId,
        `SELECT '${literal}' AS v, 7 AS n`,
      );
      expect(ran.status(), await ran.text()).toBe(200);

      // The writer's own, on this data source's list, newest first, as they wrote it.
      const mine = await writer.page.request.get(`/api/sql-runs?dataSource=${world.sourceId}`);
      expect(mine.status()).toBe(200);
      const [newest] = ((await mine.json()) as { runs: Record<string, unknown>[] }).runs;
      expect(newest).toMatchObject({
        sql: `SELECT '${literal}' AS v, 7 AS n`,
        dataSource: { id: world.sourceId, name: 'warehouse', inWorkspace: false },
        outcome: 'finished',
        rowCount: 1,
      });
      // Nobody else's list holds it.
      expect(await (await page.request.get('/api/sql-runs')).text()).not.toContain(literal);

      // The audit event: who, which data source and folder, when, the outcome,
      // the rows and the time, and the SQL with its literals replaced.
      const trail = await page.request.get(
        `/api/audit?events=sql-run&folder=${world.folderId}&limit=10`,
      );
      expect(trail.status(), await trail.text()).toBe(200);
      const body = await trail.text();
      const [event] = (JSON.parse(body) as { records: Record<string, unknown>[] }).records;
      expect(event).toMatchObject({
        event: 'sql-run',
        actor: { name: 'Wren Writer' },
        folderId: world.folderId,
        item: { kind: 'data-source', id: world.sourceId, title: 'warehouse' },
        details: {
          outcome: 'finished',
          rowCount: 1,
          durationMs: expect.any(Number),
          sql: 'SELECT ? AS v, ? AS n',
        },
      });
      expect(body).not.toContain(literal);
    } finally {
      await writer.context.close();
    }
  });

  test('runs for its owner on a copy in My workspace, with no switch, in their workspace’s preview (AC-383)', async ({
    page,
    browser,
  }) => {
    // The original's runner off, so the copy runs on no switch of anyone's (T532's review).
    const off = await page.request.put(`/api/data-sources/${world.sourceId}/sql-runner`, {
      data: { on: false },
    });
    expect(off.status(), await off.text()).toBe(200);
    expect(await off.json()).toEqual({ on: false });
    const writer = await signedIn(browser, 'writer');
    let copyId = '';
    let project = '';
    try {
      // Off for the original, for the writer too.
      expect((await runOn(writer.page.request, world.sourceId, 'SELECT 1')).status()).toBe(403);
      const copied = await writer.page.request.post(`/api/data-sources/${world.sourceId}/copy`, {
        data: { timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      copyId = ((await copied.json()) as { id: string }).id;
      project = await projectFolderOf(writer.page.request, 'data-source', copyId);
      const answer = await runOn(writer.page.request, copyId, 'SELECT current_database() AS db');
      expect(answer.status(), await answer.text()).toBe(200);
      expect(((await answer.json()) as { rows: unknown[][] }).rows).toEqual([['sample']]);
      // Nobody else: a Super-Admin doesn't see another's workspace (AC-276).
      expect((await runOn(page.request, copyId, 'SELECT 1')).status()).toBe(404);

      // Pointed at another database, as a passing test of it lets it be saved,
      // it needs a Super-Admin's switch, which no Super-Admin can see to give (Q8).
      const elsewhere = { ...FIELDS, database: 'postgres' };
      const tried = await writer.page.request.post(`/api/data-sources/${copyId}/test`, {
        data: { fields: elsewhere },
        timeout: 90_000,
      });
      expect(tried.status(), await tried.text()).toBe(200);
      const { ok, testId } = (await tried.json()) as { ok: boolean; testId: string };
      expect(ok).toBe(true);
      const saved = await writer.page.request.put(`/api/data-sources/${copyId}`, {
        data: { fields: elsewhere, testId },
      });
      expect(saved.status(), await saved.text()).toBe(200);
      const repointed = await runOn(writer.page.request, copyId, 'SELECT current_database()');
      expect(repointed.status(), await repointed.text()).toBe(403);
      expect(((await repointed.json()) as { error: string }).error).toMatch(
        /^This copy signs in to another database, or as another user or role, than its original, so it needs a Super-Admin to turn the SQL runner on/,
      );
    } finally {
      if (copyId !== '') await writer.page.request.delete(`/api/data-sources/${copyId}`);
      if (project !== '') await removeProjectFolder(writer.page.request, project);
      await writer.context.close();
      await page.request.put(`/api/data-sources/${world.sourceId}/sql-runner`, {
        data: { on: true, readOnlyConfirmed: true },
      });
    }
  });
});
