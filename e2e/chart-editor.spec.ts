import { CHART_TYPES } from '@wechart/core';
import { expect, test } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';

/**
 * AC-026: WHEN the user drags a field onto a well, or adds it with the well's
 * "+" picker, THE SYSTEM SHALL add it to that well and re-run the chart's
 * query.
 * Fails when: the field is not added by either route, or the chart still shows
 * the previous result.
 *
 * "Either route" is the criterion, so both are exercised, and each asserts the
 * result *changed* rather than merely that something is displayed.
 */
async function openEditorOnOrders(page: import('@playwright/test').Page) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
}

test('adds a field with the well picker and runs the query', async ({ page }) => {
  await openEditorOnOrders(page);
  await expect(page.getByTestId('result-empty')).toBeVisible();

  await page.getByTestId('add-measures').selectOption('orders.count');

  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
  await expect(page.getByTestId('result-row-count')).toHaveText('1 rows');
  // 240 seeded orders, in the drawer — the only place rows are printed (AC-214).
  await page.getByRole('button', { name: 'Results' }).click();
  await expect(page.getByTestId('drawer-result-rows')).toContainText('240');
});

test('adds a field by dragging it onto a well', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('member-orders.count').dragTo(page.getByTestId('well-measures'));

  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
  await expect(page.getByTestId('result-row-count')).toHaveText('1 rows');
});

test('re-runs the query when another field is added, showing a new result', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('add-measures').selectOption('orders.count');
  await expect(page.getByTestId('result-row-count')).toHaveText('1 rows');

  // Grouping by status turns one row into one row per status.
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await expect(page.getByTestId('in-dimensions-orders.status')).toBeVisible();
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');
});

test('removing a field re-runs the query too', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  // Named by its title (AC-216).
  await page.getByRole('button', { name: /Remove Orders Status/ }).click();

  await expect(page.getByTestId('result-row-count')).toHaveText('1 rows');
});

/**
 * AC-027: WHILE a field is being dragged, THE SYSTEM SHALL mark each well as
 * legal or illegal for it and give a reason for every illegal well.
 * Fails when: an illegal well accepts the drop, or gives no reason.
 *
 * The drag is driven by hand rather than with dragTo, because the marking only
 * exists *while* the drag is in progress — dragTo completes it and there is
 * nothing left to look at.
 */
test('marks wells legal or illegal mid-drag, with a reason', async ({ page }) => {
  await openEditorOnOrders(page);

  const field = page.getByTestId('member-orders.count');
  const box = (await field.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Two moves: the first starts the drag, the second is inside the well.
  const target = (await page.getByTestId('well-dimensions').boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });

  await expect(page.getByTestId('well-measures')).toHaveAttribute('data-drop', 'legal');
  await expect(page.getByTestId('well-dimensions')).toHaveAttribute('data-drop', 'illegal');
  await expect(page.getByTestId('reason-dimensions')).toBeVisible();
  await expect(page.getByTestId('reason-dimensions')).toContainText(/measure/i);

  await page.mouse.up();
});

test('an illegal well refuses the drop', async ({ page }) => {
  await openEditorOnOrders(page);

  // A measure dropped on the dimensions well.
  await page.getByTestId('member-orders.count').dragTo(page.getByTestId('well-dimensions'));

  await expect(page.getByTestId('in-dimensions-orders.count')).toBeHidden();
  // And it did not silently land somewhere else either.
  await expect(page.getByTestId('result-empty')).toBeVisible();
});

/**
 * AC-028 and AC-029 against the real model and real data: the recommendation
 * and its trace, with cardinalities taken from the rows the query returned.
 */
test('recommends a chart with a runner-up, and explains why', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  // Three statuses is a small category: a bar.
  // By its name (AC-217), carrying its id.
  await expect(page.getByTestId('recommended-type')).toHaveText('Recommended: Bar');
  await expect(page.getByTestId('recommended-type')).toHaveAttribute('data-chart-type', 'bar');
  await expect(page.getByTestId('recommended-reason')).not.toBeEmpty();
  // AC-028: at least one runner-up, and it is a different chart.
  const runnersUp = page.locator('[data-testid^="runner-up-"]');
  await expect(runnersUp.first()).toBeVisible();

  await page.getByRole('button', { name: 'Why this chart?' }).click();

  const trace = page.getByTestId('why-this-chart');
  // The signature, with the cardinality that came from the data.
  await expect(trace.getByTestId('trace-field-orders.status')).toContainText('3');
  // Every rule, with its verdict.
  await expect(trace.getByTestId('trace-bar-no_dual_value_axis')).toContainText('passed');
});

test('the trace names the rule that rejected a candidate (AC-029)', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  // 240 distinct ids: far past the 6-slice cap, so a pie is enumerated and
  // then rejected, which is what the trace must account for.
  await page.getByTestId('add-dimensions').selectOption('orders.id');
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');

  await page.getByRole('button', { name: 'Why this chart?' }).click();
  const trace = page.getByTestId('why-this-chart');

  await expect(trace.getByTestId('trace-pie')).toContainText('rejected');
  await expect(trace.getByTestId('trace-pie-pie_slice_capacity')).toContainText('6 slices');
});

/**
 * AC-032: WHEN the user picks a chart type manually, THE SYSTEM SHALL keep that
 * type through later field changes until the user chooses "Back to
 * recommended".
 * Fails when: the type reverts to the recommendation after a field change.
 */
test('a manually chosen chart type survives field changes', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expectChartType(page, 'bar');

  // Pick something the recommender did not choose.
  await chooseChartType(page, 'pie');
  await expectChartType(page, 'pie');

  // A field change moves the recommendation on; the chart must not follow.
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('recommended-type')).not.toHaveAttribute('data-chart-type', 'pie');
  await expectChartType(page, 'pie');
});

