import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';

/**
 * T082 / AC-076, on the dashboard: each of the four filter widgets can be
 * added to a dashboard — from the Add panel's Filter entry, onto the filter
 * bar (direction.md: "Filter bar … horizontal, under the title") — and, once
 * given a field, shows its control.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Overview', items: [] }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [
        { name: 'orders.ordered_at', title: 'Ordered at', type: 'time' },
        { name: 'orders.status', title: 'Status', type: 'string' },
        { name: 'orders.id', title: 'Id', type: 'number' },
      ],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/meta') return new Response(JSON.stringify(META), { status: 200 });
      if (url.startsWith('/api/load'))
        return new Response(
          JSON.stringify({
            data: [{ 'orders.status': 'completed' }, { 'orders.status': 'shipped' }],
          }),
          { status: 200 },
        );
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard() {
  const onSave = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={onSave} />
    </QueryClientProvider>,
  );
  return onSave;
}

async function addFilter(label: string) {
  await userEvent.click(screen.getByTestId('add-filter'));
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
}

const bar = () => screen.getByRole('region', { name: 'Filters' });

describe('adding a filter', () => {
  it('adds each of the four widgets to the filter bar, and each shows its control once given a field', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await addFilter('Date range');
    await addFilter('List with search');
    await addFilter('Numeric range');
    await addFilter('Checkbox list');

    const filters = within(bar()).getAllByTestId(/^filter-/);
    expect(filters.map((filter) => filter.getAttribute('data-widget'))).toEqual([
      'dateRange',
      'list',
      'range',
      'checkbox',
    ]);

    // Each asks for its field, offering only the members it can filter on.
    const pick = async (index: number, member: string) => {
      const select = within(filters[index] as HTMLElement).getByLabelText('Filter on');
      await userEvent.selectOptions(select, member);
    };
    await pick(0, 'orders.ordered_at');
    await pick(1, 'orders.status');
    await pick(2, 'orders.id');
    await pick(3, 'orders.status');

    expect(within(bar()).getByLabelText('Ordered at').tagName).toBe('SELECT');
    expect(await within(bar()).findByRole('searchbox', { name: 'Search Status' })).toBeTruthy();
    expect(within(bar()).getByLabelText('Id from')).toBeTruthy();
    expect(await within(bar()).findByRole('checkbox', { name: 'shipped' })).toBeTruthy();
  });

  it('offers a date range only time fields, and a numeric range only number fields', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Date range');
    await addFilter('Numeric range');

    const optionsOf = (index: number) =>
      [
        ...within(within(bar()).getAllByTestId(/^filter-/)[index] as HTMLElement)
          .getByLabelText('Filter on')
          .querySelectorAll('option'),
      ]
        .map((option) => option.value)
        .filter((value) => value !== '');

    expect(
      await vi.waitFor(() => {
        const found = optionsOf(0);
        if (found.length === 0) throw new Error('no fields yet');
        return found;
      }),
    ).toEqual(['orders.ordered_at']);
    expect(optionsOf(1)).toEqual(['orders.id']);
  });

  it('is saved with the dashboard', async () => {
    const onSave = dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Checkbox list');
    await userEvent.selectOptions(within(bar()).getByLabelText('Filter on'), 'orders.status');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    expect(saved.filters?.map((filter) => [filter.widget, filter.member])).toEqual([
      ['checkbox', 'orders.status'],
    ]);
  });
});
