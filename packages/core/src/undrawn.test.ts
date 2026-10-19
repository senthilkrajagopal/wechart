import { describe, expect, it } from 'vitest';

import type { RenderSpec } from './render-spec';
import { onOneScale, scaleOf, undrawnMeasures, undrawnOffers } from './undrawn';

/**
 * T510 (AC-036, AC-187; UX-057, design 01-5; R67, the user): never draw a
 * metric invisibly. A metric whose Cube format differs from the first's —
 * money, a share or a plain number — is on another scale (the user's option
 * A: no magnitude threshold). An unsplit bar, line or area draws the first
 * metric's scale alone ("Draw the first only"), and every metric a form
 * doesn't draw is named, with why.
 */
describe('the scale a format puts a value on (T510)', () => {
  it('reads money, a share and a plain number from what /v1/meta reports', () => {
    // research/cube/data-modeling.md, "What /v1/meta reports for each format".
    expect(scaleOf(undefined)).toBe('number');
    expect(scaleOf('currency')).toBe('currency USD');
    expect(scaleOf('percent')).toBe('percent');
    expect(scaleOf({ name: 'currency_0', specifier: '$,.0f' })).toBe('currency USD');
    expect(scaleOf({ name: 'percent_1', specifier: '.1~%' })).toBe('percent');
    expect(scaleOf({ name: 'abbr', specifier: '.2~s' })).toBe('number');
    expect(scaleOf({ name: 'accounting', specifier: '(,.2~f' })).toBe('number');
    expect(scaleOf({ specifier: '$,.1f' })).toBe('currency USD');
    expect(scaleOf(',.2~f')).toBe('number');
  });

  it('keeps money in one currency apart from money in another', () => {
    expect(scaleOf({ name: 'currency', specifier: '$,.2~f', currency: 'EUR' })).toBe(
      'currency EUR',
    );
    expect(scaleOf({ name: 'currency', specifier: '$,.2~f', currency: 'EUR' })).not.toBe(
      scaleOf('currency'),
    );
  });
});

const AMOUNT = 'orders.amount';
const COUNT = 'orders.count';
const SHARE = 'orders.share';
const STATUS = 'orders.status';
const REGION = 'orders.region';
const FORMATS = { [AMOUNT]: 'currency', [SHARE]: 'percent' };

const spec = (
  chartType: RenderSpec['chartType'],
  measures: string[],
  extra: Partial<RenderSpec['encoding']> = {},
): RenderSpec => ({
  chartType,
  encoding: { x: [STATUS], y: measures, ...extra },
  rows: [],
  formats: FORMATS,
  measures,
});

