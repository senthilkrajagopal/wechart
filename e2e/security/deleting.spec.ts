import type { Browser } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test, type Role } from './fixtures';
import { changeShared } from './shared-change';

/**
 * Design 14 (R48): deleting only what nothing depends on, with sign-in on.
 *
 * T517 (AC-362): a library chart a shared folder's dashboard shows can't be
 * deleted; the refusal names that dashboard. A draft in a workspace doesn't
 * hold it back: once no shared dashboard shows it, it is deleted, and the
 * draft's tile finds it gone.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and `reader`
 * (`sales-ro`) reads.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Deleting ${RUN}`;
const CHART = `Top products ${RUN}`;
const BOARD = `Revenue ${RUN}`;
const DRAFT = `Q4 review ${RUN}`;
const made = { folder: '', chart: '', board: '', draft: '' };

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

test.describe('deleting a library chart (T517, AC-362)', () => {
  test.afterAll(async ({ browser }) => {
    const writer = await as(browser, 'writer');
    if (made.draft !== '') await writer.request.delete(`/api/documents/dashboard/${made.draft}`);
    await writer.close();
    const admin = await as(browser, 'super');
    if (made.board !== '') await admin.request.delete(`/api/documents/dashboard/${made.board}`);
    if (made.chart !== '') await admin.request.delete(`/api/documents/chart/${made.chart}`);
    if (made.folder !== '') await admin.request.delete(`/api/documents/folder/${made.folder}`);
    await admin.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, its chart, and a dashboard showing it', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await page.request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const chart = await page.request.post('/api/documents', {
        data: { kind: 'chart', title: CHART, folderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      const board = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: BOARD, folderId: made.folder },
      });
      made.board = ((await board.json()) as { id: string }).id;
      // Shown on it as a shared dashboard changes: by an approved proposal (T502).
      await changeShared(page.request, 'dashboard', made.board, (body) => ({
        ...body,
        pages: [
          {
            id: 'p1',
            title: 'Page 1',
            items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: made.chart }],
          },
        ],
      }));
    });
  });

  test.describe('as reader', () => {
    test.use({ role: 'reader' });

    test('opens the chart the dashboard shows, with no way to delete it', async ({ page }) => {
      await page.goto(`/explore/charts/${made.chart}`);
      await expect(page.getByRole('heading', { level: 1, name: CHART })).toBeVisible();
      // Where it lives is said once who is signed in and the folders are known.
      await expect(
        page.locator('.chart-page__head').getByText(new RegExp(`^In ${FOLDER} · version`)),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: `More actions for ${CHART}` })).toHaveCount(0);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('is refused while the shared dashboard shows it, and not held back by a draft', async ({
      page,
    }) => {
      // A draft of the writer's own, in My workspace, showing the chart too.
      const draft = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: DRAFT, folderId: 'mine', targetFolderId: made.folder },
      });
      expect(draft.status(), await draft.text()).toBe(201);
      made.draft = ((await draft.json()) as { id: string }).id;
      const stored = (await (
        await page.request.get(`/api/documents/dashboard/${made.draft}`)
      ).json()) as { body: Record<string, unknown>; version: number };
      const saved = await page.request.put(`/api/documents/dashboard/${made.draft}`, {
        data: {
          version: stored.version,
          body: {
            ...stored.body,
            pages: [
              {
                id: 'p1',
                title: 'Page 1',
                items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: made.chart }],
              },
            ],
          },
        },
      });
      expect(saved.status(), await saved.text()).toBe(200);

      // Refused: the shared dashboard named, as a link, with its folder; the draft not at all.
      await page.goto(`/explore/charts/${made.chart}`);
      await page.getByRole('button', { name: `More actions for ${CHART}` }).click();
      await page.getByRole('menuitem', { name: 'Delete chart…' }).click();
      const refused = page.getByRole('alertdialog', { name: `Can’t delete “${CHART}”` });
      await expect(refused).toContainText(
        '1 dashboard uses it. Remove it from the dashboard, then delete it.',
      );
      const list = refused.getByRole('list', { name: 'Dashboards that use it, 1' });
      await expect(list.getByRole('link', { name: new RegExp(BOARD) })).toHaveAttribute(
        'href',
        `/explore/dashboards/${made.board}`,
      );
      await expect(list.getByText(FOLDER, { exact: true })).toBeVisible();
      await expect(refused).not.toContainText(DRAFT);
      await expect(refused).toContainText(
        'A shared dashboard changes through Edit in my workspace and a proposal.',
      );
      await refused.getByRole('button', { name: 'Close' }).click();
      expect((await page.request.get(`/api/documents/chart/${made.chart}`)).status()).toBe(200);

      // Once no shared dashboard shows it, it goes, the draft notwithstanding.
      expect((await page.request.delete(`/api/documents/dashboard/${made.board}`)).status()).toBe(
        204,
      );
      made.board = '';
      await page.reload();
      await page.getByRole('button', { name: `More actions for ${CHART}` }).click();
      await page.getByRole('menuitem', { name: 'Delete chart…' }).click();
      const confirm = page.getByRole('alertdialog', { name: `Delete “${CHART}”?` });
      await expect(confirm).toContainText('No dashboard uses it. You can’t undo this.');
      await confirm.getByRole('button', { name: 'Delete chart' }).click();
      await expect(page).toHaveURL(new RegExp(`/explore\\?folder=${made.folder}$`));
      await expect(
        page.getByRole('status').filter({ hasText: `Deleted “${CHART}”.` }),
      ).toBeVisible();
      made.chart = '';

      // The draft's tile finds it gone.
      await page.goto(`/explore/dashboards/${made.draft}`);
      await expect(page.getByTestId('tile-missing-chart')).toHaveText(
        'This chart is no longer available.',
      );
    });
  });
});

/**
 * T521 (AC-366; design 14, state E): only an empty folder is deleted, and
 * Explore offers Delete on a folder only when it's empty: in its row's ⋯,
 * and in its own header's ⋯ once it's open. One that filled meanwhile is
 * refused, saying what it holds.
 */
