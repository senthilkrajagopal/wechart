import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SavedList, type SavedQuery } from './SavedList';
import type { SqlSourceRow } from './sources';

/**
 * T813 (AC-458): the Saved tab lists the user's saved queries by name, each
 * with its data source and "Only me" as an icon and a label, and Open,
 * Rename…, Duplicate and Delete on its ⋯; Delete says so in a toast whose
 * Undo brings the query back.
 * Fails when: a row lacks its source or "Only me"; one of the four actions is
 * missing; or a deleted query can't be brought back from the toast.
 */
const EMEA: SqlSourceRow = {
  id: 'emea',
  name: 'emea_replica',
  driver: 'postgres',
  cubeStore: false,
  folderId: 'f-emea',
  folderPath: [
    { id: 'f-sales', title: 'Sales' },
    { id: 'f-emea', title: 'EMEA' },
  ],
  inWorkspace: false,
  runner: 'on',
};
const query = (over: Partial<SavedQuery> & Pick<SavedQuery, 'id' | 'name'>): SavedQuery => ({
  description: '',
  sourceId: 'emea',
  sql: 'SELECT 1',
  parameters: [],
  ...over,
});

let held: SavedQuery[] = [];
let asked: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
beforeEach(() => {
  held = [
    query({
      id: 'q-top',
      name: 'Top EMEA orders',
      sql: 'SELECT * FROM orders WHERE region = {{region}} AND at >= {{since}}',
      parameters: [
        { name: 'region', type: 'text', value: 'EMEA' },
        { name: 'since', type: 'date', value: '2026-09-01' },
      ],
    }),
    query({ id: 'q-gone', name: 'Old one', sourceId: 'not-mine' }),
  ];
  asked = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      // A JSON content type with no body is refused by the server (Fastify's empty-body check).
      if (body === null && new Headers(init?.headers).has('content-type'))
        return Promise.resolve(new Response(JSON.stringify({ error: 'Internal error' }), { status: 400 }));
      asked.push({ method, url, body });
      const json = (status: number, value: unknown) =>
        Promise.resolve(new Response(JSON.stringify(value), { status }));
      if (method === 'GET' && url === '/api/sql/saved') return json(200, { queries: held });
      const id = decodeURIComponent(url.split('/').at(-1) ?? '');
      if (method === 'DELETE') {
        const gone = held.find((each) => each.id === id);
        held = held.filter((each) => each !== gone);
        return gone === undefined ? json(404, { error: 'No saved query of yours has that id.' }) : json(200, gone);
      }
      if (method === 'POST') {
        const made = { ...(body as Omit<SavedQuery, 'id'>), id: (body?.['id'] as string | undefined) ?? 'q-new' };
        held = [...held, made].sort((a, b) => a.name.localeCompare(b.name));
        return json(201, made);
      }
      if (method === 'PUT') {
        if (body?.['name'] === 'Old one')
          return json(409, { error: 'You already have a saved query named “Old one”.' });
        held = held.map((each) => (each.id === id ? { ...(body as Omit<SavedQuery, 'id'>), id } : each));
        return json(200, { ...body, id });
      }
      return json(404, {});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(handlers: { onOpen?: (saved: SavedQuery) => void; onRenamed?: (id: string, name: string) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SavedList
        sourceOf={(id) => (id === EMEA.id ? EMEA : undefined)}
        onOpen={handlers.onOpen ?? (() => undefined)}
        onRenamed={handlers.onRenamed ?? (() => undefined)}
        toastMs={0}
      />
    </QueryClientProvider>,
  );
}
const rows = () => within(screen.getByRole('list', { name: 'Saved queries' })).getAllByRole('listitem');
const menuOf = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.getByRole('menu', { name: `Actions for ${name}` });
};

describe('the Saved tab (T813, AC-458)', () => {
  it('lists each by name with its source, and “Only me” as an icon and a label', async () => {
    open();
    await screen.findByRole('button', { name: 'Top EMEA orders' });
    const [top, gone] = rows();
    expect(within(top!).getByText('emea_replica · Shared / Sales / EMEA')).toBeTruthy();
    const only = within(top!).getByText('Only me');
    expect(only.closest('.sql-saved__only')?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(top!).getByText('2 parameters')).toBeTruthy();
    // A source no longer theirs is never named (AC-459's rule).
    expect(within(gone!).getByText('A data source no longer available to you')).toBeTruthy();
    expect(gone!.textContent).not.toContain('not-mine');
  });

  it('says so when there are none', async () => {
    held = [];
    open();
    expect(await screen.findByText('No saved queries. Save… keeps a query here; only you can see it.')).toBeTruthy();
  });

  it('offers Open, Rename…, Duplicate and Delete on its ⋯, and Open opens it', async () => {
    const onOpen = vi.fn();
    open({ onOpen });
    await screen.findByRole('button', { name: 'Top EMEA orders' });
    const menu = await menuOf('Top EMEA orders');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open',
      'Rename…',
      'Duplicate',
      'Delete',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith(held[0]);
    // Its name opens it too.
    await userEvent.click(screen.getByRole('button', { name: 'Top EMEA orders' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('Delete takes it away and says so in a toast whose Undo brings it back under its own id', async () => {
    open();
    await screen.findByRole('button', { name: 'Top EMEA orders' });
    const kept = held[0]!;
    await userEvent.click(within(await menuOf('Top EMEA orders')).getByRole('menuitem', { name: 'Delete' }));

    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('Deleted “Top EMEA orders”.');
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Top EMEA orders' })).toBeNull();
    });
    expect(asked.find((each) => each.method === 'DELETE')?.url).toBe('/api/sql/saved/q-top');

    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Top EMEA orders' })).toBeTruthy();
    expect(asked.find((each) => each.method === 'POST')?.body).toEqual({
      id: 'q-top',
      name: kept.name,
      description: kept.description,
      sourceId: kept.sourceId,
      sql: kept.sql,
      parameters: kept.parameters,
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Duplicate saves a copy under the first free “(copy)” name', async () => {
    held = [...held, query({ id: 'q-copy', name: 'Top EMEA orders (copy)' })];
    open();
    await screen.findByRole('button', { name: 'Top EMEA orders' });
    await userEvent.click(within(await menuOf('Top EMEA orders')).getByRole('menuitem', { name: 'Duplicate' }));
    await screen.findByRole('button', { name: 'Top EMEA orders (copy 2)' });
    expect(asked.find((each) => each.method === 'POST')?.body).toMatchObject({
      name: 'Top EMEA orders (copy 2)',
      sql: held.find((each) => each.id === 'q-top')!.sql,
      parameters: held.find((each) => each.id === 'q-top')!.parameters,
    });
    expect(asked.find((each) => each.method === 'POST')?.body).not.toHaveProperty('id');
  });

  it('Rename… renames it, shows a refusal’s reason in the dialog, and says the new name to the workspace', async () => {
    const onRenamed = vi.fn();
    open({ onRenamed });
    await screen.findByRole('button', { name: 'Top EMEA orders' });
    await userEvent.click(within(await menuOf('Top EMEA orders')).getByRole('menuitem', { name: 'Rename…' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Top EMEA orders' });
    const field = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(field);

    await userEvent.clear(field);
    await userEvent.type(field, 'Old one');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(await within(dialog).findByText('You already have a saved query named “Old one”.')).toBeTruthy();

    await userEvent.clear(field);
    await userEvent.type(field, 'EMEA month end');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('button', { name: 'EMEA month end' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(asked.filter((each) => each.method === 'PUT').at(-1)).toMatchObject({
      url: '/api/sql/saved/q-top',
      body: { name: 'EMEA month end', sql: held.find((each) => each.id === 'q-top')!.sql },
    });
    expect(onRenamed).toHaveBeenCalledWith('q-top', 'EMEA month end');
  });
});
