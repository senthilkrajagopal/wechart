import { EditorView, runScopeHandlers } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryTab } from './QueryTab';
import type { SqlSource } from './sqlSource';
import { tabsReducer, type SqlTab, type TabsAction, type TabsState } from './tabs';

/**
 * T802 (AC-373, AC-385, AC-380): an allowed user runs a tab's SQL on that
 * tab's data source from the workspace, under the run line and the warning
 * naming it, and gets the grid with each column's type, the row count, the
 * time and its CSV.
 * Fails when: an allowed user can't run SQL from the workspace; a column's
 * type, the row count or the duration is missing; or the CSV runs the SQL
 * again.
 */
const EMEA: SqlSource = {
  id: 'emea',
  version: 1,
  name: 'emea_replica',
  driver: 'postgres',
  fields: { host: 'pg-replica-1', port: 5432, database: 'sales', user: 'cube_reader', ssl: false },
  folderPath: [{ id: 'f', title: 'Sales' }],
  inWorkspace: false,
  sqlRunner: { on: true, tab: true, runs: true },
};
const CUBE_STORE: SqlSource = {
  cubeStore: true,
  id: 'cubestore',
  version: 0,
  name: 'Cube Store',
  folderPath: [],
  inWorkspace: false,
  sqlRunner: { on: true, tab: true, runs: true },
};
const FINISHED = {
  outcome: 'finished',
  columns: [
    { name: 'one', type: 'int4' },
    { name: 'letter', type: 'text' },
  ],
  rows: [
    [1, 'a'],
    [2, 'b'],
  ],
  rowCount: 2,
  truncated: null,
  durationMs: 840,
  statement: 'select',
};

const tab = (over: Partial<SqlTab> = {}): SqlTab => ({
  id: 'a',
  name: 'Query 1',
  sourceId: 'emea',
  sql: '',
  params: {},
  savedSql: null,
  lastRunSql: null,
  run: null,
  ...over,
});

