import { describe, expect, it } from 'vitest';

import { CHART_DOCUMENT_VERSION, type ChartDocument } from './chart-document';
import { drilledDocument, drillOptions } from './drill';

/**
 * T270 / AC-237: WHEN the user opens Drill by on a tile, THE SYSTEM SHALL
 * offer the next level of the member's hierarchy first, then finer time
 * granularities, then the dimensions of the tile's cube and of the cubes Cube
 * reports joined to it, and SHALL offer neither a primary key nor the marked
 * member itself. `Fails when: a primary key or the marked member is offered,
 * or a dimension of a cube Cube reports in another join component is
 * offered.`
 *
 * From Cube's `/v1/meta`: `hierarchies` (levels coarse to fine), each cube's
 * `connectedComponent`, and each dimension's `type` and `primaryKey`
 * (research/cube/data-apis.md; the context-menu analysis §2.4).
 */
const dimension = (name: string, type = 'string', extra: Record<string, unknown> = {}) => ({
  name,
  title: name,
  type,
  ...extra,
});

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      type: 'cube',
      connectedComponent: 1,
      dimensions: [
        dimension('orders.id', 'number', { primaryKey: true }),
        dimension('orders.status'),
        dimension('orders.ordered_at', 'time'),
        dimension('orders.shipped_at', 'time'),
      ],
      hierarchies: [],
    },
    {
      name: 'customers',
      title: 'Customers',
      type: 'cube',
      connectedComponent: 1,
      dimensions: [
        dimension('customers.id', 'number', { primaryKey: true }),
        dimension('customers.country'),
        dimension('customers.city'),
        dimension('customers.name'),
      ],
      hierarchies: [
        {
          name: 'customers.place',
          title: 'Place',
          levels: ['customers.country', 'customers.city'],
        },
        {
          name: 'customers.hidden',
          levels: ['customers.country', 'customers.name'],
          public: false,
        },
      ],
    },
    {
      name: 'suppliers',
      title: 'Suppliers',
      type: 'cube',
      connectedComponent: 2,
      dimensions: [dimension('suppliers.name')],
    },
    {
      name: 'order_summary',
      title: 'Order summary',
      type: 'view',
      dimensions: [
        dimension('order_summary.status'),
        dimension('order_summary.country'),
        dimension('order_summary.ordered_at', 'time'),
      ],
    },
  ],
};

const names = (options: readonly { member: string; granularity?: string }[]) =>
  options.map(({ member, granularity }) => (granularity ? `${member} by ${granularity}` : member));

