import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor } from '@fastify/rate-limit';
import { type Kysely, sql } from 'kysely';

import type { Database } from '../db/schema';

/** A token's requests to `/mcp` a minute where the deployment sets none (AC-472, `[R78-5]`). */
export const MCP_RATE_LIMIT = 60;

/** One count, as the limiter wants it: hits in the window so far, and the window's ms left. */
export interface RateLimitHit {
  readonly current: number;
  readonly ttl: number;
}

/**
 * `/mcp`'s request counts in the metadata database (T779, AC-472), so
 * every API replica counts against the same number.
 */
export interface RateLimitCounter {
  /** Counts one hit on `key`, in a window of `windowMs` from its first hit. */
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  /** Removes the windows begun before `cutoff`; says how many. */
  removeBefore(cutoff: Date): Promise<number>;
}

/**
 * Variant A of `mcp-deployment-and-tokens.md`'s "Postgres fixed-window
 * counter": one row per key, its window starting at the first hit, as the
 * plugin's own stores do (`fastify-rate-limit.md`, Gotcha 11). One
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which Postgres makes atomic
 * under concurrency, so no count is lost; the database's clock alone is
 * read, so two replicas' clocks never disagree about a window.
 */
export function rateLimitCounter(db: Kysely<Database>): RateLimitCounter {
  return {
    async hit(key, windowMs) {
      const window = sql`(${windowMs}::double precision * interval '1 millisecond')`;
      const { rows } = await sql<{ current: number; ttl: string }>`
        INSERT INTO mcp_rate_limit AS c (key, window_start, hits)
        VALUES (${key}, now(), 1)
        ON CONFLICT (key) DO UPDATE SET
          window_start = CASE WHEN c.window_start + ${window} <= now()
                              THEN now() ELSE c.window_start END,
          hits         = CASE WHEN c.window_start + ${window} <= now()
                              THEN 1 ELSE c.hits + 1 END
        RETURNING hits AS current,
          GREATEST(0, extract(epoch FROM window_start + ${window} - now()) * 1000)::bigint AS ttl
      `.execute(db);
      const row = rows[0];
      if (row === undefined) throw new Error('The rate-limit count returned no row.');
      return { current: Number(row.current), ttl: Number(row.ttl) };
    },
    async removeBefore(cutoff) {
      const result = await db
        .deleteFrom('mcp_rate_limit')
        .where('window_start', '<', cutoff)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}

/** The count can't be read or written: `/mcp` takes nothing until it can (AC-473, 503). */
export class RateLimitStoreUnavailable extends Error {
  constructor(options?: ErrorOptions) {
    super('The MCP rate-limit store is unavailable.', options);
    this.name = 'RateLimitStoreUnavailable';
  }
}

/** Over the limit (AC-472, AC-474): 429, with the plugin's `Retry-After` already set. */
export class RateLimited extends Error {
  constructor(readonly after: string) {
    super(`Too many requests. Try again in ${after}.`);
    this.name = 'RateLimited';
  }
}

/**
 * The counter as `@fastify/rate-limit`'s `store` (`mcp-deployment-and-tokens.md`,
 * "Wiring as an `@fastify/rate-limit` store"): any failure of the count comes
 * back as `RateLimitStoreUnavailable`, which the plugin rethrows with
 * `skipOnError` off. With no counter, every count fails, so `/mcp` refuses
 * with 503 rather than serve uncounted.
 */
export function rateLimitStore(counter: RateLimitCounter | undefined): FastifyRateLimitStoreCtor {
  return class PgRateLimitStore implements FastifyRateLimitStore {
    incr(
      key: string,
      callback: (error: Error | null, result?: RateLimitHit) => void,
      timeWindow: number,
    ): void {
      if (counter === undefined) {
        callback(new RateLimitStoreUnavailable());
        return;
      }
      counter.hit(key, timeWindow).then(
        (hit) => callback(null, hit),
        (error: unknown) => callback(new RateLimitStoreUnavailable({ cause: error })),
      );
    }
    // One table for every route: the keys say whose count it is.
    child(): FastifyRateLimitStore {
      return this;
    }
  };
}
