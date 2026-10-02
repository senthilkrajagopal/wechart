import { describe, expect, it } from 'vitest';

import { chartDocumentOf } from './chart-document';
import { addToWell, emptySpec, removeFromWell, toCubeQuery, type ChartSpec } from './chart-spec';
import { compile } from './compile';
import {
  MOVING_AVERAGE_PERIODS,
  QUICK_CALCS,
  QUICK_CALC_NAMES,
  applyQuickCalc,
  periodGrainOf,
  quickCalcName,
  quickCalcTypeRefusal,
  readQuickCalcs,
  withMemberLabels,
  withoutCalculations,
} from './quickCalc';
import type { RenderSpec } from './render-spec';

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 *
 * The menu draws from this list, so the list is where a missing one would
 * start.
 */
describe('the six quick calculations (AC-047)', () => {
  it('are the six the criterion names, in its order', () => {
    expect(QUICK_CALCS.map((kind) => QUICK_CALC_NAMES[kind])).toEqual([
      '% of total',
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Rank',
      'Moving average',
    ]);
  });

  it('are each named as applied, a moving average with its window', () => {
    expect(quickCalcName({ kind: 'percentOfTotal' })).toBe('% of total');
    expect(quickCalcName({ kind: 'rank' })).toBe('Rank');
    expect(quickCalcName({ kind: 'movingAverage', periods: 3 })).toBe('Moving average, 3 periods');
  });

  it('offer a moving average over 3, 6 or 12 periods (the user, 2026-09-24)', () => {
    expect(MOVING_AVERAGE_PERIODS).toEqual([3, 6, 12]);
    expect(quickCalcName({ kind: 'movingAverage', periods: 12 })).toBe(
      'Moving average, 12 periods',
    );
  });
});

describe('a calculation applied to a measure of the chart', () => {
  const spec = addToWell(
    addToWell(emptySpec('orders'), 'measures', 'orders.count'),
    'measures',
    'orders.total_amount',
  );

  it('is held on the chart, by the measure it applies to', () => {
    const applied = applyQuickCalc(spec, 'orders.count', { kind: 'rank' });

    expect(applied.calculations).toEqual({ 'orders.count': { kind: 'rank' } });
  });

  it('replaces the measure’s calculation, and leaves the other measure’s', () => {
    const both = applyQuickCalc(
      applyQuickCalc(spec, 'orders.count', { kind: 'rank' }),
      'orders.total_amount',
      { kind: 'percentOfTotal' },
    );

    expect(
      applyQuickCalc(both, 'orders.count', { kind: 'movingAverage', periods: 6 }).calculations,
    ).toEqual({
      'orders.count': { kind: 'movingAverage', periods: 6 },
      'orders.total_amount': { kind: 'percentOfTotal' },
    });
  });

  it('is taken off, leaving none stored once the last one goes', () => {
    const applied = applyQuickCalc(spec, 'orders.count', { kind: 'rank' });

    expect(applyQuickCalc(applied, 'orders.count', undefined)).not.toHaveProperty('calculations');
  });

  it('goes with its measure when the measure leaves the chart', () => {
    const applied = applyQuickCalc(
      applyQuickCalc(spec, 'orders.count', { kind: 'rank' }),
      'orders.total_amount',
      { kind: 'runningTotal' },
    );

    expect(removeFromWell(applied, 'measures', 'orders.count').calculations).toEqual({
      'orders.total_amount': { kind: 'runningTotal' },
    });
    expect(
      removeFromWell(
        removeFromWell(applied, 'measures', 'orders.count'),
        'measures',
        'orders.total_amount',
      ),
    ).not.toHaveProperty('calculations');
  });
});

describe('reading a stored chart’s calculations', () => {
  it('reads each of the six', () => {
    const stored = {
      'a.one': { kind: 'percentOfTotal' },
      'a.two': { kind: 'differenceFromPrevious' },
      'a.three': { kind: 'percentDifferenceFromPrevious' },
      'a.four': { kind: 'runningTotal' },
      'a.five': { kind: 'rank' },
      'a.six': { kind: 'movingAverage', periods: 12 },
    };

    expect(readQuickCalcs(stored)).toEqual(stored);
  });

  it('refuses a calculation wechart does not have', () => {
    expect(() => readQuickCalcs({ 'a.one': { kind: 'median' } })).toThrow(/a\.one/);
  });

  it('refuses a moving average over a window the menu does not offer', () => {
    expect(() => readQuickCalcs({ 'a.one': { kind: 'movingAverage', periods: 5 } })).toThrow(
      /a\.one/,
    );
  });

  it('refuses anything but a map of measures to calculations', () => {
    expect(() => readQuickCalcs([{ kind: 'rank' }])).toThrow();
  });
});

