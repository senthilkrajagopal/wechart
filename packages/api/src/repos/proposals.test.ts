import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { OpenProposalError, proposalStore, type NewProposal } from './proposals';

/**
 * T349 (AC-284): a proposal records the items it would land, as they were
 * when proposed, the folder, the author, the time and an optional
 * description of at most 1,000 characters. An item waits in one open
 * proposal at a time.
 */
const run = randomUUID().slice(0, 8);
const wren = { key: `wren-${run}`, name: 'Wren Writer' };
const emea = `emea-${run}`;
const store = () => proposalStore(getDb());

afterAll(async () => {
  await getDb().deleteFrom('proposals').where('author_key', '=', wren.key).execute();
  await closeDb();
});

const dashboard = (id: string): NewProposal => ({
  author: wren,
  targetFolderId: emea,
  description: 'Adds a monthly EMEA revenue chart by country.',
  items: [
    {
      kind: 'dashboard',
      id,
      title: 'Revenue overview',
      version: 4,
      snapshot: { title: 'Revenue overview', folderId: `ws:${wren.key}`, charts: [`c1-${id}`] },
      landsIn: emea,
      replaces: { id: 'shared-board', version: 7 },
    },
    {
      kind: 'chart',
      id: `c1-${id}`,
      title: 'Revenue by month',
      version: 2,
      snapshot: { title: 'Revenue by month', localToDashboardId: id },
      landsIn: emea,
      replaces: null,
    },
  ],
});

describe('the proposals store (T349, AC-284)', () => {
  it('records the items as proposed, the folder, the author, the time and the description', async () => {
    const id = `board-${run}-1`;
    const before = Date.now();
    const made = await store().create(dashboard(id));

    const read = await store().get(made.id);
    expect(read).toEqual(made);
    expect(read).toMatchObject({
      kind: 'dashboard',
      itemId: id,
      title: 'Revenue overview',
      targetFolderId: emea,
      author: wren,
      description: 'Adds a monthly EMEA revenue chart by country.',
      status: 'open',
      replaces: { id: 'shared-board', version: 7 },
      decision: null,
    });
    expect(read!.proposedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(
      read!.items.map((item) => [item.kind, item.id, item.version, item.landsIn, item.replaces]),
    ).toEqual([
      ['dashboard', id, 4, emea, { id: 'shared-board', version: 7 }],
      ['chart', `c1-${id}`, 2, emea, null],
    ]);
    expect(read!.items[1]!.snapshot).toEqual({ title: 'Revenue by month', localToDashboardId: id });
  });

  it('keeps no description as none', async () => {
    const made = await store().create({ ...dashboard(`board-${run}-2`), description: null });
    expect((await store().get(made.id))!.description).toBeNull();
  });

  it('refuses a description over 1,000 characters, counted in code points', async () => {
    const id = `board-${run}-3`;
    // 1,000 code points, some outside the basic plane, fit.
    const fits = '😀'.repeat(10) + 'a'.repeat(990);
    expect((await store().create({ ...dashboard(id), description: fits })).description).toBe(fits);
    await expect(
      store().create({ ...dashboard(`board-${run}-4`), description: 'a'.repeat(1001) }),
    ).rejects.toHaveProperty('constraint', 'proposals_description_length');
  });

  it('holds a chart going with a dashboard in no other open proposal (T349’s review)', async () => {
    const id = `board-${run}-6`;
    const first = await store().create(dashboard(id));
    const chart = dashboard(id).items[1]!;
    const alone: NewProposal = { ...dashboard(id), items: [{ ...chart, replaces: null }] };
    const refused = await store()
      .create(alone)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(OpenProposalError);
    expect([(refused as OpenProposalError).kind, (refused as OpenProposalError).itemId]).toEqual([
      'chart',
      `c1-${id}`,
    ]);
    expect((await store().openFor('chart', `c1-${id}`))?.id).toBe(first.id);
  });

  it('holds an item in one open proposal at a time, and finds it', async () => {
    const id = `board-${run}-5`;
    const first = await store().create(dashboard(id));
    await expect(store().create(dashboard(id))).rejects.toBeInstanceOf(OpenProposalError);
    expect((await store().openFor('dashboard', id))?.id).toBe(first.id);
    expect(await store().openFor('dashboard', `board-${run}-none`)).toBeNull();
  });

  it('answers none for a proposal that isn’t there', async () => {
    expect(await store().get(randomUUID())).toBeNull();
    expect(await store().get('not-a-uuid')).toBeNull();
  });
});
