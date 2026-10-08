import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobsPage } from './JobsPage';

/**
 * T559 (AC-297, AC-399; design 16, pins 3 and 4, state H): every Jobs tab
 * shows each row's folder in a column of its own and has the Folder filter:
 * "All of mine", a read-write member's folders, or "All folders", a
 * Super-Admin's every one, with Include subfolders. A member's tab carries
 * the scope note, naming no other folder; a Super-Admin's carries none.
 */
const MEMBER = {
  everyFolder: false,
  folders: [
    { id: 'emea', path: ['Shared', 'Sales', 'EMEA'], parentId: 'sales' },
    { id: 'dach', path: ['Shared', 'Sales', 'EMEA', 'DACH'], parentId: 'emea' },
  ],
};
const SUPER = {
  everyFolder: true,
  folders: [
    { id: 'root', path: ['Shared'], parentId: null },
    { id: 'finance', path: ['Shared', 'Finance'], parentId: 'root' },
    { id: 'sales', path: ['Shared', 'Sales'], parentId: 'root' },
    ...MEMBER.folders,
  ],
};

const row = (id: string, folderId: string, folderPath: string[]) => ({
  id: `f${folderId}__${id}`,
  type: 'rollup',
  folderId,
  shortName: id.slice(0, id.indexOf('.')),
  folderPath,
  state: 'built',
  partitions: null,
  lastBuiltAt: null,
  startedBy: null,
});
const PREAGGREGATIONS = [
  row('orders_emea.by_month', 'emea', ['Shared', 'Sales', 'EMEA']),
  row('dach.orders_daily', 'dach', ['Shared', 'Sales', 'EMEA', 'DACH']),
];
const entry = (key: string, folderId: string, folderPath: string[]) => ({
  key,
  preAggregation: `f${folderId}__orders.main`,
  name: `${key}.main`,
  folderId,
  folderPath,
  partition: null,
  granularity: null,
  state: 'queued',
  addedAt: '2026-10-02T12:00:00.000Z',
  starter: { kind: 'refresh-worker' },
  token: null,
  runId: null,
  cancellable: false,
  stoppable: false,
});
const QUEUED = [
  entry('emea', 'emea', ['Shared', 'Sales', 'EMEA']),
  entry('dach', 'dach', ['Shared', 'Sales', 'EMEA', 'DACH']),
];

const asked: string[] = [];
function serve(folders: unknown = MEMBER) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/jobs/folders') return Response.json(folders);
      if (url === '/api/me')
        return Response.json({
          name: (folders as { everyFolder: boolean }).everyFolder ? 'Ada Admin' : 'Wren Writer',
          security: 'oidc',
        });
      if (url === '/api/jobs/summary')
        return Response.json({ building: 0, queued: 2, failed: 0, suspended: 0 });
      if (url === '/api/preaggregations') return Response.json(PREAGGREGATIONS);
      if (url === '/api/jobs/queue') return Response.json({ entries: QUEUED, everyFolder: false });
      if (url.startsWith('/api/jobs/builds'))
        return Response.json({ records: [], starters: [], folders: [], everyFolder: false });
      if (url === '/api/cube-health') return Response.json({ cube: 'healthy', worker: 'healthy' });
      if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
}

function shown(search = '') {
  window.history.replaceState(null, '', `/jobs${search}`);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <JobsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
  window.history.replaceState(null, '', '/');
});

const user = () => userEvent.setup({ delay: null });
const text = (element: Element | null | undefined) => element?.textContent ?? '';
const panelOf = (tab: string | RegExp) => screen.getByRole('tabpanel', { name: tab });
/** A tab's Folder filter: its choices, as people read them. */
const choicesOf = (panel: HTMLElement) =>
  within(within(panel).getByRole('combobox', { name: 'Folder' }))
    .getAllByRole('option')
    .map((option) => text(option).replaceAll('   ', '› '));
/**
 * A choice indented by its depth, as state H2 draws the menu: each folder
 * one step in under All, and each a step further below its parent (T610).
 */
const at = (depth: number, words: string) => `${'› '.repeat(depth)}${words}`;

