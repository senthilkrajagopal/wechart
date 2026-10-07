import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T350 (AC-285, AC-323, AC-388; design 05, states A and G): a workspace
 * dashboard whose chart names a measure only the author's copy of a model
 * has is proposed with that model. The Propose dialog lists it and says why;
 * the proposal's previews answer through it in compose's xcube; the review
 * shows the model as a YAML diff against the folder's file; and the copy is
 * frozen while it waits.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and publishes a cube in
 * it. `writer` copies the cube's model into My workspace, adds a measure,
 * and makes a dashboard there showing a chart of it.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Bundle ${RUN}`;
const CUBE = `t350_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const BOARD = `Doubled ${RUN}`;
const CHART = `Doubled chart ${RUN}`;
// Comment lines first, a stretch long enough for the review to fold (T637).
const PUBLISHED = `${Array.from({ length: 8 }, (_, at) => `# note ${String(at + 1)}\n`).join('')}cubes:\n  - name: ${CUBE}\n    sql: SELECT 1 AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const CHANGED = `${PUBLISHED}      - name: doubled\n        sql: n * 2\n        type: sum\n`;
const made = { folder: '', xcubeId: '', project: '', chart: '', board: '', proposal: '' };
const full = () => `${made.xcubeId}__${CUBE}`;