const PARENT = `Folders ${RUN}`;
const folders = { parent: '', empty: '', holds: '', board: '', open: '', fills: '' };

test.describe('deleting a folder (T521, AC-366)', () => {
  test.afterAll(async ({ browser }) => {
    const admin = await as(browser, 'super');
    if (folders.board !== '')
      await admin.request.delete(`/api/documents/dashboard/${folders.board}`);
    for (const id of [folders.fills, folders.open, folders.holds, folders.empty])
      if (id !== '') {
        const inside = await admin.request.get(`/api/folders/${id}/contents`);
        if (inside.ok())
          for (const item of (await inside.json()) as { kind: string; id: string }[])
            await admin.request.delete(`/api/documents/${item.kind}/${item.id}`);
        await admin.request.delete(`/api/documents/folder/${id}`);
      }
    if (folders.parent !== '')
      await admin.request.delete(`/api/documents/folder/${folders.parent}`);
    await admin.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes a folder writer changes, with an empty subfolder and one holding a dashboard', async ({
      page,
    }) => {
      const folder = async (title: string, parent: string) => {
        const answer = await page.request.post('/api/documents', {
          data: { kind: 'folder', title, folderId: parent },
        });
        expect(answer.status(), await answer.text()).toBe(201);
        return ((await answer.json()) as { id: string }).id;
      };
      folders.parent = await folder(PARENT, 'root');
      expect(
        (
          await page.request.put(`/api/folders/${folders.parent}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      folders.empty = await folder(`Archive ${RUN}`, folders.parent);
      folders.holds = await folder(`Holds ${RUN}`, folders.parent);
      folders.open = await folder(`Opened ${RUN}`, folders.parent);
      folders.fills = await folder(`Fills ${RUN}`, folders.parent);
      const board = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: `Kept ${RUN}`, folderId: folders.holds },
      });
      folders.board = ((await board.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('is offered Delete on an empty folder’s row only, and deletes it once confirmed', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${folders.parent}`);
      const contents = page.getByTestId('explore-contents');
      await expect(contents.getByRole('heading', { level: 1 })).toHaveText(PARENT);

      // A folder that holds something: Rename and Move to…, and no Delete (E1).
      await page
        .getByTestId(`item-${folders.holds}`)
        .getByRole('button', { name: `Actions for Holds ${RUN}` })
        .click();
      await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Rename', 'Move to…']);
      await page.keyboard.press('Escape');

      // An empty one ends in Delete… (E1), confirmed (E3).
      const row = page.getByTestId(`item-${folders.empty}`);
      await row.getByRole('button', { name: `Actions for Archive ${RUN}` }).click();
      await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
        'Rename',
        'Move to…',
        'Delete…',
      ]);
      await page.getByRole('menuitem', { name: 'Delete…' }).click();
      const dialog = page.getByRole('alertdialog', { name: `Delete “Archive ${RUN}”?` });
      await expect(dialog).toContainText(
        'It’s empty, so nothing else goes with it. You can’t undo this.',
      );
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Delete folder' }).click();
      await expect(row).toHaveCount(0);
      await expect(
        page.getByRole('status').filter({ hasText: `Deleted “Archive ${RUN}”.` }),
      ).toBeVisible();
      folders.empty = '';
      // A folder holding something is refused through the API too, saying what it holds.
      const refused = await page.request.delete(`/api/documents/folder/${folders.holds}`);
      expect(refused.status()).toBe(409);
      expect(((await refused.json()) as { error: string }).error).toBe(
        'This folder holds 1 dashboard: only an empty folder can be deleted.',
      );
    });

    test('deletes the open folder from its header’s ⋯ while it’s empty, and opens its parent', async ({
      page,
    }) => {
      // Holding something, the header has no ⋯ (pin 7).
      await page.goto(`/explore?folder=${folders.holds}`);
      const contents = page.getByTestId('explore-contents');
      await expect(contents.getByRole('heading', { level: 1 })).toHaveText(`Holds ${RUN}`);
      await expect(contents.getByTestId(`item-${folders.board}`)).toBeVisible();
      await expect(page.getByRole('button', { name: `More actions for Holds ${RUN}` })).toHaveCount(
        0,
      );

      await page.goto(`/explore?folder=${folders.open}`);
      await expect(contents.getByRole('heading', { level: 1 })).toHaveText(`Opened ${RUN}`);
      await page.getByRole('button', { name: `More actions for Opened ${RUN}` }).click();
      await page.getByRole('menuitem', { name: 'Delete folder…' }).click();
      await page
        .getByRole('alertdialog', { name: `Delete “Opened ${RUN}”?` })
        .getByRole('button', { name: 'Delete folder' })
        .click();
      // Its parent opens, saying so, with focus on its heading.
      await expect(page).toHaveURL(new RegExp(`folder=${folders.parent}$`));
      await expect(contents.getByRole('heading', { level: 1 })).toHaveText(PARENT);
      await expect(contents.getByRole('heading', { level: 1 })).toBeFocused();
      await expect(
        page.getByRole('status').filter({ hasText: `Deleted “Opened ${RUN}”.` }),
      ).toBeVisible();
      expect((await page.request.get(`/api/documents/folder/${folders.open}`)).status()).toBe(404);
      folders.open = '';
    });

    test('refuses one that filled after Delete was offered, saying what it holds', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${folders.parent}`);
      const row = page.getByTestId(`item-${folders.fills}`);
      await row.getByRole('button', { name: `Actions for Fills ${RUN}` }).click();
      await expect(page.getByRole('menuitem', { name: 'Delete…' })).toBeVisible();
      // Someone adds a folder to it meanwhile.
      const added = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `Added ${RUN}`, folderId: folders.fills },
      });
      expect(added.status(), await added.text()).toBe(201);
      await page.getByRole('menuitem', { name: 'Delete…' }).click();
      await page
        .getByRole('alertdialog', { name: `Delete “Fills ${RUN}”?` })
        .getByRole('button', { name: 'Delete folder' })
        .click();
      const refused = page.getByRole('alertdialog', { name: `Can’t delete “Fills ${RUN}”` });
      await expect(refused).toContainText(
        'It isn’t empty any more. It holds 1 subfolder. Only an empty folder can be deleted.',
      );
      await refused.getByRole('button', { name: `Open Fills ${RUN}` }).click();
      const heading = page.getByTestId('explore-contents').getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(`Fills ${RUN}`);
      await expect(heading).toBeFocused();
      // Read afresh: it holds a subfolder, so neither its header nor its row
      // offers Delete any more, though it counts no item (T521's review).
      await expect(page.getByTestId('explore-contents').getByText(`Added ${RUN}`)).toBeVisible();
      await expect(page.getByRole('button', { name: `More actions for Fills ${RUN}` })).toHaveCount(
        0,
      );
      await page.goto(`/explore?folder=${folders.parent}`);
      await page
        .getByTestId(`item-${folders.fills}`)
        .getByRole('button', { name: `Actions for Fills ${RUN}` })
        .click();
      await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Rename', 'Move to…']);
    });
  });
});
