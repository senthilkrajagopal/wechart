import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';

/**
 * T086 / AC-080: WHEN the user clears a filter, THE SYSTEM SHALL return every
 * tile in its scope to the unfiltered result.
 * Fails when: any tile still reflects the cleared filter.
 *
 * A KPI of the order count: 240 unfiltered, 80 with one status picked.
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
        { id: 't-kpi', kind: 'chart', chartId: 'c-kpi', w: 3 },
        { id: 't-kpi-2', kind: 'chart', chartId: 'c-kpi-2', w: 3 },
      ],
    },
  ],
  filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
};

const kpi: ChartDocument = {
  schemaVersion: 1,
  title: 'Orders',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    chartType: 'kpi',
  },
};

const unfiltered: RenderSpec = {
  chartType: 'kpi',
  encoding: { y: ['orders.count'] },
  rows: [{ 'orders.count': 240 }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [{ name: 'orders.status', title: 'Status', type: 'string' }],
    },
  ],
};

/** Answers to chart queries held back until released, while set. */
let holding: (() => void)[] | undefined;

beforeEach(() => {
  holding = undefined;
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
      if (holding !== undefined) {
        const held = holding;
        await new Promise<void>((release) => {
          held.push(release);
        });
      }
      // 80 orders of each of three statuses: those every filter keeps count.
      let kept = ['completed', 'shipped', 'processing'];
      for (const each of (query['filters'] as { values: string[] }[] | undefined) ?? [])
        kept = kept.filter((status) => each.values.includes(status));
      return new Response(JSON.stringify({ data: [{ 'orders.count': 80 * kept.length }] }));
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
        specs={{ 'c-kpi': unfiltered, 'c-kpi-2': unfiltered }}
        documents={{ 'c-kpi': kpi, 'c-kpi-2': kpi }}
        onSave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const bar = () => screen.getByRole('region', { name: 'Filters' });
const values = () => screen.getAllByTestId('kpi-value').map((value) => value.textContent);

describe('a filter, cleared', () => {
  it('returns every tile in its scope to the unfiltered result, from its Clear button', async () => {
    dashboard();
    expect(values()).toEqual(['240', '240']);

    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));
    await vi.waitFor(() => {
      expect(values()).toEqual(['80', '80']);
    });

    await userEvent.click(within(bar()).getByRole('button', { name: 'Clear Status' }));

    expect(values()).toEqual(['240', '240']);
    expect(within(bar()).getByRole('checkbox', { name: 'completed' }).matches(':checked')).toBe(
      false,
    );
    // Nothing left waiting on a filter that is gone.
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('offers Clear only while the filter holds a value', async () => {
    dashboard();
    await within(bar()).findByRole('checkbox', { name: 'completed' });
    expect(within(bar()).queryByRole('button', { name: 'Clear Status' })).toBeNull();

    await userEvent.click(within(bar()).getByRole('checkbox', { name: 'completed' }));

    expect(within(bar()).getByRole('button', { name: 'Clear Status' })).toBeTruthy();
  });

  /**
   * Found by T084's review (AC-078: "a tile inside it keeps the previous
   * result" is the failing state, so what shows in between matters): while a
   * changed value was being asked, the tile fell back to its *unfiltered*
   * chart, dimmed — a reader saw every status for as long as Cube took. It
   * keeps the answer it last drew, marked busy, until the new one is in.
   */
  it('shows the last filtered answer, busy, while a changed value is asked', async () => {
    dashboard();
    await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'completed' }));
    await vi.waitFor(() => {
      expect(values()).toEqual(['80', '80']);
    });

    holding = [];
    await userEvent.click(within(bar()).getByRole('checkbox', { name: 'shipped' }));
    await vi.waitFor(() => {
      expect(holding).toHaveLength(2);
    });

    expect(values()).toEqual(['80', '80']);
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(2);

    for (const release of holding) release();
    await vi.waitFor(() => {
      expect(values()).toEqual(['160', '160']);
    });
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  /**
   * Found by T086's review: cleared while another filter still reaches the
   * same tiles, they are asked again — and must end on the answer to the
   * filter that is left, not keep the cleared one's.
   */
  it('leaves the other filters on those tiles in effect', async () => {
    dashboard({
      ...DOC,
      filters: [
        { id: 'f1', widget: 'checkbox', member: 'orders.status' },
        { id: 'f2', widget: 'list', member: 'orders.status' },
      ],
    });
    const [boxes, list] = (await within(bar()).findAllByRole('group', { name: /filter \d$/ })) as [
      HTMLElement,
      HTMLElement,
    ];
    await userEvent.click(await within(boxes).findByRole('checkbox', { name: 'completed' }));
    await userEvent.click(within(boxes).getByRole('checkbox', { name: 'shipped' }));
    await vi.waitFor(() => {
      expect(values()).toEqual(['160', '160']);
    });
    await userEvent.click(await within(list).findByRole('button', { name: 'shipped' }));
    await vi.waitFor(() => {
      expect(values()).toEqual(['80', '80']);
    });

    await userEvent.click(within(list).getByRole('button', { name: 'Clear Status' }));

    await vi.waitFor(() => {
      expect(values()).toEqual(['160', '160']);
    });
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('returns them too when its last value is unpicked', async () => {
    dashboard();
    const completed = await within(bar()).findByRole('checkbox', { name: 'completed' });
    await userEvent.click(completed);
    await vi.waitFor(() => {
      expect(values()).toEqual(['80', '80']);
    });

    await userEvent.click(completed);

    expect(values()).toEqual(['240', '240']);
  });
});