describe('Pre-aggregations’ Folder column and filter, and its scope note (T559, AC-297)', () => {
  const names = () =>
    within(screen.getByRole('table', { name: 'Pre-aggregations' }))
      .getAllByTestId('preagg-name')
      .map((name) => text(name));

  it('shows each row’s folder in a column of its own, after its name', async () => {
    serve();
    shown();
    const table = await screen.findByRole('table', { name: 'Pre-aggregations' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .slice(0, 3)
        .map((header) => text(header)),
    ).toEqual(['Pre-aggregation', 'Folder', 'Status']);
    expect(
      within(table)
        .getAllByTestId('preagg-folder')
        .map((cell) => text(cell)),
    ).toEqual(['Sales / EMEA', 'Sales / EMEA / DACH']);
  });

  it('offers All of mine and the member’s folders; a folder lists its own, and Include subfolders those below', async () => {
    serve();
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const panel = panelOf('Pre-aggregations');
    await vi.waitFor(() => {
      // The member's paths, indented by depth below their own top folder (H2; T610).
      expect(choicesOf(panel)).toEqual([
        'All of mine',
        at(1, 'Sales / EMEA'),
        at(2, 'Sales / EMEA / DACH'),
      ]);
    });
    // Headed by whose they are, as H2's menu is (T611).
    await vi.waitFor(() => {
      expect(within(panel).getByRole('group', { name: 'Wren Writer · read-write' }).tagName).toBe(
        'OPTGROUP',
      );
    });
    const below = within(panel).getByRole('checkbox', { name: 'Include subfolders' });
    expect((below as HTMLInputElement).disabled).toBe(true);

    await user().selectOptions(within(panel).getByRole('combobox', { name: 'Folder' }), 'emea');
    expect(names()).toEqual(['orders_emea.by_month']);
    await user().click(below);
    expect(names()).toEqual(['orders_emea.by_month', 'dach.orders_daily']);
  });

  it('says, on a member’s tab, that it shows the folders they write', async () => {
    serve();
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    expect(
      text(await within(panelOf('Pre-aggregations')).findByRole('note', { name: 'Scope' })),
    ).toBe('Showing pre-aggregations of models in the folders where you have read-write access.');
  });

  it('gives a Super-Admin every folder, the root’s as Shared, and no scope note', async () => {
    serve(SUPER);
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const panel = panelOf('Pre-aggregations');

    await vi.waitFor(() => {
      expect(choicesOf(panel)).toEqual([
        // A tree of short names under the root, as state H2 draws a Super-Admin's (T560),
        // the root itself a step in under All folders (T610).
        'All folders',
        at(1, 'Shared · the root'),
        at(2, 'Finance'),
        at(2, 'Sales'),
        at(3, 'EMEA'),
        at(4, 'DACH'),
      ]);
    });
    await vi.waitFor(() => {
      expect(within(panel).getByRole('group', { name: 'Ada Admin · Super-Admin' }).tagName).toBe(
        'OPTGROUP',
      );
    });
    expect(within(panel).queryByRole('note', { name: 'Scope' })).toBeNull();
  });

  /** T560's review: the tree in its own order, whatever order the folders come in. */
  it('puts each folder of a Super-Admin’s tree under its parent, before its parent’s next sibling', async () => {
    serve({
      everyFolder: true,
      // As the API sorts them, by the whole path: "Sales Ops" between Sales and Sales / EMEA.
      folders: [
        { id: 'root', path: ['Shared'], parentId: null },
        { id: 'sales', path: ['Shared', 'Sales'], parentId: 'root' },
        { id: 'ops', path: ['Shared', 'Sales Ops'], parentId: 'root' },
        { id: 'emea', path: ['Shared', 'Sales', 'EMEA'], parentId: 'sales' },
      ],
    });
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const panel = panelOf('Pre-aggregations');

    await vi.waitFor(() => {
      expect(choicesOf(panel)).toEqual([
        'All folders',
        at(1, 'Shared · the root'),
        at(2, 'Sales'),
        at(3, 'EMEA'),
        at(2, 'Sales Ops'),
      ]);
    });
  });
});

describe('Queue’s and Run history’s Folder filter and scope note (T559, AC-297)', () => {
  it('lists the queue’s entries of a folder, and those below with Include subfolders', async () => {
    serve();
    shown('?tab=queue');
    const table = await screen.findByRole('table', { name: 'Build queue' });
    const panel = panelOf(/^Queue/);
    const names = () =>
      within(screen.getByRole('table', { name: 'Build queue' }))
        .getAllByRole('row')
        .slice(1)
        .map((each) => text(each.querySelector('.run-history__name')));
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => text(header)),
    ).toContain('Folder');
    expect(text(within(panel).getByRole('note', { name: 'Scope' }))).toBe(
      'Showing queued and building builds in the folders where you have read-write access.',
    );
    await vi.waitFor(() => {
      expect(choicesOf(panel)).toEqual([
        'All of mine',
        at(1, 'Sales / EMEA'),
        at(2, 'Sales / EMEA / DACH'),
      ]);
    });

    await user().selectOptions(within(panel).getByRole('combobox', { name: 'Folder' }), 'emea');
    expect(names()).toEqual(['emea.main']);
    await user().click(within(panel).getByRole('checkbox', { name: 'Include subfolders' }));
    expect(names()).toEqual(['emea.main', 'dach.main']);
  });

  it('asks Run history for a folder’s builds with those below it, and says whose they are', async () => {
    serve();
    shown('?tab=history');
    const panel = panelOf('Run history');
    expect(text(await within(panel).findByRole('note', { name: 'Scope' }))).toBe(
      'Showing builds of pre-aggregations in the folders where you have read-write access.',
    );
    await vi.waitFor(() => {
      expect(choicesOf(panel)).toEqual([
        'All of mine',
        at(1, 'Sales / EMEA'),
        at(2, 'Sales / EMEA / DACH'),
      ]);
    });

    await user().selectOptions(within(panel).getByRole('combobox', { name: 'Folder' }), 'emea');
    await user().click(within(panel).getByRole('checkbox', { name: 'Include subfolders' }));

    await vi.waitFor(() => {
      expect(asked.filter((url) => url.startsWith('/api/jobs/builds?')).at(-1)).toBe(
        '/api/jobs/builds?folder=emea&subfolders=true&within=week',
      );
    });
  });
});
