import { describe, expect, it } from 'vitest';

import type { Config } from './config';
import type { Bookmark, BookmarkStore } from './repos/bookmarks';
import { buildServer, type DocumentWriter } from './server';

/**
 * T127 / AC-121: WHEN the user saves a bookmark, THE SYSTEM SHALL store the
 * page tab, the filter values and the current marks under a name the user
 * gives.
 * Fails when: applying the bookmark restores a different tab, filter value or
 * mark set.
 *
 * The routes: a dashboard's bookmarks listed, and one saved under a name. What
 * the state holds is checked by the browser as it applies it, as a URL is;
 * here only that it is the page, filters and marks.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api/v1',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};

/** When the memory store says each was first saved (T742). */
const SAVED_AT = '2026-09-22T09:30:00.000Z';

/** In memory, as the store keeps them (`repos/bookmarks.ts`): newest last here, first listed. */
function memoryBookmarks(): BookmarkStore & { saved: Bookmark[] } {
  const saved: Bookmark[] = [];
  const of = (dashboardId: string, id: string) =>
    saved.find((each) => each.dashboardId === dashboardId && each.id === id);
  return {
    saved,
    list: async (dashboardId, viewer) => {
      const here = saved.filter((each) => each.dashboardId === dashboardId).reverse();
      return [
        ...here.filter((each) => each.owner === viewer),
        ...here.filter((each) => each.owner !== viewer && each.shared),
      ];
    },
    save: async ({ ownerName = '', ...bookmark }) => {
      const kept = {
        id: `b${String(saved.length + 1)}`,
        ...bookmark,
        ownerName,
        shared: false,
        savedAt: SAVED_AT,
      };
      saved.push(kept);
      return kept;
    },
    get: async (dashboardId, id) => of(dashboardId, id),
    change: async (dashboardId, id, owner, changes) => {
      const found = of(dashboardId, id);
      if (found?.owner !== owner) return undefined;
      const changed = { ...found, ...changes };
      saved.splice(saved.indexOf(found), 1, changed);
      return changed;
    },
    remove: async (dashboardId, id, owner) => {
      const found = of(dashboardId, id);
      if (found?.owner !== owner) return false;
      saved.splice(saved.indexOf(found), 1);
      return true;
    },
    removeShared: async (dashboardId, id) => {
      const found = of(dashboardId, id);
      if (found?.shared !== true) return false;
      saved.splice(saved.indexOf(found), 1);
      return true;
    },
    removeFor: async (dashboardId) => {
      saved.splice(0, saved.length, ...saved.filter((each) => each.dashboardId !== dashboardId));
    },
  };
}

/** A metadata store holding one dashboard, `d1`. */
const oneDashboard = {
  create: async () => ({ id: '' }),
  get: async (kind: string, id: string) =>
    kind === 'dashboard' && id === 'd1' ? { id, body: { title: 'Sales' }, version: 1 } : null,
  remove: async (kind: string, id: string) => kind === 'dashboard' && id === 'd1',
} as DocumentWriter;

const STATE = {
  page: 'page-2',
  filters: { 'f-status orders.status': { kind: 'values', values: ['shipped'] } },
  marks: { 'marking-1': { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] } },
};

