import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { publicationStore } from './publications';

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
});
