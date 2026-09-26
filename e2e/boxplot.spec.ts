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
  await chooseChartType(page, 'boxplot');
  await expectChartType(page, 'boxplot');
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

/** A saved box plot of order amounts by status. */
async function boxPlot(request: APIRequestContext, filters: unknown[]): Promise<string> {
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
