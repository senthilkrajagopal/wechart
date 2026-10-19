import { describe, expect, it } from 'vitest';

import { comboSeriesOf } from './combo';
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
  encoding: { x: [STATUS], y: [COUNT] },
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
        encoding: { x: [STATUS], y: [COUNT, TOTAL] },
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
        encoding: { x: [STATUS], color: [REGION], y: [COUNT] },
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

  /**
   * T467, UX-116 (the phase-1 re-check): a legend read "1997, 1998, 1996",
   * the order Cube answered in — by the measure, largest first. Members that
   * are numbers, years among them, or times are in an order of their own, and
   * the series take it.
   */
  it('orders members that are numbers or times by their value, and others as they came', () => {
    const years = [1997, 1998, 1996].map((year, at) => ({
      [STATUS]: 'paid',
      'orders.year': String(year),
      [COUNT]: 30 - at,
    }));
    const names = (rows: Record<string, unknown>[], member = 'orders.year') =>
      seriesOf(spec({ encoding: { x: [STATUS], color: [member], y: [COUNT] }, rows })).series.map(
        (one) => one.name,
      );

    expect(names(years)).toEqual(['1996', '1997', '1998']);
    // As numbers, not as text: 9 before 10.
    expect(
      names(
        ['10', '9', '100'].map((n) => ({ [STATUS]: 'paid', 'orders.n': n, [COUNT]: 1 })),
        'orders.n',
      ),
    ).toEqual(['9', '10', '100']);
    // Times, in time.
    expect(
      names(
        ['2026-03-01T00:00:00.000', '2026-01-01T00:00:00.000'].map((at) => ({
          [STATUS]: 'paid',
          'orders.month': at,
          [COUNT]: 1,
        })),
        'orders.month',
      ),
    ).toEqual(['2026-01-01T00:00:00.000', '2026-03-01T00:00:00.000']);
    // Anything else keeps Cube's order, and so does a mix.
    expect(
      names(
        ['west', 'east'].map((r) => ({ [STATUS]: 'paid', [REGION]: r, [COUNT]: 1 })),
        REGION,
      ),
    ).toEqual(['west', 'east']);
    expect(
      names(
        ['1997', 'n/a', '1996'].map((y) => ({ [STATUS]: 'paid', 'orders.year': y, [COUNT]: 1 })),
      ),
    ).toEqual(['1997', 'n/a', '1996']);
  });

  it('leaves a gap where a member has no row, rather than a zero', () => {
    const { series } = seriesOf(
      spec({
        encoding: { x: [STATUS], color: [REGION], y: [COUNT] },
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
      spec({ encoding: { y: [COUNT] }, rows: [{ [COUNT]: 240 }] }),
    );

    expect(categories).toEqual(['']);
    expect(series).toEqual([{ name: COUNT, values: [240] }]);
  });
});

/**
 * T852 (AC-504): a combo split by one dimension draws every measure once per
 * member, series = measure × member: each named by its member, so it takes
 * the member's colour, and carrying its measure, so it takes the measure's
 * mark and axis.
 */
describe('a combo split across every measure (AC-504)', () => {
  const QUARTER = 'orders.quarter';
  const REVENUE = 'orders.revenue';
  const MARGIN = 'orders.margin_pct';
  const regions = ['EMEA', 'APAC', 'AMER', 'LATAM'];
  const rows = ['Q1', 'Q2'].flatMap((quarter, q) =>
    regions.map((region, r) => ({
      [QUARTER]: quarter,
      [REGION]: region,
      [REVENUE]: 100 * (q + 1) + r,
      [MARGIN]: 0.1 * (r + 1),
    })),
  );
  const split: RenderSpec = {
    chartType: 'combo',
    encoding: { x: [QUARTER], color: [REGION], y: [REVENUE, MARGIN] },
    rows,
    options: { series: { [MARGIN]: { axis: 'right' } } },
  };

  it('gives 8 series, a measure’s members together in member order', () => {
    const { series } = seriesOf(split);

    expect(series.map((one) => `${one.measure ?? ''} ${one.name}`)).toEqual([
      ...regions.map((region) => `${REVENUE} ${region}`),
      ...regions.map((region) => `${MARGIN} ${region}`),
    ]);
    expect(series[0]).toEqual({ name: 'EMEA', measure: REVENUE, values: [100, 200] });
    expect(series[7]).toEqual({ name: 'LATAM', measure: MARGIN, values: [0.4, 0.4] });
  });

  it('puts Revenue’s on the left and Margin %’s on the right', () => {
    const axes = new Map(
      comboSeriesOf([REVENUE, MARGIN], split.options, { split: true }).map((one) => [
        one.measure,
        one.axis,
      ]),
    );

    expect(seriesOf(split).series.map((one) => axes.get(one.measure ?? ''))).toEqual([
      ...regions.map(() => 'left'),
      ...regions.map(() => 'right'),
    ]);
  });

  it('draws only the first measure per member for any other split chart', () => {
    const { series } = seriesOf({ ...split, chartType: 'groupedBar' });

    expect(series).toHaveLength(4);
    expect(series[0]).toEqual({ name: 'EMEA', values: [100, 200] });
  });
});
