import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { inMyWorkspace } from './model-files';
import { myModelCopy } from './workspace';

/**
 * With sign-in off, the single user changes a model in My workspace, as a
 * Super-Admin does (T451's switch; AC-254, R52): there, a change is unsaved
 * until saved, and nothing is published.
 */
const seed = (path: string) =>
  readFileSync(new URL(`../infra/cube/model/${path}`, import.meta.url), 'utf8');

/**
 * Two files of this browser's own in a project folder of My workspace, to go
 * to the root: the seed's orders and customers cubes, renamed and line for
 * line otherwise. The tree leaves one for the other in a folder.
 */
async function ownPair(page: Page, tag: string) {
  const [orders, customers] = [`e2e_${tag}_orders`, `e2e_${tag}_customers`];
  const held = await inMyWorkspace(page.request, 'root', [
    {
      path: `cubes/${orders}.yml`,
      content: seed('cubes/orders.yml').replace('  - name: orders\n', `  - name: ${orders}\n`),
    },
    {
      path: `cubes/${customers}.yml`,
      content: seed('cubes/customers.yml').replace(
        '  - name: customers\n',
        `  - name: ${customers}\n`,
      ),
    },
  ]);
  return {
    orders,
    customers,
    folder: encodeURIComponent(held.folderOf(`cubes/${orders}.yml`)),
    drop: held.drop,
  };
}

/** Whether the page would have the browser ask before it unloads — a reload, a closed tab. */
const asksBeforeUnload = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

/**
 * T237 / AC-227: WHEN the model's code parses, THE SYSTEM SHALL list in
 * Problems, with the line, every value outside the set Cube's validator
 * allows and every required key that is missing, before the user publishes
 * (direction.md rule 26).
 * `Fails when: a measure of type "summ" leaves Problems empty.`
 *
 * T237 / AC-226: WHEN a model file has changes not yet published, THE SYSTEM
 * SHALL say so in the editor's header and on the file's row in the tree, offer
 * Discard, and ask before leaving the file with them unpublished.
 * `Fails when: an edit shows no unpublished marker, or leaving the file loses
 * it without asking.`
 *
 * In My workspace (T451's switch), on a pair of this browser's own files, and
 * nothing saved: each browser's edits stay in its own page.
 */
test('a value Cube would refuse is a problem at its line, and an unpublished edit is marked, discardable and asked about', async ({
  page,
}, testInfo) => {
  const own = await ownPair(page, `unsaved_${testInfo.project.name}`);
  try {
    await unsavedEdits(page, own);
  } finally {
    await own.drop();
  }
});