test('"Back to recommended" hands the choice back', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await chooseChartType(page, 'pie');
  await expectChartType(page, 'pie');

  await page.getByTestId('back-to-recommended').click();

  await expectChartType(page, 'bar');
  // And it follows the recommendation again from here on.
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  const recommended = await page.getByTestId('recommended-type').getAttribute('data-chart-type');
  await expectChartType(page, recommended!);
});

test('the option to go back appears only after a manual choice', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await expect(page.getByTestId('back-to-recommended')).toBeHidden();

  await chooseChartType(page, 'pie');

  await expect(page.getByTestId('back-to-recommended')).toBeVisible();
});

/**
 * AC-033: WHEN the chart's fields cannot produce the chosen type, THE SYSTEM
 * SHALL show what is missing, naming the well and the member type needed.
 * Fails when: the chart renders empty axes with no message, or the message does
 * not name what is missing.
 */
test('says what is missing, naming the well and the member type', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  // A scatter needs two measures and there is one.
  await chooseChartType(page, 'scatter');

  const message = page.getByTestId('missing-fields');
  await expect(message).toBeVisible();
  // The well as the editor names it (AC-216), and the member type it takes.
  await expect(message).toContainText('Metrics');
  await expect(message).toContainText('measures');
  await expect(message).toContainText('add 1 more');
});

test('the message goes away once the field is added', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await chooseChartType(page, 'scatter');
  await expect(page.getByTestId('missing-fields')).toBeVisible();

  await page.getByTestId('add-measures').selectOption('orders.total_amount');

  await expect(page.getByTestId('missing-fields')).toBeHidden();
});

test('names every missing requirement, not only the first', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');

  // A heatmap wants a measure and two dimensions; there are no dimensions.
  await chooseChartType(page, 'heatmap');

  await expect(page.getByTestId('missing-fields')).toContainText('Dimensions');
});

/**
 * AC-035: WHEN the user changes the chart in the editor, THE SYSTEM SHALL
 * support undo and redo of every change made since the editor opened, and a
 * "Discard changes" that restores the chart as it was.
 * Fails when: any change cannot be undone, or Discard leaves a change applied.
 */
test('undoes and redoes a field change', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('in-measures-orders.count')).toBeHidden();

  await page.getByTestId('redo').click();
  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
});

test('undoes every kind of change, including the chart type and the cube', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await chooseChartType(page, 'pie');
  await expectChartType(page, 'pie');

  // Back through the type change...
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('chart-type')).not.toHaveAttribute('data-chart-type', 'pie');
  // ...the dimension...
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('in-dimensions-orders.status')).toBeHidden();
  // ...the measure...
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('in-measures-orders.count')).toBeHidden();
  // ...and the choice of cube, which is where the editor opened.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('no-cube-chosen')).toBeVisible();
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('discard restores the chart as it opened', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await chooseChartType(page, 'pie');

  await page.getByTestId('discard').click();

  // Nothing applied: no cube, no fields, no manual type.
  await expect(page.getByTestId('no-cube-chosen')).toBeVisible();
  await expect(page.getByTestId('in-measures-orders.count')).toBeHidden();
  await expect(page.getByTestId('discard')).toBeDisabled();
});

test('nothing to undo or discard when the editor opens', async ({ page }) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await expect(page.getByLabel('Cube or view')).toBeVisible();

  await expect(page.getByTestId('undo')).toBeDisabled();
  await expect(page.getByTestId('redo')).toBeDisabled();
  await expect(page.getByTestId('discard')).toBeDisabled();
});

/**
 * AC-036: WHEN the user opens the results drawer, THE SYSTEM SHALL show the
 * result rows, the underlying rows, and the Cube query JSON for the current
 * chart.
 * Fails when: any of the three views is missing, or shows data from a different
 * query than the chart rendered.
 */
test('the drawer shows result rows, underlying rows and the query', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  await page.getByRole('button', { name: 'Results', exact: true }).click();

  // The result rows: the three the chart rendered, not some other query's.
  await expect(page.getByTestId('drawer-result-rows')).toBeVisible();
  await expect(page.getByTestId('drawer-result-rows').locator('tbody tr')).toHaveCount(3);

  // The query JSON, matching what produced them.
  await page.getByTestId('drawer-tab-query').click();
  const shown = await page.getByTestId('drawer-query').textContent();
  const query = JSON.parse(shown ?? '{}') as { measures: string[]; dimensions: string[] };
  expect(query.measures).toEqual(['orders.count']);
  expect(query.dimensions).toEqual(['orders.status']);

  // The rows beneath the aggregate: one per order, not one per status.
  await page.getByTestId('drawer-tab-underlying').click();
  await expect(page.getByTestId('drawer-underlying-rows')).toBeVisible();
  const underlying = page.getByTestId('drawer-underlying-rows');
  await expect(underlying.locator('tbody tr').first()).toBeVisible();

  // A row count alone would pass for the wrong query — a different cube, or
  // the chart's members dropped — so tie the rows to the chart's own query.
  // Same columns as the chart asked for, by their titles (AC-220):
  expect(await underlying.locator('thead th').allTextContents()).toEqual([
    'Orders Status',
    'Orders Count',
  ]);

  // ...ungrouped, so each row carries a single order rather than a total...
  const counts = await underlying.locator('tbody tr td:nth-child(2)').allTextContents();
  expect(new Set(counts)).toEqual(new Set(['1']));

  // ...and every status is one the chart itself showed.
  await page.getByTestId('drawer-tab-result').click();
  const charted = await page
    .getByTestId('drawer-result-rows')
    .locator('tbody tr td:nth-child(1)')
    .allTextContents();
  await page.getByTestId('drawer-tab-underlying').click();
  const beneath = await underlying.locator('tbody tr td:nth-child(1)').allTextContents();
  expect(new Set(beneath)).toEqual(new Set(charted));
});

/**
 * The underlying view is built on an `ungrouped` query rather than on the
 * cube's primary key, which Cube hides by default. `customers` publishes no
 * primary key, so on the earlier primary-key route this view showed a "no
 * primary key" message where AC-036 requires rows.
 */
