import { expect, test } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { newInMyWorkspace } from './workspace';

/**
 * Lane CHARTS-B's types, on the running app (docs/tasks.md §P2.27; T1014
 * gathers them on one dashboard).
 *
 * T981, T982 / AC-597: WHEN parallel coordinates are edited, THE SYSTEM SHALL
 * take Line by (one dimension), Metrics (3 or more, one axis each, in order),
 * Colour (an optional dimension) and Scale, … Shared enabled only while every
 * measure has one format and otherwise disabled with the reason; and with
 * fewer than 3 measures SHALL say "Parallel coordinates need at least 3
 * measures; there are ‹n›. Add a measure, or use Scatter." with + Measure.
 * `Fails when: a well or option is missing; Shared can be chosen for
 * measures of different formats; or fewer than 3 measures draw lines.`
 * AC-598: one 1.5 px line per member, … the scale warning under the chart,
 * as text.
 *
 * The real editor, against the seeded Cube: Orders' Count is a plain number
 * and its Total and Average amounts are currency.
 */
test('parallel coordinates take their wells, refuse Shared across formats, and draw lines from 3 measures', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await chooseChartType(page, 'parallel');
  await expectChartType(page, 'parallel');

  // Its wells after Metrics, as the chart reads its fields.
  const labels = (await page.locator('.wells .well-field__label').allTextContents()).map((label) =>
    label.trim(),
  );
  expect(labels).toEqual(expect.arrayContaining(['Line by', 'Colour', 'Axes', 'Scale']));
  await expect(page.getByTestId('parallel-lineBy')).toHaveText('Orders Status');

  // Two measures: said in the wells, with + Measure, and in the chart's
  // place, as the editor says any type's missing fields (AC-033) — and no
  // line drawn.
  await expect(page.getByTestId('parallel-too-few')).toHaveText(
    'Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter.',
  );
  await expect(page.getByTestId('missing-fields')).toContainText(
    'Parallel coordinates needs 3 measures in Metrics; add 1 more.',
  );
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg polyline, svg path[stroke-width="1.5"]')).toHaveCount(0);
  const canvas = result.getByTestId('chart-canvas');

  // Count is a plain number and Total amount currency: Shared is refused,
  // with the reason the editor's formats give it.
  const shared = page.getByRole('radio', { name: 'Shared' });
  await expect(page.getByRole('radio', { name: 'Each axis, min to max' })).toBeChecked();
  await expect(shared).toBeDisabled();
  await expect(
    page.getByText(/^Shared needs every measure in one format; these are in /),
  ).toHaveText(
    'Shared needs every measure in one format; these are in plain numbers and currency.',
  );

  // + Measure adds to Metrics, through the editor's own wells.
  await page.getByTestId('add-parallelMeasure').click();
  await page.getByTestId('pick-orders.average_amount').click();
  await expect(page.getByTestId('parallel-axes')).toHaveText(
    'Orders Count → Orders Total Amount → Orders Average Amount',
  );
  await expect(page.getByTestId('parallel-too-few')).toHaveCount(0);
  await expect(page.getByTestId('missing-fields')).toHaveCount(0);

  // One 1.5 px line per status across three axes, and the scale warning as text.
  // In the page, zrender draws each line as a path of 1.5 px through the
  // three axes (the SSR string draws it as a polyline).
  const lines = canvas.locator('svg path[stroke-width="1.5"][fill="none"]');
  await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(3);
  for (const d of await lines.evaluateAll((all) => all.map((one) => one.getAttribute('d') ?? '')))
    expect(d.match(/L/g), d).toHaveLength(2);
  const statuses = await page.getByTestId('editor-result').locator('svg text').allTextContents();
  expect(statuses).toEqual(expect.arrayContaining(['Orders Count', 'Orders Average Amount']));
  await expect(page.getByTestId('parallel-scale-warning')).toHaveText(
    "Each axis runs from its own minimum to its maximum. Don't compare a line's height on one axis with its height on another.",
  );
  await expect(shared).toBeDisabled();
});
