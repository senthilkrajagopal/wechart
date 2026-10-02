import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

import { IN_MY_WORKSPACE } from '../workspace';

const API = 'http://localhost:4100/api';

/**
 * T181 / AC-175: WHEN a marking changes on a dashboard of 10 charts, THE
 * SYSTEM SHALL update every affected tile within 3 seconds at the 95th
 * percentile.
 * Fails when: the p95 update time exceeds 3 seconds.
 *
 * The heaviest case the dashboards have: one tile marks, and the other nine
 * are limited by its marking (AC-107), so every change asks Cube nine new
 * questions, one a tile, on the compose warehouse. Timed as the reader sees
 * it: from the click to every limited tile holding its new answer, none still
 * busy.
 *
 * The seed has three statuses, so seven different mark sets; each round
 * marks all seven, each once, on the dashboard opened afresh, so no answer
 * comes from the browser's cache and each change sends its nine questions.
 * Cube may answer from its own cache, as it would for anyone.
 */
const ROUNDS = 3;
const LIMITED = 9;
const BUDGET_MS = 3000;

const MASTER = {
  title: 'Orders by status',
  chartType: 'bar',
  wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
};
const CHARTS: { title: string; wells: Record<string, string[]>; chartType: string }[] = [
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

/** Throws unless the API answered as it should, so setup fails where it fails. */
async function ok<T>(answer: Promise<APIResponse>): Promise<T> {
  const response = await answer;
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function markingDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Ten charts marking ${unique}`;
  const dashboard = await ok<{ id: string }>(
    request.post(`${API}/documents`, { data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE } }),
  );
  const items = [];
  for (const [index, chart] of [MASTER, ...CHARTS].entries()) {
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
      // The first marks; the rest show only what it has marked.
      ...(index === 0 ? {} : { marksWith: '', limitedBy: ['m1'] }),
    });
  }
  await ok(
    request.put(`${API}/documents/dashboard/${dashboard.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'full', interactions: { mode: 'markings' } },
          markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
          pages: [{ id: 'only', title: 'Only', items }],
        },
      },
    }),
  );
  return { id: dashboard.id, title };
}

// A performance budget is a gate, not a flake to absorb: no retry passes it.
test.describe.configure({ retries: 0 });

/** The value below which 95 % of the timings fall (nearest rank). */
function p95(timings: readonly number[]): number {
  const sorted = [...timings].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
}

/** Where a bar's axis label rests, once it has stopped moving (as markings.spec.ts finds it). */
async function barAt(page: Page, category: string) {
  const label = page.locator('[data-tile="tile-0"] svg text', { hasText: category }).first();
  await expect(label).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0 };
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  return { x: box.x + box.width / 2, y: box.y - 10 };
}

/** Each of the seven sets once: a click replaces the marks, Ctrl or ⌘ adds. */
const STEPS: readonly [status: string, adds: boolean][] = [
  ['completed', false],
  ['shipped', true],
  ['processing', true],
  ['shipped', false],
  ['processing', true],
  ['processing', false],
  ['completed', true],
];

test('a marking change on a ten-chart dashboard updates every tile within 3 s at the 95th percentile', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const { id, title } = await markingDashboard(request);
  let sent = 0;
  let finished = 0;
  page.on('request', (asked) => {
    if (asked.url().endsWith('/api/load')) sent += 1;
  });
  const done = (asked: { url: () => string }) => {
    if (asked.url().endsWith('/api/load')) finished += 1;
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);

  const updates: number[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('[data-tile="tile-0"] [data-testid="chart-canvas"]')).toBeVisible();
    await expect(page.locator('[data-tile] [aria-busy="true"]')).toHaveCount(0);
    for (const [status, adds] of STEPS) {
      const at = await barAt(page, status);
      const before = { sent, finished };
      const started = Date.now();
      if (adds) await page.keyboard.down('ControlOrMeta');
      await page.mouse.click(at.x, at.y);
      if (adds) await page.keyboard.up('ControlOrMeta');
      // Every limited tile asked, answered, and drawn: none busy.
      await expect
        .poll(() => [sent - before.sent >= LIMITED, finished - before.finished >= LIMITED], {
          intervals: [10],
          timeout: 15_000,
        })
        .toEqual([true, true]);
      await page.waitForFunction(
        () => document.querySelectorAll('[data-tile] [aria-busy="true"]').length === 0,
        undefined,
        { polling: 'raf', timeout: 15_000 },
      );
      updates.push(Date.now() - started);
    }
    // The last set is two statuses: the master says so.
    await expect(page.locator('[data-tile="tile-0"]').getByTestId('mark-badge')).toContainText(
      '2 marked',
    );
  }

  const report = { updates, p95: p95(updates) };
  test.info().annotations.push({ type: 'p95', description: JSON.stringify(report) });
  expect(updates).toHaveLength(ROUNDS * STEPS.length);
  expect(report.p95).toBeLessThan(BUDGET_MS);
});
