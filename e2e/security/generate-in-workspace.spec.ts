import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
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

  /**
   * T724 (AC-249, AC-424): a generated cube whose name has landed is refused,
   * said only as in use. In the pane, against the folder it goes to, with no
   * way to its holder's file; and on Save, against a folder the pane doesn't
   * read, with nothing saved.
   */
  test('a landed name is said only as in use, in the pane and on Save', async ({ page }) => {
    test.setTimeout(240_000);
    const request = page.request;
    await removeDraft(request);
    const id = await rootDefault(request);
    const run = `gw${Math.random().toString(36).slice(2, 7)}`;
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Stores ${run}`, folderId: 'root' },
    });
    expect(made.status(), await made.text()).toBe(201);
    const holder = ((await made.json()) as { id: string }).id;
    const held = {
      path: `cubes/stores_${run}.yml`,
      content:
        'cubes:\n  - name: chrome_stores\n    sql_table: generate.chrome_stores\n\n    measures:\n      - name: count\n        type: count\n',
    };
    try {
      expect(await landed(request, holder, [held])).toEqual([held]);

      await page.goto(`/explore/data-sources/${id}`);
      await page.getByRole('button', { name: 'Generate cubes…' }).click();
      const pane = page.getByRole('dialog', { name: 'Generate cubes' });
      await pane.getByRole('radio', { name: 'generate', exact: true }).check();
      await pane.getByRole('button', { name: 'Next: Tables' }).click();
      await pane.getByRole('searchbox', { name: 'Search tables' }).fill('chrome_stores');
      await pane
        .getByRole('table', { name: 'Tables in generate' })
        .getByRole('checkbox', { name: 'chrome_stores' })
        .check();
      await pane.getByRole('button', { name: 'Generate 1 cube' }).click();

      // To the folder that holds it: marked as in use, and nothing of where.
      const tree = pane.getByRole('tree', { name: 'Target folder' });
      await tree.getByRole('treeitem', { name: `Stores ${run}` }).click();
      const stores = pane.getByRole('region', { name: PATH });
      await expect(stores.locator('.generate-pane__status')).toHaveText('Clashes');
      await expect(
        stores.locator('.generate-pane__file-body > .generate-pane__note.is-err p'),
      ).toHaveText(['The name “chrome_stores” is already in use.']);
      await expect(stores.getByRole('link', { name: /^Open / })).toHaveCount(0);
      await expect(stores).not.toContainText(held.path);

      // To the shared root, whose files don't hold it: added, then refused on Save.
      await tree.getByRole('treeitem', { name: 'Shared' }).click();
      await expect(stores.locator('.generate-pane__status')).not.toHaveText('Clashes');
      await pane.getByRole('button', { name: 'Add 1 cube as a draft' }).click();
      await pane.getByRole('button', { name: `Open ${PATH}` }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'already in use' })).toHaveText(
        'The name “chrome_stores” is already in use, so nothing was saved.',
        { timeout: 60_000 },
      );
      const paths = (
        (await (await request.get('/api/model/files?folder=mine')).json()) as {
          files: { path: string }[];
        }
      ).files.map((each) => each.path);
      expect(paths).not.toContain(PATH);
    } finally {
      await request.delete(
        `/api/model/files?folder=${encodeURIComponent(holder)}&path=${encodeURIComponent(held.path)}`,
        { timeout: 90_000 },
      );
      await request.delete(`/api/documents/folder/${holder}`);
    }
  });

  /**
   * T734 (AC-249; R73): tables whose names break the grammar
   * (`generate."2026_orders"`, a leading digit, which joins `generate."class"`,
   * a reserved word; infra/sample-db/generate.sql) are generated as
   * `t_2026_orders` and `t_class`, the join rewritten to the suggested name.
   * Added as drafts, a name is edited in the model editor before any save,
   * and checked as any draft's is. Nothing is saved, so nothing is shared
   * between browser projects.
   */
  test('suggests names in the grammar, rewrites the join, and the name is edited before saving', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const id = await rootDefault(page.request);
    await page.goto(`/explore/data-sources/${id}`);
    await page.getByRole('button', { name: 'Generate cubes…' }).click();
    const pane = page.getByRole('dialog', { name: 'Generate cubes' });
    await pane.getByRole('radio', { name: 'generate', exact: true }).check();
    await pane.getByRole('button', { name: 'Next: Tables' }).click();
    const tables = pane.getByRole('table', { name: 'Tables in generate' });
    const search = pane.getByRole('searchbox', { name: 'Search tables' });
    for (const table of ['2026_orders', 'class']) {
      await search.fill(table);
      await tables.getByRole('checkbox', { name: table, exact: true }).check();
    }
    await pane.getByRole('button', { name: 'Generate 2 cubes' }).click();

    // Each under its suggested name and file; the orders cube's join to it renamed.
    const orders = pane.getByRole('region', { name: 'cubes/t_2026_orders.yml' });
    const classes = pane.getByRole('region', { name: 'cubes/t_class.yml' });
    await expect(orders.locator('.generate-pane__status')).toHaveText('Ready');
    await expect(classes.locator('.generate-pane__status')).toHaveText('Ready');
    const details = orders.locator(':scope > details');
    if ((await details.getAttribute('open')) === null)
      await details.locator(':scope > summary').click();
    await orders.locator('.generate-pane__yaml > summary').click();
    const yaml = orders.getByRole('textbox', { name: /, as generated$/ });
    await yaml.scrollIntoViewIfNeeded();
    await expect(yaml).toContainText('name: t_2026_orders');
    await expect(yaml).toContainText('- name: t_class');
    await expect(yaml).toContainText('{t_class');
    await expect(yaml).not.toContainText('{class');

    // To the shared root, as drafts in My workspace: the class cube opened.
    await pane
      .getByRole('tree', { name: 'Target folder' })
      .getByRole('treeitem', { name: 'Shared' })
      .click();
    await pane.getByRole('button', { name: 'Add 2 cubes as drafts' }).click();
    await pane.getByRole('button', { name: 'Open cubes/t_class.yml' }).click();
    const name = page
      .getByRole('region', { name: 'Cube t_class' })
      .getByRole('tabpanel')
      .getByLabel('Name', { exact: true });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    const problems = page.getByRole('region', { name: 'Problems' });
    const code = page.getByRole('textbox', { name: 'cubes/t_class.yml, as YAML' });

    // Edited outside the grammar: said, and Save held.
    await name.fill('Class__2');
    await expect(problems.getByRole('listitem')).toContainText([
      'Cube Class__2: “Class__2” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.',
    ]);
    await expect(save).toBeDisabled();

    // Edited to a free name in the grammar: taken in its code, and Save offered.
    const own = `classes_${test.info().project.name}`;
    await page
      .getByRole('region', { name: 'Cube Class__2' })
      .getByRole('tabpanel')
      .getByLabel('Name', { exact: true })
      .fill(own);
    await expect(code).toContainText(`name: ${own}`);
    await expect(problems).not.toContainText('isn’t a name');
    await expect(save).toBeEnabled();
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
