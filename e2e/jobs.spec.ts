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
 * Fails when: the job's terminal state is never shown, or the token is absent.
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
  const job = jobs.locator(':scope > li').first();
  const token = (await job.getByTestId('job-token').textContent()) ?? '';
  expect(token).toMatch(/^[0-9a-f]{16,}$/);
  // Followed while Cube builds it, to its end — a build takes a second or two.
  await expect(job.getByTestId('job-state')).toHaveAttribute('data-state', 'done', {
    timeout: 30_000,
  });
  // T158 / AC-152: in words, with its icon — never colour alone.
  await expect(job.getByTestId('job-state')).toHaveText('Done');
  await expect(job.getByTestId('job-state').locator('svg[data-icon="ok"]')).toHaveCount(1);
  await expect(job.getByTestId('job-table')).toContainText(
    'prod_pre_aggregations.monthly_orders_by_status_month',
  );

  // Cube's own record of that token agrees.
  const answered = (await (
    await page.request.post('/api/builds/status', { data: { tokens: [token] } })
  ).json()) as { status: string }[];
  expect(answered.map((each) => each.status)).toEqual(['done']);
});

/**
 * T162 / AC-156: THE SYSTEM SHALL show the refresh worker's state and the
 * Cube deployment's health, and mark the deployment as down when Cube's
 * health endpoint does not report healthy.
 * Fails when: the indicator stays healthy while Cube reports otherwise.
 *
 * On the real stack, whose Cube and refresh worker both answer their probes
 * healthy; then with the API answering that Cube is down — the browser's
 * only source for it — the header says so. (That the API calls anything but
 * Cube's HEALTH down is `packages/api/src/cube/health.test.ts`'s.)
 */
test('the Jobs header shows Cube’s health and the refresh worker’s, and a deployment down', async ({
  page,
}) => {
  await page.goto('/jobs');
  const cube = page.getByTestId('cube-health');
  const worker = page.getByTestId('worker-health');
  await expect(cube).toHaveText('Cube healthy', { timeout: 15_000 });
  await expect(cube.locator('svg[data-icon="ok"]')).toHaveCount(1);
  await expect(worker).toHaveText('Refresh worker running');
  expect(await (await page.request.get('/api/cube-health')).json()).toEqual({
    cube: 'healthy',
    worker: 'healthy',
  });

  // The page left open, as the header asks again on its own every 10 s — not
  // reloaded, which would prove only a first answer (T162's review).
  await page.route('**/api/cube-health', (route) =>
    route.fulfill({ json: { cube: 'down', worker: 'down' } }),
  );
  await expect(cube).toHaveText('Cube down', { timeout: 15_000 });
  await expect(cube.locator('svg[data-icon="err"]')).toHaveCount(1);
  await expect(worker).toHaveText('Refresh worker down');
});

/**
 * T239 / AC-229: THE SYSTEM SHALL list each pre-aggregation in Jobs with its
 * state as an icon and a label, the refresh key that triggers it, and its name
 * linking to its definition in Model, and SHALL show a started build's
 * progress in that row (direction.md rule 22).
 * `Fails when: a row has no state or no trigger, the name does not open Model,
 * or a build's progress appears only outside its row.`
 *
 * T239 / AC-228 (Jobs' half): … a list beside a full-height inspector pane,
 * and WHEN the user selects a pre-aggregation in Jobs, THE SYSTEM SHALL show
 * in that pane its state, its trigger, a Build action and a way to open it in
 * Model.
 * `Fails when: selecting a pre-aggregation shows nothing, or the pane is not
 * full height.`
 */
const ROLLUP = 'monthly_orders.by_status_month';

test('each pre-aggregation’s row has its state, its trigger, and its name leading to Model', async ({
  page,
}) => {
  await page.goto('/jobs');
  const row = page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP });
  await expect(row).toBeVisible();
  // Its state, as an icon and a label: not started from here yet.
  const state = row.getByTestId('row-state');
  await expect(state).toHaveText('Not built here');
  await expect(state.locator('svg[data-icon]')).toHaveCount(1);
  // What rebuilds it: the model's refresh key, as the seed declares it.
  await expect(row.getByRole('cell').nth(2)).toHaveText('Every 1 hour');

  // A build's progress is said in its own row: processing, then done — over
  // two partitions, the second behind the first, so "Done" waits for both.
  // Cube's build is answered here, not asked for: the real build is AC-149's
  // test's, and another build of this one rollup at once makes Cube report a
  // partition missing to one of them (meta-extended-pre-aggregations.md).
  let asked = 0;
  await page.route('**/api/builds', (route) =>
    route.fulfill({ json: { tokens: ['t-2025', 't-2026'] } }),
  );
  await page.route('**/api/builds/status', (route) => {
    asked += 1;
    return route.fulfill({
      json:
        asked < 2
          ? [{ token: 't-2025', status: 'processing', finished: false }]
          : asked < 3
            ? [
                { token: 't-2025', status: 'done', finished: true },
                { token: 't-2026', status: 'scheduled', finished: false },
              ]
            : [
                { token: 't-2025', status: 'done', finished: true },
                { token: 't-2026', status: 'done', finished: true },
              ],
    });
  });
  await row.getByRole('button', { name: `Build ${ROLLUP}` }).click();
  await expect(state).toHaveText('Processing');
  await expect(state).toHaveText('Scheduled');
  await expect(state).toHaveAttribute('data-state', 'done');
  await expect(state).toHaveText('Done');
  await expect(state.locator('svg[data-icon="ok"]')).toHaveCount(1);

  // Its name opens its definition in Model.
  await row.getByRole('link', { name: ROLLUP }).click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Fmonthly_orders\.yml$/);
});

test('selecting a pre-aggregation fills the full-height pane with its state, trigger, Build and Model link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/jobs');
  const row = page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP });
  // By the keyboard: the row focused, and Enter.
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-selected', 'true');

  const pane = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(ROLLUP);
  await expect(pane.getByTestId('pane-state')).toHaveText('Not built here');
  await expect(pane.locator('dd').nth(1)).toHaveText('Every 1 hour');
  await expect(pane.getByRole('link', { name: 'Open in Model' })).toHaveAttribute(
    'href',
    '/model/files/cubes%2Fmonthly_orders.yml',
  );
  // Full height: below the app bar, and down to the window's bottom — not past it.
  const box = await pane.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(48);
  const bottom = (box?.y ?? 0) + (box?.height ?? 0);
  expect(bottom).toBeGreaterThan(900 - 24);
  expect(bottom).toBeLessThanOrEqual(900);

  // Build now starts a build of it, followed in the pane (answered here, as above).
  await page.route('**/api/builds', (route) => route.fulfill({ json: { tokens: ['t-pane'] } }));
  await page.route('**/api/builds/status', (route) =>
    route.fulfill({ json: [{ token: 't-pane', status: 'done', finished: true }] }),
  );
  await pane.getByRole('button', { name: 'Build now' }).click();
  await expect(pane.getByTestId('pane-state')).toHaveText('Done');
  await expect(pane.getByRole('list', { name: `Jobs building ${ROLLUP}` })).toContainText('t-pane');
});
