import { describe, expect, it } from 'vitest';

import {
  asksBeforeClosing,
  firstTabs,
  tabsReducer,
  tabState,
  type SqlTab,
  type TabsState,
} from './tabs';

/**
 * T800 (AC-450): WHILE the SQL runner workspace is open, THE SYSTEM SHALL
 * bind each editor tab to one data source; open a new tab on the current
 * data source from "+"; offer Rename…, Duplicate, Close and Close other
 * tabs; keep a tab's SQL and clear its result when its data source changes;
 * give each tab its state in its tooltip and accessible name; and ask before
 * closing a tab whose text is neither saved nor the SQL of its last run.
 */
let next = 0;
const ids = () => {
  next += 1;
  return `t${String(next)}`;
};

const tab = (over: Partial<SqlTab> & Pick<SqlTab, 'id' | 'name'>): SqlTab => ({
  sourceId: 'emea',
  sql: '',
  params: {},
  savedSql: null,
  lastRunSql: null,
  run: null,
  ...over,
});
const finished = {
  kind: 'done',
  sql: 'SELECT 1',
  at: 0,
  outcome: {
    outcome: 'finished',
    columns: [],
    rows: [],
    rowCount: 1284,
    truncated: null,
    durationMs: 840,
    statement: 'select',
  },
} as const;

