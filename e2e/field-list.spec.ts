import { expect, test } from '@playwright/test';

/**
 * AC-025: WHEN the user opens the chart editor, THE SYSTEM SHALL list the cubes
 * and views available from `/v1/meta` and, once one is chosen, its measures,
 * dimensions, segments and time dimensions grouped by type.
 *
 * AC-007: WHEN the browser needs data or metadata, THE SYSTEM SHALL obtain it
 * through the wechart API, and the browser SHALL make no request to the Cube
 * API host.
 *
 * AC-007 has waited since T004 for this: until the browser genuinely needed
 * metadata, "no request went to Cube" was true of a page that made no requests
 * at all. Here the page must fetch, so the assertion can fail.
 */
const CUBE_HOST_PORT = '54000';

test('lists the cubes and views from the model', async ({ page }) => {
  await page.goto('/explore/charts/new/edit');

  const picker = page.getByLabel('Cube or view');
  await expect(picker).toBeVisible();

  const options = await picker.locator('option').allTextContents();
  expect(options).toContain('Orders');
  expect(options).toContain('Customers');
  expect(options).toContain('Products');
});

test('shows a chosen cube’s members grouped by type', async ({ page }) => {
  await page.goto('/explore/charts/new/edit');
  await expect(page.getByTestId('no-cube-chosen')).toBeVisible();

  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });

  // Measures, dimensions and time dimensions are separate groups.
  await expect(page.getByTestId('group-measure')).toBeVisible();
  await expect(page.getByTestId('group-dimension')).toBeVisible();
  await expect(page.getByTestId('group-timeDimension')).toBeVisible();

  // Every member the model declares is present.
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await expect(page.getByTestId('member-orders.total_amount')).toBeVisible();
  await expect(page.getByTestId('member-orders.average_amount')).toBeVisible();
  await expect(page.getByTestId('member-orders.status')).toBeVisible();

  // The time dimension is in the time group, not among the plain dimensions.
  await expect(
    page.getByTestId('group-timeDimension').getByTestId('member-orders.ordered_at'),
  ).toBeVisible();
});

test('the browser asks wechart for metadata and never Cube (AC-007)', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto('/explore/charts/new/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  // It really did fetch metadata -- otherwise the next assertion proves nothing.
  expect(requested.filter((url) => url.includes('/api/meta'))).not.toHaveLength(0);
  // ...and nothing went to the Cube host.
  expect(requested.filter((url) => url.includes(`:${CUBE_HOST_PORT}`))).toEqual([]);
  expect(requested.filter((url) => url.includes('/cubejs-api/'))).toEqual([]);
});

test('no response reaching the browser carries the Cube secret (AC-007)', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await page.goto('/explore/charts/new/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  expect(bodies.some((body) => body.includes('dev-secret'))).toBe(false);
});
