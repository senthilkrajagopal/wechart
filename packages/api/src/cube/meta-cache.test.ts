import { describe, expect, it } from 'vitest';

import { MAX_META_STALENESS_MS, MetaCache, MetaCachesByGroups } from './meta-cache';

/**
 * AC-009: WHEN Cube reports a new `schemaVersion`, THE SYSTEM SHALL serve
 * metadata from the new model within 60 seconds without a restart.
 * Fails when: 60 seconds after the change, a metadata request still returns
 * members from the previous model.
 *
 * `schemaVersion` is a Cube *config* hook — `fn(ctx) => string`, called per
 * request, recompiling the model when the string changes
 * (docs/research/cube/configuration-deployment.md §3). Cube does not push a
 * notification, so the 60-second bound is wechart's own: metadata is cached
 * for at most that long. Publishing from the model editor (T142/T143) does not
 * wait for it and invalidates directly.
 *
 * Time is injected rather than faked globally: these assertions are about a
 * deadline, and a clock the test controls exactly is the point.
 */
function fixture(initial = 'old-model') {
  let model = initial;
  let calls = 0;
  let now = 0;

  const cache = new MetaCache({
    fetchMeta: async () => {
      calls += 1;
      return { cubes: [{ name: model }] };
    },
    now: () => now,
  });

  return {
    cache,
    get calls() {
      return calls;
    },
    publish: (next: string) => (model = next),
    advance: (ms: number) => (now += ms),
  };
}

const nameIn = (meta: unknown) => (meta as { cubes: { name: string }[] }).cubes[0]?.name;

describe('metadata freshness (AC-009)', () => {
  it('serves the new model within 60 seconds of a change', async () => {
    const f = fixture();
    expect(nameIn(await f.cache.meta())).toBe('old-model');

    f.publish('new-model');
    f.advance(MAX_META_STALENESS_MS);

    expect(nameIn(await f.cache.meta())).toBe('new-model');
  });

  it('holds the staleness bound at 60 seconds, which is what the criterion says', () => {
    expect(MAX_META_STALENESS_MS).toBeLessThanOrEqual(60_000);
  });

  it('needs no restart: the same instance serves both models', async () => {
    const f = fixture();
    const before = await f.cache.meta();

    f.publish('new-model');
    f.advance(MAX_META_STALENESS_MS);
    const after = await f.cache.meta();

    expect(nameIn(before)).toBe('old-model');
    expect(nameIn(after)).toBe('new-model');
  });

  it('serves from cache while it is fresh, so metadata is not refetched per request', async () => {
    const f = fixture();
    await f.cache.meta();
    await f.cache.meta();
    f.advance(MAX_META_STALENESS_MS - 1);
    await f.cache.meta();

    expect(f.calls).toBe(1);
  });

  it('refetches once the entry is stale', async () => {
    const f = fixture();
    await f.cache.meta();
    f.advance(MAX_META_STALENESS_MS);
    await f.cache.meta();

    expect(f.calls).toBe(2);
  });

  it('publishes immediately on invalidate, without waiting out the bound', async () => {
    const f = fixture();
    expect(nameIn(await f.cache.meta())).toBe('old-model');

    f.publish('new-model');
    f.cache.invalidate();

    // No clock advance: a model the user just published must not appear stale.
    expect(nameIn(await f.cache.meta())).toBe('new-model');
    expect(f.calls).toBe(2);
  });

  it('lets go of a fetch in flight on invalidate: its old model is neither served after nor kept (T143)', async () => {
    // Another page asked for the model just before the publish; its fetch
    // finishes after. Handing it to the next caller, and keeping it for a
    // minute, would hide the publish (AC-137).
    let model = 'old-model';
    let release: () => void = () => undefined;
    let calls = 0;
    const cache = new MetaCache({
      fetchMeta: async () => {
        calls += 1;
        const seen = model;
        if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
        return { cubes: [{ name: seen }] };
      },
      now: () => 0,
    });

    const before = cache.meta();
    model = 'new-model';
    cache.invalidate();
    const after = cache.meta();
    release();

    expect(nameIn(await before)).toBe('old-model');
    expect(nameIn(await after)).toBe('new-model');
    // And the next caller has the new one from the cache, not the old.
    expect(nameIn(await cache.meta())).toBe('new-model');
    expect(calls).toBe(2);
  });

  it('shares one in-flight fetch between concurrent callers', async () => {
    const f = fixture();

    const [a, b, c] = await Promise.all([f.cache.meta(), f.cache.meta(), f.cache.meta()]);

    // A dashboard opening ten tiles at once must not become ten metadata
    // requests against Cube's queue.
    expect(f.calls).toBe(1);
    expect(nameIn(a)).toBe('old-model');
    expect(nameIn(b)).toBe('old-model');
    expect(nameIn(c)).toBe('old-model');
  });

  it('does not cache a failure', async () => {
    let attempt = 0;
    const cache = new MetaCache({
      fetchMeta: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Cube is down');
        return { cubes: [{ name: 'recovered' }] };
      },
      now: () => 0,
    });

    await expect(cache.meta()).rejects.toThrow('Cube is down');
    expect(nameIn(await cache.meta())).toBe('recovered');
  });
});

