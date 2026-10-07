import { describe, expect, it } from 'vitest';

import type { RenderSpec } from './render-spec';
import { onOneScale, scaleOf, undrawnMeasures } from './undrawn';

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
  it('reads a combo as a bar: one scale, or its first alone when split', () => {
    expect(undrawnMeasures(spec('combo', [COUNT, 'orders.items', AMOUNT]))).toEqual([
      { member: AMOUNT, reason: 'scale' },
    ]);
    expect(undrawnMeasures(spec('combo', [COUNT, 'orders.items'], { color: [REGION] }))).toEqual([
      { member: 'orders.items', reason: 'form' },
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
