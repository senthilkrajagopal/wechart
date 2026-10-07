import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Partitions } from './Partitions';

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
    part('10', 'building'),
    part('09', 'built'),
    part('08', 'failed', {
      failed: { runId: 'r1', at: '2026-10-02T12:05:00.000Z', serving: '2026-10-02T12:01:00.000Z' },
    }),
    part('07', 'queued', { startedBy: { kind: 'person', key: 'w', name: 'Wren Writer' } }),
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

function shown(onStarted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Partitions id={ID} name={NAME} pollMs={20} onStarted={onStarted} />
    </QueryClientProvider>,
  );
  return onStarted;
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(text(within(rows[0]!).getByTestId('partition-state'))).toBe('Building');
    expect(text(within(rows[3]!).getByTestId('partition-state'))).toBe('Queued · Wren Writer');
    expect(text(within(rows[4]!).getByTestId('partition-state'))).toBe('Stalled');
    expect(text(within(rows[5]!).getByTestId('partition-state'))).toBe('Not built');
    expect(text(rows[5]!.querySelector('td:last-child'))).toBe('—');
    // Failed, when, and the build it still serves (pin 12).
    expect(text(rows[2])).toContain(`Failed · ${clock('2026-10-02T12:05:00.000Z')}`);
    expect(text(rows[2])).toContain(`Serving the build of ${clock('2026-10-02T12:01:00.000Z')}`);
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
        name: `Aug 2026, Failed at ${clock('2026-10-02T12:05:00.000Z')}`,
      }),
    );
    const all = within(table).getByRole<HTMLInputElement>('checkbox', {
      name: 'Select all 6 partitions',
    });
    expect(all.indeterminate).toBe(true);

    await userEvent.click(
      screen.getByRole('button', { name: `Rebuild 2 selected partitions of ${NAME}` }),
    );
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
    expect(document.querySelectorAll('.sheet-foot')).toHaveLength(0);
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
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    // Build all needs no list; Rebuild selected waits for it (A4).
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Build all' }).disabled).toBe(
      false,
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: /^Rebuild 0 selected/ }).disabled,
    ).toBe(true);
    await screen.findByRole('table', { name: `Partitions of ${NAME}` });
    expect(asks()).toBeGreaterThanOrEqual(2);
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
