import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { forgetLiveTabs } from './liveTabs';
import { SqlWorkspace } from './SqlWorkspace';

/**
 * T805 (AC-386): WHILE a SQL runner tab on a data source or on Cube Store
 * is open, THE SYSTEM SHALL show in the workspace's left pane that source's
 * schemas, tables and columns with their types, as xcube's introspection
 * lists them, and put a name chosen there into the editor.
 * Fails when: a table or column the data source has is missing from the
 * browser, the browser shows another tab's data source, or choosing one
 * doesn't put its name in the editor.
 */
const writer: Me = {
  name: 'Wren',
  identity: 'wren-t805@example.com',
  groups: [],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
};
const page = (id: string, name: string) => ({
  id,
  folderId: 'f-sales',
  name,
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: `${id}-host`, port: 5432, database: 'sales', user: 'reader', ssl: false },
  secrets: {},
  targetFolderId: null,
  origin: null,
  version: 1,
  updatedAt: '2026-10-17T10:00:00Z',
  folderPath: [{ id: 'f-sales', title: 'Sales' }],
  canWrite: true,
  inWorkspace: false,
  description: null,
  sqlRunner: { on: true },
  sqlAccess: { tab: true, runs: true },
});
const row = (id: string, name: string, cubeStore = false) => ({
  id,
  name,
  driver: cubeStore ? null : 'postgres',
  cubeStore,
  folderId: cubeStore ? null : 'f-sales',
  folderPath: cubeStore ? [] : [{ id: 'f-sales', title: 'Sales' }],
  inWorkspace: false,
  runner: 'on',
});
/** Each source's own catalog: emea has `public.orders`, fx has `fx.rates`. */
const CATALOG: Record<string, { schema: string; table: string; column: string; type: string }> = {
  emea: { schema: 'public', table: 'orders', column: 'order_id', type: 'int8' },
  fx: { schema: 'fx', table: 'rates', column: 'rate', type: 'numeric(12,6)' },
};

function serve({ cubeStore = false } = {}) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      const json = (body: unknown, status = 200) => Response.json(body, { status });
      if (url === '/api/sql/sources')
        return json([
          row('emea', 'emea_replica'),
          row('fx', 'fx_warehouse'),
          ...(cubeStore ? [row('cubestore', 'Cube Store', true)] : []),
        ]);
      if (url === '/api/sql-runs/going') return json({ going: null });
      if (url === '/api/data-sources/emea') return json(page('emea', 'emea_replica'));
      if (url === '/api/data-sources/fx') return json(page('fx', 'fx_warehouse'));
      if (url === '/api/cube-store')
        return json({ on: true, runs: true, confirmedBy: { name: 'Ada' }, confirmedAt: '2026-10-17T10:00:00Z' });
      const catalog = /^\/api\/data-sources\/(\w+)\/catalog\/(\w+)/.exec(url);
      const own = catalog === null ? undefined : CATALOG[catalog[1]!];
      if (own !== undefined && catalog?.[2] === 'schemas') return json({ schemas: [{ name: own.schema }] });
      if (own !== undefined && catalog?.[2] === 'tables')
        return json({ tables: [{ schema: own.schema, name: own.table, type: 'table', rawType: 'BASE TABLE' }], total: 1 });
      if (own !== undefined && catalog?.[2] === 'columns' && init?.method === 'POST')
        return json({
          tables: [{ schema: own.schema, name: own.table, columns: [{ name: own.column, rawType: own.type, type: 'number' }] }],
        });
      return json([], 404);
    }),
  );
  return asked;
}

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY.queryKey, writer);
  render(
    <QueryClientProvider client={client}>
      <SqlWorkspace />
    </QueryClientProvider>,
  );
}
const leftPane = () => screen.getByRole('complementary', { name: 'Data source and schema' });
async function choose(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: /^Data source (?!and schema)/ }));
  await userEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}
/** Opens a row of the tree by its caret. */
async function expand(name: string) {
  const item = await within(leftPane()).findByRole('treeitem', { name });
  await userEvent.click(within(item).getByTestId('sql-schema-caret'));
  return item;
}
const editorText = () =>
  EditorView.findFromDOM(document.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!.state.doc.toString();

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetLiveTabs();
});

