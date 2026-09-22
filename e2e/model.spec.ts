import { expect, test } from '@playwright/test';

import { ownCubeFile } from './model-files';

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 * Fails when: a file's object is missing from the listing.
 *
 * On the real service: the files wechart seeded from the model directory
 * Cube reads (`infra/cube/model`), listed with what each defines.
 */
test('the Model workspace lists each model file with what it defines', async ({ page }) => {
  await page.goto('/model');
  await expect(page.getByRole('heading', { name: 'Model', level: 1 })).toBeVisible();

  const orders = page.getByRole('region', { name: 'cubes/orders.yml' });
  const cube = orders.getByRole('group', { name: 'Cube orders' });
  await expect(cube.getByRole('list', { name: 'Measures' })).toContainText('total_amount');
  await expect(cube.getByRole('list', { name: 'Dimensions' })).toContainText('ordered_at');
  await expect(cube.getByRole('list', { name: 'Joins' })).toContainText('customers');

  for (const file of ['cubes/customers.yml', 'cubes/products.yml']) {
    await expect(page.getByRole('region', { name: file })).toBeVisible();
  }
  // A view's members: what it includes from its cubes, by path.
  const view = page
    .getByRole('region', { name: 'views/order_summary.yml' })
    .getByRole('group', { name: 'View order_summary' });
  await expect(view.getByRole('list', { name: 'Includes' }).getByRole('listitem')).toHaveText([
    'orders.count',
    'orders.status',
  ]);
});

/**
 * T139 / AC-133: WHEN the user edits a field in the form, THE SYSTEM SHALL
 * update the YAML view within one render, and WHEN the user edits valid YAML,
 * THE SYSTEM SHALL update the form within 500 milliseconds.
 * Fails when: either view still shows the previous value after that point.
 */
test('the form and the YAML view each show what the other edits', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  const yaml = page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' });
  await expect(yaml).toContainText('sql_table: public.orders');

  // The form, into the YAML: written in the same update, so shown at once.
  await form.getByLabel('Title', { exact: true }).fill('Orders ledger');
  await expect(yaml).toContainText('title: Orders ledger', { timeout: 250 });

  // The form's edit is shown where it is: the YAML scrolled to the new line,
  // at the cube's end — the view moved, not the cursor.
  const scroller = page.locator('.yaml-editor .cm-scroller');
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  // The YAML, into the form: after the 300 ms pause, inside the 500 allowed.
  // Scrolled back up first, as a person would, so the click lands on line 3.
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('_2026');
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders_2026', {
    timeout: 500,
  });
  // And the form's own edit is still in the file, not undone by the YAML's.
  await expect(yaml).toContainText('title: Orders ledger');
});

/**
 * T140 / AC-134: IF switching from code to form would lose information, such
 * as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be
 * lost before applying the change (direction.md rule 20).
 * Fails when: comments disappear from a file with no warning.
 *
 * On the real file: the `id` dimension's `public: true` carries the comment
 * about Cube hiding primary keys. Clearing Public removes the key, and the
 * comment with it.
 */
test('a form edit that would drop a comment names it first, and waits to be told', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  const yaml = page.locator('.yaml-editor .cm-scroller');
  const comment = '# Cube hides primary keys from metadata unless told otherwise.';
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  await form.locator('.model-member__name', { hasText: /^id$/ }).click();
  const publicField = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^id$/ }) })
    .locator('[data-key="public"]')
    .getByLabel('Public', { exact: true });
  await expect(publicField).toHaveValue('true');

  // Warned, and nothing applied yet: the comment is still in the file.
  await publicField.selectOption('');
  const warning = page.getByRole('alert').filter({ hasText: 'This edit would drop' });
  await expect(warning).toContainText(
    // Named by its first line, of four.
    'This edit would drop the comment “Cube hides primary keys from metadata unless told otherwise. This one …”.',
  );
  await expect(yaml).toContainText(comment);
  await expect(publicField).toHaveValue('true');
  await expect(publicField).toBeDisabled();
  // The focus is on the choice that loses nothing, not lost with the locked field.
  await expect(warning.getByRole('button', { name: 'Keep the file' })).toBeFocused();

  // Kept: the file as it was, and the form free again.
  await warning.getByRole('button', { name: 'Keep the file' }).click();
  await expect(warning).toHaveCount(0);
  await expect(yaml).toContainText(comment);
  await expect(publicField).toBeEnabled();

  // Applied anyway: the key and its comment go.
  await publicField.selectOption('');
  await page.getByRole('alert').getByRole('button', { name: 'Apply anyway' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This edit would drop' })).toHaveCount(0);
  await expect(publicField).toHaveValue('');
  await yaml.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(yaml).not.toContainText('Cube hides primary keys');
});

