import { describe, expect, it } from 'vitest';

import { toChartSpec, type ChartDocument } from '../chart-document';
import { toCubeQuery } from '../chart-spec';
import {
  COLUMN_KINDS,
  GRAPHICAL_TABLE_PAGE_ROWS,
  graphicalTableModule,
  graphicalTableOf,
  graphicalTablePage,
  graphicalTableTrends,
  newColumn,
  pageQueries,
  withColumns,
  type GraphicalTableColumn,
} from './graphicalTable';
import { CHART_TYPE_MODULES } from './index';

/**
 * T943 / AC-570, AC-037: WHEN a graphical table is edited, THE SYSTEM SHALL
 * take Rows (one dimension), Group rows by (an optional second dimension …),
 * and Columns, an ordered list in which each column is a Value, Change,
 * Sparkline, Bullet or Icon, set with R80's element settings for that kind …
 * `Fails when: a column kind is missing or another is offered; a column's
 * settings differ from R80's element's; …` (AC-570); and a spec of one of
 * R81's types fails to parse, or saved and reopened draws otherwise (AC-037).
 */
const CATEGORY_COLUMNS: readonly GraphicalTableColumn[] = [
  { kind: 'value', settings: { measure: 'orders.revenue' } },
  {
    kind: 'sparkline',
    settings: {
      measure: 'orders.revenue',
      time: 'orders.ordered_at',
      granularity: 'month',
      last: 12,
    },
  },
  {
    kind: 'bullet',
    settings: {
      measure: 'orders.margin',
      target: { kind: 'measure', measure: 'orders.margin_target' },
      ranges: [0.15, 0.2, 0.25],
    },
  },
  {
    kind: 'icon',
    settings: {
      measure: 'orders.margin',
      of: 'orders.margin_target',
      rules: [
        { op: '>=', value: 1, state: 'success', label: 'On track' },
        { op: '>=', value: 0.9, state: 'warning', label: 'At risk' },
        { op: 'otherwise', state: 'error', label: 'Off track' },
      ],
    },
  },
  {
    kind: 'change',
    settings: {
      measure: 'orders.revenue',
      time: 'orders.ordered_at',
      compare: 'previous_period',
      period: 'quarter',
      show: 'percent',
      direction: 'higher',
    },
  },
];

