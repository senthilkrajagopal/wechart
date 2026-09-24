import { CHART_DOCUMENT_VERSION } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 * Fails when: the previous result is shown again with an unchanged
 * timestamp.
 *
 * On the page that owns the dashboard's charts: a refresh and the
 * dashboard's own load of its charts must not undo each other (T154's
 * review, finding 2), and a refresh reads the chart as it is now (finding 5).
 */
const dashboardBody = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    { id: 'p1', title: 'Overview', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6 }] },
  ],
};

const chartBody = (title: string) => ({
  // As the API serves a chart: upgraded to the current format on read.
  schemaVersion: CHART_DOCUMENT_VERSION,
  title,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const timeOf = (second: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, second)).toISOString();

/**
 * The server: the dashboard, its one chart (titled as `chartTitle` says at
 * the moment it is read), and each load answered in turn — a test holds one
 * back by queueing a promise.
 */
let chartTitle = 'By status';
let answers: (() => Promise<Response>)[] = [];
const loads: { cache?: string }[] = [];

function answerAt(second: number, held?: Promise<void>) {
  answers.push(async () => {
    if (held !== undefined) await held;
    return json(200, {
      data: [{ 'orders.status': 'completed', 'orders.count': 3 }],
      lastRefreshTime: timeOf(second),
    });
  });
}

beforeEach(() => {
  chartTitle = 'By status';
  answers = [];
  loads.length = 0;
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
      if (url === '/api/documents/dashboard/d1')
        return json(200, { id: 'd1', body: dashboardBody, version: 1 });
      if (url === '/api/documents/chart/c1')
        return json(200, { id: 'c1', body: chartBody(chartTitle), version: 1 });
      if (url === '/api/load') {
        loads.push(JSON.parse(String(init?.body)) as { cache?: string });
        const next = answers.shift();
        if (next === undefined) throw new Error('A load the test did not expect');
        return next();
      }
      return json(404, { error: 'Not found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function page(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <DashboardPage dashboardId="d1" />
    </QueryClientProvider>,
  );
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const asOf = () => screen.getByTestId('data-as-of').getAttribute('datetime');

describe('refreshing a tile, on the page', () => {
  it('cannot be asked while the dashboard’s charts are still loading', async () => {
    let release = () => {};
    answerAt(1, new Promise((resolve) => (release = resolve)));
    page(newClient());

    const refresh = await screen.findByRole('button', { name: /^Refresh / });
    expect((refresh as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release();
    });
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(1));
    });
    expect((screen.getByRole('button', { name: /^Refresh / }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('drops its answer when a newer load of the charts began while it was out', async () => {
    const client = newClient();
    answerAt(1);
    page(client);
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(1));
    });

    // The refresh goes out and is held; meanwhile the charts are loaded
    // again (a save's re-fetch) and answer first, with newer data.
    let release = () => {};
    answerAt(2, new Promise((resolve) => (release = resolve)));
    answerAt(3);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh By status' }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['dashboard-charts', 'd1'] });
    });
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(3));
    });

    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The older ask landed last, and did not put its answer over the newer one.
    expect(asOf()).toBe(timeOf(3));
    expect(loads.map((load) => load.cache)).toEqual([undefined, 'no-cache', undefined]);
  });

  it('reads the chart as it is now, and names the tile by it', async () => {
    answerAt(1);
    page(newClient());
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(1));
    });

    chartTitle = 'Orders by status';
    answerAt(2);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh By status' }));

    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(2));
    });
    const tile = document.querySelector('[data-tile="t1"]') as HTMLElement;
    expect(within(tile).getByRole('heading', { name: 'Orders by status' })).toBeTruthy();
    expect(within(tile).getByRole('button', { name: 'Refresh Orders by status' })).toBeTruthy();
  });

  /**
   * T172 / AC-166, from its review: previewed as a security context, the
   * dashboard's own load of its charts and a tile's refresh are both asked
   * as it.
   */
  it('asks as a previewed security context, the charts’ load and the refresh alike', async () => {
    const context = { groups: ['sales'] };
    answerAt(1);
    render(
      <QueryClientProvider client={newClient()}>
        <DashboardPage dashboardId="d1" preview={context} />
      </QueryClientProvider>,
    );
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(1));
    });

    answerAt(2);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh By status' }));
    await vi.waitFor(() => {
      expect(asOf()).toBe(timeOf(2));
    });

    expect(loads).toEqual([
      expect.objectContaining({ context }),
      expect.objectContaining({ context, cache: 'no-cache' }),
    ]);
  });
});
