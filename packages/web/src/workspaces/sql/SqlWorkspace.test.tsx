import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { forgetLiveTabs } from './liveTabs';
import { editorShare, LEFT_PANE, paneWidth, RIGHT_PANE, roomFor, SPLIT } from './panes';
import { SqlWorkspace } from './SqlWorkspace';

/**
 * T796 (AC-446): WHEN a Super-Admin or a read-write member opens SQL runner,
 * THE SYSTEM SHALL show the workspace at `/sql`; and IF anyone else opens
 * `/sql`, THEN THE SYSTEM SHALL show them none of it.
 * Fails when: a read-only user sees the workspace or any of its content.
 */
const signedIn = (who: Partial<Me>): Me => ({
  name: 'Someone',
  groups: [],
  superAdmin: false,
  readWrite: false,
  security: 'oidc',
  ...who,
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Each test a first visit: the workspace keeps its tabs in this browser (T801).
  localStorage.clear();
});

function renderAs(me: Me | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me !== undefined) client.setQueryData(ME_QUERY.queryKey, me);
  render(
    <QueryClientProvider client={client}>
      <SqlWorkspace />
    </QueryClientProvider>,
  );
}

describe('the SQL runner workspace, by role (T796, AC-446)', () => {
  it('shows a read-write member the workspace', () => {
    renderAs(signedIn({ readWrite: true }));

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Not found' })).toBeNull();
  });

  it('shows a Super-Admin the workspace', () => {
    renderAs(signedIn({ superAdmin: true }));

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
  });

  it('shows the single user with sign-in off the workspace', () => {
    renderAs({ name: 'admin', groups: [], superAdmin: true, readWrite: true, security: 'off' });

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
  });

  it('shows a read-only user Not found and none of the workspace', () => {
    renderAs(signedIn({ groups: ['sales-ro'] }));

    expect(screen.getByRole('heading', { name: 'Not found' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
  });

  it('shows nothing of the workspace until who is signed in is known (fail closed)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderAs(undefined);

    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Not found' })).toBeNull();
  });

  it('shows Not found, and none of the workspace, when who is signed in can’t be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );
    renderAs(undefined);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
  });
});

/**
 * T797 (AC-386, AC-381, AC-304; direction §7f, rule 91; design 17, screen 1
 * and state O): three panes. On the left the data source picker and schema
 * browser, 280 px (220–400, a 40 px rail); in the centre the tabs over the
 * editor over the results, 30 : 70, the editor at least 200 px and the
 * results at least 160; on the right Saved and History, 320 px (280–480, a
 * 40 px rail). Below 1,280 px the right pane is a rail, below 1,024 the left
 * one too, each opening over the centre (design 17's Q1, (a)).
 */
/** A window `width` px wide, as the panes' media queries see it. */
const windowOf = (width: number) => {
  vi.stubGlobal('matchMedia', (query: string) => {
    const most = Number(/max-width:\s*([\d.]+)px/.exec(query)?.[1] ?? Infinity);
    return {
      matches: width <= most,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
};
const writer = signedIn({ readWrite: true });
const workspaceOf = () => screen.getByRole('region', { name: 'SQL runner' });
const leftPane = () => screen.getByRole('complementary', { name: 'Data source and schema' });
const rightPane = () => screen.getByRole('complementary', { name: 'Saved and History' });
const px = (element: HTMLElement, property: string) =>
  workspaceOf().style.getPropertyValue(property) || element.style.getPropertyValue(property);
/** Drags a grip by `dx` across or `dy` down, as a pointer does. */
const drag = (grip: Element, { dx = 0, dy = 0 }: { dx?: number; dy?: number }) => {
  fireEvent.pointerDown(grip, { clientX: 500, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(grip, { clientX: 500 + dx, clientY: 300 + dy, pointerId: 1 });
  fireEvent.pointerUp(grip, { clientX: 500 + dx, clientY: 300 + dy, pointerId: 1 });
};

describe('the workspace’s three panes (T797, rule 91)', () => {
  it('lays out the left pane, the centre and the right pane, in that order', () => {
    windowOf(1440);
    renderAs(writer);

    const left = leftPane();
    const right = rightPane();
    expect(within(left).getByRole('heading', { name: 'Data source' })).toBeTruthy();
    expect(within(left).getByRole('heading', { name: 'Schema' })).toBeTruthy();
    expect(within(right).getByRole('heading', { name: 'Saved and History' })).toBeTruthy();
    const centre = within(workspaceOf()).getByTestId('sql-centre');
    expect(within(centre).getByTestId('sql-editor-area')).toBeTruthy();
    expect(within(centre).getByTestId('sql-results-area')).toBeTruthy();
    const order = [left, centre, right];
    for (let at = 1; at < order.length; at += 1)
      expect(
        order[at - 1]!.compareDocumentPosition(order[at]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  it('starts the left pane at 280 px and the right at 320, the editor at 30 % of the centre', () => {
    windowOf(1440);
    renderAs(writer);

    expect(px(leftPane(), '--sql-left')).toBe('280px');
    expect(px(rightPane(), '--sql-right')).toBe('320px');
    expect(px(screen.getByTestId('sql-centre'), '--sql-editor')).toBe('30%');
    expect(leftPane().getAttribute('data-folded')).toBe('false');
    expect(rightPane().getAttribute('data-folded')).toBe('false');
  });

  it('drags the left pane between 220 and 400 px, and the right between 280 and 480', () => {
    windowOf(1440);
    renderAs(writer);
    const leftGrip = leftPane().querySelector('.sql-pane__grip')!;
    const rightGrip = rightPane().querySelector('.sql-pane__grip')!;

    drag(leftGrip, { dx: 40 });
    expect(px(leftPane(), '--sql-left')).toBe('320px');
    drag(leftGrip, { dx: 500 });
    expect(px(leftPane(), '--sql-left')).toBe('400px');
    drag(leftGrip, { dx: -500 });
    expect(px(leftPane(), '--sql-left')).toBe('220px');

    // The right pane grows leftwards.
    drag(rightGrip, { dx: -40 });
    expect(px(rightPane(), '--sql-right')).toBe('360px');
    drag(rightGrip, { dx: -500 });
    expect(px(rightPane(), '--sql-right')).toBe('480px');
    drag(rightGrip, { dx: 500 });
    expect(px(rightPane(), '--sql-right')).toBe('280px');
  });

  it('holds the editor at 200 px or more and the results at 160 px or more', () => {
    expect(editorShare(300, 1000)).toBeCloseTo(0.3);
    expect(editorShare(50, 1000)).toBeCloseTo(0.2);
    expect(editorShare(950, 1000)).toBeCloseTo(0.84);
    // Too short for both: the editor keeps its 200.
    expect(editorShare(100, 300)).toBeCloseTo(200 / 300);
    expect(SPLIT).toEqual({ editor: 0.3, editorMin: 200, resultsMin: 160, editorMinWidth: 560 });
    expect(LEFT_PANE).toEqual({ start: 280, min: 220, max: 400, rail: 40 });
    expect(RIGHT_PANE).toEqual({ start: 320, min: 280, max: 480, rail: 40 });
  });

  it('never drags a pane so wide the editor falls below design 17’s 560 px (state O)', () => {
    // The room the other pane and the editor leave it.
    expect(paneWidth(LEFT_PANE, 400, 300)).toBe(300);
    expect(paneWidth(RIGHT_PANE, 480, 1000)).toBe(480);
    // Less room than its least: its least, the window then too narrow for both.
    expect(paneWidth(LEFT_PANE, 400, 100)).toBe(220);
    expect(roomFor(1280, 480)).toBe(1280 - 480 - 560);
  });

  it('folds Saved and History to a 40 px rail from 1,024 to 1,279 px, the left pane kept', () => {
    windowOf(1180);
    renderAs(writer);

    expect(rightPane().getAttribute('data-folded')).toBe('true');
    expect(px(rightPane(), '--sql-right')).toBe('40px');
    expect(leftPane().getAttribute('data-folded')).toBe('false');
    expect(px(leftPane(), '--sql-left')).toBe('280px');
  });

  it('below 1,024 px folds both panes to 40 px rails, each opening over the centre and closing on Esc', async () => {
    windowOf(900);
    renderAs(writer);

    expect(px(leftPane(), '--sql-left')).toBe('40px');
    expect(px(rightPane(), '--sql-right')).toBe('40px');
    const open = within(leftPane()).getByRole('button', { name: 'Data source and schema' });
    expect(open.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(open);

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(leftPane().getAttribute('data-open')).toBe('true');
    // Rule 85: focus into the pane, Esc closes it and hands focus back.
    expect(leftPane().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(open);
    await userEvent.keyboard('{Escape}');
    expect(leftPane().getAttribute('data-open')).toBe('false');
    expect(document.activeElement).toBe(open);

    // The right pane's rail, the same way; opening one closes the other.
    await userEvent.click(open);
    const history = within(rightPane()).getByRole('button', { name: 'Saved and History' });
    await userEvent.click(history);
    expect(rightPane().getAttribute('data-open')).toBe('true');
    expect(leftPane().getAttribute('data-open')).toBe('false');

    // A press in the centre, outside it, closes it rather than leaving it over the editor.
    fireEvent.pointerDown(screen.getByTestId('sql-editor-area'));
    expect(rightPane().getAttribute('data-open')).toBe('false');
  });
});

/**
 * T800 (AC-450): each editor tab is bound to one data source; the picker
 * chooses the open tab's, and "+" opens a tab on it.
 * Fails when: a run on a tab goes to a data source other than the tab's.
 */
describe('tabs bound to a data source in the workspace (T800, AC-450)', () => {
  const listed = [
    { id: 'emea', name: 'emea_replica' },
    { id: 'fx', name: 'fx_warehouse' },
  ].map((source) => ({
    ...source,
    driver: 'postgres',
    cubeStore: false,
    folderId: 'f-sales',
    folderPath: [{ id: 'f-sales', title: 'Sales' }],
    inWorkspace: false,
    runner: 'on',
  }));
  const choose = async (name: string) => {
    // The picker's button, not the left pane's rail ("Data source and schema").
    await userEvent.click(screen.getByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
  };

  it('binds the picker’s choice to the open tab only, and opens “+” on it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url === '/api/sql/sources'
            ? new Response(JSON.stringify(listed), { status: 200 })
            : new Response('{}', { status: 404 }),
        ),
      ),
    );
    renderAs(writer);
    await screen.findByRole('button', { name: 'Data source Choose…' });

    await choose('emea_replica');
    expect(screen.getByRole('tab', { name: 'Query 1, Not run yet, on emea_replica' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'New tab on emea_replica' }));
    await choose('fx_warehouse');

    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Query 1, Not run yet, on emea_replica',
      'Query 2, Not run yet, on fx_warehouse',
    ]);
    // The picker shows the open tab's source, and follows the tab chosen.
    await userEvent.click(screen.getByRole('tab', { name: /^Query 1/ }));
    expect(screen.getByRole('button', { name: /^Data source emea_replica/ })).toBeTruthy();
    // The panel is the open tab's.
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: /^Query 1/ }).id,
    );
  });
});

/**
 * T802 (AC-373, AC-385): an allowed member runs a tab's SQL from the
 * workspace on that tab's source; two tabs on two sources each name their own.
 */
describe('running a tab’s SQL in the workspace (T802, AC-373, AC-385)', () => {
  const page = (id: string, name: string, user: string) => ({
    id,
    folderId: 'f-sales',
    name,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: `${id}-host`, port: 5432, database: 'sales', user, ssl: false },
    secrets: {},
    targetFolderId: null,
    origin: null,
    version: 1,
    updatedAt: '2026-10-17T10:00:00Z',
    folderPath: [{ id: 'f-sales', title: 'Sales' }],
    canWrite: true,
    inWorkspace: false,
    description: null,
    sqlRunner: { on: true },
    sqlAccess: { tab: true, runs: true },
  });
  const listed = [
    { id: 'emea', name: 'emea_replica' },
    { id: 'fx', name: 'fx_warehouse' },
  ].map((source) => ({
    ...source,
    driver: 'postgres',
    cubeStore: false,
    folderId: 'f-sales',
    folderPath: [{ id: 'f-sales', title: 'Sales' }],
    inWorkspace: false,
    runner: 'on',
  }));
  const posted: string[] = [];
  const choose = async (name: string) => {
    await userEvent.click(screen.getByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
  };

  it('runs the open tab’s SQL on its own source, each tab’s warning naming its own', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (init?.method === 'POST') {
          posted.push(url);
          return json({
            outcome: 'finished',
            columns: [{ name: 'one', type: 'int4' }],
            rows: [[1]],
            rowCount: 1,
            truncated: null,
            durationMs: 12,
            statement: 'select',
          });
        }
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page('emea', 'emea_replica', 'cube_reader'));
        if (url === '/api/data-sources/fx') return json(page('fx', 'fx_warehouse', 'fin_reader'));
        return Promise.resolve(new Response('[]', { status: 404 }));
      }),
    );
    renderAs(writer);
    await screen.findByRole('button', { name: 'Data source Choose…' });

    await choose('emea_replica');
    expect((await screen.findByTestId('sql-warning')).textContent).toMatch(
      /^This SQL runs on emea_replica’s database directly, as cube_reader\./,
    );
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'SELECT 1 AS one' } });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('table', { name: 'Result: 1 row, 1 column' })).toBeTruthy();
    expect(posted).toEqual(['/api/data-sources/emea/sql']);
    expect(screen.getByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' })).toBeTruthy();

    // A second tab, on another source, names its own.
    await userEvent.click(screen.getByRole('button', { name: 'New tab on emea_replica' }));
    await choose('fx_warehouse');
    expect((await screen.findByTestId('sql-warning')).textContent).toMatch(
      /^This SQL runs on fx_warehouse’s database directly, as fin_reader\./,
    );
    // Back on the first, its own source and its result again.
    await userEvent.click(screen.getByRole('tab', { name: /^Query 1/ }));
    expect((await screen.findByTestId('sql-warning')).textContent).toMatch(/^This SQL runs on emea_replica’s/);
    expect(screen.getByRole('table', { name: 'Result: 1 row, 1 column' })).toBeTruthy();
  });
});

