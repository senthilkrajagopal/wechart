import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';
import {
  fieldButton,
  fieldsOffered,
  openFilter,
  pickField,
  properties,
  selectFilter,
} from './testing';

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
        { name: 'orders.region', title: 'Region', type: 'string' },
        { name: 'orders.id', title: 'Id', type: 'number' },
      ],
    },
  ],
};

/** Every query the filter bar asked Cube, in order. */
let asked: Record<string, unknown>[] = [];
/** How many values each answer carries: two, or the cap. */
let answerRows = 2;

beforeEach(() => {
  asked = [];
  answerRows = 2;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/meta') return new Response(JSON.stringify(META), { status: 200 });
      if (url.startsWith('/api/load')) {
        const { query } = JSON.parse(String(init?.body)) as { query: Record<string, unknown> };
        asked.push(query);
        const member = (query['dimensions'] as string[])[0] ?? '';
        const values =
          answerRows === 2
            ? ['completed', 'shipped']
            : Array.from({ length: answerRows }, (_, index) => `value ${String(index)}`);
        return new Response(
          JSON.stringify({ data: values.map((value) => ({ [member]: value })) }),
          { status: 200 },
        );
      }
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
  // Adding one leaves the sidebar on its Properties (T468): back to Add for the next.
  await userEvent.click(screen.getByRole('tab', { name: 'Add' }));
  await userEvent.click(screen.getByTestId('add-filter'));
  const kinds = screen.getByRole('list', { name: 'Filter widgets' });
  await userEvent.click(within(kinds).getByRole('button', { name: new RegExp(`^${label}`) }));
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

    // Each asks for its field, offering only the members it can filter on:
    // selected, in Properties (T468, UX-031).
    const pick = async (index: number, member: string) => {
      await selectFilter(filters[index]);
      await pickField(properties(), member);
    };
    await pick(0, 'orders.ordered_at');
    await pick(1, 'orders.status');
    await pick(2, 'orders.id');
    await pick(3, 'orders.status');

    await openFilter(filters[0]);
    expect(within(bar()).getByLabelText('Ordered at').tagName).toBe('SELECT');
    await openFilter(filters[1]);
    expect(await within(bar()).findByRole('searchbox', { name: 'Search Status' })).toBeTruthy();
    await openFilter(filters[2]);
    expect(within(bar()).getByLabelText('Id from')).toBeTruthy();
    await openFilter(filters[3]);
    expect(await within(bar()).findByRole('checkbox', { name: 'shipped' })).toBeTruthy();
  });

  /** Since T468 (UX-031): selected, its settings in Properties, one filter's at a time. */
  it('selects the filter just added, ready for its field, and one filter at a time', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Date range');
    await pickField(properties(), 'orders.ordered_at');
    await addFilter('Checkbox list');

    const [dates] = within(bar()).getAllByTestId(/^filter-/) as [HTMLElement, HTMLElement];
    expect(
      within(properties()).getByRole('region', { name: 'Checkbox list filter 2' }),
    ).toBeTruthy();
    expect(within(properties()).queryByRole('region', { name: 'Date range filter 1' })).toBeNull();

    await selectFilter(dates);

    expect(within(properties()).getByRole('region', { name: 'Date range filter 1' })).toBeTruthy();
    expect(
      within(properties()).queryByRole('region', { name: 'Checkbox list filter 2' }),
    ).toBeNull();
  });

  it('offers a date range only time fields, and a numeric range only number fields', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Date range');
    await addFilter('Numeric range');

    const filterAt = (index: number) => within(bar()).getAllByTestId(/^filter-/)[index];
    // The selected filter's, in Properties (T468), as design 10's picker lists them (T633).
    await selectFilter(filterAt(0));
    expect(
      await vi.waitFor(async () => {
        const found = await fieldsOffered(properties());
        if (found.length === 0) throw new Error('no fields yet');
        return found;
      }),
    ).toEqual(['orders.ordered_at']);
    await selectFilter(filterAt(1));
    expect(await fieldsOffered(properties())).toEqual(['orders.id']);
  });

  it('is saved with the dashboard', async () => {
    const onSave = dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Checkbox list');
    await pickField(properties(), 'orders.status');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    expect(saved.filters?.map((filter) => [filter.widget, filter.member])).toEqual([
      ['checkbox', 'orders.status'],
    ]);
  });

  it('is one change: Undo takes it off the filter bar', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Numeric range');
    expect(within(bar()).getAllByTestId(/^filter-/)).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // The bar stays — it is always shown (AC-196) — with no filter on it.
    expect(within(bar()).queryAllByTestId(/^filter-/)).toHaveLength(0);
  });

  it('says a filter goes to the filter bar while its kinds are offered', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('add-destination').textContent).toBe('Adds to the end of Overview.');

    await userEvent.click(screen.getByTestId('add-filter'));

    expect(screen.getByTestId('add-destination').textContent).toBe('Adds to the filter bar.');
  });

  it('names each filter apart, for a reader who cannot see the bar', async () => {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('Date range');
    await addFilter('Date range');

    expect(
      within(bar())
        .getAllByRole('group', { name: /filter/ })
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Date range filter 1', 'Date range filter 2']);
  });
});