test('the underlying rows work on a cube that publishes no primary key', async ({ page }) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Customers' });
  await expect(page.getByTestId('member-customers.count')).toBeVisible();
  await page.getByTestId('add-measures').selectOption('customers.count');
  await page.getByTestId('add-dimensions').selectOption('customers.country');

  // Wait for the query to settle before opening the drawer, as the sibling
  // test above does. Without it the click can interleave with the re-render
  // the second field triggers, and the drawer never opens — which shows up as
  // a timeout on the tab, under load only.
  await expect(page.getByTestId('result-row-count')).toBeVisible();

  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByTestId('drawer-tab-underlying').click();

  const underlying = page.getByTestId('drawer-underlying-rows');
  await expect(underlying).toBeVisible();
  expect(await underlying.locator('thead th').allTextContents()).toEqual([
    'Customers Country',
    'Customers Count',
  ]);
  await expect(underlying.locator('tbody tr')).toHaveCount(4);
});

test('the drawer agrees with the chart after the query changes', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await expect(page.getByTestId('drawer-result-rows').locator('tbody tr')).toHaveCount(1);

  await page.getByTestId('add-dimensions').selectOption('orders.status');

  // Both the chart and the drawer move together, because they are the same data.
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');
  await expect(page.getByTestId('drawer-result-rows').locator('tbody tr')).toHaveCount(3);
});

/**
 * AC-037: THE SYSTEM SHALL render … from a chart spec.
 *
 * The renderers are proved headlessly per family. What this proves is the part
 * headless rendering cannot: that the app mounts one on a real node, draws
 * marks, and redraws when the chart changes.
 */
test('the editor draws a chart, and redraws it when the fields change', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();

  // Marks, not merely an <svg>: an empty chart frame would satisfy the latter.
  const bars = canvas.locator('svg path[fill^="#"]');
  await expect(bars.first()).toBeVisible();
  const drawnForThree = await bars.count();
  expect(drawnForThree).toBeGreaterThan(0);

  // A second measure makes it a grouped bar: same three categories, twice the
  // marks. The drawing has to follow the query rather than being drawn once.
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await expect(page.getByTestId('in-measures-orders.total_amount')).toBeVisible();
  await expect(async () => {
    expect(await bars.count()).toBeGreaterThan(drawnForThree);
  }).toPass();
});

test('no chart type is left undrawn', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await page.getByTestId('add-dimensions').selectOption('orders.id');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('result-row-count')).toBeVisible();

  // Replaces a test that asserted the opposite: that the editor said so for a
  // type with no renderer. That was true while renderers were still landing
  // and stopped being true at T044, when the last of the eighteen arrived.
  // The guard itself is still covered by the unit test in optionFor.test.ts.
  for (const chartType of CHART_TYPES) {
    await chooseChartType(page, chartType);
    await expect(page.getByTestId('chart-not-drawable')).toBeHidden();
  }
});

/**
 * T242 / AC-037: … scatter, heatmap … trellis (small multiples) … from a
 * chart spec. Built from the editor's wells, each drew an empty canvas — its
 * channels encoded as a bar's — which the test above, asking only that none
 * says it is undrawn, never saw. Each is read here by what it draws.
 */
test('a scatter, a heatmap, small multiples and a pivot draw from the wells', async ({ page }) => {
  const canvas = page.getByTestId('chart-canvas');
  const texts = () => canvas.locator('svg text').allTextContents();
  // Marks with a colour of their own: bars, points, cells — and legend icons.
  const painted = () => canvas.locator('svg path[fill^="#"]').count();

  // Small multiples: a panel per status over time, each with its bars.
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await chooseChartType(page, 'trellis');
  await expect.poll(texts).toEqual(expect.arrayContaining(['shipped', 'completed', 'processing']));
  await expect.poll(painted).toBeGreaterThan(3);
  // One grouping is not enough for them: said, not drawn empty (AC-033).
  await page.getByRole('button', { name: /Remove Orders Ordered at/ }).click();
  await expect(page.getByTestId('missing-fields')).toContainText(
    'Small multiples needs 2 dimensions, or a time dimension and a dimension',
  );

  // A scatter: count against amount on its axes, a series per status.
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await chooseChartType(page, 'scatter');
  await expect
    .poll(texts)
    .toEqual(
      expect.arrayContaining([
        'shipped',
        'completed',
        'processing',
        'Orders Count',
        'Orders Total Amount',
      ]),
    );
  // Three points and their three legend icons.
  await expect.poll(painted).toBeGreaterThanOrEqual(6);

  // A heatmap: products' categories across, their names down, a cell each.
  await page.getByLabel('Cube or view').selectOption({ label: 'Products' });
  await page.getByTestId('add-measures').selectOption('products.count');
  await page.getByTestId('add-dimensions').selectOption('products.category');
  await page.getByTestId('add-dimensions').selectOption('products.name');
  await chooseChartType(page, 'heatmap');
  await expect
    .poll(texts)
    .toEqual(expect.arrayContaining(['Components', 'Instruments', 'Cable, 2m', 'Sensor array']));
  // Its cells are filled from the colour ramp, as `rgb(…)`.
  await expect.poll(() => canvas.locator('svg path[fill^="rgb("]').count()).toBe(4);

  // A pivot: categories down its rows, names across its columns.
  await chooseChartType(page, 'pivot');
  await expect(page.getByTestId('pivot-row-header')).toHaveText(['Components', 'Instruments']);
  await expect(page.getByTestId('pivot-column-header')).toHaveCount(4);
});

/**
 * AC-040: WHEN the user edits an axis, THE SYSTEM SHALL apply minimum,
 * maximum, logarithmic scale, gridlines, tick rotation, number format and axis
 * title to the rendered chart.
 * Fails when: a setting is accepted and the drawing does not change.
 *
 * Each setting is checked against the rendered SVG in the unit tests. What
 * this adds is the half those cannot reach: that the inspector's controls
 * actually reach the chart.
 */
