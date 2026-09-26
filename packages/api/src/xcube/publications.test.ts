import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { memoryPublications, publicationStore } from './publications';

/**
 * T419, AC-333: what xcube acknowledged of each model is recorded in the
 * metadata database — its store's generation, the revision, and the content
 * hash — one row a model, the latest over the last.
 */
afterAll(async () => {
  await getDb().deleteFrom('model_publications').where('model_id', 'like', 't419-%').execute();
  await closeDb();
});

describe('what xcube acknowledged (T419, AC-333)', () => {
  it('is kept per model, the latest over the last', async () => {
    const store = publicationStore(getDb());
    const [dev, demo] = [`t419-${randomUUID().slice(0, 8)}`, `t419-${randomUUID().slice(0, 8)}`];
    expect(await store.get(dev)).toBeUndefined();

    await store.put(dev, { generation: 'g1', revision: 1, contentHash: 'h1' });
    await store.put(demo, { generation: 'g1', revision: 7, contentHash: 'h7' });
    await store.put(dev, { generation: 'g2', revision: 1, contentHash: 'h2' });

    expect(await store.get(dev)).toEqual({ generation: 'g2', revision: 1, contentHash: 'h2' });
    expect(await store.get(demo)).toEqual({ generation: 'g1', revision: 7, contentHash: 'h7' });
  });

  /**
   * T421's review: within one store's generation xcube's revisions only rise,
   * so the record does too. A replica that read xcube's head before another's
   * publish was recorded would otherwise put the older revision back, and
   * every token would name it until the next sync (AC-334).
   */
  it('only rises within a generation, in the database and in memory', async () => {
    for (const store of [publicationStore(getDb()), memoryPublications()]) {
      const dev = `t419-${randomUUID().slice(0, 8)}`;
      await store.put(dev, { generation: 'g1', revision: 5, contentHash: 'h5' });

      await store.put(dev, { generation: 'g1', revision: 4, contentHash: 'h4' });
      expect(await store.get(dev)).toEqual({ generation: 'g1', revision: 5, contentHash: 'h5' });

      // The same revision again, as a reconcile finds it: kept.
      await store.put(dev, { generation: 'g1', revision: 5, contentHash: 'h5' });
      await store.put(dev, { generation: 'g1', revision: 6, contentHash: 'h6' });
      expect(await store.get(dev)).toEqual({ generation: 'g1', revision: 6, contentHash: 'h6' });

      // A new store starts again from its own revisions.
      await store.put(dev, { generation: 'g2', revision: 0, contentHash: '' });
      expect(await store.get(dev)).toEqual({ generation: 'g2', revision: 0, contentHash: '' });
    }
  });
});
