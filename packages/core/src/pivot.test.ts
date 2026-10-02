import { describe, expect, it } from 'vitest';

import { pivot } from './pivot';
import type { RenderSpec } from './render-spec';

/**
 * T042 / AC-037: the cross-tab behind the pivot table.
 *
 * TanStack Table has row grouping but no cross-tab (`research/table.md`), so
 * the shape is computed here and the grid only draws it. Doing it in core also
 * means it can be tested on values rather than on rendered cells.
 */
const REGION = 'orders.region';
const STATUS = 'orders.status';
const QUARTER = 'orders.quarter';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'pivot',
  encoding: { row: [REGION], column: [STATUS], y: [COUNT] },
  rows: [
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 2 },
    { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
    { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
  ],
  ...over,
});

describe('the shape of the cross-tab', () => {
  it('turns one dimension down the side and one across the top', () => {
    const result = pivot(spec());

    expect(result.rowHeaders).toEqual([['east'], ['west']]);
    expect(result.columnHeaders).toEqual([['paid'], ['refunded']]);
    expect(result.measures).toEqual([COUNT]);
  });

  it('puts each value where its row and column meet', () => {
    const { cells } = pivot(spec());

    // east/paid, east/refunded, west/paid, west/refunded.
    expect(cells).toEqual([
      [[1], [2]],
      [[4], [8]],
    ]);
  });

  it('leaves a gap where the result has no row for that pair', () => {
    const { cells } = pivot(
      spec({
        rows: [
          { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1 },
          { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
        ],
      }),
    );

    // Null, not zero: nothing was measured for east/refunded, and a zero
    // there would be a number the data never contained.
    expect(cells).toEqual([
      [[1], [null]],
      [[null], [8]],
    ]);
  });

  it('nests headers when a side has more than one dimension', () => {
    const result = pivot(
      spec({
        encoding: { row: [REGION], column: [QUARTER, STATUS], y: [COUNT] },
        rows: [
          { [REGION]: 'east', [QUARTER]: 'Q1', [STATUS]: 'paid', [COUNT]: 1 },
          { [REGION]: 'east', [QUARTER]: 'Q1', [STATUS]: 'refunded', [COUNT]: 2 },
          { [REGION]: 'east', [QUARTER]: 'Q2', [STATUS]: 'paid', [COUNT]: 4 },
        ],
      }),
    );

    expect(result.columnHeaders).toEqual([
      ['Q1', 'paid'],
      ['Q1', 'refunded'],
      ['Q2', 'paid'],
    ]);
  });

  it('keeps the order the rows arrived in, not an alphabetical one', () => {
    const result = pivot(
      spec({
        rows: [
          { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
          { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1 },
        ],
      }),
    );

    // Cube was asked for an order and returned one; re-sorting here would
    // quietly override it (AC-044 owns sorting).
    expect(result.rowHeaders).toEqual([['west'], ['east']]);
    expect(result.columnHeaders).toEqual([['refunded'], ['paid']]);
  });
});

describe('totals', () => {
  it('adds each row across its columns', () => {
    expect(pivot(spec()).rowTotals).toEqual([[3], [12]]);
  });

  it('adds each column down its rows', () => {
    expect(pivot(spec()).columnTotals).toEqual([[5], [10]]);
  });

  it('adds everything for the grand total', () => {
    expect(pivot(spec()).grandTotals).toEqual([15]);
  });

  /**
   * AC-048 (T382's review): a quick calculation is Cube's, cell by cell; a
   * sum of ranks or running totals is no total of it, so it has none here.
   */
  it('gives a calculated measure no totals, rather than a sum worked out here', () => {
    const result = pivot(spec({ calculated: { [COUNT]: { label: 'running total' } } }));

    expect(result.rowTotals).toEqual([[null], [null]]);
    expect(result.columnTotals).toEqual([[null], [null]]);
    expect(result.grandTotals).toEqual([null]);
    // Its cells are Cube's, as they came.
    expect(result.cells[1]?.[1]).toEqual([8]);
  });

  it('totals each measure separately', () => {
    const result = pivot(
      spec({
        encoding: { row: [REGION], column: [STATUS], y: [COUNT, AMOUNT] },
        rows: [
          { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1, [AMOUNT]: 10 },
          { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 2, [AMOUNT]: 20 },
        ],
      }),
    );

    expect(result.measures).toEqual([COUNT, AMOUNT]);
    expect(result.rowTotals).toEqual([[3, 30]]);
    expect(result.grandTotals).toEqual([3, 30]);
  });

  it('is null rather than zero when a row has nothing in it', () => {
    const result = pivot(
      spec({
        rows: [
          { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: null },
          { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
        ],
      }),
    );

    // A row of gaps has no total. Reporting 0 would claim a measurement.
    expect(result.rowTotals).toEqual([[null], [4]]);
  });
});

describe('a spec that cannot be pivoted', () => {
  it('produces an empty cross-tab rather than throwing', () => {
    const result = pivot(spec({ encoding: { y: [COUNT] } }));

    expect(result.rowHeaders).toEqual([]);
    expect(result.columnHeaders).toEqual([]);
    expect(result.cells).toEqual([]);
  });
});

/**
 * T303, AC-044: WHEN the user sorts a chart, THE SYSTEM SHALL order
 * categories by value ascending, value descending or label. A pivot's
 * categories are its row groups; it ignored the setting (the Superset-parity
 * rebuild's gap 8).
 */
describe('a sorted pivot (AC-044)', () => {
  const REGIONS = [
    { [REGION]: 'north', [STATUS]: 'paid', [COUNT]: 5 },
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 2 },
    { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
    { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
    { [REGION]: 'south', [STATUS]: 'refunded', [COUNT]: null },
  ];
  const sorted = (by: 'value' | 'label', direction: 'asc' | 'desc') =>
    pivot(spec({ rows: REGIONS, options: { sort: { by, direction } } }));

  it('orders its rows by their totals, largest first', () => {
    const result = sorted('value', 'desc');

    // west 12, north 5, east 3; south has no measurement and goes last.
    expect(result.rowHeaders).toEqual([['west'], ['north'], ['east'], ['south']]);
    // Each row keeps its own cells and total.
    expect(result.rowTotals).toEqual([[12], [5], [3], [null]]);
    expect(result.cells[0]).toEqual([[4], [8]]);
  });

  it('orders its rows by their totals, smallest first, with no measurement still last', () => {
    expect(sorted('value', 'asc').rowHeaders).toEqual([['east'], ['north'], ['west'], ['south']]);
  });

  it('orders its rows by label either way', () => {
    expect(sorted('label', 'asc').rowHeaders).toEqual([['east'], ['north'], ['south'], ['west']]);
    expect(sorted('label', 'desc').rowHeaders).toEqual([['west'], ['south'], ['north'], ['east']]);
  });

  it('leaves its columns and their totals as they came', () => {
    const result = sorted('value', 'desc');

    expect(result.columnHeaders).toEqual([['paid'], ['refunded']]);
    expect(result.columnTotals).toEqual([[10], [10]]);
    expect(result.grandTotals).toEqual([20]);
  });
});
