import { expect, test, type Locator } from '@playwright/test';

/**
 * T235 / AC-224: THE SYSTEM SHALL edit every field that refers to model
 * members — pre-aggregation measures, dimensions, segments, rollups and time
 * dimension, drill members, hierarchy levels, a view's includes and excludes
 * — with a picker of the members it may refer to, and a join's target with a
 * list of cubes (direction.md §7b).
 * `Fails when: any of those fields accepts free text.`
 *
 * On the seeded model, and nothing published: other browsers' own cubes may
 * be in the model too, so what is listed is checked for what it must hold.
 */
const typesNothing = async (field: Locator) => {
  await expect(field).toBeVisible();
  await expect(field.locator('input, textarea')).toHaveCount(0);
};

test('a rollup’s members, a join’s target, drill members and a view’s includes are picked, never typed', async ({
  page,
}) => {
  // A rollup: its measures, dimensions, segments and rollups each a picker,
  // its time dimension a list of the time dimensions.
  await page.goto('/model/files/cubes%2Fmonthly_orders.yml');
  const cube = page.getByRole('region', { name: 'Cube monthly_orders' });
  await cube.getByRole('tab', { name: /^Pre-aggs/ }).click();
  await cube.locator('.model-member__name', { hasText: /^by_status_month$/ }).click();
  const rollup = cube.getByRole('listitem').filter({
    has: page.locator('.model-member__name', { hasText: /^by_status_month$/ }),
  });
  const measures = rollup.getByRole('group', { name: 'Measures', exact: true });
  for (const group of ['Measures', 'Dimensions', 'Segments', 'Rollups'])
    await typesNothing(rollup.getByRole('group', { name: group, exact: true }));
  await expect(measures.getByRole('button', { pressed: true })).toHaveText([
    'count',
    'total_amount',
  ]);
  // Another cube's measures too, by their cube.
  await expect(measures.getByRole('button', { name: 'orders.count', exact: true })).toBeVisible();
  const time = rollup.getByRole('combobox', { name: 'Time dimension', exact: true });
  await expect(time).toHaveValue('ordered_at');
  await expect(time.locator('option', { hasText: /^orders\.ordered_at$/ })).toHaveCount(1);
  await expect(time.locator('option', { hasText: /^status$/ })).toHaveCount(0);

  // Picking writes the file: total_amount taken out of the rollup.
  await measures.getByRole('button', { name: 'total_amount', exact: true }).click();
  await expect(measures.getByRole('button', { pressed: true })).toHaveText(['count']);
  await expect(page.locator('.cm-line', { hasText: /^\s+- total_amount$/ })).toHaveCount(0);
  await expect(page.locator('.cm-line', { hasText: /^\s+- count$/ })).toHaveCount(1);

  // A join's target, from the other cubes; a measure's drill members, picked.
  await page
    .getByRole('region', { name: 'Form editor' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('link', { name: /^orders\.yml/ })
    .click();
  const orders = page.getByRole('region', { name: 'Cube orders' });
  await orders.getByRole('tab', { name: /^Joins/ }).click();
  await orders.locator('.model-member__name', { hasText: /^customers$/ }).click();
  const target = orders.getByRole('combobox', { name: 'Target cube', exact: true });
  await expect(target).toHaveValue('customers');
  await expect(target.locator('option', { hasText: /^products$/ })).toHaveCount(1);
  await expect(target.locator('option', { hasText: /^orders$/ })).toHaveCount(0);
  await orders.getByRole('tab', { name: /^Measures/ }).click();
  await orders.locator('.model-member__name', { hasText: /^total_amount$/ }).click();
  const totalAmount = orders
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^total_amount$/ }) });
  // Drill members are among the rarer keys, under Advanced (T480).
  await totalAmount.locator('.model-form__advanced > summary').first().click();
  const drill = totalAmount.getByRole('group', { name: 'Drill members', exact: true });
  await typesNothing(drill);
  await expect(drill.getByRole('button', { name: 'status', exact: true })).toBeVisible();
  await expect(drill.getByRole('button', { name: 'customers.country', exact: true })).toBeVisible();

  // A view's includes and excludes, from its path's cube, or all of them.
  await page.goto('/model/files/views%2Forder_summary.yml');
  const view = page.getByRole('region', { name: 'View order_summary' });
  await view.getByRole('tab', { name: /^Cubes/ }).click();
  await view.locator('.model-member__name').first().click();
  const includes = view.getByRole('group', { name: 'Includes', exact: true });
  await typesNothing(includes);
  await typesNothing(view.getByRole('group', { name: 'Excludes', exact: true }));
  await expect(includes.getByRole('button', { name: 'All (*)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(includes.getByRole('button', { pressed: true })).toHaveText(['status', 'count']);
  await expect(includes.getByRole('button', { name: 'total_amount', exact: true })).toBeVisible();
});
