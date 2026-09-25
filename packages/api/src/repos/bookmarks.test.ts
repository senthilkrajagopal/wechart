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

describe('bookmark store', () => {
  it('keeps the page tab, every filter value and the mark set, under the name given', async () => {
    const dashboardId = `d-${randomUUID()}`;

    const saved = await store().save({ dashboardId, name: 'Shipped last year', state: STATE });
    const listed = await store().list(dashboardId);

    expect(listed).toEqual([
      { id: saved.id, dashboardId, name: 'Shipped last year', state: STATE },
    ]);
  });

  it('lists a dashboard’s own bookmarks, by name, and no other’s', async () => {
    const dashboardId = `d-${randomUUID()}`;
    await store().save({ dashboardId, name: 'b', state: STATE });
    await store().save({ dashboardId, name: 'a', state: STATE });
    await store().save({ dashboardId: `d-${randomUUID()}`, name: 'elsewhere', state: STATE });

    expect((await store().list(dashboardId)).map((each) => each.name)).toEqual(['a', 'b']);
  });

  it('removes a dashboard’s bookmarks, and no other’s (T127’s review)', async () => {
    const gone = `d-${randomUUID()}`;
    const kept = `d-${randomUUID()}`;
    await store().save({ dashboardId: gone, name: 'a', state: STATE });
    await store().save({ dashboardId: gone, name: 'b', state: STATE });
    await store().save({ dashboardId: kept, name: 'a', state: STATE });

    await store().removeFor(gone);

    expect(await store().list(gone)).toEqual([]);
    expect((await store().list(kept)).map((each) => each.name)).toEqual(['a']);
  });

  it('replaces the bookmark of a name already in use on the dashboard', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const first = await store().save({ dashboardId, name: 'Mine', state: STATE });
    const again = { ...STATE, page: 'page-3' };

    const second = await store().save({ dashboardId, name: 'Mine', state: again });

    expect(second.id).toBe(first.id);
    expect(await store().list(dashboardId)).toEqual([
      { id: first.id, dashboardId, name: 'Mine', state: again },
    ]);
  });
});