describe('a tab, bound to one data source (T800, AC-450)', () => {
  it('starts as one tab, “Query 1”, with no data source', () => {
    const state = firstTabs(ids);

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.name).toBe('Query 1');
    expect(state.tabs[0]?.sourceId).toBe('');
    expect(state.active).toBe(state.tabs[0]?.id);
  });

  it('holds exactly one data source id, which choosing another replaces', () => {
    const state: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1' })], active: 'a' };

    const changed = tabsReducer(state, { kind: 'source', id: 'a', sourceId: 'fx' }, ids);

    expect(typeof changed.tabs[0]?.sourceId).toBe('string');
    expect(changed.tabs[0]?.sourceId).toBe('fx');
  });

  it('keeps the SQL and clears the result when its data source changes (design 17’s Q5)', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Query 1', sql: 'SELECT 1', lastRunSql: 'SELECT 1', run: finished })],
      active: 'a',
    };

    const changed = tabsReducer(state, { kind: 'source', id: 'a', sourceId: 'fx' }, ids);

    expect(changed.tabs[0]?.sql).toBe('SELECT 1');
    expect(changed.tabs[0]?.run).toBeNull();
    // Its own source chosen again is no change: the result stays.
    expect(tabsReducer(state, { kind: 'source', id: 'a', sourceId: 'emea' }, ids)).toBe(state);
  });

  it('opens a new tab from “+” on the current tab’s data source, after it, and selects it', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Query 1', sourceId: 'fx' }), tab({ id: 'b', name: 'Query 2' })],
      active: 'a',
    };

    const added = tabsReducer(state, { kind: 'add' }, () => 'c');

    expect(added.tabs.map((each) => each.id)).toEqual(['a', 'b', 'c']);
    expect(added.tabs[2]).toMatchObject({ name: 'Query 3', sourceId: 'fx', sql: '', run: null });
    expect(added.active).toBe('c');
  });

  // T807 (AC-449): Preview 100 rows opens a new tab holding its SELECT.
  it('opens a new tab, last, on a given source and holding given SQL, and selects it', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Query 1', sourceId: 'fx' }), tab({ id: 'b', name: 'Query 2' })],
      active: 'a',
    };

    const opened = tabsReducer(
      state,
      { kind: 'open', sourceId: 'emea', sql: 'SELECT *\nFROM sales.orders\nLIMIT 100', name: 'orders' },
      () => 'c',
    );

    expect(opened.tabs.map((each) => each.id)).toEqual(['a', 'b', 'c']);
    expect(opened.tabs[2]).toMatchObject({
      name: 'orders',
      sourceId: 'emea',
      sql: 'SELECT *\nFROM sales.orders\nLIMIT 100',
      run: null,
    });
    expect(opened.active).toBe('c');
  });

  it('names a new tab one past the highest “Query n”', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Query 4' }), tab({ id: 'b', name: 'orders check' })],
      active: 'b',
    };

    expect(tabsReducer(state, { kind: 'add' }, () => 'c').tabs[2]?.name).toBe('Query 5');
  });

  it('renames a tab, trimmed, and keeps the old name for a blank one', () => {
    const state: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1' })], active: 'a' };

    expect(tabsReducer(state, { kind: 'rename', id: 'a', name: '  orders check ' }, ids).tabs[0]?.name).toBe(
      'orders check',
    );
    expect(tabsReducer(state, { kind: 'rename', id: 'a', name: '  ' }, ids).tabs[0]?.name).toBe('Query 1');
  });

  it('duplicates a tab after it, with its source, SQL and parameters, and no result', () => {
    const state: TabsState = {
      tabs: [
        tab({ id: 'a', name: 'Query 1', sourceId: 'fx', sql: 'SELECT 2', params: { region: 'EMEA' }, run: finished }),
        tab({ id: 'b', name: 'Query 2' }),
      ],
      active: 'b',
    };

    const copied = tabsReducer(state, { kind: 'duplicate', id: 'a' }, () => 'c');

    expect(copied.tabs.map((each) => each.id)).toEqual(['a', 'c', 'b']);
    expect(copied.tabs[1]).toMatchObject({
      name: 'Query 1 (copy)',
      sourceId: 'fx',
      sql: 'SELECT 2',
      params: { region: 'EMEA' },
      run: null,
    });
    expect(copied.active).toBe('c');
  });

  it('closes a tab, selecting the one after it, or else the one before', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Q1' }), tab({ id: 'b', name: 'Q2' }), tab({ id: 'c', name: 'Q3' })],
      active: 'b',
    };

    expect(tabsReducer(state, { kind: 'close', id: 'b' }, ids)).toMatchObject({ active: 'c' });
    expect(tabsReducer({ ...state, active: 'c' }, { kind: 'close', id: 'c' }, ids).active).toBe('b');
    expect(tabsReducer(state, { kind: 'close', id: 'a' }, ids).active).toBe('b');
  });

  it('closing the last tab leaves a fresh “Query 1” on its data source', () => {
    const state: TabsState = { tabs: [tab({ id: 'a', name: 'orders', sourceId: 'fx', sql: 'x' })], active: 'a' };

    const closed = tabsReducer(state, { kind: 'close', id: 'a' }, () => 'z');

    expect(closed.tabs).toEqual([tab({ id: 'z', name: 'Query 1', sourceId: 'fx' })]);
    expect(closed.active).toBe('z');
  });

  it('closes every other tab, selecting the one kept', () => {
    const state: TabsState = {
      tabs: [tab({ id: 'a', name: 'Q1' }), tab({ id: 'b', name: 'Q2' }), tab({ id: 'c', name: 'Q3' })],
      active: 'a',
    };

    const kept = tabsReducer(state, { kind: 'close-others', id: 'b' }, ids);

    expect(kept.tabs.map((each) => each.id)).toEqual(['b']);
    expect(kept.active).toBe('b');
  });
});

/**
 * T802 (AC-373, AC-380): a tab's text, and a run on its own source, kept in
 * the tab: going, then its result, with the SQL it sent.
 */