describe('the metrics a form leaves undrawn (T510)', () => {
  it('names a metric on another scale than the first, on an unsplit bar, line or area', () => {
    for (const chartType of ['bar', 'hbar', 'groupedBar', 'line', 'multiLine', 'area'] as const) {
      expect(undrawnMeasures(spec(chartType, [AMOUNT, COUNT, SHARE]))).toEqual([
        { member: COUNT, reason: 'scale' },
        { member: SHARE, reason: 'scale' },
      ]);
    }
    // Two of one scale are drawn together, as before.
    expect(undrawnMeasures(spec('bar', [COUNT, 'orders.items']))).toEqual([]);
  });

  it('names every metric past the first where the form draws one', () => {
    for (const chartType of ['kpi', 'pie', 'donut', 'treemap', 'boxplot', 'map'] as const) {
      expect(undrawnMeasures(spec(chartType, [COUNT, 'orders.items']))).toEqual([
        { member: 'orders.items', reason: 'form' },
      ]);
    }
    // Split by colour, a bar draws its first metric once per member.
    expect(
      undrawnMeasures(spec('stackedBar', [COUNT, 'orders.items'], { color: [REGION] })),
    ).toEqual([{ member: 'orders.items', reason: 'form' }]);
    // A scatter draws two.
    expect(undrawnMeasures(spec('scatter', [COUNT, AMOUNT, SHARE]))).toEqual([
      { member: SHARE, reason: 'form' },
    ]);
  });

  /**
   * T510's review: a combo draws every metric on one value axis, its first as
   * bars and the rest as lines (`series/combo.ts`), so it is held to one scale
   * as a bar is, and split by colour it draws its first alone.
   */
  it('reads a combo as a bar: one scale, split or not (T852: split, every metric is drawn)', () => {
    expect(undrawnMeasures(spec('combo', [COUNT, 'orders.items', AMOUNT]))).toEqual([
      { member: AMOUNT, reason: 'scale' },
    ]);
    // AC-504 (T852): split, a combo draws every metric once per member,
    // where it drew its first alone; each still held to its axis's scale.
    expect(undrawnMeasures(spec('combo', [COUNT, 'orders.items'], { color: [REGION] }))).toEqual(
      [],
    );
    expect(
      undrawnMeasures(spec('combo', [COUNT, 'orders.items', AMOUNT], { color: [REGION] })),
    ).toEqual([{ member: AMOUNT, reason: 'scale' }]);
  });

  /**
   * T846 (AC-497): a combo's second axis has a scale of its own. Each metric
   * is held to the first on its own axis, so one the author put on the right
   * is drawn there, whatever the left's scale.
   */
  it('holds each metric of a combo to the first on its own axis', () => {
    const onRight = (axis: Record<string, { axis: string }>): RenderSpec => ({
      ...spec('combo', [AMOUNT, COUNT, SHARE, 'orders.items']),
      options: { series: axis },
    });

    expect(undrawnMeasures(onRight({ [SHARE]: { axis: 'right' } }))).toEqual([
      { member: COUNT, reason: 'scale' },
      { member: 'orders.items', reason: 'scale' },
    ]);
    // Two on the right on different scales: the second right one isn't drawn.
    expect(
      undrawnMeasures(onRight({ [SHARE]: { axis: 'right' }, [COUNT]: { axis: 'right' } })),
    ).toEqual([
      { member: SHARE, reason: 'scale' },
      { member: 'orders.items', reason: 'scale' },
    ]);
  });

  it('names none where every metric is drawn: a table, a pivot, small multiples by metric', () => {
    expect(undrawnMeasures(spec('table', [AMOUNT, COUNT, SHARE]))).toEqual([]);
    expect(undrawnMeasures(spec('pivot', [AMOUNT, COUNT, SHARE]))).toEqual([]);
    expect(undrawnMeasures(spec('trellis', [AMOUNT, COUNT, SHARE]))).toEqual([]);
    // Panelled by a member, they draw the first metric in each panel.
    expect(undrawnMeasures(spec('trellis', [AMOUNT, COUNT], { facet: [REGION] }))).toEqual([
      { member: COUNT, reason: 'form' },
    ]);
  });

  /**
   * AC-597: parallel coordinates draw every metric on an axis of its own, so
   * none is undrawn, whatever its scale, and split by Colour or not (the
   * coordinator's Sales dashboard: three of four axes were called "not drawn").
   */
  it('names none on parallel coordinates: one axis per metric, each on its own scale', () => {
    const four = [AMOUNT, COUNT, SHARE, 'orders.items'];
    expect(undrawnMeasures(spec('parallel', four))).toEqual([]);
    expect(undrawnMeasures(spec('parallel', four, { color: [REGION] }))).toEqual([]);
    // Nor is any taken off its axis to hold the first's scale.
    const drawn = spec('parallel', four);
    expect(onOneScale(drawn)).toBe(drawn);
  });
});

/**
 * AC-506 (T855's follow-up, T854): a combo's metric on another scale is
 * offered a right axis first; R67's offers stay as they were elsewhere.
 */
describe('what an undrawn metric is offered (AC-506)', () => {
  it('offers a combo’s metric on another scale a right axis, small multiples and a table, in that order', () => {
    expect(undrawnOffers('combo', 'scale')).toEqual(['rightAxis', 'smallMultiples', 'table']);
  });

  it('offers a line chart’s the same metric small multiples and a table only', () => {
    expect(undrawnOffers('line', 'scale')).toEqual(['smallMultiples', 'table']);
    expect(undrawnOffers('combo', 'form')).toEqual(['smallMultiples', 'table']);
  });
});

