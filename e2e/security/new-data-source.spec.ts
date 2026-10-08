import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

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
/** A data source that has landed in the target, whose name a new one can't take (AC-422). */
const TAKEN = `e2e_${RUN}_landed`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const made = { folder: '', source: '', taken: '' };

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
      if (made.taken !== '')
        await context.request.delete(`/api/data-sources/${made.taken}`, { timeout: 90_000 });
      await context.request.delete(`/api/documents/folder/${made.folder}`);
    }
    await context.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes a folder writer writes in, holding a data source of its own', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `New source target ${RUN}`, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const granted = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(granted.status()).toBe(200);
      // A landed name, for the wizard's Name step (T731, AC-422).
      const landedSource = await page.request.post('/api/data-sources', {
        data: await testedSource(page.request, {
          folderId: made.folder,
          name: TAKEN,
          driver: 'postgres',
          authMethod: 'password',
          fields: FIELDS,
          sealed: {
            password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample'),
          },
        }),
        timeout: 90_000,
      });
      expect(landedSource.status(), await landedSource.text()).toBe(201);
      made.taken = ((await landedSource.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('tests it with Cube’s own driver, and makes it from the test that passed', async ({
      page,
    }) => {
      const bodies: string[] = [];
      // Every request the page makes, to show it asks wechart alone (T458, AC-327).
      const asked: string[] = [];
      page.on('request', (request) => {
        asked.push(request.url());
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

      // Docked beside the workspace's listing, which stays in view (T471, design 01).
      const wizard = page.getByRole('dialog', { name: 'New data source' });
      await expect(page.getByTestId('explore-contents')).toBeVisible();
      // The eight drivers xcube takes (AC-160), as tiles.
      await expect(
        wizard.getByRole('radiogroup', { name: 'Which database?' }).locator('.type-tile__name'),
      ).toHaveText([
        'PostgreSQL',
        'Amazon Redshift',
        'MySQL',
        'Snowflake',
        'BigQuery',
        'SQL Server',
        'Oracle',
        'Dremio',
      ]);
      // Each marked with its monogram: no vendor's terms allow its logo there
      // (T472, AC-338; docs/research/driver-logos.md).
      const marks = wizard
        .getByRole('radiogroup', { name: 'Which database?' })
        .locator('.driver-mark');
      await expect(marks).toHaveText(['Pg', 'Rs', 'My', 'Sf', 'BQ', 'SS', 'Or', 'Dr']);
      await expect(marks.locator('img, svg')).toHaveCount(0);
      await wizard.getByRole('radio', { name: 'PostgreSQL' }).click();
      await wizard.getByRole('button', { name: 'Next: Connection' }).click();

      // Next checks what is required before anything is tested.
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      await expect(wizard.getByRole('alert')).toHaveText(
        'Fill in Host, Database, User and Password to go on.',
      );
      await expect(wizard.getByLabel(/^Host/)).toBeFocused();

      await wizard.getByLabel(/^Host/).fill('sample-db');
      await expect(wizard.getByLabel(/^Port/)).toHaveValue('5432');
      await wizard.getByLabel(/^Database/).fill('sample');
      await wizard.getByRole('switch', { name: 'Use TLS' }).uncheck();
      await wizard.getByLabel(/^User/).fill('sample');
      await wizard.getByLabel(/^Password/).fill(CANARY);
      await wizard.getByRole('button', { name: 'Next: Test' }).click();

      // The four checks, listed before they run (AC-159).
      const checks = wizard.getByRole('list', { name: 'Checks' });
      await expect(checks.getByRole('listitem')).toHaveText([
        'Open the secretsNot run',
        'Build the connection’s configurationNot run',
        'ConnectNot run',
        'Read the catalogNot run',
      ]);
      // A wrong password: Cube's connect check fails, its words opened in place.
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      await expect(checks.getByRole('listitem')).toHaveText([
        /^Open the secrets\d+ ms$/,
        /^Build the connection’s configuration\d+ ms$/,
        /^Connect\d+ ms.*password authentication failed/s,
        'Read the catalogSkipped',
      ]);
      await expect(wizard.getByRole('button', { name: /^Next/ })).toHaveCount(0);

      // Straight to the sign-in; the right password; the change said.
      await checks.getByRole('button', { name: 'Change sign-in' }).click();
      await wizard.getByLabel(/^Password/).fill('sample');
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      await expect(wizard.getByRole('note').filter({ hasText: 'Settings changed' })).toHaveText(
        /You changed Password\. Test again to go on\./,
      );
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      await expect(checks.getByRole('listitem')).toHaveText([
        /^Open the secrets\d+ ms$/,
        /^Build the connection’s configuration\d+ ms$/,
        /^Connect\d+ ms$/,
        /^Read the catalog\d+ ms$/,
      ]);
      await wizard.getByRole('button', { name: 'Next: Name and target' }).click();

      // A name that has landed, in another case, is refused as in use, and
      // nothing more (T731; AC-422, AC-424, AC-282).
      const nameField = wizard.getByRole('textbox', { name: /^Name/ });
      await nameField.fill(TAKEN.toUpperCase());
      await wizard
        .getByRole('tree', { name: 'Target folder' })
        .getByRole('treeitem', { name: `New source target ${RUN}` })
        .click();
      await wizard.getByRole('button', { name: 'Create in My workspace' }).click();
      await expect(nameField).toHaveAttribute('aria-invalid', 'true');
      await expect(wizard.locator('.field__error')).toHaveText(
        `The name “${TAKEN.toUpperCase()}” is already in use.`,
      );
      await nameField.fill(NAME);
      const created = page.waitForResponse(
        (response) =>
          response.url() === `${BASE_URL}/api/data-sources` &&
          response.request().method() === 'POST',
      );
      await wizard.getByRole('button', { name: 'Create in My workspace' }).click();
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

      // Two connection tests and a data source made, and the browser asked
      // wechart alone: never Cube or xcube (T458, AC-327).
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.filter((url) => !url.startsWith(`${BASE_URL}/`))).toEqual([]);
      expect(asked.filter((url) => /:5400[01]\b|cubejs-api|\/v1\/semantic\//.test(url))).toEqual(
        [],
      );
    });

    /**
     * T471 (design 01's frame; design 02; AC-339, AC-340): from Data sources,
     * a 480 px pane docked at the right beside the list, the window's height,
     * its actions at the foot; Dremio Cloud's `http://` URL warned about;
     * BigQuery's key read for its account in the browser; and typed work
     * kept until the user says to discard it.
     */
    test('docks beside the list, warns of an unencrypted Dremio URL, reads a BigQuery key’s account, and asks before discarding', async ({
      page,
    }) => {
      const bodies: string[] = [];
      page.on('request', (request) => {
        if (request.url().startsWith(`${BASE_URL}/api/`)) bodies.push(request.postData() ?? '');
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/data-sources');
      await page.getByRole('button', { name: '+ Data source' }).click();
      const wizard = page.getByRole('dialog', { name: 'New data source' });
      await expect(wizard.getByText('in My workspace')).toBeVisible();

      // The frame: 480 px at the window's right edge, its foot at the bottom.
      const pane = await wizard.boundingBox();
      expect(Math.round(pane?.width ?? 0)).toBe(480);
      expect(Math.round((pane?.x ?? 0) + (pane?.width ?? 0))).toBe(1440);
      const foot = await wizard.locator('.source-pane__foot').boundingBox();
      expect(Math.round((foot?.y ?? 0) + (foot?.height ?? 0))).toBe(900);
      // The list stays in view beside it.
      await expect(page.getByRole('heading', { name: 'Data sources', level: 1 })).toBeInViewport();

      // Dremio Cloud first; an http:// URL is warned about (AC-339).
      await wizard.getByRole('radio', { name: 'Dremio' }).click();
      await wizard.getByRole('button', { name: 'Next: Connection' }).click();
      await expect(
        wizard.getByRole('radiogroup', { name: 'Which Dremio?' }).getByRole('radio', {
          name: /^Dremio Cloud/,
        }),
      ).toHaveAttribute('aria-checked', 'true');
      await wizard.getByLabel(/^Project URL/).fill('http://api.dremio.cloud/v0/projects/7f3c');
      await expect(wizard.getByText(/so the token would travel unencrypted/)).toBeVisible();
      await wizard.getByLabel(/^Project URL/).fill('https://api.dremio.cloud/v0/projects/7f3c');
      await expect(wizard.getByText(/so the token would travel unencrypted/)).toHaveCount(0);

      // BigQuery's key: its account read in the browser, nothing sent (AC-340).
      await wizard.getByRole('button', { name: 'Change type' }).click();
      await wizard.getByRole('radio', { name: 'BigQuery' }).click();
      await wizard.getByRole('button', { name: 'Next: Connection' }).click();
      await wizard.getByLabel(/^Key \(JSON\)/).fill(
        JSON.stringify({
          type: 'service_account',
          client_email: `cube-reader-${RUN}@acme-analytics.iam.gserviceaccount.com`,
          private_key: `-----BEGIN PRIVATE KEY-----\n${CANARY}\n-----END PRIVATE KEY-----\n`,
        }),
      );
      await expect(
        wizard.getByText(`Key for cube-reader-${RUN}@acme-analytics.iam.gserviceaccount.com`),
      ).toBeVisible();
      // Tested: the key, and the account read from it, go only sealed (AC-340).
      await wizard.getByLabel(/^Project ID/).fill(`acme-analytics-${RUN}`);
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      const tested = page.waitForRequest(
        (request) =>
          request.url() === `${BASE_URL}/api/data-sources/test` && request.method() === 'POST',
      );
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      const body = (await tested).postData() ?? '';
      expect(body).toContain(`acme-analytics-${RUN}`);
      expect(body).not.toContain(`cube-reader-${RUN}`);
      expect(body).not.toContain('PRIVATE KEY');
      expect(body).not.toContain(CANARY);

      // Typed work is asked about before it goes, the safe answer focused.
      await page.keyboard.press('Escape');
      const ask = wizard.getByRole('alertdialog', { name: 'Discard this data source?' });
      await expect(ask.getByRole('button', { name: 'Keep editing' })).toBeFocused();
      await ask.getByRole('button', { name: 'Keep editing' }).click();
      await expect(ask).toHaveCount(0);
      await expect(wizard.getByRole('list', { name: 'Checks' })).toBeVisible();
      await wizard.getByRole('button', { name: 'Close' }).click();
      await wizard
        .getByRole('alertdialog', { name: 'Discard this data source?' })
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(wizard).toHaveCount(0);
      // Focus back on what opened it.
      await expect(page.getByRole('button', { name: '+ Data source' })).toBeFocused();

      // Nothing of the key left the browser.
      for (const body of bodies) expect(body).not.toContain(CANARY);
    });

    /** T496: design 01 state K, the pane as a sheet at 390 px. */
    test('covers a 390 px window as a sheet, its rail in a line, closed with × and not Cancel', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/data-sources');
      await page.getByRole('button', { name: '+ Data source' }).click();
      const wizard = page.getByRole('dialog', { name: 'New data source' });
      const box = await wizard.boundingBox();
      expect([Math.round(box?.x ?? -1), Math.round(box?.width ?? 0)]).toEqual([0, 390]);
      // Its actions pinned at the window's foot, in view (state K).
      const bottom = await wizard.locator('.source-pane__foot').boundingBox();
      expect(Math.round((bottom?.y ?? 0) + (bottom?.height ?? 0))).toBe(844);
      await expect(wizard.locator('.source-pane__rail-short')).toContainText('Step 1 of 4');
      // The head's × closes it; the foot is Back and the primary only.
      const foot = wizard.locator('.source-pane__foot');
      await expect(foot.getByRole('button', { name: 'Cancel' })).toBeHidden();
      await expect(foot.locator('.btn-primary')).toBeVisible();
      // A step on, the head steps back too, before its title.
      await wizard.getByRole('radio', { name: /^PostgreSQL/ }).click();
      await foot.locator('.btn-primary').click();
      await expect(wizard.locator('.source-pane__rail-short')).toContainText('Step 2 of 4');
      await wizard.getByRole('button', { name: 'Previous step' }).click();
      await expect(wizard.locator('.source-pane__rail-short')).toContainText('Step 1 of 4');
      await wizard.getByRole('button', { name: 'Close' }).click();
      await expect(wizard).toHaveCount(0);
    });
  });
});