/**
 * AC-048: WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in
 * Cube as a multi-stage measure rather than in the browser, and the tile SHALL
 * label the measure with the calculation applied.
 * Fails when: the value is computed from the already-fetched rows, or the
 * label does not name the calculation.
 *
 * The chart's query asks xcube for each calculation in a `calculations`
 * block, and xcube answers it with a companion multi-stage measure that Cube
 * computes (research `xcube-quick-calcs.md`). Nothing here computes a value.
 */
function byMonth(calculations?: ChartSpec['calculations']): ChartSpec {
  return {
    cube: 'orders',
    measures: ['orders.total_amount', 'orders.count'],
    dimensions: [],
    timeDimensions: ['orders.ordered_at'],
    granularities: { 'orders.ordered_at': 'month' },
    ...(calculations === undefined ? {} : { calculations }),
  };
}

describe('the chart’s query asks Cube for each calculation (AC-048)', () => {
  it('asks for each by its measure, in xcube’s words, and still asks for the measure', () => {
    const query = toCubeQuery(
      byMonth({
        'orders.total_amount': { kind: 'rank' },
        'orders.count': { kind: 'runningTotal' },
      }),
    );

    expect(query['measures']).toEqual(['orders.count', 'orders.total_amount']);
    expect(query['calculations']).toEqual([
      { measure: 'orders.count', kind: 'running_total' },
      { measure: 'orders.total_amount', kind: 'rank' },
    ]);
  });

  it.each([
    [{ kind: 'percentOfTotal' }, { kind: 'pct_of_total' }],
    [{ kind: 'differenceFromPrevious' }, { kind: 'difference' }],
    [{ kind: 'percentDifferenceFromPrevious' }, { kind: 'pct_difference' }],
    [{ kind: 'runningTotal' }, { kind: 'running_total' }],
    [{ kind: 'rank' }, { kind: 'rank' }],
    [
      { kind: 'movingAverage', periods: 6 },
      { kind: 'moving_average', periods: 6 },
    ],
  ] as const)('asks for %o as %o', (calc, asked) => {
    expect(toCubeQuery(byMonth({ 'orders.count': calc }))['calculations']).toEqual([
      { measure: 'orders.count', ...asked },
    ]);
  });

  it('asks the same query however the calculations were applied, so its answer is cached once', () => {
    const one = byMonth({
      'orders.count': { kind: 'rank' },
      'orders.total_amount': { kind: 'percentOfTotal' },
    });
    const other = byMonth({
      'orders.total_amount': { kind: 'percentOfTotal' },
      'orders.count': { kind: 'rank' },
    });

    expect(JSON.stringify(toCubeQuery(one))).toBe(JSON.stringify(toCubeQuery(other)));
  });

  it('asks nothing new of a chart with no calculation', () => {
    expect(toCubeQuery(byMonth())).not.toHaveProperty('calculations');
  });

  it('asks for none on a measure the chart doesn’t show', () => {
    const spec = { ...byMonth({ 'orders.gone': { kind: 'rank' } }) };

    expect(toCubeQuery(spec)).not.toHaveProperty('calculations');
  });

  it('asks for none on a box plot, whose rows are each one observation', () => {
    const spec: ChartSpec = {
      ...byMonth({ 'orders.count': { kind: 'rank' } }),
      dimensions: ['orders.status'],
      chartType: 'boxplot',
    };

    expect(toCubeQuery(spec)).not.toHaveProperty('calculations');
  });
});

/**
 * R45.4: with the chart's last time field taken out, a calculation over time
 * stays chosen but paused: the chart draws the plain measure. xcube computes
 * one only on a query with exactly one time dimension, at the hour or coarser
 * (research `xcube-quick-calcs.md`, "The `calculations` block").
 */
