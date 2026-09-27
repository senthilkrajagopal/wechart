import { execFileSync } from 'node:child_process';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T363 (AC-158, AC-159, AC-160, AC-325, AC-282, AC-163): `writer` adds a data
 * source in My workspace through the wizard, against compose's sample
 * database. A wrong password, a canary, fails xcube's test, and nothing is
 * made from it. The right one passes, and the source is made from that
 * test, which heads its history. The canary is in no request body to
 * wechart, no answer, and no stored row: it was sealed in the browser.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const CANARY = `canary-${RUN}-typed`;
const NAME = `e2e_${RUN}_wizard`;
const made = { folder: '', source: '' };

/**
 * Every row of the suite's metadata database, every table's, as its admin
 * dumps them (the container as items-switch.spec.ts reaches it).
 */
const everyRow = () =>
  execFileSync(
    'docker',
    ['exec', 'wechart-meta', 'pg_dump', '-U', 'wechart', '--data-only', 'wechart_security'],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );

test.describe.configure({ mode: 'serial' });

test.describe('a data source added in the workspace (T363)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    if (made.source !== '') {
      await signInThroughDex(page, 'writer');
      await context.request.delete(`/api/data-sources/${made.source}`);
      await context.clearCookies();
    }
    if (made.folder !== '') {
      await signInThroughDex(page, 'super');
      await context.request.delete(`/api/documents/folder/${made.folder}`);
    }
    await context.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes a folder writer writes in', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `New source target ${RUN}`, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const granted = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(granted.status()).toBe(200);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('tests it with Cube’s own driver, and makes it from the test that passed', async ({
      page,
    }) => {
      const bodies: string[] = [];
      page.on('request', (request) => {
        if (request.url().startsWith(`${BASE_URL}/api/`)) bodies.push(request.postData() ?? '');
      });
      const answers: string[] = [];
      page.on('response', async (response) => {
        if (response.url().startsWith(`${BASE_URL}/api/`))
          answers.push(await response.text().catch(() => ''));
      });

      await page.goto('/explore');
      const tree = page.getByRole('complementary', { name: 'Folders' }).getByRole('tree');
      await tree
        .getByRole('treeitem', { name: 'My workspace', exact: true })
        .getByRole('button')
        .first()
        .click();
      await page
        .getByTestId('explore-contents')
        .getByRole('button', { name: 'New', exact: true })
        .click();
      await page
        .getByRole('menu', { name: 'New' })
        .getByRole('menuitem', { name: 'Data source' })
        .click();

      const wizard = page.getByRole('dialog', { name: 'New data source' });
      // The eight drivers xcube takes (AC-160).
      await expect(wizard.getByRole('group', { name: 'Type' }).getByRole('button')).toHaveText([
        'PostgreSQL',
        'Amazon Redshift',
        'MySQL',
        'Snowflake',
        'BigQuery',
        'SQL Server',
        'Oracle',
        'Dremio',
      ]);
      await wizard.getByRole('button', { name: 'PostgreSQL' }).click();
      await wizard.getByRole('button', { name: 'Next' }).click();

      await wizard.getByLabel('Host').fill('sample-db');
      await expect(wizard.getByLabel('Port')).toHaveValue('5432');
      await wizard.getByLabel('Database').fill('sample');
      await wizard.getByRole('checkbox', { name: 'Use TLS' }).uncheck();
      await wizard.getByLabel('User', { exact: true }).fill('sample');
      await wizard.getByLabel('Password').fill(CANARY);
      await wizard.getByRole('button', { name: 'Next' }).click();

      // A wrong password: xcube's connect check fails, saying why (AC-159).
      await wizard.getByRole('button', { name: 'Run test' }).click();
      const checks = wizard.getByRole('list', { name: 'Checks' });
      await expect(checks.getByRole('listitem')).toHaveText([
        /^Passed: Open the secrets · \d+ ms$/,
        /^Passed: Build the connection’s configuration · \d+ ms$/,
        /^Failed: Connect · \d+ ms — .*password authentication failed/,
        'Skipped: Read the catalog',
      ]);
      await expect(wizard.getByRole('button', { name: 'Next' })).toBeDisabled();

      // The right one: every check passes.
      await wizard.getByRole('button', { name: 'Back' }).click();
      await wizard.getByLabel('Password').fill('sample');
      await wizard.getByRole('button', { name: 'Next' }).click();
      await wizard.getByRole('button', { name: 'Run test' }).click();
      await expect(checks.getByRole('listitem')).toHaveText([
        /^Passed: Open the secrets/,
        /^Passed: Build the connection’s configuration/,
        /^Passed: Connect/,
        /^Passed: Read the catalog/,
      ]);
      await wizard.getByRole('button', { name: 'Next' }).click();

      await wizard.getByRole('textbox', { name: 'Name' }).fill(NAME);
      await wizard.getByRole('combobox', { name: 'Target folder' }).selectOption(made.folder);
      const created = page.waitForResponse(
        (response) =>
          response.url() === `${BASE_URL}/api/data-sources` &&
          response.request().method() === 'POST',
      );
      await wizard.getByRole('button', { name: 'Create data source' }).click();
      const answer = await created;
      expect(answer.status(), await answer.text()).toBe(201);
      made.source = ((await answer.json()) as { id: string }).id;
      await expect(wizard).toHaveCount(0);

      // Listed in My workspace, as a data source (AC-269's listing half).
      await expect(
        page.getByTestId('explore-contents').getByRole('row').filter({ hasText: NAME }),
      ).toContainText('Data source');

      // Made from the test that passed, which heads its history; the wrong
      // password's test is in it too, as a trial (AC-163).
      const history = (await (
        await page.request.get(`/api/data-sources/${made.source}/tests`)
      ).json()) as { ok: boolean; asStored: boolean }[];
      expect(history.map(({ ok, asStored }) => [ok, asStored])).toEqual([
        [true, true],
        [false, false],
      ]);

      // The canary: sealed in the browser, and nowhere else (AC-325).
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) expect(body).not.toContain(CANARY);
      for (const text of answers) expect(text).not.toContain(CANARY);
      const rows = everyRow();
      expect(rows).toContain(NAME);
      expect(rows).not.toContain(CANARY);
    });
  });
});
