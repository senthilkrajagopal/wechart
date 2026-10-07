import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUEUE_QUERY_KEY } from './BuildQueue';
import { JobsPage } from './JobsPage';

/**
 * T610 (AC-399; design 16, screen 1's filters and state C): Pre-aggregations'
 * "Search pre-aggregations", after Folder and Status, narrowing the list by
 * name or folder; and the queue's Started by, after Folder, Anyone or one of
 * those whose entries are queued. A link of Jobs' summary lists every entry
 * of its count again, whatever was searched or chosen (AC-398).
 */
const row = (id: string, folderId: string, folderPath: string[], state = 'built') => ({
  id: `f${folderId}__${id}`,
  type: 'rollup',
  folderId,
  shortName: id.slice(0, id.indexOf('.')),
  folderPath,
  state,
  partitions: null,
  lastBuiltAt: null,
  startedBy: null,
});
const PREAGGREGATIONS = [
  row('orders_emea.by_month', 'emea', ['Shared', 'Sales', 'EMEA'], 'failed'),
  row('returns_emea.daily', 'emea', ['Shared', 'Sales', 'EMEA']),
  row('dach.orders_daily', 'dach', ['Shared', 'Sales', 'EMEA', 'DACH']),
];
const entry = (key: string, starter: unknown, state = 'queued') => ({
  key,
  preAggregation: `femea__${key}.main`,
  name: `${key}.main`,
  folderId: 'emea',
  folderPath: ['Shared', 'Sales', 'EMEA'],
  partition: null,
  granularity: null,
  state,
  addedAt: '2026-10-02T12:00:00.000Z',
  starter,
  token: null,
  runId: null,
  cancellable: false,
  stoppable: false,
});
const WREN = { kind: 'person', key: 'wren', name: 'Wren Writer' };
const CLOSE = { kind: 'schedule', id: 's-close', name: 'Month-end close' };
const QUEUED = [
  entry('worker', { kind: 'refresh-worker' }, 'building'),
  entry('wren_one', WREN),
  entry('query', { kind: 'query' }),
  entry('close', CLOSE),
  entry('wren_two', WREN),
];

function serve(queued: () => unknown[] = () => QUEUED) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/jobs/folders')
        return Response.json({
          everyFolder: false,
          folders: [
            { id: 'emea', path: ['Shared', 'Sales', 'EMEA'], parentId: 'sales' },
            { id: 'dach', path: ['Shared', 'Sales', 'EMEA', 'DACH'], parentId: 'emea' },
          ],
        });
      if (url === '/api/jobs/summary')
        return Response.json({ building: 1, queued: 4, failed: 1, suspended: 0 });
      if (url === '/api/preaggregations') return Response.json(PREAGGREGATIONS);
      if (url === '/api/jobs/queue')
        return Response.json({ entries: queued(), everyFolder: false });
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const user = () => userEvent.setup({ delay: null });
const text = (element: Element | null | undefined) => element?.textContent ?? '';

describe('Search pre-aggregations (T610, AC-399; screen 1)', () => {
  const names = () =>
    within(screen.getByRole('table', { name: 'Pre-aggregations' }))
      .queryAllByTestId('preagg-name')
      .map((name) => text(name));

  it('narrows the list to those whose name or folder holds what is typed, and counts them', async () => {
    serve();
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const panel = screen.getByRole('tabpanel', { name: 'Pre-aggregations' });
    const find = within(panel).getByRole('searchbox', { name: 'Search pre-aggregations' });
    // After Folder and Status, as screen 1 places it.
    const filters = [
      ...panel.querySelectorAll<HTMLInputElement>(
        '.run-history__filters select, .run-history__filters input',
      ),
    ].map((each) => each.getAttribute('aria-label') ?? text(each.labels?.[0]));
    expect(filters).toEqual(['Folder', 'Include subfolders', 'Status', 'Search pre-aggregations']);
    expect(find.getAttribute('placeholder')).toBe('Search pre-aggregations');

    await user().type(find, 'ORDERS');
    expect(names()).toEqual(['orders_emea.by_month', 'dach.orders_daily']);
    expect(text(panel.querySelector('.run-history__count'))).toBe('2 pre-aggregations');

    await user().clear(find);
    await user().type(find, 'dach');
    expect(names()).toEqual(['dach.orders_daily']);

    // By its folder alone: no name holds "sales", every folder does (T610's review).
    await user().clear(find);
    await user().type(find, 'Sales');
    expect(names()).toEqual(['orders_emea.by_month', 'returns_emea.daily', 'dach.orders_daily']);
    await user().clear(find);
    await user().type(find, 'emea / dach');
    expect(names()).toEqual(['dach.orders_daily']);
  });

  it('is cleared when a count of Jobs’ summary opens the list (AC-398)', async () => {
    serve();
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const find = screen.getByRole('searchbox', { name: 'Search pre-aggregations' });
    await user().type(find, 'returns');

    await user().click(
      within(await screen.findByRole('group', { name: 'In your folders' })).getByRole('link', {
        name: '1 failed',
      }),
    );

    expect((find as HTMLInputElement).value).toBe('');
    expect(names()).toEqual(['orders_emea.by_month']);
  });
});

