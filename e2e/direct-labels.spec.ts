import { expect, test } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * T681's follow-up (R76 dashboard-Q1; design 04 pins 5–6; direction.md §6
 * and rule 5): on a dashboard, a tile's Table view is ⋯'s "View as table",
 * and a chart of 4 or fewer series names each where it ends, beside its
 * legend, so identity never rests on colour alone.
 *
 * The seed's two charts are split by the 3 order statuses: a bar by
 * category, and a time series by month.
 */
const STATUSES = ['completed', 'processing', 'shipped'];

/** How often each status is written on a tile's chart. */
const namedIn = async (tile: import('@playwright/test').Locator) => {
  const texts = await tile.locator('svg text').allTextContents();
  return STATUSES.map((status) => texts.filter((text) => text === status).length);
};

/** A dashboard of its own with one tile: the 3 statuses as lines across the categories. */
async function linesOfStatuses(request: import('@playwright/test').APIRequestContext) {
  const api = 'http://localhost:4100/api';
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Lines ${unique}`;
  const made = async (kind: string, name: string) =>
    (
      (await (
        await request.post(`${api}/documents`, { data: { kind, title: name, ...IN_MY_WORKSPACE } })
      ).json()) as { id: string }
    ).id;
  const dashboard = await made('dashboard', title);
  const chart = await made('chart', 'Statuses by category');
  await request.put(`${api}/documents/chart/${chart}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Statuses by category',
        owner: 'admin',
        localToDashboardId: dashboard,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.count'],
            dimensions: ['products.category', 'orders.status'],
            timeDimensions: [],
          },
          chartType: 'multiLine',
          encoding: { x: ['products.category'], y: ['orders.count'], color: ['orders.status'] },
        },
      },
    },
  });
  const saved = await request.put(`${api}/documents/dashboard/${dashboard}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-lines', kind: 'chart', w: 6, h: 40, chartId: chart }],
          },
        ],
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return dashboard;
}

test('a tile of 3 series names each twice: in its legend, and where it ends', async ({
  page,
  request,
}) => {
  /**
   * Lines, whose end labels are moved apart rather than left to meet. The
   * seed's bar tile can't carry this exact count any more: with every bar at
   * most 36 px (T683, CMP-12) and ECharts' 10 % barGap, the last category's
   * three bars stand about 40 px apart at any tile width, and names of about
   * 60 px meet, so one is hidden (the test below).
   */
  await page.goto(`/explore/dashboards/${await linesOfStatuses(request)}`);
  const lines = page.locator('[data-tile="tile-lines"]');
  await expect(lines.getByTestId('chart-canvas')).toBeVisible();
  await expect.poll(() => namedIn(lines)).toEqual([2, 2, 2]);
});

test('a bar tile’s end label hidden where it would meet another is still named in the legend', async ({
  page,
}) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  // Bars by category: each status's last bar named over it, where it fits.
  const status = page.locator('[data-tile="tile-status"]');
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  // No Table view button in its head: the table is ⋯'s.
  await expect(status.getByTestId('toggle-table-view')).toHaveCount(0);
  /**
   * The names in the legend's row, at the canvas's top (`top: 0`; T683),
   * apart from the end labels drawn over the bars below it.
   */
  const legendNames = () =>
    status.getByTestId('chart-canvas').evaluate((canvas, statuses) => {
      const top = canvas.getBoundingClientRect().top;
      return [...canvas.querySelectorAll('svg text')]
        .filter((text) => text.getBoundingClientRect().bottom - top <= 24)
        .map((text) => text.textContent)
        .filter((text): text is string => text !== null && statuses.includes(text));
    }, STATUSES);
  // Every status in the legend.
  await expect.poll(async () => [...(await legendNames())].sort()).toEqual(STATUSES);
  // A status named once, its end label hidden where it would meet another
  // (the coordinator's overlap call), is that once in the legend; and the
  // end labels that fit are drawn.
  const named = await namedIn(status);
  expect(named.some((count) => count === 2), named.join(',')).toBe(true);
  const inLegend = await legendNames();
  for (const [at, count] of named.entries()) {
    expect(count, STATUSES[at]).toBeGreaterThanOrEqual(1);
    if (count === 1) expect(inLegend, STATUSES[at]).toContain(STATUSES[at]);
  }
});

test('the region tile names its series where they fit', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');

  // Bars by day, the last day's three side by side: a name that would meet
  // another is hidden, which the legend still names (the coordinator's call
  // on research/echarts-end-labels.md). One at least is drawn.
  const region = page.locator('[data-tile="tile-region"]');
  await expect(region.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(async () => {
      const counts = await namedIn(region);
      return counts.every((count) => count >= 1) && counts.reduce((a, b) => a + b, 0) >= 4;
    })
    .toBe(true);
});

test('its table is one menu away, and back to its chart', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await tile
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View as table', exact: true })
    .click();
  await expect(tile.getByTestId('data-table')).toBeVisible();
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await tile
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View as chart', exact: true })
    .click();
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
});
