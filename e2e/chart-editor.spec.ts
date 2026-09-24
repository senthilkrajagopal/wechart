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
    await expect(page.getByTestId('chart-type')).toHaveText('bar');
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
    await expect(page.getByTestId('chart-type')).toHaveText('bar');
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
  // A library chart: shared from its folder.
  await expect(head.getByTestId('editor-ownership')).toHaveText('⛓ Shared');
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
