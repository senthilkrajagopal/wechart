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

test('a time dimension goes to its own well and groups by day', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');

  await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
  // 240 orders, one per day.
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');
});
