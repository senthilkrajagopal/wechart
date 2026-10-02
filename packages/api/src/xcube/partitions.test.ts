import { describe, expect, it } from 'vitest';

import { xcubePartitions } from './partitions';

/**
 * T375 / AC-145: a pre-aggregation's partitions from xcube's partitions
 * route, under the service credential (research `xcube-slice-6.md`, "POST
 * …/pre-aggregations/partitions"; `cube/system-partitions.md`, "Request and
 * response shape"; checked against compose's xcube, 2026-10-02). The route
 * can drop a module that answers "Continue wait" (`xcube-slice-6.md`, Gotcha
 * 11), so a pre-aggregation missing from its answer is asked for again.
 */
const ITEM = {
  errors: [],
  timezones: ['UTC'],
  preAggregation: {
    id: 'orders.by_month',
    preAggregationName: 'by_month',
    cube: 'orders',
    dataSource: 'default',
    preAggregation: { type: 'rollup', partitionGranularity: 'month' },
  },
  partitions: [
    {
      tableName: 'prod_pre_aggregations.orders_by_month20260101',
      timezone: 'UTC',
      buildRangeStart: '2026-01-01T00:00:00.000',
      buildRangeEnd: '2026-01-31T23:59:59.999',
      versionEntries: [
        {
          table_name: 'prod_pre_aggregations.orders_by_month20260101',
          content_version: 'kkxfse1o',
          structure_version: 'inzfhwft',
          last_updated_at: 1790937401000,
          naming_version: 2,
        },
        {
          table_name: 'prod_pre_aggregations.orders_by_month20260101',
          content_version: 'aaaaaaaa',
          structure_version: 'inzfhwft',
          last_updated_at: 1790930000000,
          naming_version: 2,
        },
      ],
      structureVersion: 'inzfhwft',
    },
    {
      tableName: 'prod_pre_aggregations.orders_by_month20260201',
      timezone: 'UTC',
      buildRangeStart: '2026-02-01T00:00:00.000',
      buildRangeEnd: '2026-02-28T23:59:59.999',
      versionEntries: [],
      structureVersion: 'inzfhwft',
    },
  ],
};

function served(answers: unknown[]) {
  const asked: { url: string; body: unknown; auth: string | null }[] = [];
  const partitions = xcubePartitions({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'e2e',
    token: async () => 'service-token',
    fetch: (async (url: string, init?: RequestInit) => {
      asked.push({
        url,
        body: JSON.parse(String(init?.body)),
        auth: new Headers(init?.headers).get('authorization'),
      });
      // Each answer in turn, the last one again after that.
      return Response.json(answers.length > 1 ? answers.shift() : answers[0]);
    }) as typeof fetch,
    askAgainAfterMs: 0,
  });
  return { partitions, asked };
}

describe('xcube’s partitions (T375, AC-145)', () => {
  it('lists a pre-aggregation’s partitions in UTC, each with its period and versions, newest first', async () => {
    const { partitions, asked } = served([{ preAggregationPartitions: [ITEM] }]);

    expect(await partitions.of('orders.by_month')).toEqual({
      id: 'orders.by_month',
      type: 'rollup',
      partitionGranularity: 'month',
      errors: [],
      partitions: [
        {
          tableName: 'prod_pre_aggregations.orders_by_month20260101',
          start: '2026-01-01T00:00:00.000',
          end: '2026-01-31T23:59:59.999',
          versions: [1790937401000, 1790930000000],
        },
        {
          tableName: 'prod_pre_aggregations.orders_by_month20260201',
          start: '2026-02-01T00:00:00.000',
          end: '2026-02-28T23:59:59.999',
          versions: [],
        },
      ],
    });
    expect(asked).toEqual([
      {
        url: 'http://cube.invalid/cubejs-api/v1/semantic/models/e2e/pre-aggregations/partitions',
        auth: 'Bearer service-token',
        // One zone, wechart's (research cube/system-partitions.md, Derivation, 11–12).
        body: {
          query: {
            preAggregations: [{ id: 'orders.by_month' }],
            timezones: ['UTC'],
            expand: ['partitions.details', 'partitions.versions'],
          },
        },
      },
    ]);
  });

  it('asks again when the answer leaves the pre-aggregation out, as a module still waiting does', async () => {
    const { partitions, asked } = served([
      { preAggregationPartitions: [] },
      { error: 'Continue wait' },
      { preAggregationPartitions: [ITEM] },
    ]);

    expect((await partitions.of('orders.by_month'))?.partitions).toHaveLength(2);
    expect(asked).toHaveLength(3);
  });

  it('says it is still waiting, never that there are none, when it never comes', async () => {
    const { partitions } = served([{ preAggregationPartitions: [] }]);

    await expect(partitions.of('orders.by_month')).rejects.toMatchObject({
      name: 'PartitionsPending',
    });
  });
});

