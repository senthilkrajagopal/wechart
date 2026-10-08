import { execFileSync } from 'node:child_process';

import type { Browser } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test, type Role } from './fixtures';

/**
 * T522 (AC-367; design 14, state F): Clear My workspace…, in My workspace's
 * header ⋯ while it holds something, asks first, naming how much it removes
 * and each open proposal it withdraws; cleared, nothing is left in it, the
 * proposal is withdrawn, and the shared folder's dashboard is as it was.
 *
 * As `manager`, whose workspace no other test uses: clearing it takes nothing
 * another test is working with. In Chrome alone (`playwright.security.config.ts`):
 * the three browsers share Dex's one `manager`, and so one workspace, which a
 * clear in one would empty under the others (T522's review).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const CLEAR_FOLDER = `Clear here ${RUN}`;
const CLEAR_BOARD = `Clear board ${RUN}`;
const clearing = { folder: '', board: '', copy: '', project: '', chart: '' };

/** How many of the suite model's live overlays hold an item of this name (T739). */
const overlaysHolding = (name: string) =>
  Number(
    execFileSync(
      'docker',
      [
        'exec',
        'wechart-meta',
        'psql',
        '-U',
        'wechart',
        '-d',
        'wechart_meta',
        '-Atc',
        `select count(*) from xcube.overlays, jsonb_array_elements(upserts) item where model = 'e2e-security' and item->>'name' = '${name}'`,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );

/** A signed-in context of `who`'s own, for set-up and clean-up. */
async function as(browser: Browser, who: Role) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  await signInThroughDex(await context.newPage(), who);
  return context;
}

test.describe.configure({ mode: 'serial' });

test.describe('clearing My workspace (T522, AC-367)', () => {
  test.afterAll(async ({ browser }) => {
    // Should the test stop short of clearing it.
    const manager = await as(browser, 'manager');
    // T739's draft, should its test stop short of clearing it.
    if (clearing.project !== '')
      await manager.request.delete(
        `/api/model/files?folder=${clearing.project}&path=${encodeURIComponent(`cubes/t739_cleared_${RUN}.yml`)}`,
        { timeout: 90_000 },
      );
    for (const [kind, id] of [
      ['dashboard', clearing.copy],
      ['chart', clearing.chart],
      ['folder', clearing.project],
    ] as const)
      if (id !== '') await manager.request.delete(`/api/documents/${kind}/${id}`);
    await manager.close();
    const admin = await as(browser, 'super');
    if (clearing.board !== '')
      await admin.request.delete(`/api/documents/dashboard/${clearing.board}`);
    if (clearing.folder !== '')
      await admin.request.delete(`/api/documents/folder/${clearing.folder}`);
    await admin.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes a folder managers write, with a dashboard in it', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: CLEAR_FOLDER, folderId: 'root' },
      });
      clearing.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await page.request.put(`/api/folders/${clearing.folder}/access`, {
            data: { readOnly: [], readWrite: ['managers'] },
          })
        ).status(),
      ).toBe(200);
      const board = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: CLEAR_BOARD, folderId: clearing.folder },
      });
      expect(board.status(), await board.text()).toBe(201);
      clearing.board = ((await board.json()) as { id: string }).id;
    });
  });

  test.describe('as manager', () => {
    test.use({ role: 'manager' });

    test('asks first, naming what it removes and the proposal it withdraws, then leaves nothing in it', async ({
      page,
    }) => {
      // A copy of the folder's dashboard, waiting for review, and a chart made new.
      const copied = await page.request.post('/api/workspace/copies', {
        data: { kind: 'dashboard', id: clearing.board, timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBe(201);
      ({ id: clearing.copy, folderId: clearing.project } = (await copied.json()) as {
        id: string;
        folderId: string;
      });
      const proposed = await page.request.post('/api/proposals', {
        data: { kind: 'dashboard', id: clearing.copy },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      const chart = await page.request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `Clear chart ${RUN}`,
          folderId: 'mine',
          targetFolderId: clearing.folder,
        },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      clearing.chart = ((await chart.json()) as { id: string }).id;

      await page.goto('/explore?folder=mine');
      const contents = page.getByTestId('explore-contents');
      await expect(contents.getByTestId(`item-${clearing.chart}`)).toBeVisible();
      const more = page.getByRole('button', { name: 'More actions for My workspace' });
      const ask = async () => {
        await more.click();
        await page.getByRole('menuitem', { name: 'Clear My workspace…' }).click();
        return page.getByRole('alertdialog', { name: 'Clear My workspace?' });
      };

      // Asked first (F2): Cancel, focused, keeps everything.
      let dialog = await ask();
      await expect(
        dialog.getByText(
          'This removes everything in My workspace: 2 items and 1 folder (1 dashboard, 1 chart).',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        dialog.getByText('It withdraws its open proposal', { exact: true }),
      ).toBeVisible();
      await expect(dialog.getByRole('list', { name: 'It withdraws its open proposal' })).toHaveText(
        new RegExp(`^Waiting for review\\s*${CLEAR_BOARD}\\s*→ ${CLEAR_FOLDER} · `),
      );
      await expect(dialog).toContainText(
        'Nothing outside My workspace changes: what’s already approved stays in its folder. You can’t undo this.',
      );
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(more).toBeFocused();
      await expect(contents.getByTestId(`item-${clearing.chart}`)).toBeVisible();

      // Cleared (F3): said so, nothing left, no ⋯, the heading focused.
      dialog = await ask();
      await dialog.getByRole('button', { name: 'Clear My workspace' }).click();
      await expect(
        page.getByRole('status').filter({
          hasText: 'Cleared My workspace: 2 items and 1 folder removed, 1 proposal withdrawn.',
        }),
      ).toBeVisible();
      await expect(contents.getByTestId(`item-${clearing.chart}`)).toHaveCount(0);
      await expect(contents.getByTestId(`item-${clearing.project}`)).toHaveCount(0);
      await expect(more).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      const proposal = (await (
        await page.request.get(`/api/proposals?kind=dashboard&itemId=${clearing.copy}`)
      ).json()) as { status: string };
      expect(proposal.status).toBe('withdrawn');
      expect((await page.request.get(`/api/documents/dashboard/${clearing.copy}`)).status()).toBe(
        404,
      );
      clearing.copy = '';
      clearing.chart = '';
      clearing.project = '';
      // The folder's own dashboard is as it was.
      const shared = await page.request.get(`/api/documents/dashboard/${clearing.board}`);
      expect(shared.status()).toBe(200);
      expect(((await shared.json()) as { version: number }).version).toBe(1);
    });

    /**
     * T739 (AC-323, AC-422): cleared, xcube's overlay of the workspace holds
     * none of its drafts, so none of their names stays held there.
     */
    test('leaves xcube’s overlay holding none of the drafts it cleared', async ({ page }) => {
      const name = `t739_cleared_${RUN}`;
      const project = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `Cleared model ${RUN}`, folderId: 'mine' },
      });
      expect(project.status(), await project.text()).toBe(201);
      clearing.project = ((await project.json()) as { id: string }).id;
      const saved = await page.request.post('/api/model/publish', {
        data: {
          folderId: clearing.project,
          targetFolderId: clearing.folder,
          files: [
            {
              path: `cubes/${name}.yml`,
              content: `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`,
            },
          ],
        },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      expect(overlaysHolding(name)).toBe(1);

      const cleared = await page.request.post('/api/workspace/clear', {
        data: {},
        timeout: 90_000,
      });
      expect(cleared.status(), await cleared.text()).toBe(200);
      clearing.project = '';
      // Pushed once the clear has answered.
      await expect.poll(() => overlaysHolding(name), { timeout: 30_000 }).toBe(0);
    });
  });
});
