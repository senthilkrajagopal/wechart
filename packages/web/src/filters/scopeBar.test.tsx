import type { ChartDocument } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';
import { openFilter } from './testing';

/**
 * T083 / AC-077, on the filter bar: a filter's widget shows its scope
 * (direction.md rule 14), and in edit mode the scope can be set to the
 * dashboard, a page tab, or chosen tiles, named by their charts' titles.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      items: [{ id: 't-revenue', kind: 'chart', chartId: 'c-revenue', w: 6 }],
    },
    {
      id: 'ops',
      title: 'Operations',
      items: [{ id: 't-orders', kind: 'chart', chartId: 'c-orders', w: 6 }],
    },
  ],
  filters: [{ id: 'f1', widget: 'list', member: 'orders.status' }],
};

const chart = (title: string): ChartDocument => ({
  schemaVersion: 1,
  title,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: [], dimensions: [], timeDimensions: [] },
  },
});

const DOCUMENTS = {
  'c-revenue': chart('Revenue by month'),
  'c-orders': chart('Orders by status'),
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [],
      dimensions: [{ name: 'orders.status', title: 'Status', type: 'string' }],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/meta') return new Response(JSON.stringify(META));
      return new Response(JSON.stringify({ data: [] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(document = DOC) {
  const onSave = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={document}
        specs={{}}
        documents={DOCUMENTS}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

const bar = () => screen.getByRole('region', { name: 'Filters' });
const badge = async () => (await within(bar()).findByTestId('scope-badge')).textContent;

describe('a filter’s scope, on its widget', () => {
  it('is shown to a reader: the whole dashboard, until set otherwise', async () => {
    dashboard();
    expect(await badge()).toBe('Dashboard');
  });

  it('is shown for a tab, and for chosen tiles', async () => {
    dashboard({
      ...DOC,
      filters: [
        {
          id: 'f1',
          widget: 'list',
          member: 'orders.status',
          scope: { kind: 'page', pageId: 'ops' },
        },
      ],
    });
    expect(await badge()).toBe('Tab: Operations');
    cleanup();

    dashboard({
      ...DOC,
      filters: [
        {
          id: 'f1',
          widget: 'list',
          member: 'orders.status',
          scope: { kind: 'tiles', tileIds: ['t-revenue', 't-orders'] },
        },
      ],
    });
    expect(await badge()).toBe('Tiles: Revenue by month, Orders by status');
  });

  /**
   * Found by T083's review: choosing "choose a field…" again rebuilt the
   * filter from its id and kind alone, and its scope went with the field — a
   * tab's filter became the whole dashboard's without a word.
   */
  it('is kept when the filter’s field is unset and chosen again', async () => {
    dashboard({
      ...DOC,
      filters: [
        {
          id: 'f1',
          widget: 'list',
          member: 'orders.status',
          scope: { kind: 'page', pageId: 'ops' },
        },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await openFilter();
    const field = await within(bar()).findByLabelText('Filter on');

    await userEvent.selectOptions(field, '');
    await userEvent.selectOptions(within(bar()).getByLabelText('Filter on'), 'orders.status');

    expect(await badge()).toBe('Tab: Operations');
  });

  it('can be set to a tab, or to tiles named by their charts, and is saved', async () => {
    const onSave = dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await openFilter();

    const appliesTo = await within(bar()).findByLabelText('Applies to');
    expect([...appliesTo.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'The whole dashboard',
      'Tab: Overview',
      'Tab: Operations',
      'Chosen tiles',
    ]);

    await userEvent.selectOptions(appliesTo, 'Tab: Overview');
    expect(await badge()).toBe('Tab: Overview');

    await userEvent.selectOptions(appliesTo, 'Chosen tiles');
    expect(await badge()).toBe('No tiles chosen');
    const tiles = within(bar()).getByRole('group', { name: 'Tiles it applies to' });
    expect(
      within(tiles)
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['Revenue by month (Overview)', 'Orders by status (Operations)']);
    await userEvent.click(
      within(tiles).getByRole('checkbox', { name: 'Orders by status (Operations)' }),
    );
    expect(await badge()).toBe('Tile: Orders by status');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    expect(saved.filters?.[0]?.scope).toEqual({ kind: 'tiles', tileIds: ['t-orders'] });
  });

  it('is one change, which Undo takes back', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await openFilter();
    await userEvent.selectOptions(
      await within(bar()).findByLabelText('Applies to'),
      'Tab: Operations',
    );
    expect(await badge()).toBe('Tab: Operations');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await badge()).toBe('Dashboard');
  });
});
