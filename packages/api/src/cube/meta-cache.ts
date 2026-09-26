/**
 * Metadata caching with a freshness bound (AC-009).
 *
 * Cube's `schemaVersion` is a config hook it calls per request, recompiling the
 * model when the returned string changes; nothing is pushed to clients
 * (docs/research/cube/configuration-deployment.md §3). So "within 60 seconds"
 * is a bound wechart keeps for itself: an entry older than that is refetched
 * before it is served.
 *
 * Caching at all is what makes the bound necessary — without a cache, metadata
 * is never stale, but a dashboard of ten tiles becomes ten `/v1/meta` requests
 * against a queue whose default concurrency is 2.
 */

/** AC-009 says 60 seconds; this is the whole of that budget. */
export const MAX_META_STALENESS_MS = 60_000;

export interface MetaCacheOptions {
  readonly fetchMeta: () => Promise<unknown>;
  /** Injected so tests can control the deadline exactly. */
  readonly now?: () => number;
  readonly maxStalenessMs?: number;
}

interface Entry {
  readonly value: unknown;
  readonly fetchedAt: number;
}

export class MetaCache {
  readonly #fetchMeta: () => Promise<unknown>;
  readonly #now: () => number;
  readonly #maxStalenessMs: number;

  #entry: Entry | null = null;
  #inFlight: Promise<unknown> | null = null;
  /** Bumped by `invalidate`: a fetch begun before it answers only those who waited on it. */
  #generation = 0;

  constructor(options: MetaCacheOptions) {
    this.#fetchMeta = options.fetchMeta;
    this.#now = options.now ?? Date.now;
    this.#maxStalenessMs = options.maxStalenessMs ?? MAX_META_STALENESS_MS;
  }

  async meta(): Promise<unknown> {
    const entry = this.#entry;
    if (entry && this.#now() - entry.fetchedAt < this.#maxStalenessMs) {
      return entry.value;
    }

    // One fetch serves every caller waiting on it, so a dashboard opening many
    // tiles at once produces one request rather than one per tile.
    this.#inFlight ??= this.#refresh();
    return this.#inFlight;
  }

  /**
   * Drop the entry now. Used when wechart itself publishes a model (T142/T143):
   * a model the user just published must not look stale to them, and waiting
   * out the bound would be the wrong answer to "did my change take effect?".
   *
   * A fetch already in flight is let go of too: it began before the change,
   * so it is neither handed to a later caller nor kept (T143's finding —
   * another page asking just before a publish hid it for a minute).
   */
  invalidate(): void {
    this.#entry = null;
    this.#inFlight = null;
    this.#generation += 1;
  }

  async #refresh(): Promise<unknown> {
    const generation = this.#generation;
    try {
      const value = await this.#fetchMeta();
      if (generation === this.#generation) this.#entry = { value, fetchedAt: this.#now() };
      return value;
    } finally {
      // Cleared whether the fetch resolved or threw, so a failure is never
      // cached and the next caller tries again — unless a newer fetch holds it.
      if (generation === this.#generation) this.#inFlight = null;
    }
  }
}

/** At most this many sets of groups keep their metadata; the oldest goes first. */
const MAX_GROUP_SETS = 256;

/**
 * Metadata per set of AD groups (T322, AC-008). With security on, what Cube
 * shows depends on the groups a request carries (access policies hide members
 * per group), so no two sets share an answer; each keeps AC-009's bound.
 */
export class MetaCachesByGroups {
  readonly #caches = new Map<string, MetaCache>();
  readonly #make: (groups: readonly string[]) => MetaCache;

  constructor(make: (groups: readonly string[]) => MetaCache) {
    this.#make = make;
  }

  /** The cache for these groups, whatever their order or repeats. */
  for(groups: readonly string[]): MetaCache {
    const set = [...new Set(groups)].sort();
    const key = JSON.stringify(set);
    let cache = this.#caches.get(key);
    if (cache === undefined) {
      if (this.#caches.size >= MAX_GROUP_SETS) {
        const oldest = this.#caches.keys().next().value;
        if (oldest !== undefined) this.#caches.delete(oldest);
      }
      cache = this.#make(set);
      this.#caches.set(key, cache);
    }
    return cache;
  }

  /** A publish is seen by every set at once (T142/T143). */
  invalidate(): void {
    for (const cache of this.#caches.values()) cache.invalidate();
  }
}
