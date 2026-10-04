import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { tilePartsOf } from './tileParts';

/**
 * T631 (AC-176, AC-090, AC-091; R63) and its review: the series and panels a
 * tile's ⋯ menu offers are those a pointer could reach. A series is a legend
 * entry naming the colour split, so a chart whose legend names something
 * else, or that draws none, offers none. A panel is one the trellis draws, as
 * the filters leave it, each carrying its place among the chart's own panels,
 * which is how a header's click is read (`clickedValue`).
 */
const STATUS = 'orders.status';
const CATEGORY = 'products.category';
const COUNT = 'orders.count';

const split = (chartType: RenderSpec['chartType'], categories: readonly string[]): RenderSpec => ({
  chartType,
  encoding: { x: [STATUS], y: [COUNT], color: [CATEGORY] },
  rows: categories.flatMap((category, at) => [
    { [STATUS]: 'shipped', [CATEGORY]: category, [COUNT]: at + 1 },
    { [STATUS]: 'returned', [CATEGORY]: category, [COUNT]: at + 2 },
  ]),
});

describe('the series and panels a tile’s menu offers (T631’s review)', () => {
  it('offers a split chart’s series as its legend lists them, in the order set, without Other or a blank', () => {
    const spec: RenderSpec = {
      ...split('groupedBar', ['Toys', 'Books', '', 'Other (3)']),
      // Customize's order, as the legend draws it (T392).
      options: { seriesOrder: ['Books'] },
    };
    expect(tilePartsOf(spec, spec).series).toEqual(['Books', 'Toys']);
  });

  it('offers no series where the legend names something else, or there is none', () => {
    // A heatmap's colour is its measure, a scale: no legend lists it.
    const heatmap: RenderSpec = {
      chartType: 'heatmap',
      encoding: { x: [STATUS], y: [CATEGORY], color: [COUNT] },
      rows: [
        { [STATUS]: 'shipped', [CATEGORY]: 'Toys', [COUNT]: 42 },
        { [STATUS]: 'returned', [CATEGORY]: 'Books', [COUNT]: 7 },
      ],
    };
    expect(tilePartsOf(heatmap, heatmap).series).toEqual([]);
    // A table marks rows by key; a pie's legend lists its slices.
    for (const chartType of ['table', 'kpi', 'pie', 'donut', 'treemap'] as const) {
      const spec = split(chartType, ['Toys', 'Books']);
      expect(tilePartsOf(spec, spec).series, chartType).toEqual([]);
    }
    // One series draws no legend.
    const one = split('groupedBar', ['Toys']);
    expect(tilePartsOf(one, one).series).toEqual([]);
  });

  it('offers a scatter’s series, as a click on a point means its series', () => {
    const scatter: RenderSpec = {
      chartType: 'scatter',
      encoding: { x: [COUNT], y: ['orders.amount'], color: [CATEGORY] },
      rows: [
        { [COUNT]: 1, 'orders.amount': 10, [CATEGORY]: 'Toys' },
        { [COUNT]: 2, 'orders.amount': 20, [CATEGORY]: 'Books' },
      ],
    };
    expect(tilePartsOf(scatter, scatter).series).toEqual(['Toys', 'Books']);
  });

  it('offers the panels the trellis draws as the filters leave it, each at its place among the chart’s own', () => {
    const facet = (values: readonly string[]): RenderSpec => ({
      chartType: 'trellis',
      encoding: { x: [STATUS], y: [COUNT], facet: [CATEGORY] },
      rows: values.map((value, at) => ({ [STATUS]: 'shipped', [CATEGORY]: value, [COUNT]: at })),
    });
    const own = facet(['Toys', 'Books', 'Games', '']);
    // A filter left Books and the blank out.
    const shown = facet(['Toys', 'Games']);
    expect(tilePartsOf(own, shown).panels).toEqual([
      { value: 'Toys', index: 0 },
      { value: 'Games', index: 2 },
    ]);
  });

  it('offers no more panels than the trellis draws', () => {
    const many = Array.from({ length: 25 }, (_, at) => `Panel ${String(at + 1)}`);
    const spec: RenderSpec = {
      chartType: 'trellis',
      encoding: { x: [STATUS], y: [COUNT], facet: [CATEGORY] },
      rows: many.map((value) => ({ [STATUS]: 'shipped', [CATEGORY]: value, [COUNT]: 1 })),
    };
    const panels = tilePartsOf(spec, spec).panels;
    expect(panels).toHaveLength(20);
    expect(panels.at(-1)).toEqual({ value: 'Panel 20', index: 19 });
  });
});
