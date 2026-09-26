import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { bookmarkStore } from './bookmarks';

/**
 * T127 / AC-121: WHEN the user saves a bookmark, THE SYSTEM SHALL store the
 * page tab, the filter values and the current marks under a name the user
 * gives.
 * Fails when: applying the bookmark restores a different tab, filter value or
 * mark set.
 *
 * Kept in the metadata database as a `bookmark` document (AC-014 names the
 * kind), beside the dashboard it is of and never in it: applying one must not
 * change the dashboard for anyone else (AC-122).
 */
const store = () => bookmarkStore(getDb());

afterAll(async () => {
  await closeDb();
});

const STATE = {
  page: 'page-2',
  filters: {
    'f-status orders.status': { kind: 'values', values: ['shipped', 'completed'] },
    'f-date orders.created_at': { kind: 'preset', preset: 'last year' },
  },
  marks: {
    'marking-1': {
      items: [[{ member: 'orders.status', value: 'shipped' }]],
      ranges: [],
    },
  },
};

/** Phase 1's one user, whose key is `admin` (auth/user.ts): who saves these. */
const ME = 'admin';

describe('bookmark store', () => {
  it('keeps the page tab, every filter value and the mark set, under the name given', async () => {
    const dashboardId = `d-${randomUUID()}`;

    const saved = await store().save({
      dashboardId,
      name: 'Shipped last year',
      state: STATE,
      owner: ME,
    });
    const listed = await store().list(dashboardId, ME);

    expect(listed).toEqual([
      { id: saved.id, dashboardId, name: 'Shipped last year', state: STATE, owner: ME },
    ]);
  });

  it('lists a dashboard’s own bookmarks, by name, and no other’s', async () => {
    const dashboardId = `d-${randomUUID()}`;
    await store().save({ dashboardId, name: 'b', state: STATE, owner: ME });
    await store().save({ dashboardId, name: 'a', state: STATE, owner: ME });
    await store().save({
      dashboardId: `d-${randomUUID()}`,
      name: 'elsewhere',
      state: STATE,
      owner: ME,
    });

    expect((await store().list(dashboardId, ME)).map((each) => each.name)).toEqual(['a', 'b']);
  });

  it('removes a dashboard’s bookmarks, and no other’s (T127’s review)', async () => {
    const gone = `d-${randomUUID()}`;
    const kept = `d-${randomUUID()}`;
    await store().save({ dashboardId: gone, name: 'a', state: STATE, owner: ME });
    // Everyone's: they go with the dashboard.
    await store().save({ dashboardId: gone, name: 'b', state: STATE, owner: 'writer' });
    await store().save({ dashboardId: kept, name: 'a', state: STATE, owner: ME });

    await store().removeFor(gone);

    expect(await store().list(gone, ME)).toEqual([]);
    expect(await store().list(gone, 'writer')).toEqual([]);
    expect((await store().list(kept, ME)).map((each) => each.name)).toEqual(['a']);
  });

  it('replaces the bookmark of a name already in use on the dashboard', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const first = await store().save({ dashboardId, name: 'Mine', state: STATE, owner: ME });
    const again = { ...STATE, page: 'page-3' };

    const second = await store().save({ dashboardId, name: 'Mine', state: again, owner: ME });

    expect(second.id).toBe(first.id);
    expect(await store().list(dashboardId, ME)).toEqual([
      { id: first.id, dashboardId, name: 'Mine', state: again, owner: ME },
    ]);
  });
});

/**
 * T366, AC-292: WHEN a user saves a bookmark, THE SYSTEM SHALL keep it theirs,
 * listed on the dashboard for them alone.
 * `Fails when: another user sees a bookmark its owner hasn't shared.`
 */
describe('each bookmark its saver’s own (T366, AC-292)', () => {
  it('lists a bookmark for the user who saved it, and for nobody else', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const mine = await store().save({ dashboardId, name: 'Mine', state: STATE, owner: 'writer' });

    expect(await store().list(dashboardId, 'writer')).toEqual([
      { id: mine.id, dashboardId, name: 'Mine', state: STATE, owner: 'writer' },
    ]);
    expect(await store().list(dashboardId, 'reader')).toEqual([]);
    expect(await store().list(dashboardId, 'super')).toEqual([]);
  });

  it('keeps names unique per owner: the same name saved by two people is two bookmarks', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const writers = await store().save({ dashboardId, name: 'Q3', state: STATE, owner: 'writer' });
    const readers = await store().save({
      dashboardId,
      name: 'Q3',
      state: { ...STATE, page: 'page-9' },
      owner: 'reader',
    });
    expect(readers.id).not.toBe(writers.id);

    // Saved again by its owner: that one replaced, the other left alone.
    const again = await store().save({
      dashboardId,
      name: 'Q3',
      state: { ...STATE, page: 'page-3' },
      owner: 'writer',
    });
    expect(again.id).toBe(writers.id);
    expect((await store().list(dashboardId, 'writer')).map((each) => each.state['page'])).toEqual([
      'page-3',
    ]);
    expect((await store().list(dashboardId, 'reader')).map((each) => each.state['page'])).toEqual([
      'page-9',
    ]);
  });
});
