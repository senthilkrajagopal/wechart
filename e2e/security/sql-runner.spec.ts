import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { APIRequestContext, Browser, Page } from '@playwright/test';
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
 * F40, the SQL runner, against compose's xcube (`46ca0ce708`) and its sample
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
/**
 * The rows of Cube Store's slow query, SLOW_VALUES to the seventh: past the
 * 30 s cap, its work bounded by its size, since Cube Store's router runs it
 * to its end whatever its timeout. On an idle compose Cube Store a computed
 * sum over 15^7 rows ended at about 21 s (T549's probe), so about 70 s over
 * 18^7.
 */
const SLOW_VALUES = 18;

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

  test('stops a run at 30 seconds, on the database, giving the rows read before (AC-378; T545)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const marker = `stop_${RUN}`;
    const started = Date.now();
    const answer = await runOn(
      page.request,
      world.sourceId,
      `SELECT g AS ${marker}, CASE WHEN g > 3 THEN pg_sleep(31)::text END AS slept FROM generate_series(1, 5) g`,
    );
    expect(answer.status(), await answer.text()).toBe(422);
    expect(await answer.json()).toMatchObject({
      outcome: 'timeout',
      error: 'Stopped at 30 seconds: the run hadn’t finished, so it was stopped on the database.',
      // The three rows read before its fourth slept past the cap (xcube 6d9673ccda).
      columns: [
        { name: marker, type: 'int4' },
        { name: 'slept', type: 'text' },
      ],
      rows: [
        [1, null],
        [2, null],
        [3, null],
      ],
      rowCount: 3,
      truncated: 'stopped',
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

  /**
   * T535 (AC-373, AC-377, AC-378, AC-379, AC-380, AC-381, AC-383, AC-385,
   * AC-387; design 15): the SQL tab on the data source's page, as its
   * folder's read-write member and a Super-Admin use it.
   */
  test.describe('the SQL tab (T535)', () => {
    /** The writer, on the data source's SQL tab. */
    async function onTab(browser: Browser, id = world.sourceId) {
      const writer = await signedIn(browser, 'writer');
      await writer.page.goto(`/explore/data-sources/${id}`);
      const tabs = writer.page.getByRole('tablist', { name: 'Data source' });
      await tabs.getByRole('tab', { name: 'SQL' }).click();
      return { ...writer, panel: writer.page.getByRole('tabpanel', { name: 'SQL' }) };
    }
    /** The WCAG contrast ratio of two colours as the browser paints them (T638). */
    async function contrastOn(page: Page, one: string, other: string) {
      return page.evaluate(
        ([a, b]) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          const luminance = (colour: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = colour;
            context.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, bl = 0] = context.getImageData(0, 0, 1, 1).data;
            const linear = (channel: number) => {
              const c = channel / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
          };
          const [light = 0, dark = 0] = [luminance(a!), luminance(b!)].sort((x, y) => y - x);
          return (light + 0.05) / (dark + 0.05);
        },
        [one, other],
      );
    }
    /** The editor's text replaced by `sql`, typed as a person types it. */
    async function typeSql(page: Page, sql: string) {
      await page.locator('.sql-editor .cm-content').click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(sql);
    }

    test('is the sixth tab, warns above the editor, and shows a run’s columns, types, rows and time, and its CSV (AC-373, AC-385, AC-380)', async ({
      browser,
    }) => {
      const { context, page, panel } = await onTab(browser);
      const posts: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/sql'))
          posts.push(request.url());
      });
      try {
        await expect(
          page.getByRole('tablist', { name: 'Data source' }).getByRole('tab'),
        ).toHaveText(['General', 'Connection', 'Test history', 'Usage', 'In Cube', 'SQL']);
        const warning = panel.getByTestId('sql-warning');
        await expect(warning).toHaveText(
          'This SQL runs on the database directly, as sample. Folder permissions and access policies don’t apply here: you can read whatever that login can read.',
        );
        const above = (await warning.boundingBox())!;
        const editor = (await panel.locator('.sql-editor').boundingBox())!;
        expect(above.y + above.height).toBeLessThanOrEqual(editor.y);

        await typeSql(page, "SELECT 1 AS one, 'a' AS letter");
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        const grid = panel.getByRole('table', { name: 'Result: 1 row, 2 columns' });
        await expect(grid.getByRole('columnheader')).toHaveText(['#', 'oneint4', 'lettertext']);
        // Focus goes back to the editor when the run ends (design 15, keyboard).
        await expect(panel.locator('.sql-editor .cm-content')).toBeFocused();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          /^Finished 1 row · (under )?[\d.]+ s · at \d\d:\d\d:\d\dDownload CSV$/,
        );
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          panel.getByRole('button', { name: 'Download CSV' }).click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/^warehouse-\d{4}-\d\d-\d\d-\d{6}\.csv$/);
        expect(readFileSync(await download.path(), 'utf8')).toBe('one,letter\r\n1,a\r\n');
        expect(posts).toHaveLength(1);
      } finally {
        await context.close();
      }
    });

    test('runs only the selection, Run reading “Run selection”, with ⌘/Ctrl+Enter (AC-387)', async ({
      browser,
    }) => {
      const { context, page, panel } = await onTab(browser);
      try {
        await typeSql(page, 'SELECT 1 AS a;\nSELECT 2 AS b');
        await page.keyboard.press('Shift+Home');
        await expect(panel.getByRole('button', { name: 'Run selection' })).toBeVisible();
        await page.keyboard.press('ControlOrMeta+Enter');
        await expect(
          panel.getByRole('table', { name: 'Result' }).getByRole('columnheader'),
        ).toHaveText(['#', 'bint4']);
      } finally {
        await context.close();
      }
    });

    test('says a run was cut at 10,000 rows, holds Run back while one goes with Cancel, and says a refusal’s why (AC-377, AC-379, AC-378)', async ({
      browser,
    }) => {
      const { context, page, panel } = await onTab(browser);
      try {
        await typeSql(page, 'SELECT g FROM generate_series(1, 10001) g');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toContainText('Limited to 10,000 rows');
        await expect(panel.getByTestId('sql-result-cut')).toHaveText(
          'Limited to 10,000 rows. Narrow the query with WHERE, or group it, to see the rest.',
        );
        // Some 20 MB of rows: as many as fit in 10 MB, said so.
        await typeSql(page, "SELECT repeat('x', 100000) AS wide FROM generate_series(1, 200)");
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toContainText('Limited to 10 MB');
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          /^The query returned more than 10 MB\. These are the first \d+ rows, as many as fit in 10 MB\.$/,
        );
        await expect(panel.getByTestId('sql-result-cut')).toHaveText(
          'Limited to 10 MB. Choose fewer or smaller columns to see more rows.',
        );

        await typeSql(page, 'SELECT pg_sleep(20)');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Cancelled after [\d.]+ s/);
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'You cancelled the run, and it was stopped on the database. Nothing came back.',
        );

        // Cancelled after two rows came back: they're shown, marked cut (T545, AC-379; Q6).
        await typeSql(
          page,
          'SELECT g, CASE WHEN g > 2 THEN pg_sleep(20)::text END AS slept FROM generate_series(1, 5) g',
        );
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
        // Asleep on its third row, its first two read.
        await expect
          .poll(() =>
            sample(
              "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%generate_series(1, 5) g%' AND pid <> pg_backend_pid()",
            ),
          )
          .toBe('1');
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          /^Cancelled after [\d.]+ s 2 rows · at /,
        );
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'You cancelled the run, and it was stopped on the database. These are the 2 rows that came back before it was stopped.',
        );
        await expect(
          panel.getByRole('table', { name: 'Result: 2 rows, 2 columns' }).getByRole('row'),
        ).toHaveCount(3);
        await expect(panel.getByTestId('sql-result-cut')).toHaveText(
          'Cancelled before it finished. Run it again to see every row.',
        );
        // Stopped on the database, its rows read or not (AC-379; T545's review).
        expect(
          sample(
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%generate_series(1, 5) g%' AND pid <> pg_backend_pid()",
          ),
        ).toBe('0');

        await typeSql(page, 'DELETE FROM pg_class');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE statement. Nothing reached the database.',
        );
      } finally {
        await context.close();
      }
    });

    test('says a run was stopped at 30 seconds on the database, showing the rows read before, marked cut (AC-378; T548)', async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const { context, page, panel } = await onTab(browser);
      const marker = `pagestop_${RUN}`;
      try {
        await typeSql(
          page,
          `SELECT g AS ${marker}, CASE WHEN g > 3 THEN pg_sleep(31)::text END AS slept FROM generate_series(1, 5) g`,
        );
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          /^Stopped at 30 seconds 3 rows · at \d\d:\d\d:\d\dDownload CSV · 3 rows$/,
          { timeout: 45_000 },
        );
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'The run hadn’t finished after 30 seconds, so it was stopped on the database. These are the 3 rows that came back before it was stopped.',
        );
        await expect(
          panel.getByRole('table', { name: 'Result: 3 rows, 2 columns' }).getByRole('row'),
        ).toHaveCount(4);
        await expect(panel.getByTestId('sql-result-cut')).toHaveText(
          'Stopped at 30 seconds. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
        );
        // Stopped on the database: nothing of it runs on, and Run is offered again.
        expect(
          sample(
            `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%AS ${marker}%' AND pid <> pg_backend_pid()`,
          ),
        ).toBe('0');
        await expect(panel.getByTestId('sql-going-elsewhere')).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
      } finally {
        await context.close();
      }
    });

    test('lists My runs, this data source’s by default, with All (AC-381)', async ({ browser }) => {
      const { context, page, panel } = await onTab(browser);
      try {
        await typeSql(page, `SELECT 'mine_${RUN}' AS m`);
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('table', { name: 'Result' })).toBeVisible();
        const runs = panel.getByRole('region', { name: 'My runs' });
        await expect(runs.getByRole('radio', { name: 'This data source' })).toBeChecked();
        await expect(runs.getByRole('listitem').first()).toContainText(`SELECT 'mine_${RUN}' AS m`);

        /**
         * T638 (AC-176; the re-audit): a run's focus ring whole in the list
         * that clips, and the toast's Undo ring 3:1 against the toast's
         * inverted ground, as the undo toast's is (T182).
         */
        await typeSql(page, 'SELECT 2');
        const run = runs.locator('.sql-runs__run').first();
        // A key first, so the browser draws the ring for focus moved by script.
        await page.keyboard.press('Shift');
        await run.focus();
        expect(
          await run.evaluate((element) => {
            const style = getComputedStyle(element);
            if (style.outlineStyle === 'none') return 'no ring';
            const reach =
              Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
            const box = element.getBoundingClientRect();
            const list = element.closest('.sql-runs')!;
            const edge = list.getBoundingClientRect();
            return box.left - reach >= edge.left + list.clientLeft - 0.5 &&
              box.right + reach <= edge.left + list.clientLeft + list.clientWidth + 0.5
              ? 'whole'
              : 'cut off';
          }),
        ).toBe('whole');
        await page.keyboard.press('Enter');
        const toast = panel.locator('.sql-runner__toast');
        const undo = toast.getByRole('button', { name: 'Undo' });
        await page.keyboard.press('Shift');
        await undo.focus();
        const [ring, ground, style, width] = await undo.evaluate((element) => [
          getComputedStyle(element).outlineColor,
          getComputedStyle(element.closest('.sql-runner__toast')!).backgroundColor,
          getComputedStyle(element).outlineStyle,
          getComputedStyle(element).outlineWidth,
        ]);
        // A ring is drawn at all: with none, `currentColor` would pass alone (T638's review).
        expect(style).not.toBe('none');
        expect(Number.parseFloat(width!)).toBeGreaterThanOrEqual(2);
        expect(await contrastOn(page, ring!, ground!)).toBeGreaterThanOrEqual(3);
        // Undo left alone: the run's SQL stays in the editor for what follows.

        await runs.getByRole('radio', { name: 'All' }).click();
        await expect(runs.getByRole('listitem').first()).toContainText(`warehouse · SQL ${RUN}`);
        await expect(runs.getByRole('listitem').first()).toContainText(/Today \d\d:\d\d/);
        // A run's link opens its data source on the SQL tab, the editor's text kept (T535's review).
        await page.goto(`/explore/data-sources/${world.sourceId}?tab=sql`);
        await expect(
          page.getByRole('tablist', { name: 'Data source' }).getByRole('tab', { name: 'SQL' }),
        ).toHaveAttribute('aria-selected', 'true');
        await expect(panel.locator('.sql-editor .cm-content')).toHaveText(
          `SELECT 'mine_${RUN}' AS m`,
        );
      } finally {
        await context.close();
      }
    });

    test('shows the off panel while off, and a Super-Admin turns it on only by confirming (AC-373; P1)', async ({
      page,
    }) => {
      await page.goto(`/explore/data-sources/${world.sourceId}`);
      await page
        .getByRole('tablist', { name: 'Data source' })
        .getByRole('tab', { name: 'SQL' })
        .click();
      const panel = page.getByRole('tabpanel', { name: 'SQL' });
      await panel.getByRole('button', { name: 'Turn off' }).click();
      const off = panel.getByRole('region', { name: 'The SQL runner is off for warehouse' });
      await expect(off).toBeVisible();
      await expect(panel.locator('.sql-editor')).toHaveCount(0);
      // Said, and focus on Turn on… (design 15, keyboard).
      await expect(off.getByTestId('sql-turned-off')).toHaveText(
        'The SQL runner is off. Turning it on again asks for the confirmation again.',
      );
      await expect(off.getByRole('button', { name: 'Turn on the SQL runner…' })).toBeFocused();
      await off.getByRole('button', { name: 'Turn on the SQL runner…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Turn on the SQL runner for warehouse?' });
      await expect(dialog.getByRole('button', { name: 'Turn on' })).toBeDisabled();
      await dialog.getByRole('checkbox', { name: /I confirm that sample can only read/ }).check();
      await dialog.getByRole('button', { name: 'Turn on' }).click();
      await expect(panel.getByTestId('sql-switch')).toContainText('SQL runner on · turned on by');
      await expect(panel.locator('.sql-editor')).toBeVisible();
      await expect(panel.locator('.sql-editor .cm-content')).toBeFocused();
    });

    test('lists the database’s schemas, tables and columns with their types beside the editor, and puts a name chosen there into it (T539, AC-386)', async ({
      browser,
    }) => {
      const { context, page, panel } = await onTab(browser);
      try {
        await typeSql(page, 'SELECT * FROM ');
        const tree = panel.getByRole('region', { name: 'Tables in warehouse' });
        const publicSchema = tree.getByRole('treeitem', { name: 'public', exact: true });
        await publicSchema.getByTestId('sql-schema-caret').click();
        // The sample's tables, and the one this spec made, as introspection lists them.
        await expect(tree.getByRole('group', { name: 'Tables in public' })).toContainText(TABLE);
        // By the keyboard, as a tree: down to `orders`, → opens its columns.
        const orders = tree.getByRole('treeitem', { name: 'orders', exact: true });
        await orders.focus();
        await page.keyboard.press('ArrowRight');
        await expect(
          tree.getByRole('group', { name: 'Columns of public.orders' }).getByRole('treeitem'),
        ).toHaveText([
          'idinteger',
          'customer_idinteger',
          'product_idinteger',
          'statustext',
          'amountnumeric',
          'ordered_attimestamp with time zone',
        ]);
        // Enter chooses it: in at the editor's cursor.
        await page.keyboard.press('Enter');
        await expect(panel.locator('.sql-editor .cm-content')).toHaveText(
          'SELECT * FROM public.orders',
        );
        await expect(panel.locator('.sql-editor .cm-content')).toBeFocused();
        // At the cursor, and the editor keeps focus: on to run it.
        await page.keyboard.type(' LIMIT 1');
        await page.keyboard.press('ControlOrMeta+Enter');
        await expect(panel.getByRole('table', { name: 'Result: 1 row, 6 columns' })).toBeVisible();
      } finally {
        await context.close();
      }
    });

    test('runs on its owner’s copy in My workspace with no switch, saying it is theirs (AC-383)', async ({
      browser,
    }) => {
      const writer = await signedIn(browser, 'writer');
      const copied = await writer.page.request.post(`/api/data-sources/${world.sourceId}/copy`, {
        data: { timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      const copyId = ((await copied.json()) as { id: string }).id;
      const project = await projectFolderOf(writer.page.request, 'data-source', copyId);
      await writer.context.close();
      const { context, page, panel } = await onTab(browser, copyId);
      try {
        await expect(panel.getByTestId('sql-yours')).toHaveText(
          'Yours: you may run SQL on your own data sources in My workspace, with no switch. Nobody else can.',
        );
        await typeSql(page, 'SELECT current_database() AS db');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(
          panel.getByRole('table', { name: 'Result' }).getByRole('cell').nth(1),
        ).toHaveText('sample');
        // Its schema browser lists its own catalog, read in its workspace's overlay (T539, T547).
        const tree = panel.getByRole('region', { name: 'Tables in warehouse' });
        await tree
          .getByRole('treeitem', { name: 'public', exact: true })
          .getByTestId('sql-schema-caret')
          .click();
        await expect(tree.getByRole('treeitem', { name: 'orders', exact: true })).toBeVisible();

        // And one made new there, to go to the folder: its owner runs it too.
        const fresh = await page.request.post('/api/data-sources', {
          data: await testedSource(page.request, {
            folderId: project,
            targetFolderId: world.folderId,
            name: `fresh_${RUN}`,
            driver: 'postgres',
            authMethod: 'password',
            fields: FIELDS,
            sealed: {
              password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample'),
            },
          }),
        });
        expect(fresh.status(), await fresh.text()).toBe(201);
        const freshId = ((await fresh.json()) as { id: string }).id;
        try {
          await page.goto(`/explore/data-sources/${freshId}`);
          await page
            .getByRole('tablist', { name: 'Data source' })
            .getByRole('tab', { name: 'SQL' })
            .click();
          const freshPanel = page.getByRole('tabpanel', { name: 'SQL' });
          await expect(freshPanel.getByTestId('sql-yours')).toBeVisible();
          await typeSql(page, 'SELECT 41 + 1 AS answer');
          await freshPanel.getByRole('button', { name: 'Run', exact: true }).click();
          await expect(
            freshPanel.getByRole('table', { name: 'Result' }).getByRole('cell').nth(1),
          ).toHaveText('42');
          // Its browser lists its own catalog, read in the workspace's overlay,
          // where alone it is: nothing landed bears its name (T547, AC-386).
          const freshTree = freshPanel.getByRole('region', { name: `Tables in fresh_${RUN}` });
          await freshTree
            .getByRole('treeitem', { name: 'public', exact: true })
            .getByTestId('sql-schema-caret')
            .click();
          await expect(freshTree.getByRole('group', { name: 'Tables in public' })).toContainText(
            TABLE,
          );
          await freshTree.getByRole('treeitem', { name: 'orders', exact: true }).focus();
          await page.keyboard.press('ArrowRight');
          await expect(
            freshTree
              .getByRole('group', { name: 'Columns of public.orders' })
              .getByRole('treeitem'),
          ).toHaveCount(6);
        } finally {
          await page.request.delete(`/api/data-sources/${freshId}`);
        }
      } finally {
        await page.request.delete(`/api/data-sources/${copyId}`);
        await removeProjectFolder(page.request, project);
        await context.close();
      }
    });
  });

  /**
   * T536 (AC-384, AC-374; design 15's state H, P5, Q7, Q9): Cube Store, on
   * compose's xcube. Off, a Super-Admin finds its switch in Data sources' ⋯;
   * once on, it is listed at the root to them and to the writer, whose
   * folder's data source is switched on, and not to the reader. SELECT and
   * EXPLAIN alone run on it.
   */
  test.describe('Cube Store (T536)', () => {
    test.afterAll(async ({ browser }) => {
      // Off again, for every other spec.
      const admin = await signedIn(browser, 'super');
      try {
        await admin.page.request.put('/api/cube-store/sql-runner', { data: { on: false } });
      } finally {
        await admin.context.close();
      }
    });

    test('is turned on from Data sources’ ⋯ by a Super-Admin, confirming who may then read every folder’s rollups (P5, Q9)', async ({
      page,
    }) => {
      await page.request.put('/api/cube-store/sql-runner', { data: { on: false } });
      await page.goto('/sources');
      await expect(page.getByRole('link', { name: 'Cube Store' })).toHaveCount(0);
      await page.getByRole('button', { name: 'More actions for Data sources' }).click();
      await page.getByRole('menuitem', { name: 'Turn on the SQL runner for Cube Store…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Turn on the SQL runner for Cube Store?' });
      await expect(dialog).toContainText(
        'Cube Store has no logins of its own, so wechart’s check on each command is the only guard.',
      );
      await expect(dialog.getByRole('button', { name: 'Turn on' })).toBeDisabled();
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Turn on' }).click();
      await expect(page.getByTestId('source-cubestore')).toHaveText(
        'Cube StoreSharedCube Storeevery folder’s rollups',
      );
    });

    test('is listed at the root for the writer, whose folder’s data source is on, and runs SELECT and EXPLAIN alone (AC-384)', async ({
      page: admin,
      browser,
    }) => {
      // On, whatever the test before did (T536's review).
      const on = await admin.request.put('/api/cube-store/sql-runner', {
        data: { on: true, readOnlyConfirmed: true },
      });
      expect(on.status(), await on.text()).toBe(200);
      const writer = await signedIn(browser, 'writer');
      const reader = await signedIn(browser, 'reader');
      try {
        const { page } = writer;
        await page.goto('/explore?folder=root');
        await page.getByTestId('item-cubestore').getByText('Cube Store', { exact: true }).click();
        await expect(page).toHaveURL(/\/explore\/data-sources\/cubestore/);
        await expect(page.getByRole('heading', { level: 1, name: 'Cube Store' })).toBeVisible();
        await expect(
          page.getByRole('tablist', { name: 'Data source' }).getByRole('tab'),
        ).toHaveText(['SQL']);
        const panel = page.getByRole('tabpanel', { name: 'SQL' });
        await expect(panel.getByTestId('sql-warning')).toHaveText(
          'This SQL runs on Cube Store directly. It holds every folder’s rollups, and folder permissions and access policies don’t apply.',
        );
        await panel.locator('.sql-editor .cm-content').click();
        await page.keyboard.type(
          'SELECT table_schema, table_name FROM information_schema.tables LIMIT 5',
        );
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Finished/);
        // An EXPLAIN runs too: Cube Store's logical plan (research `xcube-sql-runner.md`).
        await panel.locator('.sql-editor .cm-content').click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.type('EXPLAIN SELECT 1');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
        // Anything else is refused before it reaches Cube Store, as compose's
        // xcube refuses each (T536's probe), in its words where it gives them.
        for (const [sql, said] of [
          // xcube's own words, with its straight apostrophes.
          [
            'SHOW SCHEMAS',
            "This is a SHOW command. Read Cube Store's tables instead, with a LIMIT",
          ],
          ['QUEUE TRUNCATE', 'This is a QUEUE command. Nothing reached Cube Store.'],
          [
            'SELECT * FROM system.cache LIMIT 1',
            "system.cache holds Cube's cached results and queued queries: it isn't read here. Nothing reached Cube Store.",
          ],
        ] as const) {
          await panel.locator('.sql-editor .cm-content').click();
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.type(sql);
          await panel.getByRole('button', { name: 'Run', exact: true }).click();
          await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Not run/);
          await expect(panel.getByTestId('sql-result-note')).toContainText(
            'On Cube Store, only SELECT and EXPLAIN run, one statement at a time.',
          );
          await expect(panel.getByTestId('sql-result-note')).toContainText(said);
        }

        // The reader isn't allowed on any data source: no Cube Store, listed or by its page.
        await reader.page.goto('/explore?folder=root');
        await expect(reader.page.getByTestId('explore-contents')).toBeVisible();
        await expect(reader.page.getByTestId('item-cubestore')).toHaveCount(0);
        expect((await reader.page.request.get('/api/cube-store')).status()).toBe(404);
        expect(
          (
            await reader.page.request.post('/api/cube-store/sql', { data: { sql: 'SELECT 1' } })
          ).status(),
        ).toBe(404);
      } finally {
        await writer.context.close();
        await reader.context.close();
      }
    });

    /**
     * T548, T549 (AC-378, AC-379; R62, R64): Cube Store can't stop a query.
     * One over `VALUES`, as here, its router runs, which its timeout can't
     * end either: xcube says no end, and follows it until Cube Store answers
     * (xcube 46ca0ce708, research xcube-46ca0ce708.md). The page offers no
     * Cancel and says so, says the stopped run runs to its end, and holds its
     * user's next run, on Cube Store and on a data source alike, until xcube
     * says it has ended.
     *
     * The query's work is bounded by its size: Cube Store's router computes
     * one on past any timeout, starving every other (research
     * xcube-2099b13f2d.md, "Correction").
     */
    test('says a stopped run is run to its end in Cube Store, offering no Cancel, and holds Run until it has ended (AC-378, AC-379)', async ({
      page: admin,
      browser,
    }) => {
      test.setTimeout(300_000);
      const on = await admin.request.put('/api/cube-store/sql-runner', {
        data: { on: true, readOnlyConfirmed: true },
      });
      expect(on.status(), await on.text()).toBe(200);
      const writer = await signedIn(browser, 'writer');
      const { page } = writer;
      const tables = 'abcdefg'.split('');
      const slow = `WITH t(x) AS (VALUES ${Array.from({ length: SLOW_VALUES }, (_, n) => `(${String(n + 1)})`).join(',')}) SELECT sum(${tables.map((name) => `${name}.x`).join(' + ')}) AS n FROM ${tables.map((name) => `t ${name}`).join(', ')}`;
      try {
        await page.goto('/explore/data-sources/cubestore');
        const panel = page.getByRole('tabpanel', { name: 'SQL' });
        await panel.locator('.sql-editor .cm-content').click();
        await page.keyboard.type(slow);
        const started = Date.now();
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
        // Nothing to cancel, and said so: Cube Store can't stop it (AC-379, R64).
        await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
        await expect(panel.getByTestId('sql-no-cancel')).toHaveText(
          'Cube Store can’t stop a query, so there’s no Cancel.',
        );
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          /^Stopped at 30 seconds at \d\d:\d\d:\d\d$/,
          { timeout: 45_000 },
        );

        // No end, as xcube says: its router runs it to its end (T549).
        const stopping = {
          dataSource: null,
          cubeStore: true,
          startedAt: expect.any(String),
          stopping: true,
          endsBy: null,
        };
        expect(await (await page.request.get('/api/sql-runs/going')).json()).toEqual({
          going: stopping,
        });
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store runs this query to its end; it can’t be stopped. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
        );
        const held = panel.getByTestId('sql-going-elsewhere');
        await expect(held).toHaveText(
          'Cube Store is running your last query to its end; it can’t be stopped. One run at a time: your next one runs once it has ended.',
        );
        await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();

        // Held on a data source too, the API refusing it, nothing run.
        const elsewhere = await runOn(page.request, world.sourceId, 'SELECT 1');
        expect(elsewhere.status(), await elsewhere.text()).toBe(409);
        expect(await elsewhere.json()).toEqual({
          outcome: 'going',
          error:
            'Cube Store is still finishing your last query. One run at a time: your next one runs once it has ended.',
          going: stopping,
        });
        const again = await page.request.post('/api/cube-store/sql', {
          data: { sql: 'SELECT 1' },
        });
        expect(again.status(), await again.text()).toBe(409);

        // Ended, as xcube says once Cube Store answers it: Run is offered
        // again, the result says so, and a run runs.
        await expect(held).toHaveCount(0, { timeout: 150_000 });
        // Lifted when Cube Store answered it, past the cap, not at the cap.
        expect(Date.now() - started).toBeGreaterThan(35_000);
        await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it finished this one on its own: it has since ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
        );
        await panel.locator('.sql-editor .cm-content').click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.type('SELECT 1 AS one');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
      } finally {
        await writer.context.close();
      }
    });
  });
});
