import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { calcRequestStore } from './calc-requests';

/**
 * AC-050: WHEN the user requests a calculation the menu cannot express, THE
 * SYSTEM SHALL record a request carrying the chart, the fields in use and the
 * user's description, and show it to the read-write members of the folder
 * whose model defines the chart's cube.
 * Fails when: the request is stored without the chart reference, or is not
 * shown to that folder's read-write members.
 *
 * The store: each request as recorded, listed by the folders it is asked of.
 * Who may see which folder's is the route's (`routes/calc-requests.test.ts`).
 * Against the real Postgres.
 */
const store = () => calcRequestStore(getDb());
const folders: string[] = [];
const folderOf = () => {
  const id = `calc-${randomUUID()}`;
  folders.push(id);
  return id;
};

afterAll(async () => {
  await getDb().deleteFrom('calc_requests').where('folder_id', 'in', folders).execute();
  await closeDb();
});

const FIELDS = {
  measures: ['fsales__orders.total_amount'],
  dimensions: ['fsales__orders.status'],
  timeDimensions: ['fsales__orders.ordered_at'],
  filters: ['fsales__orders.status'],
};

describe('a calculation request (T383, AC-050)', () => {
  it('is kept with its chart, the fields in use, the description and who asked', async () => {
    const folder = folderOf();
    const recorded = await store().record({
      chartId: 'chart-1',
      cube: 'fsales__orders',
      folderId: folder,
      modelPath: 'cubes/orders.yml',
      fields: FIELDS,
      description: 'Margin: total amount less cost, as a share of total amount',
      requestedBy: { key: 'manager-key', name: 'Manager' },
    });

    const [listed] = await store().inFolders([folder]);
    expect(listed).toEqual({
      id: recorded.id,
      chartId: 'chart-1',
      cube: 'fsales__orders',
      folderId: folder,
      modelPath: 'cubes/orders.yml',
      fields: FIELDS,
      description: 'Margin: total amount less cost, as a share of total amount',
      requestedBy: { key: 'manager-key', name: 'Manager' },
      requestedAt: expect.any(Date) as unknown,
      status: 'open',
      resolution: null,
    });
    expect(await store().get(recorded.id)).toEqual(listed);
  });

  it('is listed for the folders it is asked of alone, newest first', async () => {
    const [mine, other] = [folderOf(), folderOf()];
    const ask = (folderId: string, description: string) =>
      store().record({
        chartId: 'chart-2',
        cube: 'orders',
        folderId,
        modelPath: 'orders.yml',
        fields: FIELDS,
        description,
        requestedBy: { key: 'k', name: 'K' },
      });
    const first = await ask(mine, 'first');
    const second = await ask(mine, 'second');
    await ask(other, 'elsewhere');

    expect((await store().inFolders([mine])).map((each) => each.id)).toEqual([second.id, first.id]);
    expect(await store().inFolders([])).toHaveLength(0);
    expect(await store().get(randomUUID())).toBeUndefined();
  });

  /** R60: the Reviews count takes the open ones of the folders the user writes. */
  it('counts the open ones asked of these folders, never a resolved one', async () => {
    const [mine, other] = [folderOf(), folderOf()];
    const ask = (folderId: string) =>
      store().record({
        chartId: 'chart-3',
        cube: 'orders',
        folderId,
        modelPath: 'orders.yml',
        fields: FIELDS,
        description: 'counted',
        requestedBy: { key: 'k', name: 'K' },
      });
    const resolved = await ask(mine);
    await ask(mine);
    await ask(other);
    await getDb()
      .updateTable('calc_requests')
      .set({ status: 'resolved' })
      .where('id', '=', resolved.id)
      .execute();

    expect(await store().openCount([mine])).toBe(1);
    expect(await store().openCount([mine, other])).toBe(2);
    expect(await store().openCount([])).toBe(0);
    expect(await store().openCount('all')).toBeGreaterThanOrEqual(2);
  });
});

/**
 * AC-052 (amended 2026-10-04, R63): WHEN a requested measure is added to the
 * model and its proposal is approved into the folder, THE SYSTEM SHALL mark
 * the request as resolved and name the member that resolves it. A requested
 * measure is one that a proposal adds to the request's cube, where the
 * proposal's author took the request up.
 *
 * The store: the open requests a member took up, in whatever folder, each
 * with who took it up (T590: a view's request may sit in a folder beneath the
 * cube its measure lands on); and a request resolved once, with the members
 * that resolve it, the proposal, its author and its approver.
 */
describe('a calculation request resolved (T385, T590, AC-052)', () => {
  const ask = (folderId: string, description: string) =>
    store().record({
      chartId: 'chart-4',
      cube: 'fsales__orders',
      folderId,
      modelPath: 'cubes/orders.yml',
      fields: FIELDS,
      description,
      requestedBy: { key: 'manager-key', name: 'Manager' },
    });

  it('lists the open ones a member took up, in any folder, each with the keys of those who took it up', async () => {
    const [mine, other] = [folderOf(), folderOf()];
    const taker = `taker-${randomUUID()}`;
    const taken = await ask(mine, 'taken');
    await ask(mine, 'untaken');
    const elsewhere = await ask(other, 'elsewhere');
    await store().take(taken.id, { key: taker, name: 'Writer' });
    await store().take(taken.id, { key: 'super-key', name: 'Super' });
    await store().take(elsewhere.id, { key: taker, name: 'Writer' });

    expect(await store().openTakenBy(taker)).toEqual([
      { id: elsewhere.id, cube: 'fsales__orders', folderId: other, takenBy: [taker] },
      {
        id: taken.id,
        cube: 'fsales__orders',
        folderId: mine,
        takenBy: [taker, 'super-key'],
      },
    ]);
    expect(await store().openTakenBy(`nobody-${randomUUID()}`)).toEqual([]);
  });

  it('is resolved once, with the members that resolve it, the proposal, its author and its approver', async () => {
    const folder = folderOf();
    const asked = await ask(folder, 'resolved');
    const taker = `taker-${randomUUID()}`;
    await store().take(asked.id, { key: taker, name: 'Writer' });
    const proposalId = randomUUID();

    expect(
      await store().resolve(asked.id, {
        members: ['fsales__orders.margin', 'fsales__orders.margin_share'],
        proposalId,
        by: { key: 'writer-key', name: 'Writer' },
        approvedBy: 'Super',
      }),
    ).toBe(true);
    const resolved = await store().get(asked.id);
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolution).toEqual({
      members: ['fsales__orders.margin', 'fsales__orders.margin_share'],
      proposalId,
      by: { key: 'writer-key', name: 'Writer' },
      approvedBy: 'Super',
      at: expect.any(Date) as unknown,
    });

    // Once: a later approval changes nothing, and it is open no more.
    expect(
      await store().resolve(asked.id, {
        members: ['fsales__orders.other'],
        proposalId: randomUUID(),
        by: { key: 'super-key', name: 'Super' },
        approvedBy: 'Super',
      }),
    ).toBe(false);
    expect((await store().get(asked.id))?.resolution?.members).toEqual([
      'fsales__orders.margin',
      'fsales__orders.margin_share',
    ]);
    expect(await store().openTakenBy(taker)).toEqual([]);
    expect(await store().openCount([folder])).toBe(0);
  });
});