test('editing an axis changes the drawn chart', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas.getByText('Orders placed')).toBeHidden();

  // The axes are in the inspector's Customize tab (AC-214).
  await page.getByRole('tab', { name: 'Customize' }).click();
  await page.getByLabel('Title', { exact: true }).last().fill('Orders placed');

  // The title has to appear in the drawing, not merely in the form.
  await expect(canvas.getByText('Orders placed')).toBeVisible();

  // And a maximum the data never reaches can only come from the setting.
  await page.getByLabel('Maximum').last().fill('500');
  await expect(canvas.getByText('500')).toBeVisible();
});

test('an axis edit is undoable like any other change', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  const canvas = page.getByTestId('chart-canvas');
  await page.getByRole('tab', { name: 'Customize' }).click();
  await page.getByLabel('Title', { exact: true }).last().fill('Orders placed');
  await expect(canvas.getByText('Orders placed')).toBeVisible();

  // AC-035 says every change is undoable, and an axis edit is a change.
  await page.getByTestId('undo').click();
  await expect(canvas.getByText('Orders placed')).toBeHidden();
});

/**
 * AC-044: WHEN the user sorts a chart, THE SYSTEM SHALL order categories by
 * value ascending, value descending or label, and keep that order after a
 * data refresh.
 *
 * Read through the table view, because that is where the order is legible as
 * text rather than as bar positions.
 */
test('sorting a chart reorders its categories', async ({ page }) => {
  await openEditorOnOrders(page);
  // Not orders.count: the sample data has exactly 80 orders in each status,
  // so every category ties and ascending and descending are the same order.
  // A sort test needs a measure that actually varies.
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');

  await page.getByTestId('toggle-table-view').click();
  const firstCell = page.getByTestId('data-table').locator('tbody tr td:nth-child(1)').first();

  await page.getByLabel('Sort').selectOption('value-desc');
  const highest = await firstCell.textContent();

  await page.getByLabel('Sort').selectOption('value-asc');
  const lowest = await firstCell.textContent();

  // The largest and the smallest cannot be the same category unless the sort
  // did nothing.
  expect(highest).not.toBe(lowest);

  // And the order survives a re-query: adding a field re-runs the query.
  await page.getByTestId('add-measures').selectOption('orders.count');
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows');
  await expect(firstCell).toHaveText(lowest ?? '');
});

test('a time dimension goes to its own well and groups by day', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');

  await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
  // 240 orders, one per day.
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');
});

/**
 * AC-182: WHEN the chart editor is opened on an existing chart, THE SYSTEM
 * SHALL load that chart's cube, fields, chart type and axis settings into the
 * editor.
 * Fails when: the editor opens with empty wells, or with a chart type other
 * than the one saved.
 *
 * Until AC-182 the editor ignored the id in its URL and always opened blank,
 * so every spec above used to navigate to a made-up id and none of them could
 * have noticed. The seeded chart below is `orders`, one measure, two
 * dimensions and a saved type of `bar`.
 */
test.describe('opening a saved chart (AC-182)', () => {
  const SAVED = '/explore/charts/seed-chart-status/edit';

  test('opens with the chart’s cube and every field in its well', async ({ page }) => {
    await page.goto(SAVED);

    // The criterion's first failing state: "the editor opens with empty wells".
    await expect(page.getByLabel('Cube or view')).toHaveValue('orders');
    await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
    await expect(page.getByTestId('in-dimensions-products.category')).toBeVisible();
    await expect(page.getByTestId('in-dimensions-orders.status')).toBeVisible();
    // And it runs: the loaded fields reach the query, not only the wells.
    await expect(page.getByTestId('result-row-count')).not.toHaveText('0 rows');
  });

  test('opens with the saved chart type, as the user’s own choice', async ({ page }) => {
    await page.goto(SAVED);

    // The second failing state: "a chart type other than the one saved".
    await expectChartType(page, 'bar');
    /**
     * A saved type is a choice the user made, so it must load as manual.
     * Loaded as the recommendation it would be silently replaced the next
     * time a field changed — AC-032's forbidden behaviour. "Back to
     * recommended" is offered only while the type is manual, so its presence
     * is the witness.
     */
    await expect(page.getByTestId('back-to-recommended')).toBeVisible();
  });

  test('opens with the chart’s saved axis settings', async ({ page }) => {
    /**
     * The criterion names axis settings, and the editor reads them from one
     * place only (`options.axes`). Asserted where the user sees them — in the
     * Axes panel — because a unit test of the loader cannot notice the editor
     * failing to seed its options from what was loaded.
     */
    await page.goto('/explore/charts/seed-chart-axes/edit');
    await page.getByRole('tab', { name: 'Customize' }).click();

    const yAxis = page.getByTestId('axis-panel-y');
    await expect(yAxis.getByLabel('Title')).toHaveValue('Order count');
    await expect(yAxis.getByLabel('Minimum')).toHaveValue('5');
  });

  test('opening a chart is not itself an undoable change', async ({ page }) => {
    /**
     * AC-035 counts every change "since the editor opened". Loading is what
     * opening *is*, so it must not be the first entry in the history —
     * otherwise Undo would step a saved chart back to blank, and Discard
     * would do the same.
     */
    await page.goto(SAVED);
    await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();

    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('discard')).toBeDisabled();
  });

  test('Discard returns to the saved chart, not to an empty one', async ({ page }) => {
    /**
     * AC-035: "a Discard changes that restores the chart as it was". Before
     * AC-182 "as it was" always meant empty, because every editor opened
     * empty. Now it means the saved chart, and the history has to be seeded
     * with it for Discard to land there.
     */
    await page.goto(SAVED);
    await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();

    await page.getByTestId('add-dimensions').selectOption('orders.id');
    await expect(page.getByTestId('in-dimensions-orders.id')).toBeVisible();
    await expect(page.getByTestId('discard')).toBeEnabled();
    await page.getByTestId('discard').click();

    // The added field is gone and the saved ones are back — both directions,
    // so a Discard that emptied everything would fail the second half.
    await expect(page.getByTestId('in-dimensions-orders.id')).toBeHidden();
    await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
    await expect(page.getByTestId('in-dimensions-orders.status')).toBeVisible();
    await expectChartType(page, 'bar');
  });

  test('a chart nobody has built yet opens empty', async ({ page }) => {
    /**
     * Stored as the create endpoint stores one — no format version and no
     * definition — and upgraded on read into an empty chart. The path every
     * brand-new chart takes into the editor.
     */
    await page.goto('/explore/charts/seed-chart-empty/edit');

    await expect(page.getByLabel('Cube or view')).toHaveValue('');
    await expect(page.getByTestId('no-cube-chosen')).toBeVisible();
  });

  test('a chart that does not exist is refused, not opened blank', async ({ page }) => {
    /**
     * Opening an empty editor in its place would let the user build a new
     * chart believing they were editing the old one. The editor must not
     * render at all.
     */
    await page.goto('/explore/charts/no-such-chart/edit');

    await expect(page.getByTestId('editor-load-error')).toHaveText(
      'This chart is no longer available.',
    );
    await expect(page.getByLabel('Cube or view')).toBeHidden();
  });
});

