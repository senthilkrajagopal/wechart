import { describe, expect, it, vi } from 'vitest';

import { sqlOf } from './ViewQuery';

/**
 * AC-199's View query, for a tile whose quick calculations are asked in two
 * queries (AC-048; T382's review): a running total over a range and another
 * calculation over time, which xcube refuses together. Each is asked for its
 * SQL as the tile asks it, and every statement shown.
 */
describe('the SQL of a tile asked as two queries (AC-048)', () => {
  const ranged = {
    measures: ['orders.count', 'orders.total_amount'],
    timeDimensions: [
      { dimension: 'orders.ordered_at', granularity: 'month', dateRange: ['2026-01-01', '2026-03-31'] },
    ],
    calculations: [
      { measure: 'orders.count', kind: 'running_total' },
      { measure: 'orders.total_amount', kind: 'difference' },
    ],
  };

  it('asks each part for its SQL, and shows every statement', async () => {
    const asked: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body)) as { query: { measures: string[] } };
      asked.push(query);
      return new Response(
        JSON.stringify({ queries: [{ sql: `select ${query.measures.join(', ')}`, params: [] }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const answer = await sqlOf(ranged, {}, fetchImpl);

    expect(asked).toHaveLength(2);
    expect(answer.queries.map((each) => each.sql)).toEqual([
      'select orders.count',
      'select orders.total_amount',
    ]);
  });

  it('asks one query as it is', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ queries: [{ sql: 'select 1', params: [] }] }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    expect((await sqlOf({ measures: ['orders.count'] }, {}, fetchImpl)).queries).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('says what Cube said when it refuses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'No.' }), { status: 400 }),
    ) as unknown as typeof fetch;

    await expect(sqlOf({ measures: ['orders.count'] }, {}, fetchImpl)).rejects.toThrow('No.');
  });
});
