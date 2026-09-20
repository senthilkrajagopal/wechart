import { CHART_TYPES } from '@wechart/core';
import { expect, test } from '@playwright/test';

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
  await page.goto('/explore/charts/new/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
}

test('adds a field with the well picker and runs the query', async ({ page }) => {
  await openEditorOnOrders(page);
  await expect(page.getByTestId('result-empty')).toBeVisible();

  await page.getByTestId('add-measures').selectOption('orders.count');

  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
  await expect(page.getByTestId('result-row-count')).toHaveText('1 rows');
  // 240 seeded orders.
  await expect(page.getByTestId('result-first-row')).toContainText('240');
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

  await page.getByRole('button', { name: /Remove orders.status/ }).click();

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
  await expect(page.getByTestId('recommended-type')).toHaveText('bar');
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
  await expect(page.getByTestId('chart-type')).toHaveText('bar');

  // Pick something the recommender did not choose.
  await page.getByLabel('Chart type').selectOption('pie');
  await expect(page.getByTestId('chart-type')).toHaveText('pie');

  // A field change moves the recommendation on; the chart must not follow.
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('recommended-type')).not.toHaveText('pie');
  await expect(page.getByTestId('chart-type')).toHaveText('pie');
});

test('"Back to recommended" hands the choice back', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await page.getByLabel('Chart type').selectOption('pie');
  await expect(page.getByTestId('chart-type')).toHaveText('pie');

  await page.getByTestId('back-to-recommended').click();

  await expect(page.getByTestId('chart-type')).toHaveText('bar');
  // And it follows the recommendation again from here on.
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  const recommended = await page.getByTestId('recommended-type').textContent();
  await expect(page.getByTestId('chart-type')).toHaveText(recommended!);
});

test('the option to go back appears only after a manual choice', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');

  await expect(page.getByTestId('back-to-recommended')).toBeHidden();

  await page.getByLabel('Chart type').selectOption('pie');

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
  await page.getByLabel('Chart type').selectOption('scatter');

  const message = page.getByTestId('missing-fields');
  await expect(message).toBeVisible();
  await expect(message).toContainText('Measures');
  await expect(message).toContainText('measures');
  await expect(message).toContainText('add 1 more');
});

test('the message goes away once the field is added', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByLabel('Chart type').selectOption('scatter');
  await expect(page.getByTestId('missing-fields')).toBeVisible();

  await page.getByTestId('add-measures').selectOption('orders.total_amount');

  await expect(page.getByTestId('missing-fields')).toBeHidden();
});

test('names every missing requirement, not only the first', async ({ page }) => {
  await openEditorOnOrders(page);
  await page.getByTestId('add-measures').selectOption('orders.count');

  // A heatmap wants a measure and two dimensions; there are no dimensions.
  await page.getByLabel('Chart type').selectOption('heatmap');

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
  await page.getByLabel('Chart type').selectOption('pie');
  await expect(page.getByTestId('chart-type')).toHaveText('pie');

  // Back through the type change...
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('chart-type')).not.toHaveText('pie');
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
  await page.getByLabel('Chart type').selectOption('pie');

  await page.getByTestId('discard').click();

  // Nothing applied: no cube, no fields, no manual type.
  await expect(page.getByTestId('no-cube-chosen')).toBeVisible();
  await expect(page.getByTestId('in-measures-orders.count')).toBeHidden();
  await expect(page.getByTestId('discard')).toBeDisabled();
});

test('nothing to undo or discard when the editor opens', async ({ page }) => {
  await page.goto('/explore/charts/new/edit');
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
  // Same columns as the chart asked for:
  expect(await underlying.locator('thead th').allTextContents()).toEqual([
    'orders.status',
    'orders.count',
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
  await page.goto('/explore/charts/new/edit');
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
    'customers.country',
    'customers.count',
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
    await page.getByLabel('Chart type').selectOption(chartType);
    await expect(page.getByTestId('chart-not-drawable')).toBeHidden();
  }
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
  await page.getByLabel('Title', { exact: true }).last().fill('Orders placed');
  await expect(canvas.getByText('Orders placed')).toBeVisible();

  // AC-035 says every change is undoable, and an axis edit is a change.
  await page.getByTestId('undo').click();
  await expect(canvas.getByText('Orders placed')).toBeHidden();
});

test('a time dimension goes to its own well and groups by day', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');

  await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
  // 240 orders, one per day.
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');
});
