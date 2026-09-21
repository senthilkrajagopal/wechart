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
