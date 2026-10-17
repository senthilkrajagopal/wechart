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
      {
        id: saved.id,
        dashboardId,
        name: 'Shipped last year',
        state: STATE,
        owner: ME,
        ownerName: '',
        shared: false,
        savedAt: saved.savedAt,
      },
    ]);
  });

  /**
   * T742 (design-10-Q2): each row shows the date the bookmark was first
   * saved, the one the list is ordered by (R61). Saved again under its name,
   * it keeps that date.
   */
  it('dates a bookmark by when it was first saved, kept when it is saved again (T742)', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const before = Date.now();
    const first = await store().save({ dashboardId, name: 'Dated', state: STATE, owner: ME });
    const after = Date.now();

    expect(first.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    // The database's clock and this one's, a second apart at most.
    expect(Date.parse(first.savedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(first.savedAt)).toBeLessThanOrEqual(after + 1000);

    const again = await store().save({
      dashboardId,
      name: 'Dated',
      state: { ...STATE, page: 'page-3' },
      owner: ME,
    });
    expect(again.savedAt).toBe(first.savedAt);
    expect((await store().list(dashboardId, ME))[0]?.savedAt).toBe(first.savedAt);
  });

  // Newest first, as rule 81 has it (T367), where T127 listed them by name.
  it('lists a dashboard’s own bookmarks, newest first, and no other’s', async () => {
    const dashboardId = `d-${randomUUID()}`;
    await store().save({ dashboardId, name: 'a', state: STATE, owner: ME });
    await store().save({ dashboardId, name: 'c', state: STATE, owner: ME });
    await store().save({ dashboardId, name: 'b', state: STATE, owner: ME });
    await store().save({
      dashboardId: `d-${randomUUID()}`,
      name: 'elsewhere',
      state: STATE,
      owner: ME,
    });

    expect((await store().list(dashboardId, ME)).map((each) => each.name)).toEqual(['b', 'c', 'a']);
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
      {
        id: first.id,
        dashboardId,
        name: 'Mine',
        state: again,
        owner: ME,
        ownerName: '',
        shared: false,
        savedAt: first.savedAt,
      },
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
      {
        id: mine.id,
        dashboardId,
        name: 'Mine',
        state: STATE,
        owner: 'writer',
        ownerName: '',
        shared: false,
        savedAt: mine.savedAt,
      },
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

/**
 * T367, AC-293: WHEN a user shares a bookmark, THE SYSTEM SHALL list it for
 * everyone who may see the dashboard, labelled with who shared it. Only its
 * owner SHALL be able to change or unshare it.
 * `Fails when: someone who may see the dashboard doesn't see a shared
 * bookmark, or someone other than its owner can change or unshare it.`
 *
 * The store's part: a shared one listed for every viewer, after their own,
 * newest first within each (rule 81), with its owner's name; changed and
 * removed by its owner alone. Who may see the dashboard is the route's.
 */
describe('shared bookmarks (T367, AC-293)', () => {
  const names = (listed: readonly { name: string }[]) => listed.map((each) => each.name);

  it('lists the viewer’s own newest first, then those others share, newest first', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const save = (name: string, owner: string, ownerName: string) =>
      store().save({ dashboardId, name, state: STATE, owner, ownerName });
    const w1 = await save('w1', 'writer', 'Wren Writer');
    await save('w2', 'writer', 'Wren Writer');
    await save('r1', 'reader', 'Rae Reader');
    const w3 = await save('w3', 'writer', 'Wren Writer');
    await save('r2', 'reader', 'Rae Reader');
    for (const { id } of [w1, w3])
      expect((await store().change(dashboardId, id, 'writer', { shared: true }))?.shared).toBe(
        true,
      );

    const readers = await store().list(dashboardId, 'reader');
    expect(names(readers)).toEqual(['r2', 'r1', 'w3', 'w1']);
    expect(readers.map(({ owner, ownerName, shared }) => [owner, ownerName, shared])).toEqual([
      ['reader', 'Rae Reader', false],
      ['reader', 'Rae Reader', false],
      ['writer', 'Wren Writer', true],
      ['writer', 'Wren Writer', true],
    ]);
    // Their own, shared or not; nobody else's unshared one.
    expect(names(await store().list(dashboardId, 'writer'))).toEqual(['w3', 'w2', 'w1']);
    expect(names(await store().list(dashboardId, 'super'))).toEqual(['w3', 'w1']);
    // Of this dashboard alone.
    expect(await store().list(`d-${randomUUID()}`, 'reader')).toEqual([]);
  });

  it('saves a new one unshared, and one saved again under its name stays as shared as it was', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const first = await store().save({ dashboardId, name: 'Q3', state: STATE, owner: 'writer' });
    expect(first.shared).toBe(false);
    await store().change(dashboardId, first.id, 'writer', { shared: true });

    const again = await store().save({
      dashboardId,
      name: 'Q3',
      state: { ...STATE, page: 'page-3' },
      owner: 'writer',
      ownerName: 'Wren Writer',
    });

    expect(again).toEqual({
      ...first,
      state: { ...STATE, page: 'page-3' },
      shared: true,
      ownerName: 'Wren Writer',
    });
    expect(await store().get(dashboardId, first.id)).toEqual(again);
  });

  it('changes a bookmark’s name, state and sharing for its owner, and for nobody else', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const mine = await store().save({
      dashboardId,
      name: 'Mine',
      state: STATE,
      owner: 'writer',
      ownerName: 'Wren Writer',
    });
    await store().change(dashboardId, mine.id, 'writer', { shared: true });

    for (const changes of [{ shared: false }, { name: 'Taken' }, { state: { page: 'p9' } }])
      expect(await store().change(dashboardId, mine.id, 'reader', changes)).toBeUndefined();
    // Nor through another dashboard.
    expect(
      await store().change(`d-${randomUUID()}`, mine.id, 'writer', { name: 'Elsewhere' }),
    ).toBeUndefined();
    expect(await store().get(dashboardId, mine.id)).toEqual({ ...mine, shared: true });

    const changed = await store().change(dashboardId, mine.id, 'writer', {
      name: 'Renamed',
      state: { ...STATE, page: 'page-4' },
      shared: false,
      ownerName: 'Wren W.',
    });
    expect(changed).toEqual({
      ...mine,
      name: 'Renamed',
      state: { ...STATE, page: 'page-4' },
      shared: false,
      ownerName: 'Wren W.',
    });
    expect(await store().get(dashboardId, mine.id)).toEqual(changed);
  });

  it('removes a bookmark for its owner, and for nobody else', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const mine = await store().save({ dashboardId, name: 'Mine', state: STATE, owner: 'writer' });
    await store().change(dashboardId, mine.id, 'writer', { shared: true });

    expect(await store().remove(dashboardId, mine.id, 'reader')).toBe(false);
    expect(await store().remove(`d-${randomUUID()}`, mine.id, 'writer')).toBe(false);
    expect(names(await store().list(dashboardId, 'reader'))).toEqual(['Mine']);

    expect(await store().remove(dashboardId, mine.id, 'writer')).toBe(true);
    expect(await store().get(dashboardId, mine.id)).toBeUndefined();
    expect(await store().list(dashboardId, 'reader')).toEqual([]);
  });

  it('finds one by id on its own dashboard, whoever’s, and not on another', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const theirs = await store().save({ dashboardId, name: 'x', state: STATE, owner: 'writer' });

    expect(await store().get(dashboardId, theirs.id)).toEqual(theirs);
    expect(await store().get(`d-${randomUUID()}`, theirs.id)).toBeUndefined();
    expect(await store().get(dashboardId, randomUUID())).toBeUndefined();
  });
});

