import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
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
