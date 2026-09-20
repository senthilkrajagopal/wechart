import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { queryLog } from './query-log';

/**
 * AC-016: THE SYSTEM SHALL record, for every query it issues, the Cube request,
 * the duration and whether it was accelerated, and expose those records in the
 * Jobs workspace.
 * Fails when: a rendered chart produces no query record, or the record lacks
 * duration or acceleration.
 */
const log = () => queryLog(getDb());

afterAll(async () => {
  await closeDb();
});

describe('query log (AC-016)', () => {
  it('records the request, the duration and the acceleration', async () => {
    const requestId = randomUUID();
    const query = { measures: ['Orders.count'], timeDimensions: [] };

    await log().record({
      requestId,
      query,
      durationMs: 412,
      accelerated: true,
      preAggregation: 'orders.main',
    });

    const found = (await log().recent(200)).find((entry) => entry.requestId === requestId);

    expect(found).toBeDefined();
    expect(found?.query).toEqual(query);
    expect(found?.durationMs).toBe(412);
    expect(found?.accelerated).toBe(true);
    expect(found?.preAggregation).toBe('orders.main');
  });

  it('records a query that was not accelerated as such', async () => {
    const requestId = randomUUID();
    await log().record({ requestId, query: {}, durationMs: 1200, accelerated: false });

    const found = (await log().recent(200)).find((entry) => entry.requestId === requestId);
    expect(found?.accelerated).toBe(false);
    expect(found?.preAggregation).toBeNull();
  });

  it('records a failed query too, with its message', async () => {
    const requestId = randomUUID();

    await log().record({
      requestId,
      query: { measures: ['Orders.count'] },
      durationMs: 4300,
      accelerated: false,
      error: "Can't find join path between Orders and Suppliers",
    });

    const found = (await log().recent(200)).find((entry) => entry.requestId === requestId);
    // A query that ran for four seconds and then failed is exactly what someone
    // opens this list to find.
    expect(found?.error).toContain('join path');
    expect(found?.durationMs).toBe(4300);
  });

  it('returns the newest first', async () => {
    const first = randomUUID();
    const second = randomUUID();

    await log().record({ requestId: first, query: {}, durationMs: 1, accelerated: false });
    await log().record({ requestId: second, query: {}, durationMs: 1, accelerated: false });

    const recent = await log().recent(10);
    const positionOf = (id: string) => recent.findIndex((entry) => entry.requestId === id);

    expect(positionOf(second)).toBeGreaterThanOrEqual(0);
    expect(positionOf(second)).toBeLessThan(positionOf(first));
  });

  it('honours the limit', async () => {
    for (let i = 0; i < 3; i += 1) {
      await log().record({ requestId: randomUUID(), query: {}, durationMs: 1, accelerated: false });
    }

    expect(await log().recent(2)).toHaveLength(2);
  });
});
