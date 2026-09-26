import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { wellPicker } from './wells';

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
  await page.goto('/explore?folder=seed-folder-0');
  const contents = page.getByTestId('explore-contents');
  await contents.getByRole('button', { name: 'New', exact: true }).click();
  await page
    .getByRole('menu', { name: 'New' })
    .getByRole('menuitem', { name: /Chart$/ })
    .click();
  await expect(page).toHaveURL(/\/edit\?new=true$/);

  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
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
    data: { kind: 'chart', title: `Box plot ${String(Date.now())}`, folderId: 'root' },
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
