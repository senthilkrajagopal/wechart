import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildQueue, type QueueRow } from './BuildQueue';

/**
 * T376 / AC-151 (design 16, state C): the build queue in the queue's order,
 * oldest first, each entry with its pre-aggregation, folder, partition,
 * state, who started it and its token; Cancel only on a queued build wechart
 * started, the list saying why the others have none (Q1, Q5); a cancel that
 * didn't happen saying why; and nothing queued said so.
 */
const row = (over: Partial<QueueRow>): QueueRow => ({
  key: 'k',
  preAggregation: 'femea__orders_emea.by_month',
  name: 'orders_emea.by_month',
  folderId: 'emea',
  folderPath: ['Shared', 'Sales', 'EMEA'],
  partition: { start: '2026-08-01T00:00:00.000', end: '2026-08-31T23:59:59.999' },
  granularity: 'month',
  state: 'queued',
  addedAt: '2026-10-02T12:38:41.000Z',
  starter: { kind: 'person', key: 'wren', name: 'Wren Writer' },
  token: '7c1e0000000000000000000000009ab',
  runId: 'run-1',
  cancellable: true,
  ...over,
});

const ROWS = [
  row({
    key: 'k-stalled',
    name: 'dach.returns_weekly',
    state: 'stalled',
    starter: { kind: 'refresh-worker' },
    token: null,
    runId: null,
    cancellable: false,
    partition: { start: '2026-09-28T00:00:00.000', end: '2026-10-04T23:59:59.999' },
    granularity: 'week',
  }),
  row({
    key: 'k-query',
    state: 'building',
    starter: { kind: 'query' },
    token: null,
    runId: null,
    cancellable: false,
    partition: null,
    granularity: null,
  }),
  row({ key: 'k-mine' }),
];

function serve(cancel: (key: string) => unknown = () => ({ cancelled: true })) {
  const asked: { url: string; body?: unknown }[] = [];
  let entries = ROWS;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      asked.push({ url, body });
      if (url === '/api/jobs/queue') return Response.json({ entries, everyFolder: false });
      if (url === '/api/jobs/queue/cancel') {
        const answer = cancel((body as { key: string }).key);
        if ((answer as { cancelled?: boolean }).cancelled === true)
          entries = entries.filter((each) => each.key !== (body as { key: string }).key);
        return Response.json(answer);
      }
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
  return asked;
}

function shown() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BuildQueue />
    </QueryClientProvider>,
  );
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the build queue (T376, AC-151)', () => {
  it('lists each entry with its pre-aggregation, folder, partition, state, starter and token', async () => {
    serve();
    shown();

    const table = await screen.findByRole('table', { name: 'Build queue' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((each) => each.getAttribute('data-key'))).toEqual([
      'k-stalled',
      'k-query',
      'k-mine',
    ]);
    expect(text(rows[0])).toContain('dach.returns_weekly');
    expect(text(rows[0])).toContain('Week of 28 Sep 2026');
    expect(text(within(rows[0]!).getByTestId('queue-state'))).toBe('Stalled');
    expect(text(rows[0])).toContain('Cube takes it out at its next check');
    expect(text(rows[0])).toContain('Cube’s refresh worker');
    expect(text(rows[1])).toContain('Whole');
    expect(text(within(rows[1]!).getByTestId('queue-state'))).toBe('Building');
    expect(text(rows[1])).toContain('A query');
    expect(text(rows[2])).toContain('Sales / EMEA');
    expect(text(rows[2])).toContain('Aug 2026');
    expect(text(rows[2])).toContain('Wren Writer');
    // The token wechart has, shortened, whole in its title; "—" where there is none (Q5).
    expect(within(rows[2]!).getByTitle('7c1e0000000000000000000000009ab').textContent).toBe(
      '7c1e0000…09ab',
    );
    expect(text(within(rows[0]!).getByTestId('queue-token'))).toBe('—');
  });

  it('offers Cancel only on a queued build wechart started, and says why the others have none', async () => {
    serve();
    shown();

    const table = await screen.findByRole('table', { name: 'Build queue' });
    expect(
      within(table)
        .getAllByRole('button', { name: /^Cancel/ })
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual(['Cancel the Aug 2026 build of orders_emea.by_month']);
    expect(text(screen.getByTestId('queue-foot'))).toContain(
      'Only queued builds wechart started, from Jobs or a schedule, can be cancelled here',
    );
  });

  it('cancels, says so, and the entry leaves the list', async () => {
    const asked = serve();
    shown();
    await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the Aug 2026 build of orders_emea.by_month' }),
    );

    expect(asked.find((each) => each.url === '/api/jobs/queue/cancel')?.body).toEqual({
      key: 'k-mine',
    });
    expect(
      text(await screen.findByText(/Cancelled the Aug 2026 build of orders_emea\.by_month/)),
    ).toContain('Build it again from Pre-aggregations.');
    await vi.waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Cancel the/ })).toHaveLength(0);
    });
  });

  it('says a cancel didn’t happen, and why', async () => {
    serve(() => ({
      cancelled: false,
      reason: 'processing',
      message: 'Not cancelled: it had started building.',
    }));
    shown();
    await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the Aug 2026 build of orders_emea.by_month' }),
    );

    expect(text(await screen.findByText('Not cancelled: it had started building.'))).toBe(
      'Not cancelled: it had started building.',
    );
  });

  it('says a cancel that didn’t happen for a reason it doesn’t know in the API’s words', async () => {
    serve(() => ({
      cancelled: false,
      reason: 'locked',
      message: 'Not cancelled: locked.',
    }));
    shown();
    await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the Aug 2026 build of orders_emea.by_month' }),
    );

    expect(text(await screen.findByRole('alert'))).toContain('Not cancelled: locked.');
    expect(text(screen.getByRole('alert'))).not.toContain('left the queue');
  });

  it('says nothing is queued or building, when nothing is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ entries: [], everyFolder: false })),
    );
    shown();

    const said = (await screen.findByText('Nothing is queued or building')).parentElement;
    expect(text(said)).toContain(
      'Builds of pre-aggregations in your folders show here while they wait and while they run, whoever started them.',
    );
  });
});
