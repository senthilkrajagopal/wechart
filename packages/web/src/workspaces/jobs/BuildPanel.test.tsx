import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exactOf } from '../../shell/formatTime';
import { BuildPanel } from './BuildPanel';
import { JobsPage } from './JobsPage';

/**
 * T550 / AC-391 (design 16, screen 1 pins 5–9): each pre-aggregation's row
 * shows the state of its partitions that most needs attention, as an icon and
 * words — failed, then building, queued, stalled, partly built (n of N), not
 * built, built — whoever started the builds; when Cube last built it; who
 * started that build from wechart, or "—"; and how many partitions it has;
 * with a line under the table saying what the last two mean. The
 * session-only "Not built here" is gone.
 *
 * T239 / AC-229: … SHALL show a started build's progress in that row: the
 * row's state is read again while anything of it is queued or building.
 */
const ID = 'monthly_orders.by_status_month';
const ROW = {
  id: ID,
  type: 'rollup',
  partitionGranularity: 'month',
  trigger: 'Every 1 hour',
  fileName: 'cubes/monthly_orders.yml',
  state: 'built',
  partitions: 8,
  lastBuiltAt: '2026-10-02T12:01:00.000Z',
  startedBy: null,
};
type Row = Record<string, unknown>;

/** Its partitions, as the pane reads them (T375): one, built. */
const PARTITIONS = {
  id: ID,
  name: ID,
  kind: 'partitioned',
  granularity: 'month',
  partitions: [
    {
      tableName: 't_20260801',
      start: '2026-08-01T00:00:00.000',
      end: '2026-08-31T23:59:59.999',
      state: 'built',
      lastBuiltAt: '2026-10-02T12:00:00.000Z',
    },
  ],
};

/**
 * The API: the list answered with each of `lists` in turn, the last one
 * again after that; every list read and build start kept.
 */
