import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceItemContext } from '../query/meta';
import { CubeSourcePicker, FieldList } from './FieldList';

/**
 * T475's review (2026-09-27 design 10, state D), as T718 has it (AC-428;
 * AC-342 retired): a workspace item's field list is its overlay's
 * (`/api/meta?for=`), which holds the item's copy of a cube in place of the
 * one it copies, under the same name. The picker lists the copy in the
 * landed cube's place, in its folder (read from the folders' own meta,
 * `/api/meta`), marked "Your copy"; nothing is dimmed.
 */
const xcubeCube = (name: string, title: string, folderId: string, workspace = false) => ({
  name,
  title,
  type: 'cube',
  meta: {
    xcube: { folderId, shortName: name },
    ...(workspace ? { wechart: { workspace: true } } : {}),
  },
  measures: [],
  dimensions: [],
  segments: [],
});

function answering(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const said = routes[String(input)];
      return said === undefined ? new Response('not found', { status: 404 }) : Response.json(said);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * T688 (AC-352; 2026-09-24 design 01 pin 2; the chart editor critique's
 * EDI-03, EDI-04): the field list as design 01 draws it. The chosen cube's
 * fields first, then each cube it joins to as a group "· via join",
 * collapsed until opened or used; the head names the cube and counts the
 * cubes. A dimension's row says how many distinct values it has, a measure
 * its aggregation, a time field "time".
 */
const member = (name: string, title: string, shortTitle: string, type = 'string') => ({
  name,
  title,
  shortTitle,
  type,
});
const MODEL = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      type: 'cube',
      measures: [
        { ...member('orders.count', 'Orders Count', 'Count', 'number'), aggType: 'count' },
      ],
      dimensions: [
        member('orders.status', 'Orders Status', 'Status'),
        member('orders.ordered_at', 'Orders Ordered at', 'Ordered at', 'time'),
      ],
      segments: [],
    },
    {
      name: 'customers',
      title: 'Customers',
      type: 'cube',
      measures: [],
      dimensions: [member('customers.country', 'Customers Country', 'Country')],
      segments: [],
    },
    {
      name: 'products',
      title: 'Products',
      type: 'cube',
      measures: [],
      dimensions: [member('products.category', 'Products Category', 'Category')],
      segments: [],
    },
  ],
};
const JOINS = {
  joins: {
    orders: [
      { name: 'customers', relationship: 'belongsTo' },
      { name: 'products', relationship: 'belongsTo' },
    ],
    customers: [],
    products: [],
  },
};
function answeringModel(joins: unknown = JOINS) {
  const asked: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      asked.push({ url, body });
      if (url === '/api/meta') return Response.json(MODEL);
      if (url === '/api/meta/joins') return Response.json(joins);
      return new Response('not found', { status: 404 });
    }),
  );
  return asked;
}

function fieldList(used: readonly string[] = [], distinct?: ReadonlyMap<string, number>) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FieldList cubeName="orders" used={new Set(used)} distinct={distinct} />
    </QueryClientProvider>,
  );
}

