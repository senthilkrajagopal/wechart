import type { APIRequestContext, Page } from '@playwright/test';

import { landed, modelFilesIn } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T546 (AC-141, amended 2026-10-02, `[R55]`): a model saved in My workspace
 * lists, before it is saved, the shared charts and dashboards that landing it
 * would change in the folder it goes to, and names that folder by its path.
 * Nothing shared changes at the save; its landing would.
 *
 * Against compose's xcube. `super` makes "Refs <run>", which `writer`
 * (`sales-rw`) writes, lands a cube in it and shares a chart on its `count`.
 * `writer` copies the cube's model into My workspace and renames `count`
 * there: the save lists the chart first. Cancelled, nothing is saved; saved
 * anyway, the next save of another edit lists it again, since landing it
 * would still change the chart; a save that takes the rename back lists
 * nothing.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Refs ${RUN}`;
const CUBE = `t546_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const CHART = `Counted ${RUN}`;
const CONTENT = [
  'cubes:',
  `  - name: ${CUBE}`,
  '    sql_table: public.orders',
  '    dimensions:',
  '      - name: id',
  '        sql: id',
  '        type: number',
  '        primary_key: true',
  '    measures:',
  '      - name: count',
  '        type: count',
  '      - name: total',
  '        sql: amount',
  '        type: sum',
  '',
].join('\n');
const made = { folder: '', chart: '', project: '' };
const full = () => `f${made.folder.replaceAll('-', '')}__${CUBE}`;

const yaml = (page: Page) => page.getByRole('textbox', { name: `${PATH}, as YAML` });
const warning = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'this changes members that' });
const copyContent = async (request: APIRequestContext) =>
  (await modelFilesIn(request, made.project)).find((file) => file.path === PATH)?.content;

test.describe.configure({ mode: 'serial' });

test.describe('a workspace model’s save lists what landing it would change (T546, AC-141)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer' && made.project !== '') {
        await request.delete(
          `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
          { timeout: 90_000 },
        );
        await request.delete(`/api/documents/folder/${made.project}`);
      }
      if (who === 'super' && made.folder !== '') {
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        await request.delete(
          `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(PATH)}`,
          { timeout: 90_000 },
        );
        await request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, lands its cube, and shares a chart on its count', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      expect(folder.status(), await folder.text()).toBe(201);
      made.folder = ((await folder.json()) as { id: string }).id;
      const access = await request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status(), await access.text()).toBe(200);
      expect(await landed(request, made.folder, [{ path: PATH, content: CONTENT }])).toEqual([
        { path: PATH, content: CONTENT },
      ]);

      const chart = await request.post('/api/documents', {
        data: { kind: 'chart', title: CHART, folderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      // Shared as a chart is, by approving its copy, which binds it there (T502).
      await changeShared(request, 'chart', made.chart, (body) => ({
        ...body,
        chart: {
          source: { cube: CUBE },
          wells: { measures: [`${CUBE}.count`], dimensions: [], timeDimensions: [] },
          chartType: 'kpi',
          filters: [],
        },
      }));
      const stored = (await (await request.get(`/api/documents/chart/${made.chart}`)).json()) as {
        body: { chart: { wells: { measures: string[] } } };
      };
      expect(stored.body.chart.wells.measures).toEqual([`${full()}.count`]);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('renaming count in a copy lists the chart before saving, naming the folder; Cancel saves nothing', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.folder}/models/${encodeURIComponent(PATH)}`);
      await page.getByRole('button', { name: 'Edit in my workspace' }).click();
      // Its copy opens in its project folder.
      await expect(page).not.toHaveURL(new RegExp(made.folder));
      await expect(page).toHaveURL(/\/explore\/folders\/[0-9a-f-]{36}\/models\/cubes%2F/);
      made.project = /\/explore\/folders\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
      expect(made.project).not.toBe(made.folder);
      await expect(yaml(page)).toContainText(`name: ${CUBE}`);

      await page.locator('.cm-line', { hasText: '- name: count' }).first().click();
      await page.keyboard.press('End');
      await page.keyboard.type('_all');
      await page.getByRole('button', { name: 'Save', exact: true }).click();

      const shown = warning(page);
      await expect(shown).toBeVisible({ timeout: 30_000 });
      await expect(shown.locator('.model-references__lead')).toHaveText(
        `Landed in ${FOLDER}, this changes members that 1 chart and 0 dashboards use.`,
      );
      // By the cube's own name in the folder it lands in, never its prefixed one (AC-329).
      await expect(shown.getByRole('list', { name: 'Charts' })).toHaveText(
        `${CHART} — uses ${CUBE}.count`,
      );
      await expect(shown).not.toContainText(`${full()}`);

      await shown.getByRole('button', { name: 'Cancel' }).click();
      await expect(warning(page)).toHaveCount(0);
      expect(await copyContent(page.request)).toBe(CONTENT);
    });

    test('saved anyway, a later save lists it again until the rename is taken back', async ({
      page,
    }) => {
      const saved = page
        .getByRole('status')
        .filter({ hasText: 'Saved. Previews in My workspace use it now.' });
      await page.goto(`/explore/folders/${made.project}/models/${encodeURIComponent(PATH)}`);
      await expect(yaml(page)).toContainText(`name: ${CUBE}`);
      await page.locator('.cm-line', { hasText: '- name: count' }).first().click();
      await page.keyboard.press('End');
      await page.keyboard.type('_all');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await warning(page).getByRole('button', { name: 'Save anyway' }).click();
      await expect(saved).toBeVisible({ timeout: 90_000 });
      expect(await copyContent(page.request)).toContain('- name: count_all');

      // `total`, which no chart uses: landing the file would still change
      // `count`, which the chart uses, so it is listed again.
      await page.locator('.cm-line', { hasText: 'sql: amount' }).first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' * 2');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(warning(page).getByRole('list', { name: 'Charts' })).toHaveText(
        `${CHART} — uses ${CUBE}.count`,
        { timeout: 30_000 },
      );
      await warning(page).getByRole('button', { name: 'Save anyway' }).click();
      await expect
        .poll(() => copyContent(page.request), { timeout: 90_000 })
        .toContain('sql: amount * 2');

      // `count` back as it was: nothing the chart uses changes, so it saves at once.
      await page.locator('.cm-line', { hasText: '- name: count_all' }).first().click();
      await page.keyboard.press('End');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect
        .poll(() => copyContent(page.request), { timeout: 90_000 })
        .not.toContain('count_all');
      await expect(warning(page)).toHaveCount(0);
      await expect(saved).toBeVisible();
      expect(await copyContent(page.request)).toContain('sql: amount * 2');
    });
  });
});
