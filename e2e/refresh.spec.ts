import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 * Fails when: the previous result is shown again with an unchanged
 * timestamp.
 *
 * Against the real Cube: the tile says when its data is from (Cube's
 * `lastRefreshTime`), and "Refresh" asks Cube past its cache
 * (`cache: 'no-cache'`, which "Skips refresh key checks"; research/cube/
 * refresh-jobs-caching.md), so the time moves on.
 */
const API = 'http://localhost:4100/api';

/** Every `/api/load` body sent from now on. */
function loadsFrom(page: Page): { query: unknown; cache?: string }[] {
  const asked: { query: unknown; cache?: string }[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/load'))
      asked.push(JSON.parse(request.postData() ?? '{}') as { query: unknown; cache?: string });
  });
  return asked;
}

test('refreshing a chart asks Cube again and shows the newer data-as-of time', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  const asOf = tile.getByTestId('data-as-of');
  await expect(asOf).toHaveText(/^Data as of \d{1,2}:\d{2}:\d{2}/);
  const before = await asOf.getAttribute('datetime');

  // A second on, so a newer answer has a later time to show.
  await page.waitForTimeout(1100);
  const asked = loadsFrom(page);
  await tile.getByRole('button', { name: /^Refresh / }).click();

  await expect(async () => {
    const after = await asOf.getAttribute('datetime');
    expect(Date.parse(after ?? '')).toBeGreaterThan(Date.parse(before ?? ''));
  }).toPass({ timeout: 10_000 });
  // Asked past Cube's cache, and only this tile's chart (one query, however
  // many times it was polled).
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((body) => body.cache === 'no-cache')).toBe(true);
  expect(new Set(asked.map((body) => JSON.stringify(body.query))).size).toBe(1);
});

/** A dashboard of its own: one chart of orders by status, and a status filter on it. */
async function filteredDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Refresh ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Orders by status', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Orders by status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-orders', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
        filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
      },
    },
  });
  return { id: dashboard.id, title };
}

test('refreshing a filtered chart asks its filtered query again, and shows that answer’s time', async ({
  page,
  request,
}) => {
  const { id, title } = await filteredDashboard(request);
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  await page.goto(
    `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
  );
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-orders"]');
  const asOf = tile.getByTestId('data-as-of');
  await expect(tile.getByRole('button', { name: 'Refresh Orders by status' })).toBeEnabled();
  const before = await asOf.getAttribute('datetime');

  await page.waitForTimeout(1100);
  const asked = loadsFrom(page);
  await tile.getByRole('button', { name: 'Refresh Orders by status' }).click();

  await expect(async () => {
    const after = await asOf.getAttribute('datetime');
    expect(Date.parse(after ?? '')).toBeGreaterThan(Date.parse(before ?? ''));
  }).toPass({ timeout: 10_000 });
  // What the tile draws is asked again — with its filter — past Cube's cache.
  expect(asked.length).toBeGreaterThan(0);
  for (const body of asked) {
    expect(body.cache).toBe('no-cache');
    expect((body.query as { filters?: unknown }).filters).toEqual([
      { member: 'orders.status', operator: 'equals', values: ['shipped'] },
    ]);
  }
});
