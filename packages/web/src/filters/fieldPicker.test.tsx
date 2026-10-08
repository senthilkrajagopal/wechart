import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardDocument } from '../dashboard/model/document';
import { WorkspaceItemContext } from '../query/meta';
import { FilterSettings } from './FilterSettings';
import type { DashboardFilter } from './model';

/**
 * T633 (AC-329; R64, the user: "Yes, same picker"), as T718 has it (AC-428;
 * R71; AC-342 retired): a filter's "Filter on" is design 10's grouped picker,
 * as the chart editor's cube picker is (T475). It opens on a "Search fields"
 * box over the fields of the cubes on the dashboard's folder path, grouped by
 * folder, nearest first, each field by its title with its cube and folder
 * path beside it. A name is one item's, so nothing is hidden; a workspace
 * dashboard's copy of a landed cube is listed in its place, "Your copy".
 *
 * /A (`fa`) holds `a_orders`, /A/B (`fab`) `ab_lines`; the root holds `sales`
 * and `customers`. The dashboard is in /A/B.
 */
const cube = (folderId: string, name: string, title: string) => ({
  name,
  title,
  type: 'cube',
  meta: { xcube: { folderId, shortName: name } },
  measures: [{ name: `${name}.count`, title: `${title} Count`, type: 'number' }],
  dimensions: [{ name: `${name}.region`, title: `${title} Region`, type: 'string' }],
  segments: [],
});
const META = {
  cubes: [
    cube('froot', 'sales', 'Sales'),
    cube('froot', 'customers', 'Customers'),
    cube('fa', 'a_orders', 'A orders'),
    cube('fab', 'ab_lines', 'AB lines'),
  ],
};
const FOLDERS = [
  { id: 'a', title: 'A', parentId: 'root', itemCount: 0, xcubeId: 'fa' },
  { id: 'b', title: 'B', parentId: 'a', itemCount: 0, xcubeId: 'fab' },
];
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  folderId: 'b',
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Overview', items: [] }],
};
const FILTER: DashboardFilter = { id: 'f1', widget: 'list' };

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/meta') return Response.json(META);
      if (url === '/api/folders') return Response.json(FOLDERS);
      return new Response('{}', { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function settings() {
  const onFilters = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FilterSettings
        filter={FILTER}
        filters={[FILTER]}
        dashboard={DOC}
        chartTitleOf={() => undefined}
        onFilters={onFilters}
        onValue={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onFilters, button: screen.getByRole('button', { name: /^Filter on/ }) };
}

describe('a filter’s field picker, as design 10’s (T633, T718, AC-329, AC-428)', () => {
  it('lists the path’s fields by folder, nearest first, each with its cube and path, none dimmed', async () => {
    const { button } = settings();
    expect(button.textContent).toContain('List with search: choose a field…');
    await userEvent.click(button);
    const search = screen.getByRole('combobox', { name: 'Search fields' });
    expect(document.activeElement).toBe(search);
    const list = screen.getByRole('listbox', { name: 'Fields' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('group')
          .map((group) => group.getAttribute('aria-label')),
      ).toEqual(['A / B', 'A', 'Shared']),
    );
    // Dimensions alone, for a list: no Count.
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'CAB lines RegionAB lines · A / B',
      'CA orders RegionA orders · A',
      'CSales RegionSales · Shared',
      'CCustomers RegionCustomers · Shared',
    ]);
    for (const option of within(list).getAllByRole('option'))
      expect(option.getAttribute('aria-disabled')).toBeNull();
    expect(list.textContent).not.toContain('__');
  });

  it('sets the filter’s field from the list, and names it on the button', async () => {
    const { button, onFilters } = settings();
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole('option', { name: /^Customers Region/ }));
    expect(onFilters).toHaveBeenCalledWith([{ ...FILTER, member: 'customers.region' }]);
    expect(document.activeElement).toBe(button);
  });

  /**
   * A workspace dashboard's fields are its overlay's, which hold its copy in
   * place of the cube it copies: the copy's fields are listed in the landed
   * cube's place, marked "Your copy" (T718, AC-428).
   */
  it('lists a workspace dashboard’s copy’s fields in the landed cube’s place, marked as theirs', async () => {
    const copy = {
      ...cube('froot', 'customers', 'Customers (mine)'),
      meta: {
        xcube: { folderId: 'froot', shortName: 'customers' },
        wechart: { workspace: true },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/meta?for=dashboard%3Ad1') return Response.json({ cubes: [copy] });
        if (url === '/api/meta')
          return Response.json({ cubes: [cube('froot', 'customers', 'Customers')] });
        if (url === '/api/folders') return Response.json([]);
        return new Response('{}', { status: 404 });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspaceItemContext.Provider value={{ item: { kind: 'dashboard', id: 'd1' } }}>
          <FilterSettings
            filter={FILTER}
            filters={[FILTER]}
            dashboard={{ ...DOC, folderId: 'mine' }}
            chartTitleOf={() => undefined}
            onFilters={vi.fn()}
            onValue={vi.fn()}
          />
        </WorkspaceItemContext.Provider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Filter on/ }));
    const list = screen.getByRole('listbox', { name: 'Fields' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['CCustomers (mine) RegionYour copyCustomers (mine) · Shared']),
    );
  });

  // T633's review: in the edit sidebar, at the window's right, its list kept within the window.
  it('opens its list within the window, from a button at the window’s right edge', async () => {
    const { button } = settings();
    button.getBoundingClientRect = () =>
      ({
        left: window.innerWidth - 280,
        right: window.innerWidth - 12,
        bottom: 100,
        top: 72,
      }) as DOMRect;
    await userEvent.click(button);
    const pop = (await screen.findByRole('listbox', { name: 'Fields' })).closest<HTMLElement>(
      '.cube-picker__pop',
    )!;
    const width = Math.min(520, window.innerWidth - 32);
    expect(Number.parseFloat(pop.style.left)).toBeLessThanOrEqual(window.innerWidth - width - 16);
    expect(Number.parseFloat(pop.style.left)).toBeGreaterThanOrEqual(16);
  });

  // T633's review: a field the list doesn't offer is still named by its title, never its prefixed name.
  it('names a field set on a cube by its title, and on a vanished one by its words, never a prefixed name', () => {
    const on = (member: string) => {
      const filter = { ...FILTER, member };
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <FilterSettings
            filter={filter}
            filters={[filter]}
            dashboard={DOC}
            chartTitleOf={() => undefined}
            onFilters={vi.fn()}
            onValue={vi.fn()}
          />
        </QueryClientProvider>,
      );
    };
    return (async () => {
      // /A's cube, in the model: by its title (one name per item, R71; nothing is hidden).
      on('a_orders.region');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Filter on/ }).textContent).toContain(
          'A orders Region',
        ),
      );
      cleanup();
      // A cube the model no longer has: its short name in words.
      on('fgone__open_orders.status');
      const named = screen.getByRole('button', { name: /^Filter on/ }).textContent ?? '';
      expect(named).toContain('Open orders status');
      expect(named).not.toContain('__');
    })();
  });

  it('closes on Escape back on its button, not on the filter’s pill', async () => {
    const { button } = settings();
    await userEvent.click(button);
    await screen.findByRole('listbox', { name: 'Fields' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Fields' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
