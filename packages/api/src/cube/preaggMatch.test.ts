import { describe, expect, it } from 'vitest';

import { missOf, rollupsFrom, type Transformed } from './preaggMatch';

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * Whether it matches is Cube's to say (`/v1/sql`); why it does not is read
 * here from what Cube matches on — the dry run's transformed query — against
 * the rollups Cube compiled (`/v1/meta?extended=true`), by the matcher's
 * additive rules (research/cube/pre-aggregations.md §2 and "Observed
 * locally", whose shapes these fixtures are).
 */
const META = {
  cubes: [
    {
      name: 'monthly_orders',
      preAggregations: [
        {
          name: 'by_status_month',
          type: 'rollup',
          measureReferences: '[count, total_amount]',
          dimensionReferences: '[status]',
          timeDimensionReference: 'ordered_at',
          granularity: 'month',
          partitionGranularity: 'year',
        },
      ],
    },
    { name: 'orders', preAggregations: [] },
    {
      name: 'shipments',
      preAggregations: [
        { name: 'cached_sql', type: 'originalSql' },
        {
          name: 'by_carrier',
          type: 'rollup',
          measureReferences: '[CUBE.count]',
          dimensionReferences: '[carrier, orders.status]',
        },
      ],
    },
  ],
};

const HIERARCHIES = {
  'monthly_orders.ordered_at.day': ['day', 'hour', 'minute', 'second'],
  'monthly_orders.ordered_at.month': ['month', 'day', 'hour', 'minute', 'second'],
  'monthly_orders.ordered_at.quarter': ['quarter', 'month', 'day', 'hour', 'minute', 'second'],
};

const additive = (measure: string) => ({ [measure]: [{ measure, additive: true, type: 'count' }] });

const transformed = (over: Partial<Transformed>): Transformed => ({
  leafMeasures: ['monthly_orders.count'],
  measureToLeafMeasures: additive('monthly_orders.count'),
  ownedDimensions: [],
  ownedTimeDimensionsWithRollupGranularity: [],
  ownedTimeDimensionsAsIs: [],
  granularityHierarchies: HIERARCHIES,
  ...over,
});

/** A time dimension as the dry run owns it: `day` in both of its lists. */
const byDay = (member: string) => ({
  ownedTimeDimensionsWithRollupGranularity: [[member, 'day']] as [string, string][],
  ownedTimeDimensionsAsIs: [[member, 'day']] as [string, string][],
});

const rollups = rollupsFrom(META);

describe('the rollups Cube compiled', () => {
  it('reads each rollup’s members as full names, whatever form the model wrote them in', () => {
    expect(rollups['monthly_orders']).toEqual([
      {
        id: 'monthly_orders.by_status_month',
        measures: ['monthly_orders.count', 'monthly_orders.total_amount'],
        dimensions: ['monthly_orders.status'],
        timeDimension: 'monthly_orders.ordered_at',
        granularity: 'month',
      },
    ]);
    // `CUBE.` is the cube itself; a joined cube's member keeps its cube; an
    // original_sql pre-aggregation caches SQL and serves no rollup match.
    expect(rollups['shipments']).toEqual([
      {
        id: 'shipments.by_carrier',
        measures: ['shipments.count'],
        dimensions: ['shipments.carrier', 'orders.status'],
      },
    ]);
    expect(rollups['orders']).toEqual([]);
  });
});

describe('why Cube did not use a rollup', () => {
  it('names a dimension the rollup does not have', () => {
    expect(
      missOf(
        transformed({ ownedDimensions: ['monthly_orders.id'] }),
        { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.id'] },
        rollups,
      ),
    ).toEqual({
      rollup: 'monthly_orders.by_status_month',
      member: 'monthly_orders.id',
      reason: 'monthly_orders.id is not one of the rollup’s dimensions.',
    });
  });

  it('names a measure the rollup does not have', () => {
    expect(
      missOf(
        transformed({
          leafMeasures: ['monthly_orders.count', 'monthly_orders.average_amount'],
          measureToLeafMeasures: {
            ...additive('monthly_orders.count'),
            ...additive('monthly_orders.average_amount'),
          },
        }),
        { measures: ['monthly_orders.count', 'monthly_orders.average_amount'] },
        rollups,
      ),
    ).toEqual({
      rollup: 'monthly_orders.by_status_month',
      member: 'monthly_orders.average_amount',
      reason: 'monthly_orders.average_amount is not one of the rollup’s measures.',
    });
  });

  it('names a time dimension grouped finer than the rollup keeps it', () => {
    expect(
      missOf(
        transformed(byDay('monthly_orders.ordered_at')),
        {
          measures: ['monthly_orders.count'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
        },
        rollups,
      ),
    ).toEqual({
      rollup: 'monthly_orders.by_status_month',
      member: 'monthly_orders.ordered_at',
      reason: 'monthly_orders.ordered_at is grouped by day, and the rollup keeps it by month.',
    });
    // Coarser is served: a quarter is made of months.
    expect(
      missOf(
        transformed({
          ownedTimeDimensionsWithRollupGranularity: [['monthly_orders.ordered_at', 'quarter']],
          ownedTimeDimensionsAsIs: [['monthly_orders.ordered_at', 'quarter']],
        }),
        {
          measures: ['monthly_orders.count'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'quarter' }],
        },
        rollups,
      ).reason,
    ).toMatch(/Cube did not use/);
  });

  /**
   * T150's review: the dry run spells a joined cube's member by its join path
   * (`orders.customers.country`) where the model writes `customers.country`,
   * and keys its hierarchies by the short name (research, "Observed
   * locally"). Compared as spelled, the panel blamed a member the rollup has.
   */
  it('reads a joined cube’s member by its own name, and blames what does block', () => {
    const joined = rollupsFrom({
      cubes: [
        {
          name: 'orders',
          preAggregations: [
            {
              name: 'by_country',
              type: 'rollup',
              measureReferences: '[count]',
              dimensionReferences: '[status, customers.country]',
              timeDimensionReference: 'ordered_at',
              granularity: 'month',
            },
          ],
        },
        { name: 'customers', preAggregations: [] },
      ],
    });
    expect(
      missOf(
        transformed({
          leafMeasures: ['orders.count'],
          measureToLeafMeasures: additive('orders.count'),
          ownedDimensions: ['orders.customers.country'],
          ...byDay('orders.ordered_at'),
          granularityHierarchies: { 'orders.ordered_at.day': ['day', 'hour', 'minute', 'second'] },
        }),
        {
          measures: ['orders.count'],
          dimensions: ['customers.country'],
          timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'day' }],
        },
        joined,
      ),
    ).toEqual({
      rollup: 'orders.by_country',
      member: 'orders.ordered_at',
      reason: 'orders.ordered_at is grouped by day, and the rollup keeps it by month.',
    });
  });

  it('looks for rollups on every cube the query involves, the joined ones too', () => {
    const onJoined = rollupsFrom({
      cubes: [
        { name: 'orders', preAggregations: [] },
        {
          name: 'customers',
          preAggregations: [
            {
              name: 'by_country',
              type: 'rollup',
              measureReferences: '[count]',
              dimensionReferences: '[country]',
            },
          ],
        },
      ],
    });
    expect(
      missOf(
        transformed({
          leafMeasures: ['customers.count'],
          measureToLeafMeasures: additive('customers.count'),
          ownedDimensions: ['orders.customers.country', 'orders.status'],
        }),
        { measures: ['customers.count'], dimensions: ['customers.country', 'orders.status'] },
        onJoined,
      ),
    ).toEqual({
      rollup: 'customers.by_country',
      member: 'orders.status',
      reason: 'orders.status is not one of the rollup’s dimensions.',
    });
  });

  it('does not blame a filter on a measure the rollup has', () => {
    // A measure filter is not one of the dry run's owned dimensions.
    expect(
      missOf(
        transformed({
          ownedDimensions: ['monthly_orders.status'],
          ...byDay('monthly_orders.ordered_at'),
        }),
        {
          measures: ['monthly_orders.count'],
          dimensions: ['monthly_orders.status'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
          filters: [{ member: 'monthly_orders.count', operator: 'gt', values: ['0'] }],
        },
        rollups,
      ).member,
    ).toBe('monthly_orders.ordered_at');
  });

  it('counts a rollup’s segments among what it can serve', () => {
    const segmented = rollupsFrom({
      cubes: [
        {
          name: 'monthly_orders',
          preAggregations: [
            {
              name: 'shipped_by_status',
              type: 'rollup',
              measureReferences: '[count]',
              dimensionReferences: '[status]',
              segmentReferences: '[shipped]',
              timeDimensionReference: 'ordered_at',
              granularity: 'month',
            },
          ],
        },
      ],
    });
    expect(
      missOf(
        transformed({
          ownedDimensions: ['monthly_orders.status', 'monthly_orders.shipped'],
          ...byDay('monthly_orders.ordered_at'),
        }),
        {
          measures: ['monthly_orders.count'],
          dimensions: ['monthly_orders.status'],
          segments: ['monthly_orders.shipped'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
        },
        segmented,
      ).member,
    ).toBe('monthly_orders.ordered_at');
  });

  it('reads a date range with no granularity as a date range, not a grouping', () => {
    // The rollup allows non-strict ranges (Cube's default), so the as-is list
    // is what it is matched on: no granularity, so nothing to be finer.
    const miss = missOf(
      transformed({
        ownedDimensions: ['monthly_orders.status'],
        ownedTimeDimensionsWithRollupGranularity: [['monthly_orders.ordered_at', 'day']],
        ownedTimeDimensionsAsIs: [['monthly_orders.ordered_at', null]],
      }),
      {
        measures: ['monthly_orders.count'],
        dimensions: ['monthly_orders.status'],
        timeDimensions: [{ dimension: 'monthly_orders.ordered_at', dateRange: 'last 7 days' }],
      },
      rollups,
    );
    expect(miss.reason).not.toMatch(/grouped by/);
  });

  it('names a member filtered on that the rollup cannot filter', () => {
    expect(
      missOf(
        // A filtered dimension is one of the dry run's owned dimensions.
        transformed({ ownedDimensions: ['monthly_orders.status', 'monthly_orders.id'] }),
        {
          measures: ['monthly_orders.count'],
          dimensions: ['monthly_orders.status'],
          filters: [
            {
              or: [
                { member: 'monthly_orders.status', operator: 'equals', values: ['shipped'] },
                { member: 'monthly_orders.id', operator: 'gt', values: ['3'] },
              ],
            },
          ],
        },
        rollups,
      ),
    ).toEqual({
      rollup: 'monthly_orders.by_status_month',
      member: 'monthly_orders.id',
      reason: 'monthly_orders.id is filtered on, and is not one of the rollup’s dimensions.',
    });
  });

  it('names a measure that does not add up, when the rollup’s granularity is not the query’s', () => {
    // A quarter is made of months — for a measure that adds up. One that does
    // not needs the rollup's own granularity (the matcher's exact path).
    expect(
      missOf(
        transformed({
          ownedDimensions: ['monthly_orders.status'],
          ownedTimeDimensionsWithRollupGranularity: [['monthly_orders.ordered_at', 'quarter']],
          ownedTimeDimensionsAsIs: [['monthly_orders.ordered_at', 'quarter']],
          measureToLeafMeasures: {
            'monthly_orders.count': [
              { measure: 'monthly_orders.count', additive: false, type: 'countDistinct' },
            ],
          },
        }),
        {
          measures: ['monthly_orders.count'],
          dimensions: ['monthly_orders.status'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'quarter' }],
        },
        rollups,
      ).member,
    ).toBe('monthly_orders.count');
  });

  it('names a measure that does not add up, when the rollup is not grouped exactly as the query', () => {
    expect(
      missOf(
        transformed({
          leafMeasures: ['monthly_orders.count'],
          measureToLeafMeasures: {
            'monthly_orders.count': [
              { measure: 'monthly_orders.count', additive: false, type: 'countDistinct' },
            ],
          },
        }),
        { measures: ['monthly_orders.count'] },
        rollups,
      ),
    ).toEqual({
      rollup: 'monthly_orders.by_status_month',
      member: 'monthly_orders.count',
      reason:
        'monthly_orders.count does not add up (countDistinct), so only a rollup grouped exactly as the query can serve it.',
    });
  });

  it('says a cube has no rollups at all, naming its first measure', () => {
    expect(
      missOf(
        transformed({
          leafMeasures: ['orders.count'],
          measureToLeafMeasures: additive('orders.count'),
          ownedDimensions: ['orders.status'],
        }),
        { measures: ['orders.count'], dimensions: ['orders.status'] },
        rollups,
      ),
    ).toEqual({ rollup: null, member: 'orders.count', reason: 'orders has no pre-aggregations.' });
  });

  it('reports the rollup nearest to serving the query', () => {
    const two = rollupsFrom({
      cubes: [
        {
          name: 'monthly_orders',
          preAggregations: [
            {
              name: 'far',
              type: 'rollup',
              measureReferences: '[total_amount]',
              dimensionReferences: '[]',
            },
            {
              name: 'near',
              type: 'rollup',
              measureReferences: '[count]',
              dimensionReferences: '[status]',
            },
          ],
        },
      ],
    });
    expect(
      missOf(
        transformed({ ownedDimensions: ['monthly_orders.status', 'monthly_orders.id'] }),
        {
          measures: ['monthly_orders.count'],
          dimensions: ['monthly_orders.status', 'monthly_orders.id'],
        },
        two,
      ),
    ).toMatchObject({ rollup: 'monthly_orders.near', member: 'monthly_orders.id' });
  });

  it('still gives a reason when every member is in the rollup and Cube did not use it', () => {
    // By month over a range that does not start on one: `day` to a strict
    // matcher, `month` as asked — which a non-strict rollup is matched on.
    const miss = missOf(
      transformed({
        ownedDimensions: ['monthly_orders.status'],
        ownedTimeDimensionsWithRollupGranularity: [['monthly_orders.ordered_at', 'day']],
        ownedTimeDimensionsAsIs: [['monthly_orders.ordered_at', 'month']],
      }),
      {
        measures: ['monthly_orders.count'],
        dimensions: ['monthly_orders.status'],
        timeDimensions: [
          {
            dimension: 'monthly_orders.ordered_at',
            granularity: 'month',
            dateRange: ['2026-01-15', '2026-03-10'],
          },
        ],
      },
      rollups,
    );
    expect(miss.rollup).toBe('monthly_orders.by_status_month');
    expect(miss.member).toBe('monthly_orders.ordered_at');
    expect(miss.reason).toMatch(/^Cube did not use monthly_orders\.by_status_month/);
  });
});
