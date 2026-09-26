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

function memoryBookmarks(): BookmarkStore & { saved: Bookmark[] } {
  const saved: Bookmark[] = [];
  return {
    saved,
    list: async (dashboardId, owner) =>
      saved.filter((each) => each.dashboardId === dashboardId && each.owner === owner),
    save: async (bookmark) => {
      const kept = { id: `b${String(saved.length + 1)}`, ...bookmark };
      saved.push(kept);
      return kept;
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

    // Phase 1's one user's (T366, AC-292).
    const bookmark = { id: 'b1', dashboardId: 'd1', name: 'Shipped', state: STATE, owner: 'admin' };
    expect([saved.statusCode, saved.json()]).toEqual([201, bookmark]);
    expect(listed.json()).toEqual({ bookmarks: [bookmark] });
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
    bookmarks.saved.push(
      { id: 'b1', dashboardId: 'd1', name: 'x', state: STATE, owner: 'admin' },
      { id: 'b2', dashboardId: 'd2', name: 'y', state: STATE, owner: 'admin' },
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
