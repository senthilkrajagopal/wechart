import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T330: a folder's Access panel (AC-259, AC-260; direction.md rules 62–66).
 *
 * Folders are made through the API as `super`, each run with its own names:
 * P grants read-write to `sales-rw` (writer's group) and read-only to
 * `sales-ro` (reader's); C beneath it sets nothing; L at the root reaches no
 * one. Every folder is removed again after.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

async function folder(request: APIRequestContext, title: string, parent: string): Promise<string> {
  const response = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  made.unshift(id);
  return id;
}

async function setAccess(
  request: APIRequestContext,
  id: string,
  setting: { readOnly?: string[] | null; readWrite?: string[] | null },
) {
  expect((await request.put(`/api/folders/${id}/access`, { data: setting })).status()).toBe(200);
}

const ids = { p: '', c: '', lone: '' };

test.describe.configure({ mode: 'serial' });

test.describe('as a Super-Admin', () => {
  test.use({ role: 'super' });

  test('makes the folders', async ({ page }) => {
    ids.p = await folder(page.request, `Access P ${RUN}`, 'root');
    ids.c = await folder(page.request, `Access C ${RUN}`, ids.p);
    ids.lone = await folder(page.request, `Access L ${RUN}`, 'root');
    await setAccess(page.request, ids.p, { readWrite: ['sales-rw'], readOnly: ['sales-ro'] });
  });

  test('shows inherited groups locked with their source, and an unset list’s inheritance', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.c}`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Folder access' });
    const readWrite = panel.getByRole('region', { name: 'Read-write groups' });
    const readOnly = panel.getByRole('region', { name: 'Read-only groups' });
    await expect(readWrite).toBeVisible();

    // Read-write before read-only (rule 62).
    const [rwBox, roBox] = await Promise.all([readWrite.boundingBox(), readOnly.boundingBox()]);
    expect(rwBox!.y).toBeLessThan(roBox!.y);
    await expect(readWrite.getByText(`Not set here. Inherits from Access P ${RUN}.`)).toBeVisible();
    const inherited = readWrite.getByRole('listitem', { name: /sales-rw/ });
    await expect(inherited.getByRole('img', { name: 'Inherited' })).toBeVisible();
    await expect(inherited.getByRole('button', { name: /remove/i })).toHaveCount(0);

    // The source folder is a link to it.
    await inherited.getByRole('button', { name: `Access P ${RUN}` }).click();
    await expect(page).toHaveURL(new RegExp(`folder=${ids.p}`));
  });

  test('adds a group through the AD group picker, counting it on Save, and keeps it', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.c}`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Folder access' });
    await panel.getByLabel('AD group').fill(`c-viewers-${RUN}`);
    await panel.getByLabel('Access', { exact: true }).selectOption('Read-only');
    await panel.getByRole('button', { name: 'Add' }).click();
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    await expect(panel.getByText('Access saved.')).toBeVisible();

    const stored = (await (await page.request.get(`/api/folders/${ids.c}/access`)).json()) as {
      setting: unknown;
    };
    expect(stored.setting).toEqual({ readOnly: [`c-viewers-${RUN}`], readWrite: null });
  });

  test('says when only Super-Admins can see a folder, in its header and its panel', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.lone}`);
    await expect(
      page.getByTestId('explore-contents').getByText('Only Super-Admins can see this folder'),
    ).toBeVisible();
    const button = page.getByRole('button', { name: 'Access', exact: true });
    await button.click();
    const panel = page.getByRole('complementary', { name: 'Folder access' });
    await expect(panel.getByText('Only Super-Admins can see this folder')).toBeVisible();

    // Closing it puts focus back on the button that opened it.
    await expect(button).toHaveAttribute('aria-controls', (await panel.getAttribute('id'))!);
    await panel.getByRole('button', { name: 'Close folder access' }).click();
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('as a read-write member', () => {
  test.use({ role: 'writer' });

  test('asks before a save that removes their own read-write access, and keeps it when told', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.p}`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Folder access' });
    await panel
      .getByRole('region', { name: 'Read-write groups' })
      .getByRole('button', { name: 'Remove sales-rw' })
      .click();
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    const asking = panel.getByRole('alertdialog');
    await expect(asking).toContainText('remove your own read-write access');
    await asking.getByRole('button', { name: 'Keep my access' }).click();

    const stored = (await (await page.request.get(`/api/folders/${ids.p}/access`)).json()) as {
      setting: { readWrite: unknown };
    };
    expect(stored.setting.readWrite).toEqual(['sales-rw']);
  });

  test('sets the groups of a subfolder they make, read-write and read-only', async ({ page }) => {
    const sub = await folder(page.request, `Access S ${RUN}`, ids.p);
    await page.goto(`/explore?folder=${sub}`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Folder access' });
    for (const [group, level] of [
      [`s-writers-${RUN}`, 'Read-write'],
      [`s-readers-${RUN}`, 'Read-only'],
      [`s-auditors-${RUN}`, 'Read-only'],
    ] as const) {
      await panel.getByLabel('AD group').fill(group);
      await panel.getByLabel('Access', { exact: true }).selectOption(level);
      await panel.getByRole('button', { name: 'Add' }).click();
    }
    await panel.getByRole('button', { name: 'Save 3 changes' }).click();
    await expect(panel.getByText('Access saved.')).toBeVisible();

    const stored = (await (await page.request.get(`/api/folders/${sub}/access`)).json()) as {
      setting: unknown;
    };
    expect(stored.setting).toEqual({
      readOnly: [`s-readers-${RUN}`, `s-auditors-${RUN}`],
      readWrite: [`s-writers-${RUN}`],
    });
  });
});

test.describe('as a read-only member', () => {
  test.use({ role: 'reader' });

  test('has no Access button', async ({ page }) => {
    // Once the API has refused them the folder's groups, not before it answers.
    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/api/folders/${ids.p}/access`),
    );
    await page.goto(`/explore?folder=${ids.p}`);
    expect((await refused).status()).toBe(403);
    await expect(page.getByRole('heading', { name: `Access P ${RUN}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Access', exact: true })).toHaveCount(0);
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes the folders', async ({ page }: { page: Page }) => {
    for (const id of made) {
      const response = await page.request.delete(`/api/documents/folder/${id}`);
      expect([204, 404]).toContain(response.status());
    }
  });
});