/**
 * T228 / AC-214: WHILE the chart editor is open, THE SYSTEM SHALL show the
 * field list on the left, the preview in the centre above a drawer of
 * results, underlying rows and the Cube query, and an inspector on the right
 * with Data and Customize tabs, the preview's top edge visible without
 * scrolling at 1,440 × 900, and a single header row holding the chart's
 * editable title, its source and row count, whether it is local or shared,
 * Undo, Redo, Discard and the save action.
 * `Fails when: the preview's top edge is below the fold at 1,440 × 900, the
 * title cannot be edited in the editor, or result rows are printed anywhere
 * outside the drawer.`
 */
test('the editor is three panes under one header row, its preview in view at 1440 × 900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  // One header row: title, source and rows, ownership, Undo, Redo, Discard, Save.
  const head = page.getByTestId('editor-bar');
  await expect(head.getByTestId('result-row-count')).toHaveText('3 rows');
  await expect(head).toContainText('Orders');
  // A library chart not yet saved: new, and shared from its folder (T256).
  await expect(head.getByTestId('editor-ownership')).toHaveText('New shared chart in Shared');
  const title = head.getByLabel('Chart title');
  const before = await title.inputValue();
  await title.fill('Orders by status, renamed');
  await title.press('Enter');
  await expect(title).toHaveValue('Orders by status, renamed');
  await expect(
    page.getByRole('heading', { name: 'Chart editor: Orders by status, renamed' }),
  ).toHaveCount(1);
  // One change, not one per letter: a single Undo puts the whole title back.
  await head.getByRole('button', { name: 'Undo' }).click();
  await expect(title).toHaveValue(before);
  await head.getByRole('button', { name: 'Redo' }).click();
  await expect(title).toHaveValue('Orders by status, renamed');
  const controls = [
    title,
    head.getByRole('button', { name: 'Undo' }),
    head.getByRole('button', { name: 'Redo' }),
    head.getByRole('button', { name: 'Discard changes' }),
    head.getByRole('button', { name: 'Save chart' }),
  ];
  const centres = await Promise.all(
    controls.map(async (control) => {
      const box = await control.boundingBox();
      return (box?.y ?? 0) + (box?.height ?? 0) / 2;
    }),
  );
  for (const centre of centres) expect(Math.abs(centre - (centres[0] ?? 0))).toBeLessThan(4);

  // Fields on the left, the preview in the centre, the inspector on the right.
  const fields = page.getByRole('complementary', { name: 'Fields' });
  const preview = page.getByRole('region', { name: 'Preview' });
  const inspector = page.getByRole('complementary', { name: 'Chart settings' });
  const [left, centre, right] = await Promise.all(
    [fields, preview, inspector].map((pane) => pane.boundingBox()),
  );
  expect(left?.x ?? 0).toBeLessThan(centre?.x ?? 0);
  expect(centre?.x ?? 0).toBeLessThan(right?.x ?? 0);
  await expect(inspector.getByRole('tab', { name: 'Data' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(inspector.getByRole('tab', { name: 'Customize' })).toBeVisible();

  // The preview's top edge above the fold, with nothing scrolled.
  const canvas = preview.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await canvas.boundingBox())?.y ?? 900).toBeLessThan(900);

  // The drawer below it, and no result rows printed anywhere else: with the
  // drawer open, the page's text outside it and the drawing names no row's
  // member the way a printed row does.
  const drawer = preview.getByRole('button', { name: 'Results' });
  await expect(drawer).toBeVisible();
  expect(((await drawer.boundingBox())?.y ?? 0) > ((await canvas.boundingBox())?.y ?? 0)).toBe(
    true,
  );
  await drawer.click();
  await expect(page.getByTestId('drawer-result-rows')).toContainText('shipped');
  const outside = await page.getByRole('main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll('.results-drawer, [data-testid="chart-canvas"], select, option')
      .forEach((node) => node.remove());
    return copy.textContent ?? '';
  });
  expect(outside).not.toContain('"orders.status"');
  expect(outside).not.toContain('shipped');
});

/**
 * AC-214 on the way most charts are opened: over a dashboard, from a tile.
 * Back, whose the chart is, Undo, Redo, Discard and Save dashboard share the
 * one header row, and the preview is in view at 1,440 × 900.
 */
