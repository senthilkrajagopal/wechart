import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { versionStore } from './versions';

/**
 * T352 (AC-288, AC-298): each version of a shared item wechart lands is kept,
 * a copy it holds — its content, who proposed it, who approved it, when and
 * the description — newest first. A version from before proposals is kept
 * with neither. A data source's content keeps its envelopes as sealed.
 */
const run = randomUUID().slice(0, 8);
const item = `board-${run}`;
const wren = { key: `wren-${run}`, name: 'Wren Writer' };
const ada = { key: `ada-${run}`, name: 'Ada Admin' };
const store = () => versionStore(getDb());

afterAll(async () => {
  await getDb().deleteFrom('item_versions').where('item_id', 'like', `%-${run}`).execute();
  await closeDb();
});

describe('the versions store (T352, AC-288)', () => {
  it('keeps each version landed, newest first, with who, when and why', async () => {
    await store().keep({
      kind: 'dashboard',
      itemId: item,
      version: 1,
      content: { body: { title: 'Revenue' }, parts: [] },
      folderId: 'sales',
      title: 'Revenue',
      author: null,
      approver: null,
      description: null,
      proposalId: null,
    });
    const proposalId = randomUUID();
    await store().keep({
      kind: 'dashboard',
      itemId: item,
      version: 2,
      content: {
        body: { title: 'Revenue overview' },
        parts: [{ id: 'c1', body: { title: 'By month' } }],
      },
      folderId: 'sales',
      title: 'Revenue overview',
      author: wren,
      approver: ada,
      description: 'Adds the monthly chart.',
      proposalId,
    });

    const kept = await store().list('dashboard', item);
    expect(kept.map((each) => [each.version, each.title, each.author, each.approver])).toEqual([
      [2, 'Revenue overview', wren, ada],
      [1, 'Revenue', null, null],
    ]);
    expect(kept[0]).toMatchObject({ description: 'Adds the monthly chart.', proposalId });
    expect(kept[0]!.content).toEqual({
      body: { title: 'Revenue overview' },
      parts: [{ id: 'c1', body: { title: 'By month' } }],
    });
    expect(Number.isNaN(kept[0]!.at.getTime())).toBe(false);
    expect((await store().get('dashboard', item, 1))?.title).toBe('Revenue');
    expect(await store().get('dashboard', item, 9)).toBeNull();
  });

  it('keeps a version once: the same version again changes nothing', async () => {
    const one = `chart-${run}`;
    const entry = {
      kind: 'chart' as const,
      itemId: one,
      version: 1,
      content: { body: { title: 'First' }, parts: [] },
      folderId: 'sales',
      title: 'First',
      author: null,
      approver: null,
      description: null,
      proposalId: null,
    };
    await store().keep(entry);
    await store().keep({ ...entry, title: 'Second' });
    expect((await store().list('chart', one)).map((each) => each.title)).toEqual(['First']);
  });
});