describe('the schema browser in the left pane (T805, AC-386)', () => {
  it('shows the open tab’s own source’s schemas, tables and columns with their types', async () => {
    serve();
    open();
    await choose('emea_replica');

    expect(within(leftPane()).getByRole('region', { name: 'Tables in emea_replica' })).toBeTruthy();
    await expand('public');
    await expand('orders');
    expect(await within(leftPane()).findByRole('treeitem', { name: 'order_id, int8' })).toBeTruthy();
  });

  it('follows the tabs: another tab’s source shows its own, and back again', async () => {
    serve();
    open();
    await choose('emea_replica');
    await within(leftPane()).findByRole('treeitem', { name: 'public' });

    await userEvent.click(screen.getByRole('button', { name: 'New tab on emea_replica' }));
    await choose('fx_warehouse');
    expect(await within(leftPane()).findByRole('treeitem', { name: 'fx' })).toBeTruthy();
    expect(within(leftPane()).queryByRole('region', { name: 'Tables in emea_replica' })).toBeNull();
    await expand('fx');
    await expand('rates');
    expect(await within(leftPane()).findByRole('treeitem', { name: 'rate, numeric(12,6)' })).toBeTruthy();

    await userEvent.click(screen.getByRole('tab', { name: /^Query 1/ }));
    expect(await within(leftPane()).findByRole('treeitem', { name: 'public' })).toBeTruthy();
    expect(within(leftPane()).queryByRole('region', { name: 'Tables in fx_warehouse' })).toBeNull();
  });

  it('puts a chosen name at the editor’s cursor, once, in the open tab', async () => {
    serve();
    open();
    await choose('emea_replica');
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'SELECT * FROM ' } });
      view.dispatch({ selection: { anchor: 'SELECT * FROM '.length } });
    });

    await expand('public');
    await userEvent.click(within(await within(leftPane()).findByRole('treeitem', { name: 'orders' })).getByText('orders'));
    expect(editorText()).toBe('SELECT * FROM public.orders');

    // Away to another tab and back: the name isn't put in again.
    await userEvent.click(screen.getByRole('button', { name: 'New tab on emea_replica' }));
    expect(editorText()).toBe('');
    await userEvent.click(screen.getByRole('tab', { name: /^Query 1/ }));
    expect(editorText()).toBe('SELECT * FROM public.orders');
  });

  it('on Cube Store, says it has no catalog to browse, and where its tables are listed', async () => {
    const asked = serve({ cubeStore: true });
    open();
    await choose('Cube Store');

    expect(
      await within(leftPane()).findByText(/^Cube Store has no catalog to browse\. Its tables are listed in/),
    ).toBeTruthy();
    expect(within(leftPane()).queryByRole('tree')).toBeNull();
    expect(asked.filter((url) => url.includes('/catalog/'))).toEqual([]);
  });
});

/**
 * T806 (AC-448): WHILE a tab's schema browser is open, THE SYSTEM SHALL
 * filter its tables by "Find a table" over the names already read, saying
 * "Searching the n tables read" while a schema has unread pages, and show
 * each column's PK or FK tag, the FK's tooltip naming its target table.
 */
