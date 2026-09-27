import type { APIRequestContext, Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T343 (AC-276, AC-277): every Super-Admin and read-write member has a
 * private workspace, "My workspace" in the folder tree, which no one else
 * sees anything of, Super-Admins included; a user with read-only access
 * everywhere has none.
 *
 * `writer` (group `sales-rw`) is a read-write member of a folder made here,
 * `reader` (`sales-ro`) reads it, `super` is a Super-Admin.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const made: { sales: string; boards: Record<string, string> } = { sales: '', boards: {} };

const tree = (page: Page) => page.getByRole('complementary', { name: 'Folders' }).getByRole('tree');
const myWorkspace = (page: Page) =>
  tree(page).getByRole('treeitem', { name: 'My workspace', exact: true });
async function board(request: APIRequestContext, title: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'dashboard', title, folderId: 'mine' },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

test.describe.configure({ mode: 'serial' });

test.describe('each author’s own workspace (T343, AC-276, AC-277)', () => {
  // Each one's draft removed by its owner, who alone can; then the folder.
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const id = made.boards[who];
      if (id !== undefined) await context.request.delete(`/api/documents/dashboard/${id}`);
      if (who === 'super' && made.sales !== '')
        await context.request.delete(`/api/documents/folder/${made.sales}`);
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('gives the sales folder its groups, and keeps a draft in its own workspace', async ({
      page,
    }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `Workspace sales ${RUN}`, folderId: 'root' },
      });
      made.sales = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await page.request.put(`/api/folders/${made.sales}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      made.boards['super'] = await board(page.request, `super draft ${RUN}`);
    });
  });

  test.describe('as writer, a read-write member', () => {
    test.use({ role: 'writer' });

    test('has My workspace in the tree, holding their draft and none of super’s', async ({
      page,
    }) => {
      made.boards['writer'] = await board(page.request, `writer draft ${RUN}`);
      await page.goto('/explore');
      await expect(myWorkspace(page)).toHaveAttribute('aria-level', '1');
      await myWorkspace(page).getByRole('button').first().click();
      const main = page.getByRole('main');
      await expect(main.getByTestId(`item-${made.boards['writer']}`)).toBeVisible();
      await expect(main).not.toContainText(`super draft ${RUN}`);
      // Nor opened by its address: it isn't there for them.
      const opened = await page.request.get(`/api/documents/dashboard/${made.boards['super']!}`);
      expect(opened.status()).toBe(404);
    });
  });

  test.describe('as super, again', () => {
    test.use({ role: 'super' });

    test('sees their own workspace, and nothing of writer’s: a Super-Admin too', async ({
      page,
    }) => {
      await page.goto('/explore');
      await myWorkspace(page).getByRole('button').first().click();
      const main = page.getByRole('main');
      await expect(main.getByTestId(`item-${made.boards['super']}`)).toBeVisible();
      await expect(main).not.toContainText(`writer draft ${RUN}`);
      const search = await page.request.get(`/api/search?q=writer%20draft%20${RUN}`);
      expect(await search.json()).toEqual([]);
    });
  });

  test.describe('as reader, read-only everywhere', () => {
    test.use({ role: 'reader' });

    test('has no My workspace in the tree', async ({ page }) => {
      // Once the roots' counts are in, which say whether they have a workspace.
      const counted = page.waitForResponse((answer) => answer.url().includes('/api/folder-roots'));
      await page.goto('/explore');
      expect(await (await counted).json()).not.toHaveProperty('mine');
      await expect(tree(page).getByRole('treeitem', { name: 'Shared', exact: true })).toBeVisible();
      await expect(myWorkspace(page)).toHaveCount(0);
    });
  });
});
