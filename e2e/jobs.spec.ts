import { expect, test } from '@playwright/test';

/**
 * AC-016: THE SYSTEM SHALL record, for every query it issues, the Cube
 * request, the duration and whether it was accelerated, and expose those
 * records in the Jobs workspace.
 *
 * T015 ticked this on the query log's own tests; the log was never mounted,
 * so the Jobs workspace showed nothing (found 2026-09-21). On the real
 * service: a dashboard's queries, then the Jobs workspace listing them.
 */
test('the Jobs workspace lists the queries a dashboard issued, with duration and source', async ({
  page,
}) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await expect(page.locator('[data-tile="tile-status"]').getByTestId('chart-canvas')).toBeVisible();

  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();

  const log = page.getByRole('table', { name: 'Queries wechart has issued, newest first' });
  const row = log.getByRole('row').filter({ hasText: 'orders.count' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/\d+ ms/);
  await expect(row).toContainText(/Live|orders\./);
});
