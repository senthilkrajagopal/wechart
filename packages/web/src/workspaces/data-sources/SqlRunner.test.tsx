import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exactOf, whenOf } from '../../shell/formatTime';
import { SqlTab, type SqlRunnerState, type SqlSource } from './SqlRunner';

/**
 * T535 (AC-373, AC-377, AC-378, AC-379, AC-380, AC-381, AC-383, AC-385,
 * AC-387; design 15's screens 1 and 2, states A–I): the SQL tab on a data
 * source's page, against a stubbed API.
 *
 * T823 (AC-464, AC-373; design 17's N): on a data source's page the tab,
 * renamed "SQL runner", holds the off panel or the switch's record, with
 * Turn off and who may run, plus "Open in SQL runner", and no editor; the
 * runner itself is the SQL runner workspace's. Cube Store's own page keeps
 * its runner (design 17's table: "Unchanged"), whose tests here run on it.
 */
const ON: SqlRunnerState = {
  on: true,
  confirmedBy: { name: 'Ada Admin' },
  confirmedAt: '2026-10-01T09:12:00.000Z',
  tab: true,
  runs: true,
};
const OFF: SqlRunnerState = {
  on: false,
  tab: true,
  runs: false,
  why: 'The SQL runner is off for this data source: a Super-Admin turns it on.',
};
const SOURCE: SqlSource = {
  id: 'ds-1',
  version: 1,
  name: 'emea_replica',
  driver: 'postgres',
  fields: { host: 'pg-replica-1', port: 5432, database: 'sales', user: 'cube_reader' },
  folderPath: [
    { id: 'sales', title: 'Sales' },
    { id: 'emea', title: 'EMEA' },
  ],
  inWorkspace: false,
  sqlRunner: ON,
};
/** Cube Store, whose own page keeps the runner (T536; design 17's table). */
const CUBE: SqlSource = {
  cubeStore: true,
  id: 'cubestore',
  version: 0,
  name: 'Cube Store',
  folderPath: [],
  inWorkspace: false,
  sqlRunner: ON,
};
const FINISHED = {
  outcome: 'finished',
  columns: [
    { name: 'order_id', type: 'int8' },
    { name: 'status', type: 'text' },
  ],
  rows: [
    ['100482', 'shipped'],
    ['100590', null],
  ],
  rowCount: 2,
  truncated: null,
  durationMs: 840,
  statement: 'select',
};

