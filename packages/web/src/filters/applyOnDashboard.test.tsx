import type { ChartDocument } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';

/**
 * T084 / AC-078: WHEN a filter value changes, THE SYSTEM SHALL re-query every
 * tile in its scope and leave tiles outside the scope unchanged.
 * Fails when: a tile outside the scope re-queries, or a tile inside it keeps
 * the previous result.
 *
 * On the dashboard: which charts are asked again when a value changes. The
 * two charts differ in what they group by, so their queries can be told apart.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'sales',
      title: 'Sales',
      items: [{ id: 't-sales', kind: 'chart', chartId: 'c-sales', w: 6 }],
    },
    { id: 'ops', title: 'Ops', items: [{ id: 't-ops', kind: 'chart', chartId: 'c-ops', w: 6 }] },
  ],
  filters: [
    {
      id: 'f1',
      widget: 'checkbox',
      member: 'orders.status',
      scope: { kind: 'page', pageId: 'sales' },
    },
  ],
};

const chart = (dimension: string): ChartDocument => ({
  schemaVersion: 1,
  title: dimension,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [dimension], timeDimensions: [] },
    chartType: 'bar',
  },
});

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [
        { name: 'orders.status', title: 'Status', type: 'string' },
        { name: 'orders.region', title: 'Region', type: 'string' },
      ],
    },
  ],
};

/** Every chart query sent — a query with a measure; the filter's own values have none. */
let charted: Record<string, unknown>[] = [];

beforeEach(() => {
  charted = [];
  // A filtered answer is drawn, and the chart canvas watches its own size.
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
      if (String(input) === '/api/meta') return new Response(JSON.stringify(META));
      const { query } = JSON.parse(String(init?.body)) as { query: Record<string, unknown> };
      if (query['measures'] === undefined)
        return new Response(
          JSON.stringify({
            data: [{ 'orders.status': 'completed' }, { 'orders.status': 'shipped' }],
          }),
        );
      charted.push(query);
      return new Response(
        JSON.stringify({ data: [{ 'orders.status': 'completed', 'orders.count': 3 }] }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(document: DashboardDocument = DOC) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={document}
        specs={{}}
        documents={{ 'c-sales': chart('orders.status'), 'c-ops': chart('orders.region') }}
        onSave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const bar = () => screen.getByRole('region', { name: 'Filters' });
const groupedBy = (dimension: string) =>
  charted.filter((query) => (query['dimensions'] as string[])[0] === dimension);

describe('a filter value, changed', () => {
  it('asks again every chart in its scope, with the value, and no chart outside it', async () => {
    dashboard();
    expect(charted).toEqual([]);

    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    await vi.waitFor(() => {
      expect(groupedBy('orders.status')).toHaveLength(1);
    });
    expect(groupedBy('orders.status')[0]?.['filters']).toEqual([
      { member: 'orders.status', operator: 'equals', values: ['completed'] },
    ]);
    expect(groupedBy('orders.region')).toEqual([]);

    // Changed again: asked again, with the new value — and still nothing else.
    await userEvent.click(within(bar()).getByRole('checkbox', { name: 'shipped' }));
    await vi.waitFor(() => {
      expect(groupedBy('orders.status')).toHaveLength(2);
    });
    expect(groupedBy('orders.status')[1]?.['filters']).toEqual([
      { member: 'orders.status', operator: 'equals', values: ['completed', 'shipped'] },
    ]);
    expect(groupedBy('orders.region')).toEqual([]);
  });

  it('on the whole dashboard, asks every chart', async () => {
    dashboard({ ...DOC, filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }] });

    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    await vi.waitFor(() => {
      expect(groupedBy('orders.status')).toHaveLength(1);
      expect(groupedBy('orders.region')).toHaveLength(1);
    });
  });

  it('on named tiles, asks those tiles’ charts and no other', async () => {
    dashboard({
      ...DOC,
      filters: [
        {
          id: 'f1',
          widget: 'checkbox',
          member: 'orders.status',
          scope: { kind: 'tiles', tileIds: ['t-ops'] },
        },
      ],
    });

    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    await vi.waitFor(() => {
      expect(groupedBy('orders.region')).toHaveLength(1);
    });
    expect(groupedBy('orders.status')).toEqual([]);
  });

  it('draws the tile from the answer', async () => {
    dashboard();
    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    // The Sales tile had no chart to draw (none was given it); it now draws
    // the filtered answer.
    const tile = document.querySelector('[data-tile="t-sales"]') as HTMLElement;
    expect(await within(tile).findByTestId('chart-tile')).toBeTruthy();
  });
});