describe('The queue’s Started by (T610, AC-399; state C)', () => {
  const names = () =>
    within(screen.getByRole('table', { name: 'Build queue' }))
      .getAllByRole('row')
      .slice(1)
      .map((each) => text(each.querySelector('.run-history__name')));

  it('offers Anyone and each who has entries queued, and lists only theirs when one is chosen', async () => {
    serve();
    shown('?tab=queue');
    await screen.findByRole('table', { name: 'Build queue' });
    const panel = screen.getByRole('tabpanel', { name: /^Queue/ });
    const starter = within(panel).getByRole('combobox', { name: 'Started by' });

    expect(
      within(starter)
        .getAllByRole('option')
        .map((option) => [option.getAttribute('value'), text(option)]),
    ).toEqual([
      ['', 'Anyone'],
      ['schedule:s-close', 'Month-end close'],
      ['person:wren', 'Wren Writer'],
      ['refresh-worker', 'Cube’s refresh worker'],
      ['query', 'A query'],
    ]);
    // After Folder, as state C places it.
    const pills = [...panel.querySelectorAll('.select-pill label')].map((label) => text(label));
    expect(pills).toEqual(['Folder', 'Started by', 'State']);

    await user().selectOptions(starter, 'person:wren');
    expect(names()).toEqual(['wren_one.main', 'wren_two.main']);
    expect(text(within(panel).getByText(/· in queue order, oldest first$/))).toBe(
      '2 entries · in queue order, oldest first',
    );
    await user().selectOptions(starter, 'refresh-worker');
    expect(names()).toEqual(['worker.main']);
    await user().selectOptions(starter, '');
    expect(names()).toHaveLength(5);
  });

  it('keeps the one chosen, by name, once their entries have left the queue', async () => {
    let now: unknown[] = QUEUED;
    serve(() => now);
    const client = shown('?tab=queue');
    await screen.findByRole('table', { name: 'Build queue' });
    const panel = screen.getByRole('tabpanel', { name: /^Queue/ });
    const starter = within(panel).getByRole('combobox', {
      name: 'Started by',
    }) as HTMLSelectElement;
    await user().selectOptions(starter, 'person:wren');

    // Wren's builds end; the queue is read again (T610's review).
    now = QUEUED.filter((each) => each.starter !== WREN);
    await client.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });

    await vi.waitFor(() => {
      expect(text(within(panel).getByText(/· in queue order, oldest first$/))).toBe(
        '0 entries · in queue order, oldest first',
      );
    });
    // Still Wren, not a list of none under "Anyone"; Anyone is there to choose.
    expect(starter.value).toBe('person:wren');
    expect(text(starter.selectedOptions[0])).toBe('Wren Writer');
    await user().selectOptions(starter, '');
    expect(names()).toEqual(['worker.main', 'query.main', 'close.main']);
  });

  it('is set back to Anyone when a count of Jobs’ summary opens the queue (AC-398)', async () => {
    serve();
    shown('?tab=queue');
    await screen.findByRole('table', { name: 'Build queue' });
    const starter = screen.getByRole('combobox', { name: 'Started by' }) as HTMLSelectElement;
    await user().selectOptions(starter, 'query');

    await user().click(
      within(await screen.findByRole('group', { name: 'In your folders' })).getByRole('link', {
        name: '4 queued',
      }),
    );

    expect(starter.value).toBe('');
    expect(names()).toEqual(['wren_one.main', 'query.main', 'close.main', 'wren_two.main']);
  });
});
