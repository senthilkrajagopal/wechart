import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { rateLimitCounter } from './rateLimitStore';

/**
 * T779 (AC-472): `/mcp`'s request counts kept in the metadata database, one
 * fixed window per key that starts at its first hit
 * (`mcp-deployment-and-tokens.md`, "Postgres fixed-window counter", Variant
 * A), so every API replica counts against the same number.
 */
const PREFIX = `t779-${Date.now()}`;
const keyOf = (what: string) => `${PREFIX}:${what}:${randomUUID()}`;

afterAll(async () => {
  await getDb().deleteFrom('mcp_rate_limit').where('key', 'like', `${PREFIX}:%`).execute();
  await closeDb();
});

describe('the rate-limit counter (T779, AC-472)', () => {
  it('never loses a count when one key is hit concurrently', async () => {
    const counter = rateLimitCounter(getDb());
    const key = keyOf('concurrent');
    const hits = await Promise.all(Array.from({ length: 40 }, () => counter.hit(key, 60_000)));
    expect(hits.map((hit) => hit.current).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
  });

  it('says how long is left of the window, and starts a new one once it has passed', async () => {
    const counter = rateLimitCounter(getDb());
    const key = keyOf('window');
    const first = await counter.hit(key, 60_000);
    expect(first.current).toBe(1);
    expect(first.ttl).toBeGreaterThan(0);
    expect(first.ttl).toBeLessThanOrEqual(60_000);
    expect((await counter.hit(key, 60_000)).current).toBe(2);

    const short = keyOf('short');
    await counter.hit(short, 5);
    await counter.hit(short, 5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await counter.hit(short, 5)).current).toBe(1);
  });

  it('cleans up windows older than the cutoff, keeping the current ones', async () => {
    const db = getDb();
    const counter = rateLimitCounter(db);
    const old = keyOf('old');
    const current = keyOf('current');
    await db
      .insertInto('mcp_rate_limit')
      .values({ key: old, window_start: sql<Date>`now() - interval '2 days'`, hits: 7 })
      .execute();
    await counter.hit(current, 60_000);

    const removed = await counter.removeBefore(new Date(Date.now() - 86_400_000));
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db
      .selectFrom('mcp_rate_limit')
      .select('key')
      .where('key', 'in', [old, current])
      .execute();
    expect(left.map((row) => row.key)).toEqual([current]);
  });
});