async function stored(request: APIRequestContext, kind: 'chart' | 'dashboard', id: string) {
  const answer = await request.get(`/api/documents/${kind}/${id}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as { body: Record<string, unknown>; version: number };
}

async function saved(
  request: APIRequestContext,
  kind: 'chart' | 'dashboard',
  id: string,
  change: (body: Record<string, unknown>) => Record<string, unknown>,
) {
  const { body, version } = await stored(request, kind, id);
  const answer = await request.put(`/api/documents/${kind}/${id}`, {
    data: { body: change(body), version },
  });
  expect(answer.status(), await answer.text()).toBe(200);
}

test.describe.configure({ mode: 'serial' });

test.describe('a dashboard proposed with the workspace model it resolves through (T350, AC-285)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer') {
        if (made.proposal !== '')
          await request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
        if (made.board !== '') await request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        if (made.project !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.project}`);
        }
      }
      if (who === 'super' && made.folder !== '') {
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

    test('makes the folder and publishes its cube', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      made.xcubeId = `f${made.folder.replaceAll('-', '')}`;
      const access = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status()).toBe(200);
      // Through My workspace and a proposal `super` approves (T451, AC-278).
      const file = { path: PATH, content: PUBLISHED };
      expect(await landed(page.request, made.folder, [file])).toEqual([file]);
    });
  });

  test.describe('as writer, its author', () => {
    test.use({ role: 'writer' });

    test('copies the model, adds a measure, and makes a dashboard of it in My workspace', async ({
      page,
    }) => {
      const { request } = page;
      const copied = await request.post('/api/workspace/copies', {
        data: { kind: 'model', folderId: made.folder, path: PATH, timeZone: 'UTC' },
        timeout: 90_000,
      });
      expect(copied.status(), await copied.text()).toBe(201);
      made.project = ((await copied.json()) as { folderId: string }).folderId;
      const changed = await request.post('/api/model/publish', {
        data: { folderId: made.project, files: [{ path: PATH, content: CHANGED }] },
        timeout: 90_000,
      });
      expect(changed.status(), await changed.text()).toBe(200);

      const create = async (kind: 'chart' | 'dashboard', title: string) => {
        const answer = await request.post('/api/documents', {
          data: { kind, title, folderId: made.project, targetFolderId: made.folder },
        });
        expect(answer.status(), await answer.text()).toBe(201);
        return ((await answer.json()) as { id: string }).id;
      };
      made.chart = await create('chart', CHART);
      await saved(request, 'chart', made.chart, (body) => ({
        ...body,
        chart: {
          source: { cube: full() },
          wells: { measures: [`${full()}.doubled`], dimensions: [], timeDimensions: [] },
        },
      }));
      made.board = await create('dashboard', BOARD);
      await saved(request, 'dashboard', made.board, (body) => ({
        ...body,
        pages: [
          { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: made.chart }] },
        ],
      }));
    });

    test('proposes the dashboard: the dialog lists the model and says why it goes', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${made.project}`);
      const row = page.getByTestId('explore-contents').getByTestId(`item-${made.board}`);
      await row.getByRole('button', { name: `Actions for ${BOARD}` }).click();
      await page.getByRole('menuitem', { name: 'Propose…' }).click();
      const dialog = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
      const goes = dialog.getByRole('list', { name: 'Goes with it' });
      await expect(goes.getByRole('listitem')).toHaveText([
        `Chart · ${CHART} — new in this folder`,
        `Model · ${PATH} — replaces version 1`,
      ]);
      await expect(dialog.getByTestId('propose-goes')).toHaveText(
        'The dashboard shows this chart from your workspace, and its cubes resolve through this model only your workspace has. They’re approved or rejected together.',
      );
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(dialog).toHaveCount(0);

      const latest = await page.request.get(`/api/proposals?kind=dashboard&itemId=${made.board}`);
      expect(latest.status()).toBe(200);
      const proposal = (await latest.json()) as { id: string; items: { kind: string }[] };
      made.proposal = proposal.id;
      expect(proposal.items.map((item) => item.kind)).toEqual(['dashboard', 'chart', 'model']);

      // Its previews answer through the proposed model, in xcube (AC-323).
      const load = await page.request.post('/api/load', {
        data: {
          query: { measures: [`${full()}.doubled`] },
          for: { kind: 'proposal', id: made.proposal },
        },
        timeout: 90_000,
      });
      expect(load.status(), await load.text()).toBe(200);
      const [first] = ((await load.json()) as { data: Record<string, unknown>[] }).data;
      expect(Number(first?.[`${full()}.doubled`])).toBe(2);

      // The copy is frozen while it waits (AC-388).
      const frozen = await page.request.post('/api/model/publish', {
        data: { folderId: made.project, files: [{ path: PATH, content: PUBLISHED }] },
        timeout: 90_000,
      });
      expect(frozen.status(), await frozen.text()).toBe(409);
      expect(((await frozen.json()) as { error: string }).error).toBe(
        'This was submitted for review, so it can’t be changed. Withdraw its proposal to change it, then propose it again.',
      );
    });

    test('reviews the model as its YAML against the folder’s file (state G)', async ({ page }) => {
      await page.goto(`/reviews/${made.proposal}`);
      const items = page.getByRole('list', { name: 'In this proposal' });
      await expect(items.getByRole('listitem')).toHaveText([
        // Each led by its kind's icon chip (design 05; T544).
        `▦${BOARD}Dashboard · new in this folder`,
        `◢${CHART}Chart · new in this folder`,
        `◇${PATH}Model · replaces version 1`,
      ]);
      await expect(page.getByTestId('review-bundle')).toHaveText(
        `The chart it shows from the author’s workspace goes with it. The model goes with the dashboard: its cubes resolve only through the author’s ${PATH}. They’re approved or rejected together.`,
      );
      await items.getByRole('button', { name: new RegExp(PATH) }).click();
      await expect(page.getByTestId('yaml-diff-head')).toHaveText(
        `${PATH} version 1 → proposed · +3`,
      );
      const text = page.getByRole('textbox', {
        name: `${PATH}: the proposed YAML against the current`,
      });
      await expect(text).toHaveAttribute('aria-readonly', 'true');
      await expect(text).toContainText('name: doubled');
      // Each added line marked beside it, not by its tint alone (rule 3).
      await expect(page.locator('.cm-changedLineGutter')).toHaveCount(3);

      // T637 (AC-176; R66): the folded lines from the keyboard. The bar is a
      // button that Enter unfolds, and Show all lines folds and unfolds them all.
      const bar = page.getByRole('button', { name: /unchanged lines$/ });
      await bar.focus();
      await page.keyboard.press('Enter');
      await expect(bar).toHaveCount(0);
      await expect(text).toContainText('# note 1');
      await expect(text).toBeFocused();
      const all = page.getByRole('button', { name: 'Show all lines' });
      await expect(all).toHaveAttribute('aria-pressed', 'false');
      await all.focus();
      await page.keyboard.press('Enter');
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.cm-collapsedLines')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await expect(all).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.cm-collapsedLines')).toHaveCount(1);
    });

    test('is told, deleting the model, that it withdraws the proposal it goes with (AC-372)', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${made.project}`);
      await page
        .getByTestId(`item-${PATH}`)
        .getByRole('button', { name: `Actions for ${CUBE}.yml` })
        .click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem')).toHaveText(['Open', 'Propose…', 'Delete…']);
      await menu.getByRole('menuitem', { name: 'Delete…' }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(
        dialog.getByRole('list', { name: 'It withdraws its open proposal' }).getByRole('listitem'),
      ).toHaveText(new RegExp(`^Waiting for review ${BOARD} → ${FOLDER} · `));
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    });
  });
});
