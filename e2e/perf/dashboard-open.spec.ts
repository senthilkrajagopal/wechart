import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

import { IN_MY_WORKSPACE } from '../workspace';

const API = 'http://localhost:4100/api';

/**
 * T180 / AC-174: WHEN a dashboard of 10 charts on live warehouse data is
 * opened, THE SYSTEM SHALL render every tile within 3 seconds at the 95th
 * percentile, measured from wechart's own query timings.
 * Fails when: the p95 across a repeated run exceeds 3 seconds.
 *
 * Ten charts of the kinds a dashboard mixes — bars, lines, a pie, KPIs,
 * tables — on the compose warehouse (the seeded Postgres, through Cube),
 * opened again and again as a person would. Two timings, each held to 3 s at
 * the 95th percentile:
 * - wechart's own query timings, from its query log (T015): each of the
 *   dashboard's queries, found by the request ids the page sent;
 * - the whole open, as the browser sees it: from navigating to every tile
 *   drawn — which the query timings are part of.
 */
const OPENS = 20;
const BUDGET_MS = 3000;

const CHARTS: { title: string; wells: Record<string, string[]>; chartType: string }[] = [
  {
    title: 'Orders by status',
    chartType: 'bar',
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
  },
  {
    title: 'Revenue by status',
    chartType: 'bar',
    wells: { measures: ['orders.total_amount'], dimensions: ['orders.status'], timeDimensions: [] },
  },
  {
    title: 'Orders over time',
    chartType: 'line',
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: ['orders.ordered_at'] },
  },
  {
    title: 'Revenue over time',
    chartType: 'line',
    wells: {
      measures: ['orders.total_amount'],
      dimensions: [],
      timeDimensions: ['orders.ordered_at'],
    },
  },
  {
    title: 'Status share',
    chartType: 'pie',
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
  },
  {
    title: 'Orders',
    chartType: 'kpi',
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
  },
  {
    title: 'Revenue',
    chartType: 'kpi',
    wells: { measures: ['orders.total_amount'], dimensions: [], timeDimensions: [] },
  },
  {
    title: 'Average order',
    chartType: 'kpi',
    wells: { measures: ['orders.average_amount'], dimensions: [], timeDimensions: [] },
  },
  {
    title: 'Orders by customer',
    chartType: 'table',
    wells: { measures: ['orders.count'], dimensions: ['customers.name'], timeDimensions: [] },
  },
  {
    title: 'Orders by product',
    chartType: 'table',
    wells: { measures: ['orders.count'], dimensions: ['products.name'], timeDimensions: [] },
  },
];

async function tenChartDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = await ok<{ id: string }>(
    request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Ten charts ${unique}`, ...IN_MY_WORKSPACE },
    }),
  );
  const items = [];
  for (const [index, chart] of CHARTS.entries()) {
    const created = await ok<{ id: string }>(
      request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chart.title, ...IN_MY_WORKSPACE },
      }),
    );
    await ok(
      request.put(`${API}/documents/chart/${created.id}`, {
        data: {
          version: 1,
          body: {
            schemaVersion: 1,
            title: chart.title,
            owner: 'admin',
            localToDashboardId: dashboard.id,
            chart: { source: { cube: 'orders' }, wells: chart.wells, chartType: chart.chartType },
          },
        },
      }),
    );
    items.push({
      id: `tile-${String(index)}`,
      kind: 'chart',
      w: chart.chartType === 'kpi' ? 4 : 6,
      h: chart.chartType === 'kpi' ? 13 : 40,
      chartId: created.id,
    });
  }
  await ok(
    request.put(`${API}/documents/dashboard/${dashboard.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `Ten charts ${unique}`,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'full' },
          pages: [{ id: 'only', title: 'Only', items }],
        },
      },
    }),
  );
  return dashboard.id;
}

// A performance budget is a gate, not a flake to absorb: no retry passes it.
test.describe.configure({ retries: 0 });

/** Throws unless the API answered as it should, so setup fails where it fails. */
async function ok<T>(answer: Promise<APIResponse>): Promise<T> {
  const response = await answer;
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

/** The value below which 95 % of the timings fall (nearest rank). */
function p95(timings: readonly number[]): number {
  const sorted = [...timings].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
}

test('a ten-chart dashboard renders every tile within 3 s at the 95th percentile', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const id = await tenChartDashboard(request);
  const requestIds: string[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load')) return;
    const requestId = sent.headers()['x-request-id'];
    if (requestId !== undefined) requestIds.push(requestId);
  });

  // Every tile drawn: a chart, a KPI's value or a table — and none still loading.
  const drawn = page.locator(
    '[data-tile] :is([data-testid="chart-canvas"], [data-testid="kpi-value"], [data-testid="data-table"])',
  );
  const opens: number[] = [];
  for (let open = 0; open < OPENS; open += 1) {
    const started = Date.now();
    await page.goto(`/explore/dashboards/${id}`);
    await expect(drawn).toHaveCount(CHARTS.length, { timeout: 15_000 });
    await expect(page.getByTestId('tile-skeleton')).toHaveCount(0);
    opens.push(Date.now() - started);
  }

  // wechart's own timings of those queries, from its query log — found by the
  // request ids the page sent, whatever else was logged meanwhile.
  const sent = [...new Set(requestIds)];
  expect(sent.length).toBeGreaterThanOrEqual(CHARTS.length * OPENS);
  const answer = await request.post(`${API}/jobs/queries/find`, { data: { requestIds: sent } });
  expect(answer.ok()).toBe(true);
  const logged = (await answer.json()) as {
    requestId: string;
    durationMs: number;
    accelerated: boolean;
    error?: string | null;
  }[];
  // One sample a query: a query Cube answered "Continue wait" to is logged
  // once for each ask, under its one id, and took all of them together.
  const byQuery = new Map<string, number>();
  for (const entry of logged)
    byQuery.set(entry.requestId, (byQuery.get(entry.requestId) ?? 0) + entry.durationMs);
  expect([...byQuery.keys()].sort()).toEqual([...sent].sort());
  expect(logged.filter((entry) => entry.error)).toEqual([]);
  // Live: every query read the warehouse, none a pre-aggregation.
  expect(logged.filter((entry) => entry.accelerated)).toEqual([]);

  const report = { opensP95: p95(opens), queriesP95: p95([...byQuery.values()]) };
  test.info().annotations.push({ type: 'p95', description: JSON.stringify(report) });
  expect(report.queriesP95).toBeLessThan(BUDGET_MS);
  expect(report.opensP95).toBeLessThan(BUDGET_MS);
});
