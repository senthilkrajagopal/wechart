import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { seedRootDefault } from './root-default';

/**
 * T492 (AC-350; R36, design 11 proposal 5): with sign-in on, the shared
 * models are read-only, so Generate cubes adds to My workspace's model. Its
 * pane says "in My workspace", asks the shared folder the cubes are to go to,
 * and a draft saved there changes no shared folder. Opened from a data
 * source's page or its row's ⋯ in Explore, it starts on that data source and
 * its folder (the user, 2026-10-02).
 *
 * `super`, who may write the shared root, generates from the root's
 * `default` (compose's sample database, its `generate` schema).
 */
const PATH = 'cubes/chrome_stores.yml';

/** The root's `default`, stored as an install's Job stores it (seeded again, nothing changes). */
async function rootDefault(request: APIRequestContext): Promise<string> {
  const seeded = await seedRootDefault();
  expect(seeded.code, seeded.said.join('\n')).toBe(0);
  const answer = await request.get('/api/data-sources');
  expect(answer.status()).toBe(200);
  const sources = (await answer.json()) as { id: string; name: string; folderId: string }[];
  const found = sources.find((each) => each.name === 'default' && each.folderId === 'root');
  expect(found, 'the root’s default data source').toBeDefined();
  return found!.id;
}

/** Super's workspace without the generated file, as before the test. */
const removeDraft = (request: APIRequestContext) =>
  request.delete(`/api/model/files?folder=mine&path=${encodeURIComponent(PATH)}`, {
    timeout: 90_000,
  });

test.describe.configure({ mode: 'serial' });

test.describe('generating cubes into My workspace (T492, AC-350)', () => {
  test.use({ role: 'super' });

  test.afterEach(async ({ page }) => {
    await removeDraft(page.request);
  });

  test('from the data source’s page: added as a draft to go to its folder, saved in My workspace only', async ({
    page,
  }) => {
    // Left by an earlier run, it would clash with the cube generated now.
    await removeDraft(page.request);
    const id = await rootDefault(page.request);
    await page.goto(`/explore/data-sources/${id}`);
    await page.getByRole('button', { name: 'Generate cubes…' }).click();

    // My workspace's model, the pane docked, on the data source.
    await expect(page).toHaveURL(/\/explore\/folders\/mine\/models$/);
    const pane = page.getByRole('dialog', { name: 'Generate cubes' });
    await expect(pane.locator('.source-pane__head .source-pane__where')).toHaveText(
      'in My workspace',
    );
    await expect(pane.getByRole('radio', { name: 'default PostgreSQL' })).toBeChecked();
    await pane.getByRole('radio', { name: 'generate', exact: true }).check();
    await pane.getByRole('button', { name: 'Next: Tables' }).click();
    await pane.getByRole('searchbox', { name: 'Search tables' }).fill('chrome_stores');
    const tables = pane.getByRole('table', { name: 'Tables in generate' });
    await tables.getByRole('checkbox', { name: 'chrome_stores' }).check();
    await pane.getByRole('button', { name: 'Generate 1 cube' }).click();

    // To go to the data source's folder, the shared root, chosen already.
    const tree = pane.getByRole('tree', { name: 'Target folder' });
    await expect(tree.getByRole('treeitem', { name: 'Shared' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await pane.getByRole('button', { name: 'Add 1 cube as a draft' }).click();
    await expect(pane.getByText('Added 1 cube as a draft.')).toBeVisible();
    await pane.getByRole('button', { name: `Open ${PATH}` }).click();

    // Saved in My workspace, through its overlay; no shared folder changes.
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/mine/models/${encodeURIComponent(PATH)}$`),
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved. Previews in My workspace use it now.')).toBeVisible({
      timeout: 60_000,
    });
    const paths = async (url: string) =>
      ((await (await page.request.get(url)).json()) as { files: { path: string }[] }).files.map(
        (each) => each.path,
      );
    expect(await paths('/api/model/files?folder=mine')).toContain(PATH);
    expect(await paths('/api/model/files')).not.toContain(PATH);
  });

  test('from the data source’s ⋯ in Explore', async ({ page }) => {
    await rootDefault(page.request);
    await page.goto('/explore');
    const row = page
      .getByTestId('explore-contents')
      .getByRole('row')
      .filter({ has: page.getByText('default', { exact: true }) })
      .first();
    await row.getByRole('button', { name: 'Actions for default' }).click();
    await page.getByRole('menuitem', { name: 'Generate cubes…' }).click();
    await expect(page).toHaveURL(/\/explore\/folders\/mine\/models$/);
    const pane = page.getByRole('dialog', { name: 'Generate cubes' });
    await expect(pane.getByRole('radio', { name: 'default PostgreSQL' })).toBeChecked();
  });
});
