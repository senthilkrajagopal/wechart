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
test('a model file opens on a form for its cube, its enumerations the validator’s own', async ({
  page,
}) => {
  await page.goto('/model');
  await page.getByRole('link', { name: 'cubes/orders.yml' }).click();
  await expect(page.getByTestId('selected-object')).toHaveText('cubes/orders.yml');

  const form = page.getByRole('region', { name: 'Cube orders' });
  await expect(form.getByLabel('Sql table', { exact: true })).toHaveValue('public.orders');
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