/** The API, as the tab asks it: each `/sql` answered as told, the rest as here. */
type Answer = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
function serve({
  answers = [{ status: 200, body: FINISHED }],
  runs = [] as Record<string, unknown>[],
  going = null as Record<string, unknown> | null,
  cancelled = { status: 200, body: { cancelled: true } } as Answer,
  switched = [] as Answer[],
}: {
  answers?: Answer[];
  runs?: Record<string, unknown>[];
  going?: Record<string, unknown> | null;
  /** The cancel route's answer. */
  cancelled?: Answer;
  /** The switch's answers, in turn; `{ on }` as asked once these run out. */
  switched?: Answer[];
} = {}) {
  const asked: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      asked.push({ url, method, body });
      if (url.endsWith('/sql') && method === 'POST') {
        const next = answers.shift() ?? { status: 200, body: FINISHED };
        const { status, body: sent } = await next;
        return Response.json(sent, { status });
      }
      if (url === '/api/sql-runs/going') return Response.json({ going });
      if (url === '/api/sql-runs/cancel') {
        const { status, body: sent } = await cancelled;
        return Response.json(sent, { status });
      }
      if (url.startsWith('/api/sql-runs')) return Response.json({ runs });
      // The schema browser's catalog (T539).
      if (url.endsWith('/catalog/schemas')) return Response.json({ schemas: [{ name: 'public' }] });
      if (url.includes('/catalog/tables?'))
        return Response.json({
          tables: [{ schema: 'public', name: 'orders', type: 'table', rawType: 'BASE TABLE' }],
          total: 1,
        });
      // The folder's groups, as the Access panel reads them (T698, SRC-21).
      if (url === '/api/folders/emea/access')
        return Response.json({
          folderId: 'emea',
          setting: { readOnly: null, readWrite: ['sales-emea-rw'] },
          effective: {
            readOnly: [],
            readWrite: [
              { group: 'sales-emea-rw', from: 'emea', setHere: true },
              { group: 'sales-rw', from: 'sales', setHere: false },
            ],
          },
          inherited: { readOnly: [], readWrite: [] },
          onlySuperAdmins: false,
        });
      if (url.endsWith('/sql-runner') && method === 'PUT') {
        const next = switched.shift();
        if (next === undefined) return Response.json({ on: (body as { on: boolean }).on });
        const { status, body: sent } = await next;
        return Response.json(sent, { status });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

/** Signed in, as the app's gate has already asked before any page shows. */
const ME = { name: 'Wanda Writer', identity: 'writer@example.com', groups: [], superAdmin: false };
function open(source: SqlSource = CUBE, superAdmin = false, me: object = ME) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['me'], { security: 'oidc', ...me });
  const tab = (shown: SqlSource) => (
    <QueryClientProvider client={client}>
      <SqlTab source={shown} superAdmin={superAdmin} />
    </QueryClientProvider>
  );
  const rendered = render(tab(source));
  /** The page shown again with what the API now says of it. */
  const reshow = (shown: SqlSource) => {
    rendered.rerender(tab(shown));
  };
  return { ...rendered, reshow };
}
const editorView = (container: HTMLElement) =>
  EditorView.findFromDOM(container.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
const typeSql = (container: HTMLElement, text: string) => {
  const view = editorView(container);
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
};
const sqlPosts = (asked: { url: string; method: string; body: unknown }[]) =>
  asked.filter((each) => each.url.endsWith('/sql') && each.method === 'POST');

beforeEach(() => {
  // jsdom has neither: the CSV's file is made from them.
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a data source page’s “SQL runner” tab, on (T823, AC-464, AC-373; design 17’s N1)', () => {
  it('holds the switch’s record, who may run and as whom, and “Open in SQL runner” on that source, with no editor', async () => {
    serve();
    const { container } = open(SOURCE);
    expect(screen.getByTestId('sql-switch').textContent).toContain(
      'SQL runner on · turned on by Ada Admin, who confirmed the login can only read',
    );
    // When, as every moment is written (T477, Q8): no comma, the year only
    // when it isn't this one's, the exact time with UTC on hover (Q9).
    const confirmedAt = new Date(ON.confirmedAt!);
    const when = screen.getByTestId('sql-switch').querySelector('time')!;
    expect(when.textContent).toBe(whenOf(confirmedAt));
    expect(when.getAttribute('title')).toBe(exactOf(confirmedAt));
    // Who may run, the folder's read-write groups named once read, and as whom.
    const who = container.querySelector('dl.sql-off__who')!;
    await waitFor(() => {
      expect([...who.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
        'Who may run SQL',
        'Runs as',
      ]);
      expect([...who.querySelectorAll('dd')].map((each) => each.textContent)).toEqual([
        'Super-Admins, and read-write members of Sales / EMEA: sales-emea-rw, sales-rw',
        'cube_reader on sales at pg-replica-1:5432',
      ]);
    });
    const link = screen.getByRole('link', { name: 'Open in SQL runner' });
    expect(link.getAttribute('href')).toBe('/sql?source=ds-1');
    // No editor, no Run, and no warning: those are the workspace's (AC-464).
    expect(container.querySelector('.sql-editor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.queryByTestId('sql-warning')).toBeNull();
    expect(screen.queryByRole('region', { name: 'My runs' })).toBeNull();
    // Turn off is a Super-Admin's alone.
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
  });

  it('offers a Super-Admin Turn off beside the record', () => {
    serve();
    open(SOURCE, true);
    expect(
      within(screen.getByTestId('sql-switch')).getByRole('button', { name: 'Turn off' }).textContent,
    ).toBe('Turn off');
    expect(screen.getByRole('link', { name: 'Open in SQL runner' }).getAttribute('href')).toBe(
      '/sql?source=ds-1',
    );
  });

  it('opens a source in My workspace with no switch, saying it is the owner’s, with “Open in SQL runner” (AC-383; design 17’s N3)', () => {
    serve();
    open({ ...SOURCE, inWorkspace: true, sqlRunner: { on: false, tab: true, runs: true } });
    expect(screen.getByTestId('sql-yours').textContent).toBe(
      'Yours: you may run SQL on your own data sources in My workspace, with no switch. Nobody else can.',
    );
    expect(screen.getByRole('link', { name: 'Open in SQL runner' }).getAttribute('href')).toBe(
      '/sql?source=ds-1',
    );
    expect(document.querySelector('.sql-editor')).toBeNull();
  });
});

describe('Cube Store’s SQL tab, the runner on (T535, T536)', () => {
  it('runs the SQL, and shows each column’s name and type, the rows and the time (AC-380)', async () => {
    const asked = serve();
    const { container } = open();
    typeSql(container, 'SELECT order_id, status FROM orders');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(sqlPosts(asked).map((each) => each.body)).toEqual([
      { sql: 'SELECT order_id, status FROM orders' },
    ]);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      '#',
      'order_idint8',
      'statustext',
    ]);
    expect(screen.getByTestId('sql-result-head').textContent).toMatch(
      /^Finished 2 rows · 0\.84 s · at /,
    );
  });

  it('downloads exactly the grid’s rows as a CSV, without running the SQL again (AC-380)', async () => {
    const asked = serve();
    const { container } = open();
    typeSql(container, 'SELECT 1');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    const made = vi.mocked(URL.createObjectURL);
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(made).toHaveBeenCalledTimes(1);
    const blob = made.mock.calls[0]![0] as Blob;
    expect(await blob.text()).toBe('order_id,status\r\n100482,shipped\r\n100590,\r\n');
    expect(sqlPosts(asked)).toHaveLength(1);
  });

  // Cancel, a cancelled run's rows and a failed Cancel were the data source
  // page's runner's (T535, T545): Cube Store has no Cancel (R64), and they are
  // the workspace's now (QueryTab.test.tsx, SqlWorkspace.test.tsx's T804).

  it('gives focus back to the editor when a run ends, and says a refusal whole to a screen reader (design 15, keyboard)', async () => {
    serve({
      answers: [
        {
          status: 400,
          body: {
            outcome: 'refused',
            error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
            reason: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
            statement: 'delete',
          },
        },
      ],
    });
    const { container } = open();
    typeSql(container, 'DELETE FROM orders');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByTestId('sql-result-note');
    expect(document.activeElement).toBe(editorView(container).contentDOM);
    await waitFor(() => {
      expect(container.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe(
        // As Cube Store says it (T536): a command, and nothing reached Cube Store.
        'Not run. Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE command. Nothing reached Cube Store.',
      );
    });
  });

  it('says no answer came back when the connection drops, rather than that it wasn’t run (T535’s review)', async () => {
    let drop: (error: Error) => void = () => undefined;
    serve({ answers: [new Promise((_resolve, reject) => (drop = reject))] });
    const { container } = open();
    typeSql(container, 'SELECT 1');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    drop(new TypeError('Failed to fetch'));
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^No answer at /);
    });
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'No answer came back, so whether it ran isn’t known. Try again.',
    );
  });

  it('describes the editor by the warning and the limits, so both are read on focus (design 15, keyboard)', () => {
    serve();
    const { container } = open();
    const described = editorView(container).contentDOM.getAttribute('aria-describedby') ?? '';
    expect(
      described.split(' ').map((id) => document.getElementById(id)?.textContent ?? `none: ${id}`),
    ).toEqual([
      'This SQL runs on Cube Store directly. It holds every folder’s rollups, and folder permissions and access policies don’t apply.',
      'SELECT or EXPLAIN, one statement · up to 10,000 rows, 10 MB, 30 seconds · one run at a time',
    ]);
  });

  it('keeps the editor’s text for the user who wrote it, not for the next one in the same tab (T535’s review)', () => {
    serve();
    const first = open();
    typeSql(first.container, 'SELECT secret FROM vault');
    first.unmount();
    const next = open(CUBE, false, { ...ME, name: 'Rae Reader', identity: 'reader@example.com' });
    expect(editorView(next.container).state.doc.toString()).toBe('');
    next.unmount();
    const again = open();
    expect(editorView(again.container).state.doc.toString()).toBe('SELECT secret FROM vault');
  });

  it('says a refused run wasn’t run, and why', async () => {
    serve({
      answers: [
        {
          status: 400,
          body: {
            outcome: 'refused',
            error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
            reason: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
            statement: 'delete',
          },
        },
      ],
    });
    const { container } = open();
    typeSql(container, 'DELETE FROM orders');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-note').textContent).toBe(
        'Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE command. Nothing reached Cube Store.',
      );
    });
  });

  it('runs only the selection, Run reading “Run selection”, from Run and from ⌘/Ctrl+Enter (AC-387)', async () => {
    const asked = serve({
      answers: [
        { status: 200, body: FINISHED },
        { status: 200, body: FINISHED },
      ],
    });
    const { container } = open();
    typeSql(container, 'SELECT 1;\nSELECT 2');
    const view = editorView(container);
    act(() => {
      view.dispatch({ selection: { anchor: 10, head: 18 } });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Run selection' }));
    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    act(() => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitFor(() => {
      expect(sqlPosts(asked).map((each) => each.body)).toEqual([
        { sql: 'SELECT 2' },
        { sql: 'SELECT 2' },
      ]);
    });
  });

  it('lists My runs, this data source’s by default, with All, and puts a run’s SQL back in the editor (AC-381)', async () => {
    const asked = serve({
      runs: [
        {
          id: 'r1',
          sql: 'SELECT count(*) FROM sales.customers',
          // Cube Store's runs have no data source (T536).
          dataSource: null,
          startedAt: '2026-10-01T14:32:00.000Z',
          outcome: 'finished',
          rowCount: 1,
          durationMs: 10,
          truncated: null,
          statement: 'select',
        },
      ],
    });
    const { container } = open();
    const pane = await screen.findByRole('region', { name: 'My runs' });
    await within(pane).findByText('SELECT count(*) FROM sales.customers');
    expect(asked.some((each) => each.url === '/api/sql-runs?dataSource=cubestore')).toBe(true);
    expect(within(pane).getByRole('radio', { name: 'This data source' })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(pane).getByText('Only you can see these · newest first')).toBeTruthy();

    await userEvent.click(within(pane).getByRole('button', { name: /SELECT count/ }));
    expect(editorView(container).state.doc.toString()).toBe('SELECT count(*) FROM sales.customers');

    await userEvent.click(within(pane).getByRole('radio', { name: 'All' }));
    await waitFor(() => {
      expect(asked.some((each) => each.url === '/api/sql-runs')).toBe(true);
    });
  });

  it('says when each run was, with its day where it wasn’t today, and what came of it (AC-381; T535’s review)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0));
    try {
      const run = (id: string, at: Date) => ({
        id,
        sql: `SELECT ${id}`,
        dataSource: null,
        startedAt: at.toISOString(),
        outcome: 'finished',
        rowCount: 1,
        durationMs: 10,
        truncated: null,
        statement: 'select',
      });
      serve({
        runs: [
          run('a', new Date(2026, 9, 2, 8, 0)),
          run('b', new Date(2026, 9, 1, 17, 40)),
          run('c', new Date(2026, 8, 24, 14, 32)),
          run('d', new Date(2025, 11, 30, 9, 5)),
        ],
      });
      open();
      const pane = await screen.findByRole('region', { name: 'My runs' });
      await within(pane).findByText('SELECT a');
      expect([...pane.querySelectorAll('.sql-runs__when')].map((when) => when.textContent)).toEqual(
        ['Today 08:00', 'Yesterday 17:40', '24 Sep 14:32', '30 Dec 2025 09:05'],
      );
      expect(within(pane).getByRole('button', { name: /SELECT a/ }).textContent).toBe(
        'Finished1 rowToday 08:00SELECT a',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('says how many rows a stopped run read before its stop, and nothing of rows where none came (T545)', async () => {
    const run = (id: string, outcome: string, rowCount: number) => ({
      id,
      sql: `SELECT ${id}`,
      dataSource: null,
      startedAt: '2026-10-01T14:32:00.000Z',
      outcome,
      rowCount,
      durationMs: 10,
      truncated: null,
      statement: 'select',
    });
    serve({ runs: [run('a', 'cancelled', 2), run('b', 'timeout', 0), run('c', 'finished', 0)] });
    open();
    const pane = await screen.findByRole('region', { name: 'My runs' });
    await within(pane).findByText('SELECT a');
    expect(
      [...pane.querySelectorAll('.sql-runs__top')].map(
        (top) => top.querySelector('.sql-runs__rows')?.textContent ?? null,
      ),
    ).toEqual(['2 rows', null, '0 rows']);
  });

  it('says a run on a source no longer available as such under All, naming none, opening nothing (T817, AC-381)', async () => {
    serve({
      runs: [
        {
          id: 'gone',
          sql: 'SELECT gone',
          dataSource: null,
          cubeStore: false,
          unavailable: true,
          startedAt: '2026-10-01T14:32:00.000Z',
          outcome: 'finished',
          rowCount: 1,
          durationMs: 10,
          truncated: null,
          statement: 'select',
        },
      ],
    });
    open();
    const pane = await screen.findByRole('region', { name: 'My runs' });
    await userEvent.click(within(pane).getByRole('radio', { name: 'All' }));
    const row = (await within(pane).findByText('SELECT gone')).closest('li')!;
    expect(within(row).getByText('A data source no longer available to you')).toBeTruthy();
    expect(row.textContent).not.toContain('Cube Store');
    expect(within(row).queryByRole('link')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('moves between runs with ↑ and ↓, and Enter puts a run’s SQL in the editor and focus there (design 15, keyboard)', async () => {
    const run = (id: string, dataSource: string | null) => ({
      id,
      sql: `SELECT ${id}`,
      dataSource:
        dataSource === null
          ? null
          : { id: dataSource, name: dataSource, folderPath: [], inWorkspace: false },
      startedAt: '2026-10-01T14:32:00.000Z',
      outcome: 'finished',
      rowCount: 1,
      durationMs: 10,
      truncated: null,
      statement: 'select',
    });
    serve({ runs: [run('a', null), run('b', null), run('c', 'ds-9')] });
    const { container } = open();
    const pane = await screen.findByRole('region', { name: 'My runs' });
    const first = await within(pane).findByRole('button', { name: /SELECT a/ });
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(within(pane).getByRole('button', { name: /SELECT b/ }));
    await userEvent.keyboard('{ArrowDown}');
    // A data source's run opens a SQL runner workspace tab on it (T823, AC-464).
    const there = within(pane).getByRole('link', { name: /SELECT c/ });
    expect(document.activeElement).toBe(there);
    expect(there.getAttribute('href')).toBe('/sql?source=ds-9');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(editorView(container).state.doc.toString()).toBe('SELECT b');
    expect(document.activeElement).toBe(editorView(container).contentDOM);
  });

  // The schema browser beside a data source's editor (T539) moved to the
  // workspace's left pane (T805; SchemaTree.test.tsx): Cube Store has none.

  it('says another run of the user’s is going elsewhere, and offers to cancel it (AC-379, D2)', async () => {
    const asked = serve({
      going: {
        dataSource: { id: 'ds-9', name: 'finance_dw' },
        startedAt: '2026-10-01T14:40:02.000Z',
      },
    });
    open();
    const note = await screen.findByTestId('sql-going-elsewhere');
    expect(note.textContent).toContain('You have a run going on finance_dw');
    // To the SQL runner workspace, where it runs (T823, AC-464).
    expect(within(note).getByRole('link', { name: 'Go to it' }).getAttribute('href')).toBe('/sql');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(note).getByRole('button', { name: 'Cancel that run' }));
    expect(asked.some((each) => each.url === '/api/sql-runs/cancel')).toBe(true);
  });

  it('holds Run while the user’s last Cube Store run is still finishing there, saying until when (T548, AC-378, AC-379)', async () => {
    serve({
      going: {
        dataSource: null,
        cubeStore: true,
        startedAt: '2026-10-01T14:40:02.000Z',
        stopping: true,
        endsBy: new Date(2026, 9, 1, 14, 42, 2).toISOString(),
      },
    });
    open();
    const note = await screen.findByTestId('sql-going-elsewhere');
    expect(note.textContent).toBe(
      'Cube Store is still finishing your last query, until 14:42:02 at the latest. One run at a time: your next one runs once it has ended.',
    );
    // Nothing to cancel, nor to go to: Cube Store can't stop it.
    expect(within(note).queryByRole('button')).toBeNull();
    expect(within(note).queryByRole('link')).toBeNull();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds Run while the user’s last Cube Store run is run to its end, saying no time (T549, AC-378, AC-379)', async () => {
    serve({
      going: {
        dataSource: null,
        cubeStore: true,
        startedAt: '2026-10-01T14:40:02.000Z',
        stopping: true,
        endsBy: null,
      },
    });
    open();
    const note = await screen.findByTestId('sql-going-elsewhere');
    expect(note.textContent).toBe(
      'Cube Store is running your last query to its end; it can’t be stopped. One run at a time: your next one runs once it has ended.',
    );
    expect(within(note).queryByRole('button')).toBeNull();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds Run where xcube can’t say whether it has ended, and says so (T549)', async () => {
    serve({
      going: {
        dataSource: null,
        cubeStore: true,
        startedAt: '2026-10-01T14:40:02.000Z',
        stopping: true,
        endsBy: null,
        unconfirmed: true,
      },
    });
    open();
    const note = await screen.findByTestId('sql-going-elsewhere');
    expect(note.textContent).toBe(
      'xcube can’t say whether Cube Store has finished your last query. One run at a time: your next one runs once it has ended.',
    );
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says a Cube Store run going elsewhere has no Cancel, for Cube Store can’t stop a query (AC-379, R64)', async () => {
    serve({
      going: { dataSource: null, cubeStore: true, startedAt: '2026-10-01T14:40:02.000Z' },
    });
    open();
    const note = await screen.findByTestId('sql-going-elsewhere');
    expect(within(note).queryByRole('button')).toBeNull();
    expect(within(note).getByTestId('sql-no-cancel').textContent).toBe(
      'Cube Store can’t stop a query, so there’s no Cancel.',
    );
  });
});

describe('the SQL tab, the runner off (T535, AC-373; design 15’s P1 and screen 2)', () => {
  it('shows a read-write member a panel saying it is off, and that a Super-Admin turns it on', () => {
    serve();
    open({ ...SOURCE, sqlRunner: OFF });
    const panel = screen.getByRole('region', { name: 'The SQL runner is off for emea_replica' });
    expect(panel.textContent).toContain('Only a Super-Admin can turn it on.');
    expect(within(panel).queryByRole('button', { name: /Turn on/ })).toBeNull();
    expect(document.querySelector('.sql-editor')).toBeNull();
  });

  it('draws the off panel as design 15 does: the off icon, the login in the code face, the folder’s groups named (T698, SRC-20, SRC-21, SRC-05)', async () => {
    serve();
    open({ ...SOURCE, sqlRunner: OFF }, true);
    const panel = screen.getByRole('region', { name: 'The SQL runner is off for emea_replica' });
    expect(within(panel).getByRole('heading').querySelector('svg')?.getAttribute('data-icon')).toBe(
      'off',
    );
    expect(within(panel).getByText('cube_reader').tagName).toBe('CODE');
    const who = panel.querySelector('dl')!;
    expect(who.className).toBe('sql-off__who');
    // The folder's read-write groups, each in the code face, once read.
    await waitFor(() => {
      expect(who.querySelector('dd')?.textContent).toBe(
        'Super-Admins, and read-write members of Sales / EMEA: sales-emea-rw, sales-rw',
      );
    });
    expect([...who.querySelectorAll('dd code')].map((code) => code.textContent)).toEqual([
      'sales-emea-rw',
      'sales-rw',
    ]);
    expect(
      within(panel)
        .getByRole('button', { name: 'Turn on the SQL runner…' })
        .querySelector('svg')
        ?.getAttribute('data-icon'),
    ).toBe('shield');
  });

  it('lets a Super-Admin turn it on only once they confirm the login can only read', async () => {
    const asked = serve();
    open({ ...SOURCE, sqlRunner: OFF }, true);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on the SQL runner…' }));
    const dialog = screen.getByRole('dialog', { name: 'Turn on the SQL runner for emea_replica?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByText(/Runs it in a read-only transaction/)).toBeTruthy();
    const turnOn = within(dialog).getByRole('button', { name: 'Turn on' });
    expect((turnOn as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /I confirm that cube_reader can only read/ }),
    );
    await userEvent.click(turnOn);
    expect(
      asked.filter((each) => each.url.endsWith('/sql-runner')).map((each) => each.body),
    ).toEqual([{ on: true, readOnlyConfirmed: true }]);
  });

  it('turns it on once however often Turn on is pressed, then shows the record with focus on “Open in SQL runner” (T535’s review; T823)', async () => {
    let answer: (answered: { status: number; body: unknown }) => void = () => undefined;
    const asked = serve({ switched: [new Promise((resolve) => (answer = resolve))] });
    const { reshow } = open({ ...SOURCE, sqlRunner: OFF }, true);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on the SQL runner…' }));
    const dialog = screen.getByRole('dialog', { name: 'Turn on the SQL runner for emea_replica?' });
    await userEvent.click(within(dialog).getByRole('checkbox'));
    const turnOn = within(dialog).getByRole('button', { name: 'Turn on' });
    await userEvent.click(turnOn);
    await userEvent.click(within(dialog).getByRole('button', { name: /Turning on/ }));
    answer({ status: 200, body: { on: true } });
    // The page reads the switch again once it is on, and shows the tab again.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    reshow(SOURCE);
    // No editor here now (AC-464): focus goes to the way to one.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Open in SQL runner' }));
    });
    expect(asked.filter((each) => each.url.endsWith('/sql-runner'))).toHaveLength(1);
  });

  it('says who may run SQL once on a Super-Admin’s own copy in My workspace: its owner alone (T535’s review)', async () => {
    serve();
    open(
      {
        ...SOURCE,
        inWorkspace: true,
        sqlRunner: {
          on: false,
          tab: true,
          runs: false,
          why: 'A copy pointed elsewhere.',
          needsSwitch: true,
        },
      },
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn on the SQL runner…' }));
    const dialog = screen.getByRole('dialog', { name: 'Turn on the SQL runner for emea_replica?' });
    expect(dialog.textContent).toContain(
      'Then you may run SQL here, as its owner: nobody else sees your workspace.',
    );
    expect(dialog.textContent).not.toContain('read-write members');
  });

  it('turns it off with no confirmation, says so, and puts focus on Turn on… (design 15, keyboard)', async () => {
    const asked = serve();
    const { reshow } = open(SOURCE, true);
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(
      asked.filter((each) => each.url.endsWith('/sql-runner')).map((each) => each.body),
    ).toEqual([{ on: false }]);
    reshow({ ...SOURCE, sqlRunner: OFF });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Turn on the SQL runner…' }),
      );
    });
    expect(screen.getByTestId('sql-turned-off').textContent).toBe(
      'The SQL runner is off. Turning it on again asks for the confirmation again.',
    );
  });

  it('says when turning it off fails (T535’s review)', async () => {
    serve({
      switched: [
        { status: 403, body: { error: 'Only Super-Admins turn the SQL runner on or off.' } },
      ],
    });
    open(SOURCE, true);
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect((await screen.findByTestId('sql-turn-off-failed')).textContent).toBe(
      'It couldn’t be turned off: Only Super-Admins turn the SQL runner on or off.',
    );
  });
});

describe('the SQL tab in My workspace (T535, AC-383; design 15’s I)', () => {
  it('says the owner runs it with no switch, on its saved settings', () => {
    serve();
    open({ ...SOURCE, inWorkspace: true, sqlRunner: { on: false, tab: true, runs: true } });
    expect(screen.getByTestId('sql-yours').textContent).toBe(
      'Yours: you may run SQL on your own data sources in My workspace, with no switch. Nobody else can.',
    );
    expect(screen.queryByTestId('sql-switch')).toBeNull();
  });

  it('says why a copy pointed elsewhere doesn’t run', () => {
    serve();
    const why = 'This copy signs in to another database … a Super-Admin can turn it on there.';
    open({
      ...SOURCE,
      inWorkspace: true,
      sqlRunner: { on: false, tab: true, runs: false, why, needsSwitch: true },
    });
    expect(
      screen.getByRole('region', { name: 'The SQL runner is off for emea_replica' }).textContent,
    ).toContain(why);
  });
});
