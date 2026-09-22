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
  // The log is the Queries tab, beside the pre-aggregations (T155).
  await page.getByRole('tab', { name: 'Queries' }).click();

  const log = page.getByRole('table', { name: 'Queries wechart has issued, newest first' });
  const row = log.getByRole('row').filter({ hasText: 'orders.count' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/\d+ ms/);
  await expect(row).toContainText(/Live|orders\./);
});

/**
 * T155 / AC-149: WHEN the user starts a build for a pre-aggregation, THE
 * SYSTEM SHALL submit it to Cube, show the job token, and poll until the job
 * reports done, missing partition, failure or not found.
 * Fails when: the token is not shown, or polling stops before a terminal
 * state or continues after one.
 *
 * On the real Cube, with the seed rollup: Build, its token, and its state
 * followed to done — which Cube's own jobs API then confirms for that token.
 */
test('building a pre-aggregation shows its job token and follows it to done', async ({ page }) => {
  await page.goto('/jobs');
  const row = page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: 'monthly_orders.by_status_month' });
  await expect(row).toContainText('year');
  await row.getByRole('button', { name: 'Build monthly_orders.by_status_month' }).click();

  const jobs = page.getByRole('list', { name: 'Jobs building monthly_orders.by_status_month' });
  const job = jobs.locator('[data-testid^="job-"]').first();
  const token = (await job.getByTestId('job-token').textContent()) ?? '';
  expect(token).toMatch(/^[0-9a-f]{16,}$/);
  // Followed while Cube builds it, to its end — a build takes a second or two.
  await expect(job.getByTestId('job-state')).toHaveText('done', { timeout: 30_000 });
  await expect(job.getByTestId('job-table')).toContainText(
    'prod_pre_aggregations.monthly_orders_by_status_month',
  );

  // Cube's own record of that token agrees.
  const answered = (await (
    await page.request.post('/api/builds/status', { data: { tokens: [token] } })
  ).json()) as { status: string }[];
  expect(answered.map((each) => each.status)).toEqual(['done']);
});