test('over a dashboard, the editor’s one header row holds Back and Save dashboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
  await tile.hover();
  await tile.locator('[data-edit-chart]').click();

  const head = page.getByTestId('editor-bar');
  await expect(head.getByLabel('Chart title')).toHaveValue('Orders by category and status');
  await expect(head.getByTestId('editor-ownership')).toHaveText('Local · only on this dashboard');
  const controls = [
    head.getByTestId('editor-back'),
    head.getByLabel('Chart title'),
    head.getByRole('button', { name: 'Undo' }),
    head.getByRole('button', { name: 'Discard changes' }),
    head.getByTestId('editor-save-dashboard'),
  ];
  const centres = await Promise.all(
    controls.map(async (control) => {
      const box = await control.boundingBox();
      return (box?.y ?? 0) + (box?.height ?? 0) / 2;
    }),
  );
  for (const centre of centres) expect(Math.abs(centre - (centres[0] ?? 0))).toBeLessThan(4);
  const canvas = page.getByRole('region', { name: 'Preview' }).getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.y ?? 900).toBeLessThan(900);
});

/**
 * T229 / AC-215: THE SYSTEM SHALL group the chart editor's fields by the cube
 * they belong to, with a search box, and show on each field its role, its
 * aggregation, type or number of distinct values, and whether the chart uses
 * it; clicking a field, or pressing Enter or Space on it, SHALL add it to the
 * well its role belongs in.
 * `Fails when: clicking or pressing Enter on a field adds nothing, or the
 * search does not narrow the list.`
 *
 * T229 / AC-216: THE SYSTEM SHALL show each field in a well by its title with
 * a tag for its aggregation or its time granularity, let the user change a
 * time field's granularity from its pill, and offer a Filters well and a Top N
 * setting beside the Metrics, Dimensions and Time wells.
 * `Fails when: a pill shows a member's internal name, a time field's
 * granularity cannot be changed from its pill, or the Filters well is missing.`
 */
test('fields by cube, searched and added by click or key; pills by title with a grain, Filters and Top N', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  const fields = page.getByRole('complementary', { name: 'Fields' });
  const orders = fields.getByRole('region', { name: 'Orders fields' });
  await expect(orders).toBeVisible();
  // Each field says what it is: a measure its aggregation, a time field "time".
  await expect(orders.getByTestId('member-orders.count')).toContainText('count');
  await expect(orders.getByTestId('member-orders.ordered_at')).toContainText('time');

  // The search narrows the list.
  const search = fields.getByLabel('Search fields');
  await search.fill('amount');
  await expect(fields.getByTestId('member-orders.count')).toHaveCount(0);
  await expect(fields.getByTestId('member-orders.average_amount')).toBeVisible();

  // A click adds a measure to Metrics, shown by its title, and marks the field used.
  const average = fields.getByTestId('member-orders.average_amount');
  await average.getByRole('button').click();
  const pill = page.getByTestId('in-measures-orders.average_amount');
  await expect(pill).toContainText('Orders Average Amount');
  await expect(pill).not.toContainText('orders.average_amount');
  await expect(average).toContainText('in the chart');

  // Enter adds a dimension; Space adds a time field, each to its own well.
  await search.fill('');
  await fields.getByTestId('member-orders.status').getByRole('button').press('Enter');
  await expect(page.getByTestId('in-dimensions-orders.status')).toBeVisible();
  await fields.getByTestId('member-orders.ordered_at').getByRole('button').press(' ');
  await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();

  // The time pill's grain is the query's grain.
  await page.getByLabel('Grain of Orders Ordered at').selectOption('month');
  await page.getByRole('button', { name: 'Results' }).click();
  await page.getByTestId('drawer-tab-query').click();
  await expect(page.getByTestId('drawer-query')).toContainText('"granularity": "month"');

  // The Filters well holds the chart to a value the member has.
  await page.getByTestId('add-filters').selectOption('orders.status');
  await page.getByLabel('Value of Orders Status').selectOption('shipped');
  await expect(page.getByTestId('drawer-query')).toContainText('"operator": "equals"');
  await expect(page.getByTestId('drawer-query')).toContainText('"shipped"');

  // And Top N, beside the wells.
  await expect(page.getByLabel('Top N (+ Other)')).toBeVisible();
});

/** AC-216's Top N reaches the drawing: the rest fold into one Other (AC-041). */
test('Top N keeps that many categories and folds the rest into Other', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas.getByText(/^Other \(/)).toHaveCount(0);

  const top = page.getByLabel('Top N (+ Other)');
  await top.fill('2');
  await top.press('Enter');
  // Three statuses: two kept, one folded.
  await expect(canvas.getByText('Other (1)')).toBeVisible();

  // Undone in one step, as one change.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(canvas.getByText(/^Other \(/)).toHaveCount(0);
});

/**
 * T231 / AC-219: THE SYSTEM SHALL offer in the chart editor's Customize tab
 * the axis settings — title, label rotation, include zero, logarithmic scale,
 * gridlines, minimum and maximum — the legend's visibility and position, each
 * series' colour and visibility and whether series stack, data labels, and
 * the number format.
 * `Fails when: the legend's position, data labels or "include zero" cannot be
 * set.`
 */
test('the Customize tab moves the legend, writes data labels and lets the axis leave zero', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  // Two measures by status: two series, so a legend.
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-measures').selectOption('orders.average_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: 'Customize' }).click();

  // The legend, from above the plot to its right: its entry for the average,
  // by the measure's title (AC-220).
  const legendEntry = () =>
    canvas.locator('svg text').filter({ hasText: 'Orders Average Amount' }).first();
  const plotBox = await canvas.boundingBox();
  const above = await legendEntry().boundingBox();
  expect((above?.y ?? 0) - (plotBox?.y ?? 0)).toBeLessThan(40);
  await page.getByLabel('Legend position').selectOption('right');
  await expect
    .poll(async () => ((await legendEntry().boundingBox())?.x ?? 0) - (plotBox?.x ?? 0))
    .toBeGreaterThan((plotBox?.width ?? 0) * 0.6);

  // Data labels: each bar's value written on it, where none was.
  const labels = () => canvas.locator('svg text').allTextContents();
  const before = await labels();
  await page.getByLabel('Data labels').check();
  await expect.poll(async () => (await labels()).length).toBeGreaterThan(before.length + 5);

  // Include zero, off: the value axis no longer starts at 0 — a zero however
  // the measure's format writes it ("$0", "0.00"). On one measure, labels
  // off: the average's small values beside the totals would take the axis
  // back to zero, and a label is not the axis.
  await page.getByLabel('Data labels').uncheck();
  await page.getByRole('tab', { name: 'Data' }).click();
  await page.getByRole('button', { name: /Remove Orders Average Amount/ }).click();
  await page.getByRole('tab', { name: 'Customize' }).click();
  const zero = canvas.locator('svg text', { hasText: /^\D*0(\.0+)?\D*$/ });
  await expect(zero).not.toHaveCount(0);
  await page.getByRole('group', { name: 'Y axis' }).getByLabel('Include zero').uncheck();
  await expect(zero).toHaveCount(0);
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it — legends, tooltips, table headers, well
 * pills, marking chips and the "Why this chart?" trace — and never by its
 * internal name.
 * `Fails when: a legend, table header, pill, chip or trace shows a name such
 * as "orders.count".`
 *
 * The editor's legend, results headers and trace; its pills are T229's test,
 * and a marking chip's is AC-200's.
 */
