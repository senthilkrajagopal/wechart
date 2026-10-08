import type { APIRequestContext, Page } from '@playwright/test';

import { chooseTarget, targetRow } from '../workspace';
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
const made: { sales: string; also: string; boards: Record<string, string> } = {
  sales: '',
  also: '',
  boards: {},
};

const tree = (page: Page) => page.getByRole('complementary', { name: 'Folders' }).getByRole('tree');
const myWorkspace = (page: Page) =>
  tree(page).getByRole('treeitem', { name: 'My workspace', exact: true });
async function board(request: APIRequestContext, title: string) {
  // Made in the workspace, it names the shared folder it is to go to (T345).
  const answer = await request.post('/api/documents', {
    data: { kind: 'dashboard', title, folderId: 'mine', targetFolderId: made.sales },
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
      if (who === 'super')
        for (const folder of [made.sales, made.also])
          if (folder !== '') await context.request.delete(`/api/documents/folder/${folder}`);
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('gives the sales folder its groups, and keeps a draft in its own workspace', async ({
      page,
    }) => {
      // Two folders writer may write in, so a target is theirs to choose (T345).
      for (const key of ['sales', 'also'] as const) {
        const folder = await page.request.post('/api/documents', {
          data: { kind: 'folder', title: `Workspace ${key} ${RUN}`, folderId: 'root' },
        });
        made[key] = ((await folder.json()) as { id: string }).id;
        expect(
          (
            await page.request.put(`/api/folders/${made[key]}/access`, {
              data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
            })
          ).status(),
        ).toBe(200);
      }
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

    test('names the shared folder a dashboard made there is to go to (T345, AC-282)', async ({
      page,
    }) => {
      await page.goto('/explore');
      await myWorkspace(page).getByRole('button').first().click();
      await page
        .getByTestId('explore-contents')
        .getByRole('button', { name: 'New', exact: true })
        .click();
      // Exactly: "Import a dashboard…" (T513) holds the word too.
      await page
        .getByRole('menu', { name: 'New' })
        .getByRole('menuitem', { name: 'Dashboard', exact: true })
        .click();

      const dialog = page.getByRole('dialog', { name: 'New dashboard in My workspace' });
      const picker = dialog.getByRole('tree', { name: 'Target folder' });
      // Only folders they may write in, by path: both sales folders; not the
      // root, where they have none. With two, neither is chosen for them.
      await expect(targetRow(dialog, made.sales)).toHaveText(`Workspace sales ${RUN}`);
      await expect(targetRow(dialog, made.also)).toHaveText(`Workspace also ${RUN}`);
      await expect(targetRow(dialog, 'root')).toHaveCount(0);
      await expect(picker.locator('[aria-selected="true"]')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
      await dialog.getByRole('textbox', { name: 'Name' }).fill(`targeted ${RUN}`);
      await chooseTarget(dialog, made.sales);
      await dialog.getByRole('button', { name: 'Create' }).click();

      await expect(page).toHaveURL(/\/explore\/dashboards\//);
      const id = /\/explore\/dashboards\/([^/?#]+)/.exec(page.url())![1]!;
      const stored = (await (await page.request.get(`/api/documents/dashboard/${id}`)).json()) as {
        body: { title: string; folderId: string; targetFolderId: string };
      };
      expect(stored.body.title).toBe(`targeted ${RUN}`);
      expect(stored.body.folderId).toBe('mine');
      expect(stored.body.targetFolderId).toBe(made.sales);
      expect((await page.request.delete(`/api/documents/dashboard/${id}`)).status()).toBe(204);
    });

    /**
     * T498 (AC-343; design 04 of 2026-09-27, pins 1–4 and 8): My workspace
     * first in the tree under a person, parted from Shared by a rule; a band
     * across the contents; each item's target and origin under its name, and
     * its status; no Owner; the workspace's own footnote.
     */
    test('shows My workspace as design 04 draws it: first, banded, each item where it goes', async ({
      page,
    }) => {
      // A dashboard in the sales folder, copied into the workspace.
      const shared = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: `shared board ${RUN}`, folderId: made.sales },
      });
      expect(shared.status(), await shared.text()).toBe(201);
      const sharedId = ((await shared.json()) as { id: string }).id;
      const copied = await page.request.post('/api/workspace/copies', {
        data: { kind: 'dashboard', id: sharedId, timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBe(201);
      // In a project folder of its own (T523, AC-368).
      const { id: copyId, folderId: projectId } = (await copied.json()) as {
        id: string;
        folderId: string;
      };
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: `Drafts ${RUN}`, folderId: 'mine' },
      });
      const folderId = ((await folder.json()) as { id: string }).id;

      try {
        await page.goto('/explore');
        const roots = tree(page).locator(':scope > [role="treeitem"]');
        await expect(roots.first()).toHaveAttribute('aria-label', 'My workspace');
        await expect(roots.nth(1)).toHaveAttribute('aria-label', 'Shared');
        await expect(myWorkspace(page).locator('.itemicon').first()).toHaveAttribute(
          'data-icon',
          'person',
        );
        // The rule under the workspace's branch, before Shared.
        const rule = await myWorkspace(page).evaluate((item) => {
          const after = getComputedStyle(item, '::after');
          return { height: after.height, content: after.content };
        });
        expect(rule).toEqual({ height: '1px', content: '""' });

        await myWorkspace(page).getByRole('button').first().click();
        const contents = page.getByTestId('explore-contents');
        const band = contents.getByRole('note');
        await expect(band).toHaveText('My workspace · only you can see this');
        // Across the contents column, edge to edge, 32 px.
        const [bandBox, contentsBox] = await Promise.all([
          band.boundingBox(),
          contents.boundingBox(),
        ]);
        expect(bandBox?.x).toBe(contentsBox?.x);
        expect(bandBox?.width).toBe(contentsBox?.width);
        expect(bandBox?.height).toBe(32);

        await expect(contents.getByRole('columnheader')).toHaveText([
          'Name',
          'Type',
          'Status',
          'Updated',
          'Actions',
        ]);
        const line = (id: string) =>
          contents.getByTestId(`item-${id}`).locator('.folder-contents__origin');
        await expect(line(made.boards['writer']!)).toHaveText(
          `Goes to Workspace sales ${RUN} · new`,
        );
        await expect(line(folderId)).toHaveText('0 items · folders in My workspace have no target');
        await expect(contents).toContainText(
          'Items here are private. Each goes to its target folder only when you propose it and it’s approved; you may approve your own.',
        );
        await expect(contents).not.toContainText('Charts are shared');
        // The copy, in its project folder, which its description names (T523, P1).
        const project = contents.getByTestId(`item-${projectId}`);
        await expect(project.locator('.folder-contents__description')).toHaveText(
          `Editing shared board ${RUN} from Workspace sales ${RUN}`,
        );
        await project.getByRole('button', { name: /^project-/ }).click();
        await expect(line(copyId)).toHaveText(
          `Goes to Workspace sales ${RUN} · copied from version 1`,
        );
        await expect(contents.getByTestId(`item-${copyId}`).getByRole('cell').nth(1)).toHaveText(
          'Draft',
        );

        // A shared folder is as it was: no band, Built on and Owner.
        await tree(page)
          .getByRole('treeitem', { name: `Workspace sales ${RUN}`, exact: true })
          .getByRole('button')
          .first()
          .click();
        await expect(contents.getByRole('note')).toHaveCount(0);
        await expect(contents.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
      } finally {
        await page.request.delete(`/api/documents/dashboard/${copyId}`);
        await page.request.delete(`/api/documents/folder/${projectId}`);
        await page.request.delete(`/api/documents/dashboard/${sharedId}`);
        await page.request.delete(`/api/documents/folder/${folderId}`);
      }
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
