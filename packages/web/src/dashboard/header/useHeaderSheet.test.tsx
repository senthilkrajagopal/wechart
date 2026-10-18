import { CHART_DOCUMENT_VERSION } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../DashboardPage';

/**
 * T835 (AC-490; 19-Q2, "No, always start compact (Recommended)"): the header
 * sheet stays open or closed as the reader left it while the dashboard stays
 * open — across a change of page tab, a bookmark applied and a refresh of
 * its data — and starts closed whenever the dashboard is opened anew. It is
 * kept nowhere but the page.
 */
const dashboardBody = {
  schemaVersion: 1,
  title: 'Sales',
  description: 'Revenue for EMEA.',
  settings: { width: 'full' },
  pages: [
    { id: 'p1', title: 'Overview', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6 }] },
    { id: 'p2', title: 'Detail', items: [] },
  ],
  filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
};

const chartBody = {
  schemaVersion: CHART_DOCUMENT_VERSION,
  title: 'By status',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
};

/** A bookmark of the Detail page with Status set to shipped. */
const bookmark = {
  id: 'b1',
  dashboardId: 'd1',
  name: 'Shipped',
  state: {
    page: 'p2',
    filters: { 'f1 orders.status': { kind: 'values', values: ['shipped'] } },
    marks: {},
    markFilters: [],
    from: {},
  },
  shared: false,
  mine: true,
  mayDelete: true,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Every request the page sent, by method and address, with its body. */
let asked: { url: string; method: string; body: string }[] = [];

beforeEach(() => {
  asked = [];
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
      asked.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
      if (url === '/api/documents/dashboard/d1')
        return json({ id: 'd1', body: dashboardBody, version: 1 });
      if (url === '/api/documents/chart/c1') return json({ id: 'c1', body: chartBody, version: 1 });
      if (url === '/api/dashboards/d1/bookmarks') return json({ bookmarks: [bookmark] });
      if (url === '/api/load')
        return json({
          data: [{ 'orders.status': 'shipped', 'orders.count': 3 }],
          lastRefreshTime: new Date(Date.UTC(2026, 9, 17)).toISOString(),
        });
      return json({ error: 'Not found' }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function page() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardPage dashboardId="d1" />
    </QueryClientProvider>,
  );
}

/** The toggle, "Filters" or "Details" as the model's titles allow (AC-486). */
const toggleName = /^(Filters\b|Details$)/;
const toggle = () => screen.getByRole('button', { name: toggleName });
const expanded = () => toggle().getAttribute('aria-expanded');

/** A page tab, a bookmark applied and a refresh, in turn, the sheet's state read after each. */
async function visit(): Promise<(string | null)[]> {
  const seen: (string | null)[] = [];
  await userEvent.click(screen.getByRole('tab', { name: 'Detail' }));
  expect(screen.getByRole('tab', { name: 'Detail' }).getAttribute('aria-selected')).toBe('true');
  seen.push(expanded());

  await userEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));
  const popover = screen.getByRole('dialog', { name: 'Bookmarks' });
  await userEvent.click(await within(popover).findByRole('button', { name: 'Shipped' }));
  await screen.findByText('Applied the bookmark “Shipped”.');
  seen.push(expanded());

  await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
  const refresh = await screen.findByRole('button', { name: 'Refresh By status' });
  await vi.waitFor(() => {
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  });
  const loads = asked.filter((each) => each.url === '/api/load').length;
  await userEvent.click(refresh);
  await vi.waitFor(() => {
    expect(asked.filter((each) => each.url === '/api/load').length).toBeGreaterThan(loads);
  });
  seen.push(expanded());
  return seen;
}

describe('the header sheet for the visit', () => {
  it('stays open across a page tab, a bookmark applied and a refresh', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: toggleName }));
    expect(expanded()).toBe('true');
    expect(await visit()).toEqual(['true', 'true', 'true']);
  });

  it('stays closed across the same', async () => {
    page();
    await screen.findByRole('button', { name: toggleName });
    expect(expanded()).toBe('false');
    expect(await visit()).toEqual(['false', 'false', 'false']);
  });

  it('starts closed when the dashboard is opened again, and is kept nowhere but the page', async () => {
    const stored = [localStorage.length, sessionStorage.length];
    const first = page();
    await userEvent.click(await screen.findByRole('button', { name: toggleName }));
    expect(expanded()).toBe('true');
    first.unmount();

    page();
    expect(await screen.findByRole('button', { name: toggleName })).toHaveProperty(
      'ariaExpanded',
      'false',
    );
    expect([localStorage.length, sessionStorage.length]).toEqual(stored);
    // Nothing written: every request a read.
    expect(asked.filter((each) => each.method !== 'GET' && each.url !== '/api/load')).toEqual([]);
    expect(asked.some((each) => /sheet/i.test(each.url + each.body))).toBe(false);
  });
});
