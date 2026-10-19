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
/** The folder's data source: a name held once across the system (T700, AC-421). */
const SOURCE = `warehouse_${RUN}`;
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
      name: SOURCE,
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
      going: { dataSource: { id: world.sourceId, name: SOURCE } },
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
        dataSource: { id: world.sourceId, name: SOURCE, inWorkspace: false },
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
        item: { kind: 'data-source', id: world.sourceId, title: SOURCE },
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
   * T535 (design 15) put the runner on the data source's page; T823
   * (AC-464, AC-373; design 17's N) leaves there the tab, renamed "SQL
   * runner", with the switch's record or the off panel and "Open in SQL
   * runner", and no editor. The runs T535 showed on the page are the SQL
   * runner workspace's (F42), opened from that tab, where these tests run
   * them now (AC-377, AC-378, AC-379, AC-383). The page's editor, warning,
   * selection, My runs and schema browser tests went with it: the workspace's
   * are `sql-workspace.spec.ts`'s T802, T803, T805 and T817.
   */
  test.describe('the data source page’s SQL runner tab, and the workspace it opens (T535, T823)', () => {
    /** The writer, on the data source's "SQL runner" tab. */
    async function onTab(browser: Browser, id = world.sourceId) {
      const writer = await signedIn(browser, 'writer');
      await writer.page.setViewportSize({ width: 1440, height: 900 });
      await writer.page.goto(`/explore/data-sources/${id}`);
      const tabs = writer.page.getByRole('tablist', { name: 'Data source' });
      await tabs.getByRole('tab', { name: 'SQL runner' }).click();
      return { ...writer, panel: writer.page.getByRole('tabpanel', { name: 'SQL runner' }) };
    }
    /** The SQL runner workspace's tabs. */
    const sqlTabs = (page: Page) => page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');
    /** The writer, in the workspace that tab's "Open in SQL runner" opened on `id`. */
    async function inWorkspace(browser: Browser, id = world.sourceId) {
      const opened = await onTab(browser, id);
      await opened.panel.getByRole('link', { name: 'Open in SQL runner' }).click();
      await expect(opened.page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
      await expect(opened.page.locator('.sql-editor')).toBeVisible();
      return opened;
    }
    /** The editor's text replaced by `sql`, typed as a person types it. */
    async function typeSql(page: Page, sql: string) {
      await page.locator('.sql-editor .cm-content').click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(sql);
    }

    test('is the sixth tab, “SQL runner”, with the switch’s record and no editor; “Open in SQL runner” there, in the page head’s ⋯, a Data sources row’s ⋯ and an Explore row’s ⋯ each opens a workspace tab on it (T823, AC-464, AC-373)', async ({
      browser,
    }) => {
      const { context, page, panel } = await onTab(browser);
      const opened = new RegExp(`^Query \\d+, Not run yet, on ${SOURCE}$`);
      const selected = () =>
        page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab', { selected: true });
      try {
        await expect(
          page.getByRole('tablist', { name: 'Data source' }).getByRole('tab'),
        ).toHaveText(['General', 'Connection', 'Test history', 'Usage', 'In Cube', 'SQL runner']);
        await expect(panel.getByTestId('sql-switch')).toContainText(
          'SQL runner on · turned on by',
        );
        const who = panel.locator('dl.sql-off__who');
        await expect(who.locator('dt')).toHaveText(['Who may run SQL', 'Runs as']);
        await expect(who.locator('dd').first()).toHaveText(
          /^Super-Admins, and read-write members of .+: sales-rw$/,
        );
        await expect(who.locator('dd').nth(1)).toHaveText('sample on sample at sample-db:5432');
        // No editor, nor Run: the runner is the workspace's (AC-464).
        await expect(panel.locator('.sql-editor')).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
        // Not for the folder's member's eyes alone: no Turn off.
        await expect(panel.getByRole('button', { name: 'Turn off' })).toHaveCount(0);

        // From the tab: the workspace, on a new tab on this source.
        await panel.getByRole('link', { name: 'Open in SQL runner' }).click();
        await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
        await expect(sqlTabs(page)).toHaveCount(2);
        await expect(selected()).toHaveAttribute('aria-label', opened);

        // From the page head's ⋯.
        await page.goto(`/explore/data-sources/${world.sourceId}`);
        await page.getByRole('button', { name: `More actions for ${SOURCE}` }).click();
        await page.getByRole('menuitem', { name: 'Open in SQL runner' }).click();
        await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
        await expect(sqlTabs(page)).toHaveCount(3);
        await expect(selected()).toHaveAttribute('aria-label', opened);

        // From its row's ⋯ in Data sources.
        await page.goto('/data-sources');
        await page
          .getByRole('table', { name: 'Data sources' })
          .getByRole('button', { name: `Actions for ${SOURCE}` })
          .click();
        await page.getByRole('menuitem', { name: 'Open in SQL runner' }).click();
        await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
        await expect(sqlTabs(page)).toHaveCount(4);
        await expect(selected()).toHaveAttribute('aria-label', opened);

        // And from its row's ⋯ in Explore.
        await page.goto(`/explore?folder=${world.folderId}`);
        await page.getByRole('button', { name: `Actions for ${SOURCE}` }).click();
        await page.getByRole('menuitem', { name: 'Open in SQL runner' }).click();
        await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
        await expect(sqlTabs(page)).toHaveCount(5);
        await expect(selected()).toHaveAttribute('aria-label', opened);
      } finally {
        await context.close();
      }
    });

    test('says a run was cut at 10,000 rows, holds Run back while one goes with Cancel, and says a refusal’s why (AC-377, AC-379, AC-378)', async ({
      browser,
    }) => {
      const { context, page } = await inWorkspace(browser);
      const panel = page;
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
        // Asleep on the database before it is cancelled: a cancel while xcube
        // is still connecting has no statement time to say ("Cancelled · at …",
        // the coordinator's call, 2026-10-08, overturnable).
        await expect
          .poll(() =>
            sample(
              "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%SELECT pg_sleep(20)%' AND pid <> pg_backend_pid()",
            ),
          )
          .toBe('1');
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
        // The workspace's head names the state as its tab does: "Cancelled" (T804, AC-452).
        await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Cancelled at \d\d:\d\d:\d\d/);
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
          /^Cancelled 2 rows · at \d\d:\d\d:\d\d/,
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
      const { context, page } = await inWorkspace(browser);
      const panel = page;
      const marker = `pagestop_${RUN}`;
      try {
        await typeSql(
          page,
          `SELECT g AS ${marker}, CASE WHEN g > 3 THEN pg_sleep(31)::text END AS slept FROM generate_series(1, 5) g`,
        );
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          // With Make a cube… and Make a chart…, held, before Download CSV (T819, AC-461).
          /^Stopped at 30 seconds 3 rows · at \d\d:\d\d:\d\dRun it to the end first\.Make a cube…Make a chart…Download CSV · 3 rows$/,
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

    test('shows the off panel while off, and a Super-Admin turns it on only by confirming (AC-373; P1)', async ({
      page,
    }) => {
      await page.goto(`/explore/data-sources/${world.sourceId}`);
      await page
        .getByRole('tablist', { name: 'Data source' })
        .getByRole('tab', { name: 'SQL runner' })
        .click();
      const panel = page.getByRole('tabpanel', { name: 'SQL runner' });
      await panel.getByRole('button', { name: 'Turn off' }).click();
      const off = panel.getByRole('region', { name: `The SQL runner is off for ${SOURCE}` });
      await expect(off).toBeVisible();
      await expect(panel.locator('.sql-editor')).toHaveCount(0);
      // Said, and focus on Turn on… (design 15, keyboard).
      await expect(off.getByTestId('sql-turned-off')).toHaveText(
        'The SQL runner is off. Turning it on again asks for the confirmation again.',
      );
      await expect(off.getByRole('button', { name: 'Turn on the SQL runner…' })).toBeFocused();
      // As design 15 draws it (T698, SRC-20, SRC-21, SRC-05): its heading 16/600
      // with the off icon; the login in the code face; who could run SQL as a
      // 110 px key column at 12/16, the folder's read-write group named; Turn on
      // with its shield; the SQL tab with its terminal.
      const heading = off.getByRole('heading', { level: 2 });
      await expect(heading).toHaveCSS('font-size', '16px');
      await expect(heading).toHaveCSS('font-weight', '600');
      await expect(heading.locator('svg')).toHaveAttribute('data-icon', 'off');
      await expect(off.locator('p code')).toHaveText('sample');
      await expect(off.locator('p code')).toHaveCSS('font-family', /IBM Plex Mono/);
      const who = off.locator('dl.sql-off__who');
      await expect(who.locator('dd').first()).toHaveText(
        /^Super-Admins, and read-write members of .+: sales-rw$/,
      );
      await expect(who.locator('dd').first().locator('code')).toHaveText('sales-rw');
      await expect(who).toHaveCSS('font-size', '12px');
      await expect(who).toHaveCSS('line-height', '16px');
      expect(Math.round((await who.locator('dt').first().boundingBox())?.width ?? 0)).toBe(110);
      await expect(
        off.getByRole('button', { name: 'Turn on the SQL runner…' }).locator('svg'),
      ).toHaveAttribute('data-icon', 'shield');
      await expect(
        page
          .getByRole('tablist', { name: 'Data source' })
          .getByRole('tab', { name: 'SQL runner' })
          .locator('svg'),
      ).toHaveAttribute('data-icon', 'sql');
      await off.getByRole('button', { name: 'Turn on the SQL runner…' }).click();
      const dialog = page.getByRole('dialog', { name: `Turn on the SQL runner for ${SOURCE}?` });
      await expect(dialog.getByRole('button', { name: 'Turn on' })).toBeDisabled();
      await dialog.getByRole('checkbox', { name: /I confirm that sample can only read/ }).check();
      await dialog.getByRole('button', { name: 'Turn on' }).click();
      await expect(panel.getByTestId('sql-switch')).toContainText('SQL runner on · turned on by');
      // Its record, and the way to the runner, focused: no editor here (T823, AC-464).
      await expect(panel.locator('.sql-editor')).toHaveCount(0);
      await expect(panel.getByRole('link', { name: 'Open in SQL runner' })).toBeFocused();
    });

    test('lists the database’s schemas, tables and columns with their types beside the editor, and puts a name chosen there into it (T539, AC-386)', async ({
      browser,
    }) => {
      // In the workspace's left pane, since T823 (AC-464).
      const { context, page } = await inWorkspace(browser);
      const panel = page;
      try {
        await typeSql(page, 'SELECT * FROM ');
        const tree = page
          .getByRole('complementary', { name: 'Data source and schema' })
          .getByRole('tree', { name: `Schemas in ${SOURCE}` });
        const publicSchema = tree.getByRole('treeitem', { name: 'public', exact: true });
        await publicSchema.getByTestId('sql-schema-caret').first().click();
        // The sample's tables, and the one this spec made, as introspection lists them.
        await expect(tree.getByRole('group', { name: 'Tables in public' })).toContainText(TABLE);
        // By the keyboard, as a tree: down to `orders`, → opens its columns.
        const orders = tree.getByRole('treeitem', { name: 'orders', exact: true });
        await orders.focus();
        await page.keyboard.press('ArrowRight');
        await expect(
          tree.getByRole('group', { name: 'Columns of public.orders' }).getByRole('treeitem'),
        ).toHaveText([
          // With their keys' tags, as the workspace's tree shows them (T806, AC-448).
          'idintegerPK',
          'customer_idintegerFK',
          'product_idintegerFK',
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
        // Inserted whole, at the cursor: a keystroke typed one by one can be
        // dropped under load, as " LIMIT 1"'s space once was.
        await page.keyboard.insertText(' LIMIT 1');
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
      const { context, page, panel: tab } = await onTab(browser, copyId);
      const leftPane = page.getByRole('complementary', { name: 'Data source and schema' });
      try {
        await expect(tab.getByTestId('sql-yours')).toHaveText(
          'Yours: you may run SQL on your own data sources in My workspace, with no switch. Nobody else can.',
        );
        // Run in the workspace, on a tab its "Open in SQL runner" opens (T823, AC-464).
        await tab.getByRole('link', { name: 'Open in SQL runner' }).click();
        await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
        const panel = page;
        await typeSql(page, 'SELECT current_database() AS db');
        await panel.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(
          panel.getByRole('table', { name: 'Result' }).getByRole('cell').nth(1),
        ).toHaveText('sample');
        // Its schema browser lists its own catalog, read in its workspace's overlay (T539, T547).
        const tree = leftPane.getByRole('tree', { name: `Schemas in ${SOURCE}` });
        await tree
          .getByRole('treeitem', { name: 'public', exact: true })
          .getByTestId('sql-schema-caret')
          .first()
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
            .getByRole('tab', { name: 'SQL runner' })
            .click();
          const freshTab = page.getByRole('tabpanel', { name: 'SQL runner' });
          await expect(freshTab.getByTestId('sql-yours')).toBeVisible();
          await freshTab.getByRole('link', { name: 'Open in SQL runner' }).click();
          await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
          const freshPanel = page;
          await typeSql(page, 'SELECT 41 + 1 AS answer');
          await freshPanel.getByRole('button', { name: 'Run', exact: true }).click();
          await expect(
            freshPanel.getByRole('table', { name: 'Result' }).getByRole('cell').nth(1),
          ).toHaveText('42');
          // Its browser lists its own catalog, read in the workspace's overlay,
          // where alone it is: nothing landed bears its name (T547, AC-386).
          const freshTree = leftPane.getByRole('tree', { name: `Schemas in fresh_${RUN}` });
          await freshTree
            .getByRole('treeitem', { name: 'public', exact: true })
            .getByTestId('sql-schema-caret')
            .first()
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
      // The list head's ⋯, the item heads' 32 px icon button (T684; R76 components-Q1).
      const more = page.getByRole('button', { name: 'More actions for Data sources' });
      expect(
        await more.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return { width: Math.round(box.width), height: Math.round(box.height) };
        }),
      ).toEqual({ width: 32, height: 32 });
      await more.click();
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

        /**
         * T638 (AC-176; the re-audit), moved here from the data source page,
         * whose My runs went to the workspace (T823): a run's focus ring
         * whole in the list that clips, and the toast's Undo ring 3:1
         * against the toast's inverted ground, as the undo toast's is (T182).
         */
        const runs = panel.getByRole('region', { name: 'My runs' });
        const run = runs.locator('.sql-runs__run').first();
        await expect(run).toBeVisible();
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
        const undo = panel.locator('.sql-runner__toast').getByRole('button', { name: 'Undo' });
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
     * T650 (R64; xcube 636ffa04b2, research xcube-636ffa04b2.md): a join
     * Cube Store's router would run itself, which nothing could stop once it
     * started, not even Cube Store's timeout, is refused before it runs. The
     * page says so at once and why, Run isn't held, nothing is going, and the
     * next run runs.
     *
     * It replaces T548's and T549's case of a router query stopped at 30
     * seconds and run to its end (AC-378, AC-379): that query, a join of
     * `VALUES`, is the kind now refused, so the image runs no such query. A
     * stop's sayings and the held next run stay shown by `SqlResult.test.tsx`,
     * `SqlRunner.test.tsx` and `routes/sql-cube-store.test.ts`.
     */
    test('refuses a join Cube Store’s router would run, at once, saying why, and holds nothing (T650)', async ({
      page: admin,
      browser,
    }) => {
      test.setTimeout(120_000);
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
        await expect(panel.getByTestId('sql-result-head')).toHaveText(
          /^Not run at \d\d:\d\d:\d\d$/,
          { timeout: 15_000 },
        );
        // Refused before it ran: as fast as Cube Store explains it.
        expect(Date.now() - started).toBeLessThan(15_000);
        await expect(panel.getByTestId('sql-result-note')).toHaveText(
          'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout. Join Cube Store’s tables, whose joins its workers run, or read one catalog or system table without a join.',
        );

        // Nothing going, nothing held: Run is offered, and the next run runs.
        expect(await (await page.request.get('/api/sql-runs/going')).json()).toEqual({
          going: null,
        });
        await expect(panel.getByTestId('sql-going-elsewhere')).toHaveCount(0);
        await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
        const answered = await page.request.post('/api/cube-store/sql', {
          data: { sql: slow },
        });
        expect(answered.status(), await answered.text()).toBe(400);
        expect(await answered.json()).toEqual({
          outcome: 'refused',
          error:
            'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout.',
          reason:
            "Cube Store's router would run this query's join itself, and nothing stops that work once it starts, not even Cube Store's own timeout: join Cube Store's tables, whose joins run on its select workers, or read one catalog or system table without a join",
          statement: 'select',
          routerJoin: true,
        });
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
