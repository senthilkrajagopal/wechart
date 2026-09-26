import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T366, AC-292: WHEN a user saves a bookmark, THE SYSTEM SHALL keep it theirs,
 * listed on the dashboard for them alone.
 * `Fails when: another user sees a bookmark its owner hasn't shared.`
 *
 * A dashboard in a folder `writer` writes and `reader` reads, made through the
 * API as `super`, with this run's own names, and removed after.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { folder: '', dashboard: '' };
const NAME = `Writer's view ${RUN}`;

async function make(
  request: APIRequestContext,
  kind: 'folder' | 'dashboard',
  title: string,
  folderId: string,
): Promise<string> {
  const response = await request.post('/api/documents', { data: { kind, title, folderId } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function bookmarksMenu(page: Page) {
  await page.goto(`/explore/dashboards/${ids.dashboard}`);
  await expect(page.getByRole('heading', { name: `Bookmarked ${RUN}` })).toBeVisible();
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  const menu = page.getByRole('menu', { name: 'Bookmarks' });
  await expect(menu.getByRole('menuitem', { name: 'Save bookmark…' })).toBeVisible();
  return menu;
}

test.describe.configure({ mode: 'serial' });

test.describe('as a Super-Admin', () => {
  test.use({ role: 'super' });

  test('makes the dashboard', async ({ page }) => {
    ids.folder = await make(page.request, 'folder', `Bookmarks ${RUN}`, 'root');
    expect(
      (
        await page.request.put(`/api/folders/${ids.folder}/access`, {
          data: { readWrite: ['sales-rw'], readOnly: ['sales-ro'] },
        })
      ).status(),
    ).toBe(200);
    ids.dashboard = await make(page.request, 'dashboard', `Bookmarked ${RUN}`, ids.folder);
  });
});

test.describe('as a read-write member', () => {
  test.use({ role: 'writer' });

  test('saves a bookmark, and has it listed', async ({ page }) => {
    const menu = await bookmarksMenu(page);
    await menu.getByRole('menuitem', { name: 'Save bookmark…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save a bookmark' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill(NAME);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved the bookmark' })).toBeVisible();

    await expect((await bookmarksMenu(page)).getByRole('menuitem', { name: NAME })).toBeVisible();
  });
});

for (const role of ['reader', 'super'] as const) {
  test.describe(`as ${role}`, () => {
    test.use({ role });

    test('doesn’t see the writer’s bookmark on the same dashboard', async ({ page }) => {
      const menu = await bookmarksMenu(page);
      // Read, and empty: said so once the list has come (T366's review), so
      // the check below can't pass on a list still on its way.
      await expect(menu.getByRole('menuitem', { name: 'No bookmarks yet' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: NAME })).toHaveCount(0);
    });
  });
}

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes the dashboard, its bookmarks with it, and the folder', async ({ page }) => {
    for (const [kind, id] of [
      ['dashboard', ids.dashboard],
      ['folder', ids.folder],
    ] as const) {
      if (id === '') continue;
      const response = await page.request.delete(`/api/documents/${kind}/${id}`);
      expect([204, 404]).toContain(response.status());
    }
  });
});
