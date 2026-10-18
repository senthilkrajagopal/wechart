import type { ChartDocument } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import { openHeaderSheet } from '../dashboard/header/testing';
import type { DashboardDocument } from '../dashboard/model/document';
import { reachFrom } from './coverage';
import { openFilter } from './testing';

/**
 * T085 / AC-079: WHEN a filter's member is not reachable from a tile's cube or
 * view, THE SYSTEM SHALL leave that tile unfiltered and mark it as not covered
 * by the filter.
 * Fails when: the tile shows a query error, or is silently left unfiltered
 * with no indication.
 *
 * Two charts: orders counted by status, and weather counted by city — a cube
 * with no join path to orders.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 't-orders', kind: 'chart', chartId: 'c-orders', w: 6 },
        { id: 't-weather', kind: 'chart', chartId: 'c-weather', w: 6 },
      ],
    },
  ],
  filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
};

const chart = (cube: string, dimension: string): ChartDocument => ({
  schemaVersion: 1,
  title: cube,
  chart: {
    source: { cube },
    wells: { measures: [`${cube}.count`], dimensions: [dimension], timeDimensions: [] },
    chartType: 'bar',
  },
});

const dim = (name: string, title: string) => ({ name, title, shortTitle: title, type: 'string' });
const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      type: 'cube',
      connectedComponent: 1,
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [dim('orders.status', 'Status')],
      segments: [],
    },
    {
      name: 'weather',
      title: 'Weather',
      type: 'cube',
      connectedComponent: 2,
      measures: [{ name: 'weather.count', title: 'Count', type: 'number' }],
      dimensions: [dim('weather.city', 'City')],
      segments: [],
    },
  ],
};

let charted: Record<string, unknown>[] = [];

beforeEach(() => {
  charted = [];
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
        return new Response(JSON.stringify({ data: [{ 'orders.status': 'completed' }] }));
      charted.push(query);
      return new Response(JSON.stringify({ data: [] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(reach = reachFrom(META)) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{}}
        documents={{
          'c-orders': chart('orders', 'orders.status'),
          'c-weather': chart('weather', 'weather.city'),
        }}
        reach={reach}
        onSave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const bar = () => screen.getByRole('region', { name: 'Filters' });
const tile = (id: string) => document.querySelector(`[data-tile="${id}"]`) as HTMLElement;

describe('a filter on a field a tile cannot reach', () => {
  it('leaves that tile unfiltered — never asks it with the filter — and marks it', async () => {
    dashboard();
    await openFilter();
    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    await vi.waitFor(() => {
      expect(charted).toHaveLength(1);
    });
    expect((charted[0]?.['measures'] as string[])[0]).toBe('orders.count');
    // Named as the filter bar names it: the field's title in the model.
    expect((await within(tile('t-weather')).findByTestId('not-covered')).textContent).toBe(
      'Not filtered by Status',
    );
    expect(within(tile('t-orders')).queryByTestId('not-covered')).toBeNull();
    expect(within(tile('t-weather')).queryByRole('alert')).toBeNull();
  });

  /**
   * T182 / AC-176: why, in words on the tile. A tooltip is reached by a
   * pointer alone, and the tile's note takes no focus to show one.
   */
  it('says why on the tile itself, not only in a tooltip', async () => {
    dashboard();
    await openFilter();
    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    const note = await within(tile('t-weather')).findByTestId('not-covered');
    const why = within(tile('t-weather')).getByText(
      'Its cube or view has no path to that field in the model.',
    );
    expect(note.getAttribute('aria-describedby')).toBe(why.id);
    expect(note.hasAttribute('title')).toBe(false);
  });

  it('is not marked while no value is set, nor once the filter is cleared', async () => {
    dashboard();
    await openFilter();
    const completed = await within(bar()).findByRole('checkbox', { name: 'completed' });
    expect(within(tile('t-weather')).queryByTestId('not-covered')).toBeNull();

    await userEvent.click(completed);
    expect(await within(tile('t-weather')).findByTestId('not-covered')).toBeTruthy();
    await userEvent.click(within(bar()).getByRole('button', { name: /^Clear / }));

    expect(within(tile('t-weather')).queryByTestId('not-covered')).toBeNull();
  });
});

/**
 * Found by T085's review: two cubes in one join component can still have no
 * join path — the seed's customers and products both join only *from*
 * orders — and a chart on one filtered by the other failed with Cube's
 * `Can't find join path to join 'customers', 'products'` (observed against
 * Cube v1.7.42; research: markings-query-support.md Q4). Where the model
 * cannot say, the filtered query is Cube's answer: refused for want of a join
 * path, the tile shows its unfiltered chart and is marked — no error.
 */