test('a two-measure legend, the results headers and the trace read the members’ titles', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();

  // The legend.
  const written = canvas.locator('svg text');
  await expect(written.filter({ hasText: /^Orders Count$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: /^Orders Total Amount$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: /orders\.(count|total_amount)/ })).toHaveCount(0);

  // The results' headers.
  await page.getByRole('button', { name: 'Results' }).click();
  const headers = page.getByTestId('drawer-result-rows').getByRole('columnheader');
  await expect(headers).toHaveText(['Orders Status', 'Orders Count', 'Orders Total Amount']);

  // The trace.
  await page.getByRole('button', { name: 'Why this chart?' }).click();
  await expect(page.getByTestId('trace-field-orders.count').getByRole('rowheader')).toHaveText(
    'Orders Count',
  );
  await expect(page.getByTestId('why-this-chart')).not.toContainText('orders.count');
});

/**
 * T232 / AC-221: WHEN a pie or donut is drawn, THE SYSTEM SHALL list every
 * slice in its legend.
 * `Fails when: a slice has no legend entry.`
 *
 * Four products in two categories: by category and name, a pie of four
 * slices, whose legend had two entries when slices were named by their
 * category alone. Its slices carry no labels, so its text is its legend.
 */
test('a pie over two dimensions has a legend entry per slice', async ({ page }) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Products' });
  await page.getByTestId('add-measures').selectOption('products.count');
  await page.getByTestId('add-dimensions').selectOption('products.category');
  await page.getByTestId('add-dimensions').selectOption('products.name');
  await chooseChartType(page, 'pie');
  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();

  const written = canvas.locator('svg text');
  for (const slice of [
    'Components · Cable, 2m',
    'Instruments · Control unit',
    'Components · Mounting kit',
    'Instruments · Sensor array',
  ])
    await expect(written.filter({ hasText: slice })).toHaveCount(1);
  // Never a category alone, as the two-entry legend read.
  await expect(written.filter({ hasText: /^(Components|Instruments)$/ })).toHaveCount(0);
});

/**
 * T230 / AC-217: THE SYSTEM SHALL show the chart's type by its name — "Auto"
 * with the recommended type, or "Chosen manually" — with a Change action
 * opening a gallery of every type that can be searched, groups types by
 * purpose, states what each needs and greys those the chart's fields cannot
 * draw, and SHALL show "Back to recommended" only while a type is chosen
 * manually (direction.md rules 9, 10).
 * `Fails when: a type is shown by an internal id such as "groupedBar", a type
 * the fields cannot draw is not greyed with its requirement, or "Back to
 * recommended" shows while the type is the recommended one.`
 */
test('the type reads by name; Change opens a gallery that greys what these fields cannot draw', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await expect(page.getByTestId('chart-type')).toHaveText('Auto · Bar');
  await expect(page.getByTestId('chart-type-change')).toContainText('Picked by the recommender');
  await expect(page.getByTestId('back-to-recommended')).toHaveCount(0);
  // The trace names its candidates by name too (T230's review).
  await page.getByRole('button', { name: 'Why this chart?' }).click();
  await expect(page.getByTestId('trace-hbar')).toContainText('Bar, horizontal');
  await expect(page.getByTestId('why-this-chart')).not.toContainText(/\bhbar\b/);

  const change = page.getByTestId('chart-type-change');
  await change.click();
  const gallery = page.getByRole('dialog', { name: 'Choose chart type' });
  await expect(gallery.getByRole('searchbox', { name: 'Search chart types' })).toBeFocused();
  // The recommender's suggestions first, each by its name.
  await expect(gallery.getByTestId('type-card-bar')).toContainText('Suggested');
  await expect(gallery).not.toContainText('groupedBar');
  // By purpose: a line is for time, and without a time field it is greyed,
  // saying what it lacks.
  await gallery.getByRole('button', { name: 'Evolution over time' }).click();
  const line = gallery.getByTestId('type-card-line');
  await expect(line).toHaveAttribute('data-drawable', 'false');
  await expect(line).toContainText('Line needs a time dimension in Time; add 1 more.');
  // Greyed: not on the surface a card it can draw sits on.
  const background = (node: Element) => getComputedStyle(node).backgroundColor;
  expect(await line.evaluate(background)).not.toBe(await gallery.evaluate(background));
  // Searched across every type.
  await gallery.getByRole('searchbox', { name: 'Search chart types' }).fill('side-by-side');
  await expect(gallery.getByTestId(/^type-card-/)).toHaveCount(1);
  await gallery.getByTestId('type-card-groupedBar').click();

  // Chosen: by its name, said to be manual, with the way back — and focus back
  // on Change.
  await expect(gallery).toHaveCount(0);
  await expect(change).toBeFocused();
  await expect(page.getByTestId('chart-type')).toHaveText('Grouped bar');
  await expect(change).toContainText('Chosen manually');
  await page.getByTestId('back-to-recommended').click();
  await expect(page.getByTestId('chart-type')).toHaveText('Auto · Bar');
  await expect(page.getByTestId('back-to-recommended')).toHaveCount(0);
});