describe('the field list as design 01 draws it (T688, EDI-03, EDI-04)', () => {
  it('heads it with the cube and how many cubes it reaches, then each joined cube “· via join”, collapsed', async () => {
    answeringModel();
    fieldList();
    const head = await screen.findByRole('heading', { level: 2, name: /^Cube: Orders/ });
    expect(head.textContent).toBe('Cube: Orders3 cubes');
    const groups = await screen.findAllByRole('button', { name: /fields$/ });
    // Each with its caret, ▾ open and ▸ closed, and its fields counted.
    expect(groups.map((group) => group.textContent)).toEqual([
      '▾Orders3',
      '▸Customers · via join1',
      '▸Products · via join1',
    ]);
    expect(groups.map((group) => group.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(screen.queryByTestId('member-customers.country')).toBeNull();
    await userEvent.click(groups[1]!);
    expect(groups[1]!.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByTestId('member-customers.country')).toBeTruthy();
  });

  it('shows no group for a joined cube the model doesn’t hold, nor counts it', async () => {
    answeringModel({
      joins: {
        ...JOINS.joins,
        orders: [...JOINS.joins.orders, { name: 'hidden', relationship: 'belongsTo' }],
      },
    });
    fieldList();
    const head = await screen.findByRole('heading', { level: 2, name: /^Cube: Orders/ });
    await waitFor(() => {
      expect(head.textContent).toBe('Cube: Orders3 cubes');
    });
    expect(
      (await screen.findAllByRole('button', { name: /fields$/ })).map((group) => group.textContent),
    ).toEqual(['▾Orders3', '▸Customers · via join1', '▸Products · via join1']);
  });

  it('opens a joined cube’s group where the chart uses one of its fields, and a search looks in every group', async () => {
    answeringModel();
    fieldList(['products.category']);
    expect(await screen.findByTestId('member-products.category')).toBeTruthy();
    expect(screen.queryByTestId('member-customers.country')).toBeNull();
    await userEvent.type(screen.getByLabelText('Search fields'), 'country');
    expect(await screen.findByTestId('member-customers.country')).toBeTruthy();
    expect(screen.queryByTestId('member-orders.status')).toBeNull();
  });

  it('says how many distinct values each dimension has in the chart’s result, a measure its aggregation, a time field “time”', async () => {
    const asked = answeringModel();
    fieldList(
      ['orders.status', 'products.category'],
      new Map([
        ['orders.status', 3],
        ['products.category', 1184],
      ]),
    );
    const status = await screen.findByTestId('member-orders.status');
    expect(status.querySelector('.field-row__meta')?.textContent).toBe('3');
    expect(status.querySelector('.field-row__meta')?.getAttribute('title')).toBe(
      'Distinct values in the chart’s result',
    );
    expect(
      screen.getByTestId('member-products.category').querySelector('.field-row__meta')?.textContent,
    ).toBe('1,184');
    expect(
      screen.getByTestId('member-orders.count').querySelector('.field-row__meta')?.textContent,
    ).toBe('count');
    expect(
      screen.getByTestId('member-orders.ordered_at').querySelector('.field-row__meta')?.textContent,
    ).toBe('time');
    // A dimension the result doesn't hold says its type, and nothing is
    // asked of Cube to count it: the counts are the chart's own result's.
    await userEvent.click(screen.getByRole('button', { name: 'Customers fields' }));
    expect(
      (await screen.findByTestId('member-customers.country')).querySelector('.field-row__meta')
        ?.textContent,
    ).toBe('string');
    expect(asked.filter((each) => each.url === '/api/load')).toEqual([]);
  });
});

describe('a workspace item’s cube picker (T475’s review, T718, AC-428)', () => {
  it('lists its copy in the landed cube’s place, marked “Your copy”, and the landed one not at all', async () => {
    answering({
      '/api/meta?for=chart%3Ac1': {
        cubes: [
          xcubeCube('orders', 'Orders (mine)', 'froot', true),
          xcubeCube('customers', 'Customers', 'froot'),
        ],
      },
      '/api/meta': {
        cubes: [
          xcubeCube('orders', 'Orders', 'froot'),
          xcubeCube('customers', 'Customers', 'froot'),
        ],
      },
      '/api/folders': [
        { id: 'w', title: 'project-2026-10-04', parentId: 'mine', itemCount: 1, xcubeId: null },
      ],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspaceItemContext.Provider value={{ item: { kind: 'chart', id: 'c1' } }}>
          {/* In the inspector since T688 (EDI-05). */}
          <CubeSourcePicker folderId="w" />
        </WorkspaceItemContext.Provider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Cube or view/ }));
    const list = screen.getByRole('listbox', { name: 'Cubes and views' });
    // The folders' meta may come a moment after the overlay's.
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['COrders (mine)Your copyShared', 'CCustomersShared']),
    );
    for (const option of within(list).getAllByRole('option'))
      expect(option.getAttribute('aria-disabled')).toBeNull();
  });

  // AC-329: never a prefixed name, not even for a cube the model no longer has.
  it('names a chosen cube the model doesn’t list by its short name in words, never its prefix', async () => {
    answering({ '/api/meta': { cubes: [xcubeCube('orders', 'Orders', 'froot')] } });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CubeSourcePicker cubeName="fsales__open_returns" />
      </QueryClientProvider>,
    );

    const button = await screen.findByRole('button', { name: /^Cube or view/ });
    expect(button.textContent).toContain('Open returns');
    expect(button.textContent).not.toContain('sales');
  });
});
