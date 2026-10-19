/**
 * T864 (AC-509; design 20 state J; rules 5 and 125): a combo's text
 * alternative names each series' mark, axis and unit, how its axes are
 * drawn, how many series, and each reference line; and its table view heads
 * each measure's column "‹measure› · ‹mark›, ‹axis› · ‹unit›", with a second
 * header row of members while split.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { describeChart } from '../describe';
import { comboColumnHead, comboTableOf, describeCombo } from './describe';

const QUARTER = 'orders.ordered_at';
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';
const regions = ['APAC', 'EMEA', 'LATAM', 'NA'];

const split: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [QUARTER], color: [REGION], y: [REVENUE, MARGIN] },
  measures: [REVENUE, MARGIN],
  rows: ['2026-01-01T00:00:00.000', '2026-04-01T00:00:00.000'].flatMap((quarter, q) =>
    regions.map((region, r) => ({
      [QUARTER]: quarter,
      [REGION]: region,
      [REVENUE]: 100_000 * (q + 1) + r * 1000,
      [MARGIN]: [0.1, 0.2, 0.3, 0.4][r],
    })),
  ),
  granularities: { [QUARTER]: 'quarter' },
  formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [MARGIN]: 'Margin %', [REGION]: 'Region', [QUARTER]: 'Ordered at' },
  options: { series: { [MARGIN]: { axis: 'right' } } },
};

describe("a combo's text alternative (T864)", () => {
  it('reads the split example as design 20 writes it', () => {
    expect(describeCombo(split)).toBe(
      'Combo, by quarter, split by Region. Revenue: bars, left axis, dollars. Margin %: line, right axis, percent. Axes aligned at zero. 8 series.',
    );
    // As the tile reads it.
    expect(describeChart(split)).toBe(describeCombo(split));
  });

  it('adds each reference line drawn, its value in its axis’s format', () => {
    const withPlan: RenderSpec = {
      ...split,
      options: {
        ...split.options,
        references: [
          {
            id: 'plan',
            kind: 'line',
            direction: 'horizontal',
            axis: 'left',
            value: 100_000,
            label: 'Monthly plan',
          },
        ],
      },
    };

    expect(describeCombo(withPlan)).toBe(
      'Combo, by quarter, split by Region. Revenue: bars, left axis, dollars. Margin %: line, right axis, percent. Axes aligned at zero. 8 series. Monthly plan: line at $100K, left axis.',
    );
  });

  it('says one value axis, and synchronized axes, as drawn', () => {
    const unsplit: RenderSpec = {
      ...split,
      encoding: { x: [QUARTER], y: [REVENUE] },
      measures: [REVENUE],
      options: {},
    };
    expect(describeCombo(unsplit)).toBe(
      'Combo, by quarter. Revenue: bars, left axis, dollars. One value axis. 1 series.',
    );
  });
});

describe("a combo's table view (T864)", () => {
  it('heads a measure’s column with its mark, axis and unit', () => {
    expect(comboColumnHead(split, REVENUE)).toBe('Revenue · bars, left · $');
    expect(comboColumnHead(split, MARGIN)).toBe('Margin % · line, right · %');
    expect(comboColumnHead(split, QUARTER)).toBeUndefined();
  });

  it('lays a split combo out by category, a column per member under each measure', () => {
    const table = comboTableOf(split);

    expect(table?.heads).toEqual([
      { measure: REVENUE, title: 'Revenue · bars, left · $', members: regions },
      { measure: MARGIN, title: 'Margin % · line, right · %', members: regions },
    ]);
    expect(table?.category).toBe(QUARTER);
    expect(table?.rows.map((row) => row.category)).toEqual([
      '2026-01-01T00:00:00.000',
      '2026-04-01T00:00:00.000',
    ]);
    expect(table?.rows[0]?.values).toEqual([
      100_000, 101_000, 102_000, 103_000, 0.1, 0.2, 0.3, 0.4,
    ]);
  });

  it('has no split table unsplit', () => {
    expect(comboTableOf({ ...split, encoding: { x: [QUARTER], y: [REVENUE] } })).toBeUndefined();
  });
});
