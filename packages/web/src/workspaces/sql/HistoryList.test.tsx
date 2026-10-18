import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryList, type HistoryRun } from './HistoryList';

/**
 * T817 (AC-381, AC-452): History in the SQL runner workspace's right pane
 * lists the user's own runs, all of them by default and the open tab's data
 * source's with "This data source", newest first, 50 at a time; each with
 * its state as an icon and the label its tab and result head use, its row
 * count, time, SQL, parameter values, and data source and folder; and a row
 * on a source the user can no longer run SQL on reads "A data source no
 * longer available to you", naming neither.
 */
const EMEA = {
  id: 'emea',
  name: 'emea_replica',
  folderPath: [
    { id: 'f-sales', title: 'Sales' },
    { id: 'f-emea', title: 'EMEA' },
  ],
  inWorkspace: false,
};
const run = (over: Partial<HistoryRun> & Pick<HistoryRun, 'id' | 'sql'>): HistoryRun => ({
  dataSource: EMEA,
  cubeStore: false,
  startedAt: '2026-10-18T14:32:00Z',
  outcome: 'finished',
  rowCount: 1284,
  durationMs: 840,
  truncated: null,
  statement: 'select',
  parameters: [],
  ...over,
});

let asked: string[] = [];
let answers: Record<string, { runs: HistoryRun[]; next?: string }> = {};
beforeEach(() => {
  asked = [];
  answers = {
    '/api/sql-runs': {
      runs: [
        run({
          id: 'r1',
          sql: 'SELECT * FROM orders WHERE region = {{region}}',
          parameters: [{ name: 'region', type: 'text', value: 'EMEA' }],
        }),
        run({ id: 'r2', sql: 'SELECT 1', dataSource: null, cubeStore: true, rowCount: 1 }),
        run({
          id: 'r3',
          sql: 'SELECT * FROM gl.postings',
          dataSource: { id: 'mine', name: 'my_copy', folderPath: null, inWorkspace: true },
          truncated: 'rows',
          rowCount: 10000,
        }),
        run({ id: 'r4', sql: 'SELECT secret', dataSource: null, unavailable: true, outcome: 'failed', rowCount: null }),
      ],
      next: 'cursor-1',
    },
    '/api/sql-runs?after=cursor-1': { runs: [run({ id: 'r5', sql: 'SELECT older', outcome: 'refused', statement: 'delete', rowCount: null })] },
    '/api/sql-runs?dataSource=emea': { runs: [run({ id: 'r1', sql: 'SELECT * FROM orders WHERE region = {{region}}' })] },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      const answer = answers[url];
      return Promise.resolve(
        answer === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(answer), { status: 200 }),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(sourceId = 'emea') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HistoryList sourceId={sourceId} />
    </QueryClientProvider>,
  );
}
const rows = () => within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');

describe('History in the workspace (T817, AC-381, AC-452)', () => {
  it('starts on All, asking for every run, newest first, only the user’s', async () => {
    open();
    await screen.findByText('SELECT 1');
    expect(asked[0]).toBe('/api/sql-runs');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveProperty('checked', true);
    expect(screen.getByText('Only you can see these · newest first')).toBeTruthy();
    expect(rows()).toHaveLength(4);
  });

  it('gives each row its state as an icon and a label, its rows, time, SQL, values, and source with its folder', async () => {
    open();
    await screen.findByText('SELECT 1');
    const [first, cube, mine] = rows();
    const state = within(first!).getByText('Finished');
    expect(state.closest('.status')?.querySelector('svg')).not.toBeNull();
    expect(within(first!).getByText('1,284 rows')).toBeTruthy();
    expect(within(first!).getByRole('time').getAttribute('datetime')).toBe('2026-10-18T14:32:00Z');
    expect(within(first!).getByText('SELECT * FROM orders WHERE region = {{region}}')).toBeTruthy();
    expect(within(first!).getByText('region = EMEA')).toBeTruthy();
    expect(within(first!).getByText('emea_replica · Shared / Sales / EMEA')).toBeTruthy();
    expect(within(cube!).getByText('Cube Store')).toBeTruthy();
    // The label a tab and its result head use for the same run (runState).
    expect(within(mine!).getByText('Limited to 10,000 rows')).toBeTruthy();
    expect(within(mine!).getByText('my_copy · My workspace')).toBeTruthy();
  });

  it('reads “A data source no longer available to you” for a source the user can no longer run SQL on', async () => {
    open();
    await screen.findByText('SELECT secret');
    const lost = rows()[3]!;
    expect(within(lost).getByText('A data source no longer available to you')).toBeTruthy();
    expect(within(lost).getByText('Database error')).toBeTruthy();
  });

  it('narrows to the open tab’s data source with “This data source”, and back', async () => {
    open('emea');
    await screen.findByText('SELECT 1');
    await userEvent.click(screen.getByRole('radio', { name: 'This data source' }));
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(1);
    });
    expect(asked).toContain('/api/sql-runs?dataSource=emea');
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
  });

  it('offers no “This data source” while the open tab has none', async () => {
    open('');
    await screen.findByText('SELECT 1');
    expect(screen.getByRole('radio', { name: 'This data source' })).toHaveProperty('disabled', true);
  });

  it('shows older runs 50 at a time', async () => {
    open();
    await screen.findByText('SELECT 1');
    await userEvent.click(screen.getByRole('button', { name: 'Show older runs' }));
    expect(await screen.findByText('SELECT older')).toBeTruthy();
    expect(within(rows()[4]!).getByText('Not run')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show older runs' })).toBeNull();
  });

  it('shows the user’s run going first, in the state its tab shows, under All and on its own source (AC-452)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const going = {
      sql: 'SELECT pg_sleep(4)',
      sourceId: 'emea',
      at: Date.parse('2026-10-18T14:40:00Z'),
      state: { kind: 'run' as const, label: 'Running · 3 s of 30', rows: null },
      place: 'emea_replica · Shared / Sales / EMEA',
    };
    const view = render(
      <QueryClientProvider client={client}>
        <HistoryList sourceId="emea" going={going} />
      </QueryClientProvider>,
    );
    await screen.findByText('SELECT 1');
    const first = rows()[0]!;
    expect(within(first).getByText('Running · 3 s of 30').closest('.status')?.querySelector('svg')?.getAttribute('data-icon')).toBe('run');
    expect(within(first).getByText('SELECT pg_sleep(4)')).toBeTruthy();
    expect(within(first).getByText('emea_replica · Shared / Sales / EMEA')).toBeTruthy();
    // On another source's tab, with This data source, it isn't that source's.
    view.rerender(
      <QueryClientProvider client={client}>
        <HistoryList sourceId="fx" going={going} />
      </QueryClientProvider>,
    );
    answers['/api/sql-runs?dataSource=fx'] = { runs: [] };
    await userEvent.click(screen.getByRole('radio', { name: 'This data source' }));
    expect(await screen.findByText('No runs yet.')).toBeTruthy();
    expect(screen.queryByText('SELECT pg_sleep(4)')).toBeNull();
  });

  it('says the user’s last Cube Store run, stopped, as still finishing while xcube says so, as its tab does (T817’s review, AC-452)', async () => {
    answers['/api/sql-runs'] = {
      runs: [
        run({ id: 'c2', sql: 'SELECT slow', dataSource: null, cubeStore: true, outcome: 'timeout', rowCount: 0 }),
        run({ id: 'c1', sql: 'SELECT older', dataSource: null, cubeStore: true, outcome: 'cancelled', rowCount: 0 }),
      ],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HistoryList sourceId="" stillFinishing={{ endsBy: null }} />
      </QueryClientProvider>,
    );
    await screen.findByText('SELECT slow');
    const [last, older] = rows();
    expect(within(last!).getByText('Cube Store still finishing').closest('.status')?.querySelector('svg')?.getAttribute('data-icon')).toBe('run');
    // Only the last: an older one ended long since.
    expect(within(older!).getByText('Cancelled')).toBeTruthy();
  });

  it('hands a chosen row, by click or Enter, to the workspace, and sends nothing (T818, AC-465)', async () => {
    const chosen: string[] = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HistoryList
          sourceId="emea"
          onChoose={(each) => {
            chosen.push(each.id);
          }}
        />
      </QueryClientProvider>,
    );
    const first = await screen.findByRole('button', { name: /SELECT \* FROM orders WHERE region/ });
    await userEvent.click(first);
    const lost = screen.getByRole('button', { name: /SELECT secret/ });
    lost.focus();
    await userEvent.keyboard('{Enter}');
    expect(chosen).toEqual(['r1', 'r4']);
    expect(asked.every((url) => url.startsWith('/api/sql-runs'))).toBe(true);
  });

  it('says so when there are none', async () => {
    answers['/api/sql-runs'] = { runs: [] };
    open();
    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });
});
