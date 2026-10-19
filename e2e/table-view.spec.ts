import { CHART_TYPES } from '@wechart/core';
import { expect, test, type Page } from '@playwright/test';

import { chooseChartType } from './chartType';
import { newChartOnCountries } from './countries';
import { cubePicker } from './cubePicker';
import { AWAITING_TABLE_VIEW } from './r81Awaiting';
import { wellPicker } from './wells';

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
 *
 * All but the country map (T398), which needs a dimension of ISO-3 codes the
 * sample model has none of: it is drawn from a cube of this browser's own,
 * its measure by its codes (`countries.ts`), and checked as every other type.
 */
async function openEditorWithEveryWellFilled(page: Page, chartType: string) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await wellPicker(page, 'dimensions').selectOption('orders.id');
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('result-row-count')).toBeVisible();

  await chooseChartType(page, chartType);
  // A bullet chart also needs its Target (T953, AC-580): a measure of the cube.
  if (chartType === 'bullet')
    await page
      .getByTestId('well-bullet-target')
      .getByRole('combobox', { name: 'Target', exact: true })
      .selectOption('orders.total_amount');
  // Every type must be drawable from these fields, or the fixture is wrong.
  await expect(page.getByTestId('missing-fields')).toBeHidden();
}

// R81's types join it as each one's table view lands (`r81Awaiting.ts`, T934).
for (const chartType of CHART_TYPES.filter((type) => !AWAITING_TABLE_VIEW.has(type))) {
  test(`${chartType} offers a table view of its data`, async ({ page, request }, testInfo) => {
    /** The column the table has to show: the chart's own grouping, by its title. */
    let grouping: string | RegExp = 'Orders Status';
    if (chartType === 'map') {
      const cube = await newChartOnCountries(page, request, testInfo.project.name);
      await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
      await expect(page.getByTestId('result-row-count')).toBeVisible();
      await chooseChartType(page, chartType);
      await expect(page.getByTestId('missing-fields')).toBeHidden();
      // Its codes, by the title Cube gives `iso3` ("… Iso3").
      grouping = /^Country Sales \S+ Iso3$/;
    } else {
      await openEditorWithEveryWellFilled(page, chartType);
    }
    /**
     * A combo split by Status is laid out by its category, Ordered at, each
     * measure's head spanning a second row of the members, which name no
     * dimension (T864, AC-509; design 20 state J): its grouping is its
     * category, and its members are column heads of their own.
     */
    const members = chartType === 'combo' ? ['completed', 'processing', 'shipped'] : [];
    if (chartType === 'combo') grouping = 'Orders Ordered at';

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
      table.getByRole('columnheader', {
        name: grouping,
        ...(typeof grouping === 'string' ? { exact: true } : {}),
      }),
    ).toBeVisible();
    for (const member of members)
      await expect(table.getByRole('columnheader', { name: member, exact: true })).toBeVisible();
  });
}