/**
 * T142 / AC-136: WHEN the user saves model changes, THE SYSTEM SHALL
 * validate them against Cube before publishing and refuse to publish a model
 * Cube rejects, showing Cube's error per file.
 * Fails when: an invalid model is published, or the error is not attributed
 * to a file.
 *
 * On the real Cube, reading this API's model store through infra/cube/cube.js:
 * the change is compiled by Cube as a draft, and goes live only if it compiles.
 */
test('a model change Cube refuses is not published, and Cube’s reason is on its file', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  const save = page.getByRole('button', { name: 'Save & reload Cube' });
  await expect(save).toBeDisabled();

  // A measure whose SQL names a member there is none of.
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.getByRole('button', { name: 'Add measure' }).click();
  await form.locator('.model-member__name', { hasText: /^measure_1$/ }).click();
  const measure = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^measure_1$/ }) });
  const own = (key: string) =>
    measure.locator(`.model-member > .model-form__fields > [data-key="${key}"]`);
  await own('type').getByLabel('Type', { exact: true }).selectOption('number');
  await own('sql').getByLabel('SQL', { exact: true }).fill('{no_such_member}');

  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cube refused the model' })).toBeVisible();
  const problem = page
    .getByRole('region', { name: 'Problems' })
    .getByRole('listitem')
    .filter({ hasText: 'Cube: no_such_member is not defined' });
  await expect(problem.locator('.model-problems__where')).toHaveText('cubes/orders.yml');

  // Nothing published: the stored file, and the model Cube serves, as they were.
  const stored = await page.request.get('/api/model/files');
  const orders = (
    (await stored.json()) as { files: { path: string; content: string }[] }
  ).files.find((file) => file.path === 'cubes/orders.yml');
  expect(orders?.content).not.toContain('measure_1');
  const meta = (await (await page.request.get('/api/meta')).json()) as {
    cubes: { name: string; measures: { name: string }[] }[];
  };
  expect(
    meta.cubes.find((cube) => cube.name === 'orders')?.measures.map((each) => each.name),
  ).not.toContain('orders.measure_1');
});

