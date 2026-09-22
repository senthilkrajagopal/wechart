import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFilter } from '../filters/testing';
import { DashboardView } from './DashboardView';
import type { DashboardDocument } from './model/document';

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 * Fails when: the previous result is shown again with an unchanged
 * timestamp.
 *
 * On a tile a filter reaches, what the tile draws is the filtered answer — so
 * that is what "Refresh" has to ask again, and what its data-as-of time has
 * to be the time of (T154's review, finding 1).
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'sales',
      title: 'Sales',
      items: [
        { id: 't-status', kind: 'chart', chartId: 'c-status', w: 6 },
        { id: 't-region', kind: 'chart', chartId: 'c-region', w: 6 },
      ],
    },
  ],
  filters: [
    {
      id: 'f1',
      widget: 'checkbox',
      member: 'orders.status',
      // Only the status chart is filtered; the region chart is not reached.
      scope: { kind: 'tiles', tileIds: ['t-status'] },
    },
  ],
};

const chart = (title: string, dimension: string): ChartDocument => ({
  schemaVersion: 1,
  title,
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

const spec = (dimension: string): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [dimension], y: ['orders.count'] },
  rows: [{ [dimension]: 'a', 'orders.count': 1 }],
});

/** Every chart query sent, with the cache policy and context it was sent with. */
let asked: { query: Record<string, unknown>; cache?: string; context?: unknown }[] = [];
/** Each chart answer is a second later than the one before it. */
let clock = 0;
const timeOf = (second: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, second)).toISOString();

/** Whether Cube answers the chart queries from a rollup (T014, AC-013). */
let servedByRollup = false;
const ROLLUP = {
  'prod_pre_aggregations.orders_by_status': {
    preAggregationId: 'orders.by_status',
    lastUpdatedAt: Date.UTC(2026, 8, 21, 9, 0, 0),
    type: 'rollup',
  },
};

