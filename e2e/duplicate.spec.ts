import { expect, test } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T068 / AC-062: WHEN the user duplicates a chart tile, THE SYSTEM SHALL give
 * the copy its own dashboard-local chart, so editing one tile leaves the other
 * unchanged.
 * Fails when: editing the duplicate changes the original tile's chart.
 *
 * On the real dashboard: a tile showing a library chart, duplicated from its
 * ⋯ menu; the copy edited to a line chart in the chart editor, and the
 * dashboard saved. The copy's chart is stored local to the dashboard, as a
 * line; the library chart is as it was.
 */
test('a duplicated chart tile has a chart of its own, and editing it leaves the original alone', async ({
  page,
  request,
}) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const library = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: `Shared ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${library.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Shared ${unique}`,
        owner: 'admin',
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Duplicate ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Duplicate ${unique}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-original', kind: 'chart', w: 6, h: 40, chartId: library.id }],
          },
        ],
      },
    },
  });

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  const tiles = page.locator('[data-tile]');
  await expect(tiles.first().getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('tile-menu-tile-original').click();
  await page.getByTestId('duplicate-tile-original').click();

  // The copy beside it, drawing the same chart at once.
  await expect(tiles).toHaveCount(2);
  const copy = tiles.nth(1);
  await expect(copy.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');

  // The copy edited: a line chart.
  await copy.getByRole('button', { name: /^Edit / }).click();
  await page.getByLabel('Chart type').selectOption('line');
  await page.getByTestId('editor-back').click();
  await expect(copy.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'line');
  await expect(tiles.first().getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');

  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  // Saved, and the charts loaded again: the copy still draws its own chart —
  // not "no longer available" for want of it among those loaded (T068's review).
  await page.waitForLoadState('networkidle');
  await expect(copy.getByTestId('tile-missing-chart')).toHaveCount(0);
  await expect(copy.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'line');
  await expect(tiles.first().getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');

  // Two tiles, two charts: the copy's local to this dashboard, a line.
  const stored = (await (
    await request.get(`${API}/documents/dashboard/${dashboard.id}`)
  ).json()) as { body: { pages: { items: { id: string; chartId?: string }[] }[] } };
  const items = stored.body.pages.flatMap((each) => each.items);
  expect(items).toHaveLength(2);
  const copyChartId = items.find((item) => item.id !== 'tile-original')?.chartId ?? '';
  expect(copyChartId).not.toBe(library.id);
  const copied = (await (await request.get(`${API}/documents/chart/${copyChartId}`)).json()) as {
    body: { localToDashboardId?: string; chart: { chartType?: string } };
  };
  expect(copied.body.localToDashboardId).toBe(dashboard.id);
  expect(copied.body.chart.chartType).toBe('line');

  // The original's chart, the shared one, as it was.
  const original = (await (await request.get(`${API}/documents/chart/${library.id}`)).json()) as {
    body: { localToDashboardId?: string; chart: { chartType?: string } };
  };
  expect(original.body.chart.chartType).toBe('bar');
  expect(original.body.localToDashboardId).toBeUndefined();
});