let posts: { url: string; body: unknown }[] = [];
beforeEach(() => {
  posts = [];
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) as unknown });
        return Promise.resolve(new Response(JSON.stringify(FINISHED), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The tab, as the workspace holds it; its state shown for the test to read. */
function Harness({ start, source }: { readonly start: SqlTab; readonly source: SqlSource }) {
  const [state, dispatch] = useReducer(
    (now: TabsState, action: TabsAction) => tabsReducer(now, action),
    { tabs: [start], active: start.id },
  );
  const open = state.tabs[0]!;
  return (
    <>
      <QueryTab tab={open} source={source} dispatch={dispatch} grip={<span data-testid="grip" />} />
      <output data-testid="kept-sql">{open.sql}</output>
      <output data-testid="kept-run">{open.run?.kind ?? 'none'}</output>
    </>
  );
}
function open(
  start: SqlTab,
  source: SqlSource = EMEA,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <Harness start={start} source={source} />
    </QueryClientProvider>,
  );
}
const typeSql = (container: HTMLElement, text: string) => {
  const view = EditorView.findFromDOM(container.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
};

describe('a query tab on a data source (T802, AC-373, AC-385, AC-380)', () => {
  it('puts the run line and the warning naming its source above its editor', () => {
    const { container } = open(tab());

    const warning = screen.getByTestId('sql-warning');
    expect(warning.textContent).toMatch(/^This SQL runs on emea_replica’s database directly, as cube_reader\./);
    const editor = container.querySelector('.sql-editor')!;
    expect(warning.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The editor is the tab's, named for its source.
    expect(container.querySelector('.cm-content')?.getAttribute('aria-label')).toBe('SQL for emea_replica');
  });

  it('shows the tab’s own text, and keeps what is typed in the tab', () => {
    const { container } = open(tab({ sql: 'SELECT 9' }));
    expect(container.querySelector('.cm-content')?.textContent).toBe('SELECT 9');

    typeSql(container, 'SELECT 1');

    expect(screen.getByTestId('kept-sql').textContent).toBe('SELECT 1');
  });

  it('holds Run while the editor is empty', () => {
    open(tab());

    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Run a SELECT or EXPLAIN to see its rows here.')).toBeTruthy();
  });

  it('runs its SQL on its own data source and shows the grid, types, row count, time and CSV', async () => {
    const { container } = open(tab());
    typeSql(container, "SELECT 1 AS one, 'a' AS letter");

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    const grid = await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(posts).toEqual([
      { url: '/api/data-sources/emea/sql', body: { sql: "SELECT 1 AS one, 'a' AS letter" } },
    ]);
    expect([...grid.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['#', 'oneint4', 'lettertext']);
    expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^Finished 2 rows · 0\.84 s · at /);
    expect(screen.getByTestId('kept-run').textContent).toBe('done');

    // The CSV of exactly those rows, with no second run.
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
    expect(await blob.text()).toBe('one,letter\r\n1,a\r\n2,b\r\n');
    expect(posts).toHaveLength(1);
  });

  it('shows the result a tab already holds, as it comes back to it', () => {
    open(
      tab({
        sql: 'SELECT 1',
        lastRunSql: 'SELECT 1',
        run: { kind: 'done', sql: 'SELECT 1', at: Date.now(), outcome: FINISHED as never },
      }),
    );

    expect(screen.getByRole('table', { name: 'Result: 2 rows, 2 columns' })).toBeTruthy();
  });

  it('runs a Cube Store tab’s SQL on Cube Store', async () => {
    const { container } = open(tab({ sourceId: 'cubestore' }), CUBE_STORE);
    typeSql(container, 'SELECT 1');

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(posts.map((post) => post.url)).toEqual(['/api/cube-store/sql']);
  });
});

/**
 * T803 (AC-387): WHEN text is selected, only the selection runs, with Run
 * reading "Run selection", from Run and from ⌘/Ctrl+Enter; with none, only
 * the statement at the cursor, marked in the editor.
 * Fails when: a run with text selected runs anything but the selection, or
 * Run doesn't say so; or with the cursor in the second of two statements
 * anything but that statement is sent.
 */
describe('the selection, or the statement at the cursor (T803, AC-387)', () => {
  const TWO = "SELECT 1; SELECT ';' AS a; -- x;";
  const view = (container: HTMLElement) =>
    EditorView.findFromDOM(container.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
  const cursorAt = (container: HTMLElement, anchor: number, head = anchor) => {
    act(() => {
      view(container).dispatch({ selection: { anchor, head } });
    });
  };
  /** ⌘/Ctrl+Enter, as CodeMirror reads `Mod-Enter`: Ctrl off a Mac, as jsdom is. */
  const modEnter = (container: HTMLElement) =>
    act(() => {
      runScopeHandlers(
        view(container),
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: false }),
        'editor',
      );
    });
  const sent = () => posts.map((post) => (post.body as { sql: string }).sql);

  it('marks the statement at the cursor, and sends only it from Run', async () => {
    const { container } = open(tab({ sql: TWO }));
    cursorAt(container, TWO.indexOf('AS a'));

    const marked = [...container.querySelectorAll('.cm-sql-statement')].map((each) => each.textContent);
    expect(marked.join('')).toBe("SELECT ';' AS a");
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(sent()).toEqual(["SELECT ';' AS a"]);
  });

  it('bounds it as the tab’s source reads strings: PostgreSQL’s $$…$$ (T803’s review)', async () => {
    const text = 'SELECT $$a;b$$ AS x; SELECT 2';
    const { container } = open(tab({ sql: text }));
    cursorAt(container, 3);

    modEnter(container);

    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(sent()).toEqual(['SELECT $$a;b$$ AS x']);
  });

  it('sends only the statement at the cursor from ⌘/Ctrl+Enter', async () => {
    const { container } = open(tab({ sql: TWO }));
    cursorAt(container, 2);

    modEnter(container);

    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });
    expect(sent()).toEqual(['SELECT 1']);
  });

  it('with text selected, reads “Run selection” and sends only the selection, from Run and from ⌘/Ctrl+Enter', async () => {
    const { container } = open(tab({ sql: TWO }));
    cursorAt(container, 0, 'SELECT 1'.length);

    expect(screen.getByRole('button', { name: 'Run selection' })).toBeTruthy();
    // A selection marks no statement: it is what runs.
    expect(container.querySelector('.cm-sql-statement')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Run selection' }));
    await screen.findByRole('table', { name: 'Result: 2 rows, 2 columns' });

    cursorAt(container, TWO.indexOf('SELECT \''), TWO.indexOf(' AS a'));
    modEnter(container);
    await vi.waitFor(() => {
      expect(sent()).toEqual(['SELECT 1', "SELECT ';'"]);
    });
  });
});

/**
 * T808 (AC-456): while the user types, the names the schema browser has read
 * are offered; ↑ and ↓ choose, Enter accepts, Esc closes the list only, and
 * Tab still moves focus out of the editor.
 * Fails when: Enter adds a new line while the list is open; Esc does anything
 * but close the list; or Tab is kept in the editor.
 */
describe('autocomplete in the editor (T808, AC-456)', () => {
  /** The schema browser's answers for EMEA, kept as it keeps them. */
  const readClient = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['sql-catalog', 'emea', 1];
    client.setQueryData([...key, 'schemas'], { schemas: [{ name: 'public' }] });
    client.setQueryData([...key, 'tables', 'public'], {
      pages: [{ tables: [{ schema: 'public', name: 'customers', type: 'table', rawType: null }], total: 1 }],
      pageParams: [0],
    });
    client.setQueryData(
      [...key, 'columns', 'public', 'customers'],
      [
        { name: 'id', rawType: 'integer' },
        { name: 'country', rawType: 'text' },
      ],
    );
    return client;
  };
  const view = (container: HTMLElement) =>
    EditorView.findFromDOM(container.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
  /** One character typed at the end, as typing makes it. */
  const typeAtEnd = (container: HTMLElement, text: string) => {
    const editor = view(container);
    act(() => {
      editor.focus();
      const end = editor.state.doc.length;
      editor.dispatch({
        changes: { from: end, insert: text },
        selection: { anchor: end + text.length },
        userEvent: 'input.type',
      });
    });
  };
  const listed = (container: HTMLElement) =>
    [...container.querySelectorAll('.cm-tooltip-autocomplete li')].map((item) => item.textContent);
  /** A key pressed in the editor, as the browser sends it; whether anything outside saw it. */
  const press = (container: HTMLElement, key: string) => {
    let outside = false;
    const seen = () => {
      outside = true;
    };
    window.addEventListener('keydown', seen);
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => {
      view(container).contentDOM.dispatchEvent(event);
    });
    window.removeEventListener('keydown', seen);
    return { prevented: event.defaultPrevented, outside };
  };

  it('offers a table’s columns read so far; ↓ and ↑ choose, Enter accepts, adding no new line', async () => {
    const { container } = open(tab({ sql: 'SELECT customers' }), EMEA, readClient());
    typeAtEnd(container, '.');
    await vi.waitFor(() => {
      // In the list's own order, by name.
      expect(listed(container)).toEqual(['country', 'id']);
    });
    // At once: the list takes its keys as soon as it shows (decision T808-2).
    const chosen = () =>
      container.querySelector('.cm-tooltip-autocomplete li[aria-selected="true"]')?.textContent;
    expect(chosen()).toBe('country');

    expect(press(container, 'ArrowDown').prevented).toBe(true);
    expect(chosen()).toBe('id');
    press(container, 'ArrowUp');
    expect(chosen()).toBe('country');
    press(container, 'ArrowDown');
    expect(press(container, 'Enter').prevented).toBe(true);

    expect(view(container).state.doc.toString()).toBe('SELECT customers.id');
    expect(listed(container)).toEqual([]);
    expect(screen.getByTestId('kept-sql').textContent).toBe('SELECT customers.id');
  });

  it('Esc closes the list and nothing else: the text, the cursor and the page are untouched', async () => {
    const { container } = open(tab({ sql: 'SELECT * FROM ' }), EMEA, readClient());
    typeAtEnd(container, 'cust');
    await vi.waitFor(() => {
      expect(listed(container)).toEqual(['customers']);
    });
    const before = view(container).state.selection.main;

    const esc = press(container, 'Escape');

    expect(listed(container)).toEqual([]);
    expect(esc.outside).toBe(false);
    expect(view(container).state.doc.toString()).toBe('SELECT * FROM cust');
    expect(view(container).state.selection.main.eq(before)).toBe(true);
    // With the list closed, Enter is a new line again.
    press(container, 'Enter');
    expect(view(container).state.doc.toString()).toBe('SELECT * FROM cust\n');
  });

  it('Tab still moves focus out of the editor while the list is open', async () => {
    const { container } = open(tab({ sql: 'SELECT * FROM ' }), EMEA, readClient());
    typeAtEnd(container, 'cust');
    await vi.waitFor(() => {
      expect(listed(container)).toEqual(['customers']);
    });

    expect(press(container, 'Tab').prevented).toBe(false);
    view(container).contentDOM.focus();
    await userEvent.tab();

    expect(view(container).dom.contains(document.activeElement)).toBe(false);
    expect(view(container).state.doc.toString()).toBe('SELECT * FROM cust');
  });

  it('offers nothing on Cube Store, which has no catalog read', async () => {
    const { container } = open(tab({ sql: 'SELECT * FROM ', sourceId: 'cubestore' }), CUBE_STORE, readClient());
    typeAtEnd(container, 'cust');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(listed(container)).toEqual([]);
  });
});
