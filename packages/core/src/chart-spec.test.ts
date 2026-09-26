import { describe, expect, it } from 'vitest';

import {
  BOX_PLOT_ROW_LIMIT,
  UNDERLYING_ROW_LIMIT,
  addToWell,
  emptySpec,
  granularitiesOf,
  isEmpty,
  removeFromWell,
  toCubeQuery,
  toUnderlyingQuery,
  wellFor,
} from './chart-spec';

/**
 * AC-026: WHEN the user drags a field onto a well, or adds it with the well's
 * "+" picker, THE SYSTEM SHALL add it to that well and re-run the chart's
 * query.
 *
 * This file is the model half: what a well holds after an add, and the query
 * that comes out. The two routes into it are tested in the editor.
 */
describe('wells', () => {
  it('adds a member to the well it was dropped on', () => {
    const spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    expect(spec.measures).toEqual(['orders.count']);
  });

  it('keeps members in the order they were added', () => {
    let spec = emptySpec('orders');
    spec = addToWell(spec, 'measures', 'orders.count');
    spec = addToWell(spec, 'measures', 'orders.total_amount');

    expect(spec.measures).toEqual(['orders.count', 'orders.total_amount']);
  });

  it('ignores a member the well already holds, rather than duplicating it', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    spec = addToWell(spec, 'measures', 'orders.count');

    expect(spec.measures).toEqual(['orders.count']);
  });

  it('does not change the other wells', () => {
    const before = addToWell(emptySpec('orders'), 'dimensions', 'orders.status');
    const after = addToWell(before, 'measures', 'orders.count');

    expect(after.dimensions).toEqual(['orders.status']);
  });

  it('removes a member', () => {
    const spec = removeFromWell(
      addToWell(emptySpec('orders'), 'measures', 'orders.count'),
      'measures',
      'orders.count',
    );

    expect(spec.measures).toEqual([]);
  });

  it('routes each member kind to its own well', () => {
    expect(wellFor('measure')).toBe('measures');
    expect(wellFor('dimension')).toBe('dimensions');
    expect(wellFor('timeDimension')).toBe('timeDimensions');
    expect(wellFor('segment')).toBeNull();
  });

  it('reports an untouched spec as empty', () => {
    expect(isEmpty(emptySpec('orders'))).toBe(true);
    expect(isEmpty(addToWell(emptySpec('orders'), 'measures', 'orders.count'))).toBe(false);
  });
});

describe('the Cube query a spec asks for', () => {
  it('carries measures and dimensions', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    spec = addToWell(spec, 'dimensions', 'orders.status');

    expect(toCubeQuery(spec)).toEqual({
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    });
  });

  it('puts a time dimension in timeDimensions, not dimensions', () => {
    const spec = addToWell(emptySpec('orders'), 'timeDimensions', 'orders.ordered_at');

    const query = toCubeQuery(spec);
    expect(query['dimensions']).toEqual([]);
    expect(query['timeDimensions']).toEqual([
      { dimension: 'orders.ordered_at', granularity: 'day' },
    ]);
  });

  it('omits timeDimensions entirely when there are none', () => {
    expect(toCubeQuery(emptySpec('orders'))).not.toHaveProperty('timeDimensions');
  });

  it('produces identical JSON for the same members added in a different order', () => {
    let a = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    a = addToWell(a, 'measures', 'orders.total_amount');

    let b = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    b = addToWell(b, 'measures', 'orders.count');

    // AC-105 depends on this: the same request must be byte-identical so the
    // result can be served from cache.
    expect(JSON.stringify(toCubeQuery(a))).toBe(JSON.stringify(toCubeQuery(b)));
  });
});

/**
 * T399 (AC-306): a box plot is computed from the rows, so its query asks Cube
 * for them ungrouped, up to Cube's maximum (research/box-plot.md §5).
 */
describe('a box plot’s query', () => {
  it('asks for the rows ungrouped, unordered, as many as Cube returns in one query', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.amount');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    spec = { ...spec, chartType: 'boxplot' };

    // Unordered (T399's review): by default Cube sorts by the first measure,
    // descending, so past the limit the boxes would be drawn from one tail.
    expect(toCubeQuery(spec)).toEqual({
      measures: ['orders.amount'],
      dimensions: ['orders.status'],
      ungrouped: true,
      order: [],
      limit: BOX_PLOT_ROW_LIMIT,
    });
    expect(BOX_PLOT_ROW_LIMIT).toBe(50_000);
  });

  /**
   * T400 (AC-314): WHEN the user sets a box plot's "Each point is" field (for
   * example Order ID), THE SYSTEM SHALL compute the measure once per value of
   * that field within each category, and draw the boxes from those values.
   */
  it('asks, with "Each point is" set, for the measure once per value of it within each category', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    spec = { ...spec, chartType: 'boxplot', eachPointIs: 'customers.name' };

    // Grouped, not ungrouped: Cube aggregates the measure per (category, point).
    expect(toCubeQuery(spec)).toEqual({
      measures: ['orders.total_amount'],
      dimensions: ['customers.name', 'orders.status'],
      order: [],
      limit: BOX_PLOT_ROW_LIMIT,
    });
  });

  it('groups by the category and "Each point is" alone, whatever else the wells hold', () => {
    // A second dimension and a time field, kept when a bar became a box plot
    // (T400's review): grouped by them too, the measure would be once per
    // (point, order, day) — not once per point.
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    spec = addToWell(spec, 'dimensions', 'orders.id');
    spec = addToWell(spec, 'timeDimensions', 'orders.ordered_at');
    spec = { ...spec, chartType: 'boxplot', eachPointIs: 'customers.name' };

    expect(toCubeQuery(spec)).toEqual({
      measures: ['orders.total_amount'],
      dimensions: ['customers.name', 'orders.status'],
      order: [],
      limit: BOX_PLOT_ROW_LIMIT,
    });
  });

  it('keeps "Each point is" to the box plot', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    spec = { ...spec, chartType: 'bar', eachPointIs: 'customers.name' };
    expect(toCubeQuery(spec)['dimensions']).toEqual(['orders.status']);
  });
});