test('a model change Cube compiles is published, and Cube serves it', async ({
  page,
}, testInfo) => {
  // On a cube file of this browser's own: the browsers publish at once.
  const cube = `e2e_described_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  const description = `Every product the shop sells, as ${testInfo.project.name} saw it.`;
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  await form.getByLabel('Description', { exact: true }).fill(description);

  await page.getByRole('button', { name: 'Save & reload Cube' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toHaveText(
    'Published. Cube is reading the new model.',
  );
  await expect(page.getByRole('button', { name: 'Save & reload Cube' })).toBeDisabled();
  const stored = (await (await page.request.get('/api/model/files')).json()) as {
    files: { path: string; content: string }[];
  };
  expect(stored.files.find((file) => file.path === path)?.content).toContain(
    `description: ${description}`,
  );
  const meta = (await (await page.request.get('/api/meta')).json()) as {
    cubes: { name: string; description?: string }[];
  };
  expect(meta.cubes.find((each) => each.name === cube)?.description).toBe(description);
});

/**
 * T141 / AC-135: IF the YAML fails to parse, THEN THE SYSTEM SHALL name the
 * file and line in a problems list and keep the form read-only until it
 * parses (direction.md rule 28).
 * Fails when: the form stays editable on unparseable YAML, or the problem
 * names no line.
 */
test('YAML that does not parse is listed by file and line, and holds the form read-only', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  const problems = page.getByRole('region', { name: 'Problems' });
  const title = form.getByLabel('Title', { exact: true });
  await expect(problems).toContainText('No problems in cubes/orders.yml');
  await expect(title).toBeEditable();

  // Line 3 of the seeded file: `sql_table: public.orders`, made a nested mapping.
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(': x');

  const problem = problems.getByRole('listitem');
  await expect(problem).toHaveCount(1);
  await expect(problem.locator('.model-problems__where')).toHaveText('cubes/orders.yml:3');
  await expect(problem).toContainText('Nested mappings are not allowed in compact mappings');
  await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toContainText('line 3');
  // Every field locked, not only the one shown: a member's too.
  await expect(title).toBeDisabled();
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.locator('.model-member__name', { hasText: /^total_amount$/ }).click();
  await expect(
    form.getByRole('tabpanel').locator('input, select, textarea').first(),
  ).toBeDisabled();
  expect(
    await form
      .getByRole('tabpanel')
      .locator('input:enabled, select:enabled, textarea:enabled')
      .count(),
  ).toBe(0);
  // The editor marks it where it is: the one mark is on line 3.
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  await expect(
    page
      .locator('.cm-line', { hasText: 'sql_table: public.orders: x' })
      .locator('.cm-lintRange-error'),
  ).toHaveCount(1);

  // Picking the problem puts the cursor on its line — from another line, so
  // the mend below lands only if it did — and mending it frees the form.
  await page.locator('.cm-line', { hasText: 'description: One row' }).click();
  await problem.getByRole('button').click();
  await page.keyboard.press('End');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await expect(problems).toContainText('No problems in cubes/orders.yml');
  await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toHaveCount(0);
  await form.getByRole('tab', { name: 'General' }).click();
  await expect(title).toBeEditable();
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders');
});

test('typing that never pauses still reaches the form within 500 ms', async ({ page }) => {
  // T139's review: a pause-only wait held the form as long as the typing went on.
  await page.goto('/model/files/cubes%2Forders.yml');
  const table = page
    .getByRole('region', { name: 'Cube orders' })
    .getByLabel('SQL table', { exact: true });
  await expect(table).toHaveValue('public.orders');
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');

  // A key every 150 ms for 1.5 s, each under the 300 ms pause; every text parses.
  const typing = page.keyboard.type('_abcdefghij', { delay: 150 });
  await expect(table).toHaveValue(/^public\.orders_/, { timeout: 500 });
  await typing;
});

test('an entry typed as far as its dash is waited for, not a crash', async ({ page }) => {
  // T139's review: `- ` parses as null, and the form read it as an object.
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await page.locator('.cm-line', { hasText: /^\s+measures:$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- ');

  // The pause passes, and the page still stands: the null is a member with no keys yet.
  await expect(
    form.getByRole('list', { name: 'Measures' }).locator('.model-member__name'),
  ).toContainText(['Measure 1']);
  await expect(page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' })).toBeVisible();
});

/**
 * T138 / AC-132: THE SYSTEM SHALL offer a form for every key Cube's validator
 * accepts on a cube or a view, with enumerations offering exactly the
 * validator's allowed values.
 * Fails when: a key the validator accepts has no form field, or an
 * enumeration offers a value the validator rejects.
 *
 * `form/schema.test.ts` holds every key to the research's inventory; here,
 * the real file opened on its form.
 */
test('a model file opens on a form for its cube, its enumerations the validator’s own', async ({
  page,
}) => {
  await page.goto('/model');
  await page.getByRole('link', { name: 'cubes/orders.yml' }).click();
  await expect(page.getByTestId('selected-object')).toHaveText('cubes/orders.yml');

  const form = page.getByRole('region', { name: 'Cube orders' });
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders');
  await expect(form.getByRole('group', { name: 'Refresh key' })).toBeVisible();

  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.locator('.model-member__name', { hasText: /^total_amount$/ }).click();
  const measure = form.getByRole('listitem').filter({ hasText: 'total_amount' });
  const type = measure.locator('[data-key="type"]').first().getByLabel('Type', { exact: true });
  await expect(type).toHaveValue('sum');
  expect(
    (await type.locator('option').allTextContents()).filter((option) => option !== '(not set)'),
  ).toEqual([
    'count',
    'number',
    'string',
    'boolean',
    'time',
    'sum',
    'avg',
    'min',
    'max',
    'count_distinct',
    'count_distinct_approx',
    // Not `number_agg` or `rank`: Joi takes those only on a multi-stage
    // measure (research §Y.17), and total_amount is not one.
  ]);
  await expect(measure.locator('[data-key="format"]').getByRole('textbox')).toHaveValue('currency');

  await form.getByRole('tab', { name: /^Joins/ }).click();
  await form.locator('.model-member__name', { hasText: /^customers$/ }).click();
  const relationship = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^customers$/ }) })
    .getByLabel('Relationship', { exact: true });
  await expect(relationship).toHaveValue('many_to_one');
  expect(
    (await relationship.locator('option').allTextContents()).filter((o) => o !== '(not set)'),
  ).toEqual([
    'many_to_one',
    'one_to_many',
    'one_to_one',
    // Also accepted by the validator (research Y.5), offered apart.
    'belongs_to',
    'has_many',
    'has_one',
    'manyToOne',
    'oneToMany',
    'oneToOne',
    'belongsTo',
    'hasMany',
    'hasOne',
  ]);
});
