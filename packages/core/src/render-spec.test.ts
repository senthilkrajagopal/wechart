import { describe, expect, it } from 'vitest';

import { distinctValues, seriesOf, type RenderSpec } from './render-spec';

/**
 * The rows-to-series step every chart type shares (AC-037). It decides how
 * many series a chart has and what each one draws, which is the part the
 * renderers must not each reinvent.
 */
const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';
const TOTAL = 'orders.total';

const spec = (over: Partial<RenderSpec>): RenderSpec => ({
  chartType: 'bar',
  encoding: { category: STATUS, values: [COUNT] },
  rows: [],
  ...over,
});

describe('distinctValues', () => {
  it('keeps the order the rows first mention each value', () => {
    const rows = [{ [STATUS]: 'refunded' }, { [STATUS]: 'paid' }, { [STATUS]: 'refunded' }];

    // Not sorted: the rows arrive in the order Cube was asked for them, and
    // re-sorting here would quietly override the chart's own ordering.
    expect(distinctValues(rows, STATUS)).toEqual(['refunded', 'paid']);
  });
});

describe('one series per measure', () => {
  it('draws each measure against the shared categories', () => {
    const { categories, series } = seriesOf(
      spec({
        encoding: { category: STATUS, values: [COUNT, TOTAL] },
        rows: [
          { [STATUS]: 'paid', [COUNT]: 10, [TOTAL]: 25 },
          { [STATUS]: 'refunded', [COUNT]: 30, [TOTAL]: 15 },
        ],
      }),
    );

    expect(categories).toEqual(['paid', 'refunded']);
    expect(series).toEqual([
      { name: COUNT, values: [10, 30] },
      { name: TOTAL, values: [25, 15] },
    ]);
  });
});

describe('one series per member of a splitting dimension', () => {
  it('draws the same measure once per member', () => {
    const { categories, series } = seriesOf(
      spec({
        encoding: { category: STATUS, series: REGION, values: [COUNT] },
        rows: [
          { [STATUS]: 'paid', [REGION]: 'east', [COUNT]: 10 },
          { [STATUS]: 'paid', [REGION]: 'west', [COUNT]: 20 },
          { [STATUS]: 'refunded', [REGION]: 'east', [COUNT]: 30 },
          { [STATUS]: 'refunded', [REGION]: 'west', [COUNT]: 40 },
        ],
      }),
    );

    expect(categories).toEqual(['paid', 'refunded']);
    expect(series).toEqual([
      { name: 'east', values: [10, 30] },
      { name: 'west', values: [20, 40] },
    ]);
  });

  it('leaves a gap where a member has no row, rather than a zero', () => {
    const { series } = seriesOf(
      spec({
        encoding: { category: STATUS, series: REGION, values: [COUNT] },
        rows: [
          { [STATUS]: 'paid', [REGION]: 'east', [COUNT]: 10 },
          { [STATUS]: 'refunded', [REGION]: 'west', [COUNT]: 40 },
        ],
      }),
    );

    // Zero is a measurement; a missing row is the absence of one. Drawing a
    // gap as a zero-height bar asserts something the data never said.
    expect(series).toEqual([
      { name: 'east', values: [10, null] },
      { name: 'west', values: [null, 40] },
    ]);
  });
});

describe('values that are not numbers', () => {
  it('treats an empty or unparseable measure as a gap', () => {
    const { series } = seriesOf(
      spec({
        rows: [
          { [STATUS]: 'paid', [COUNT]: '' },
          { [STATUS]: 'refunded', [COUNT]: null },
          { [STATUS]: 'pending', [COUNT]: 'n/a' },
        ],
      }),
    );

    expect(series[0]?.values).toEqual([null, null, null]);
  });

  it('accepts the strings Cube actually returns for numbers', () => {
    const { series } = seriesOf(spec({ rows: [{ [STATUS]: 'paid', [COUNT]: '80' }] }));

    // Cube returns measures as strings over JSON, so a renderer that trusted
    // the raw value would sort and scale them as text.
    expect(series[0]?.values).toEqual([80]);
  });
});

describe('a chart with no category', () => {
  it('draws a single unnamed slot, so a KPI-shaped spec still yields a series', () => {
    const { categories, series } = seriesOf(
      spec({ encoding: { values: [COUNT] }, rows: [{ [COUNT]: 240 }] }),
    );

    expect(categories).toEqual(['']);
    expect(series).toEqual([{ name: COUNT, values: [240] }]);
  });
});