describe('a tab’s text and its runs (T802)', () => {
  const one: TabsState = { tabs: [tab({ id: 'a', name: 'Q', sourceId: 'emea' })], active: 'a' };

  it('keeps the text typed in it', () => {
    expect(tabsReducer(one, { kind: 'sql', id: 'a', sql: 'SELECT 2' }, ids).tabs[0]?.sql).toBe('SELECT 2');
  });

  it('marks a run going, its SQL the last it ran, then keeps its result', () => {
    const going = tabsReducer(one, { kind: 'run-start', id: 'a', sql: 'SELECT 2', at: 5 }, ids);
    expect(going.tabs[0]).toMatchObject({ run: { kind: 'running', at: 5 }, lastRunSql: 'SELECT 2' });

    const done = tabsReducer(
      going,
      { kind: 'run-done', id: 'a', sourceId: 'emea', sql: 'SELECT 2', at: 5, outcome: finished.outcome },
      ids,
    );
    expect(done.tabs[0]?.run).toEqual({ kind: 'done', sql: 'SELECT 2', at: 5, outcome: finished.outcome });
  });

  it('keeps with its result the parameter values the run sent, for Make a cube (T822, AC-462)', () => {
    const going = tabsReducer(one, { kind: 'run-start', id: 'a', sql: 'SELECT {{n}}', at: 5 }, ids);
    const parameters = [{ name: 'n', type: 'number' as const, value: '3' }];
    const done = tabsReducer(
      going,
      { kind: 'run-done', id: 'a', sourceId: 'emea', sql: 'SELECT {{n}}', at: 5, outcome: finished.outcome, parameters },
      ids,
    );
    expect(done.tabs[0]?.run).toEqual({ kind: 'done', sql: 'SELECT {{n}}', at: 5, outcome: finished.outcome, parameters });
  });

  it('drops a result that comes back after its tab moved to another source (design 17’s Q5)', () => {
    const going = tabsReducer(one, { kind: 'run-start', id: 'a', sql: 'SELECT 2', at: 5 }, ids);
    const moved = tabsReducer(going, { kind: 'source', id: 'a', sourceId: 'fx' }, ids);

    const late = tabsReducer(
      moved,
      { kind: 'run-done', id: 'a', sourceId: 'emea', sql: 'SELECT 2', at: 5, outcome: finished.outcome },
      ids,
    );

    expect(late.tabs[0]?.run).toBeNull();
  });

  it('drops a result of an earlier run, never ending the run going now (T802’s review)', () => {
    const first = tabsReducer(one, { kind: 'run-start', id: 'a', sql: 'SELECT 1', at: 5 }, ids);
    const away = tabsReducer(first, { kind: 'source', id: 'a', sourceId: 'fx' }, ids);
    const back = tabsReducer(away, { kind: 'source', id: 'a', sourceId: 'emea' }, ids);
    const second = tabsReducer(back, { kind: 'run-start', id: 'a', sql: 'SELECT 2', at: 9 }, ids);

    const late = tabsReducer(
      second,
      { kind: 'run-done', id: 'a', sourceId: 'emea', sql: 'SELECT 1', at: 5, outcome: finished.outcome },
      ids,
    );

    expect(late.tabs[0]?.run).toEqual({ kind: 'running', at: 9 });
  });
});

describe('asking before closing a tab (T800, AC-450)', () => {
  it('asks for text that is neither saved nor the SQL of its last run', () => {
    expect(asksBeforeClosing(tab({ id: 'a', name: 'Q', sql: 'SELECT 1' }))).toBe(true);
    expect(
      asksBeforeClosing(tab({ id: 'a', name: 'Q', sql: 'SELECT 2', lastRunSql: 'SELECT 1', savedSql: 'SELECT 3' })),
    ).toBe(true);
  });

  it('doesn’t ask for text that is saved, or that it last ran, or for no text', () => {
    expect(asksBeforeClosing(tab({ id: 'a', name: 'Q', sql: 'SELECT 1', savedSql: 'SELECT 1' }))).toBe(false);
    expect(asksBeforeClosing(tab({ id: 'a', name: 'Q', sql: 'SELECT 1', lastRunSql: 'SELECT 1' }))).toBe(false);
    expect(asksBeforeClosing(tab({ id: 'a', name: 'Q', sql: '  \n' }))).toBe(false);
  });
});

