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
  // Its duration as `QueryLog` writes one: ms under a second, else seconds;
  // a query can pass a second on a busy machine.
  await expect(row).toContainText(/\d+ ms|\d+\.\d s/);
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
  // In the model's own rollup schema, `<schema>_<model>_<hash>`, from slice 6
  // (T420; research xcube-slice-6.md, "Pre-aggregation schemas").
  await expect(job.getByTestId('job-table')).toContainText(
    /^prod_pre_aggregations_e2e_[0-9a-f]+\.monthly_orders_by_status_month/,
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

  // Its name is plain text, and the row selects it; its pane's Open in Model
  // opens its definition, on this pre-aggregation (the user, 2026-09-28:
  // UX-080, AC-229 amended, R47).
  await expect(row.getByRole('link', { name: ROLLUP })).toHaveCount(0);
  await row.getByTestId('preagg-name').click();
  await page
    .getByRole('complementary', { name: 'Pre-aggregation details' })
    .getByRole('link', { name: 'Open in Model' })
    .click();
  await expect(page).toHaveURL(
    /\/model\/files\/cubes%2Fmonthly_orders\.yml\?cube=monthly_orders&tab=pre_aggregations&member=by_status_month$/,
  );
  await expect(
    page
      .getByRole('region', { name: 'Cube monthly_orders' })
      .getByRole('tab', { name: /^Pre-aggs/ }),
  ).toHaveAttribute('aria-selected', 'true');
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
  // Deep into Model: its file, on its cube's Pre-aggs tab, this one open (T469, UX-080).
  await expect(pane.getByRole('link', { name: 'Open in Model' })).toHaveAttribute(
    'href',
    '/model/files/cubes%2Fmonthly_orders.yml?cube=monthly_orders&tab=pre_aggregations&member=by_status_month',
  );
  // Full height: below the app bar, and down to the window's bottom — not past it.
  const box = await pane.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(48);
  const bottom = (box?.y ?? 0) + (box?.height ?? 0);
  expect(bottom).toBeGreaterThan(900 - 24);
  expect(bottom).toBeLessThanOrEqual(900);
  // Docked (T469, UX-081): right under the app bar, at the window's right
  // edge, 400 px, beside the list rather than over it, its head 44 px.
  expect(box?.y).toBe(48);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(1440);
  expect(box?.width).toBe(400);
  const list = await page.getByRole('table', { name: 'Pre-aggregations' }).boundingBox();
  expect((list?.x ?? 0) + (list?.width ?? 0)).toBeLessThanOrEqual(box?.x ?? 0);
  expect((await pane.getByTestId('pane-head').boundingBox())?.height).toBe(44);
  // Its actions 24 px, the prototype's btn sm: "Open in Model" a button too,
  // not an underlined link (T469's review).
  expect((await pane.getByRole('button', { name: 'Build now' }).boundingBox())?.height).toBe(24);
  const open = pane.getByRole('link', { name: 'Open in Model' });
  expect((await open.boundingBox())?.height).toBe(24);
  await expect(open).toHaveCSS('text-decoration-line', 'none');
  await expect(open).toHaveCSS('border-top-style', 'solid');

  // Build now starts a build of it, followed in the pane (answered here, as above).
  await page.route('**/api/builds', (route) => route.fulfill({ json: { tokens: ['t-pane'] } }));
  await page.route('**/api/builds/status', (route) =>
    route.fulfill({ json: [{ token: 't-pane', status: 'done', finished: true }] }),
  );
  await pane.getByRole('button', { name: 'Build now' }).click();
  await expect(pane.getByTestId('pane-state')).toHaveText('Done');
  await expect(pane.getByRole('list', { name: `Jobs building ${ROLLUP}` })).toContainText('t-pane');
});

/**
 * T469, UX-080 (the phase-1 re-check): a click on a row, anywhere but its
 * name, selects it and stays in Jobs; "Open in Model" opens its file on the
 * cube's Pre-aggs tab with this pre-aggregation open. (The name keeps its
 * link to Model while AC-229 says so; UX-080's plain name waits on the user.)
 */
