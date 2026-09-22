import { expect, test } from '@playwright/test';

/**
 * F16 — pre-aggregations, on the sample model's accelerated cube,
 * `cubes/monthly_orders.yml` (T014).
 *
 * T148 / AC-142: WHEN the user opens a cube's pre-aggregations, THE SYSTEM
 * SHALL list each rollup with its measures, dimensions, time dimension,
 * granularity, partition granularity and indexes.
 * Fails when: a declared rollup or any of those attributes is missing.
 */
test('a cube’s pre-aggregations list each rollup with what it declares', async ({ page }) => {
  await page.goto('/model/files/cubes%2Fmonthly_orders.yml');
  const form = page.getByRole('region', { name: 'Cube monthly_orders' });
  await form.getByRole('tab', { name: /^Pre-aggregations/ }).click();

  const rollups = form.getByRole('list', { name: 'Pre-aggregations' }).locator(':scope > li');
  await expect(rollups).toHaveCount(1);
  const rollup = rollups.first();
  await expect(rollup.locator('.model-member__name').first()).toHaveText('by_status_month');

  const facts = rollup.locator('.rollup-facts > div');
  await expect(facts.locator('dt')).toHaveText([
    'Measures',
    'Dimensions',
    'Time dimension',
    'Granularity',
    'Partition granularity',
    'Indexes',
  ]);
  await expect(facts.locator('dd')).toHaveText([
    'count, total_amount',
    'status',
    'ordered_at',
    'month',
    'year',
    'by_status (status)',
  ]);
  // Listed without opening the rollup's form.
  await expect(facts.first()).toBeVisible();
  await expect(rollup.locator(':scope > details')).not.toHaveAttribute('open', /.*/);
});