/**
 * Found by T082's review: the values are fetched capped at 1,000, and the
 * search looked only through those — a value past the cap could not be found,
 * and nothing said the list was short.
 */
describe('the values a list filter offers', () => {
  async function listOn(member: string) {
    dashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('List with search');
    await pickField(properties(), member);
    // Its values in its pill's popover (T468).
    await openFilter();
  }

  it('are asked of Cube in order, and a search is asked of Cube too', async () => {
    await listOn('orders.status');
    await within(bar()).findByRole('button', { name: 'shipped' });
    expect(asked.at(-1)).toEqual({
      dimensions: ['orders.status'],
      order: { 'orders.status': 'asc' },
      limit: 1000,
    });

    await userEvent.type(within(bar()).getByRole('searchbox', { name: 'Search Status' }), 'ship');

    await vi.waitFor(() => {
      expect(asked.at(-1)).toEqual({
        dimensions: ['orders.status'],
        filters: [{ member: 'orders.status', operator: 'contains', values: ['ship'] }],
        order: { 'orders.status': 'asc' },
        limit: 1000,
      });
    });
  });

  it('say when they stop at the cap', async () => {
    answerRows = 1000;
    await listOn('orders.status');

    expect((await within(bar()).findByTestId('filter-options-cut')).textContent).toBe(
      'Showing the first 1,000 values. Search to find others.',
    );
  });
});

/**
 * Found by T082's review: a value belongs to the field it was chosen on. Undo
 * put a filter back on its old field and left it holding values from the new
 * one — which, applied, would empty every tile it reaches.
 */
it('a value stays with the field it was chosen on, through Undo', async () => {
  dashboard();
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await addFilter('Checkbox list');
  await pickField(properties(), 'orders.status');
  await pickField(properties(), 'orders.region');
  // Its values in its pill's popover (T468).
  await openFilter();
  await userEvent.click(await within(bar()).findByRole('checkbox', { name: 'shipped' }));
  expect(within(bar()).getByRole('checkbox', { name: 'shipped' }).matches(':checked')).toBe(true);

  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await openFilter();

  expect(within(bar()).getByRole('group', { name: 'Status' })).toBeTruthy();
  expect(
    within(bar())
      .getAllByRole('checkbox')
      .filter((box) => box.matches(':checked')),
  ).toHaveLength(0);
});

/**
 * T429, AC-329, a dashboard's half: a filter picks from the cubes on the
 * dashboard's folder path alone, each cube's members under its title and
 * folder path — never a sibling folder's cube.
 */
describe('a filter’s fields on a dashboard in a folder (T429)', () => {
  const xcubeCube = (folderId: string, shortName: string, title: string) => ({
    name: folderId === 'froot' ? shortName : `${folderId}__${shortName}`,
    title,
    meta: { xcube: { folderId, shortName } },
    measures: [],
    dimensions: [
      {
        name: `${folderId === 'froot' ? shortName : `${folderId}__${shortName}`}.status`,
        // As Cube titles a member: its cube's title first, and the short one alone.
        title: `${title} Status`,
        shortTitle: 'Status',
        type: 'string',
      },
    ],
  });

  it('offers the members of the cubes on the dashboard’s path, by cube and folder path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/meta')
          return new Response(
            JSON.stringify({
              cubes: [
                xcubeCube('froot', 'orders', 'Orders'),
                xcubeCube('fa', 'sales', 'Sales'),
                xcubeCube('fb', 'widgets', 'Widgets'),
              ],
            }),
          );
        if (url === '/api/folders')
          return new Response(
            JSON.stringify([
              { id: 'a', title: 'A', parentId: 'root', xcubeId: 'fa' },
              { id: 'b', title: 'B', parentId: 'root', xcubeId: 'fb' },
            ]),
          );
        return new Response('{}', { status: 404 });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DashboardView
          dashboardId="d1"
          document={{ ...DOC, folderId: 'a' }}
          specs={{}}
          onSave={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await addFilter('List with search');

    // Design 10's picker (T633): by folder, nearest first, each field by its
    // short title ("Status") with its cube and folder path beside it (T742,
    // design-10-Q6).
    await userEvent.click(fieldButton(properties()));
    const list = await screen.findByRole('listbox', { name: 'Fields' });
    await waitFor(() => expect(within(list).getAllByRole('group')).toHaveLength(2));
    expect(
      within(list)
        .getAllByRole('group')
        .map((group) => ({
          label: group.getAttribute('aria-label'),
          options: within(group)
            .getAllByRole('option')
            .map((option) => [
              option.getAttribute('data-member'),
              option.querySelector('.cube-picker__title')?.textContent,
              option.querySelector('.cube-picker__path')?.textContent,
            ]),
        })),
    ).toEqual([
      { label: 'A', options: [['fa__sales.status', 'Status', 'Sales · A']] },
      { label: 'Shared', options: [['orders.status', 'Status', 'Orders · Shared']] },
    ]);

    // Its search still finds a field by its whole title, its cube's name in
    // it, though the row reads the short one (T742's review).
    await userEvent.type(within(list.parentElement!).getByRole('combobox'), 'orders');
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.getAttribute('data-member')),
      ).toEqual(['orders.status']),
    );
  });
});