describe('the graphical table’s spec (AC-570, AC-037)', () => {
  it('is registered as the graphical table’s module', () => {
    expect(CHART_TYPE_MODULES.graphicalTable).toBe(graphicalTableModule);
    expect(graphicalTableModule.type).toBe('graphicalTable');
  });

  it('offers exactly the five column kinds, in design 23’s order', () => {
    expect(COLUMN_KINDS.map((one) => one.label)).toEqual([
      'Value',
      'Change',
      'Sparkline',
      'Bullet',
      'Icon',
    ]);
  });

  it('parses Category’s Value, Sparkline, Bullet, Icon and Change columns and saves them back in order', () => {
    const saved = graphicalTableModule.save({ columns: CATEGORY_COLUMNS });
    // Saved as JSON is, then read back: the same columns, in the same order.
    const reopened = graphicalTableModule.parse(JSON.parse(JSON.stringify(saved)));
    expect(reopened.columns).toEqual(CATEGORY_COLUMNS);
    expect(reopened.columns.map((one) => one.kind)).toEqual([
      'value',
      'sparkline',
      'bullet',
      'icon',
      'change',
    ]);
  });

  it('stores each column’s settings as R80’s element of that kind stores them', () => {
    const saved = graphicalTableModule.save({ columns: CATEGORY_COLUMNS }) as {
      columns: Record<string, unknown>[];
    };
    // A Bullet column is R80's Bullet graph; the rest keep their names.
    expect(saved.columns.map((one) => one['kind'])).toEqual([
      'value',
      'sparkline',
      'bulletGraph',
      'icon',
      'change',
    ]);
    expect(saved.columns[2]).toEqual({
      kind: 'bulletGraph',
      measure: 'orders.margin',
      target: { kind: 'measure', measure: 'orders.margin_target' },
      ranges: [0.15, 0.2, 0.25],
    });
  });

  it('leaves out a column whose settings R80’s element would refuse, and keeps the rest in order', () => {
    const reopened = graphicalTableModule.parse({
      columns: [
        { kind: 'value', measure: 'orders.revenue' },
        // A fourth range: R80's bullet graph takes at most 3.
        { kind: 'bulletGraph', measure: 'orders.margin', ranges: [1, 2, 3, 4] },
        { kind: 'gauge', measure: 'orders.margin' },
        { kind: 'change', measure: 'orders.revenue', period: 'fortnight' },
        { kind: 'icon', measure: 'orders.margin' },
      ],
    });
    expect(reopened.columns).toEqual([
      { kind: 'value', settings: { measure: 'orders.revenue' } },
      { kind: 'icon', settings: { measure: 'orders.margin' } },
    ]);
  });

  it('keeps no marking or filter of a column’s own: the table’s rows mark, and its filters are the chart’s (T943-1)', () => {
    const reopened = graphicalTableModule.parse({
      columns: [
        {
          kind: 'value',
          measure: 'orders.revenue',
          marking: 'Marking',
          whenUnmarked: 'none',
          filters: [{ member: 'orders.region', operator: 'equals', values: ['EMEA'] }],
        },
      ],
    });
    expect(reopened.columns).toEqual([{ kind: 'value', settings: { measure: 'orders.revenue' } }]);
  });

  it('saves nothing for a table with no columns, so its options stay as they were', () => {
    expect(graphicalTableModule.save({ columns: [] })).toBeUndefined();
    expect(graphicalTableModule.parse(undefined)).toEqual({ columns: [] });
    expect(withColumns({ other: 1 }, [])).toEqual({ other: 1 });
  });

  it('reads Rows and Group rows by from the chart’s first and second dimensions', () => {
    const table = graphicalTableOf({
      wells: { measures: ['orders.revenue'], dimensions: ['products.category', 'orders.region'] },
      options: withColumns({}, CATEGORY_COLUMNS),
    });
    expect(table.rows).toBe('products.category');
    expect(table.groupBy).toBe('orders.region');
    expect(table.columns).toEqual(CATEGORY_COLUMNS);

    const ungrouped = graphicalTableOf({
      wells: { measures: ['orders.revenue'], dimensions: ['products.category'] },
    });
    expect(ungrouped.rows).toBe('products.category');
    expect(ungrouped.groupBy).toBeUndefined();
    expect(ungrouped.columns).toEqual([]);
  });

  it('starts a new column on the measure it is given, as R80’s element starts on its source', () => {
    expect(newColumn('sparkline', 'orders.revenue')).toEqual({
      kind: 'sparkline',
      settings: { measure: 'orders.revenue' },
    });
  });
});

/**
 * T944 / AC-571: THE SYSTEM SHALL draw a graphical table … Value cells …;
 * Change cells R80's Change; Sparkline cells R80's sparkline …, each scaled
 * to its own row; Bullet cells R80's bullet graph …; and Icon cells …
 * What each cell needs is asked of Cube: the values by Rows (and Group rows
 * by), every column's measures among them; and each trend — a Sparkline's,
 * a Change's periods — by Rows and its time at its grain.
 */
describe('what a graphical table asks of Cube (T944, AC-571)', () => {
  const document = (dimensions: readonly string[]) =>
    ({
      schemaVersion: 2,
      title: 'Categories',
      chart: {
        source: { cube: 'orders' },
        wells: {
          measures: ['orders.revenue'],
          dimensions,
          timeDimensions: ['orders.ordered_at'],
        },
        chartType: 'graphicalTable',
        options: withColumns({}, CATEGORY_COLUMNS),
      },
    }) as unknown as ChartDocument;

  it('asks its values by Rows and Group rows by, with every column’s measures, and not by Time', () => {
    const query = toCubeQuery(
      toChartSpec(document(['products.category', 'customers.region', 'orders.status'])),
    );
    expect(query['measures']).toEqual(['orders.margin', 'orders.margin_target', 'orders.revenue']);
    expect(query['dimensions']).toEqual(['customers.region', 'products.category']);
    expect(query['timeDimensions']).toBeUndefined();
  });

  it('asks each trend once, by its time and grain, over its last periods, under the values’ filters', () => {
    const now = new Date('2026-10-18T09:00:00Z');
    const values = {
      measures: ['orders.margin', 'orders.margin_target', 'orders.revenue'],
      dimensions: ['products.category'],
      filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    };
    const trends = graphicalTableTrends(values, CATEGORY_COLUMNS, 'orders.ordered_at', now);
    expect(trends.map(({ time, periods }) => [time.member, time.granularity, periods])).toEqual([
      ['orders.ordered_at', 'month', 12],
      ['orders.ordered_at', 'quarter', 12],
    ]);
    expect(trends[0]?.query).toEqual({
      measures: ['orders.revenue'],
      dimensions: ['products.category'],
      filters: values.filters,
      timeDimensions: [
        {
          dimension: 'orders.ordered_at',
          granularity: 'month',
          dateRange: ['2025-11-01', '2026-10-31'],
        },
      ],
      order: { 'orders.ordered_at': 'asc' },
    });
    expect(trends[1]?.query['timeDimensions']).toEqual([
      {
        dimension: 'orders.ordered_at',
        granularity: 'quarter',
        dateRange: ['2024-01-01', '2026-12-31'],
      },
    ]);
  });

  it('asks no trend where a column has no time and the chart has none', () => {
    expect(
      graphicalTableTrends({ measures: [] }, [CATEGORY_COLUMNS[2]!], undefined, new Date()),
    ).toEqual([]);
    const sparkline = { kind: 'sparkline' as const, settings: { measure: 'orders.revenue' } };
    expect(graphicalTableTrends({ measures: [] }, [sparkline], undefined, new Date())).toEqual([]);
  });
});

