import type { ChartDocument } from '@wechart/core';
import { describe, expect, it, vi } from 'vitest';

import { copyChartToDashboard } from './copyChartTo';

/**
 * T271 / AC-243: WHEN the user chooses Copy › To dashboard and picks a
 * dashboard, THE SYSTEM SHALL add a dashboard-local copy of the tile's chart
 * to that dashboard, and SHALL leave the source dashboard unchanged.
 * `Fails when: the chosen dashboard lacks the copy, the copy is the source's
 * chart rather than its own, or the source dashboard's saved definition
 * changes.`
 */
const CHART: ChartDocument = {
  schemaVersion: 1,
  title: 'By status',
  folderId: 'folder-1',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
};

describe('copying a tile’s chart to another dashboard', () => {
  it('saves the chosen dashboard with a tile showing a chart of its own, and asks nothing of the source', async () => {
    const asked: { url: string; method: string; body?: unknown }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      asked.push({
        url,
        method,
        ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
      });
      if (method === 'GET')
        return new Response(
          JSON.stringify({
            id: 'target',
            version: 7,
            body: {
              schemaVersion: 1,
              title: 'Sales',
              settings: { width: 'full' },
              pages: [{ id: 'p1', title: 'Overview', items: [{ id: 't0', kind: 'text', w: 12 }] }],
            },
          }),
        );
      return new Response(JSON.stringify({ version: 8 }));
    });

    const copied = await copyChartToDashboard({
      targetId: 'target',
      chart: CHART,
      size: { w: 6, h: 40 },
      fetchImpl,
      mintChartId: () => 'chart-copy',
      mintTileId: () => 'tile-copy',
    });

    expect(copied).toEqual({ title: 'Sales', chartId: 'chart-copy' });
    // Read, then one save of the chosen dashboard; the source is not asked.
    expect(asked.map(({ url, method }) => `${method} ${url}`)).toEqual([
      'GET /api/documents/dashboard/target',
      'PUT /api/dashboards/target',
    ]);
    const saved = asked[1]?.body as {
      dashboard: { body: { pages: { items: unknown[] }[] }; version: number };
      charts: { id: string; body: ChartDocument; version: number }[];
    };
    // At the end of its first page, the size the tile had.
    expect(saved.dashboard.version).toBe(7);
    expect(saved.dashboard.body.pages[0]?.items).toEqual([
      { id: 't0', kind: 'text', w: 12 },
      { id: 'tile-copy', kind: 'chart', chartId: 'chart-copy', w: 6, h: 40 },
    ]);
    // A chart of its own, created with the save: the source's definition,
    // local to the chosen dashboard, in no folder.
    expect(saved.charts).toEqual([
      {
        id: 'chart-copy',
        version: 0,
        body: {
          schemaVersion: 1,
          title: 'By status',
          chart: CHART.chart,
          localToDashboardId: 'target',
        },
      },
    ]);
  });

  it('says the dashboard changed meanwhile, that nothing was written, and to copy again (T271’s review)', async () => {
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PUT'
        ? // The server's stale-save answer, as PUT /api/dashboards/:id sends it.
          new Response(
            JSON.stringify({
              message: 'This dashboard changed since you opened it.',
              document: { kind: 'dashboard', id: 'target' },
            }),
            { status: 409 },
          )
        : new Response(
            JSON.stringify({
              id: 'target',
              version: 3,
              body: { schemaVersion: 1, title: 'Sales', settings: {}, pages: [] },
            }),
          );
    await expect(
      copyChartToDashboard({ targetId: 'target', chart: CHART, size: { w: 6 }, fetchImpl }),
    ).rejects.toThrow(
      'That dashboard was saved by someone else while copying, so nothing was written. Copy again to add it to the dashboard as it is now.',
    );
  });

  it('says why when the chosen dashboard cannot be read', async () => {
    await expect(
      copyChartToDashboard({
        targetId: 'gone',
        chart: CHART,
        size: { w: 6 },
        fetchImpl: async () => new Response('{}', { status: 404 }),
      }),
    ).rejects.toThrow('Could not read that dashboard (404).');
  });
});
