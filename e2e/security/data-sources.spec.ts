import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { landed } from '../model-files';
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
 * T364 (AC-157, AC-233): Data sources lists every data source the user may
 * see, in every folder — its folder's path, opening the folder in Explore,
 * its driver, and its health from its last connection test — and none they
 * may not; its title and a note saying what it is for, never that managing
 * them waits for a later phase.
 *
 * A folder read-write for `sales-rw` (writer) and read-only for `sales-ro`
 * (reader), under a parent of its own, made by `super`: one data source in
 * each, and one in a folder only `managers` reach. The one in the folder is
 * tested against compose's sample database (its development login).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const made = {
  parent: '',
  folder: '',
  hidden: '',
  sources: [] as string[],
  cubes: [] as { folderId: string; name: string }[],
};

/** A cube naming its data source by its short name, published into a folder (T459). */
async function cube(
  request: APIRequestContext,
  folderId: string,
  name: string,
  source: string,
  title?: string,
) {
  const content = [
    'cubes:',
    `  - name: ${name}`,
    ...(title === undefined ? [] : [`    title: ${title}`]),
    '    sql: SELECT 1 AS n',
    `    data_source: ${source}`,
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');
  if (!made.cubes.some((each) => each.folderId === folderId && each.name === name))
    made.cubes.push({ folderId, name });
  // Through My workspace and a proposal its author approves (T451, AC-278).
  const file = { path: `cubes/${name}.yml`, content };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

async function folder(request: APIRequestContext, title: string, parent: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(answer.status()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

async function dataSource(request: APIRequestContext, folderId: string, name: string) {
  const answer = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
    }),
  });
  expect(answer.status(), await answer.text()).toBe(201);
  const id = ((await answer.json()) as { id: string }).id;
  made.sources.push(id);
  return id;
}

/**
 * The suite's own database, as `prepare-stack.mjs` reaches it in compose's
 * metadata Postgres, and as `playwright.security.config.ts` names it in
 * `WECHART_DB_URL`.
 */
const SUITE_DATABASE = 'wechart_security';

/**
 * Marks a trial connection test passed, for a fixture of a kind no database
 * in compose can pass (T506): the test is run and kept by the API as any
 * other, and only its outcome is changed. The data source is then made
 * through the API from it, as from any passing test.
 */
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
      SUITE_DATABASE,
      '-Atc',
      `UPDATE connection_tests SET ok = true WHERE id = '${testId}' AND data_source_id IS NULL`,
    ],
    { encoding: 'utf8' },
  );
  expect(said.trim()).toBe('UPDATE 1');
}

test.describe.configure({ mode: 'serial' });

