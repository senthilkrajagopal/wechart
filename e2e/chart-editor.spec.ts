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

test('a time dimension goes to its own well and groups by day', async ({ page }) => {
  await openEditorOnOrders(page);

  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');

  await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
  // 240 orders, one per day.
  await expect(page.getByTestId('result-row-count')).toHaveText('240 rows');
});