/**
 * T229 / AC-216: … let the user change a time field's granularity from its
 * pill, and offer a Filters well … `Fails when: … a time field's granularity
 * cannot be changed from its pill, or the Filters well is missing.`
 *
 * The model half: a chosen grain and the chart's own filters reach the query.
 */
describe('a chosen grain and the chart’s own filters', () => {
  const timed = {
    ...addToWell(emptySpec('orders'), 'timeDimensions', 'orders.ordered_at'),
    granularities: { 'orders.ordered_at': 'month' },
  } as const;

  it('asks each time member at its chosen grain, and at the day where none is chosen', () => {
    expect(toCubeQuery(timed)['timeDimensions']).toEqual([
      { dimension: 'orders.ordered_at', granularity: 'month' },
    ]);
    const both = addToWell(timed, 'timeDimensions', 'orders.shipped_at');
    expect(toCubeQuery(both)['timeDimensions']).toEqual([
      { dimension: 'orders.ordered_at', granularity: 'month' },
      { dimension: 'orders.shipped_at', granularity: 'day' },
    ]);
    // What the labels are written by is the same grain (AC-188).
    expect(granularitiesOf(both.timeDimensions, both.granularities)).toEqual({
      'orders.ordered_at': 'month',
      'orders.shipped_at': 'day',
    });
  });

  it('forgets a removed time field’s grain, and keeps the others', () => {
    const both = {
      ...addToWell(timed, 'timeDimensions', 'orders.shipped_at'),
      granularities: {
        'orders.ordered_at': 'month' as const,
        'orders.shipped_at': 'year' as const,
      },
    };
    expect(removeFromWell(both, 'timeDimensions', 'orders.ordered_at').granularities).toEqual({
      'orders.shipped_at': 'year',
    });
    expect(removeFromWell(timed, 'timeDimensions', 'orders.ordered_at')).not.toHaveProperty(
      'granularities',
    );
  });

  it('carries the chart’s filters with values, sorted, and drops one with none yet', () => {
    const spec = {
      ...addToWell(emptySpec('orders'), 'measures', 'orders.count'),
      filters: [
        { member: 'orders.status', operator: 'notEquals', values: ['refunded'] },
        { member: 'orders.city', operator: 'equals', values: [] },
        { member: 'orders.channel', operator: 'equals', values: ['web', 'store'] },
      ],
    } as const;

    expect(toCubeQuery(spec)['filters']).toEqual([
      { member: 'orders.channel', operator: 'equals', values: ['web', 'store'] },
      { member: 'orders.status', operator: 'notEquals', values: ['refunded'] },
    ]);
    // The rows behind the chart are the rows it was filtered to (AC-036).
    expect(toUnderlyingQuery(spec)['filters']).toEqual(toCubeQuery(spec)['filters']);
    expect(toCubeQuery(emptySpec('orders'))).not.toHaveProperty('filters');
  });
});

/**
 * AC-036: the results drawer's "underlying rows" view. The criterion fails
 * when a view "shows data from a different query than the chart rendered", so
 * what matters here is that the ungrouped query is derived from the same spec
 * and names the same members.
 */
describe('toUnderlyingQuery', () => {
  const chart = () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    return addToWell(spec, 'timeDimensions', 'orders.ordered_at');
  };

  it('asks Cube for rows rather than groups', () => {
    expect(toUnderlyingQuery(chart())['ungrouped']).toBe(true);
  });

  it('keeps the measures the chart aggregated, so the drawer shows what was summed', () => {
    expect(toUnderlyingQuery(chart())['measures']).toEqual(['orders.total_amount']);
  });

  it('selects the time member as a raw column instead of a bucket', () => {
    const query = toUnderlyingQuery(chart());

    // Verified against Cube 1.7.42: a `timeDimensions` entry with no
    // granularity filters without grouping and selects no column, so an
    // ungrouped query that left the time member there would silently drop it.
    expect(query['dimensions']).toEqual(['orders.ordered_at', 'orders.status']);
    expect(query).not.toHaveProperty('timeDimensions');
  });

  it('names exactly the members the chart’s own query names', () => {
    const spec = chart();
    const grouped = toCubeQuery(spec);
    const underlying = toUnderlyingQuery(spec);

    const membersOf = (query: Record<string, unknown>) =>
      [
        ...(query['measures'] as string[]),
        ...(query['dimensions'] as string[]),
        ...((query['timeDimensions'] as { dimension: string }[] | undefined) ?? []).map(
          (entry) => entry.dimension,
        ),
      ].sort();

    expect(membersOf(underlying)).toEqual(membersOf(grouped));
  });

  it('caps the rows it asks for', () => {
    expect(toUnderlyingQuery(chart())['limit']).toBe(UNDERLYING_ROW_LIMIT);
    expect(toUnderlyingQuery(chart(), 5)['limit']).toBe(5);
  });
});