describe('what a tile drills by (AC-237)', () => {
  it('offers the hierarchy’s next level first, then time, then the dimensions', () => {
    const options = drillOptions(META, {
      source: 'orders',
      dimensions: ['customers.country'],
      timeDimensions: {},
      marked: ['customers.country'],
    });

    expect(names(options)).toEqual(
      [
        'customers.city',
        'orders.ordered_at by year',
        'orders.ordered_at by quarter',
        'orders.ordered_at by month',
        'orders.ordered_at by week',
        'orders.ordered_at by day',
        'orders.shipped_at by year',
        'orders.shipped_at by quarter',
        'orders.shipped_at by month',
        'orders.shipped_at by week',
        'orders.shipped_at by day',
        'orders.status',
        'customers.city',
        'customers.name',
      ].filter((each, at, all) => all.indexOf(each) === at),
    );
    expect(options[0]?.kind).toBe('level');
  });

  it('offers no primary key, no marked member, no hidden hierarchy’s level, and nothing of another component', () => {
    const offered = names(
      drillOptions(META, {
        source: 'orders',
        dimensions: ['orders.status'],
        timeDimensions: {},
        marked: ['orders.status'],
      }),
    );

    for (const never of ['orders.id', 'customers.id', 'orders.status', 'suppliers.name'])
      expect(offered, never).not.toContain(never);
  });

  it('offers a time dimension the tile groups by only at finer grains', () => {
    const options = drillOptions(META, {
      source: 'orders',
      dimensions: [],
      timeDimensions: { 'orders.ordered_at': 'month' },
      marked: ['orders.ordered_at'],
    });

    const time = names(options.filter((option) => option.kind === 'time'));
    expect(time.filter((each) => each.startsWith('orders.ordered_at'))).toEqual([
      'orders.ordered_at by week',
      'orders.ordered_at by day',
    ]);
  });

  it('offers a view’s own dimensions alone', () => {
    const options = drillOptions(META, {
      source: 'order_summary',
      dimensions: ['order_summary.status'],
      timeDimensions: {},
      marked: ['order_summary.status'],
    });

    expect(names(options)).toEqual([
      'order_summary.ordered_at by year',
      'order_summary.ordered_at by quarter',
      'order_summary.ordered_at by month',
      'order_summary.ordered_at by week',
      'order_summary.ordered_at by day',
      'order_summary.country',
    ]);
    expect(options.every((option) => !option.from.joined)).toBe(true);
  });

  it('says which cube each is from, and whether through a join', () => {
    const options = drillOptions(META, {
      source: 'orders',
      dimensions: ['orders.status'],
      timeDimensions: {},
      marked: ['orders.status'],
    });

    expect(options.find((option) => option.member === 'customers.name')?.from).toEqual({
      cube: 'customers',
      title: 'Customers',
      joined: true,
    });
    expect(options.find((option) => option.member === 'orders.ordered_at')?.from).toEqual({
      cube: 'orders',
      title: 'Orders',
      joined: false,
    });
  });

  /** T270's review: at an hour, a minute or a second, no grain is finer than the tile's. */
  it('offers no coarser grain of a time grouped finer than a day', () => {
    const options = drillOptions(META, {
      source: 'orders',
      dimensions: [],
      timeDimensions: { 'orders.ordered_at': 'hour' },
      marked: ['orders.ordered_at'],
    });

    expect(
      options
        .filter((option) => option.member === 'orders.ordered_at')
        .map((option) => option.granularity),
    ).toEqual([]);
  });

  /** T270's review: a time member marked through another tile is the marked member itself. */
  it('offers no time member marked on another tile', () => {
    const options = drillOptions(META, {
      source: 'orders',
      dimensions: ['orders.status'],
      timeDimensions: {},
      marked: ['orders.status', 'orders.ordered_at'],
    });

    expect(options.map((option) => option.member)).not.toContain('orders.ordered_at');
    expect(options.map((option) => option.member)).toContain('orders.shipped_at');
  });

  /** T270's review: a joined cube's time is one of its dimensions, and offered with its grains. */
  it('offers the time of the cubes joined to it, after the tile’s own', () => {
    const joined = {
      cubes: [
        ...META.cubes.filter((cube) => cube.name !== 'customers'),
        {
          ...META.cubes.find((cube) => cube.name === 'customers'),
          dimensions: [
            ...(META.cubes.find((cube) => cube.name === 'customers')?.dimensions ?? []),
            dimension('customers.signed_up_at', 'time'),
          ],
        },
      ],
    };
    const time = drillOptions(joined, {
      source: 'orders',
      dimensions: ['orders.status'],
      timeDimensions: {},
      marked: ['orders.status'],
    }).filter((option) => option.kind === 'time');

    expect([...new Set(time.map((option) => option.member))]).toEqual([
      'orders.ordered_at',
      'orders.shipped_at',
      'customers.signed_up_at',
    ]);
    expect(time.find((option) => option.member === 'customers.signed_up_at')?.from.joined).toBe(
      true,
    );
  });

  it('offers nothing where the model is not known', () => {
    expect(
      drillOptions(undefined, { source: 'orders', dimensions: [], timeDimensions: {}, marked: [] }),
    ).toEqual([]);
  });
});

/**
 * T270 / AC-236: the tile redrawn grouped by the chosen dimension — its
 * measures, filters and options kept; its chart type and pinned channels let
 * go, so the chart drawn is the one the recommender draws for the new
 * grouping (a KPI can't show categories). The marking's filter is the
 * dashboard's to add, as it is to the marked rows.
 */
describe('the drilled chart (AC-236)', () => {
  const CHART: ChartDocument = {
    schemaVersion: CHART_DOCUMENT_VERSION,
    title: 'Total amount by country',
    chart: {
      source: { cube: 'orders' },
      wells: {
        measures: ['orders.total_amount'],
        dimensions: ['customers.country'],
        timeDimensions: ['orders.ordered_at'],
      },
      chartType: 'groupedBar',
      encoding: { x: ['customers.country'], color: ['orders.ordered_at'] },
      options: { legend: 'bottom' },
      granularities: { 'orders.ordered_at': 'year' },
      filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    },
  };

  it('groups by the chosen dimension alone, and lets the recommender draw it', () => {
    const drilled = drilledDocument(CHART, { member: 'products.category' });

    expect(drilled.chart).toEqual({
      source: { cube: 'orders' },
      wells: {
        measures: ['orders.total_amount'],
        dimensions: ['products.category'],
        timeDimensions: [],
      },
      options: { legend: 'bottom' },
      filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    });
    expect(drilled.title).toBe(CHART.title);
  });

  /**
   * T270's review: a Top N folds rows into N and "Other" — the drilled rows
   * would differ from Cube's answer for the chosen dimension (AC-236).
   */
  it('lets go of a Top N, which would fold the drilled rows', () => {
    const topped: ChartDocument = {
      ...CHART,
      chart: { ...CHART.chart, options: { legend: 'bottom', topN: { n: 3, other: true } } },
    };

    expect(drilledDocument(topped, { member: 'products.category' }).chart.options).toEqual({
      legend: 'bottom',
    });
  });

  it('groups by a time dimension at the chosen grain', () => {
    const drilled = drilledDocument(CHART, { member: 'orders.shipped_at', granularity: 'week' });

    expect(drilled.chart.wells).toEqual({
      measures: ['orders.total_amount'],
      dimensions: [],
      timeDimensions: ['orders.shipped_at'],
    });
    expect(drilled.chart.granularities).toEqual({ 'orders.shipped_at': 'week' });
  });
});
