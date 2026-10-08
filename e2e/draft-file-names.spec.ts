import { expect, test, type Page } from '@playwright/test';

import { myModelCopy } from './workspace';

/**
 * T737 (AC-423; R73): a draft's model file is named for its cube until it
 * lands. New cube in My workspace makes `new_cube_1.yml`; its Name changed in
 * the form and saved, the page, its address and the model tree name the file
 * for the cube, and no file of the old name is left. Renamed and saved
 * again, it follows.
 *
 * With sign-in off, the single user's workspace: beside their copy of the
 * root's `orders.yml`, as T484's New cube is made. Every name is this run's
 * own, as one name is one item across the model.
 */
async function madeInWorkspace(page: Page) {
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'New cube' })
    .click();
  const asking = page.getByRole('dialog', { name: 'New cube in My workspace' });
  await asking.getByRole('combobox', { name: 'Target folder' }).selectOption('root');
  await asking.getByRole('button', { name: 'Create' }).click();
}

test('a draft’s file follows its cube’s name when saved, and again when renamed', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const run = `${testInfo.project.name}_${Date.now().toString(36)}`;
  const first = `t737_${run}`;
  const second = `t737_${run}_again`;
  const copy = await myModelCopy(request, 'cubes/orders.yml');
  const folder = copy.folderId;
  const pathsIn = async () =>
    (
      (await (
        await request.get(`/api/model/files?folder=${encodeURIComponent(folder)}`)
      ).json()) as {
        files: { path: string }[];
      }
    ).files.map((file) => file.path);
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const saved = page
    .getByRole('status')
    .filter({ hasText: 'Saved. Previews in My workspace use it now.' });
  const rename = async (from: string, to: string) => {
    const name = page
      .getByRole('region', { name: `Cube ${from}` })
      .getByRole('tabpanel')
      .getByLabel('Name', { exact: true });
    await name.fill(to);
    await expect(page.getByRole('region', { name: `Cube ${to}` })).toBeVisible();
  };
  try {
    await page.goto(`/explore/folders/${encodeURIComponent(folder)}/models`);
    await madeInWorkspace(page);
    await expect(page).toHaveURL(/\/models\/cubes%2Fnew_cube_1\.yml$/);
    await rename('new_cube_1', first);
    await page
      .getByRole('region', { name: `Cube ${first}` })
      .getByRole('group', { name: 'Reads from' })
      .getByLabel('SQL table')
      .fill('public.orders');
    await save.click();
    await expect(saved).toBeVisible({ timeout: 60_000 });

    // The page, its address and the tree name the file for the cube.
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${encodeURIComponent(folder)}/models/cubes%2F${first}\\.yml$`),
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`cubes/${first}.yml`);
    await expect(tree.getByRole('link', { name: new RegExp(`^${first}\\.yml`) })).toBeVisible();
    await expect(tree.getByRole('link', { name: /^new_cube_1\.yml/ })).toHaveCount(0);
    expect(await pathsIn()).toContain(`cubes/${first}.yml`);
    expect(await pathsIn()).not.toContain('cubes/new_cube_1.yml');

    // Renamed and saved again: it follows.
    await rename(first, second);
    await save.click();
    await expect(page).toHaveURL(new RegExp(`/models/cubes%2F${second}\\.yml$`), {
      timeout: 60_000,
    });
    await expect(tree.getByRole('link', { name: new RegExp(`^${second}\\.yml`) })).toBeVisible();
    await expect(tree.getByRole('link', { name: new RegExp(`^${first}\\.yml`) })).toHaveCount(0);
    const now = await pathsIn();
    expect(now).toContain(`cubes/${second}.yml`);
    expect(now).not.toContain(`cubes/${first}.yml`);
  } finally {
    for (const path of [`cubes/${first}.yml`, `cubes/${second}.yml`])
      await request.delete(
        `/api/model/files?folder=${encodeURIComponent(folder)}&path=${encodeURIComponent(path)}`,
      );
  }
});
