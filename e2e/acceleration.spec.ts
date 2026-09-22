import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * T014 / AC-013: WHEN a result is served from a pre-aggregation, THE SYSTEM
 * SHALL mark the tile as accelerated and show the age of the data; otherwise
 * it SHALL mark the tile as live.
 * Fails when: a result with `usedPreAggregations` shows no accelerated
 * indicator, or a source-database result is labelled accelerated.
 *
 * On a dashboard, against the real Cube: `monthly_orders` is the sample
 * model's accelerated cube — its rollup, built by the compose stack's refresh
 * worker, answers orders counted by status — and `orders` has no rollup, so
 * Postgres answers it.
 */
const API = 'http://localhost:4100/api';

const ACCELERATED_QUERY = {
  measures: ['monthly_orders.count'],
  dimensions: ['monthly_orders.status'],
};

/**
 * The refresh worker builds the rollup some seconds after Cube starts, and
 * until it has, Cube refuses the query (research/cube/pre-aggregations.md,
 * "Observed locally"). Waited for here, so the test is about the tile.
 */
test.beforeAll(async ({ request }) => {
  await expect(async () => {
    const answer = (await (
      await request.post(`${API}/load`, { data: { query: ACCELERATED_QUERY } })
    ).json()) as {
      usedPreAggregations?: Record<string, unknown>;
    };
    expect(Object.keys(answer.usedPreAggregations ?? {})).not.toHaveLength(0);
  }).toPass({ timeout: 120_000, intervals: [2_000] });
});

/** A dashboard of its own, with one bar chart of `count` by `status` on each cube given. */
async function dashboardOn(request: APIRequestContext, cubes: readonly string[]) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Acceleration ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const items = [];
  for (const cube of cubes) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: `${cube} by status`, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `${cube} by status`,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube },
            wells: {
              measures: [`${cube}.count`],
              dimensions: [`${cube}.status`],
              timeDimensions: [],
            },
            chartType: 'bar',
          },
        },
      },
    });
    items.push({ id: `tile-${cube}`, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  return { id: dashboard.id, title };
}

test('a tile served from a pre-aggregation says so with its age, and one from the database says live', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOn(request, ['monthly_orders', 'orders']);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const accelerated = page.locator('[data-tile="tile-monthly_orders"]').getByTestId('acceleration');
  await expect(accelerated).toHaveText(/Accelerated · built .+ ago/);
  // Its icon and its words, never colour alone.
  await expect(accelerated.locator('[data-icon="accelerated"]')).toHaveCount(1);
  await expect(accelerated).toHaveAttribute('title', /monthly_orders\.by_status_month/);

  const live = page.locator('[data-tile="tile-orders"]').getByTestId('acceleration');
  await expect(live).toHaveText(/Live/);
  await expect(live).not.toHaveText(/Accelerated/);
  await expect(live.locator('[data-icon="live"]')).toHaveCount(1);
});
