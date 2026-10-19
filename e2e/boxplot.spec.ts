import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { ownCubeFile, PUBLISHED } from './model-files';
import { wellPicker } from './wells';
import { IN_MY_WORKSPACE, newInMyWorkspace } from './workspace';

const API = 'http://localhost:4100';

/**
 * T399 / AC-306: WHEN the user draws a box plot of a numeric value by a
 * category, THE SYSTEM SHALL draw one box per category with its median and
 * quartiles, computed by linear interpolation (type 7). Its whiskers follow a
 * chart option: by default Tukey's … or else the minimum and maximum.
 *
 * The real surface: the chart editor, against the seeded Cube. The numbers
 * themselves are checked against PostgreSQL's percentile_cont in
 * packages/api/src/stats/boxplot-oracle.test.ts, and the drawing of each box in
 * packages/charts/src/series/boxplot.test.ts.
 */
test('a box plot of order amounts by status draws a box per status from the rows', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/edit\?new=true$/);

  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');

  // The box plot asks Cube for the rows themselves, ungrouped.
  const asked = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/load') &&
      (request.postDataJSON() as { query?: { ungrouped?: boolean } }).query?.ungrouped === true,
  );
  // "Each point is" is a box plot's alone (T400's review): not there before.
  await expect(page.getByTestId('well-eachPointIs')).toHaveCount(0);
  await chooseChartType(page, 'boxplot');
  await expectChartType(page, 'boxplot');
  await expect(page.getByTestId('well-eachPointIs')).toContainText('Each row');
  const query = (await asked).postDataJSON() as { query: Record<string, unknown> };
  // Unordered, so past the limit the rows are not one tail (T399's review).
  expect(query.query).toEqual({
    measures: ['orders.total_amount'],
    dimensions: ['orders.status'],
    ungrouped: true,
    order: [],
    limit: 50_000,
    // And all the rows' count, to tell when the limit cut them (T401).
    total: true,
  });

  // A box per status on the category axis.
  const chart = page.getByTestId('editor-result').locator('svg').first();
  for (const status of ['completed', 'processing', 'shipped']) {
    await expect(chart, status).toContainText(status);
  }
  await expect(chart.locator('path[d*="Z"]').first()).toBeVisible();
});

