import { describe, expect, it } from 'vitest';

import {
  COLUMN_KINDS,
  graphicalTableModule,
  graphicalTableOf,
  newColumn,
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
