import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clockOf, exactOf } from '../../shell/formatTime';
import { failedAtOf, Partitions, type PartitionsAnswer } from './Partitions';

/**
 * T375 / AC-145 (design 16, screen 1 pins 10–12 and state A): a rollup's
 * partitions in the pane — every one, in UTC, newest first, each with a
 * checkbox, its period, its state and when Cube last built it; a failed one
 * naming the build it still serves; Rebuild selected (n) and Build all N; a
 * rollup that isn't partitioned as one row and Build now; a lambda naming
 * the rollups it combines; and, while Cube works its partitions out, asked
 * again, never shown as none.
 */
const ID = 'femea__orders_emea.by_month';
const NAME = 'orders_emea.by_month';
const part = (month: string, state: string, over: Record<string, unknown> = {}) => ({
  tableName: `t_2026${month}01`,
  start: `2026-${month}-01T00:00:00.000`,
  end: `2026-${month}-28T23:59:59.999`,
  state,
  lastBuiltAt: state === 'not-built' ? null : '2026-10-02T12:01:00.000Z',
  ...over,
});
const PARTITIONED = {
  id: ID,
  name: NAME,
  kind: 'partitioned',
  granularity: 'month',
  partitions: [
    part('10', 'building', { since: '2026-10-02T12:31:00.000Z' }),
    part('09', 'built'),
    part('08', 'failed', {
      failed: { runId: 'r1', at: '2026-10-02T12:05:00.000Z', serving: '2026-10-02T12:01:00.000Z' },
    }),
    part('07', 'queued', {
      startedBy: { kind: 'person', key: 'w', name: 'Wren Writer' },
      since: '2026-10-02T12:38:00.000Z',
    }),
    part('06', 'stalled'),
    part('01', 'not-built'),
  ],
};

function serve(answers: unknown[], me?: unknown) {
  const posted: unknown[] = [];
  let asks = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me' && me !== undefined) return Response.json(me);
      if (url.startsWith('/api/jobs/partitions')) {
        const answer = answers[Math.min(asks, answers.length - 1)];
        asks += 1;
        return answer instanceof Response ? answer : Response.json(answer);
      }
      if (url === '/api/builds') {
        posted.push(JSON.parse(String(init?.body)));
        return Response.json({ tokens: ['t1', 't2'], runId: 'run-1' });
      }
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
  return { posted, asks: () => asks };
}