/**
 * T230 / AC-218: WHILE a manually chosen type is a combo, or exceeds a
 * channel's capacity for the chart's fields, THE SYSTEM SHALL show a warning
 * with an icon saying why, and offer to switch to the recommended type
 * (direction.md rules 6, 30).
 * `Fails when: a combo, or a pie drawn with more than 6 slices, shows no
 * warning.`
 */
test('a manual combo, or a pie of too many slices, warns why and offers the recommended type', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-measures').selectOption('orders.total_amount');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await expect(page.getByTestId('type-warning')).toHaveCount(0);

  await chooseChartType(page, 'combo');
  const warning = page.getByTestId('type-warning');
  await expect(warning).toContainText('Two value axes');
  await expect(warning.locator('svg[data-icon="warn"]')).toHaveCount(1);
  // Switching back is offered, and taken.
  const recommended = await page.getByTestId('recommended-type').getAttribute('data-chart-type');
  await warning.getByRole('button', { name: /^Use / }).click();
  await expectChartType(page, recommended!);
  await expect(page.getByTestId('type-warning')).toHaveCount(0);

  // 240 orders, one slice each.
  await page.getByRole('button', { name: /Remove Orders Total Amount/ }).click();
  await page.getByRole('button', { name: /Remove Orders Status/ }).click();
  await page.getByTestId('add-dimensions').selectOption('orders.id');
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');
  await chooseChartType(page, 'pie');
  await expect(page.getByTestId('type-warning')).toContainText(
    'A pie is readable up to 6 slices; this has 240.',
  );
});

/**
 * T256 (AC-214, AC-213; recheck-chart-editor N2, F4): the library-chart
 * editor's way back and its ownership note, as `explore.js` 174–183 gives
 * them: "← Back to Explore" for a new chart and "← Back to chart" for one
 * already saved, with "New shared chart in ‹folder›" or "Shared chart · on n
 * dashboard(s)…". The prototype's Back applies the edit and returns.
 */
test.describe('T256: the library-chart editor’s way back and ownership note', () => {
  const api = 'http://localhost:4100/api';

  /** A saved library chart in Finance, on `dashboards` dashboards of its own. */
  async function savedChart(
    request: import('@playwright/test').APIRequestContext,
    dashboards: number,
  ) {
    const title = `Shared orders ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'chart', title, folderId: 'seed-folder-0' },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/chart/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          owner: 'admin',
          folderId: 'seed-folder-0',
          chart: {
            source: { cube: 'orders' },
            wells: {
              measures: ['orders.count'],
              dimensions: ['orders.status'],
              timeDimensions: [],
            },
            chartType: 'bar',
          },
        },
      },
    });
    for (let each = 0; each < dashboards; each += 1) {
      const name = `${title} board ${String(each)}`;
      const board = (await (
        await request.post(`${api}/documents`, {
          data: { kind: 'dashboard', title: name, folderId: 'root' },
        })
      ).json()) as { id: string };
      await request.put(`${api}/documents/dashboard/${board.id}`, {
        data: {
          version: 1,
          body: {
            schemaVersion: 1,
            title: name,
            folderId: 'root',
            owner: 'admin',
            settings: { width: 'fixed' },
            pages: [
              {
                id: 'only',
                title: 'Only',
                items: [{ id: 'tile-shared', kind: 'chart', w: 6, h: 40, chartId: id }],
              },
            ],
          },
        },
      });
    }
    return { id, title };
  }

  test('a new chart: "← Back to Explore" first in the header, and the folder it is new in', async ({
    page,
  }) => {
    await page.goto('/explore?folder=seed-folder-0');
    const contents = page.getByTestId('explore-contents');
    await contents.getByRole('button', { name: 'New', exact: true }).click();
    await page
      .getByRole('menu', { name: 'New' })
      .getByRole('menuitem', { name: /Chart$/ })
      .click();
    await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit$/);

    const head = page.getByTestId('editor-bar');
    const back = head.getByRole('button', { name: '← Back to Explore' });
    await expect(back).toBeVisible();
    // At the start of the row, before the title.
    const [first] = await head.evaluate((row) =>
      [...row.querySelectorAll('button, input')].map(
        (control) => control.getAttribute('aria-label') ?? control.textContent,
      ),
    );
    expect(first).toBe('← Back to Explore');
    await expect(head.getByTestId('editor-ownership')).toHaveText('New shared chart in Finance');

    // Nothing changed: back to the folder it was made in.
    await back.click();
    await expect(page).toHaveURL(/\/explore\?folder=seed-folder-0$/);
  });

  test('a saved chart: "← Back to chart", the dashboards it is on, and Back keeps the edit', async ({
    page,
    request,
  }) => {
    const { id } = await savedChart(request, 2);
    await page.goto(`/explore/charts/${id}/edit`);
    const head = page.getByTestId('editor-bar');
    await expect(head.getByTestId('result-row-count')).toHaveText('3 rows');
    // On more than one dashboard: said as a warning, with its icon.
    const note = head.getByTestId('editor-ownership');
    await expect(note).toHaveText('Shared chart · on 2 dashboards · edits change all of them');
    await expect(note.locator('svg[data-icon="warn"]')).toHaveCount(1);

    // The prototype's Back applies the edit and returns: here, saves it.
    const renamed = `Renamed ${String(Date.now())}`;
    await head.getByLabel('Chart title').fill(renamed);
    await head.getByRole('button', { name: '← Back to chart' }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(renamed);
  });

  test('a saved chart on no dashboard says so', async ({ page, request }) => {
    const { id } = await savedChart(request, 0);
    await page.goto(`/explore/charts/${id}/edit`);
    await expect(page.getByTestId('editor-bar').getByTestId('editor-ownership')).toHaveText(
      'Shared chart · not on a dashboard yet',
    );
  });
});
