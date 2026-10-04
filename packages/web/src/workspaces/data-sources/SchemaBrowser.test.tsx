import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SchemaBrowser } from './SchemaBrowser';

/**
 * T539 (AC-386; design 15's P3): the schema browser beside the SQL editor.
 * The data source's schemas, a schema's tables and a table's columns with
 * their types, as xcube's introspection lists them through wechart's API;
 * choosing a name hands it to the editor. A tree, one stop in the tab order
 * (T539's review).
 */
const BASE = '/api/data-sources/ds-1/catalog';

type Answer = { status: number; body: unknown };
function serve({
  tables = (schema: string, offset: number): Answer => ({
    status: 200,
    body: {
      tables: [
        { schema, name: 'orders', type: 'table', rawType: 'BASE TABLE' },
        { schema, name: 'order_totals', type: 'view', rawType: 'VIEW' },
      ].slice(offset),
      total: 2,
    },
  }),
  schemas = (): Answer => ({
    status: 200,
    body: { schemas: [{ name: 'public' }, { name: 'sales' }] },
  }),
  columns = (schema: string, table: string): Answer => ({
    status: 200,
    body: {
      tables: [
        {
          schema,
          name: table,
          columns: [
            { name: 'id', rawType: 'integer', type: 'number', primaryKey: true },
            { name: 'status', rawType: 'text', type: 'string', primaryKey: false },
          ],
        },
      ],
    },
  }),
}: {
  tables?: (schema: string, offset: number) => Answer;
  schemas?: () => Answer;
  columns?: (schema: string, table: string) => Answer;
} = {}) {
  const asked: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      asked.push({ url, method, body });
      const reply = ({ status, body: sent }: Answer) => Response.json(sent, { status });
      if (url === `${BASE}/schemas`) return reply(schemas());
      if (url.startsWith(`${BASE}/tables?`)) {
        const query = new URL(url, 'http://wechart.test').searchParams;
        return reply(tables(query.get('schema') ?? '', Number(query.get('offset') ?? 0)));
      }
      if (url === `${BASE}/columns` && method === 'POST') {
        const [table] = (body as { tables: { schema: string; table: string }[] }).tables;
        return reply(columns(table!.schema, table!.table));
      }
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

function open(onChoose = vi.fn(), version = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const browser = (at: number) => (
    <QueryClientProvider client={client}>
      <SchemaBrowser
        sourceId="ds-1"
        sourceVersion={at}
        sourceName="emea_replica"
        onChoose={onChoose}
      />
    </QueryClientProvider>
  );
  const rendered = render(browser(version));
  return {
    onChoose,
    /** The page shown again, the data source at another version. */
    at: (next: number) => {
      rendered.rerender(browser(next));
    },
  };
}
const region = () => screen.getByRole('region', { name: 'Tables in emea_replica' });
const item = (name: string) => within(region()).findByRole('treeitem', { name });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the schema browser (T539, AC-386)', () => {
  it('lists the schemas, a schema’s tables, and a table’s columns with their types', async () => {
    const asked = serve();
    open();
    const publicSchema = await item('public');
    expect(publicSchema.getAttribute('aria-expanded')).toBe('false');
    expect(await item('sales')).toBeTruthy();

    await userEvent.click(within(publicSchema).getByTestId('sql-schema-caret'));
    expect(publicSchema.getAttribute('aria-expanded')).toBe('true');
    const orders = await item('orders');
    expect(
      asked.some((each) => each.url === `${BASE}/tables?schema=public&limit=100&offset=0`),
    ).toBe(true);
    // A view says so.
    expect(await item('order_totals, view')).toBeTruthy();

    await userEvent.click(within(orders).getByTestId('sql-schema-caret'));
    const columns = within(region()).getByRole('group', { name: 'Columns of public.orders' });
    await waitFor(() => {
      expect(
        within(columns)
          .getAllByRole('treeitem')
          .map((each) => each.getAttribute('aria-label')),
      ).toEqual(['id, integer', 'status, text']);
    });
    expect(columns.textContent).toBe('idintegerstatustext');
    expect(asked.filter((each) => each.url === `${BASE}/columns`).map((each) => each.body)).toEqual(
      [{ tables: [{ schema: 'public', table: 'orders' }] }],
    );

    // Hidden and shown again, with no second asking.
    await userEvent.click(within(orders).getByTestId('sql-schema-caret'));
    expect(within(region()).queryByRole('group', { name: 'Columns of public.orders' })).toBeNull();
    await userEvent.click(within(orders).getByTestId('sql-schema-caret'));
    await within(region()).findByRole('group', { name: 'Columns of public.orders' });
    expect(asked.filter((each) => each.url === `${BASE}/columns`)).toHaveLength(1);
  });

  it('hands a chosen name to the editor: a schema’s, a table’s with its schema, a column’s', async () => {
    serve();
    const { onChoose } = open();
    const sales = await item('sales');
    await userEvent.click(within(sales).getByText('sales'));
    await userEvent.click(within(sales).getByTestId('sql-schema-caret'));
    const orders = await item('orders');
    await userEvent.click(within(orders).getByText('orders'));
    await userEvent.click(within(orders).getByTestId('sql-schema-caret'));
    await userEvent.click(within(await item('status, text')).getByText('status'));
    expect(onChoose.mock.calls.map(([name]) => name as string)).toEqual([
      'sales',
      'sales.orders',
      'status',
    ]);
  });

  it('is one stop in the tab order, moved through with the arrow keys, Enter choosing (design 15, keyboard)', async () => {
    serve();
    const { onChoose } = open();
    const publicSchema = await item('public');
    const sales = await item('sales');
    expect(publicSchema.tabIndex).toBe(0);
    expect(sales.tabIndex).toBe(-1);

    publicSchema.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(sales);
    expect(sales.tabIndex).toBe(0);
    expect(publicSchema.tabIndex).toBe(-1);
    await userEvent.keyboard('{ArrowUp}{ArrowRight}');
    // Opened, and on into its first table.
    expect(publicSchema.getAttribute('aria-expanded')).toBe('true');
    const orders = await item('orders');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(orders);
    await userEvent.keyboard('{Enter}');
    expect(onChoose).toHaveBeenLastCalledWith('public.orders');
    // Left goes back up to its schema, and closes it from there.
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(publicSchema);
    await userEvent.keyboard('{ArrowLeft}');
    expect(publicSchema.getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(sales);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(publicSchema);
  });

  it('lists a long schema’s tables 100 at a time, the rest a press away', async () => {
    const asked = serve({
      tables: (schema, offset) => ({
        status: 200,
        body: {
          tables: Array.from({ length: offset === 0 ? 100 : 50 }, (_, at) => ({
            schema,
            name: `t${String(offset + at)}`,
            type: 'table',
            rawType: 'BASE TABLE',
          })),
          total: 150,
        },
      }),
    });
    open();
    await userEvent.click(within(await item('public')).getByTestId('sql-schema-caret'));
    await item('t99');
    await userEvent.click(await item('Show 50 more tables'));
    await item('t149');
    // Focus goes on to the first table read, where the row asking was.
    const first = await item('t100');
    await waitFor(() => {
      expect(document.activeElement).toBe(first);
    });
    expect(first.tabIndex).toBe(0);
    expect(
      asked.some((each) => each.url === `${BASE}/tables?schema=public&limit=100&offset=100`),
    ).toBe(true);
    expect(within(region()).queryByRole('treeitem', { name: /more tables/ })).toBeNull();
  });

  it('says what a data source waits on before its tables can be read, as a note, not an alert', async () => {
    // As the API says it of one made new in My workspace with nowhere to go (T547).
    serve({
      schemas: () => ({
        status: 409,
        body: {
          error:
            'Choose the folder it is to go to first: its tables are read in your workspace’s preview, which places it there.',
        },
      }),
    });
    open();
    const note = await within(region()).findByText(/Choose the folder it is to go to first/);
    expect(note.textContent).toBe(
      'Choose the folder it is to go to first: its tables are read in your workspace’s preview, which places it there.',
    );
    expect(within(region()).queryByRole('alert')).toBeNull();
  });

  it('says why a schema’s tables or a table’s columns couldn’t be read, and tries again on asking', async () => {
    let tablesFail = true;
    let columnsFail = true;
    serve({
      tables: (schema) =>
        tablesFail
          ? { status: 502, body: { error: 'Cube refused wechart’s token: expired' } }
          : {
              status: 200,
              body: {
                tables: [{ schema, name: 'orders', type: 'table', rawType: 'BASE TABLE' }],
                total: 1,
              },
            },
      columns: (schema, table) =>
        columnsFail
          ? { status: 504, body: { error: 'Cube is still reading the data source’s catalog.' } }
          : {
              status: 200,
              body: {
                tables: [
                  {
                    schema,
                    name: table,
                    columns: [{ name: 'id', rawType: 'integer', type: 'number' }],
                  },
                ],
              },
            },
    });
    open();
    await userEvent.click(within(await item('public')).getByTestId('sql-schema-caret'));
    const failed = await item('Cube refused wechart’s token: expired. Try again');
    tablesFail = false;
    await userEvent.click(failed);
    const orders = await item('orders');
    await userEvent.click(within(orders).getByTestId('sql-schema-caret'));
    const late = await item('Cube is still reading the data source’s catalog. Try again');
    columnsFail = false;
    late.focus();
    await userEvent.keyboard('{Enter}');
    expect(await item('id, integer')).toBeTruthy();
    // Focus went up to the table it was read for, which keeps the tab stop.
    expect(document.activeElement).toBe(orders);
    expect(orders.tabIndex).toBe(0);
  });

  it('reads a data source again once its settings change, never showing its old catalog (T539’s review)', async () => {
    let schema = 'public';
    const asked = serve({
      schemas: () => ({ status: 200, body: { schemas: [{ name: schema }] } }),
    });
    const { at } = open();
    await item('public');
    schema = 'payroll';
    at(2);
    expect(await item('payroll')).toBeTruthy();
    expect(within(region()).queryByRole('treeitem', { name: 'public' })).toBeNull();
    expect(asked.filter((each) => each.url === `${BASE}/schemas`)).toHaveLength(2);
  });

  it('reads its catalog again on asking, for a table made since', async () => {
    let schemas = [{ name: 'public' }];
    serve({ schemas: () => ({ status: 200, body: { schemas } }) });
    open();
    await item('public');
    schemas = [{ name: 'public' }, { name: 'staging' }];
    await userEvent.click(within(region()).getByRole('button', { name: 'Read its tables again' }));
    expect(await item('staging')).toBeTruthy();
  });
});
