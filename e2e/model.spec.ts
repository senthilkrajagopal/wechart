import { expect, test } from '@playwright/test';

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
  await expect(
    page
      .getByRole('region', { name: 'views/order_summary.yml' })
      .getByRole('group', { name: 'View order_summary' }),
  ).toBeVisible();
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

  // The YAML, into the form: after the 300 ms pause, inside the 500 allowed.
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
    'number_agg',
    'rank',
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
  ).toEqual(['many_to_one', 'one_to_many', 'one_to_one']);
});
