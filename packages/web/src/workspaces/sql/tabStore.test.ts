import { describe, expect, it } from 'vitest';

import { keepTabs, keptTabs, tabsKeyOf } from './tabStore';
import type { SqlTab, TabsState } from './tabs';

/**
 * T801 (AC-451): THE SYSTEM SHALL keep a user's open tabs (each one's name,
 * data source, SQL and parameters) in that browser only, for that signed-in
 * user, restoring them on reload, and SHALL keep no tab on wechart's server.
 * Fails when: another user signed in to the same browser sees it; or a
 * reload loses an open tab.
 */
const tab = (over: Partial<SqlTab> & Pick<SqlTab, 'id' | 'name'>): SqlTab => ({
  sourceId: 'emea',
  sql: '',
  params: {},
  savedSql: null,
  lastRunSql: null,
  run: null,
  ...over,
});

/** A Storage of its own, as one browser's. */
function storage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const kept: TabsState = {
  tabs: [
    tab({ id: 'qa1b2c3d', name: 'orders check', sql: 'SELECT 1', params: { region: 'EMEA' } }),
    tab({ id: 'qe4f5a6b', name: 'Query 2', sourceId: 'fx', sql: 'SELECT 2' }),
  ],
  active: 'qe4f5a6b',
};

describe('open tabs kept in this browser, for this user (T801, AC-451)', () => {
  it('keeps each tab’s name, data source, SQL and parameters, and which is open', () => {
    const browser = storage();

    keepTabs(browser, 'wren@example.com', kept);

    expect(keptTabs(browser, 'wren@example.com')).toEqual(kept);
  });

  it('keeps them under a key holding the user’s id', () => {
    const browser = storage();

    keepTabs(browser, 'wren@example.com', kept);

    expect(tabsKeyOf('wren@example.com')).toContain('wren@example.com');
    expect(browser.getItem(tabsKeyOf('wren@example.com'))).not.toBeNull();
  });

  it('shows another user signed in to the same browser none of them', () => {
    const browser = storage();

    keepTabs(browser, 'wren@example.com', kept);

    expect(keptTabs(browser, 'ada@example.com')).toBeNull();
  });

  it('keeps no result, which a reload reads as not run yet', () => {
    const browser = storage();
    const ran: TabsState = {
      tabs: [
        tab({
          id: 'qa',
          name: 'Q',
          sql: 'SELECT 1',
          lastRunSql: 'SELECT 1',
          run: {
            kind: 'done',
            at: 1,
            sql: 'SELECT 1',
            outcome: { outcome: 'busy', error: 'xcube is busy.' },
          },
        }),
      ],
      active: 'qa',
    };

    keepTabs(browser, 'wren', ran);

    expect(keptTabs(browser, 'wren')?.tabs[0]).toEqual({ ...ran.tabs[0], run: null });
  });

  // T804 (AC-452): leaving the workspace loads another page, and the run goes on.
  it('keeps a run going, as one this page didn’t start, for the workspace to follow on return', () => {
    const browser = storage();
    const going: TabsState = {
      tabs: [tab({ id: 'qa', name: 'Q', sql: 'SELECT 1', lastRunSql: 'SELECT 1', run: { kind: 'running', at: 1 } })],
      active: 'qa',
    };

    keepTabs(browser, 'wren', going);

    const before = Date.now();
    const read = keptTabs(browser, 'wren')?.tabs[0];
    expect(read).toEqual({ ...going.tabs[0], run: { kind: 'running', at: 1, kept: expect.any(Number) as number } });
    // Followed from now on: what wechart's server says after this is news.
    expect(read?.run?.kind === 'running' ? read.run.kept : 0).toBeGreaterThanOrEqual(before);
  });

  it('reads nothing kept from what isn’t its shape, never failing the page', () => {
    const browser = storage();
    browser.setItem(tabsKeyOf('wren'), '{"tabs": "no"}');
    expect(keptTabs(browser, 'wren')).toBeNull();
    browser.setItem(tabsKeyOf('wren'), 'not JSON');
    expect(keptTabs(browser, 'wren')).toBeNull();
    browser.setItem(tabsKeyOf('wren'), JSON.stringify({ tabs: [], active: '' }));
    expect(keptTabs(browser, 'wren')).toBeNull();
  });

  it('opens the first kept tab when the one kept open is gone', () => {
    const browser = storage();
    browser.setItem(tabsKeyOf('wren'), JSON.stringify({ ...kept, active: 'gone' }));

    expect(keptTabs(browser, 'wren')?.active).toBe('qa1b2c3d');
  });

  it('survives a browser that keeps nothing', () => {
    const refusing = storage();
    refusing.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    refusing.getItem = () => {
      throw new Error('SecurityError');
    };

    expect(() => {
      keepTabs(refusing, 'wren', kept);
    }).not.toThrow();
    expect(keptTabs(refusing, 'wren')).toBeNull();
    expect(keptTabs(undefined, 'wren')).toBeNull();
  });
});