describe('a dashboard’s bookmarks', () => {
  it('are saved under the name given, trimmed, with the state as sent, and listed', async () => {
    const bookmarks = memoryBookmarks();
    const app = buildServer({ config, bookmarks, documents: oneDashboard });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/dashboards/d1/bookmarks',
      payload: { name: '  Shipped  ', state: STATE },
    });
    const listed = await app.inject({ method: 'GET', url: '/api/dashboards/d1/bookmarks' });

    // Phase 1's one user's (T366, AC-292), and "Only me" (T367, rule 81).
    const bookmark = {
      id: 'b1',
      dashboardId: 'd1',
      name: 'Shipped',
      state: STATE,
      shared: false,
      mine: true,
      mayDelete: true,
      // When it was first saved, for its row (T742; design-10-Q2).
      savedAt: SAVED_AT,
    };
    expect([saved.statusCode, saved.json()]).toEqual([201, bookmark]);
    expect(listed.json()).toEqual({ bookmarks: [bookmark] });
    expect(bookmarks.saved).toEqual([
      {
        id: 'b1',
        dashboardId: 'd1',
        name: 'Shipped',
        state: STATE,
        owner: 'admin',
        ownerName: 'admin',
        shared: false,
        savedAt: SAVED_AT,
      },
    ]);
    await app.close();
  });

  /**
   * T367 (AC-293), with sign-in off: the one user is every bookmark's owner,
   * and shares, renames, updates and deletes their own. Signed in, others'
   * are refused them (`access/bookmarks.test.ts`).
   */
  it('are shared, renamed, updated and deleted by their owner, the one user', async () => {
    const bookmarks = memoryBookmarks();
    const app = buildServer({ config, bookmarks, documents: oneDashboard });
    const change = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: '/api/dashboards/d1/bookmarks/b1', payload });
    await app.inject({
      method: 'POST',
      url: '/api/dashboards/d1/bookmarks',
      payload: { name: 'Shipped', state: STATE },
    });

    const shared = await change({ shared: true });
    const renamed = await change({ name: 'Shipped, shared' });
    const updated = await change({ state: { ...STATE, page: 'page-3' } });

    const after = {
      id: 'b1',
      dashboardId: 'd1',
      name: 'Shipped, shared',
      state: { ...STATE, page: 'page-3' },
      shared: true,
      mine: true,
      mayDelete: true,
      // Still when it was first saved: a change isn't a new save (T742).
      savedAt: SAVED_AT,
    };
    expect([shared.statusCode, renamed.statusCode, updated.statusCode]).toEqual([200, 200, 200]);
    expect(updated.json()).toEqual(after);
    expect(
      (await app.inject({ method: 'GET', url: '/api/dashboards/d1/bookmarks' })).json(),
    ).toEqual({ bookmarks: [after] });

    const deleted = await app.inject({ method: 'DELETE', url: '/api/dashboards/d1/bookmarks/b1' });
    expect(deleted.statusCode).toBe(204);
    expect(bookmarks.saved).toEqual([]);
    const again = await app.inject({ method: 'DELETE', url: '/api/dashboards/d1/bookmarks/b1' });
    expect([again.statusCode, again.json()]).toEqual([404, { error: 'No such bookmark.' }]);
    await app.close();
  });

  it('are refused without a name, or with a state that isn’t a page, filters and marks', async () => {
    const bookmarks = memoryBookmarks();
    const app = buildServer({ config, bookmarks, documents: oneDashboard });
    const save = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/dashboards/d1/bookmarks', payload });

    const unnamed = await save({ name: '   ', state: STATE });
    const stateless = await save({ name: 'x', state: { page: 'p' } });
    const listed = await save({ name: 'x', state: [] });

    expect([unnamed.statusCode, unnamed.json()]).toEqual([
      400,
      { error: 'A bookmark needs a name.' },
    ]);
    for (const refused of [stateless, listed])
      expect([refused.statusCode, refused.json()]).toEqual([
        400,
        { error: 'A bookmark holds a page tab, filter values and marks.' },
      ]);
    expect(bookmarks.saved).toEqual([]);
    await app.close();
  });

  it('go with their dashboard when it is deleted (T127’s review)', async () => {
    const bookmarks = memoryBookmarks();
    const kept = {
      state: STATE,
      owner: 'admin',
      ownerName: 'admin',
      shared: false,
      savedAt: SAVED_AT,
    };
    bookmarks.saved.push(
      { id: 'b1', dashboardId: 'd1', name: 'x', ...kept },
      { id: 'b2', dashboardId: 'd2', name: 'y', ...kept },
    );
    const app = buildServer({ config, bookmarks, documents: oneDashboard });

    const deleted = await app.inject({ method: 'DELETE', url: '/api/documents/dashboard/d1' });

    expect(deleted.statusCode).toBe(204);
    expect(bookmarks.saved.map((each) => each.id)).toEqual(['b2']);
    await app.close();
  });

  it('are of a dashboard that exists', async () => {
    const bookmarks = memoryBookmarks();
    const app = buildServer({ config, bookmarks, documents: oneDashboard });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/dashboards/nope/bookmarks',
      payload: { name: 'x', state: STATE },
    });

    expect([saved.statusCode, saved.json()]).toEqual([404, { error: 'No such dashboard.' }]);
    expect(bookmarks.saved).toEqual([]);
    await app.close();
  });
});
