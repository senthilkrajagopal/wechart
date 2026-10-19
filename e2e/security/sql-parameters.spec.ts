import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { Browser, Page } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T811 (AC-454): a run's `{{ name }}` values bound as database parameters
 * through xcube (bb188d8ada; research xcube-bb188d8ada.md), on the
 * development PostgreSQL, never written into the SQL; the audit event keeps
 * `{{name}}` and no value; History keeps the values for their owner alone.
 *
 * Fails when: a Text value of `x' OR '1'='1` returns rows the literal string
 * wouldn't; a `{{name}}` standing for a table name is filled in rather than
 * failing at the database; the audit event holds a value; or another user, a
 * Super-Admin included, can see a run's values.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const world = { folderId: '', source: '' };
const SOURCE = `sqlparams_${RUN}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const INJECTION = "x' OR '1'='1";

test.describe.configure({ mode: 'default' });

async function signedIn(browser: Browser, role: 'super' | 'writer') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signInThroughDex(page, role);
  return { context, page };
}

/** A folder read-write for `sales-rw` (writer), with one source on the sample database, its runner on. */
test.beforeAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    const request = admin.page.request;
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `SQL parameters ${RUN}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    world.folderId = ((await made.json()) as { id: string }).id;
    const access = await request.put(`/api/folders/${world.folderId}/access`, {
      data: { readOnly: [], readWrite: ['sales-rw'] },
    });
    expect(access.status()).toBe(200);
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
    world.source = ((await source.json()) as { id: string }).id;
    const on = await request.put(`/api/data-sources/${world.source}/sql-runner`, {
      data: { on: true, readOnlyConfirmed: true },
    });
    expect(on.status(), await on.text()).toBe(200);
  } finally {
    await admin.context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    if (world.source !== '') await admin.page.request.delete(`/api/data-sources/${world.source}`);
    if (world.folderId !== '')
      await admin.page.request.delete(`/api/documents/folder/${world.folderId}`);
  } finally {
    await admin.context.close();
  }
});

const workspace = (page: Page) => page.getByRole('region', { name: 'SQL runner' });
const editor = (page: Page) => page.locator('.sql-editor .cm-content');
const head = (page: Page) => page.getByTestId('sql-result-head');

/** The tab's SQL replaced by `sql`. */
async function write(page: Page, sql: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(sql);
}