/**
 * T550 / AC-391: every pre-aggregation's partitions in one ask, for Jobs'
 * rows (the route takes a list; checked against compose's xcube, 2026-10-02).
 * One missing is asked for once more, alone; still missing, it is left out,
 * for its row to say Cube is still working it out, never "not built".
 */
describe('every pre-aggregation’s partitions at once (T550, AC-391)', () => {
  const other = {
    ...ITEM,
    preAggregation: { ...ITEM.preAggregation, id: 'orders.whole' },
    partitions: [ITEM.partitions[1]],
  };

  it('asks for them all in one request, and again for those left out', async () => {
    const { partitions, asked } = served([
      { preAggregationPartitions: [ITEM] },
      { preAggregationPartitions: [other] },
    ]);

    const { found, failed } = await partitions.ofEach([
      'orders.by_month',
      'orders.whole',
      'orders.gone',
    ]);

    expect([...found.keys()].sort()).toEqual(['orders.by_month', 'orders.whole']);
    expect(found.get('orders.by_month')?.partitions).toHaveLength(2);
    expect(failed.size).toBe(0);
    expect(
      asked.map(
        (each) => (each.body as { query: { preAggregations: unknown } }).query.preAggregations,
      ),
    ).toEqual([
      [{ id: 'orders.by_month' }, { id: 'orders.whole' }, { id: 'orders.gone' }],
      [{ id: 'orders.whole' }, { id: 'orders.gone' }],
    ]);
  });

  it('asks nothing for none', async () => {
    const { partitions, asked } = served([{ preAggregationPartitions: [] }]);

    expect((await partitions.ofEach([])).found.size).toBe(0);
    expect(asked).toHaveLength(0);
  });

  it('asks each alone when the one ask fails, so one rollup Cube refuses doesn’t hide the rest', async () => {
    // xcube answers a module's error as it is (xcube-slice-6.md, "POST
    // …/pre-aggregations/partitions"): Cube's 500 for one rollup fails the ask.
    const asked: string[][] = [];
    const partitions = xcubePartitions({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'e2e',
      token: async () => 'service-token',
      fetch: (async (_url: string, init?: RequestInit) => {
        const ids = (
          JSON.parse(String(init?.body)) as { query: { preAggregations: { id: string }[] } }
        ).query.preAggregations.map((each) => each.id);
        asked.push(ids);
        return ids.includes('orders.whole')
          ? Response.json({ error: 'Too many partitions' }, { status: 500 })
          : Response.json({ preAggregationPartitions: [ITEM] });
      }) as typeof fetch,
      askAgainAfterMs: 0,
    });

    const { found, failed } = await partitions.ofEach(['orders.by_month', 'orders.whole']);

    expect([...found.keys()]).toEqual(['orders.by_month']);
    expect([...failed.keys()]).toEqual(['orders.whole']);
    expect(failed.get('orders.whole')).toContain('500');
    expect(asked).toEqual([
      ['orders.by_month', 'orders.whole'],
      ['orders.by_month'],
      ['orders.whole'],
    ]);
  });
});
