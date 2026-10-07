import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobsPage } from './JobsPage';

/**
 * T558 / AC-398 (design 16, P5): Jobs' header says, over the user's folders,
 * "1 building · 2 queued · 1 failed · 1 suspended schedule", from the API's
 * summary. Each count is a link to the tab or page that lists them, filtered
 * to those, and the list there has that many rows.
 */
const SUMMARY = { building: 1, queued: 2, failed: 1, suspended: 1 };

const entry = (key: string, state: string) => ({
  key,
  preAggregation: 'orders.main',
  name: 'orders.main',
  folderId: 'root',
  folderPath: ['Shared'],
  partition: null,
  granularity: null,
  state,
  addedAt: '2026-10-02T12:00:00.000Z',
  starter: { kind: 'refresh-worker' },
  token: null,
  runId: null,
  cancellable: false,
  stoppable: false,
});
const QUEUED = [
  entry('k-1', 'building'),
  entry('k-2', 'queued'),
  entry('k-3', 'queued'),
  entry('k-4', 'stalled'),
];
const row = (id: string, state: string) => ({
  id,
  type: 'rollup',
  shortName: id.slice(0, id.indexOf('.')),
  folderPath: ['Shared'],
  state,
  partitions: null,
  lastBuiltAt: null,
  startedBy: null,
});
const PREAGGREGATIONS = [
  row('orders.main', 'built'),
  row('orders.daily', 'failed'),
  row('returns.weekly', 'building'),
];

function serve(
  summary: unknown = SUMMARY,
  /** What the lists answer now: a test changes them as builds go on. */
  now: { preaggregations: unknown[]; queued: unknown[] } = {
    preaggregations: PREAGGREGATIONS,
    queued: QUEUED,
  },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/jobs/summary') return Response.json(summary);
      if (url === '/api/preaggregations') return Response.json(now.preaggregations);
      if (url === '/api/jobs/queue')
        return Response.json({ entries: now.queued, everyFolder: true });
      if (url.startsWith('/api/jobs/builds'))
        return Response.json({ records: [], starters: [], folders: [], everyFolder: true });
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
  window.history.replaceState(null, '', '/');
});

const user = () => userEvent.setup({ delay: null });
const text = (element: Element | null | undefined) => element?.textContent ?? '';
const summary = () => screen.findByRole('group', { name: 'In your folders' });