beforeEach(() => {
  asked = [];
  clock = 0;
  servedByRollup = false;
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
      const body = JSON.parse(String(init?.body)) as {
        query: Record<string, unknown>;
        cache?: string;
        context?: unknown;
      };
      // The filter's own values: a query with no measure.
      if (body.query['measures'] === undefined)
        return new Response(
          JSON.stringify({
            data: [{ 'orders.status': 'completed' }, { 'orders.status': 'shipped' }],
          }),
        );
      asked.push(body);
      clock += 1;
      return new Response(
        JSON.stringify({
          data: [{ 'orders.status': 'completed', 'orders.count': 3 }],
          lastRefreshTime: timeOf(clock),
          ...(servedByRollup ? { usedPreAggregations: ROLLUP } : {}),
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(onRefresh = vi.fn(), preview?: Record<string, unknown>) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ 'c-status': spec('orders.status'), 'c-region': spec('orders.region') }}
        documents={{
          'c-status': chart('By status', 'orders.status'),
          'c-region': chart('By region', 'orders.region'),
        }}
        // The unfiltered answers' time, from the dashboard's own load.
        answered={{
          'c-status': { lastRefreshTime: timeOf(0) },
          'c-region': { lastRefreshTime: timeOf(0) },
        }}
        onRefresh={onRefresh}
        onSave={vi.fn()}
        {...(preview === undefined ? {} : { preview })}
      />
    </QueryClientProvider>,
  );
  return onRefresh;
}

const tile = (id: string) => document.querySelector(`[data-tile="${id}"]`) as HTMLElement;
const asOfOn = (id: string) => within(tile(id)).getByTestId('data-as-of').getAttribute('datetime');

describe('refreshing a tile a filter reaches', () => {
  it('asks its filtered query again past Cube’s cache, and shows that answer’s time', async () => {
    const onRefresh = dashboard();
    await openFilter();
    await userEvent.click(
      await within(screen.getByRole('region', { name: 'Filters' })).findByRole('checkbox', {
        name: 'completed',
      }),
    );
    // Filtered, the tile's time is the filtered answer's — not the unfiltered one's.
    await vi.waitFor(() => {
      expect(asOfOn('t-status')).toBe(timeOf(1));
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.cache).toBeUndefined();

    await userEvent.click(
      within(tile('t-status')).getByRole('button', { name: 'Refresh By status' }),
    );

    await vi.waitFor(() => {
      expect(asOfOn('t-status')).toBe(timeOf(2));
    });
    expect(asked).toHaveLength(2);
    expect(asked[1]).toEqual({
      query: {
        measures: ['orders.count'],
        dimensions: ['orders.status'],
        filters: [{ member: 'orders.status', operator: 'equals', values: ['completed'] }],
      },
      cache: 'no-cache',
    });
    // The unfiltered chart is not what this tile draws, so it is not asked.
    expect(onRefresh).not.toHaveBeenCalled();
  });

  /**
   * T172 / AC-166, from its review: a previewed dashboard's filtered tiles
   * are asked as the context, and so is their refresh; and a preview is read,
   * not edited, since the editor asks as wechart.
   */
  it('asks as a previewed security context, refresh included, and offers no editing', async () => {
    const context = { groups: ['sales'], is_employee: true };
    dashboard(vi.fn(), context);
    // No way into editing: no Edit, and no pencil on a tile.
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
    expect(within(tile('t-status')).queryByRole('button', { name: /^Edit / })).toBeNull();

    await openFilter();
    await userEvent.click(
      await within(screen.getByRole('region', { name: 'Filters' })).findByRole('checkbox', {
        name: 'completed',
      }),
    );
    await vi.waitFor(() => {
      expect(asked).toHaveLength(1);
    });
    await userEvent.click(
      within(tile('t-status')).getByRole('button', { name: 'Refresh By status' }),
    );
    await vi.waitFor(() => {
      expect(asked).toHaveLength(2);
    });

    expect(asked.map((body) => body.context)).toEqual([context, context]);
    expect(asked[1]?.cache).toBe('no-cache');
  });

  it('leaves a tile no filter reaches to the dashboard’s own refresh', async () => {
    const onRefresh = dashboard();
    // Not previewing: the ways into editing are there (the preview test's control).
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeTruthy();
    expect(within(tile('t-status')).getByRole('button', { name: /^Edit / })).toBeTruthy();
    await openFilter();
    await userEvent.click(
      await within(screen.getByRole('region', { name: 'Filters' })).findByRole('checkbox', {
        name: 'completed',
      }),
    );
    await vi.waitFor(() => {
      expect(asked).toHaveLength(1);
    });

    await userEvent.click(
      within(tile('t-region')).getByRole('button', { name: 'Refresh By region' }),
    );

    expect(onRefresh).toHaveBeenCalledWith('c-region');
    expect(asked).toHaveLength(1);
    expect(asOfOn('t-region')).toBe(timeOf(0));
  });
});

/**
 * T014 / AC-013: WHEN a result is served from a pre-aggregation, THE SYSTEM
 * SHALL mark the tile as accelerated and show the age of the data; otherwise
 * it SHALL mark the tile as live.
 *
 * A filtered tile says what served the answer it draws — its filtered one —
 * not what served its unfiltered chart (T014's review).
 */
describe('what served a filtered tile’s answer', () => {
  it('is its filtered answer’s, and a tile no filter reaches keeps its own', async () => {
    servedByRollup = true;
    dashboard();
    const badgeOn = (id: string) => within(tile(id)).getByTestId('acceleration');
    // Unfiltered, as loaded: from the database.
    expect(badgeOn('t-status').textContent).toMatch(/Live/);

    await openFilter();
    await userEvent.click(
      await within(screen.getByRole('region', { name: 'Filters' })).findByRole('checkbox', {
        name: 'completed',
      }),
    );

    await vi.waitFor(() => {
      expect(badgeOn('t-status').textContent).toMatch(/Accelerated/);
    });
    expect(badgeOn('t-status').getAttribute('title')).toMatch(/orders\.by_status/);
    expect(badgeOn('t-region').textContent).toMatch(/Live/);
  });
});

/**
 * T154 / AC-148, as reworded at the user's decision (2026-09-22): WHEN a
 * pre-aggregation serves the chart, THE SYSTEM SHALL say that its data is as
 * of that pre-aggregation's last build, and name the Jobs workspace as where
 * to rebuild it. Cube answers a refresh from the rollup as last built, so its
 * as-of time need not move (research/cube/refresh-jobs-caching.md).
 */
/**
 * T183 / AC-177: a tile being refreshed says so in words with an icon, as a
 * tile a filter is asking again does — not only by its ↻ fading (T183's
 * review).
 */
describe('a tile being refreshed', () => {
  it('says it is updating while its chart is asked again', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardView
          dashboardId="d1"
          document={DOC}
          specs={{ 'c-status': spec('orders.status'), 'c-region': spec('orders.region') }}
          documents={{
            'c-status': chart('By status', 'orders.status'),
            'c-region': chart('By region', 'orders.region'),
          }}
          onRefresh={vi.fn()}
          refreshing={new Set(['c-region'])}
          onSave={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(within(tile('t-region')).getByTestId('tile-busy').textContent).toBe('Updating…');
    expect(within(tile('t-status')).queryByTestId('tile-busy')).toBeNull();
  });
});

describe('refreshing a tile a pre-aggregation serves', () => {
  it('says the data is the pre-aggregation’s as last built, and where to rebuild it', async () => {
    servedByRollup = true;
    dashboard();
    await openFilter();
    await userEvent.click(
      await within(screen.getByRole('region', { name: 'Filters' })).findByRole('checkbox', {
        name: 'completed',
      }),
    );
    // The filtered answer drawn — a rollup's — and still nothing said, since
    // no refresh was asked for (T154's review: waited for, not assumed).
    await vi.waitFor(() => {
      expect(within(tile('t-status')).getByTestId('acceleration').textContent).toMatch(
        /Accelerated/,
      );
    });
    expect(within(tile('t-status')).queryByTestId('rollup-refresh-note')).toBeNull();

    await userEvent.click(
      within(tile('t-status')).getByRole('button', { name: 'Refresh By status' }),
    );

    const note = await within(tile('t-status')).findByTestId('rollup-refresh-note');
    expect(note.textContent).toContain('orders.by_status');
    expect(note.textContent).toContain('as of its last build');
    expect(within(note).getByRole('link', { name: 'Jobs' }).getAttribute('href')).toBe('/jobs');
    // An icon with the words (AC-177).
    expect(note.querySelector('[data-icon]')).not.toBeNull();

    // Put away.
    await userEvent.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(within(tile('t-status')).queryByTestId('rollup-refresh-note')).toBeNull();
  });

  it('says nothing of the kind for a tile the database answered', async () => {
    const onRefresh = dashboard();
    await userEvent.click(
      within(tile('t-region')).getByRole('button', { name: 'Refresh By region' }),
    );
    expect(onRefresh).toHaveBeenCalledWith('c-region');
    expect(within(tile('t-region')).queryByTestId('rollup-refresh-note')).toBeNull();
  });
});