describe('a calculation over time, paused (R45.4)', () => {
  const overTime = {
    'orders.count': { kind: 'runningTotal' },
    'orders.total_amount': { kind: 'rank' },
  } as const;

  it('isn’t asked for on a chart with no time field, while rank and % of total still are', () => {
    const spec: ChartSpec = { ...byMonth(overTime), timeDimensions: [], granularities: {} };

    expect(toCubeQuery(spec)['calculations']).toEqual([
      { measure: 'orders.total_amount', kind: 'rank' },
    ]);
  });

  it('isn’t asked for with two time fields in Time', () => {
    const spec: ChartSpec = {
      ...byMonth(overTime),
      timeDimensions: ['orders.ordered_at', 'orders.shipped_at'],
    };

    expect(toCubeQuery(spec)['calculations']).toEqual([
      { measure: 'orders.total_amount', kind: 'rank' },
    ]);
  });

  it('isn’t asked for at a grain finer than the hour', () => {
    const spec: ChartSpec = {
      ...byMonth(overTime),
      granularities: { 'orders.ordered_at': 'minute' },
    };

    expect(toCubeQuery(spec)['calculations']).toEqual([
      { measure: 'orders.total_amount', kind: 'rank' },
    ]);
  });

  it('says why, or the grain it runs at', () => {
    expect(periodGrainOf({})).toEqual({ paused: 'noTime' });
    expect(periodGrainOf({ 'orders.ordered_at': 'day', 'orders.shipped_at': 'day' })).toEqual({
      paused: 'severalTimes',
      count: 2,
    });
    expect(periodGrainOf({ 'orders.ordered_at': 'second' })).toEqual({
      paused: 'tooFine',
      member: 'orders.ordered_at',
      granularity: 'second',
    });
    expect(periodGrainOf({ 'orders.ordered_at': 'week' })).toEqual({ granularity: 'week' });
  });
});

describe('the measure is labelled with the calculation applied (AC-048)', () => {
  const TITLES = { 'orders.count': 'Orders Count', 'orders.total_amount': 'Orders Total Amount' };
  const SHORT = { 'orders.count': 'Count', 'orders.total_amount': 'Total Amount' };
  const FORMATS = { 'orders.total_amount': 'currency' };

  const drawn = (
    calculations: NonNullable<ChartSpec['calculations']>,
    spec: ChartSpec = byMonth(),
  ) =>
    compile(chartDocumentOf({ title: 'A chart', spec: { ...spec, calculations } }), {
      rows: [],
      chartType: 'line',
      titles: TITLES,
      shortTitles: SHORT,
      formats: FORMATS,
    });

  it.each([
    [{ kind: 'percentOfTotal' }, '% of total'],
    [{ kind: 'differenceFromPrevious' }, 'difference from previous month'],
    [{ kind: 'percentDifferenceFromPrevious' }, '% difference from previous month'],
    [{ kind: 'runningTotal' }, 'running total'],
    [{ kind: 'rank' }, 'rank'],
    [{ kind: 'movingAverage', periods: 3 }, '3-month moving average'],
  ] as const)('names %o in its measure’s title and short title: “%s”', (calc, named) => {
    const spec = drawn({ 'orders.count': calc });

    expect(spec.titles?.['orders.count']).toBe(`Orders Count (${named})`);
    expect(spec.shortTitles?.['orders.count']).toBe(`Count (${named})`);
    // The other measure is its own.
    expect(spec.titles?.['orders.total_amount']).toBe('Orders Total Amount');
  });

  it('names the grain the chart asks at', () => {
    const weekly: ChartSpec = { ...byMonth(), granularities: { 'orders.ordered_at': 'week' } };

    expect(
      drawn({ 'orders.count': { kind: 'movingAverage', periods: 12 } }, weekly).titles?.[
        'orders.count'
      ],
    ).toBe('Orders Count (12-week moving average)');
  });

  it('writes a share as a percentage, a rank as a plain number, and the rest as its measure is written', () => {
    expect(drawn({ 'orders.total_amount': { kind: 'percentOfTotal' } }).formats).toMatchObject({
      'orders.total_amount': 'percent',
    });
    expect(
      drawn({ 'orders.count': { kind: 'percentDifferenceFromPrevious' } }).formats,
    ).toMatchObject({ 'orders.count': 'percent' });
    expect(drawn({ 'orders.total_amount': { kind: 'rank' } }).formats).toMatchObject({
      'orders.total_amount': 'number',
    });
    for (const calc of [
      { kind: 'differenceFromPrevious' },
      { kind: 'runningTotal' },
      { kind: 'movingAverage', periods: 3 },
    ] as const)
      expect(drawn({ 'orders.total_amount': calc }).formats).toMatchObject({
        'orders.total_amount': 'currency',
      });
  });

  it('names none on a box plot drawn as the type chosen in the editor, whose query asks none', () => {
    // T382's review: the editor holds a chosen type outside the chart.
    const box = compile(
      chartDocumentOf({ title: 'A box plot', spec: byMonth({ 'orders.count': { kind: 'rank' } }) }),
      { rows: [], chartType: 'boxplot', titles: TITLES },
    );

    expect(box.titles?.['orders.count']).toBe('Orders Count');
    expect(box).not.toHaveProperty('calculated');
  });

  it('names no calculation that is paused', () => {
    const spec = drawn(
      { 'orders.count': { kind: 'runningTotal' } },
      { ...byMonth(), timeDimensions: [], granularities: {} },
    );

    expect(spec.titles?.['orders.count']).toBe('Orders Count');
    expect(spec).not.toHaveProperty('calculated');
  });

  it('keeps the label when the model’s titles and formats are put on the drawn chart later', () => {
    // A dashboard compiles a tile before its model arrives, then writes it
    // with the model's titles and formats (`DashboardView`).
    const tile: RenderSpec = compile(
      chartDocumentOf({
        title: 'A tile',
        spec: byMonth({ 'orders.total_amount': { kind: 'percentOfTotal' } }),
      }),
      { rows: [], chartType: 'line' },
    );

    const labelled = withMemberLabels(tile, {
      titles: TITLES,
      shortTitles: SHORT,
      formats: FORMATS,
    });

    expect(labelled.titles).toEqual({
      'orders.count': 'Orders Count',
      'orders.total_amount': 'Orders Total Amount (% of total)',
    });
    expect(labelled.shortTitles?.['orders.total_amount']).toBe('Total Amount (% of total)');
    expect(labelled.formats?.['orders.total_amount']).toBe('percent');
  });

  it('leaves the calculation out of the labels of the rows behind the chart, which carry none', () => {
    // T382's review: the underlying rows are the measure as it is.
    const tile = drawn({ 'orders.total_amount': { kind: 'percentOfTotal' } });

    expect(withoutCalculations(tile.titles, tile)).toEqual({ 'orders.count': 'Orders Count' });
    expect(withoutCalculations(tile.formats, tile)).toEqual({});
    expect(withoutCalculations(undefined, tile)).toEqual({});
  });

  it('names the calculation even before the model’s titles arrive', () => {
    const tile = compile(
      chartDocumentOf({ title: 'A tile', spec: byMonth({ 'orders.count': { kind: 'rank' } }) }),
      { rows: [], chartType: 'line' },
    );

    expect(tile.titles?.['orders.count']).toBe('orders.count (rank)');
  });
});