function shown(onStarted = vi.fn(), children?: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Partitions id={ID} name={NAME} pollMs={20} onStarted={onStarted}>
        {children}
      </Partitions>
    </QueryClientProvider>,
  );
  return onStarted;
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';
const clock = (iso: string) => clockOf(new Date(iso));
/** "2 Oct 14:05": a moment of another day, read on 8 Oct (the faked today below). */
const dayOf = (iso: string) => `${String(new Date(iso).getDate())} Oct ${clock(iso)}`;
// Today is 8 Oct 2026, so 2 Oct is another day; only Date is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a rollup’s partitions (T375, AC-145)', () => {
  it('lists every partition, newest first, with its period, state and when Cube last built it', async () => {
    serve([PARTITIONED]);
    shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => text(row.querySelector('td:nth-child(2)')))).toEqual([
      'Oct 2026',
      'Sep 2026',
      'Aug 2026',
      'Jul 2026',
      'Jun 2026',
      'Jan 2026',
    ]);
    expect(
      rows.map((row) => within(row).getByTestId('partition-state').getAttribute('data-state')),
    ).toEqual(['building', 'built', 'failed', 'queued', 'stalled', 'not-built']);
    // Cube's words as design 16 reads them: Building and Queued (pin 5).
    // Since when, and by whom, with the time it was queued (pin 12; T611),
    // its day too on another day than today (T477, Q8).
    expect(text(within(rows[0]!).getByTestId('partition-state'))).toBe(
      `Building · since ${dayOf('2026-10-02T12:31:00.000Z')}`,
    );
    expect(text(within(rows[3]!).getByTestId('partition-state'))).toBe(
      `Queued · Wren Writer, ${dayOf('2026-10-02T12:38:00.000Z')}`,
    );
    expect(text(within(rows[4]!).getByTestId('partition-state'))).toBe('Stalled');
    expect(text(within(rows[5]!).getByTestId('partition-state'))).toBe('Not built');
    expect(text(rows[5]!.querySelector('td:last-child'))).toBe('—');
    // Failed, when, and the build it still serves (pin 12).
    // On another day than today, its day too, never a bare clock (T477, Q8).
    expect(text(rows[2])).toContain(`Failed · ${dayOf('2026-10-02T12:05:00.000Z')}`);
    expect(text(rows[2])).toContain(`Serving the build of ${dayOf('2026-10-02T12:01:00.000Z')}`);
    // Its exact time and UTC on hover (Q9).
    expect(within(rows[2]!).getByTestId('partition-state').getAttribute('title')).toBe(
      exactOf(new Date('2026-10-02T12:05:00.000Z')),
    );
    expect(rows[2]!.querySelector('.build-queue__sub time')?.getAttribute('title')).toBe(
      exactOf(new Date('2026-10-02T12:01:00.000Z')),
    );
    expect(text(screen.getByRole('heading', { name: /Partitions/ }))).toContain(
      'UTC, newest first',
    );
  });

  it('names the single user "You" on a partition they queued, with sign-in off (design 16, G7)', async () => {
    const queued = (startedBy: unknown, month: string) =>
      part(month, 'queued', { startedBy, tableName: `t_q${month}` });
    serve(
      [
        {
          ...PARTITIONED,
          partitions: [
            queued({ kind: 'person', key: 'admin', name: 'admin' }, '07'),
            queued({ kind: 'schedule', id: 's-1', name: 'Month-end close' }, '06'),
          ],
        },
      ],
      { name: 'admin', security: 'off' },
    );
    shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    await vi.waitFor(() => {
      expect(
        within(table)
          .getAllByTestId('partition-state')
          .map((state) => text(state)),
      ).toEqual(['Queued · You', 'Queued · Month-end close']);
    });
  });

  it('rebuilds the selected partitions, one request naming each start, and Build all every one', async () => {
    const { posted } = serve([PARTITIONED]);
    const onStarted = shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Sep 2026, Built' }));
    await userEvent.click(
      within(table).getByRole('checkbox', {
        name: `Aug 2026, Failed at ${dayOf('2026-10-02T12:05:00.000Z')}`,
      }),
    );
    const all = within(table).getByRole<HTMLInputElement>('checkbox', {
      name: 'Select all 6 partitions',
    });
    expect(all.indeterminate).toBe(true);
    const rebuild = screen.getByRole('button', {
      name: `Rebuild 2 selected partitions of ${NAME}`,
    });
    // With its icon, as screen 1's pin 10 draws it (T613).
    expect(rebuild.querySelector('svg')?.getAttribute('data-icon')).toBe('refresh');

    await userEvent.click(rebuild);
    expect(posted).toEqual([
      { preAggregation: ID, partitions: ['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'] },
    ]);
    // The toast's words (design 16, A1): the partitions, and the pre-aggregation by its name.
    expect(onStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        said: `Rebuilding Sep 2026 and Aug 2026 of ${NAME}`,
      }),
    );
    // The polite live region's short words (design 16, keyboard); the toast says the rest.
    expect(text(screen.getByRole('status'))).toBe('Rebuilding 2 partitions');

    await userEvent.click(screen.getByRole('button', { name: 'Build all 6' }));
    expect(posted.at(-1)).toEqual({ preAggregation: ID });
    expect(onStarted).toHaveBeenLastCalledWith(
      expect.objectContaining({ said: `Building all 6 partitions of ${NAME}` }),
    );
    expect(text(screen.getByRole('status'))).toBe('Building all 6 partitions');
  });

  /** T611 (design 16's keyboard table, "Starting a build"). */
  it('keeps focus on Rebuild selected, and says each partition’s state as it changes', async () => {
    let started = false;
    let starts = 0;
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/jobs/partitions'))
          return Response.json(
            started
              ? {
                  ...PARTITIONED,
                  partitions: PARTITIONED.partitions.map((row) =>
                    row.tableName === 't_20260901' ? { ...row, state: 'building' } : row,
                  ),
                }
              : PARTITIONED,
          );
        if (url === '/api/builds') {
          started = true;
          starts += 1;
          // Build all, the second start, answered once released.
          if (starts === 2) await held;
          return Response.json({ tokens: ['t1'], runId: 'run-1' });
        }
        return Response.json({ error: 'not here' }, { status: 404 });
      }),
    );
    shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Sep 2026, Built' }));
    const rebuild = screen.getByRole('button', { name: `Rebuild 1 selected partition of ${NAME}` });
    await userEvent.click(rebuild);

    // Still on it, though nothing is selected now.
    expect(document.activeElement?.textContent).toBe('Rebuild selected');
    expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true');
    await vi.waitFor(() => {
      expect(text(screen.getByRole('status'))).toBe('Sep 2026: Building');
    });

    // Build all too keeps focus while it starts: out of use, not out of reach.
    const everyOne = screen.getByRole('button', { name: 'Build all 6' });
    await userEvent.click(everyOne);
    expect(document.activeElement).toBe(everyOne);
    await vi.waitFor(() => {
      expect(everyOne.getAttribute('aria-disabled')).toBe('true');
    });
    expect(everyOne.hasAttribute('disabled')).toBe(false);
    release();
    await vi.waitFor(() => {
      expect(everyOne.getAttribute('aria-disabled')).toBe('false');
    });
  });

  it('says no state as it changes until a build is started here (T611’s review)', async () => {
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).startsWith('/api/jobs/partitions'))
          return Response.json({ error: 'not here' }, { status: 404 });
        reads += 1;
        // Another's build: September building from the second read on.
        return Response.json(
          reads < 2
            ? PARTITIONED
            : {
                ...PARTITIONED,
                partitions: PARTITIONED.partitions.map((row) =>
                  row.tableName === 't_20260901' ? { ...row, state: 'building' } : row,
                ),
              },
        );
      }),
    );
    shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    await vi.waitFor(() => {
      expect(text(within(table).getAllByTestId('partition-state')[1])).toBe('Building');
    });
    expect(text(screen.getByRole('status'))).toBe('');
  });

  it('builds a rollup that isn’t partitioned whole: one row, and Build now', async () => {
    const { posted } = serve([
      {
        id: ID,
        name: NAME,
        kind: 'whole',
        granularity: null,
        partitions: [
          {
            tableName: 't',
            start: null,
            end: null,
            state: 'built',
            lastBuiltAt: '2026-10-01T16:20:00.000Z',
          },
        ],
      },
    ]);
    const onStarted = shown();

    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toContain('Whole pre-aggregation');
    expect(text(screen.getByText(/Not partitioned/))).toBe(
      'Not partitioned, so it’s always built whole.',
    );
    expect(screen.queryAllByRole('button', { name: /Rebuild/ })).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Build now' }));
    expect(posted).toEqual([{ preAggregation: ID }]);
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ said: `Building ${NAME}` }));
  });

  it('names the rollups a lambda combines, offering no build of its own', async () => {
    serve([
      {
        id: ID,
        name: 'orders_emea.recent_lambda',
        kind: 'combined',
        granularity: null,
        partitions: [],
        builtFrom: [
          {
            id: 'femea__orders_emea.by_month',
            name: 'orders_emea.by_month',
            folderPath: ['Shared', 'Sales', 'EMEA'],
          },
        ],
      },
    ]);
    shown();

    const said = await screen.findByText(/It has no partitions of its own/);
    expect(text(said)).toBe(
      'It has no partitions of its own. Cube answers it from the rollups it combines, so build those:',
    );
    const link = screen.getByRole('link', { name: 'Open orders_emea.by_month' });
    expect(link.getAttribute('href')).toBe('/jobs?preagg=femea__orders_emea.by_month');
    expect(screen.queryAllByRole('button', { name: /Build|Rebuild/ })).toHaveLength(0);
    // Nothing of its own to act on: no empty bar pinned at the sheet's foot (T610's review).
    expect(document.querySelectorAll('.admin-pane__actions')).toHaveLength(0);
  });

  it('puts a lambda’s Open in Model above its Partitions, as A3 draws it (T611)', async () => {
    serve([
      { id: ID, name: NAME, kind: 'combined', granularity: null, partitions: [], builtFrom: [] },
    ]);
    shown(
      undefined,
      <a className="btn btn-sm" href="/model">
        Open in Model
      </a>,
    );

    const head = await screen.findByRole('heading', { name: 'Partitions' });
    const model = screen.getByRole('link', { name: 'Open in Model' });
    expect(model.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('asks again while Cube works the partitions out, and never shows none (A4)', async () => {
    const { asks } = serve([
      Response.json(
        { error: 'Cube is still working out the partitions of x.', pending: true },
        { status: 503 },
      ),
      PARTITIONED,
    ]);
    shown();

    expect(text(await screen.findByText(/Cube is still working out its partitions/))).toContain(
      'Asking again…',
    );
    // Under its Partitions head, over skeleton rows, as A4 draws it (T611).
    expect(text(screen.getByRole('heading', { name: 'Partitions' }))).toBe('Partitions');
    expect(document.querySelectorAll('.partitions--pending .jobs-skeleton__bar')).toHaveLength(3);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    // Build all needs no list; Rebuild selected waits for it (A4).
    // In use: neither disabled nor, since T611, marked out of use.
    const buildAll = screen.getByRole<HTMLButtonElement>('button', { name: 'Build all' });
    expect([buildAll.disabled, buildAll.getAttribute('aria-disabled')]).toEqual([false, 'false']);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: /^Rebuild 0 selected/ }).disabled,
    ).toBe(true);
    await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    expect(asks()).toBeGreaterThanOrEqual(2);
  });

  /** T611 follow-up (AC-176; sheets.spec): an action focused as the list comes keeps focus, not lost under a sheet. */
  it('keeps each action, and focus on it, from while the partitions are read to once they are', async () => {
    serve([
      Response.json(
        { error: 'Cube is still working out the partitions of x.', pending: true },
        { status: 503 },
      ),
      PARTITIONED,
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Partitions id={ID} name={NAME} pollMs={20}>
          <a href="/model">Open in Model</a>
        </Partitions>
      </QueryClientProvider>,
    );
    const buildAll = await screen.findByRole('button', { name: 'Build all' });
    const model = screen.getByRole('link', { name: 'Open in Model' });
    buildAll.focus();

    await screen.findByRole('table', { name: `Partitions of ${NAME}` });

    // The same elements, the list's count now on Build all, and focus where it was.
    expect(screen.getByRole('button', { name: 'Build all 6' })).toBe(buildAll);
    expect(screen.getByRole('link', { name: 'Open in Model' })).toBe(model);
    expect(document.activeElement).toBe(buildAll);
  });

  it('keeps Build all and its other actions, Open in Model, while its partitions can’t be read', async () => {
    const { posted } = serve([Response.json({ error: 'Cube didn’t answer.' }, { status: 502 })]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Partitions id={ID} name={NAME} pollMs={60_000}>
          <a href="/model">Open in Model</a>
        </Partitions>
      </QueryClientProvider>,
    );

    expect(text(await screen.findByText('Cube didn’t answer.'))).toBe('Cube didn’t answer.');
    expect(screen.getByRole('link', { name: 'Open in Model' }).getAttribute('href')).toBe('/model');
    // Build all needs no list (A4), so it's offered still: AC-228's Build action (T375's review).
    await userEvent.click(screen.getByRole('button', { name: 'Build all' }));
    expect(posted).toEqual([{ preAggregation: ID }]);
  });

  it('says which partitions Cube didn’t start, and when it started none', async () => {
    serve([PARTITIONED]);
    const onStarted = shown();
    const table = await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Sep 2026, Built' }));
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Jan 2026, Not built' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/builds'
          ? Response.json({
              tokens: ['t1'],
              runId: 'run-1',
              notStarted: [{ start: '2026-01-01T00:00:00.000', error: 'No partition meets it.' }],
            })
          : Response.json(PARTITIONED),
      ),
    );

    await userEvent.click(
      screen.getByRole('button', { name: `Rebuild 2 selected partitions of ${NAME}` }),
    );
    expect(text(await screen.findByText(/^Cube didn’t start/))).toBe(
      'Cube didn’t start Jan 2026: No partition meets it.',
    );
    // What it did start, said in the toast: Sep 2026 alone.
    expect(onStarted).toHaveBeenLastCalledWith(
      expect.objectContaining({ said: `Rebuilding Sep 2026 of ${NAME}` }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/builds'
          ? Response.json({ tokens: [] })
          : Response.json(PARTITIONED),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Build all 6' }));
    expect(text(await screen.findByText(/^Cube started no job/))).toBe(
      `Cube started no job: no partition of ${NAME} was built.`,
    );
  });
});

/** T611 (design 16, pin 13): when the pane's Status says its newest failure was. */
describe('when a rollup’s newest failure was (T611, T477)', () => {
  const failedOn = (...at: Date[]) =>
    failedAtOf({
      kind: 'partitioned',
      granularity: 'month',
      partitions: at.map((each) => ({ failed: { at: each.toISOString() } })),
    } as unknown as PartitionsAnswer);

  it('is "at 05:05" today, as the design draws it, the newest of several', () => {
    expect(failedOn(new Date(2026, 9, 8, 4, 0), new Date(2026, 9, 8, 5, 5))).toBe('at 05:05');
  });

  it('names an earlier day, never a bare clock read as today’s', () => {
    expect(failedOn(new Date(2026, 9, 7, 5, 5))).toBe('yesterday 05:05');
    expect(failedOn(new Date(2026, 9, 2, 5, 5))).toBe('2 Oct 05:05');
  });

  it('is nothing where no partition failed', () => {
    expect(failedOn()).toBeUndefined();
  });
});