/**
 * T801 (AC-451, AC-446): open tabs kept in this browser, for the signed-in
 * user, restored on reload, and the open tab named in the address.
 * Fails when: a reload opens another tab, or loses the tab's data source or
 * text; or another user signed in to the same browser sees it.
 */
describe('tabs kept in this browser, the open one in the address (T801, AC-451, AC-446)', () => {
  const wren = signedIn({ name: 'Wren Writer', identity: 'wren@example.com', readWrite: true });
  const ada = signedIn({ name: 'Ada Admin', identity: 'ada@example.com', superAdmin: true });
  const kept = {
    tabs: [
      { id: 'a1b2c3d4', name: 'orders check', sourceId: '', sql: 'SELECT 1', params: {}, savedSql: null, lastRunSql: null },
      { id: 'e5f6a7b8', name: 'Query 2', sourceId: '', sql: 'SELECT 2', params: {}, savedSql: null, lastRunSql: null },
    ],
    active: 'a1b2c3d4',
  };

  afterEach(() => {
    localStorage.clear();
  });

  function openAt(me: Me, tab: string | undefined, onOpenTab = vi.fn()) {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ME_QUERY.queryKey, me);
    render(
      <QueryClientProvider client={client}>
        <SqlWorkspace tab={tab} onOpenTab={onOpenTab} />
      </QueryClientProvider>,
    );
    return onOpenTab;
  }
  const names = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

  it('restores the user’s kept tabs, opening the one the address names', () => {
    localStorage.setItem('wechart.sql.tabs.wren@example.com', JSON.stringify(kept));

    const onOpenTab = openAt(wren, 'e5f6a7b8');

    expect(names()).toEqual(['orders check', 'Query 2']);
    expect(screen.getByRole('tab', { name: /^Query 2/ }).getAttribute('aria-selected')).toBe('true');
    expect(onOpenTab).toHaveBeenLastCalledWith('e5f6a7b8');
  });

  it('opens the tab kept open where the address names none, or one not kept, and names it there', () => {
    localStorage.setItem('wechart.sql.tabs.wren@example.com', JSON.stringify(kept));

    const onOpenTab = openAt(wren, 'gone0000');

    expect(screen.getByRole('tab', { name: /^orders check/ }).getAttribute('aria-selected')).toBe('true');
    expect(onOpenTab).toHaveBeenLastCalledWith('a1b2c3d4');
  });

  it('shows another user signed in to the same browser none of them', () => {
    localStorage.setItem('wechart.sql.tabs.wren@example.com', JSON.stringify(kept));

    openAt(ada, 'a1b2c3d4');

    expect(names()).toEqual(['Query 1']);
  });

  it('keys a user whose identity is empty by their name, never one key for all such users', () => {
    localStorage.setItem('wechart.sql.tabs.', JSON.stringify(kept));

    openAt({ ...wren, identity: '' }, 'a1b2c3d4');

    expect(names()).toEqual(['Query 1']);
    expect(localStorage.getItem('wechart.sql.tabs.Wren Writer')).not.toBeNull();
  });

  it('keeps a tab opened, and names it in the address, as it opens', async () => {
    const onOpenTab = openAt(wren, undefined);

    await userEvent.click(screen.getByRole('button', { name: 'New tab' }));

    const stored = JSON.parse(localStorage.getItem('wechart.sql.tabs.wren@example.com') ?? '{}') as {
      tabs: { id: string; name: string }[];
      active: string;
    };
    expect(stored.tabs.map((tab) => tab.name)).toEqual(['Query 1', 'Query 2']);
    expect(stored.active).toBe(stored.tabs[1]?.id);
    expect(onOpenTab).toHaveBeenLastCalledWith(stored.tabs[1]?.id);
  });
});

