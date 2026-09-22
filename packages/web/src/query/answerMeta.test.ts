import { describe, expect, it } from 'vitest';

import { answerMetaOf } from './answerMeta';

/**
 * What a tile says about its answer besides drawing it: when its data is from
 * (T154, AC-148) and whether a pre-aggregation served it (T014, AC-013) — both
 * from Cube's `/v1/load` answer (research/cube/pre-aggregations.md §4).
 */
describe('what Cube says about an answer', () => {
  it('keeps when the data is from, and the pre-aggregations that served it', () => {
    const used = {
      'prod_pre_aggregations.monthly_orders_by_status_month': {
        preAggregationId: 'monthly_orders.by_status_month',
        lastUpdatedAt: 1790055853000,
        type: 'rollup',
      },
    };

    expect(
      answerMetaOf({
        data: [{ 'monthly_orders.count': '3' }],
        lastRefreshTime: '2026-09-22T05:44:13.000Z',
        external: true,
        usedPreAggregations: used,
      }),
    ).toEqual({ lastRefreshTime: '2026-09-22T05:44:13.000Z', usedPreAggregations: used });
  });

  it('says nothing it was not told: a database answer has no pre-aggregations', () => {
    expect(answerMetaOf({ data: [], lastRefreshTime: '2026-09-22T05:44:13.000Z' })).toEqual({
      lastRefreshTime: '2026-09-22T05:44:13.000Z',
    });
    expect(answerMetaOf({ data: [], lastRefreshTime: 12, usedPreAggregations: 'x' })).toEqual({});
    expect(answerMetaOf(null)).toEqual({});
  });
});
