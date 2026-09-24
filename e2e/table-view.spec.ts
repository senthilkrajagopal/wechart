import { CHART_TYPES } from '@wechart/core';
import { expect, test, type Page } from '@playwright/test';

/**
 * AC-178: THE SYSTEM SHALL provide a table view of every chart's data,
 * reachable from the tile (direction.md rule 5).
 * Fails when: a chart type offers no table view.
 *
 * "Every chart type" is the whole criterion, so the list is the vocabulary
 * itself rather than a handful chosen by hand — a type added without a table
 * view fails here on the day it is added.
 *
 * The fixture fills every well so that no type is left unable to draw: two
 * measures, two dimensions and a time dimension together satisfy the
 * requirements of all eighteen. Skipping the ones that fell short would have
 * been the easy way to a green run and would have excused exactly the types
 * most likely to be missing a view.
 */
async function openEditorWithEveryWellFilled(page: Page, chartType: string) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await page.getByTestId('add-dimensions').selectOption('orders.id');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('result-row-count')).toBeVisible();

  await page.getByLabel('Chart type').selectOption(chartType);
  // Every type must be drawable from these fields, or the fixture is wrong.
  await expect(page.getByTestId('missing-fields')).toBeHidden();
}

for (const chartType of CHART_TYPES) {
  test(`${chartType} offers a table view of its data`, async ({ page }) => {
    await openEditorWithEveryWellFilled(page, chartType);

    if (chartType === 'table') {
      // Already a table; a control that switched it to a table would do
      // nothing, so its absence is correct rather than a gap.
      await expect(page.getByTestId('data-table')).toBeVisible();
      await expect(page.getByTestId('toggle-table-view')).toBeHidden();
      return;
    }

    // One click away, per direction.md rule 5.
    await page.getByTestId('toggle-table-view').click();

    const table = page.getByTestId('data-table');
    await expect(table).toBeVisible();
    // The table shows the chart's own members, not some other query's — by
    // their titles (AC-220).
    await expect(
      table.getByRole('columnheader', { name: 'Orders Status', exact: true }),
    ).toBeVisible();
  });
}
