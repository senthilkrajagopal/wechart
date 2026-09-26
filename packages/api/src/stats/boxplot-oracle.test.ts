import { boxStats } from '@wechart/core';
import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';

/**
 * T399 (AC-306): a box's median and quartiles equal type-7 quartiles of its
 * values. PostgreSQL's `percentile_cont` computes type 7 by its own source
 * (research/box-plot.md §3), so the metadata database is an independent
 * implementation to check wechart's against, value for value.
 */
afterAll(async () => {
  await closeDb();
});

/** A deterministic pseudo-random sample, so a failure can be reproduced. */
function sample(seed: number, length: number): number[] {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return Math.round((state / 2 ** 31) * 100_000) / 100;
  });
}

describe('box-plot quartiles against PostgreSQL’s percentile_cont (T399, AC-306)', () => {
  it('agrees exactly on samples of many sizes', async () => {
    const db = getDb();
    for (const [seed, length] of [
      [1, 1],
      [2, 2],
      [3, 4],
      [4, 7],
      [5, 10],
      [6, 101],
      [7, 1000],
    ] as const) {
      const values = sample(seed, length);
      const { rows } = await sql<{ quartiles: number[] }>`
        select percentile_cont(array[0.25, 0.5, 0.75]) within group (order by v) as quartiles
        from unnest(${values}::float8[]) as v`.execute(db);
      const [q1, median, q3] = rows[0]!.quartiles;
      const box = boxStats(values, 'tukey')!;
      expect([box.q1, box.median, box.q3], `n = ${String(length)}`).toEqual([q1, median, q3]);
    }
  });
});
