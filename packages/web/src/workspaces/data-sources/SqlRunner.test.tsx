import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SqlTab, type SqlRunnerState, type SqlSource } from './SqlRunner';

/**
 * T535 (AC-373, AC-377, AC-378, AC-379, AC-380, AC-381, AC-383, AC-385,
 * AC-387; design 15's screens 1 and 2, states A–I): the SQL tab on a data
 * source's page, against a stubbed API.
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
function open(source: SqlSource = SOURCE, superAdmin = false, me: object = ME) {
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

describe('the SQL tab, the runner on (T535)', () => {
  it('says where it runs and as whom, who turned it on, and warns above the editor with no way to hide it (AC-385)', async () => {
    serve();
    const { container } = open();
    expect(screen.getByTestId('sql-runline').textContent).toBe(
      'Runs on sales at pg-replica-1:5432, as cube_reader',
    );
    expect(screen.getByTestId('sql-switch').textContent).toContain(
      'SQL runner on · turned on by Ada Admin, who confirmed the login can only read',
    );
    const warning = screen.getByTestId('sql-warning');
    expect(warning.textContent).toBe(
      'This SQL runs on the database directly, as cube_reader. Folder permissions and access policies don’t apply here: you can read whatever that login can read.',
    );
    // Above the editor, and nothing in it closes it.
    const editor = container.querySelector('.sql-editor')!;
    expect(warning.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(warning).queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.getByText(
        'SELECT or EXPLAIN, one statement · up to 10,000 rows, 10 MB, 30 seconds · one run at a time',
      ),
    ).toBeTruthy();
  });

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

  it('holds Run back while a run goes, offers Cancel, and says the run was cancelled (AC-379, AC-378)', async () => {
    let finish: (answer: { status: number; body: unknown }) => void = () => undefined;
    const asked = serve({
      answers: [new Promise((resolve) => (finish = resolve))],
    });
    const { container } = open();
    typeSql(container, 'SELECT pg_sleep(20)');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    const running = await screen.findByRole('button', { name: 'Running…' });
    expect((running as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      asked.some((each) => each.url === '/api/sql-runs/cancel' && each.method === 'POST'),
    ).toBe(true);
    finish({
      status: 422,
      body: {
        outcome: 'cancelled',
        error: 'Cancelled: the run was stopped on the database.',
        durationMs: 8200,
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^Cancelled after 8\.2 s/);
    });
    expect(screen.getByTestId('sql-result-note').textContent).toContain('Nothing came back.');
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });

  it('says when Cancel fails, rather than nothing (T535’s review)', async () => {
    let finish: (answer: { status: number; body: unknown }) => void = () => undefined;
    serve({
      answers: [new Promise((resolve) => (finish = resolve))],
      cancelled: {
        status: 503,
        body: { error: 'SQL runs on xcube, which this deployment doesn’t run.' },
      },
    });
    const { container } = open();
    typeSql(container, 'SELECT pg_sleep(20)');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect((await screen.findByTestId('sql-cancel-failed')).textContent).toBe(
      'It couldn’t be cancelled: SQL runs on xcube, which this deployment doesn’t run.',
    );
    finish({ status: 200, body: FINISHED });
    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
  });

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
        'Not run. Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE statement. Nothing reached the database.',
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
      'This SQL runs on the database directly, as cube_reader. Folder permissions and access policies don’t apply here: you can read whatever that login can read.',
      'SELECT or EXPLAIN, one statement · up to 10,000 rows, 10 MB, 30 seconds · one run at a time',
    ]);
  });

  it('keeps the editor’s text for the user who wrote it, not for the next one in the same tab (T535’s review)', () => {
    serve();
    const first = open();
    typeSql(first.container, 'SELECT secret FROM vault');
    first.unmount();
    const next = open(SOURCE, false, { ...ME, name: 'Rae Reader', identity: 'reader@example.com' });
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
        'Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE statement. Nothing reached the database.',
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
          dataSource: { id: 'ds-1', name: 'emea_replica', folderPath: [], inWorkspace: false },
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
    expect(asked.some((each) => each.url === '/api/sql-runs?dataSource=ds-1')).toBe(true);
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
        dataSource: { id: 'ds-1', name: 'emea_replica', folderPath: [], inWorkspace: false },
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

  it('moves between runs with ↑ and ↓, and Enter puts a run’s SQL in the editor and focus there (design 15, keyboard)', async () => {
    const run = (id: string, dataSource: string) => ({
      id,
      sql: `SELECT ${id}`,
      dataSource: { id: dataSource, name: dataSource, folderPath: [], inWorkspace: false },
      startedAt: '2026-10-01T14:32:00.000Z',
      outcome: 'finished',
      rowCount: 1,
      durationMs: 10,
      truncated: null,
      statement: 'select',
    });
    serve({ runs: [run('a', 'ds-1'), run('b', 'ds-1'), run('c', 'ds-9')] });
    const { container } = open();
    const pane = await screen.findByRole('region', { name: 'My runs' });
    const first = await within(pane).findByRole('button', { name: /SELECT a/ });
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(within(pane).getByRole('button', { name: /SELECT b/ }));
    await userEvent.keyboard('{ArrowDown}');
    // Another data source's run opens its own SQL tab.
    const there = within(pane).getByRole('link', { name: /SELECT c/ });
    expect(document.activeElement).toBe(there);
    expect(there.getAttribute('href')).toBe('/explore/data-sources/ds-9?tab=sql');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(editorView(container).state.doc.toString()).toBe('SELECT b');
    expect(document.activeElement).toBe(editorView(container).contentDOM);
  });

  it('puts a name chosen in the schema browser beside the editor into it at the cursor (T539, AC-386)', async () => {
    serve();
    const { container } = open();
    typeSql(container, 'SELECT * FROM  LIMIT 5');
    const view = editorView(container);
    act(() => {
      view.dispatch({ selection: { anchor: 14 } });
    });
    const browser = screen.getByRole('region', { name: 'Tables in emea_replica' });
    // Beside the editor, after the warning.
    expect(
      screen.getByTestId('sql-warning').compareDocumentPosition(browser) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(
      within(await within(browser).findByRole('treeitem', { name: 'public' })).getByTestId(
        'sql-schema-caret',
      ),
    );
    await userEvent.click(
      within(await within(browser).findByRole('treeitem', { name: 'orders' })).getByText('orders'),
    );
    expect(view.state.doc.toString()).toBe('SELECT * FROM public.orders LIMIT 5');
    expect(document.activeElement).toBe(view.contentDOM);
  });

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
    // To its own SQL tab (T535's review).
    expect(within(note).getByRole('link', { name: 'Go to it' }).getAttribute('href')).toBe(
      '/explore/data-sources/ds-9?tab=sql',
    );
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(note).getByRole('button', { name: 'Cancel that run' }));
    expect(asked.some((each) => each.url === '/api/sql-runs/cancel')).toBe(true);
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

  it('turns it on once however often Turn on is pressed, then opens on the editor with focus in it (T535’s review)', async () => {
    let answer: (answered: { status: number; body: unknown }) => void = () => undefined;
    const asked = serve({ switched: [new Promise((resolve) => (answer = resolve))] });
    const { container, reshow } = open({ ...SOURCE, sqlRunner: OFF }, true);
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
    await waitFor(() => {
      expect(document.activeElement).toBe(editorView(container).contentDOM);
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