describe('a filter Cube cannot join to a tile', () => {
  const SIBLINGS: DashboardDocument = {
    schemaVersion: 1,
    title: 'Customers',
    settings: { width: 'full' },
    pages: [
      {
        id: 'p1',
        title: 'Overview',
        items: [{ id: 't-customers', kind: 'chart', chartId: 'c-customers', w: 6 }],
      },
    ],
    filters: [
      { id: 'f-category', widget: 'checkbox', member: 'products.category' },
      { id: 'f-country', widget: 'checkbox', member: 'customers.country' },
    ],
  };
  const SIBLING_META = {
    cubes: [
      {
        name: 'customers',
        title: 'Customers',
        type: 'cube',
        connectedComponent: 1,
        measures: [{ name: 'customers.count', title: 'Count', type: 'number' }],
        dimensions: [dim('customers.country', 'Country')],
        segments: [],
      },
      {
        name: 'products',
        title: 'Products',
        type: 'cube',
        connectedComponent: 1,
        measures: [],
        dimensions: [dim('products.category', 'Category')],
        segments: [],
      },
    ],
  };
  const kpi: ChartDocument = {
    schemaVersion: 1,
    title: 'Customers',
    chart: {
      source: { cube: 'customers' },
      wells: { measures: ['customers.count'], dimensions: [], timeDimensions: [] },
      chartType: 'kpi',
    },
  };
  /** Filtered answers come back with no rows, while set. */
  let answerNothing = false;

  beforeEach(() => {
    answerNothing = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/meta') return new Response(JSON.stringify(SIBLING_META));
        const { query } = JSON.parse(String(init?.body)) as { query: Record<string, unknown> };
        const dimension = (query['dimensions'] as string[] | undefined)?.[0];
        if (query['measures'] === undefined)
          return new Response(
            JSON.stringify({
              data: [
                dimension === 'products.category'
                  ? { 'products.category': 'Components' }
                  : { 'customers.country': 'Norway' },
              ],
            }),
          );
        charted.push(query);
        const filters = (query['filters'] as { member: string }[] | undefined) ?? [];
        if (filters.some((each) => each.member === 'products.category'))
          return new Response(
            JSON.stringify({
              type: 'UserError',
              error: "Can't find join path to join 'customers', 'products'",
            }),
            { status: 400 },
          );
        if (filters.length > 0 && answerNothing) return new Response(JSON.stringify({ data: [] }));
        return new Response(
          JSON.stringify({ data: [{ 'customers.count': filters.length ? 1 : 4 }] }),
        );
      }),
    );
  });

  function customers() {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DashboardView
          dashboardId="d1"
          document={SIBLINGS}
          specs={{
            'c-customers': {
              chartType: 'kpi',
              encoding: { y: ['customers.count'] },
              rows: [{ 'customers.count': 4 }],
            },
          }}
          documents={{ 'c-customers': kpi }}
          reach={reachFrom(SIBLING_META)}
          onSave={vi.fn()}
        />
      </QueryClientProvider>,
    );
  }

  it('shows the tile unfiltered and marked, with no error', async () => {
    customers();
    await openHeaderSheet();
    const [category] = (await within(bar()).findAllByRole('group', {
      name: /filter \d$/,
    })) as [HTMLElement];
    await openFilter(category);
    await userEvent.click(await within(category).findByRole('checkbox', { name: 'Components' }));

    expect((await within(tile('t-customers')).findByTestId('not-covered')).textContent).toBe(
      'Not filtered by Category',
    );
    expect(within(tile('t-customers')).queryByRole('alert')).toBeNull();
    expect(within(tile('t-customers')).getByTestId('kpi-value').textContent).toBe('4');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('keeps the filters it can join, asked again without the one it cannot', async () => {
    customers();
    await openHeaderSheet();
    const [category, country] = (await within(bar()).findAllByRole('group', {
      name: /filter \d$/,
    })) as [HTMLElement, HTMLElement];
    await openFilter(category);
    await userEvent.click(await within(category).findByRole('checkbox', { name: 'Components' }));
    await openFilter(country);
    await userEvent.click(await within(country).findByRole('checkbox', { name: 'Norway' }));

    await vi.waitFor(() => {
      expect(within(tile('t-customers')).getByTestId('kpi-value').textContent).toBe('1');
    });
    expect(within(tile('t-customers')).getByTestId('not-covered').textContent).toBe(
      'Not filtered by Category',
    );
    expect(charted.at(-1)?.['filters']).toEqual([
      { member: 'customers.country', operator: 'equals', values: ['Norway'] },
    ]);
    expect(within(tile('t-customers')).queryByRole('alert')).toBeNull();
  });

  /**
   * T050's review: the empty state names the filters in effect (AC-043), and
   * one Cube refused is not in effect — no test showed it was left out.
   */
  it('leaves a refused filter out of the filters an empty tile names', async () => {
    answerNothing = true;
    customers();
    await openHeaderSheet();
    const [category, country] = (await within(bar()).findAllByRole('group', {
      name: /filter \d$/,
    })) as [HTMLElement, HTMLElement];
    await openFilter(category);
    await userEvent.click(await within(category).findByRole('checkbox', { name: 'Components' }));
    await openFilter(country);
    await userEvent.click(await within(country).findByRole('checkbox', { name: 'Norway' }));

    const empty = await within(tile('t-customers')).findByTestId('tile-no-rows');
    await vi.waitFor(() => {
      expect(
        within(empty)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['customers.country is Norway']);
    });
  });
});

describe('before the model can say', () => {
  it('filters as asked, for Cube to answer', async () => {
    dashboard(() => undefined);
    await openFilter();
    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));

    await vi.waitFor(() => {
      expect(charted.length).toBeGreaterThan(0);
    });
  });
});