/**
 * T804 (AC-452, AC-379): WHILE a user has a run going, THE SYSTEM SHALL show
 * its state the same way on its tab and in its result head; hold Run on
 * every other tab with "You have a run going on ‹source›… Go to it · Cancel
 * that run", where Go to it selects that tab; and keep the run going if the
 * user leaves the workspace, showing it on their return.
 * Fails when: the places show different states for one run; another tab's
 * Run starts a second run; Go to it doesn't select the running tab; or
 * leaving the workspace stops the run.
 */
describe('a run going, across tabs and away (T804, AC-452, AC-379)', () => {
  afterEach(() => {
    // A run a test left going stays with its tabs, as on a page; each test is a page of its own.
    cleanup();
    forgetLiveTabs();
  });
  const page = {
    id: 'emea',
    folderId: 'f-sales',
    name: 'emea_replica',
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'emea-host', port: 5432, database: 'sales', user: 'cube_reader', ssl: false },
    secrets: {},
    targetFolderId: null,
    origin: null,
    version: 1,
    updatedAt: '2026-10-17T10:00:00Z',
    folderPath: [{ id: 'f-sales', title: 'Sales' }],
    canWrite: true,
    inWorkspace: false,
    description: null,
    sqlRunner: { on: true },
    sqlAccess: { tab: true, runs: true },
  };
  const listed = [
    {
      id: 'emea',
      name: 'emea_replica',
      driver: 'postgres',
      cubeStore: false,
      folderId: 'f-sales',
      folderPath: [{ id: 'f-sales', title: 'Sales' }],
      inWorkspace: false,
      runner: 'on',
    },
  ];
  const finished = {
    outcome: 'finished',
    columns: [{ name: 'one', type: 'int4' }],
    rows: [[1]],
    rowCount: 1,
    truncated: null,
    durationMs: 12,
    statement: 'select',
  };

  /** The database's side: one run held open until it is answered. */
  function server() {
    const posts: string[] = [];
    let answer: ((body: unknown) => void) | null = null;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    const startedAt = new Date().toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/sql-runs/cancel' && init?.method === 'POST') {
          posts.push(url);
          answer?.({ outcome: 'cancelled', durationMs: 1200 });
          return json({ cancelled: true });
        }
        if (init?.method === 'POST') {
          posts.push(url);
          return new Promise<Response>((resolve) => {
            answer = (body) => {
              answer = null;
              resolve(new Response(JSON.stringify(body), { status: 200 }));
            };
          });
        }
        if (url === '/api/sql-runs/going')
          return json({
            going: answer === null ? null : { dataSource: { id: 'emea', name: 'emea_replica' }, startedAt },
          });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    return {
      posts,
      finish: () => {
        act(() => answer?.(finished));
      },
    };
  }
  const writer = signedIn({ name: 'Wren', identity: 'wren-t804@example.com', readWrite: true });
  function open() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ME_QUERY.queryKey, writer);
    const at = (shown: boolean) => (
      <QueryClientProvider client={client}>
        {shown ? <SqlWorkspace /> : <p>Explore</p>}
      </QueryClientProvider>
    );
    const { rerender } = render(at(true));
    return {
      leave: () => {
        rerender(at(false));
      },
      back: () => {
        rerender(at(true));
      },
    };
  }
  async function startRun(sql: string) {
    await userEvent.click(await screen.findByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));
    await screen.findByTestId('sql-warning');
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sql } });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  }
  const stateOnTab = (name: RegExp) =>
    /^Query \d+, (.*), on emea_replica$/.exec(screen.getByRole('tab', { name }).getAttribute('aria-label') ?? '')?.[1];

  it('says Running · n s of 30 alike on its tab and in its result head, with Cancel', async () => {
    const db = server();
    open();
    await startRun('SELECT pg_sleep(20)');

    const head = await screen.findByTestId('sql-result-head');
    expect(head.textContent).toMatch(/^Running · \d+ s of 30$/);
    expect(stateOnTab(/^Query 1/)).toBe(head.textContent);
    expect(screen.getByRole('button', { name: 'Running…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

    db.finish();
    expect(await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' })).toBeTruthy();
    expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^Finished/);
  });

  it('holds Run on every other tab, with Go to it selecting the running tab and Cancel that run cancelling it', async () => {
    const db = server();
    open();
    await startRun('SELECT pg_sleep(20)');
    await screen.findByRole('button', { name: 'Running…' });

    await userEvent.click(screen.getByRole('button', { name: 'New tab on emea_replica' }));
    const held = await screen.findByTestId('sql-run-held');
    expect(held.textContent).toMatch(
      /^You have a run going on emea_replica, started at \d\d:\d\d:\d\d\. One run at a time\. Go to it · Cancel that run$/,
    );
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: 0, insert: 'SELECT 2' } });
    });
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('held while your other run goes')).toBeTruthy();

    await userEvent.click(within(held).getByRole('button', { name: 'Go to it' }));
    expect(screen.getByRole('tab', { name: /^Query 1/ }).getAttribute('aria-selected')).toBe('true');

    await userEvent.click(screen.getByRole('tab', { name: /^Query 2/ }));
    await userEvent.click(within(await screen.findByTestId('sql-run-held')).getByRole('button', { name: 'Cancel that run' }));
    expect(await screen.findByRole('tab', { name: 'Query 1, Cancelled, on emea_replica' })).toBeTruthy();
    expect(db.posts).toEqual(['/api/data-sources/emea/sql', '/api/sql-runs/cancel']);
  });

  it('keeps the run going while the user is away, and shows it, then its end, on their return', async () => {
    const db = server();
    const app = open();
    await startRun('SELECT pg_sleep(20)');
    await screen.findByRole('button', { name: 'Running…' });

    app.leave();
    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
    app.back();

    expect(await screen.findByRole('button', { name: 'Running…' })).toBeTruthy();
    expect(stateOnTab(/^Query 1/)).toMatch(/^Running · \d+ s of 30$/);
    db.finish();
    expect(await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' })).toBeTruthy();
    expect(await screen.findByRole('table', { name: 'Result: 1 row, 1 column' })).toBeTruthy();
    expect(db.posts).toEqual(['/api/data-sources/emea/sql']);
  });

  it('keeps the run going in this browser when leaving the page drops its request', async () => {
    let drop: ((error: Error) => void) | null = null;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST')
          return new Promise<Response>((_resolve, reject) => {
            drop = reject;
          });
        if (url === '/api/sql-runs/going') return json({ going: null });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    open();
    await startRun('SELECT pg_sleep(20)');
    await screen.findByRole('button', { name: 'Running…' });

    window.dispatchEvent(new Event('beforeunload'));
    await act(async () => {
      drop?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    const kept = JSON.parse(localStorage.getItem('wechart.sql.tabs.wren-t804@example.com') ?? '{}') as {
      tabs: { run?: { kind: string } }[];
    };
    expect(kept.tabs[0]?.run?.kind).toBe('running');
    expect(screen.queryByRole('tab', { name: /No answer/ })).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
  });

  /** A tab kept in this browser with its run going, as a page left mid-run keeps it. */
  function keptMidRun(at: number) {
    localStorage.setItem(
      'wechart.sql.tabs.wren-t804@example.com',
      JSON.stringify({
        tabs: [
          {
            id: 'a1b2c3d4',
            name: 'Query 1',
            sourceId: 'emea',
            sql: 'SELECT pg_sleep(6) AS away',
            params: {},
            savedSql: null,
            lastRunSql: 'SELECT pg_sleep(6) AS away',
            run: { kind: 'running', at },
          },
        ],
        active: 'a1b2c3d4',
      }),
    );
  }
  /** wechart's server after a reload: the run going while `going()` says so, then History's row. */
  function serverAfterReload(at: number, going: () => boolean, history: readonly object[]) {
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        asked.push(url);
        if (url === '/api/sql-runs/going')
          return json({
            going: going()
              ? { dataSource: { id: 'emea', name: 'emea_replica' }, startedAt: new Date(at).toISOString() }
              : null,
          });
        if (url === '/api/sql-runs?dataSource=emea') return json({ runs: history });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    return asked;
  }
  const row = (at: number, over: object = {}) => ({
    id: 'r1',
    sql: 'SELECT pg_sleep(6) AS away',
    dataSource: { id: 'emea', name: 'emea_replica', folderPath: null, inWorkspace: false },
    cubeStore: false,
    startedAt: new Date(at + 40).toISOString(),
    outcome: 'finished',
    rowCount: 1,
    durationMs: 6012,
    truncated: null,
    statement: 'select',
    ...over,
  });

  it('after a reload, follows a run kept going: Running while the server says so, then its end as History has it', async () => {
    const at = Date.now() - 2_000;
    keptMidRun(at);
    let going = true;
    const asked = serverAfterReload(at, () => going, [row(at - 60_000, { id: 'r0', rowCount: 9 }), row(at)].reverse());
    open();

    expect(await screen.findByRole('tab', { name: /^Query 1, Running · \d+ s of 30, on emea_replica$/ })).toBeTruthy();
    expect((await screen.findByTestId('sql-result-head')).textContent).toMatch(/^Running · \d+ s of 30$/);

    going = false;
    expect(
      await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' }, { timeout: 5_000 }),
    ).toBeTruthy();
    expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^Finished 1 row · 6\.01 s · at \d\d:\d\d:\d\d$/);
    expect(
      screen.getByText('You were away when it ended, so its rows weren’t kept. Run it again to see them.'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(asked.filter((url) => url.endsWith('/sql'))).toEqual([]);
  });

  it('back on a page the browser kept (Back), follows the run whose request leaving dropped', async () => {
    let drop: ((error: Error) => void) | null = null;
    let going = false;
    let at = 0;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          at = Date.now();
          going = true;
          return new Promise<Response>((_resolve, reject) => {
            drop = reject;
          });
        }
        if (url === '/api/sql-runs/going')
          return json({
            going: going ? { dataSource: { id: 'emea', name: 'emea_replica' }, startedAt: new Date(at).toISOString() } : null,
          });
        if (url === '/api/sql-runs?dataSource=emea') return json({ runs: [{ ...row(at), sql: 'SELECT pg_sleep(20)' }] });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    open();
    await startRun('SELECT pg_sleep(20)');
    await screen.findByRole('button', { name: 'Running…' });
    window.dispatchEvent(new Event('beforeunload'));
    await act(async () => {
      drop?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    going = false;
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });

    expect(
      await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' }, { timeout: 5_000 }),
    ).toBeTruthy();
  });

  it('after a reload, follows a kept run on though the first word of the run going fails', async () => {
    const at = Date.now() - 2_000;
    keptMidRun(at);
    let asks = 0;
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/sql-runs/going') {
          asks += 1;
          return asks === 1 ? json({ error: 'down' }, 502) : json({ going: null });
        }
        if (url === '/api/sql-runs?dataSource=emea') return json({ runs: [row(at)] });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    open();

    expect(
      await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' }, { timeout: 5_000 }),
    ).toBeTruthy();
  });

  it('holds Run for a run on Cube Store from outside the tabs, with no Go to it and no Cancel, saying why', async () => {
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/sql-runs/going')
          return json({ going: { dataSource: null, cubeStore: true, startedAt: '2026-10-17T14:40:02Z' } });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));

    const held = await screen.findByTestId('sql-run-held');
    expect(held.textContent).toMatch(
      /^You have a run going on Cube Store, started at \d\d:\d\d:\d\d\. One run at a time\. Cube Store can’t stop a query, so there’s no Cancel\.$/,
    );
    expect(within(held).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(true);
  });

  it('holds Run while Cube Store still finishes the last run, until when', async () => {
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/sql-runs/going')
          return json({
            going: {
              dataSource: null,
              cubeStore: true,
              startedAt: '2026-10-17T14:40:02Z',
              stopping: true,
              endsBy: '2026-10-17T14:41:20Z',
            },
          });
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/data-sources/emea') return json(page);
        return json([], 404);
      }),
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));

    expect((await screen.findByTestId('sql-run-held')).textContent).toMatch(
      /^Cube Store is still finishing your last query, until \d\d:\d\d:\d\d at the latest\. One run at a time: your next one runs once it has ended\.$/,
    );
  });

  it('after a reload, reads a kept run History has no row for as having no answer', async () => {
    const at = Date.now() - 2_000;
    keptMidRun(at);
    serverAfterReload(at, () => false, [row(at - 600_000, { sql: 'SELECT 1' })]);
    open();

    expect(await screen.findByRole('tab', { name: 'Query 1, No answer, on emea_replica' })).toBeTruthy();
    expect(screen.getByTestId('sql-result-head').textContent).toMatch(/^No answer/);
  });

  it('shows on return a run that ended while the user was away', async () => {
    const db = server();
    const app = open();
    await startRun('SELECT pg_sleep(1)');
    await screen.findByRole('button', { name: 'Running…' });

    app.leave();
    db.finish();
    await act(async () => {
      await Promise.resolve();
    });
    app.back();

    expect(await screen.findByRole('tab', { name: 'Query 1, Finished, 1 row, on emea_replica' })).toBeTruthy();
    expect(await screen.findByRole('table', { name: 'Result: 1 row, 1 column' })).toBeTruthy();
  });
});