describe('a tab’s state, as an icon and a label (T800, AC-450; design 17’s Q6)', () => {
  it('reads “Not run yet” before its first run', () => {
    expect(tabState(tab({ id: 'a', name: 'Q' }))).toEqual({ kind: 'idle', label: 'Not run yet' });
  });

  it('reads “Finished, 1,284 rows” after a run that finished', () => {
    expect(tabState(tab({ id: 'a', name: 'Q', run: finished }))).toEqual({
      kind: 'ok',
      label: 'Finished, 1,284 rows',
    });
  });

  it('reads each other outcome in the result head’s words', () => {
    const done = (outcome: object) => tabState(tab({ id: 'a', name: 'Q', run: { kind: 'done', sql: 'SELECT 1', at: 0, outcome } as SqlTab['run'] }));

    // With its seconds since T804 (AC-452).
    expect(tabState(tab({ id: 'a', name: 'Q', run: { kind: 'running', at: 1 } }), 12_001)).toEqual({
      kind: 'run',
      label: 'Running · 12 s of 30',
    });
    expect(done({ ...finished.outcome, truncated: 'rows' })).toEqual({ kind: 'warn', label: 'Limited to 10,000 rows' });
    expect(done({ ...finished.outcome, truncated: 'bytes' })).toEqual({ kind: 'warn', label: 'Limited to 10 MB' });
    expect(done({ outcome: 'timeout', durationMs: 30000 })).toEqual({ kind: 'err', label: 'Stopped at 30 seconds' });
    expect(done({ outcome: 'cancelled', durationMs: 1000 })).toEqual({ kind: 'cancel', label: 'Cancelled' });
    expect(done({ outcome: 'refused', error: 'x', reason: 'x', statement: null })).toEqual({ kind: 'err', label: 'Not run' });
    expect(done({ outcome: 'failed', error: 'x', durationMs: null })).toEqual({ kind: 'err', label: 'Database error' });
    expect(done({ outcome: 'busy', error: 'x' })).toEqual({ kind: 'warn', label: 'Busy' });
  });
});

/**
 * T813 (AC-458): Open on a saved query opens it in a tab of its own, named
 * after it and holding its SQL, source, parameters and their types; one
 * already open is selected, not opened twice. Rename… in the Saved tab
 * renames the saved query its tabs hold, so their Save keeps the new name.
 */
describe('a saved query opened and renamed (T813, AC-458)', () => {
  const saved = {
    id: 'q-top',
    name: 'Top EMEA orders',
    description: 'Month end',
    sourceId: 'emea',
    sql: 'SELECT * FROM orders WHERE region = {{region}} AND n > {{n}}',
    parameters: [
      { name: 'region', type: 'text', value: 'EMEA' },
      { name: 'n', type: 'number', value: '7' },
    ],
  } as const;

  it('opens in a new tab holding all it keeps, as saved', () => {
    const start: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1' })], active: 'a' };
    const opened = tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: 'emea' }, () => 'b');
    expect(opened.active).toBe('b');
    expect(opened.tabs[1]).toEqual(
      tab({
        id: 'b',
        name: 'Top EMEA orders',
        sourceId: 'emea',
        sql: saved.sql,
        params: { region: 'EMEA', n: '7' },
        paramTypes: { n: 'number' },
        saved: { id: 'q-top', name: 'Top EMEA orders', description: 'Month end' },
        savedSql: saved.sql,
      }),
    );
    // Its text is saved: closing it asks nothing.
    expect(asksBeforeClosing(opened.tabs[1]!)).toBe(false);
  });

  it('opens on the source given: none where its own isn’t available', () => {
    const start: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1' })], active: 'a' };
    expect(tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: '' }, () => 'b').tabs[1]?.sourceId).toBe('');
  });

  it('marks a tab opened with none as having lost its source, until one is chosen (T814, AC-459)', () => {
    const start: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1' })], active: 'a' };
    const opened = tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: '' }, () => 'b');
    expect(opened.tabs[1]?.sourceLost).toBe(true);
    expect(opened.tabs[0]?.sourceLost).toBeUndefined();
    const chosen = tabsReducer(opened, { kind: 'source', id: 'b', sourceId: 'emea' });
    expect(chosen.tabs[1]).not.toHaveProperty('sourceLost');
    // Opened on its own source: never lost.
    const own = tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: 'emea' }, () => 'b');
    expect(own.tabs[1]).not.toHaveProperty('sourceLost');
  });

  it('takes the source from a tab already holding it, once it is lost, rather than selecting it on that source (T814 review)', () => {
    const start: TabsState = {
      tabs: [
        tab({ id: 'a', name: 'Query 1' }),
        tab({
          id: 'b',
          name: 'Top EMEA orders',
          sourceId: 'emea',
          sql: 'SELECT 9',
          saved: { id: 'q-top', name: 'Top EMEA orders', description: '' },
        }),
      ],
      active: 'a',
    };
    const opened = tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: '', lose: true }, () => 'c');
    expect(opened.active).toBe('b');
    expect(opened.tabs).toHaveLength(2);
    expect(opened.tabs[1]).toMatchObject({ sourceId: '', sourceLost: true, sql: 'SELECT 9', run: null });
    // Without `lose` (the tab is on a source the user still runs SQL on), it is only selected.
    expect(tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: '' }, () => 'c')).toEqual({
      ...start,
      active: 'b',
    });
  });

  it('selects the tab already holding it rather than opening another', () => {
    const start: TabsState = {
      tabs: [
        tab({ id: 'a', name: 'Query 1' }),
        tab({ id: 'b', name: 'Top EMEA orders', saved: { id: 'q-top', name: 'Top EMEA orders', description: '' } }),
      ],
      active: 'a',
    };
    const opened = tabsReducer(start, { kind: 'open-saved', query: saved, sourceId: 'emea' }, () => 'c');
    expect(opened).toEqual({ ...start, active: 'b' });
  });

  it('renames the saved query its tabs hold, and the tab named after it', () => {
    const start: TabsState = {
      tabs: [
        tab({ id: 'a', name: 'Top EMEA orders', saved: { id: 'q-top', name: 'Top EMEA orders', description: 'd' } }),
        tab({ id: 'b', name: 'Mine', saved: { id: 'q-top', name: 'Top EMEA orders', description: 'd' } }),
        tab({ id: 'c', name: 'Top EMEA orders' }),
      ],
      active: 'a',
    };
    const renamed = tabsReducer(start, { kind: 'saved-renamed', savedId: 'q-top', name: 'EMEA month end' });
    expect(renamed.tabs.map((each) => [each.name, each.saved?.name])).toEqual([
      ['EMEA month end', 'EMEA month end'],
      ['Mine', 'EMEA month end'],
      ['Top EMEA orders', undefined],
    ]);
  });
});

