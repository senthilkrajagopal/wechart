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
  stoppable: false,
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

/**
 * T554 (AC-394; design 16, P1): Stop on a building entry wechart started,
 * and on no other; it asks the API to stop it, says so, and the entry
 * leaves the list.
 */
describe('Stop, on a building build wechart started (T554, AC-394)', () => {
  const BUILDING = row({
    key: 'k-building',
    state: 'building',
    cancellable: false,
    stoppable: true,
  });

  it('offers Stop on a building entry wechart started, and not on one a query started', async () => {
    serve();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ entries: [...ROWS, BUILDING], everyFolder: false })),
    );
    shown();

    const table = await screen.findByRole('table', { name: 'Build queue' });
    expect(
      within(table)
        .getAllByRole('button', { name: /^Stop/ })
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual(['Stop the Aug 2026 build of orders_emea.by_month']);
    expect(text(screen.getByTestId('queue-foot'))).toContain(
      'A building one wechart started can be stopped, and none of it is kept.',
    );
  });

  /** The queue on a stub API whose stop answers `answer`, released when `release` is called. */
  function stopping(answer: unknown) {
    const asked: { url: string; body?: unknown }[] = [];
    let entries: QueueRow[] = [BUILDING];
    let release = () => undefined as void;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
        asked.push({ url, body });
        if (url === '/api/jobs/queue/cancel') {
          // xcube waits on the build's outcome, up to 20 s (research xcube-74c933bdb8.md).
          await answered;
          entries = [];
          return Response.json(answer);
        }
        return Response.json({ entries, everyFolder: false });
      }),
    );
    shown();
    return { asked, release: () => release() };
  }
  const stopButton = () =>
    screen.getByRole('button', { name: 'Stop the Aug 2026 build of orders_emea.by_month' });

  it('stops it, saying so while xcube stops it, then that none of it is kept; the entry leaves the list', async () => {
    const { asked, release } = stopping({ cancelled: true, build: 'stopped' });
    await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(stopButton());

    // Up to 20 s while xcube stops it: said on the button, which takes no second
    // press, kept in reach so focus isn't dropped (T611).
    expect([text(stopButton()), stopButton().getAttribute('aria-disabled')]).toEqual([
      'Stopping…',
      'true',
    ]);
    await userEvent.click(stopButton());
    expect(asked.filter((each) => each.url === '/api/jobs/queue/cancel')).toHaveLength(1);
    expect(asked.find((each) => each.url === '/api/jobs/queue/cancel')?.body).toEqual({
      key: 'k-building',
      stop: true,
    });
    release();
    expect(
      text(await screen.findByText(/Stopped the Aug 2026 build of orders_emea\.by_month/)),
    ).toBe(
      'Stopped the Aug 2026 build of orders_emea.by_month. None of it is kept. Build it again from Pre-aggregations.',
    );
    await vi.waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Stop the/ })).toHaveLength(0);
    });
  });

  it.each([
    [
      { cancelled: true, build: 'stopping' },
      'status',
      'Stopping the Aug 2026 build of orders_emea.by_month. Run history says how it ends.',
    ],
    [
      { cancelled: true, build: 'failed' },
      'alert',
      'It had already failed. It failed before the stop reached it, and none of it is kept. Run history has Cube’s error.',
    ],
    [
      {
        cancelled: false,
        reason: 'finished',
        message: 'Not stopped: it had finished building, and its version stands.',
      },
      'alert',
      'Not stopped: it had finished building. Its version stands, and Run history has it.',
    ],
  ])('says what came of it: %j', async (answer, role, said) => {
    const { release } = stopping(answer);
    await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(stopButton());
    release();

    await vi.waitFor(() => {
      expect(
        screen
          .getAllByRole(role as 'status' | 'alert')
          .map((each) => text(each))
          .filter((each) => each !== '' && !each.includes('in queue order')),
      ).toEqual([said]);
    });
  });
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
    // With how long (T611): its minutes, exactly, in the test that fixes the clock.
    expect(text(within(rows[1]!).getByTestId('queue-state'))).toMatch(/^Building · for \d+ min$/);
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

  /** T611 (AC-399; design 16, state C and the keyboard table). */
  it('says how long a build has been building, and offers each token to copy', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T12:40:30.000Z'));
    try {
      serve();
      const copied: string[] = [];
      vi.stubGlobal('isSecureContext', true);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (said: string) => {
            copied.push(said);
          },
        },
      });
      shown();

      const table = await screen.findByRole('table', { name: 'Build queue' });
      const rows = within(table).getAllByRole('row').slice(1);
      // Added 12:38:41, building since: a minute and more, "for 1 min" (C).
      expect(text(within(rows[1]!).getByTestId('queue-state'))).toBe('Building · for 1 min');
      await userEvent.click(
        within(rows[2]!).getByRole('button', { name: 'Copy the token 7c1e0000…09ab' }),
      );
      expect(copied).toEqual(['7c1e0000000000000000000000009ab']);
      // Said, as the tile menu's copies are (T611's review).
      expect(text(await screen.findByText('Copied the token 7c1e0000…09ab.'))).toBe(
        'Copied the token 7c1e0000…09ab.',
      );
      expect(text(screen.getByTestId('queue-foot'))).toContain(
        'Hover a token to see it whole, or copy it.',
      );
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('says building with no time where the queue gives none (T611’s review)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          entries: [row({ key: 'k-b', state: 'building', addedAt: '', cancellable: false })],
          everyFolder: false,
        }),
      ),
    );
    shown();

    const table = await screen.findByRole('table', { name: 'Build queue' });
    expect(text(within(table).getByTestId('queue-state'))).toBe('Building');
  });

  it('puts focus on the next entry’s Cancel once one is cancelled, else on the table', async () => {
    const two = [
      row({ key: 'k-first' }),
      row({
        key: 'k-second',
        partition: { start: '2026-09-01T00:00:00.000', end: '2026-09-30T23:59:59.999' },
      }),
      // Its own, with no Cancel: the table stays once the two are gone.
      ROWS[0]!,
    ];
    let entries = two;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/jobs/queue') return Response.json({ entries, everyFolder: false });
        if (url === '/api/jobs/queue/cancel') {
          const { key } = JSON.parse(String(init?.body)) as { key: string };
          entries = entries.filter((each) => each.key !== key);
          return Response.json({ cancelled: true });
        }
        return Response.json({ error: 'not here' }, { status: 404 });
      }),
    );
    shown();
    const table = await screen.findByRole('table', { name: 'Build queue' });

    await userEvent.click(
      within(table).getByRole('button', {
        name: 'Cancel the Aug 2026 build of orders_emea.by_month',
      }),
    );
    const next = await within(table).findByRole('button', {
      name: 'Cancel the Sep 2026 build of orders_emea.by_month',
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(next);
    });

    await userEvent.click(next);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('table', { name: 'Build queue' }));
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
