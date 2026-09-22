import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '../render-spec';
import { csvOf, tableColumnsOf } from './csv';

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