/** A saved box plot of order amounts by status, each point a row or `eachPointIs`. */
async function boxPlot(
  request: APIRequestContext,
  filters: unknown[],
  eachPointIs?: string,
): Promise<string> {
  const created = await request.post(`${API}/api/documents`, {
    data: { kind: 'chart', title: `Box plot ${String(Date.now())}`, ...IN_MY_WORKSPACE },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`${API}/api/documents/chart/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.total_amount'],
            dimensions: ['orders.status'],
            timeDimensions: [],
            ...(eachPointIs === undefined ? {} : { eachPointIs }),
          },
          chartType: 'boxplot',
          filters,
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return id;
}

/**
 * The dots beyond the whiskers: drawn at 60 % (direction.md rule 88), which
 * ECharts' SVG writes as `fill-opacity` in the browser and `opacity` on the server.
 */
const dotsIn = (chart: Locator) => chart.locator('path[fill-opacity="0.6"], path[opacity="0.6"]');

test('the whisker option decides whether a far value is a dot or the whisker’s end', async ({
  page,
  request,
}) => {
  // Amounts are 50 + 7.5 × id, and every third order is completed: these five
  // are $72.50, $95, $117.50 and $140, and $1,850 far beyond them, which
  // Tukey's fences (Q1 − 1.5 × IQR, Q3 + 1.5 × IQR = $207.50) leave outside.
  const id = await boxPlot(request, [
    { member: 'orders.id', operator: 'equals', values: ['3', '6', '9', '12', '240'] },
  ]);
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'boxplot');

  const chart = page.getByTestId('editor-result').locator('svg').first();
  await expect(chart).toContainText('completed');
  // Tukey's by default: one dot, the $1,850 order.
  await expect(dotsIn(chart)).toHaveCount(1);

  // The box drawn is these five values' type-7 statistics, which its tooltip
  // lists (rule 88): Q1 $95, median $117.50, Q3 $140, whiskers to $72.50 and $140.
  await chart.locator('path[fill="#fff"]').first().hover();
  await expect(page.getByTestId('editor-result')).toContainText(
    /n: 5\s*Minimum: \$72\.50?\s*Q1: \$95(\.00)?\s*Median: \$117\.50?\s*Q3: \$140(\.00)?\s*Maximum: \$1,850(\.00)?\s*Whiskers: \$72\.50? – \$140(\.00)?/,
  );

  await page.getByRole('tab', { name: 'Customize' }).click();
  const whiskers = page.getByRole('radiogroup', { name: 'Whiskers' });
  await expect(whiskers.getByRole('radio', { name: /1\.5 × IQR/ })).toBeChecked();
  // Nothing a box plot can't use: no legend or data labels.
  await expect(page.getByRole('checkbox', { name: 'Data labels' })).toHaveCount(0);
  await whiskers.getByRole('radio', { name: 'Minimum and maximum' }).click();
  await expect(whiskers.getByRole('radio', { name: 'Minimum and maximum' })).toBeChecked();

  // The whisker now runs to $1,850, and nothing is left beyond it.
  await expect(dotsIn(chart)).toHaveCount(0);
  await expect(chart).toContainText('completed');

  // And back: the dot returns.
  await whiskers.getByRole('radio', { name: /1\.5 × IQR/ }).click();
  await expect(dotsIn(chart)).toHaveCount(1);
});

/**
 * T400 / AC-314: WHEN the user sets a box plot's "Each point is" field (for
 * example Order ID), THE SYSTEM SHALL compute the measure once per value of
 * that field within each category, and draw the boxes from those values.
 * `Fails when: with "Each point is" set to Order ID, a box's values are not one per order.`
 *
 * The seed has 80 completed orders, spread over four customers (customer
 * 1 + id mod 4). Each point an order: 80 points. Each point a customer: 4, the
 * sums of each one's completed orders — $18,550, $19,000, $19,450 and $19,900.
 */
test('"Each point is" computes the measure once per its value within each category', async ({
  page,
  request,
}) => {
  const id = await boxPlot(request, [
    { member: 'orders.status', operator: 'equals', values: ['completed'] },
  ]);
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'boxplot');
  const result = page.getByTestId('editor-result');
  const chart = result.locator('svg').first();
  const box = chart.locator('path[fill="#fff"]').first();
  const asked = (dimensions: string[]) =>
    page.waitForRequest((request) => {
      if (!request.url().endsWith('/api/load')) return false;
      const { query } = request.postDataJSON() as { query?: { dimensions?: string[] } };
      return JSON.stringify(query?.dimensions) === JSON.stringify(dimensions);
    });

  // Unset, each row is a point, ungrouped: the seed's rows are one per order,
  // so the Order ID leg draws the same 80 — its grouping is the query's to show.
  const well = page.getByTestId('well-eachPointIs');
  await expect(well).toContainText('Each row');
  await box.hover();
  await expect(result).toContainText(/n: 80\s*Minimum: \$72\.50?/);

  // Each point an order: Cube groups by status and order, one value per order.
  const byOrder = asked(['orders.id', 'orders.status']);
  await wellPicker(page, 'eachPointIs').selectOption('orders.id');
  expect(((await byOrder).postDataJSON() as { query: Record<string, unknown> }).query).toEqual({
    measures: ['orders.total_amount'],
    dimensions: ['orders.id', 'orders.status'],
    filters: [{ member: 'orders.status', operator: 'equals', values: ['completed'] }],
    order: [],
    limit: 50_000,
    total: true,
  });
  await expect(well.getByTestId('in-eachPointIs-orders.id')).toBeVisible();
  await box.hover();
  await expect(result).toContainText(/n: 80\s*Minimum: \$72\.50?\s*Q1/);

  // Saved, the chart keeps it, and its own page asks and draws the same.
  const onItsPage = asked(['orders.id', 'orders.status']);
  await page.getByTestId('editor-bar').getByRole('button', { name: 'Save chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  await onItsPage;
  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    body: { chart: { wells: Record<string, unknown> } };
  };
  expect(stored.body.chart.wells['eachPointIs']).toBe('orders.id');
  const tile = page.locator('.chart-page__tile');
  await tile.locator('svg path[fill="#fff"]').first().hover();
  await expect(tile).toContainText(/n: 80\s*Minimum: \$72\.50?/);

  // Each point a customer — a member of the cube the chart joins, as a stored
  // chart may name (AC-220): the measure once per customer, four sums.
  const byCustomer = await boxPlot(
    request,
    [{ member: 'orders.status', operator: 'equals', values: ['completed'] }],
    'customers.name',
  );
  const perCustomer = asked(['customers.name', 'orders.status']);
  await page.goto(`/explore/charts/${byCustomer}`);
  await perCustomer;
  await tile.locator('svg path[fill="#fff"]').first().hover();
  await expect(tile).toContainText(
    /n: 4\s*Minimum: \$18,550(\.00)?\s*Q1: \$18,887\.50?\s*Median: \$19,225(\.00)?\s*Q3: \$19,562\.50?\s*Maximum: \$19,900(\.00)?/,
  );
  // Its editor names it by its title, and can put it back to each row.
  await page.goto(`/explore/charts/${byCustomer}/edit`);
  await expect(well.getByTestId('in-eachPointIs-customers.name')).toContainText('Customers Name');
  await well.getByRole('button', { name: 'Remove Customers Name from Each point is' }).click();
  await expect(well).toContainText('Each row');
  await box.hover();
  await expect(result).toContainText(/n: 80\s*Minimum: \$72\.50?/);
});

/**
 * T401 / AC-315: IF a box plot's data has more rows than Cube returns in one
 * query, THEN THE SYSTEM SHALL draw the boxes from the rows returned and show
 * "computed from _n_ of _N_ rows" on the tile.
 * `Fails when: a box plot drawn from fewer rows than the data holds shows no
 * such warning, or its counts differ from the rows used and the query's total.`
 *
 * Against the real Cube, which returns at most 50,000 rows to a query: a cube
 * of this browser's own over 50,100 generated rows, on a dashboard tile and
 * on its chart's page.
 */
test('a box plot past Cube’s row limit says it was computed from 50,000 of 50,100 rows', async ({
  page,
  request,
}, testInfo) => {
  const cube = `box_rows_${testInfo.project.name}`;
  await ownCubeFile(
    request,
    cube,
    [
      'cubes:',
      `  - name: ${cube}`,
      "    sql: SELECT g AS id, 'g' || (g % 3) AS grp, g AS v FROM generate_series(1, 50100) AS g",
      '    dimensions:',
      '      - name: id',
      '        sql: id',
      '        type: number',
      '        primary_key: true',
      '      - name: grp',
      '        sql: grp',
      '        type: string',
      '    measures:',
      '      - name: v',
      '        sql: v',
      '        type: sum',
      '',
    ].join('\n'),
  );
  const title = `Box rows ${String(Date.now())}`;
  const chart = (await (
    await request.post(`${API}/api/documents`, {
      data: { kind: 'chart', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const saved = await request.put(`${API}/api/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        owner: 'admin',
        ...IN_MY_WORKSPACE,
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.v`], dimensions: [`${cube}.grp`], timeDimensions: [] },
          chartType: 'boxplot',
        },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const dashboard = (await (
    await request.post(`${API}/api/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const placed = await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-box', kind: 'chart', w: 12, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);

  // A box per group, drawn, and the warning with its icon.
  await page.goto(`/explore/dashboards/${dashboard.id}`);
  const tile = page.locator('[data-tile="tile-box"]');
  const warning = tile.getByTestId('row-limit-warning');
  await expect(warning).toHaveText('Computed from 50,000 of 50,100 rows', PUBLISHED);
  await expect(warning.locator('svg[data-icon="warn"]')).toHaveCount(1);
  for (const group of ['g0', 'g1', 'g2'])
    await expect(
      tile.locator('svg text').filter({ hasText: new RegExp(`^${group}$`) }),
    ).toHaveCount(1);

  // Edited over the dashboard (T401's review): said in the editor's preview,
  // where box plots are built, and on the tile redrawn from the draft.
  await page.getByTestId('edit-chart-tile-box').click();
  const overlay = page.getByTestId('chart-editor-overlay');
  await expect(overlay.getByTestId('row-limit-warning')).toHaveText(
    'Computed from 50,000 of 50,100 rows',
    PUBLISHED,
  );
  await overlay.getByRole('tab', { name: 'Customize' }).click();
  await overlay
    .getByRole('radiogroup', { name: 'Whiskers' })
    .getByRole('radio', { name: 'Minimum and maximum' })
    .click();
  await page.getByTestId('editor-back').click();
  await expect(overlay).toBeHidden();
  await expect(tile.getByTestId('row-limit-warning')).toHaveText(
    'Computed from 50,000 of 50,100 rows',
    PUBLISHED,
  );
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: /Discard/ })
    .click();

  // On its chart's page too, where the boxes are drawn from the rows used:
  // a third of 50,000 each, the tooltip's n.
  await page.goto(`/explore/charts/${chart.id}`);
  const onPage = page.locator('.chart-page__tile');
  await expect(onPage.getByTestId('row-limit-warning')).toHaveText(
    'Computed from 50,000 of 50,100 rows',
  );
  await onPage.locator('svg path[fill="#fff"]').first().hover();
  await expect(onPage).toContainText(/n: 16,66[67]/);
});

/**
 * T990 / AC-591: THE SYSTEM SHALL offer on a box plot Customize ›
 * Distribution: Points, one of None, Outliers (the default, as drawn today),
 * All or Beeswarm, and Violin, on or off; WHILE Each point is is empty, All,
 * Beeswarm and Violin SHALL be disabled, each with "Points need Each point is:
 * choose what one point is, such as an Order."
 * `Fails when: a choice is missing or another is offered; the default isn't
 * Outliers; or All, Beeswarm or Violin can be chosen without Each point is, or
 * is disabled without the reason.`
 *
 * The real surface: the chart editor's Customize tab on a saved box plot. How
 * All, Beeswarm and Violin draw is T991's and T992's.
 */
test('a box plot’s Distribution offers its points and violin once Each point is is set', async ({
  page,
  request,
}) => {
  const reason = 'Points need Each point is: choose what one point is, such as an Order.';
  const id = await boxPlot(request, []);
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'boxplot');

  await page.getByRole('tab', { name: 'Customize' }).click();
  await expect(page.getByRole('heading', { name: 'Distribution' })).toBeVisible();
  const points = page.getByRole('radiogroup', { name: 'Points' });
  await expect(points.getByRole('radio')).toHaveCount(4);
  const radio = (name: string) => points.getByRole('radio', { name, exact: true });
  const violin = page.getByRole('checkbox', { name: /^Violin/ });
  // Outliers by default, as a box plot saved before R81 draws.
  await expect(radio('Outliers')).toBeChecked();
  await expect(radio('None')).toBeEnabled();

  // Each point is empty: All, Beeswarm and Violin are disabled, each with why.
  for (const control of [radio('All'), radio('Beeswarm'), violin]) {
    await expect(control).toBeDisabled();
    await expect(control).toHaveAccessibleDescription(reason);
  }
  await expect(page.getByText(reason)).toHaveCount(1);

  // Each point an order: every choice is open, with no reason left.
  await page.getByRole('tab', { name: 'Data' }).click();
  await wellPicker(page, 'eachPointIs').selectOption('orders.id');
  await expect(
    page.getByTestId('well-eachPointIs').getByTestId('in-eachPointIs-orders.id'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Customize' }).click();
  for (const control of [radio('All'), radio('Beeswarm'), violin])
    await expect(control).toBeEnabled();
  await expect(page.getByText(reason)).toHaveCount(0);
  await radio('Beeswarm').check();
  await violin.check();

  // Saved with the chart, and read back as chosen.
  await page.getByTestId('editor-bar').getByRole('button', { name: 'Save chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    body: { chart: { options?: Record<string, unknown> } };
  };
  expect(stored.body.chart.options?.['distribution']).toEqual({ points: 'beeswarm', violin: true });
  await page.goto(`/explore/charts/${id}/edit`);
  await page.getByRole('tab', { name: 'Customize' }).click();
  await expect(radio('Beeswarm')).toBeChecked();
  await expect(violin).toBeChecked();
});

/**
 * T991 / AC-306, AC-592 (points): Points as None, Outliers, All or Beeswarm,
 * drawn in the editor's preview. `Fails when: … a box plot with Points at
 * Outliers draws other than before R81` (AC-306); `a size or opacity
 * differs; two Beeswarm points overlap; two draws of the same data place a
 * point differently` (AC-592).
 *
 * Each point an order: the seed's 240 orders, 80 a status, $22.50 apart
 * within each, so a Beeswarm has to place them side by side.
 */
test('a box plot draws its points as None, Outliers, All or Beeswarm, the swarm without overlap', async ({
  page,
  request,
}) => {
  const id = await boxPlot(request, [], 'orders.id');
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'boxplot');
  const chart = page.getByTestId('editor-result').locator('svg').first();
  await expect(chart).toContainText('completed');
  // Outliers, as before R81: evenly spread amounts leave none beyond the whiskers.
  await expect(dotsIn(chart)).toHaveCount(0);

  await page.getByRole('tab', { name: 'Customize' }).click();
  const radio = (name: string) =>
    page.getByRole('radiogroup', { name: 'Points' }).getByRole('radio', { name, exact: true });
  const centres = () =>
    dotsIn(chart).evaluateAll((dots) =>
      dots.map((dot) => {
        const box = dot.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, size: box.width };
      }),
    );

  await radio('None').check();
  await expect(dotsIn(chart)).toHaveCount(0);

  await radio('All').check();
  await expect(dotsIn(chart)).toHaveCount(240);
  const jittered = await centres();
  for (const dot of jittered) expect(Math.round(dot.size)).toBe(8);

  await radio('Beeswarm').check();
  await expect(dotsIn(chart)).toHaveCount(240);
  const swarm = await centres();
  let closest = Number.POSITIVE_INFINITY;
  for (let a = 0; a < swarm.length; a += 1)
    for (let b = a + 1; b < swarm.length; b += 1)
      closest = Math.min(closest, Math.hypot(swarm[a]!.x - swarm[b]!.x, swarm[a]!.y - swarm[b]!.y));
  expect(closest).toBeGreaterThanOrEqual(7.9);

  // Drawn again, every point lands where it was.
  await radio('All').check();
  await expect.poll(centres).toEqual(jittered);
  await radio('Beeswarm').check();
  await expect.poll(centres).toEqual(swarm);

  // And back to Outliers: as it drew before.
  await radio('Outliers').check();
  await expect(dotsIn(chart)).toHaveCount(0);
  await expect(chart.locator('path[fill="#fff"]')).not.toHaveCount(0);
});