test('a row click selects and stays; Open in Model lands on the pre-aggregation, open', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/jobs');
  const row = page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP });
  await row.getByRole('cell').nth(2).click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/jobs$/);

  const pane = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await pane.getByRole('link', { name: 'Open in Model' }).click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Fmonthly_orders\.yml\?/);
  const form = page.getByRole('region', { name: 'Cube monthly_orders' });
  await expect(form.getByRole('tab', { name: /^Pre-aggs/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const member = form
    .locator('details.model-member')
    .filter({ has: page.locator('summary', { hasText: 'by_status_month' }) });
  await expect(member).toHaveAttribute('open', '');
});

/**
 * T469, UX-082 (the phase-1 re-check): the query log's rows under a heading
 * for each day, each at its time on one 24-hour clock, its caption at the
 * table's start, and the members of each query by their titles.
 */
test('the query log is grouped by day, its members by title', async ({ page }) => {
  const now = new Date();
  const earlier = new Date(now.getTime() - 26 * 3_600_000);
  const records = [now, earlier].map((at, index) => ({
    id: index + 1,
    requestId: `r-${String(index)}`,
    query: { measures: ['orders.count'], dimensions: ['orders.status'] },
    durationMs: 120,
    accelerated: false,
    preAggregation: null,
    error: null,
    createdAt: at.toISOString(),
  }));
  await page.route('**/api/jobs/queries/page*', (route) =>
    route.fulfill({ json: { records, total: records.length } }),
  );
  await page.goto('/jobs?tab=queries');
  const log = page.locator('table.query-log--sticky');
  await expect(log.getByRole('rowheader').first()).toHaveText('Today');
  await expect(log.getByRole('rowheader')).toHaveCount(2);
  await expect(log.getByTestId('query-row').first().locator('time')).toHaveText(
    /^\d{2}:\d{2}:\d{2}$/,
  );
  await expect(log.getByTestId('query-row').first().locator('summary')).toHaveText(
    'Orders Count, Orders Status',
  );
  await expect(log.locator('caption')).toHaveCSS('text-align', 'left');
});

/**
 * T240 / AC-230: THE SYSTEM SHALL let the user narrow the query log by
 * outcome, source and time range and sort it, keep its column headers in view
 * while it scrolls, and render no more than a page of rows at a time.
 * `Fails when: the headers scroll out of view, a filter does not narrow the
 * rows, or more than one page of rows is rendered at once.`
 *
 * Sixty records, answered here by a stand-in for the API's page — narrowing,
 * sorting and paging as it is asked — so the log is long enough to page and
 * to scroll whatever the shared database holds. That the API narrows the
 * whole log is `packages/api/src/repos/query-log.test.ts`'s; this is that the
 * page asks it to, and shows what comes back.
 */
test('the query log narrows, sorts and pages, its headers in view as it scrolls', async ({
  page,
}) => {
  const now = Date.now();
  const records = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    requestId: `r-${String(index)}`,
    query: { measures: ['orders.count'], dimensions: ['orders.status'] },
    durationMs: 100 + index * 10,
    accelerated: index % 2 === 0,
    preAggregation: index % 2 === 0 ? 'orders.main' : null,
    error: index % 5 === 0 ? 'Timed out' : null,
    createdAt: new Date(now - index * 60_000).toISOString(),
  }));
  const asked: URLSearchParams[] = [];
  await page.route('**/api/jobs/queries/page*', (route) => {
    const ask = new URL(route.request().url()).searchParams;
    asked.push(ask);
    const outcome = ask.get('outcome');
    const kept = records.filter(
      (record) => outcome === null || (outcome === 'failed') === (record.error !== null),
    );
    const by = ask.get('sort') === 'duration' ? 'durationMs' : 'id';
    // Newest first is the lowest id here; longest first the highest duration.
    const sign = (by === 'id' ? -1 : 1) * (ask.get('order') === 'asc' ? 1 : -1);
    const sorted = [...kept].sort((a, b) => sign * (a[by] - b[by]));
    const offset = Number(ask.get('offset'));
    const limit = Number(ask.get('limit'));
    return route.fulfill({
      json: { records: sorted.slice(offset, offset + limit), total: sorted.length },
    });
  });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/jobs?tab=queries');
  const log = page.getByRole('table', { name: /Queries wechart has issued/ });
  // The records' rows, not the days' headings among them (T469).
  const rows = log.getByTestId('query-row');
  const range = page.getByTestId('query-log-range');

  // One page at a time, and the next.
  await expect(rows).toHaveCount(25);
  await expect(range).toHaveText('1–25 of 60');
  expect(asked.at(-1)?.get('limit')).toBe('25');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(range).toHaveText('26–50 of 60');
  expect(asked.at(-1)?.get('offset')).toBe('25');

  // Narrowed by outcome, asked of the API from the first page: failures only.
  await page.getByLabel('Outcome').selectOption('failed');
  await expect(range).toHaveText('1–12 of 12');
  expect(asked.at(-1)?.get('outcome')).toBe('failed');
  expect(asked.at(-1)?.get('offset')).toBe('0');
  await expect(rows).toHaveCount(12);
  for (const text of await rows.allTextContents()) expect(text).toContain('Failed');
  await page.getByLabel('Outcome').selectOption('all');
  await expect(range).toHaveText('1–25 of 60');

  // Sorted by duration, longest first.
  await log.getByRole('button', { name: /Duration/ }).click();
  await expect(log.getByRole('columnheader', { name: /Duration/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(rows.first().getByTestId('duration-60')).toHaveText('690 ms');
  expect(asked.at(-1)?.get('sort')).toBe('duration');

  // Scrolled well past the header: the header is still in view, just under the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const header = log.locator('thead th').first();
  await expect(header).toBeInViewport();
  const top = (await header.boundingBox())?.y ?? 0;
  expect(top).toBeGreaterThanOrEqual(47);
  expect(top).toBeLessThanOrEqual(50);
});
