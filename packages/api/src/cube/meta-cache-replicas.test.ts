import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { publicationStore } from '../xcube/publications';
import { MetaCache } from './meta-cache';

/**
 * T421, AC-334 and AC-319: two API replicas on one database. A publish
 * through one is recorded there once xcube acknowledges it, and the other's
 * field list follows as soon as it asks, not 60 s later (research
 * `cube/ha-topology.md`, table row 3; `xcube-slice-2.md`, the contract's
 * §3.4: "refetches when the recorded revision is newer").
 */
const MODEL = `t421-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await getDb().deleteFrom('model_publications').where('model_id', '=', MODEL).execute();
  await closeDb();
});

/** A replica's cache, reading the recorded revision from the one database. */
function replica(asked: number[]) {
  const store = publicationStore(getDb());
  const revision = async () => (await store.get(MODEL))?.revision;
  return new MetaCache({
    revision,
    // Cube answers from the revision the token names (T421's claims).
    fetchMeta: async () => {
      const at = (await revision()) ?? 0;
      asked.push(at);
      return { cubes: [{ name: `orders_r${String(at)}` }] };
    },
  });
}

describe('two replicas’ field lists after a publish (T421, AC-334)', () => {
  it('follow the recorded revision at once, and keep the answer while it stands', async () => {
    const store = publicationStore(getDb());
    await store.put(MODEL, { generation: 'g', revision: 1, contentHash: 'h1' });
    const [askedA, askedB] = [[] as number[], [] as number[]];
    const [a, b] = [replica(askedA), replica(askedB)];
    expect(await a.meta()).toEqual({ cubes: [{ name: 'orders_r1' }] });
    expect(await b.meta()).toEqual({ cubes: [{ name: 'orders_r1' }] });

    // Published through A: xcube acknowledged revision 2, recorded by A.
    await store.put(MODEL, { generation: 'g', revision: 2, contentHash: 'h2' });

    expect(await b.meta()).toEqual({ cubes: [{ name: 'orders_r2' }] });
    // And kept while the revision stands: one ask, not one per caller.
    await b.meta();
    await b.meta();
    expect(askedB).toEqual([1, 2]);
  });
});
