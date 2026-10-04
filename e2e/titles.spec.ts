import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { IN_MY_WORKSPACE } from './workspace';

/**
 * T403 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it, and never by its internal name. That
 * covers legends, tooltips, table headers, well pills, marking chips, the
 * "Why this chart?" trace and the Acceleration tab. Where the member's cube or
 * view is evident (a pill, a legend or a KPI label of a one-source chart), it
 * SHALL use the member's short title, and its full title elsewhere.
 * `Fails when: any of those shows a name such as "orders.count", or a
 * one-source chart's legend or KPI label repeats the source's title.`
 *
 * Against the sample model: `orders` has no rollups, and joins `customers`.
 */
const API = 'http://localhost:4100/api';

/** An internal member name of the sample model's, as a person must never read it. */
const INTERNAL = /\b(orders|customers)\.[a-z_]+/;

async function openEditorOnOrders(page: Page) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
}

/** The chart's largest filled mark, to hover or click. */
async function largestMark(canvas: Locator) {
  const marks = await canvas.locator('svg path').evaluateAll((paths) =>
    paths
      .map((path) => {
        const box = path.getBoundingClientRect();
        const fill = path.getAttribute('fill') ?? 'none';
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          area: box.width * box.height,
          fill,
        };
      })
      .filter((mark) => mark.fill !== 'none' && mark.fill !== 'transparent' && mark.area > 50)
      .sort((a, b) => b.area - a.area),
  );
  const mark = marks[0];
  expect(mark).toBeDefined();
  return mark ?? { x: 0, y: 0 };
}

test('a one-source chart’s legend and pills read short titles, the rest of the editor full ones, never names', async ({
  page,
}) => {
  await openEditorOnOrders(page);
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  const canvas = page.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();

  // The legend: every member is Orders', so "Count", not "Orders Count".
  const written = canvas.locator('svg text');
  await expect(written.filter({ hasText: /^Count$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: /^Total Amount$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: /^Orders (Count|Total Amount)$/ })).toHaveCount(0);
  await expect(written.filter({ hasText: INTERNAL })).toHaveCount(0);

  // The pills: short titles too, the source being evident.
  for (const [pill, title] of [
    ['in-measures-orders.count', 'Count'],
    ['in-measures-orders.total_amount', 'Total Amount'],
    ['in-dimensions-orders.status', 'Status'],
  ] as const) {
    await expect(page.getByTestId(pill).locator('.pill__title')).toHaveText(title);
    await expect(page.getByTestId(pill)).not.toContainText(INTERNAL);
  }

  // The tooltip, by full title: "<series>: <value>".
  const mark = await largestMark(canvas);
  await page.mouse.move(mark.x, mark.y);
  const tooltip = canvas.locator('div').filter({ hasText: /Orders (Count|Total Amount): / });
  await expect(tooltip.last()).toBeVisible();
  await expect(tooltip.last()).not.toContainText(INTERNAL);

  // The results' headers, by full title.
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  const headers = page.getByTestId('drawer-result-rows').getByRole('columnheader');
  await expect(headers).toHaveText(['Orders Status', 'Orders Count', 'Orders Total Amount']);

  // The Acceleration tab: the re-critique read "Stopped by orders.count:
  // orders has no pre-aggregations."
  await page.getByTestId('drawer-tab-acceleration').click();
  const miss = page.getByTestId('acceleration-miss');
  await expect(miss).toContainText('Orders has no pre-aggregations.', { timeout: 30_000 });
  await expect(page.getByTestId('acceleration-member')).toHaveText(
    /^Orders (Count|Total Amount|Status)$/,
  );
  await expect(miss).not.toContainText(INTERNAL);

  // The trace.
  await page.getByRole('button', { name: 'Why this chart?' }).click();
  await expect(page.getByTestId('why-this-chart')).toBeVisible();
  await expect(page.getByTestId('why-this-chart')).not.toContainText(INTERNAL);
});

/**
 * A dashboard of its own: orders counted by status; their count as a KPI; and
 * orders and customers counted by status, a chart over two cubes. The
 * editor's field list offers one cube or view at a time, so that one is saved
 * as a document.
 */
async function titledDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Titles ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const tiles = [
    {
      id: 'tile-status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    { id: 'tile-kpi', chartType: 'kpi', measures: ['orders.count'], dimensions: [] },
    {
      id: 'tile-two',
      chartType: 'bar',
      measures: ['orders.count', 'customers.count'],
      dimensions: ['orders.status'],
    },
  ];
  const items = [];
  for (const each of tiles) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: `${each.id} ${unique}`, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `${each.id} ${unique}`,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: each.measures, dimensions: each.dimensions, timeDimensions: [] },
            chartType: each.chartType,
          },
        },
      },
    });
    items.push({ id: each.id, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  return { id: dashboard.id, title };
}

test('a KPI reads its short title, a two-cube legend full ones, and a marking chip titles', async ({
  page,
  request,
}) => {
  const { id, title } = await titledDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // The KPI: one measure, so its source is evident.
  const kpi = page.locator('[data-tile="tile-kpi"]');
  await expect(kpi.getByTestId('kpi-label')).toHaveText('Count');

  // Two sources, so neither is evident: each by its full title.
  const two = page
    .locator('[data-tile="tile-two"]')
    .getByTestId('chart-canvas')
    .locator('svg text');
  await expect(two.filter({ hasText: /^Orders Count$/ })).toHaveCount(1);
  await expect(two.filter({ hasText: /^Customers Count$/ })).toHaveCount(1);
  await expect(two.filter({ hasText: /^Count$/ })).toHaveCount(0);
  await expect(two.filter({ hasText: INTERNAL })).toHaveCount(0);

  // A marking chip, by full title (AC-200's own test covers the rest of it).
  const status = page.locator('[data-tile="tile-status"]');
  const label = status.locator('svg text', { hasText: 'shipped' }).first();
  await expect(label).toBeVisible();
  const mark = await largestMark(status.getByTestId('chart-canvas'));
  await page.mouse.click(mark.x, mark.y);
  const chip = page.getByTestId('mark-chip');
  await expect(chip).toContainText('Orders Status: ');
  await expect(chip).not.toContainText(INTERNAL);
  await expect(status).not.toContainText(INTERNAL);
});

test('a library chart’s page draws a one-source legend by short titles', async ({
  page,
  request,
}) => {
  const title = `Titles library ${String(Date.now())}`;
  const chart = (await (
    await request.post(`${API}/documents`, { data: { kind: 'chart', title, ...IN_MY_WORKSPACE } })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.count', 'orders.total_amount'],
            dimensions: ['orders.status'],
            timeDimensions: [],
          },
          chartType: 'bar',
        },
      },
    },
  });

  await page.goto(`/explore/charts/${chart.id}`);
  const written = page.locator('.chart-page__tile').getByTestId('chart-canvas').locator('svg text');
  await expect(written.filter({ hasText: /^Count$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: /^Total Amount$/ })).toHaveCount(1);
  await expect(written.filter({ hasText: INTERNAL })).toHaveCount(0);
});