test.describe('bound parameter values (T811, AC-454)', () => {
  test('a Text value is data, never SQL; a {{name}} for a table fails at the database; the audit keeps {{name}}; History keeps the values for their owner alone', async ({
    browser,
  }) => {
    // A second's margin for the clocks of this machine and wechart's server.
    const began = new Date(Date.now() - 1_000).toISOString();
    const { context, page } = await signedIn(browser, 'writer');
    const sent: unknown[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/data-sources/${world.source}/sql`)
        sent.push(request.postDataJSON());
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await page
        .getByRole('complementary', { name: 'Data source and schema' })
        .getByRole('button', { name: /^Data source (?!and)/ })
        .click();
      await page
        .getByRole('listbox', { name: 'Data sources' })
        .getByRole('option', { name: new RegExp(SOURCE) })
        .click();
      await expect(page.getByTestId('sql-warning')).toBeVisible();
      const run = workspace(page).getByRole('button', { name: 'Run', exact: true });
      const strip = workspace(page).getByRole('group', { name: 'Parameters' });

      // A real value binds: one customer in France.
      await write(page, 'SELECT * FROM customers WHERE country = {{c}}');
      await strip.getByRole('textbox', { name: 'c, value' }).fill('France');
      await run.click();
      await expect(head(page)).toHaveText(/^Finished 1 row\b/);

      // The injection string is compared as the literal it is: no customer has it.
      await strip.getByRole('textbox', { name: 'c, value' }).fill(INJECTION);
      await run.click();
      await expect(head(page)).toHaveText(/^Finished no rows\b/);
      // Written into the SQL, it would have matched every customer.
      expect(sent.at(-1)).toEqual({
        sql: 'SELECT * FROM customers WHERE country = {{c}}',
        parameters: [{ name: 'c', type: 'text', value: INJECTION }],
      });

      // A {{name}} where a table name goes isn't filled in: the database refuses it.
      await write(page, 'SELECT * FROM {{t}}');
      await strip.getByRole('textbox', { name: 't, value' }).fill('customers');
      await run.click();
      await expect(head(page)).toHaveText(/^Database error\b/);

      // History: the run's values, to their owner.
      const mine = (await (await page.request.get(`/api/sql-runs?dataSource=${world.source}`)).json()) as {
        runs: { sql: string; parameters: unknown }[];
      };
      expect(mine.runs.find((each) => each.sql === 'SELECT * FROM customers WHERE country = {{c}}')).toMatchObject({
        parameters: [{ name: 'c', type: 'text', value: INJECTION }],
      });
    } finally {
      await context.close();
    }

    const admin = await signedIn(browser, 'super');
    try {
      // Nobody else sees them, a Super-Admin included.
      const theirs = await admin.page.request.get(`/api/sql-runs?dataSource=${world.source}`);
      expect(theirs.status()).toBe(200);
      expect(await theirs.text()).not.toContain(INJECTION);

      // The audit events: `{{c}}` and `{{t}}`, never a value.
      const trail = await admin.page.request.get(
        `/api/audit?events=sql-run&folder=${world.folderId}&limit=10&since=${encodeURIComponent(began)}`,
      );
      expect(trail.status(), await trail.text()).toBe(200);
      const events = ((await trail.json()) as { records: { details: { sql: string | null; outcome: string } }[] })
        .records;
      expect(events.map((each) => [each.details.outcome, each.details.sql])).toEqual([
        ['failed', 'SELECT * FROM {{t}}'],
        ['finished', 'SELECT * FROM customers WHERE country = {{c}}'],
        ['finished', 'SELECT * FROM customers WHERE country = {{c}}'],
      ]);
      const text = JSON.stringify(events);
      expect(text).not.toContain(INJECTION);
      expect(text).not.toContain('France');
    } finally {
      await admin.context.close();
    }
  });
});

/**
 * AC-482, as narrowed on 2026-10-18 (R85), on Dremio: its driver writes
 * values into the SQL text (research/sql-parameter-binding.md), so a tab
 * on a Dremio source holding a `{{ name }}` holds Run, button and
 * ⌘/Ctrl+Enter, saying why, and the API refuses such a run before xcube is
 * asked, writing no value anywhere.
 *
 * No Dremio runs in compose, and a data source is made only from a passing
 * test of it (AC-158): its test is run against a host where nothing listens
 * and marked passed in the suite's database, as data-sources.spec.ts does
 * (T506). A run that reached xcube would therefore fail at the connection,
 * not be refused.
 */
const DREMIO = `lake_${RUN}`;
const DREMIO_FIELDS = { host: '127.0.0.1', port: 9047, ssl: false, database: 'e2e' };
/** A value that, written into the SQL anywhere, would show. */
const MARKER = `zz-${RUN}-value`;

function markPassed(testId: string) {
  expect(testId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const said = execFileSync(
    'docker',
    [
      'exec',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_security',
      '-Atc',
      `UPDATE connection_tests SET ok = true WHERE id = '${testId}' AND data_source_id IS NULL`,
    ],
    { encoding: 'utf8' },
  );
  expect(said.trim()).toBe('UPDATE 1');
}

test.describe('parameters on Dremio (T810, AC-482)', () => {
  test('a tab on Dremio holding a {{name}} holds Run, saying why; the API refuses it before xcube, writing no value', async ({
    browser,
  }) => {
    const admin = await signedIn(browser, 'super');
    let lake = '';
    try {
      const request = admin.page.request;
      const settings = {
        folderId: world.folderId,
        driver: 'dremio',
        authMethod: 'token',
        fields: DREMIO_FIELDS,
        sealed: {
          token: await sealSecretV1(KEY, 'dremio', 'token', DREMIO_FIELDS, 'e2e-fixture-token'),
        },
      };
      const trial = await request.post('/api/data-sources/test', {
        data: settings,
        timeout: 90_000,
      });
      expect(trial.status(), await trial.text()).toBe(200);
      const { testId } = (await trial.json()) as { testId: string };
      markPassed(testId);
      const made = await request.post('/api/data-sources', {
        data: { ...settings, name: DREMIO, testId },
      });
      expect(made.status(), await made.text()).toBe(201);
      lake = ((await made.json()) as { id: string }).id;
      const on = await request.put(`/api/data-sources/${lake}/sql-runner`, {
        data: { on: true, readOnlyConfirmed: true },
      });
      expect(on.status(), await on.text()).toBe(200);

      const { context, page } = await signedIn(browser, 'writer');
      const sent: string[] = [];
      page.on('request', (each) => {
        if (each.method() === 'POST' && new URL(each.url()).pathname === `/api/data-sources/${lake}/sql`)
          sent.push(each.postData() ?? '');
      });
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/sql');
        await page
          .getByRole('complementary', { name: 'Data source and schema' })
          .getByRole('button', { name: /^Data source (?!and)/ })
          .click();
        await page
          .getByRole('listbox', { name: 'Data sources' })
          .getByRole('option', { name: new RegExp(DREMIO) })
          .click();
        await expect(page.getByTestId('sql-warning')).toBeVisible();
        const run = workspace(page).getByRole('button', { name: 'Run', exact: true });

        await write(page, 'SELECT * FROM orders WHERE status = {{status}}');
        await expect(page.getByTestId('sql-params-held')).toHaveText(
          'Parameters aren’t available on Dremio. Write the value into the SQL to run it here.',
        );
        await expect(run).toBeDisabled();
        // No strip to give a value in.
        await expect(workspace(page).getByRole('group', { name: 'Parameters' })).toHaveCount(0);
        await editor(page).click();
        await page.keyboard.press('ControlOrMeta+Enter');
        // No run: no result head, and no request sent.
        await expect(head(page)).toHaveCount(0);
        expect(sent).toEqual([]);

        // The API, asked directly, with a value and without: refused before xcube.
        for (const data of [
          { sql: 'SELECT * FROM orders WHERE status = {{status}}' },
          {
            sql: 'SELECT * FROM orders WHERE status = {{status}}',
            parameters: [{ name: 'status', type: 'text', value: MARKER }],
          },
        ]) {
          const answer = await page.request.post(`/api/data-sources/${lake}/sql`, { data });
          expect(answer.status(), JSON.stringify(data)).toBe(400);
          expect(await answer.json()).toEqual({
            outcome: 'refused',
            error:
              'Parameters aren’t available on Dremio. Write the value into the SQL to run it here.',
          });
        }
        // Nothing ran, so nothing kept: no run, and no value, in History.
        const history = await page.request.get(`/api/sql-runs?dataSource=${lake}`);
        expect(history.status()).toBe(200);
        expect(((await history.json()) as { runs: unknown[] }).runs).toEqual([]);
      } finally {
        await context.close();
      }
    } finally {
      if (lake !== '') await admin.page.request.delete(`/api/data-sources/${lake}`);
      await admin.context.close();
    }
  });
});