/**
 * R46: wechart disables, with the reason, each calculation that would be
 * wrong or change meaning for a measure's type (research
 * `xcube-quick-calcs.md`, "Which types take which calculation"). Cube names a
 * measure's type in `/v1/meta` as `aggType`, camelized (`countDistinct`;
 * research/cube/data-modeling.md).
 */
describe('the calculations each type of measure takes (R46)', () => {
  const takes = (aggType: string | undefined, cumulative = false) =>
    QUICK_CALCS.filter(
      (kind) =>
        quickCalcTypeRefusal(kind, {
          ...(aggType === undefined ? {} : { aggType }),
          cumulative,
        }) === undefined,
    );
  const ALL = [...QUICK_CALCS];
  const ALONG_PERIODS = ['differenceFromPrevious', 'percentDifferenceFromPrevious', 'rank'];

  it('a count or a sum takes all six', () => {
    expect(takes('count')).toEqual(ALL);
    expect(takes('sum')).toEqual(ALL);
  });

  it('a distinct count takes all but % of total, its shares overlapping', () => {
    for (const aggType of ['countDistinct', 'countDistinctApprox'])
      expect(takes(aggType)).toEqual(ALL.filter((kind) => kind !== 'percentOfTotal'));
  });

  it('an average, minimum, maximum or number takes the differences and rank only', () => {
    for (const aggType of ['avg', 'min', 'max', 'number'])
      expect(takes(aggType)).toEqual(ALONG_PERIODS);
  });

  it('a rolling measure, or one that isn’t a number, takes none', () => {
    expect(takes('sum', true)).toEqual([]);
    expect(takes('string')).toEqual([]);
  });

  it('says why, naming the type', () => {
    expect(quickCalcTypeRefusal('runningTotal', { aggType: 'avg' })).toMatch(/^Not for an average/);
    expect(quickCalcTypeRefusal('percentOfTotal', { aggType: 'countDistinct' })).toMatch(
      /^Not for a distinct count/,
    );
    expect(quickCalcTypeRefusal('movingAverage', { aggType: 'max' })).toMatch(
      /^Not for a maximum/,
    );
    expect(quickCalcTypeRefusal('rank', { aggType: 'sum', cumulative: true })).toMatch(
      /^Not for a rolling measure/,
    );
  });

  it('leaves a measure whose type isn’t known to Cube to judge', () => {
    expect(takes(undefined)).toEqual(ALL);
  });
});