/**
 * T945 / AC-572: WHILE a graphical table has more than 50 rows, THE SYSTEM
 * SHALL show 50 a page with "Rows 1–50 of ‹n›" and ‹ › buttons; and SHALL
 * query each page with two Cube requests, the values and the values by the
 * sparkline's time granularity for that page's members only.
 * `Fails when: more than 50 rows show at once; a page makes more than two
 * Cube requests, or its trend request covers members outside the page.`
 */
describe('a graphical table’s pages (T945, AC-572)', () => {
  const now = new Date('2026-10-18T09:00:00Z');
  const values = {
    measures: ['orders.revenue'],
    dimensions: ['products.product'],
    filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
  };
  const rows = Array.from({ length: 214 }, (_, at) => ({
    'products.product': `Product ${String(at + 1)}`,
    'orders.revenue': String(1000 - at),
  }));
  const columns: readonly GraphicalTableColumn[] = [
    { kind: 'value', settings: { measure: 'orders.revenue' } },
    { kind: 'sparkline', settings: { measure: 'orders.revenue', granularity: 'month' } },
  ];
  const table = { rows: 'products.product', columns, chartTime: 'orders.ordered_at', now };

  it('holds 50 rows a page, the last page what is left', () => {
    expect(GRAPHICAL_TABLE_PAGE_ROWS).toBe(50);
    const second = graphicalTablePage(rows, 1);
    expect([second.first, second.rows.length, second.pages, second.total]).toEqual([
      50, 50, 5, 214,
    ]);
    expect(second.rows[0]?.['products.product']).toBe('Product 51');
    const last = graphicalTablePage(rows, 4);
    expect([last.first, last.rows.length]).toEqual([200, 14]);
    // Past the last page is the last page.
    expect(graphicalTablePage(rows, 9).first).toBe(200);
  });

  it('asks page 2 of 214 rows in two queries, the second its 50 members by month', () => {
    const asked = pageQueries(values, rows, 1, table);
    const queries = [asked.values, ...asked.trends.map((trend) => trend.query)];
    expect(queries).toHaveLength(2);
    expect(asked.values).toEqual(values);
    const trend = asked.trends[0]?.query ?? {};
    expect(trend['timeDimensions']).toEqual([
      {
        dimension: 'orders.ordered_at',
        granularity: 'month',
        dateRange: ['2025-11-01', '2026-10-31'],
      },
    ]);
    expect(trend['filters']).toEqual([
      ...values.filters,
      {
        member: 'products.product',
        operator: 'equals',
        values: Array.from({ length: 50 }, (_, at) => `Product ${String(at + 51)}`),
      },
    ]);
  });

  it('asks a page’s members once each, even where Group rows by repeats them', () => {
    const grouped = [
      { 'products.product': 'Tea', 'customers.region': 'EMEA' },
      { 'products.product': 'Tea', 'customers.region': 'APAC' },
      { 'products.product': 'Cod', 'customers.region': 'EMEA' },
    ];
    const asked = pageQueries(values, grouped, 0, table);
    expect(asked.trends[0]?.query['filters']).toContainEqual({
      member: 'products.product',
      operator: 'equals',
      values: ['Tea', 'Cod'],
    });
  });
});