/**
 * T580 (AC-293, amended 2026-10-04 by R61): a Super-Admin may delete any
 * shared bookmark. The store's part: one removed while it is shared, whoever's,
 * and none that isn't. That the asker is a Super-Admin is the route's.
 */
describe('a shared bookmark removed by a Super-Admin (T580)', () => {
  it('removes one that is shared, whoever’s, and none unshared or of another dashboard', async () => {
    const dashboardId = `d-${randomUUID()}`;
    const shared = await store().save({ dashboardId, name: 's', state: STATE, owner: 'writer' });
    await store().change(dashboardId, shared.id, 'writer', { shared: true });
    const unshared = await store().save({ dashboardId, name: 'u', state: STATE, owner: 'writer' });

    expect(await store().removeShared(dashboardId, unshared.id)).toBe(false);
    expect(await store().removeShared(`d-${randomUUID()}`, shared.id)).toBe(false);
    expect((await store().list(dashboardId, 'writer')).map((each) => each.name)).toEqual([
      'u',
      's',
    ]);

    expect(await store().removeShared(dashboardId, shared.id)).toBe(true);
    expect(await store().get(dashboardId, shared.id)).toBeUndefined();
    expect((await store().list(dashboardId, 'writer')).map((each) => each.name)).toEqual(['u']);
  });
});