describe('an unsplit bar, line or area drawn on its first metric’s scale (T510; R67)', () => {
  it('keeps the metrics on the first’s scale on its value axis, and no other', () => {
    expect(onOneScale(spec('bar', [AMOUNT, COUNT, 'orders.refunds'])).encoding.y).toEqual([AMOUNT]);
    const twoMoney = { ...spec('line', [AMOUNT, COUNT, 'orders.refunds']) };
    const both = { ...twoMoney, formats: { ...FORMATS, 'orders.refunds': 'currency' } };
    expect(onOneScale(both).encoding.y).toEqual([AMOUNT, 'orders.refunds']);
  });

  it('leaves every other chart as it is', () => {
    const same = spec('bar', [COUNT, 'orders.items']);
    expect(onOneScale(same)).toBe(same);
    const split = spec('bar', [AMOUNT, COUNT], { color: [REGION] });
    expect(onOneScale(split)).toBe(split);
    const scatter = spec('scatter', [AMOUNT, COUNT]);
    expect(onOneScale(scatter)).toBe(scatter);
  });
});

/**
 * T853 (AC-505): a combo draws at most 8 series; a whole measure past them
 * isn't drawn, the last added first, and its pill says "over 8 series".
 */
describe('a combo past 8 series (T853, AC-505)', () => {
  const nine = Array.from({ length: 9 }, (_, at) => `orders.m${String(at + 1)}`);

  it('names the ninth unsplit measure as over 8 series', () => {
    expect(undrawnMeasures(spec('combo', nine))).toEqual([
      { member: 'orders.m9', reason: 'series' },
    ]);
  });

  it('counts only the measures drawn on their scale, and leaves the last added out first', () => {
    // AMOUNT is on another scale: it isn't drawn, so it takes no series.
    const measures = [...nine.slice(0, 8), AMOUNT, 'orders.m9'];
    expect(undrawnMeasures(spec('combo', measures))).toEqual([
      { member: AMOUNT, reason: 'scale' },
      { member: 'orders.m9', reason: 'series' },
    ]);
  });

  it('counts each member of a split: 3 measures × 4 regions with All chosen draw 2', () => {
    const split: RenderSpec = {
      ...spec('combo', [COUNT, 'orders.items', 'orders.lines'], { color: [REGION] }),
      rows: ['North', 'South', 'East', 'West'].map((region) => ({
        [STATUS]: 'open',
        [REGION]: region,
        [COUNT]: 1,
        'orders.items': 2,
        'orders.lines': 3,
      })),
      options: { combo: { shown: 'all' } },
    };

    expect(undrawnMeasures(split)).toEqual([{ member: 'orders.lines', reason: 'series' }]);
    // Not drawn, so not a series.
    expect(onOneScale(split).encoding.y).toEqual([COUNT, 'orders.items']);
  });

  /**
   * Checkpoint 1's review (AC-505): the fold is drawing's, with the formats,
   * so the editor and a dashboard fold alike. Revenue ($), Cost ($) and
   * Margin % (a plain number here) by 4 regions: Margin % is on another
   * scale, so 2 measures × 4 = 8 draw unfolded; all three on one scale fold
   * to the top 1 + Other.
   */
  it('folds the members as drawn, by the measures drawn on their scale', () => {
    const REVENUE = 'orders.revenue';
    const COST = 'orders.cost';
    const MARGIN = 'orders.margin';
    const split = (formats: Record<string, string>): RenderSpec => ({
      chartType: 'combo',
      encoding: { x: [STATUS], color: [REGION], y: [REVENUE, COST, MARGIN] },
      measures: [REVENUE, COST, MARGIN],
      rows: ['North', 'South', 'East', 'West'].map((region, at) => ({
        [STATUS]: 'open',
        [REGION]: region,
        [REVENUE]: 40 - at,
        [COST]: 10,
        [MARGIN]: 2,
      })),
      formats,
    });
    const regions = (spec: RenderSpec) => onOneScale(spec).rows.map((row) => row[REGION]);

    expect(regions(split({ [REVENUE]: 'currency', [COST]: 'currency' }))).toEqual([
      'North',
      'South',
      'East',
      'West',
    ]);
    expect(
      regions(split({ [REVENUE]: 'currency', [COST]: 'currency', [MARGIN]: 'currency' })),
    ).toEqual(['North', 'Other (3)']);
  });

  it('offers Small multiples and Table for a measure over 8 series', () => {
    expect(undrawnOffers('combo', 'series')).toEqual(['smallMultiples', 'table']);
  });
});