describe('Jobs’ header summary (T558, AC-398)', () => {
  it('says how many are building, queued, failed and suspended, each a link to where they are listed', async () => {
    serve();
    shown();

    const said = await summary();
    expect(text(said)).toBe('1 building · 2 queued · 1 failed · 1 suspended schedule');
    expect(
      within(said)
        .getAllByRole('link')
        .map((link) => [text(link), link.getAttribute('href')]),
    ).toEqual([
      ['1 building', '/jobs?tab=queue&state=building'],
      ['2 queued', '/jobs?tab=queue&state=queued'],
      ['1 failed', '/jobs?status=failed'],
      ['1 suspended schedule', '/schedules?state=suspended'],
    ]);
  });

  it('says the plural of each, and leaves out a count it couldn’t read', async () => {
    serve({ building: 0, queued: null, failed: 3, suspended: 2 });
    shown();

    expect(text(await summary())).toBe('0 building · 3 failed · 2 suspended schedules');
  });

  it('opens Pre-aggregations on its failed ones from "1 failed", listing that many', async () => {
    serve();
    shown('?tab=queue');
    const said = await summary();

    await user().click(within(said).getByRole('link', { name: '1 failed' }));

    expect(
      screen.getByRole('tab', { name: 'Pre-aggregations' }).getAttribute('aria-selected'),
    ).toBe('true');
    const table = await screen.findByRole('table', { name: 'Pre-aggregations' });
    expect(
      within(table)
        .getAllByTestId('row-state')
        .map((state) => state.getAttribute('data-state')),
    ).toEqual(['failed']);
    expect((screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).value).toBe(
      'failed',
    );
  });

  it('opens Queue on what is queued from "2 queued", and on what is building from "1 building", listing that many', async () => {
    serve();
    shown();
    const said = await summary();
    const states = async () =>
      within(await screen.findByRole('table', { name: 'Build queue' }))
        .getAllByTestId('queue-state')
        .map((state) => state.getAttribute('data-state'));
    const chosen = () =>
      (screen.getByRole('combobox', { name: 'State' }) as HTMLSelectElement).value;

    await user().click(within(said).getByRole('link', { name: '2 queued' }));
    expect(screen.getByRole('tab', { name: /^Queue/ }).getAttribute('aria-selected')).toBe('true');
    expect(await states()).toEqual(['queued', 'queued']);
    expect(chosen()).toBe('queued');

    await user().click(within(said).getByRole('link', { name: '1 building' }));
    expect(await states()).toEqual(['building']);
    expect(chosen()).toBe('building');
  });

  /** T558's review: the list the link opens is read again, as the count was. */
  it('reads the list again when a count opens it, so what it lists is what the count says', async () => {
    const now = { preaggregations: [row('orders.main', 'built')], queued: [] as unknown[] };
    serve(SUMMARY, now);
    shown();
    await screen.findByRole('table', { name: 'Pre-aggregations' });
    const said = await summary();
    // A build fails, and another is queued, after the lists were read.
    now.preaggregations = PREAGGREGATIONS;
    now.queued = QUEUED;

    await user().click(within(said).getByRole('link', { name: '1 failed' }));
    await vi.waitFor(() => {
      expect(
        within(screen.getByRole('table', { name: 'Pre-aggregations' }))
          .getAllByTestId('row-state')
          .map((state) => state.getAttribute('data-state')),
      ).toEqual(['failed']);
    });
    await user().click(within(said).getByRole('link', { name: '2 queued' }));
    await vi.waitFor(() => {
      expect(
        within(screen.getByRole('table', { name: 'Build queue' }))
          .getAllByTestId('queue-state')
          .map((state) => state.getAttribute('data-state')),
      ).toEqual(['queued', 'queued']);
    });
  });
});

/**
 * The filters the summary's links open (T558; the user's answer, R66):
 * Pre-aggregations' Status, as design 16 draws it, and a State pill on
 * Queue, each set from the address and cleared by the user.
 */
describe('Pre-aggregations’ Status and Queue’s State (T558, R66)', () => {
  it('opens Pre-aggregations filtered at ?status=, and Any lists every one again', async () => {
    serve();
    shown('?status=building');
    const states = async () =>
      within(await screen.findByRole('table', { name: 'Pre-aggregations' }))
        .getAllByTestId('row-state')
        .map((state) => state.getAttribute('data-state'));

    expect(await states()).toEqual(['building']);
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(
      within(status)
        .getAllByRole('option')
        .map((option) => text(option)),
    ).toEqual([
      'Any',
      'Failed',
      'Building',
      'Queued',
      'Stalled',
      'Partly built',
      'Not built',
      'Built',
    ]);

    await user().selectOptions(status, 'Any');
    expect(await states()).toEqual(['built', 'failed', 'building']);
  });

  it('opens Queue filtered at ?tab=queue&state=, and Any lists every entry again', async () => {
    serve();
    shown('?tab=queue&state=stalled');
    const states = async () =>
      within(await screen.findByRole('table', { name: 'Build queue' }))
        .getAllByTestId('queue-state')
        .map((state) => state.getAttribute('data-state'));

    expect(await states()).toEqual(['stalled']);
    const state = screen.getByRole('combobox', { name: 'State' });
    expect(
      within(state)
        .getAllByRole('option')
        .map((option) => text(option)),
    ).toEqual(['Any', 'Building', 'Queued', 'Stalled']);
    // The count says what is listed.
    expect(text(screen.getByText(/· in queue order, oldest first$/))).toBe(
      '1 entry · in queue order, oldest first',
    );

    await user().selectOptions(state, 'Any');
    expect(await states()).toEqual(['building', 'queued', 'queued', 'stalled']);
  });
});