/**
 * T814 (AC-459): a saved query whose data source the user can no longer run
 * SQL on, which the API answers with none, opens with no source chosen,
 * saying why, with no Run, and names that source nowhere.
 */
describe('opening a saved query whose source is no longer available (T814, AC-459)', () => {
  const listed = [
    {
      id: 'emea',
      name: 'emea_replica',
      driver: 'postgres',
      cubeStore: false,
      folderId: 'f-sales',
      folderPath: [{ id: 'f-sales', title: 'Sales' }],
      inWorkspace: false,
      runner: 'on',
    },
  ];
  const lost = {
    id: 'q-lost',
    name: 'Old month end',
    description: '',
    sourceId: null,
    sql: 'SELECT 42',
    parameters: [],
  };

  it('opens it in a tab of its own with no source, saying the one it was saved with isn’t available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/sql/saved') return json({ queries: [lost] });
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    renderAs(writer);
    await userEvent.click(await screen.findByRole('button', { name: 'Old month end' }));

    expect(await screen.findByRole('tab', { name: /^Old month end/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Old month end/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Data source Choose…' })).toBeTruthy();
    expect(screen.getByTestId('sql-editor-area').textContent).toBe(
      'Choose a data source: the one it was saved with isn’t available to you.',
    );
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();

    // Chosen one: the sentence goes, and its SQL is there to run on it.
    await userEvent.click(screen.getByRole('button', { name: /^Data source (?!and schema)/ }));
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));
    expect(screen.queryByText(/the one it was saved with/)).toBeNull();
  });

  it('opens the saved query the address names, `/sql?saved=…`, as ⌘K sends it (T815, AC-460)', async () => {
    const top = { ...lost, id: 'q-top', name: 'Top EMEA orders', sourceId: 'emea', sql: 'SELECT 7' };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/sql/saved') return json({ queries: [top, lost] });
        if (url === '/api/sql/saved/q-top') return json(top);
        if (url === '/api/sql/saved/q-lost') return json(lost);
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ME_QUERY.queryKey, writer);
    const view = render(
      <QueryClientProvider client={client}>
        <SqlWorkspace saved="q-top" />
      </QueryClientProvider>,
    );
    const tab = await screen.findByRole('tab', { name: /^Top EMEA orders, .*on emea_replica$/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    view.unmount();

    // Again, with it open: its tab is selected, not a second one.
    const again = render(
      <QueryClientProvider client={client}>
        <SqlWorkspace saved="q-top" />
      </QueryClientProvider>,
    );
    await vi.waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Top EMEA orders/ }).getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    again.unmount();

    // A lost one opens on none.
    render(
      <QueryClientProvider client={client}>
        <SqlWorkspace saved="q-lost" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Choose a data source: the one it was saved with isn’t available to you.')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((each) => each.getAttribute('aria-label')?.split(',')[0])).toEqual([
      'Query 1',
      'Top EMEA orders',
      'Old month end',
    ]);
  });

  it('takes ⌘/Ctrl+S anywhere in the workspace: Save… on the open tab, never the browser’s save (T816, AC-455)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/sql/saved') return json({ queries: [] });
        if (url === '/api/data-sources/emea')
          return json({
            id: 'emea',
            folderId: 'f-sales',
            name: 'emea_replica',
            driver: 'postgres',
            authMethod: 'password',
            fields: { host: 'h', port: 5432, database: 'sales', user: 'cube_reader', ssl: false },
            secrets: {},
            targetFolderId: null,
            origin: null,
            version: 1,
            updatedAt: '2026-10-17T10:00:00Z',
            folderPath: [{ id: 'f-sales', title: 'Sales' }],
            canWrite: true,
            inWorkspace: false,
            description: null,
            sqlRunner: { on: true },
            sqlAccess: { tab: true, runs: true },
          });
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    renderAs(writer);
    // No source chosen: nothing to save, and the browser saves nothing either.
    const picker = await screen.findByRole('button', { name: 'Data source Choose…' });
    expect(fireEvent.keyDown(picker, { key: 's', ctrlKey: true })).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(picker);
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));
    await screen.findByRole('button', { name: 'Save…' });
    // From the right pane, far from the editor.
    const right = screen.getByRole('complementary', { name: 'Saved and History' });
    expect(fireEvent.keyDown(right, { key: 's', metaKey: true })).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Save query' })).toBeTruthy();
  });

  it('shows Saved first, and History, all the user’s runs, on its button in the right pane (T817, AC-381)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url === '/api/sql/sources') return json(listed);
        if (url === '/api/sql/saved') return json({ queries: [lost] });
        if (url === '/api/sql-runs')
          return json({
            runs: [
              {
                id: 'r1',
                sql: 'SELECT 99',
                dataSource: { id: 'emea', name: 'emea_replica', folderPath: [{ id: 'f-sales', title: 'Sales' }], inWorkspace: false },
                cubeStore: false,
                startedAt: '2026-10-18T14:32:00Z',
                outcome: 'finished',
                rowCount: 1,
                durationMs: 5,
                truncated: null,
                statement: 'select',
                parameters: [],
              },
            ],
          });
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    renderAs(writer);
    const right = screen.getByRole('complementary', { name: 'Saved and History' });
    expect(within(right).getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')).toBe('true');
    await within(right).findByRole('button', { name: 'Old month end' });
    await userEvent.click(within(right).getByRole('button', { name: 'History' }));
    expect(await within(right).findByText('SELECT 99')).toBeTruthy();
    expect(within(right).getByText('emea_replica · Shared / Sales')).toBeTruthy();
    expect(within(right).getByRole('radio', { name: 'All' })).toHaveProperty('checked', true);
    expect(within(right).queryByRole('list', { name: 'Saved queries' })).toBeNull();
  });

  it('keeps the first visit’s sentence for a tab with no source that wasn’t opened so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url === '/api/sql/sources'
            ? new Response(JSON.stringify(listed), { status: 200 })
            : new Response('{}', { status: 404 }),
        ),
      ),
    );
    renderAs(writer);
    expect(await screen.findByText('Choose a data source to write SQL against.')).toBeTruthy();
  });
});
