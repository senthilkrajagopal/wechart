import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
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

  /**
   * T180 (AC-174): a dashboard's own queries, found by the request ids its page
   * sent — whatever else was logged since — so their timings can be read.
   */
  it('finds the records of given request ids, every one, and no others', async () => {
    const mine = [randomUUID(), randomUUID()];
    const other = randomUUID();
    for (const requestId of [...mine, other])
      await log().record({ requestId, query: {}, durationMs: 5, accelerated: false });

    const found = await log().byRequestIds(mine);

    expect(found.map((entry) => entry.requestId).sort()).toEqual([...mine].sort());
    expect(await log().byRequestIds([])).toEqual([]);
  });

  // T408 (AC-268): one user's alone, when named, as their Jobs lists them (R42.6).
  it('finds only one user’s, when named', async () => {
    const theirs = randomUUID();
    const another = randomUUID();
    await log().record({
      requestId: theirs,
      query: {},
      durationMs: 5,
      accelerated: false,
      userKey: 'them',
    });
    await log().record({
      requestId: another,
      query: {},
      durationMs: 5,
      accelerated: false,
      userKey: 'someone-else',
    });

    expect(
      (await log().byRequestIds([theirs, another], 'them')).map((entry) => entry.requestId),
    ).toEqual([theirs]);
    expect((await log().byRequestIds([theirs, another])).map((each) => each.requestId)).toEqual([
      theirs,
      another,
    ]);
  });
});

/**
 * T240 / AC-230: THE SYSTEM SHALL let the user narrow the query log by
 * outcome, source and time range and sort it, keep its column headers in view
 * while it scrolls, and render no more than a page of rows at a time.
 * `Fails when: … a filter does not narrow the rows …`
 *
 * Narrowed, sorted and counted over the whole log, not over the latest
 * hundred the page once read (T240's review): a failure behind a hundred newer
 * successes is exactly what "Outcome: Failed" is for.
 */
describe('a page of the query log, narrowed and sorted over all of it (AC-230)', () => {
  const made: string[] = [];
  const recordOne = async (entry: Partial<Parameters<ReturnType<typeof log>['record']>[0]>) => {
    const requestId = randomUUID();
    made.push(requestId);
    await log().record({ requestId, query: {}, durationMs: 5, accelerated: false, ...entry });
    return requestId;
  };

  afterAll(async () => {
    await getDb().deleteFrom('query_log').where('request_id', 'in', made).execute();
  });

  it('finds a failure behind more than a hundred newer queries, and only failures', async () => {
    const failed = await recordOne({ error: 'Timed out' });
    for (let i = 0; i < 110; i += 1) await recordOne({ accelerated: true });

    const found = await log().page({ outcome: 'failed', limit: 1000 });

    expect(found.records.map((entry) => entry.requestId)).toContain(failed);
    expect(found.records.every((entry) => typeof entry.error === 'string')).toBe(true);
    expect(found.total).toBe(found.records.length);
  });

  it('narrows by source, and by time by the database’s own clock', async () => {
    const earlier = await recordOne({ accelerated: true });
    await getDb()
      .updateTable('query_log')
      .set({ created_at: sql<Date>`now() - interval '2 hours'` })
      .where('request_id', '=', earlier)
      .execute();
    const fresh = await recordOne({ accelerated: true });

    const lastHour = await log().page({ source: 'accelerated', withinSeconds: 3600, limit: 1000 });
    const ids = lastHour.records.map((entry) => entry.requestId);
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(earlier);
    expect(lastHour.records.every((entry) => entry.accelerated)).toBe(true);

    const live = await log().page({ source: 'live', withinSeconds: 3600, limit: 1000 });
    expect(live.records.map((entry) => entry.requestId)).not.toContain(fresh);
  });

  it('sorts by duration either way, and pages with the total', async () => {
    const longest = await recordOne({ durationMs: 2_000_000_000 });

    const longestFirst = await log().page({ sort: 'duration', descending: true, limit: 1 });
    expect(longestFirst.records.map((entry) => entry.requestId)).toEqual([longest]);
    const shortestFirst = await log().page({ sort: 'duration', descending: false, limit: 2 });
    expect(shortestFirst.records[0]?.durationMs).toBeLessThanOrEqual(
      shortestFirst.records[1]?.durationMs ?? 0,
    );

    const first = await log().page({ limit: 2, offset: 0 });
    const second = await log().page({ limit: 2, offset: 1 });
    expect(second.records[0]?.id).toBe(first.records[1]?.id);
    expect(first.total).toBeGreaterThanOrEqual(made.length);
    expect(first.records).toHaveLength(2);
  });
});