describe('Find a table, and PK and FK tags (T806, AC-448)', () => {
  /** `sales` has 150 tables, read 100 at a time; `staging` two. */
  function serveMany() {
    const json = (body: unknown, status = 200) => Response.json(body, { status });
    const sales = Array.from({ length: 150 }, (_, at) => (at === 120 ? 'order_archive' : at === 3 ? 'orders' : `t${String(at)}`));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/sql/sources') return json([row('emea', 'emea_replica')]);
        if (url === '/api/sql-runs/going') return json({ going: null });
        if (url === '/api/data-sources/emea') return json(page('emea', 'emea_replica'));
        if (url.endsWith('/catalog/schemas')) return json({ schemas: [{ name: 'sales' }, { name: 'staging' }] });
        if (url.includes('/catalog/tables?')) {
          const query = new URL(url, 'http://wechart.test').searchParams;
          const schema = query.get('schema')!;
          const names = schema === 'sales' ? sales : ['raw_orders', 'returns'];
          const offset = Number(query.get('offset'));
          return json({
            tables: names.slice(offset, offset + 100).map((name) => ({ schema, name, type: 'table', rawType: 'BASE TABLE' })),
            total: names.length,
          });
        }
        if (url.endsWith('/catalog/columns') && init?.method === 'POST')
          return json({
            tables: [
              {
                schema: 'sales',
                name: 'orders',
                columns: [
                  { name: 'id', rawType: 'int4', type: 'number', primaryKey: true, foreignKeys: [] },
                  {
                    name: 'customer_id',
                    rawType: 'int4',
                    type: 'number',
                    primaryKey: false,
                    foreignKeys: [{ schema: 'sales', table: 'customers', column: 'id' }],
                  },
                  { name: 'status', rawType: 'text', type: 'string', primaryKey: false, foreignKeys: [] },
                ],
              },
            ],
          });
        return json([], 404);
      }),
    );
  }
  const find = () => within(leftPane()).getByRole('searchbox', { name: 'Find a table' });
  const tablesShown = (schema: string) =>
    within(within(leftPane()).getByRole('group', { name: `Tables in ${schema}` }))
      .getAllByRole('treeitem')
      .map((item) => item.getAttribute('aria-label'));

  it('keeps the read tables whose names hold the text, saying so while a schema has pages unread', async () => {
    serveMany();
    open();
    await choose('emea_replica');
    await expand('sales');
    await within(leftPane()).findByRole('treeitem', { name: 't99' });
    await expand('staging');
    await within(leftPane()).findByRole('treeitem', { name: 'raw_orders' });

    await userEvent.type(find(), 'ord');
    // order_archive is on sales' second page, unread: not found, and said so.
    expect(tablesShown('sales')).toEqual(['orders', 'Show 50 more tables']);
    expect(tablesShown('staging')).toEqual(['raw_orders']);
    expect(within(leftPane()).getByText('Searching the 102 tables read')).toBeTruthy();

    await userEvent.click(within(leftPane()).getByText('Show 50 more tables'));
    expect(await within(leftPane()).findByRole('treeitem', { name: 'order_archive' })).toBeTruthy();
    expect(tablesShown('sales')).toEqual(['orders', 'order_archive']);
    expect(within(leftPane()).queryByText(/^Searching the/)).toBeNull();

    await userEvent.clear(find());
    await userEvent.type(find(), 'zzz');
    expect(within(leftPane()).getByText('No table read so far matches “zzz”.')).toBeTruthy();
    await userEvent.clear(find());
    expect(tablesShown('staging')).toEqual(['raw_orders', 'returns']);
  });

  it('shows the matches read in a schema since closed (T806’s review)', async () => {
    serveMany();
    open();
    await choose('emea_replica');
    await expand('sales');
    await within(leftPane()).findByRole('treeitem', { name: 't99' });
    const sales = within(leftPane()).getByRole('treeitem', { name: 'sales' });
    await userEvent.click(within(sales).getAllByTestId('sql-schema-caret')[0]!);
    expect(within(leftPane()).queryByRole('group', { name: 'Tables in sales' })).toBeNull();

    await userEvent.type(find(), 'ord');
    expect(tablesShown('sales')).toEqual(['orders', 'Show 50 more tables']);
  });

  it('says it is searching only the tables read while a schema hasn’t been opened', async () => {
    serveMany();
    open();
    await choose('emea_replica');
    await expand('staging');
    await within(leftPane()).findByRole('treeitem', { name: 'raw_orders' });

    await userEvent.type(find(), 'ord');
    expect(within(leftPane()).getByText('Searching the 2 tables read')).toBeTruthy();
    expect(tablesShown('staging')).toEqual(['raw_orders']);
  });

  it('tags a primary key PK and a foreign key FK, its tooltip naming its target', async () => {
    serveMany();
    open();
    await choose('emea_replica');
    await expand('sales');
    await expand('orders');

    const id = await within(leftPane()).findByRole('treeitem', { name: 'id, int4, primary key' });
    expect(within(id).getByText('PK')).toBeTruthy();
    const fk = within(leftPane()).getByRole('treeitem', { name: 'customer_id, int4, foreign key to sales.customers' });
    expect(within(fk).getByText('FK').getAttribute('title')).toBe('References sales.customers (id)');
    const status = within(leftPane()).getByRole('treeitem', { name: 'status, text' });
    expect(within(status).queryByText(/^(PK|FK)$/)).toBeNull();
  });
});