/** T322 (AC-008): metadata per set of groups, since policies hide members per group. */
describe('metadata per set of AD groups', () => {
  const byGroups = () => {
    const fetched: string[][] = [];
    const caches = new MetaCachesByGroups(
      (groups) =>
        new MetaCache({
          fetchMeta: async () => {
            fetched.push([...groups]);
            return { cubes: [{ name: groups.join('+') }] };
          },
          now: () => 0,
        }),
    );
    return { caches, fetched };
  };

  it('is one cache for a set of groups, whatever their order or repeats', async () => {
    const { caches, fetched } = byGroups();
    expect(nameIn(await caches.for(['b', 'a']).meta())).toBe('a+b');
    expect(nameIn(await caches.for(['a', 'b', 'a']).meta())).toBe('a+b');
    expect(nameIn(await caches.for(['c']).meta())).toBe('c');
    expect(fetched).toEqual([['a', 'b'], ['c']]);
  });

  it('asks every set afresh after a publish', async () => {
    const { caches, fetched } = byGroups();
    await caches.for(['a']).meta();
    await caches.for(['b']).meta();
    caches.invalidate();
    await caches.for(['a']).meta();
    await caches.for(['b']).meta();
    expect(fetched).toEqual([['a'], ['b'], ['a'], ['b']]);
  });
});

/**
 * T421's review: the entry follows the recorded revision, which only rises.
 * A fetch begun at an older revision that answers after one at a newer
 * revision must not put the older answer back.
 */
describe('metadata keyed by xcube’s recorded revision (T421, AC-334)', () => {
  it('keeps the newer revision’s answer when an older fetch answers last', async () => {
    let recorded = 4;
    const releases: (() => void)[] = [];
    const fetched: number[] = [];
    const cache = new MetaCache({
      revision: async () => recorded,
      fetchMeta: async () => {
        const at = recorded;
        fetched.push(at);
        // Revision 4's fetch is slow: it answers after revision 5's.
        if (at === 4) await new Promise<void>((resolve) => releases.push(resolve));
        return { cubes: [{ name: `r${String(at)}` }] };
      },
    });

    const older = cache.meta();
    await Promise.resolve();
    await Promise.resolve();
    recorded = 5;
    expect(await cache.meta()).toEqual({ cubes: [{ name: 'r5' }] });
    releases.forEach((release) => release());
    expect(await older).toEqual({ cubes: [{ name: 'r4' }] });

    expect(await cache.meta()).toEqual({ cubes: [{ name: 'r5' }] });
    expect(fetched).toEqual([4, 5]);
  });
});
