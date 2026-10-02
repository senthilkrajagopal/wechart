import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunHistory, type BuildSummary } from './RunHistory';

/**
 * T374 / AC-150 (design 16, state B): Run history lists the builds wechart
 * started, newest first, 50 at a time with Newer and Older, narrowed by
 * outcome, starter, folder and time; one start is one row however many
 * partitions it built (Q6); Cube's record expired is an outcome of its own;
 * and the empty state names no other folder and says the refresh worker's
 * builds come later (B4).
 */
const wren = { kind: 'person', key: 'wren', name: 'Wren Writer' } as const;
const close = { kind: 'schedule', id: 's-1', name: 'Month-end close' } as const;

const summary = (over: Partial<BuildSummary> = {}): BuildSummary => ({
  id: 'b-1',
  preAggregation: 'femea__orders_emea.by_month',
  name: 'orders_emea.by_month',
  folderId: 'emea',
  folderPath: ['Shared', 'Sales', 'EMEA'],
  partitions: null,
  granularity: 'month',
  jobs: 10,
  via: 'build-all',
  starter: wren,
  startedAt: '2026-10-02T12:05:12.000Z',
  endedAt: '2026-10-02T12:05:53.000Z',
  durationMs: 41_000,
  outcome: 'done',
  failedCount: 0,
  error: null,
  progress: { done: 10, building: 0 },
  ...over,
});

/** The API: each list ask answered by `answer`, every ask kept. */
function api(answer: (query: URLSearchParams) => unknown) {
  const asked: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/jobs/builds') {
        asked.push(url.searchParams);
        return Response.json(answer(url.searchParams));
      }
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
  return asked;
}

const listOf = (records: BuildSummary[], more: Record<string, unknown> = {}) => ({
  records,
  starters: [wren, close],
  folders: [
    { id: 'emea', path: ['Shared', 'Sales', 'EMEA'] },
    { id: 'dach', path: ['Shared', 'Sales', 'EMEA', 'DACH'] },
  ],
  ...more,
});

function shown() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RunHistory />
    </QueryClientProvider>,
  );
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';
const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Run history (T374, AC-150)', () => {
  it('lists the API’s page newest first, 50 at a time, with Older and Newer', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, at) =>
        summary({
          id: `b-${String(from + at)}`,
          startedAt: new Date(Date.UTC(2026, 9, 2, 12, 0) - (from + at) * 60_000).toISOString(),
        }),
      );
    const asked = api((query) =>
      query.get('before') === 'b-49' ? listOf(page(50, 5)) : listOf(page(0, 50), { older: 'b-49' }),
    );
    shown();

    await screen.findByRole('table', { name: 'Run history' });
    const rows = () =>
      within(screen.getByRole('table', { name: 'Run history' }))
        .getAllByRole('row')
        .slice(1);
    expect(rows()).toHaveLength(50);
    expect(text(rows()[0])).toContain('orders_emea.by_month');
    expect(button('Newer').disabled).toBe(true);

    await userEvent.click(button('Older'));
    await screen.findByText('5 builds · newest first');
    expect(asked.at(-1)?.get('before')).toBe('b-49');
    expect(rows()).toHaveLength(5);
    expect(button('Older').disabled).toBe(true);

    await userEvent.click(button('Newer'));
    await screen.findByText('50 builds · newest first');
    expect(asked.at(-1)?.get('before')).toBe(null);
  });

  it('asks the API for what the Outcome, Started by, Folder and Time filters choose', async () => {
    const asked = api(() => listOf([summary()]));
    shown();
    await screen.findByRole('table', { name: 'Run history' });
    // Last 7 days, as the design opens it.
    expect(asked.at(-1)?.get('within')).toBe('week');

    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'Failed');
    expect(asked.at(-1)?.get('outcome')).toBe('failed');
    await userEvent.selectOptions(screen.getByLabelText('Started by'), 'Month-end close');
    expect(asked.at(-1)?.get('starter')).toBe('schedule:s-1');
    await userEvent.selectOptions(screen.getByLabelText('Folder'), 'Sales / EMEA / DACH');
    expect(asked.at(-1)?.get('folder')).toBe('dach');
    await userEvent.selectOptions(screen.getByLabelText('Time'), 'Last 24 hours');
    expect(asked.at(-1)?.get('within')).toBe('day');
    await userEvent.selectOptions(screen.getByLabelText('Time'), 'All time');
    expect(asked.at(-1)?.get('within')).toBe('all');
  });

  it('shows one start of 30 partitions as one row', async () => {
    api(() =>
      listOf([summary({ jobs: 30, granularity: 'day', outcome: 'failed', failedCount: 2 })]),
    );
    shown();

    const table = await screen.findByRole('table', { name: 'Run history' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toContain('All 30');
    // Failed, saying how many of its partitions (B3).
    expect(text(within(rows[0]!).getByTestId('build-outcome'))).toBe('Failed · 2 of 30');
  });

  it('names each row’s partitions, outcome, duration and starter as design 16 draws them', async () => {
    api(() =>
      listOf([
        summary({
          id: 'sel',
          partitions: ['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'],
          via: 'rebuild-selected',
          jobs: 2,
          outcome: null,
          endedAt: null,
          durationMs: null,
          failedCount: null,
          progress: { done: 0, building: 0 },
        }),
        summary({ id: 'whole', granularity: null, jobs: 1, durationMs: 6_000 }),
        summary({ id: 'sched', starter: close, via: 'schedule', durationMs: 124_000 }),
        summary({ id: 'gone', outcome: 'expired', endedAt: null, durationMs: null }),
      ]),
    );
    shown();

    const table = await screen.findByRole('table', { name: 'Run history' });
    const row = (id: string) => within(table).getByTestId(`build-row-${id}`);
    expect(text(row('sel'))).toContain('Sep, Aug 2026');
    expect(text(within(row('sel')).getByTestId('build-outcome'))).toBe('Queued · 0 of 2');
    expect(text(row('whole'))).toContain('Whole');
    expect(text(row('whole'))).toContain('6 s');
    expect(text(row('sched'))).toContain('2 min 4 s');
    expect(text(row('sched'))).toContain('Month-end close');
    // Its own outcome, neither done nor failed (B2), and no duration.
    expect(text(within(row('gone')).getByTestId('build-outcome'))).toBe('Cube’s record expired');
    expect(text(row('gone'))).toContain('—');
    // Each starter with its icon (rule 3).
    expect(within(row('sched')).getByTestId('starter').querySelectorAll('svg')).toHaveLength(1);
  });

  it('says what is listed when nothing is, naming no folder, and that the refresh worker’s builds come later', async () => {
    api(() => listOf([]));
    shown();

    const empty = await screen.findByText('No builds in the last 7 days');
    const said = empty.parentElement!;
    expect(text(said)).toContain('in your folders');
    expect(text(said)).toContain('Cube’s refresh worker’s own builds aren’t listed yet');
    expect(text(said)).not.toContain('EMEA');
    expect(within(said).getByRole('button', { name: 'Show all time' }).tagName).toBe('BUTTON');
  });
});