test.describe('Data sources, as each role sees them (T364, AC-157, AC-233)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    // The cubes first: xcube keeps a data source a published cube is bound to.
    for (const { folderId, name } of made.cubes)
      await context.request.delete(
        `/api/model/files?folder=${folderId}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
      );
    for (const id of made.sources) await context.request.delete(`/api/data-sources/${id}`);
    for (const id of [made.folder, made.parent, made.hidden].filter((each) => each !== ''))
      await context.request.delete(`/api/documents/folder/${id}`);
    await context.close();
  });

  test.describe('as super, who makes them', () => {
    test.use({ role: 'super' });

    test('sets up a folder of sales’, its parent, and one only managers reach, each with a data source', async ({
      page,
    }) => {
      const request = page.request;
      made.parent = await folder(request, `Sources parent ${RUN}`, 'root');
      made.folder = await folder(request, `Sources ${RUN}`, made.parent);
      made.hidden = await folder(request, `Sources hidden ${RUN}`, 'root');
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await request.put(`/api/folders/${made.hidden}/access`, {
            data: { readOnly: null, readWrite: ['managers'] },
          })
        ).status(),
      ).toBe(200);
      const tested = await dataSource(request, made.folder, `sales_${RUN}`);
      await dataSource(request, made.parent, `parent_${RUN}`);
      await dataSource(request, made.hidden, `hidden_${RUN}`);
      expect(
        (
          await request.post(`/api/data-sources/${tested}/test`, { data: {}, timeout: 90_000 })
        ).status(),
      ).toBe(200);
    });
  });

  test.describe('as writer, a read-write member of the folder', () => {
    test.use({ role: 'writer' });

    test('sees theirs and their ancestors’, each with its folder, driver and health, and none of managers’', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Data sources');
      await expect(main.getByRole('note').first()).toContainText(
        'Every data source you can see, in every folder',
      );
      await expect(main).not.toContainText(/not part of this phase/i);

      const table = main.getByRole('table', { name: 'Data sources' });
      const row = table.getByRole('row').filter({ hasText: `sales_${RUN}` });
      await expect(row.getByRole('cell').nth(2)).toHaveText('PostgreSQL');
      const path = row.getByRole('cell').nth(1).getByRole('link');
      await expect(path).toHaveText(`Sources parent ${RUN} / Sources ${RUN}`);
      await expect(path).toHaveAttribute('href', `/explore?folder=${made.folder}`);
      const health = row.getByTestId('source-health');
      await expect(health).toHaveAttribute('data-state', 'ok');
      await expect(health).toContainText('Passed');
      // Its parent's, view-only, and never managers'.
      await expect(table.getByRole('row').filter({ hasText: `parent_${RUN}` })).toHaveCount(1);
      await expect(table.getByRole('row').filter({ hasText: `hidden_${RUN}` })).toHaveCount(0);
      // Made from its passing test, which is its health from the start (T363, AC-163).
      const parent = table.getByRole('row').filter({ hasText: `parent_${RUN}` });
      await expect(parent.getByTestId('source-health')).toHaveAttribute('data-state', 'ok');
      await expect(parent.getByTestId('source-health')).toHaveText(/^Passed · /);

      // As design 01 draws it (T496): names bold in the code face, the day it
      // changed, Used by at the right, and 28 px pills whose value is bold.
      expect(
        await row
          .getByRole('cell')
          .first()
          .evaluate((cell) => {
            const style = getComputedStyle(cell);
            return [style.fontFamily.split(',')[0]?.replace(/"/g, ''), style.fontWeight];
          }),
      ).toEqual(['IBM Plex Mono', '600']);
      // Day first (T477, Q6): "19 Sep", "30 Dec 2025".
      await expect(row.getByRole('cell').nth(5)).toHaveText(/^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/);
      expect(
        await row
          .getByTestId('source-used-by')
          .evaluate((cell) => getComputedStyle(cell).textAlign),
      ).toBe('right');
      const pill = main.locator('.select-pill').first();
      expect(Math.round((await pill.boundingBox())?.height ?? 0)).toBe(28);
      expect(
        await pill.locator('select').evaluate((select) => {
          const style = getComputedStyle(select);
          return [style.fontSize, style.fontWeight];
        }),
      ).toEqual(['12px', '600']);
      expect(
        Math.round(
          (await main.getByRole('searchbox', { name: 'Search data sources' }).boundingBox())
            ?.height ?? 0,
        ),
      ).toBe(28);

      // The search with its icon, and the table's links in the accent with no
      // underline, as design 01 draws them (T698, SRC-17).
      await expect(main.locator('.sources-filters__find > svg')).toHaveAttribute(
        'data-icon',
        'search',
      );
      const accent = await page.evaluate(() => {
        const probe = document.createElement('a');
        probe.style.color = 'var(--wc-accent)';
        document.body.append(probe);
        const said = getComputedStyle(probe).color;
        probe.remove();
        return said;
      });
      await expect(path).toHaveCSS('text-decoration-line', 'none');
      await expect(path).toHaveCSS('color', accent);
      // The page's note at 12/16 (T698, SRC-18).
      await expect(main.getByRole('note').first()).toHaveCSS('font-size', '12px');
      await expect(main.getByRole('note').first()).toHaveCSS('line-height', '16px');

      // A folder's filter narrows it to that folder's.
      await main
        .getByLabel('Folder')
        .selectOption({ label: `Sources parent ${RUN} / Sources ${RUN}` });
      await expect(table.getByRole('row')).toHaveCount(2);
    });
  });

  test.describe('as reader, read-only on the folder', () => {
    test.use({ role: 'reader' });

    test('sees none, and is pointed to Explore', async ({ page }) => {
      await page.goto('/data-sources');
      const main = page.getByRole('main');
      await expect(main.getByRole('table')).toHaveCount(0);
      await expect(main.getByRole('note').nth(1)).toHaveText(
        'Data sources are available to read-write members of a folder. Your dashboards are in Explore.',
      );
      await expect(main.getByRole('link', { name: 'Open Explore' })).toHaveAttribute(
        'href',
        '/explore',
      );
    });
  });

  /**
   * T462 (AC-269, AC-161, AC-163; design 03 of 2026-09-27): a stored data
   * source opens in its settings under its folder's breadcrumb, from Data
   * sources and from Explore. In a shared folder it is read-only, changed
   * through a copy in the user's workspace (rule 71): state A. The copy is
   * headed with where it came from and is to go, and Discard my copy
   * removes it after asking.
   */
  test.describe('as writer, opening one', () => {
    test.use({ role: 'writer' });

    test('heads it with History, Generate cubes…, then Edit in my workspace, all 32/14, and ⋯ a 32 px icon button (T684)', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      // Design 15:424, "Generate cubes…" per R57 (SRC-04, CMP-02, EXP-23).
      const head = page.locator('.source-settings__head');
      await expect(head.getByRole('button')).toHaveText([
        'History',
        'Generate cubes…',
        'Edit in my workspace',
        '⋯',
      ]);
      for (const name of ['History', 'Generate cubes…', 'Edit in my workspace']) {
        const drawn = await head.getByRole('button', { name, exact: true }).evaluate((node) => ({
          height: Math.round(node.getBoundingClientRect().height),
          font: getComputedStyle(node).fontSize,
        }));
        expect(drawn, name).toEqual({ height: 32, font: '14px' });
      }
      // History with its clock, Edit in my workspace with its pencil (15:424).
      await expect(head.getByRole('button', { name: 'History' }).locator('svg')).toHaveCount(1);
      await expect(
        head.getByRole('button', { name: 'Edit in my workspace' }).locator('svg'),
      ).toHaveCount(1);
      const more = head.getByRole('button', { name: `More actions for sales_${RUN}` });
      expect(
        await more.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return { width: Math.round(box.width), height: Math.round(box.height) };
        }),
      ).toEqual({ width: 32, height: 32 });

      // Its History docked at the window's right, full height, listing its
      // current version, kept or not (T695, SRC-22; design 06, state D).
      await head.getByRole('button', { name: 'History' }).click();
      const panel = page.getByRole('complementary', { name: 'History' });
      await expect(panel.getByTestId('version-head').first()).toHaveText(/Current$/);
      const box = (await panel.boundingBox())!;
      const bar = (await page.locator('.app-bar').boundingBox())!;
      const viewport = page.viewportSize()!;
      expect([
        Math.round(box.width),
        Math.round(box.x + box.width),
        Math.round(box.y),
        Math.round(box.y + box.height),
      ]).toEqual([360, viewport.width, Math.round(bar.y + bar.height), viewport.height]);
    });

    test('draws its page as design 03 state A does: one white head band, the tabs across its foot, its mark and badges, and Cube’s use on one line (T698)', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`sales_${RUN}`);
      const token = (name: string) =>
        page.evaluate((variable) => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = `var(${variable})`;
          document.body.append(probe);
          const said = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return said;
        }, name);
      const [surface, subtle] = [await token('--wc-bg-surface'), await token('--wc-bg-subtle')];

      // The crumbs, the head, its two lines and the tabs in one white band
      // across the page, the tabs edge to edge at its foot (03:126, 200; SRC-07).
      const band = main.locator('.source-settings__pagehead');
      await expect(band).toHaveCSS('background-color', surface);
      const tabs = band.getByRole('tablist', { name: 'Data source' });
      const [bandBox, tabsBox, mainBox] = await Promise.all([
        band.boundingBox(),
        tabs.boundingBox(),
        main.boundingBox(),
      ]);
      expect([bandBox?.x, bandBox?.width]).toEqual([mainBox?.x, mainBox?.width]);
      expect([tabsBox?.x, tabsBox?.width]).toEqual([bandBox?.x, bandBox?.width]);
      expect(Math.round((tabsBox?.y ?? 0) + (tabsBox?.height ?? 0))).toBe(
        Math.round((bandBox?.y ?? 0) + (bandBox?.height ?? 0)),
      );
      // The panel on white under it, not on a card of its own.
      const panel = main.getByRole('tabpanel', { name: 'Connection' });
      await expect(panel).toHaveCSS('background-color', surface);
      await expect(panel).toHaveCSS('border-top-width', '0px');

      // The item's mark, "◍" at 28 px (data-sources-Q6).
      const mark = band.locator('.source-settings__mark');
      await expect(mark).toHaveText('◍');
      expect(await mark.evaluate((node) => [node.clientWidth, node.clientHeight])).toEqual([
        28, 28,
      ]);
      // The driver an outlined badge at 12/400; the access a 22 px badge on
      // bg-subtle with no border, with its eye (03:95–97, 290; SRC-06).
      const driver = band.locator('.source-settings__driver');
      await expect(driver).toHaveCSS('font-size', '12px');
      await expect(driver).toHaveCSS('font-weight', '400');
      await expect(driver).toHaveCSS('border-top-width', '1px');
      await expect(driver).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const access = band.locator('.source-settings__access');
      await expect(access).toHaveCSS('background-color', subtle);
      await expect(access).toHaveCSS('border-top-width', '0px');
      await expect(access).toHaveCSS('font-weight', '400');
      expect(Math.round((await access.boundingBox())?.height ?? 0)).toBe(22);
      await expect(access.locator('svg')).toHaveAttribute('data-icon', 'eye');
      // State A's meta on two lines: its access and version, then its health.
      const lines = band.locator('.source-settings__line');
      await expect(lines).toHaveCount(2);
      await expect(lines.nth(0)).toContainText(/Version \d+/);
      await expect(lines.nth(1).getByTestId('source-health')).toBeVisible();

      // In Cube says its state, its version and its instances on one line (03:399; SRC-19).
      await tabs.getByRole('tab', { name: 'In Cube' }).click();
      const state = main.getByRole('tabpanel', { name: 'In Cube' }).getByTestId('cube-state');
      await expect(state).toBeVisible();
      await expect(main.locator('.cube-state__heard')).toHaveCount(0);
      expect(Math.round((await state.boundingBox())?.height ?? 0)).toBeLessThanOrEqual(20);

      // A note at 12/16, its bold at 600 (T698, SRC-18, data-sources-Q4).
      await tabs.getByRole('tab', { name: 'Usage' }).click();
      const note = main.getByRole('tabpanel', { name: 'Usage' }).getByRole('note');
      await expect(note).toHaveCSS('font-size', '12px');
      await expect(note).toHaveCSS('line-height', '16px');
      expect(
        await note.evaluate((node) => {
          const bold = document.createElement('b');
          node.append(bold);
          const weight = getComputedStyle(bold).fontWeight;
          bold.remove();
          return weight;
        }),
      ).toBe('600');
    });

    test('opens its settings from Data sources and Explore: read-only in its folder, with its tests and Cube’s use', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      const list = page.getByRole('main').getByRole('table', { name: 'Data sources' });
      await list.getByRole('link', { name: `sales_${RUN}`, exact: true }).click();
      await expect(page).toHaveURL(/\/explore\/data-sources\/[^/?]+$/);
      const main = page.getByRole('main');
      await expect(
        main.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link'),
      ).toHaveText(['Explore', 'Shared', `Sources parent ${RUN}`, `Sources ${RUN}`]);
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`sales_${RUN}`);
      await expect(main.locator('.source-settings__driver')).toHaveText('PostgreSQL');
      await expect(main.locator('.source-settings__access')).toHaveText(
        `Read-only · in Sources parent ${RUN} / Sources ${RUN}`,
      );
      await expect(main.getByRole('button', { name: 'Edit in my workspace' })).toBeVisible();
      // What it is the health of, said on its own page (pin 4).
      await expect(main.getByTestId('source-health')).toHaveText(/^Last test passed · /);

      // Its connection as a definition list: no field to type in, the secret said stored.
      const tabs = main.getByRole('tablist', { name: 'Data source' });
      // "SQL runner" is the sixth, for its folder's read-write members (T535;
      // design 15, P1), renamed from "SQL" by T823 (AC-464; design 17, N).
      await expect(tabs.getByRole('tab')).toHaveText([
        'General',
        'Connection',
        'Test history',
        'Usage',
        'In Cube',
        'SQL runner',
      ]);
      await expect(tabs.getByRole('tab', { name: 'Connection' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const connection = main.getByRole('tabpanel', { name: 'Connection' });
      await expect(connection.getByRole('textbox')).toHaveCount(0);
      await expect(connection.locator('dt')).toHaveText([
        'Type',
        'Host and port',
        'Database',
        'Signs in with',
        'Password',
        'TLS',
      ]);
      await expect(connection.locator('dd')).toHaveText([
        'PostgreSQL',
        'sample-db:5432',
        'sample',
        'Password, as sample',
        'Stored · encrypted',
        'Off',
      ]);

      // Its tests, newest first: the super's, then the one it was made from (AC-163).
      await tabs.getByRole('tab', { name: 'Test history' }).click();
      const history = main.getByRole('tabpanel', { name: 'Test history' }).getByRole('table');
      await expect(history.getByRole('row')).toHaveCount(3);
      await expect(history.getByRole('row').nth(1)).toContainText('Passed');
      await expect(history.getByRole('row').nth(1)).toContainText('Stored settings');
      // Cube's use of it, as xcube's reports tell it (AC-161).
      await tabs.getByRole('tab', { name: 'In Cube' }).click();
      await expect(
        main.getByRole('tabpanel', { name: 'In Cube' }).getByTestId('cube-state'),
      ).toBeVisible();
      await tabs.getByRole('tab', { name: 'Usage' }).click();
      await expect(main.getByRole('tabpanel', { name: 'Usage' })).toContainText(
        'No published cube uses it.',
      );

      // Its row in Explore opens the same page (UX-222).
      await page.goto(`/explore?folder=${made.folder}`);
      await page
        .getByTestId('explore-contents')
        .getByRole('button', { name: `sales_${RUN}`, exact: true })
        .click();
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`sales_${RUN}`);
    });

    test('opens its parent’s view only, with no way to change it', async ({ page }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `parent_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`parent_${RUN}`);
      await expect(main.locator('.source-settings__access')).toHaveText(
        `Read-only · in Sources parent ${RUN}`,
      );
      await expect(main.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
    });

    test('copies it into My workspace, headed with where it came from, and discards the copy after asking', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      const original = page.url();
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(page).not.toHaveURL(original);
      // In a project folder of its own, which its breadcrumb names (T523; design 14, G4).
      await expect(
        main.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link'),
      ).toHaveText(['Explore', 'My workspace', /^project-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?$/]);
      const project = await projectFolderOf(
        page.request,
        'data-source',
        decodeURIComponent(page.url().split('/').pop() ?? ''),
      );
      await expect(main.locator('.source-settings__status')).toHaveText('Draft');
      await expect(main.locator('.source-settings__origin')).toHaveText(
        `Copied from Sources parent ${RUN} / Sources ${RUN} › sales_${RUN} · version 1`,
      );
      await expect(main.locator('.source-settings__target')).toHaveText(
        `Target: Sources parent ${RUN} / Sources ${RUN}`,
      );
      // Kept for the suite's clean-up, should this test stop short of discarding it.
      made.sources.push(decodeURIComponent(page.url().split('/').pop() ?? ''));
      // Asked first; Escape keeps it, and puts focus back on what asked (T462's review).
      const discard = main.getByRole('button', { name: 'Discard my copy…' });
      await discard.click();
      const question = page.getByRole('alertdialog', { name: 'Discard your copy?' });
      await expect(question.getByRole('button', { name: 'Keep it' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(question).toHaveCount(0);
      await expect(discard).toBeFocused();
      await discard.click();
      await question.getByRole('button', { name: 'Discard' }).click();
      await expect(page).toHaveURL(/\/explore\?folder=/);
      await removeProjectFolder(page.request, project);
      await page.goto('/data-sources');
      await expect(
        page
          .getByRole('main')
          .getByRole('table', { name: 'Data sources' })
          .getByRole('link', { name: `sales_${RUN}`, exact: true }),
      ).toHaveCount(1);
    });
  });

  /**
   * T698 (AC-284, AC-343; design 03, pin 3 and state A; SRC-02, SRC-03): a
   * copy proposes itself from its head, waiting while a change is unsaved;
   * once approved, its original's version line says who approved it.
   */
  test.describe('as writer, proposing a copy', () => {
    test.use({ role: 'writer' });

    test('proposes its copy from its head once saved, and its original then says who approved its version', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`sales_${RUN}`);
      const original = page.url();
      const before = Number(
        /^Version (\d+)/.exec(
          (await main.locator('.source-settings__version').textContent()) ?? '',
        )?.[1],
      );
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(main.locator('.source-settings__status')).toHaveText('Draft');
      const copyId = decodeURIComponent(page.url().split('/').pop() ?? '');
      made.sources.push(copyId);
      const project = await projectFolderOf(page.request, 'data-source', copyId);

      // Its head's primary, last (pin 3).
      const target = `Sources parent ${RUN} / Sources ${RUN}`;
      const head = main.locator('.source-settings__head');
      await expect(head.getByRole('button')).toHaveText([
        'Discard my copy…',
        `Propose to ${target}…`,
      ]);
      const propose = head.getByRole('button', { name: `Propose to ${target}…` });
      expect(
        await propose.evaluate((node) => ({
          height: Math.round(node.getBoundingClientRect().height),
          font: getComputedStyle(node).fontSize,
          weight: getComputedStyle(node).fontWeight,
        })),
      ).toEqual({ height: 32, font: '14px', weight: '600' });

      // A change unsaved: it waits, saying why, and opens nothing.
      const tabs = main.getByRole('tablist', { name: 'Data source' });
      await tabs.getByRole('tab', { name: 'General' }).click();
      await main.getByLabel('Description').fill('For the review.');
      await expect(propose).toHaveAttribute('aria-disabled', 'true');
      await expect(propose).toHaveAttribute('title', 'Save or discard your changes first.');
      await expect(propose).toHaveAccessibleDescription('Save or discard your changes first.');
      // Pressed anyway (Playwright waits on aria-disabled, as a person can't).
      await propose.click({ force: true });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await main.getByRole('button', { name: 'Discard changes' }).click();
      await expect(propose).not.toHaveAttribute('aria-disabled', 'true');

      // Proposed, then approved by the writer, who decides in its folder.
      await propose.click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const proposal = (await (
        await page.request.get(`/api/proposals?kind=data-source&itemId=${copyId}`)
      ).json()) as { id: string };
      const approved = await page.request.post(`/api/proposals/${proposal.id}/approve`, {
        data: {},
      });
      expect(approved.status(), await approved.text()).toBe(200);

      // Its original's line: the version, approved by whom and when (03:290).
      const me = ((await (await page.request.get('/api/me')).json()) as { name: string }).name;
      await page.goto(original);
      await expect(main.locator('.source-settings__version')).toHaveText(
        new RegExp(`^Version ${String(before + 1)} · approved \\d{1,2} [A-Z][a-z]{2} by ${me}$`),
      );
      // The copy, its work done, removed with its project folder.
      await page.request.delete(`/api/data-sources/${copyId}`);
      await removeProjectFolder(page.request, project);
    });
  });

  /**
   * T497 (AC-158, AC-161, AC-164, AC-312; design 03 of 2026-09-27, pins 5–10
   * and states B, C, I): changing a data source on its page, in the user's
   * copy — saved only from a passing test of exactly the changed settings,
   * with no way round it; a field the stored password is bound to asking for
   * it again; leaving with changes asked about.
   */
  test.describe('as writer, changing one', () => {
    test.use({ role: 'writer' });

    test('draws its editor as design 03 does: the type fixed beside its help, rows to 680, Test to save at 420, and the save bar at the window’s foot (T698)', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(main.locator('.source-settings__status')).toHaveText('Draft');
      const copyId = decodeURIComponent(page.url().split('/').pop() ?? '');
      made.sources.push(copyId);
      const project = await projectFolderOf(page.request, 'data-source', copyId);
      const panel = main.getByRole('tabpanel', { name: 'Connection' });
      const box = async (locator: ReturnType<typeof page.locator>) =>
        (await locator.boundingBox())!;
      const token = (name: string, property = 'backgroundColor') =>
        page.evaluate(
          ([variable, prop]) => {
            const probe = document.createElement('div');
            probe.style.setProperty(
              prop === 'color' ? 'color' : 'background-color',
              `var(${variable})`,
            );
            document.body.append(probe);
            const style = getComputedStyle(probe);
            const said = prop === 'color' ? style.color : style.backgroundColor;
            probe.remove();
            return said;
          },
          [name, property] as const,
        );

      // The type a 220 px locked field, its help to its right (03:205–206; SRC-08).
      const type = panel.locator('.source-settings__type-value');
      const typeHelp = panel.locator('.source-settings__type .connection-form__note');
      expect(Math.round((await box(type)).width)).toBe(220);
      expect((await box(typeHelp)).x).toBeGreaterThan((await box(type)).x + 220);
      expect(Math.round((await box(typeHelp)).y)).toBeLessThan(
        Math.round((await box(type)).y + (await box(type)).height),
      );
      // Host and Port on a row of at most 680 px, Port 110 (03:210–214).
      const host = panel.getByLabel(/^Host/);
      const port = panel.getByLabel(/^Port/);
      expect(Math.round((await box(port)).width)).toBe(110);
      expect(Math.round((await box(port)).x + (await box(port)).width - (await box(host)).x)).toBe(
        680,
      );
      expect(Math.round((await box(panel.getByLabel(/^Database/))).width)).toBe(680);
      // "Sign in with" a 320 px segment, each option 28 px at 12 (03:218; SRC-15).
      const segment = panel.getByRole('radiogroup', { name: 'Sign in with' });
      expect(Math.round((await box(segment)).width)).toBe(320);
      const option = segment.getByRole('radio').first();
      expect(Math.round((await box(option)).height)).toBe(28);
      await expect(option).toHaveCSS('font-size', '12px');
      // The password kept, a 32 px field on bg-subtle, its Replace a 12/600 link (03:80; SRC-11).
      const kept = panel.locator('.secret-kept');
      expect(Math.round((await box(kept)).height)).toBe(32);
      await expect(kept).toHaveCSS('background-color', await token('--wc-bg-subtle'));
      await expect(kept).toHaveCSS('border-top-color', await token('--wc-border-subtle', 'color'));
      await expect(kept).toHaveCSS('border-top-left-radius', '4px');
      const replace = kept.getByRole('button', { name: /^Replace/ });
      await expect(replace).toHaveCSS('font-size', '12px');
      await expect(replace).toHaveCSS('font-weight', '600');
      // TLS on, as design 03 draws it: its switches side by side, the CA
      // certificate's link beside them (03:225).
      const tls = panel.locator('fieldset').filter({ hasText: 'TLS' });
      const switches = tls.getByRole('switch');
      await switches.first().check();
      await expect(switches).toHaveCount(2);
      const add = tls.getByRole('button', { name: /Add a CA certificate/ });
      const [first, second, link] = [
        await box(switches.nth(0)),
        await box(switches.nth(1)),
        await box(add),
      ];
      expect(second.x).toBeGreaterThan(first.x + first.width);
      expect(Math.abs(second.y - first.y)).toBeLessThan(4);
      expect(link.x).toBeGreaterThan(second.x);
      expect(Math.abs(link.y + link.height / 2 - (second.y + second.height / 2))).toBeLessThan(8);
      // Links at 12/600 (01:90; SRC-11).
      await expect(add).toHaveCSS('font-size', '12px');
      await expect(add).toHaveCSS('font-weight', '600');

      // Test to save at 420 px on white, each check at least 30 px, "Not run"
      // as the dashed circle, Test connection as wide as its words (03:202–242; SRC-09).
      const beside = main.getByRole('region', { name: 'Test to save' });
      expect(Math.round((await box(beside)).width)).toBe(420);
      await expect(beside).toHaveCSS('background-color', await token('--wc-bg-surface'));
      const check = beside.locator('.connection-checks__row').first();
      expect(Math.round((await box(check)).height)).toBeGreaterThanOrEqual(30);
      await expect(check.locator('svg')).toHaveAttribute('data-icon', 'draft');
      const test = beside.getByRole('button', { name: 'Test connection' });
      expect((await box(test)).width).toBeLessThan(200);

      // The save bar across the window's foot: 10 by 24, a top rule, on white (03:135, 247; SRC-10).
      const foot = main.locator('.source-settings__foot');
      const viewport = page.viewportSize()!;
      const footBox = await box(foot);
      expect(Math.round(footBox.y + footBox.height)).toBe(viewport.height);
      expect([Math.round(footBox.x), Math.round(footBox.width)]).toEqual([0, viewport.width]);
      await expect(foot).toHaveCSS('padding', '10px 24px');
      await expect(foot).toHaveCSS('border-top-width', '1px');
      await expect(foot).toHaveCSS('background-color', await token('--wc-bg-surface'));
      // Nothing of the page hidden under it: scrolled to its end, the form ends above it.
      await page.mouse.wheel(0, 5000);
      await expect
        .poll(async () => {
          const form = await box(panel.locator('.source-settings__edit'));
          const bar = await box(foot);
          return form.y + form.height <= bar.y + 1;
        })
        .toBe(true);
      // Nor when the bar grows: narrow, with a change that warns of a rebuild
      // beside Save, it wraps, and the page's end still clears it (T698's review).
      await page.setViewportSize({ width: 820, height: viewport.height });
      await panel.getByLabel(/^Database/).fill('sample_elsewhere');
      await expect(
        foot.getByText(/Saving rebuilds this data source’s pre-aggregations/),
      ).toBeVisible();
      expect((await box(foot)).height).toBeGreaterThan(70);
      await page.mouse.wheel(0, 5000);
      await expect
        .poll(async () => {
          const form = await box(panel.locator('.source-settings__edit'));
          const bar = await box(foot);
          return form.y + form.height <= bar.y + 1;
        })
        .toBe(true);
      await page.setViewportSize(viewport);
      await main.getByRole('button', { name: 'Discard changes' }).click();

      await main.getByRole('button', { name: 'Discard my copy…' }).click();
      await page
        .getByRole('alertdialog', { name: 'Discard your copy?' })
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(page).toHaveURL(/\/explore\?folder=/);
      await removeProjectFolder(page.request, project);
    });

    test('changes its copy: tested before it saves, a target field asking for the password again, leaving asked about', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      await page
        .getByRole('main')
        .getByRole('table', { name: 'Data sources' })
        .getByRole('link', { name: `sales_${RUN}`, exact: true })
        .click();
      const main = page.getByRole('main');
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(main.locator('.source-settings__status')).toHaveText('Draft');
      made.sources.push(decodeURIComponent(page.url().split('/').pop() ?? ''));
      const project = await projectFolderOf(page.request, 'data-source', made.sources.at(-1)!);
      const tabs = main.getByRole('tablist', { name: 'Data source' });
      // In the workspace, the page says so across its width (T498; design 04, pin 2).
      const band = main.getByRole('note').filter({ hasText: 'only you can see this' });
      await expect(band).toHaveText('My workspace · only you can see this');
      const [bandBox, mainBox] = await Promise.all([band.boundingBox(), main.boundingBox()]);
      expect([bandBox?.x, bandBox?.width]).toEqual([mainBox?.x, mainBox?.width]);

      // A copy keeps its original's name (AC-280): read-only, saying why (state B).
      await tabs.getByRole('tab', { name: 'General' }).click();
      await expect(main.getByLabel('Name')).toHaveAttribute('readonly', '');
      await expect(main.getByText('A copy keeps its original’s name')).toBeVisible();

      // Its type fixed, and the way to another (pin 5, AC-161).
      await tabs.getByRole('tab', { name: 'Connection' }).click();
      const panel = main.getByRole('tabpanel');
      await expect(panel).toContainText(
        'The type is fixed. To use another database, make a new data source.',
      );
      const save = main.getByRole('button', { name: 'Save', exact: true });
      await expect(save).toBeDisabled();

      // A change, tinted with its old value; the tab marked; Save needs a test of it.
      await panel.getByLabel('Database').fill('postgres');
      await expect(panel.locator('.field.is-changed')).toContainText('Was sample');
      await expect(tabs.getByRole('tab', { name: /^Connection\s*, changed$/ })).toBeVisible();
      await expect(main.locator('.source-settings__count')).toHaveText(
        '1 unsaved change · Save needs a passing test of these settings.',
      );
      await expect(save).toBeDisabled();

      // Its host is a field the password is bound to: changed, the password is asked for
      // again, and nothing is tested until it's given (pin 7, AC-312).
      await expect(panel.getByLabel('Host')).toHaveAccessibleDescription(
        /A stored secret is bound to this/,
      );
      await expect(panel.locator('.field__bound').first()).toBeVisible();
      // Until then the password is never drawn: said kept from the original (state D, AC-164).
      await expect(
        panel.getByText(`Kept from Sources parent ${RUN} / Sources ${RUN} · encrypted`),
      ).toBeVisible();
      await expect(panel.locator('input[type="password"]')).toHaveCount(0);
      const test = main.getByRole('button', { name: 'Test connection' });
      await panel.getByLabel('Host').fill('sample-db-elsewhere');
      await expect(panel).toContainText(
        'The host changed, so the password kept from the original no longer applies. It’s asked for again.',
      );
      await expect(test).toBeDisabled();
      // Back to its stored host, the stored password holds again.
      await panel.getByLabel('Host').fill('sample-db');
      await expect(panel).not.toContainText('no longer applies');

      // Tested with Cube's own driver: every check passed, of exactly these settings (pin 8).
      await test.click();
      const beside = main.getByRole('region', { name: 'Test to save' });
      await expect(beside).toContainText('Every check passed', { timeout: 90_000 });
      await expect(save).toBeEnabled();
      // Its database is part of its connection's identity: said before Save,
      // beside it and read with it, that saving rebuilds its rollups, on any
      // tab Save is pressed from (T725, AC-353, R70).
      const rebuilds = 'Saving rebuilds this data source’s pre-aggregations: its database changes.';
      const foot = main.locator('.source-settings__foot');
      await expect(foot.getByText(rebuilds)).toBeVisible();
      await expect(save).toHaveAccessibleDescription(rebuilds);
      await tabs.getByRole('tab', { name: 'General' }).click();
      await expect(foot.getByText(rebuilds)).toBeVisible();
      await expect(save).toHaveAccessibleDescription(rebuilds);
      await tabs.getByRole('tab', { name: /^Connection/ }).click();
      // A change after the pass clears it (pin 10), and undoing it brings it back.
      await panel.getByLabel('Database').fill('postgres2');
      await expect(save).toBeDisabled();
      await panel.getByLabel('Database').fill('postgres');
      await expect(save).toBeEnabled();

      // Leaving with the change asks first (state I); staying puts focus back.
      const explore = main
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'Explore' });
      // From the keyboard, where focus has somewhere to go back to: Safari
      // doesn't focus a link it clicks.
      await explore.focus();
      await explore.press('Enter');
      const leave = page.getByRole('alertdialog', { name: 'Leave without saving?' });
      await expect(leave.getByRole('button', { name: 'Stay' })).toBeFocused();
      await leave.getByRole('button', { name: 'Stay' }).click();
      await expect(leave).toHaveCount(0);
      await expect(explore).toBeFocused();
      // So does a workspace in the bar, now followed in the app (T499; state I).
      await page
        .getByRole('navigation', { name: 'Workspaces' })
        .getByRole('link', { name: 'Explore' })
        .click();
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Stay' }).click();
      await expect(leave).toHaveCount(0);
      await expect(page).toHaveURL(/\/explore\/data-sources\//);

      // Saved as it was tested.
      await save.click();
      await expect(main.locator('.source-settings__foot')).toContainText('Saved 1 change.');
      await expect(main.locator('.source-settings__count')).toHaveText('No unsaved changes');
      await expect(panel.getByLabel('Database')).toHaveValue('postgres');
      await tabs.getByRole('tab', { name: 'Test history' }).click();
      await expect(main.getByRole('tabpanel', { name: 'Test history' })).toContainText('Passed');

      // Discarding the copy with a change in it asks once, not again as the page goes
      // (T497's review): a second, the browser's, would be dismissed and keep it here.
      const asked: string[] = [];
      page.on('dialog', (dialog) => {
        asked.push(dialog.type());
      });
      await tabs.getByRole('tab', { name: 'Connection' }).click();
      await panel.getByLabel('Database').fill('postgres3');
      await main.getByRole('button', { name: 'Discard my copy…' }).click();
      await page
        .getByRole('alertdialog', { name: 'Discard your copy?' })
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(page).toHaveURL(/\/explore\?folder=/);
      expect(asked).toEqual([]);
      await removeProjectFolder(page.request, project);
    });
  });

  /**
   * T506 (AC-353; R42.5): a Dremio data source whose token is stored, made in
   * the writer's workspace. Its token is kept through a change that isn't to
   * its target, and choosing Replace says at once, before anything can be
   * saved, that replacing it rebuilds the data source's pre-aggregations even
   * when the new token is the same (xcube takes each one entered as a new
   * target; research `xcube-bc18f82c01.md`, Gotcha 6).
   *
   * No Dremio runs in compose, and a data source is made only from a passing
   * test of it (AC-158). So the fixture's test is run through the API against
   * a host where nothing listens, fails there, and is marked passed in the
   * suite's database (`markPassed`); the source is made through the API from
   * it. The warning shows before Save, so no Dremio need answer after that.
   */
  test.describe('as writer, a stored token (T506, AC-353)', () => {
    test.use({ role: 'writer' });

    test('keeps it through a change that isn’t to its target, and says Replace rebuilds the pre-aggregations before any save', async ({
      page,
    }) => {
      const request = page.request;
      // Nothing listens there, in Cube's container, so the test goes nowhere else.
      const fields = { host: '127.0.0.1', port: 9047, ssl: false, database: 'e2e' };
      const settings = {
        folderId: 'mine',
        driver: 'dremio',
        authMethod: 'token',
        fields,
        sealed: { token: await sealSecretV1(KEY, 'dremio', 'token', fields, 'e2e-fixture-token') },
      };
      const run = await request.post('/api/data-sources/test', { data: settings, timeout: 90_000 });
      expect(run.status(), await run.text()).toBe(200);
      const trial = (await run.json()) as { ok: boolean; testId: string };
      expect(trial.ok).toBe(false);
      markPassed(trial.testId);
      const created = await request.post('/api/data-sources', {
        data: {
          ...settings,
          name: `token_${RUN}`,
          targetFolderId: made.folder,
          testId: trial.testId,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      made.sources.push(id);

      await page.goto(`/explore/data-sources/${id}`);
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(`token_${RUN}`);
      const panel = main.getByRole('tabpanel', { name: 'Connection' });
      const rebuilds =
        'Replacing the token rebuilds this data source’s pre-aggregations, even when the new token is the same.';
      const save = main.getByRole('button', { name: /^Save/ });

      // Kept: said stored, never drawn (AC-164), and nothing to warn of.
      const replace = panel.getByRole('button', { name: 'Replace the token' });
      await expect(replace).toBeVisible();
      await expect(panel.getByText('Stored · encrypted')).toBeVisible();
      await expect(panel.locator('input[type="password"]')).toHaveCount(0);
      await expect(panel.getByText(rebuilds)).toHaveCount(0);

      // Its database isn't what the token is bound to: changed, the token is still kept,
      // not asked for again, and the change can be tested as it is.
      await panel.getByLabel('Database').fill('e2e_other');
      await expect(main.locator('.source-settings__count')).toHaveText(
        '1 unsaved change · Save needs a passing test of these settings.',
      );
      await expect(panel.getByText('Stored · encrypted')).toBeVisible();
      await expect(main.getByRole('region', { name: 'Test to save' })).not.toContainText(
        'needed again',
      );
      await expect(main.getByRole('button', { name: 'Test connection' })).toBeEnabled();

      // Replace: said beside the field at once, while nothing can yet be saved.
      await replace.click();
      const token = panel.getByLabel(/^Token/);
      await expect(token).toBeFocused();
      await expect(panel.getByText(rebuilds)).toBeVisible();
      await expect(token).toHaveAccessibleDescription(
        /rebuilds this data source’s pre-aggregations/,
      );
      await expect(save).toBeDisabled();
      await token.fill('e2e-fixture-token');
      await expect(panel.getByText(rebuilds)).toBeVisible();
      await expect(save).toBeDisabled();
      // And beside Save: the database and the token move its connection's
      // identity (T725, AC-353, R70).
      await expect(
        main
          .locator('.source-settings__foot')
          .getByText(
            'Saving rebuilds this data source’s pre-aggregations: its database and token change.',
          ),
      ).toBeVisible();

      // Kept after all: the stored one again, and nothing to warn of.
      await panel.getByRole('button', { name: 'Keep the stored one' }).click();
      await expect(panel.getByText(rebuilds)).toHaveCount(0);
      await expect(panel.getByText('Stored · encrypted')).toBeVisible();
      await main.getByRole('button', { name: 'Discard changes' }).click();
      await expect(main.locator('.source-settings__count')).toHaveText('No unsaved changes');

      // Removed by its maker: no one else reaches their workspace (AC-276), so the
      // suite's clean-up, as super, couldn't (T506's review).
      expect((await request.delete(`/api/data-sources/${id}`)).status()).toBe(204);
      made.sources.splice(made.sources.indexOf(id), 1);
    });
  });

  /**
   * T459 (AC-157): beside each data source, the cubes xcube bound to it at
   * publish. A cube in the sales folder naming `parent_…` binds its parent's,
   * the one data source of that name (R71; T731: a nearer one of the name, and
   * its rebinding, can no longer be made). Published again, the cube stays
   * beside it, and the folder's own data source has none (AC-273; T730). A
   * root data source's cube in managers' folder is no business of `writer`'s.
   */
  test.describe('the cubes bound to each', () => {
    test.describe('as super, who publishes them', () => {
      test.use({ role: 'super' });

      test('publishes a cube on the parent’s, is refused a nearer one of that name, and publishes a cube only managers reach', async ({
        page,
      }) => {
        const request = page.request;
        await cube(request, made.folder, `uses_${RUN}`, `parent_${RUN}`);
        // A nearer one of the name is refused as in use, saying nowhere where (AC-421, AC-424).
        const nearer = await request.post('/api/data-sources', {
          data: await testedSource(request, {
            folderId: made.folder,
            name: `parent_${RUN}`,
            driver: 'postgres',
            authMethod: 'password',
            fields: FIELDS,
            sealed: {
              password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample'),
            },
          }),
        });
        expect(nearer.status(), await nearer.text()).toBe(409);
        expect(await nearer.json()).toEqual({
          error: `The name “parent_${RUN}” is already in use.`,
        });
        await dataSource(request, 'root', `root_${RUN}`);
        await cube(request, made.hidden, `secret_${RUN}`, `root_${RUN}`);

        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        // Super sees every folder, managers' cube included: counted in the cell,
        // named with its folder in the tooltip hovering opens (design 01 item 10, T496).
        const usedBy = table
          .getByRole('row')
          .filter({ hasText: `root_${RUN}` })
          .getByTestId('source-used-by');
        await expect(usedBy.locator('.sources-used-by__count')).toHaveText('1 cube');
        const tip = usedBy.getByRole('tooltip');
        await expect(tip).toBeHidden();
        await usedBy.locator('.sources-used-by__count').hover();
        await expect(tip).toBeVisible();
        await expect(tip).toHaveText(`secret_${RUN} · Sources hidden ${RUN}`);
        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        // From the keyboard too, and Escape closes it where it is (WCAG 1.4.13).
        await usedBy.locator('.sources-used-by__count').focus();
        await expect(tip).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(tip).toBeHidden();
        await expect(usedBy.locator('.sources-used-by__count')).toBeFocused();
      });
    });

    test.describe('as writer', () => {
      test.use({ role: 'writer' });

      test('sees each cube beside the source it was bound to, and none it can’t reach', async ({
        page,
      }) => {
        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        const rowOf = (name: string, folder: string) =>
          table
            .getByRole('row')
            .filter({ hasText: name })
            .filter({ has: page.getByRole('link', { name: folder, exact: true }) });

        // Counted in the cell, each named with its folder in the tooltip (T496).
        const parent = rowOf(`parent_${RUN}`, `Sources parent ${RUN}`).getByTestId(
          'source-used-by',
        );
        await expect(parent.locator('.sources-used-by__count')).toHaveText('1 cube');
        await expect(parent.locator('.sources-used-by__tip')).toHaveText(
          `uses_${RUN} · Sources parent ${RUN} / Sources ${RUN}`,
        );
        // The folder's own data source, which the cube doesn't name: none,
        // counted as the others are (data-sources-Q2; T698).
        await expect(
          rowOf(`sales_${RUN}`, `Sources parent ${RUN} / Sources ${RUN}`).getByTestId(
            'source-used-by',
          ),
        ).toHaveText('0 cubes');
        // Managers' cube counted, never named (as AC-322 counts what can't be seen).
        const root = rowOf(`root_${RUN}`, 'Shared').getByTestId('source-used-by');
        await expect(root.locator('.sources-used-by__count')).toHaveText('1 cube');
        await expect(root.locator('.sources-used-by__tip')).toHaveText(
          '1 cube in a folder you can’t see',
        );
        await expect(page.getByRole('main')).not.toContainText(`secret_${RUN}`);
        // What a read-write member is shown, said under the list (design 01).
        await expect(page.getByRole('main')).toContainText(
          'Showing data sources in the folders where you have read-write access, and in the folders above them (view only).',
        );

        // On its page, Usage names each cube's model file too (T499; design 03, state F).
        await rowOf(`parent_${RUN}`, `Sources parent ${RUN}`)
          .getByRole('link', { name: `parent_${RUN}`, exact: true })
          .click();
        const main = page.getByRole('main');
        await main
          .getByRole('tablist', { name: 'Data source' })
          .getByRole('tab', { name: 'Usage' })
          .click();
        const usage = main.getByRole('table', { name: `Cubes using parent_${RUN}` });
        await expect(usage.getByRole('columnheader')).toHaveText(['Cube', 'Model', 'Folder']);
        await expect(usage.getByRole('row').nth(1).getByRole('cell')).toHaveText([
          `uses_${RUN}`,
          `uses_${RUN}.yml`,
          `Sources parent ${RUN} / Sources ${RUN}`,
        ]);
      });
    });

    test.describe('as super, again', () => {
      test.use({ role: 'super' });

      test('publishes the cube again, by the same name', async ({ page }) => {
        await cube(page.request, made.folder, `uses_${RUN}`, `parent_${RUN}`, 'Uses, again');
      });
    });

    test.describe('as writer, again', () => {
      test.use({ role: 'writer' });

      test('sees it beside the same one once it’s published again, and the folder’s own with none', async ({
        page,
      }) => {
        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        const usedBy = (name: string, folder: string) =>
          table
            .getByRole('row')
            .filter({ hasText: name })
            .filter({ has: page.getByRole('link', { name: folder, exact: true }) })
            .getByTestId('source-used-by');

        await expect(
          usedBy(`parent_${RUN}`, `Sources parent ${RUN}`).locator('.sources-used-by__tip'),
        ).toHaveText(`uses_${RUN} · Sources parent ${RUN} / Sources ${RUN}`);
        await expect(usedBy(`sales_${RUN}`, `Sources parent ${RUN} / Sources ${RUN}`)).toHaveText(
          '0 cubes',
        );
      });
    });
  });
});
