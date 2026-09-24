import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '../render-spec';
import { columnTitleOf, csvOf, tableColumnsOf } from './csv';

/**
 * T177 / AC-171: WHEN the user exports a chart or a marked-rows view, THE
 * SYSTEM SHALL produce a CSV whose rows and columns match what the tile
 * shows, including the applied filters and marking limits.
 * Fails when: the CSV contains rows the tile excluded, or omits a displayed
 * column.
 *
 * A tile's rows and columns are its table's — the table a table tile draws
 * and every chart's Table view (AC-178) — from its render spec, whose rows are
 * already filtered, folded to their top N and sorted (`compile`): every row,
 * a column for every key the rows carry in the order they carry them, each
 * value written as the table writes it (`formatValue`). Marking limits are
 * deferred with markings.
 */
const SPEC: RenderSpec = {
  chartType: 'stackedBar',
  encoding: { x: ['orders.status'], y: ['orders.count'], color: ['orders.region'] },
  rows: [
    { 'orders.status': 'shipped', 'orders.region': 'North', 'orders.count': '3' },
    { 'orders.status': 'completed', 'orders.region': 'South', 'orders.count': '5' },
  ],
};

const lines = (csv: string) => csv.split('\r\n');

describe('the columns a tile’s table heads', () => {
  it('are every key its rows carry, in the order they carry them — encoded or not', () => {
    expect(
      tableColumnsOf([
        { 'orders.status': 'shipped', 'orders.ordered_at.day': 'x', 'orders.ordered_at': 'x' },
        { 'orders.status': 'x', 'orders.id': '7' },
      ]),
    ).toEqual(['orders.status', 'orders.ordered_at.day', 'orders.ordered_at', 'orders.id']);
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it — … table headers … — and never by its
 * internal name.
 * `Fails when: a legend, table header, pill, chip or trace shows a name such
 * as "orders.count".`
 */
describe('a column’s title (AC-220)', () => {
  const titles = { 'orders.count': 'Orders Count', 'orders.ordered_at': 'Orders Ordered at' };

  it('is its member’s title', () => {
    expect(columnTitleOf('orders.count', titles)).toBe('Orders Count');
  });

  it('is a time member’s title with its grain, for the column Cube names by both', () => {
    expect(columnTitleOf('orders.ordered_at.month', titles)).toBe('Orders Ordered at (month)');
  });

  it('is its name only where the model gives no title', () => {
    expect(columnTitleOf('orders.city', titles)).toBe('orders.city');
    expect(columnTitleOf('orders.count')).toBe('orders.count');
  });

  it('heads a CSV’s columns as its table does, a raw number’s among them (AC-171)', () => {
    const spec: RenderSpec = {
      ...SPEC,
      measures: ['orders.count'],
      titles: { 'orders.status': 'Orders Status', 'orders.count': 'Orders Count' },
    };
    expect(lines(csvOf(spec))[0]).toBe(
      'Orders Status,orders.region,Orders Count,Orders Count (raw)',
    );
  });
});

describe('a chart’s CSV', () => {
  it('has the table’s columns, in its order, and a row for each row it draws', () => {
    expect(lines(csvOf(SPEC))).toEqual([
      'orders.status,orders.region,orders.count',
      'shipped,North,3',
      'completed,South,5',
    ]);
  });

  it('keeps a column no channel places: a second dimension, a time bucket (T177’s review)', () => {
    const spec: RenderSpec = {
      chartType: 'table',
      encoding: { x: ['orders.status'], y: ['orders.count'] },
      rows: [{ 'orders.status': 'shipped', 'orders.id': '7', 'orders.count': '1' }],
    };
    expect(lines(csvOf(spec))[0]).toBe('orders.status,orders.id,orders.count');
  });

  it('writes each value as the table writes it, by its member’s format and granularity', () => {
    const spec: RenderSpec = {
      chartType: 'table',
      encoding: { x: ['orders.ordered_at.month'], y: ['orders.total'] },
      rows: [{ 'orders.ordered_at.month': '2026-01-01T00:00:00.000', 'orders.total': '1234.5' }],
      formats: { 'orders.total': 'currency' },
      granularities: { 'orders.ordered_at.month': 'month' },
    };
    const [, row] = lines(csvOf(spec));
    // `currency` is d3's `$,.2~f`, whose `~` trims trailing zeros, as the table shows it.
    expect(row).toBe('Jan 2026,"$1,234.5"');
  });

  it('writes the rows the tile draws and no others: its "Other", as folded', () => {
    const folded: RenderSpec = {
      chartType: 'bar',
      encoding: { x: ['orders.status'], y: ['orders.count'] },
      rows: [
        { 'orders.status': 'shipped', 'orders.count': '9' },
        { 'orders.status': 'Other (3)', 'orders.count': '4' },
      ],
    };
    expect(lines(csvOf(folded))).toEqual([
      'orders.status,orders.count',
      'shipped,9',
      'Other (3),4',
    ]);
  });

  it('quotes a value holding a comma, a quote or a line break, and leaves a gap empty', () => {
    const spec: RenderSpec = {
      chartType: 'table',
      encoding: { x: ['c.name'], y: ['c.count'] },
      rows: [
        { 'c.name': 'Smith, J', 'c.count': '1' },
        { 'c.name': 'The "best"', 'c.count': null },
        { 'c.name': 'two\nlines', 'c.count': '2' },
      ],
    };
    expect(lines(csvOf(spec))).toEqual([
      'c.name,c.count',
      '"Smith, J",1',
      '"The ""best""",',
      '"two\nlines",2',
    ]);
  });

  it('keeps a spreadsheet from reading text as a formula, and leaves numbers as they are', () => {
    const spec: RenderSpec = {
      chartType: 'table',
      encoding: { x: ['c.name'], y: ['c.delta'] },
      rows: [
        { 'c.name': '=HYPERLINK("x")', 'c.delta': '-5' },
        { 'c.name': '@SUM(A1)', 'c.delta': '-0.5' },
        { 'c.name': '-dash', 'c.delta': '+2' },
      ],
    };
    expect(lines(csvOf(spec))).toEqual([
      'c.name,c.delta',
      `"'=HYPERLINK(""x"")",-5`,
      `'@SUM(A1),-0.5`,
      // A number is written as the table writes it: `+2` as 2.
      `'-dash,2`,
    ]);
  });

  it('leaves a formatted number as written: the formatter’s own text is not a formula', () => {
    const spec: RenderSpec = {
      chartType: 'table',
      encoding: { x: ['c.name'], y: ['c.delta'] },
      rows: [{ 'c.name': 'a', 'c.delta': '-1234.5' }],
      formats: { 'c.delta': 'currency' },
    };
    expect(lines(csvOf(spec))[1]).toBe('a,"-$1,234.5"');
  });
});

/**
 * T179 / AC-173: THE SYSTEM SHALL format exported values with their member
 * formats, and SHALL write raw numeric values for measures so the file can be
 * re-analysed.
 * Fails when: a measure is exported only as a formatted string.
 *
 * Each measure's column as the table writes it, then its raw number beside
 * it, headed "<member> (raw)": the displayed columns all kept (AC-171), and
 * the number as Cube gave it, for a spreadsheet to sum.
 */
describe('a measure in a chart’s CSV', () => {
  const spec: RenderSpec = {
    chartType: 'bar',
    encoding: { x: ['orders.ordered_at.month'], y: ['orders.total', 'orders.count'] },
    measures: ['orders.total', 'orders.count'],
    rows: [
      {
        'orders.ordered_at.month': '2026-01-01T00:00:00.000',
        'orders.total': '1234.5',
        'orders.count': '12000',
      },
      {
        'orders.ordered_at.month': '2026-02-01T00:00:00.000',
        'orders.total': '-7',
        'orders.count': null,
      },
    ],
    formats: { 'orders.total': 'currency' },
    granularities: { 'orders.ordered_at.month': 'month' },
  };

  it('is written formatted, with its raw number beside it', () => {
    expect(lines(csvOf(spec))).toEqual([
      'orders.ordered_at.month,orders.total,orders.total (raw),orders.count,orders.count (raw)',
      'Jan 2026,"$1,234.5",1234.5,"12,000",12000',
      // A negative number is a number, not a formula; no value, no number.
      'Feb 2026,-$7,-7,,',
    ]);
  });

  it('writes a folded "Other" sum without floating-point noise (T179’s review)', () => {
    const folded: RenderSpec = {
      chartType: 'bar',
      encoding: { x: ['orders.status'], y: ['orders.rate'] },
      measures: ['orders.rate'],
      // As top-N folding sums them: 0.1 + 0.2 in binary floating point.
      rows: [{ 'orders.status': 'Other (2)', 'orders.rate': 0.1 + 0.2 }],
    };
    expect(lines(csvOf(folded))[1]).toBe('Other (2),0.3,0.3');
  });

  it('adds no raw column for a dimension', () => {
    expect(lines(csvOf(spec))[0]).not.toContain('orders.ordered_at.month (raw)');
  });
});