/**
 * T818 (AC-465): a History row's SQL and values go into the current tab
 * (`put-back`, and Undo is another `put-back` of what it held) or into a new
 * tab on the row's source (`open` with its values); nothing runs.
 */
describe('a History row put back (T818, AC-465)', () => {
  it('puts SQL and values into a tab, its types too, leaving its source and its run', () => {
    const start: TabsState = {
      tabs: [tab({ id: 'a', name: 'Query 1', sourceId: 'emea', sql: 'SELECT 1', params: { x: '1' } })],
      active: 'a',
    };
    const put = tabsReducer(start, {
      kind: 'put-back',
      id: 'a',
      sql: 'SELECT * FROM t WHERE n > {{n}}',
      params: { n: '7' },
      paramTypes: { n: 'number' },
    });
    expect(put.tabs[0]).toEqual(
      tab({
        id: 'a',
        name: 'Query 1',
        sourceId: 'emea',
        sql: 'SELECT * FROM t WHERE n > {{n}}',
        params: { n: '7' },
        paramTypes: { n: 'number' },
      }),
    );
    // Undo: what it held, types and all.
    const back = tabsReducer(put, { kind: 'put-back', id: 'a', sql: 'SELECT 1', params: { x: '1' } });
    expect(back).toEqual(start);
  });

  it('opens a new tab with the values, on the row’s source', () => {
    const start: TabsState = { tabs: [tab({ id: 'a', name: 'Query 1', sourceId: 'emea' })], active: 'a' };
    const opened = tabsReducer(
      start,
      {
        kind: 'open',
        sourceId: 'fx',
        sql: 'SELECT {{d}}',
        name: 'From History · 14:10',
        params: { d: '2026-07-01' },
        paramTypes: { d: 'date' },
      },
      () => 'b',
    );
    expect(opened.active).toBe('b');
    expect(opened.tabs[1]).toEqual(
      tab({
        id: 'b',
        name: 'From History · 14:10',
        sourceId: 'fx',
        sql: 'SELECT {{d}}',
        params: { d: '2026-07-01' },
        paramTypes: { d: 'date' },
      }),
    );
    expect(opened.tabs[0]).toEqual(start.tabs[0]);
  });
});