/** AC-227 and AC-226 in `own`'s folder of My workspace. */
async function unsavedEdits(
  page: Page,
  own: { readonly orders: string; readonly customers: string; readonly folder: string },
) {
  const at = (cube: string) =>
    new RegExp(`/explore/folders/${own.folder}/models/cubes%2F${cube}\\.yml$`);
  await page.goto(`/explore/folders/${own.folder}/models/cubes%2F${own.orders}.yml`);
  const head = page.getByRole('region', { name: 'Form editor' }).locator('.model-editor__head');
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const row = tree.getByRole('link', { name: new RegExp(`^${own.orders}\\.yml`) });
  const otherRow = tree.getByRole('link', { name: new RegExp(`^${own.customers}\\.yml`) });
  const problems = page.getByRole('region', { name: 'Problems' });
  const yaml = page.getByRole('textbox', { name: `cubes/${own.orders}.yml, as YAML` });
  const title = page.getByRole('region', { name: `Cube ${own.orders}` }).getByLabel('Title', {
    exact: true,
  });
  await expect(problems).toContainText(`No problems in cubes/${own.orders}.yml`);
  await expect(head).not.toContainText('Unsaved changes');
  await expect(row).not.toContainText('unpublished');
  // Shown at rest but not to be pressed, as design 03 draws it (T479, D2).
  await expect(head.getByRole('button', { name: 'Discard' })).toBeDisabled();
  expect(await asksBeforeUnload(page)).toBe(false);

  // AC-227: `type: sum` made `summ` on line 36 — it parses; Cube would refuse it.
  await page.locator('.cm-line', { hasText: /^\s*type: sum$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('m');
  const problem = problems.getByRole('listitem');
  await expect(problem).toHaveCount(1);
  await expect(problem.locator('.model-problems__where')).toHaveText(`cubes/${own.orders}.yml:36`);
  await expect(problem).toContainText(
    'Measure total_amount: type "summ" is not one Cube accepts (count, number,',
  );
  await expect(
    page.locator('.cm-line', { hasText: 'type: summ' }).locator('.cm-lintRange-error'),
  ).toHaveCount(1);
  // Not a parse error: the form stays open to put it right, and the file
  // marked in the tree; listed, not enforced — Cube has the last word (AC-136).
  await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toHaveCount(0);
  await expect(title).toBeEditable();
  await expect(row).toContainText('problems');
  await expect(head.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

  // AC-226: said in the head and on the file's row.
  await expect(head).toContainText('Unsaved changes');
  await expect(row).toContainText('unpublished');

  // Leaving asks first; staying keeps the edit where it was.
  await otherRow.click();
  const ask = page.getByRole('alertdialog', { name: 'Leave with unpublished changes?' });
  await expect(ask).toContainText(`cubes/${own.orders}.yml`);
  await expect(ask.getByRole('button', { name: 'Stay' })).toBeFocused();
  await expect(page).toHaveURL(at(own.orders));
  await ask.getByRole('button', { name: 'Stay' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page).toHaveURL(at(own.orders));
  await expect(yaml).toContainText('type: summ');
  // A reload or a closed tab: the browser's own question.
  expect(await asksBeforeUnload(page)).toBe(true);

  // Discard: the file as saved, nothing left to mark or ask about.
  await head.getByRole('button', { name: 'Discard' }).click();
  await expect(yaml).not.toContainText('summ');
  await expect(yaml).toContainText('type: sum');
  await expect(problems).toContainText(`No problems in cubes/${own.orders}.yml`);
  await expect(head).not.toContainText('Unsaved changes');
  await expect(row).not.toContainText('unpublished');
  await expect(head.getByRole('button', { name: 'Discard' })).toBeDisabled();
  expect(await asksBeforeUnload(page)).toBe(false);
  await otherRow.click();
  await expect(page).toHaveURL(at(own.customers));
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  // A form edit counts as well; told to leave, the page goes, and the file
  // opens again as it was saved.
  const customers = page.getByRole('region', { name: `Cube ${own.customers}` });
  await customers.getByLabel('Title', { exact: true }).fill('Clients');
  await expect(otherRow).toContainText('unpublished');
  await row.click();
  await ask.getByRole('button', { name: 'Leave without publishing' }).click();
  await expect(page).toHaveURL(at(own.orders));
  await otherRow.click();
  const customersYaml = page.getByRole('textbox', { name: `cubes/${own.customers}.yml, as YAML` });
  await expect(customersYaml).toContainText(`name: ${own.customers}`);
  await expect(customersYaml).not.toContainText('Clients');
  await expect(otherRow).not.toContainText('unpublished');
}

test('staying makes no new file and puts the focus back; a new file, discarded, goes', async ({
  page,
}, testInfo) => {
  const own = await ownPair(page, `staying_${testInfo.project.name}`);
  try {
    await stayingAndNew(page, own);
  } finally {
    await own.drop();
  }
});

/** Staying, Escape, and a new file discarded, in `own`'s folder of My workspace. */
async function stayingAndNew(
  page: Page,
  own: { readonly orders: string; readonly customers: string; readonly folder: string },
) {
  const opened = `/explore/folders/${own.folder}/models/cubes%2F${own.orders}.yml`;
  await page.goto(opened);
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const ask = page.getByRole('alertdialog', { name: 'Leave with unpublished changes?' });
  const title = page.getByRole('region', { name: `Cube ${own.orders}` }).getByLabel('Title', {
    exact: true,
  });
  await title.fill('Orders ledger');

  // New cube with the edit unsaved: asked where it goes (T347), then asked
  // about the edit; staying makes no file.
  // From the keyboard: Safari gives a clicked button no focus to go back to.
  const newCube = tree.getByRole('button', { name: 'New cube' });
  const asking = page.getByRole('dialog', { name: 'New cube in My workspace' });
  await newCube.focus();
  await page.keyboard.press('Enter');
  await asking.getByRole('combobox', { name: 'Target folder' }).selectOption('root');
  await asking.getByRole('button', { name: 'Create' }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Stay' }).click();
  await expect(ask).toHaveCount(0);
  await expect(newCube).toBeFocused();
  await expect(tree.getByRole('link', { name: /^new_cube_\d+\.yml/ })).toHaveCount(0);
  await expect(page).toHaveURL(opened);

  // Escape stays too, the focus back on what was pressed.
  const customers = tree.getByRole('link', { name: new RegExp(`^${own.customers}\\.yml`) });
  await customers.focus();
  await page.keyboard.press('Enter');
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(customers).toBeFocused();
  await expect(title).toHaveValue('Orders ledger');

  // Discarded, then a new cube: made, and itself discarded — it goes.
  await page
    .getByRole('region', { name: 'Form editor' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await newCube.click();
  await asking.getByRole('combobox', { name: 'Target folder' }).selectOption('root');
  await asking.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/explore/folders/${own.folder}/models/cubes%2Fnew_cube_1\\.yml$`),
  );
  const made = tree.getByRole('link', { name: /^new_cube_1\.yml/ });
  await expect(made).toContainText('unpublished');
  await page
    .getByRole('region', { name: 'Form editor' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/explore/folders/${own.folder}/models$`));
  await expect(made).toHaveCount(0);
}

test('a missing required key is a problem at the member it belongs to', async ({ page }) => {
  // In the single user's copy of orders.yml in My workspace, edited, never
  // saved (T451's switch).
  await page.goto((await myModelCopy(page.request, 'cubes/orders.yml')).href);
  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems).toContainText('No problems in cubes/orders.yml');
  // Line 36's `type: sum` taken away: total_amount, from line 34, has no type.
  await page.locator('.cm-line', { hasText: /^\s*type: sum$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  const problem = problems.getByRole('listitem');
  await expect(problem).toHaveCount(1);
  await expect(problem.locator('.model-problems__where')).toHaveText('cubes/orders.yml:34');
  await expect(problem).toContainText('Measure total_amount: "type" is required.');
});
