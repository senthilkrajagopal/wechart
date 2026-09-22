import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../../dashboard/DashboardView';
import type { DashboardDocument } from '../../dashboard/model/document';

/**
 * T174 / AC-168 on the dashboard (from T174's review): the SQL a previewed
 * tile shows is Cube's for the query the tile asks — its chart's, with the
 * filters that reach it, less any Cube could not join — and the SQL is only
 * offered while previewing.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Only', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6 }] }],
  filters: [
    { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
    { id: 'f-region', widget: 'checkbox', member: 'customers.region' },
  ],
};

const CHART: ChartDocument = {
  schemaVersion: 1,
  title: 'By status',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
};

const SPEC: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'shipped', 'orders.count': 1 }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [{ name: 'orders.status', title: 'Status', type: 'string' }],
    },
    {
      name: 'customers',
      title: 'Customers',
      measures: [],
      dimensions: [{ name: 'customers.region', title: 'Region', type: 'string' }],
    },
  ],
};

let askedSql: { query: Record<string, unknown>; context: unknown }[] = [];

beforeEach(() => {
  askedSql = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/meta') return Response.json(META);
      if (url === '/api/model/files') return Response.json({ files: [] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        query: { filters?: { member: string }[] };
        context?: unknown;
      };
      if (url === '/api/sql') {
        askedSql.push(body as { query: Record<string, unknown>; context: unknown });
        return Response.json({ queries: [{ sql: 'SELECT 1', params: [] }] });
      }
      // Cube cannot join the customers filter to the orders chart.
      if ((body.query.filters ?? []).some(({ member }) => member === 'customers.region'))
        return Response.json(
          { error: "Can't find join path to join 'customers', 'orders'" },
          { status: 400 },
        );
      return Response.json({ data: [{ 'orders.status': 'shipped', 'orders.count': '1' }] });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(preview?: Record<string, unknown>) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ c1: SPEC }}
        documents={{ c1: CHART }}
        onSave={vi.fn()}
        urlFilterValues={{
          'f-status orders.status': { kind: 'values', values: ['shipped'] },
          'f-region customers.region': { kind: 'values', values: ['North'] },
        }}
        {...(preview === undefined ? {} : { preview })}
      />
    </QueryClientProvider>,
  );
  return document.querySelector('[data-tile="t1"]') as HTMLElement;
}

describe('a previewed tile’s SQL', () => {
  it('is asked for the query the tile runs: its filters, less the one Cube could not join', async () => {
    const context = { groups: ['sales'] };
    const tile = dashboard(context);
    // The filtered answer is in, with the customers filter left off.
    await vi.waitFor(() => {
      expect(tile.textContent).toContain('Not filtered by Region');
    });

    await userEvent.click(
      within(tile).getByRole('button', { name: 'SQL for By status as this context' }),
    );
    await vi.waitFor(() => {
      expect(askedSql).toHaveLength(1);
    });

    expect(askedSql[0]).toEqual({
      query: {
        measures: ['orders.count'],
        dimensions: ['orders.status'],
        filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
      },
      context,
    });
  });

  it('is not offered outside a preview', () => {
    const tile = dashboard();
    expect(within(tile).queryByRole('button', { name: /^SQL for / })).toBeNull();
  });
});