function api(lists: Row[][], recent: Row[] = [], tokens: string[] = ['78f5612']) {
  const asked: string[] = [];
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/preaggregations')
        return Response.json(lists.length > 1 ? lists.shift() : lists[0]);
      if (url === '/api/builds') {
        posted.push(JSON.parse(String(init?.body)));
        return Response.json(tokens.length === 0 ? { tokens } : { tokens, runId: 'run-1' });
      }
      if (url.startsWith('/api/jobs/partitions')) return Response.json(PARTITIONS);
      if (url.startsWith('/api/jobs/builds'))
        return Response.json({ records: recent, starters: [], folders: [] });
      if (url === '/api/jobs/queue') return Response.json({ entries: [], everyFolder: true });
      if (url.startsWith('/api/jobs/queries/page')) return Response.json({ records: [], total: 0 });
      if (url === '/api/meta') return Response.json({ cubes: [] });
      if (url === '/api/cube-health') return Response.json({ cube: 'healthy', worker: 'healthy' });
      if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
  return { asked, posted, lists: () => asked.filter((url) => url === '/api/preaggregations') };
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function shown(
  lists: Row[][],
  selectedFirst: string | null = null,
  recent: Row[] = [],
  tokens?: string[],
) {
  const served = api(lists, recent, tokens);
  render(
    <QueryClientProvider client={client()}>
      <BuildPanel pollMs={10} selectedFirst={selectedFirst} />
    </QueryClientProvider>,
  );
  return served;
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';
const rowOf = async (name: string) =>
  (await screen.findByRole('cell', { name })).closest('tr') as HTMLElement;
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('each pre-aggregation’s row (T550, AC-391)', () => {
  it('shows its state, when Cube last built it, who started that build, and its partitions, as design 16 heads them', async () => {
    shown([
      [
        {
          ...ROW,
          state: 'failed',
          stateAt: '2026-08-01T00:00:00.000',
          startedBy: { kind: 'person', key: 'wren', name: 'Wren Writer' },
        },
      ],
    ]);

    const row = await rowOf(ID);
    expect(
      within(screen.getByRole('table', { name: 'Pre-aggregations' }))
        .getAllByRole('columnheader')
        .map((header) => text(header)),
    ).toEqual([
      'Pre-aggregation',
      // Each row's folder, after its name (T559; design 16, pin 4).
      'Folder',
      'Status',
      'Last built',
      'Started by',
      'Trigger',
      'Partitions',
      'Build',
    ]);
    const state = within(row).getByTestId('row-state');
    expect(text(state)).toBe('Failed · Aug 2026');
    expect(state.querySelector('svg')?.getAttribute('data-icon')).toBe('err');
    // The root's folder reads Shared (T559).
    expect(text(cellsOf(row)[1])).toBe('Shared');
    const built = cellsOf(row)[3]!.querySelector('time');
    expect(built?.getAttribute('dateTime')).toBe('2026-10-02T12:01:00.000Z');
    // The exact local time with UTC beside it (T477; the coordinator's Q9).
    expect(built?.getAttribute('title')).toBe(exactOf(new Date('2026-10-02T12:01:00.000Z')));
    expect(built?.getAttribute('title')).toContain('12:01:00 UTC');
    expect(text(within(row).getByTestId('starter'))).toBe('Wren Writer');
    expect(text(cellsOf(row)[5])).toBe('Every 1 hour');
    expect(text(cellsOf(row)[6])).toBe('8');
    // What Last built and Started by mean, under the table (pin 9).
    expect(text(screen.getByTestId('jobs-foot'))).toContain('“—” means wechart didn’t start it.');
    expect(screen.queryAllByText('Not built here')).toHaveLength(0);
    // No page speaks of phases (UX-111; T551's review).
    expect(text(screen.getByTestId('jobs-foot'))).not.toMatch(/\bphase\b/i);
  });

  it.each([
    [{ state: 'failed', stateAt: null, partitions: null }, 'err', 'Failed · whole'],
    [{ state: 'building', stateAt: '2026-10-01T00:00:00.000' }, 'run', 'Building · Oct 2026'],
    [{ state: 'queued', stateAt: '2026-09-01T00:00:00.000' }, 'idle', 'Queued · Sep 2026'],
    [{ state: 'stalled', stateAt: '2026-07-01T00:00:00.000' }, 'warn', 'Stalled · Jul 2026'],
    [{ state: 'partly', built: 7 }, 'part', 'Partly built · 7 of 8'],
    [{ state: 'not-built', lastBuiltAt: null }, 'off', 'Not built'],
    [{ state: 'built' }, 'ok', 'Built'],
    // Cube still working its partitions out: never read as not built (A4).
    [{ state: null, pending: true }, 'run', 'Asking Cube…'],
  ])('reads %o with its icon, %s, and its words, “%s”', async (over, icon, words) => {
    shown([[{ ...ROW, ...over }]]);

    const state = within(await rowOf(ID)).getByTestId('row-state');
    expect(text(state)).toBe(words);
    expect(state.querySelector('svg')?.getAttribute('data-icon')).toBe(icon);
  });

  it('says “—” for a build wechart didn’t start, a time never built, and partitions of one not partitioned', async () => {
    shown([[{ ...ROW, state: 'not-built', lastBuiltAt: null, partitions: null }]]);

    // After Pre-aggregation and its Folder (T559): Last built, Started by, Partitions.
    const cells = cellsOf(await rowOf(ID));
    expect(text(cells[3])).toBe('—');
    expect(text(cells[4])).toBe('—');
    expect(text(cells[6])).toBe('—');
  });

  it('draws a Trigger of Not scheduled with its icon, as Schedules does (design 16, pin 8)', async () => {
    shown([[{ ...ROW, trigger: 'Not scheduled', triggerKind: 'not-scheduled' }]]);

    const trigger = cellsOf(await rowOf(ID))[5]!;
    expect(text(trigger)).toBe('Not scheduled');
    expect(trigger.querySelector('svg')?.getAttribute('data-icon')).toBe('off');
  });

  it('names a wechart schedule that started its newest build, with the schedule’s icon', async () => {
    shown([[{ ...ROW, startedBy: { kind: 'schedule', id: 's-close', name: 'Month-end close' } }]]);

    const starter = within(await rowOf(ID)).getByTestId('starter');
    expect(text(starter)).toBe('Month-end close');
    expect(starter.querySelector('svg')?.getAttribute('data-icon')).toBe('schedule');
  });

  it('says when xcube couldn’t say its state, in xcube’s words on hover, and keeps its Build', async () => {
    shown([[{ ...ROW, state: null, unreadable: 'xcube answered 500: Too many partitions' }]]);

    const row = await rowOf(ID);
    const state = within(row).getByTestId('row-state');
    expect(text(state)).toBe('Couldn’t read its state');
    expect(state.querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
    expect(state.getAttribute('title')).toBe('xcube answered 500: Too many partitions');
    expect(within(row).getAllByRole('button', { name: `Build ${ID}` })).toHaveLength(1);
  });

  it('says so when Cube started no job for a Build', async () => {
    shown([[ROW]], null, [], []);

    await userEvent.click(within(await rowOf(ID)).getByRole('button', { name: `Build ${ID}` }));
    expect(text(await screen.findByText(/^Cube started no job/))).toBe(
      `Cube started no job: no partition of ${ID} was built.`,
    );
  });

  it('reads others’ builds under way now and then, not as often as one started here', async () => {
    const { lists } = shown([[{ ...ROW, state: 'building', stateAt: '2026-08-01T00:00:00.000' }]]);

    await rowOf(ID);
    const read = lists().length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(lists().length).toBe(read);
  });

  it('says a lambda has no partitions of its own, and offers no Build of it', async () => {
    shown([
      [
        {
          ...ROW,
          id: 'monthly_orders.recent',
          type: 'rollupLambda',
          buildable: false,
          state: null,
        },
      ],
    ]);

    const row = await rowOf('monthly_orders.recent');
    expect(text(cellsOf(row)[2])).toBe('No partitions of its own');
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('a started build’s progress in its row (T239, AC-229)', () => {
  /** A row as the API answers it for ten reads in a row: long enough to be seen. */
  const held = (row: Row): Row[][] => Array.from({ length: 10 }, () => [row]);

  it('reads the row again while it builds, from queued to building to built, by whom', async () => {
    const { posted, lists } = shown([
      [ROW],
      ...held(ROW),
      ...held({ ...ROW, state: 'queued', stateAt: '2026-08-01T00:00:00.000' }),
      ...held({ ...ROW, state: 'building', stateAt: '2026-08-01T00:00:00.000' }),
      [
        {
          ...ROW,
          lastBuiltAt: '2026-10-02T12:05:00.000Z',
          startedBy: { kind: 'person', key: 'admin', name: 'admin' },
        },
      ],
    ]);

    const row = await rowOf(ID);
    await userEvent.click(within(row).getByRole('button', { name: `Build ${ID}` }));
    expect(posted).toEqual([{ preAggregation: ID }]);

    const state = () => within(row).getByTestId('row-state');
    await vi.waitFor(() => {
      expect(state().getAttribute('data-state')).toBe('queued');
    });
    await vi.waitFor(() => {
      expect(state().getAttribute('data-state')).toBe('building');
    });
    await vi.waitFor(() => {
      expect(text(within(row).getByTestId('starter'))).toBe('admin');
    });
    expect(text(state())).toBe('Built');

    // Built, nothing under way: read again only now and then, not at once.
    const read = lists().length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(lists().length).toBe(read);
  });

  it('keeps reading it while the user looks at the Queries tab and back', async () => {
    api([
      [ROW],
      [ROW],
      ...held({ ...ROW, state: 'building', stateAt: '2026-08-01T00:00:00.000' }),
      [{ ...ROW, lastBuiltAt: '2026-10-02T12:05:00.000Z' }],
    ]);
    render(
      <QueryClientProvider client={client()}>
        <JobsPage pollMs={10} />
      </QueryClientProvider>,
    );

    const row = await rowOf(ID);
    await userEvent.click(within(row).getByRole('button', { name: `Build ${ID}` }));
    await vi.waitFor(() => {
      expect(within(row).getByTestId('row-state').getAttribute('data-state')).toBe('building');
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Queries' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Pre-aggregations' }));

    await vi.waitFor(() => {
      expect(within(row).getByTestId('row-state').getAttribute('data-state')).toBe('built');
    });
    expect(cellsOf(row)[3]!.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-10-02T12:05:00.000Z',
    );
  });
});

describe('a folder’s pre-aggregation (T371, AC-297; §P2.6 D)', () => {
  it('shows it by its short name with its folder, and builds it by its published name', async () => {
    const { posted } = shown([
      [
        {
          ...ROW,
          id: 'fa1__sales.main',
          folderId: 'a1',
          shortName: 'sales',
          folderPath: ['Shared', 'Sales', 'EMEA'],
        },
      ],
    ]);

    const name = await screen.findByTestId('preagg-name');
    expect(name.textContent).toBe('sales.main');
    expect(screen.getByTestId('preagg-folder').textContent).toBe('Sales / EMEA');
    expect(screen.queryByText('fa1__sales.main')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Build sales.main in Sales / EMEA' }));
    expect(posted).toEqual([{ preAggregation: 'fa1__sales.main' }]);
  });
});

describe('the pane (AC-228, AC-245; T469, T375)', () => {
  /** T273 / AC-245: Data as of › Open in Jobs names the pre-aggregation in the address. */
  it('opens on the pre-aggregation it is asked for, its state as its row has it', async () => {
    shown([[{ ...ROW, state: 'queued', stateAt: '2026-09-01T00:00:00.000' }]], ID);

    const row = await rowOf(ID);
    expect(row.getAttribute('aria-selected')).toBe('true');
    const pane = screen.getByRole('complementary', { name: 'Pre-aggregation details' });
    expect(text(await within(pane).findByTestId('pane-state'))).toBe('Queued · Sep 2026');
  });

  /**
   * T469, UX-080/UX-081 (the phase-1 re-check): the pane is headed by its
   * name, its actions are small, and "Open in Model" opens the file on its
   * Pre-aggs tab with this pre-aggregation open — by the cube's name as its
   * file declares it, a folder's by its short name.
   */
  it('heads the pane with its name; Open in Model deep-links to it in its file', async () => {
    shown(
      [
        [
          ROW,
          {
            ...ROW,
            id: 'fa1__sales.main',
            folderId: 'a1',
            shortName: 'sales',
            folderPath: ['Shared', 'Sales'],
            fileName: 'cubes/sales.yml',
            fileFolderId: 'a1',
          },
        ],
      ],
      ID,
    );
    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });
    const head = await within(pane).findByTestId('pane-head');
    expect(within(head).getByRole('heading', { level: 2 }).textContent).toBe(ID);
    expect(
      (await within(pane).findByRole('link', { name: 'Open in Model' })).getAttribute('href'),
    ).toBe(
      '/model/files/cubes%2Fmonthly_orders.yml?cube=monthly_orders&tab=pre_aggregations&member=by_status_month',
    );
    expect(within(pane).getByRole('button', { name: /^Build all/ }).className).toContain('btn-sm');
    // A button, not an underlined link, as the prototype's btn sm (T469's review).
    expect(within(pane).getByRole('link', { name: 'Open in Model' }).className).toBe('btn btn-sm');
    // Its name in the list is plain text; the pane's Open in Model is the way
    // there (the user, 2026-09-28: UX-080, AC-229 amended, R47).
    expect(
      screen.getAllByTestId('preagg-name').map((name) => [name.tagName, name.getAttribute('href')]),
    ).toEqual([
      ['SPAN', null],
      ['SPAN', null],
    ]);

    // A folder's opens its own file in its folder (T530, AC-222).
    await userEvent.click(
      screen
        .getAllByTestId('preagg-folder')
        .find((cell) => text(cell) === 'Sales')
        ?.closest('tr') as HTMLElement,
    );
    expect(
      (await within(pane).findByRole('link', { name: 'Open in Model' })).getAttribute('href'),
    ).toBe(
      '/explore/folders/a1/models/cubes%2Fsales.yml?cube=sales&tab=pre_aggregations&member=main',
    );
  });

  it('lists the builds started from wechart, with the way to all of them in Run history', async () => {
    shown([[ROW]], ID);

    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });
    expect(text(await within(pane).findByText(/^None yet\./))).toContain(
      'Builds started here, or by a wechart schedule',
    );
    expect(
      within(pane)
        .getByRole('link', { name: 'All its builds in Run history' })
        .getAttribute('href'),
    ).toBe(`/jobs?tab=history&preagg=${ID}`);
  });

  it('shows its last three builds started from wechart, each with its outcome and starter (pin 14)', async () => {
    const build = (id: string, outcome: string) => ({
      id,
      preAggregation: ID,
      name: ID,
      folderId: 'root',
      folderPath: ['Shared'],
      partitions: null,
      granularity: 'month',
      jobs: 8,
      via: 'build-all',
      starter: { kind: 'person', key: 'admin', name: 'admin' },
      startedAt: '2026-10-02T12:05:12.000Z',
      endedAt: '2026-10-02T12:05:20.000Z',
      durationMs: 8_000,
      outcome,
      failedCount: outcome === 'failed' ? 1 : 0,
      error: null,
      progress: { done: 8, building: 0 },
    });
    shown([[ROW]], ID, [
      build('r4', 'done'),
      build('r3', 'failed'),
      build('r2', 'done'),
      build('r1', 'done'),
    ]);

    const recent = await screen.findByRole('table', { name: 'Builds started from wechart' });
    const rows = within(recent).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => text(within(row).getByTestId('build-outcome')))).toEqual([
      'Done',
      'Failed · 1 of 8',
      'Done',
    ]);
    expect(text(rows[0])).toContain('All 8');
    expect(text(within(rows[0]!).getByTestId('starter'))).toBe('admin');
  });
});
