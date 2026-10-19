import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { tilePartsOf } from './tileParts';

/**
 * T631 (AC-176, AC-090, AC-091; R63) and its review: the series and panels a
 * tile's ⋯ menu offers are those a pointer could reach. A series is a legend
 * entry naming the colour split, so a chart whose legend names something
 * else, or that draws none, offers none. A panel is one the trellis draws, as
 * the filters leave it.
 *
 * T632: each panel carries its place among the panels as drawn, which is how
 * a header's click now names it too; and each series and panel is labelled
 * as the legend and the panel's header write it, a value of time by its
 * granularity (AC-188).
 */
const STATUS = 'orders.status';
const CATEGORY = 'products.category';
const COUNT = 'orders.count';
const MONTH = 'orders.created_at.month';

const split = (chartType: RenderSpec['chartType'], categories: readonly string[]): RenderSpec => ({
  chartType,
  encoding: { x: [STATUS], y: [COUNT], color: [CATEGORY] },
  rows: categories.flatMap((category, at) => [
    { [STATUS]: 'shipped', [CATEGORY]: category, [COUNT]: at + 1 },
    { [STATUS]: 'returned', [CATEGORY]: category, [COUNT]: at + 2 },
  ]),
});

const values = (parts: readonly { value: string }[]) => parts.map((part) => part.value);

describe('the series and panels a tile’s menu offers (T631’s review, T632)', () => {
  it('offers a split chart’s series as its legend lists them, in the order set, without Other or a blank', () => {
    const spec: RenderSpec = {
      ...split('groupedBar', ['Toys', 'Books', '', 'Other (3)']),
      // Customize's order, as the legend draws it (T392).
      options: { seriesOrder: ['Books'] },
    };
    expect(tilePartsOf(spec).series).toEqual([
      { value: 'Books', label: 'Books' },
      { value: 'Toys', label: 'Toys' },
    ]);
  });

  it('offers a split combo’s members once each, though every measure is drawn per member (T852)', () => {
    const spec: RenderSpec = {
      ...split('combo', ['Toys', 'Books']),
      encoding: { x: [STATUS], y: [COUNT, 'orders.total'], color: [CATEGORY] },
    };
    expect(values(tilePartsOf(spec).series)).toEqual(['Toys', 'Books']);
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
    expect(tilePartsOf(heatmap).series).toEqual([]);
    // A table marks rows by key; a pie's legend lists its slices.
    for (const chartType of ['table', 'kpi', 'pie', 'donut', 'treemap'] as const) {
      expect(tilePartsOf(split(chartType, ['Toys', 'Books'])).series, chartType).toEqual([]);
    }
    // One series draws no legend.
    expect(tilePartsOf(split('groupedBar', ['Toys'])).series).toEqual([]);
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
    expect(values(tilePartsOf(scatter).series)).toEqual(['Toys', 'Books']);
  });

  it('offers the panels the trellis draws, each at its place among them, as a header’s click names it', () => {
    const shown: RenderSpec = {
      chartType: 'trellis',
      encoding: { x: [STATUS], y: [COUNT], facet: [CATEGORY] },
      // As the filters leave it: Toys, a blank panel, then Games.
      rows: ['Toys', '', 'Games'].map((value, at) => ({
        [STATUS]: 'shipped',
        [CATEGORY]: value,
        [COUNT]: at,
      })),
    };
    expect(tilePartsOf(shown).panels).toEqual([
      { value: 'Toys', label: 'Toys', index: 0 },
      { value: 'Games', label: 'Games', index: 2 },
    ]);
  });

  it('offers no more panels than the trellis draws', () => {
    const many = Array.from({ length: 25 }, (_, at) => `Panel ${String(at + 1)}`);
    const spec: RenderSpec = {
      chartType: 'trellis',
      encoding: { x: [STATUS], y: [COUNT], facet: [CATEGORY] },
      rows: many.map((value) => ({ [STATUS]: 'shipped', [CATEGORY]: value, [COUNT]: 1 })),
    };
    const panels = tilePartsOf(spec).panels;
    expect(panels).toHaveLength(20);
    expect(panels.at(-1)).toEqual({ value: 'Panel 20', label: 'Panel 20', index: 19 });
  });

  // T632: as the legend and the panel's header write them (AC-188).
  it('labels a value of time by its granularity, as the legend and the header write it', () => {
    const months = ['2026-01-01T00:00:00.000', '2026-02-01T00:00:00.000'];
    const bySeries: RenderSpec = {
      chartType: 'multiLine',
      encoding: { x: [STATUS], y: [COUNT], color: [MONTH] },
      granularities: { 'orders.created_at': 'month' },
      rows: months.map((month, at) => ({ [STATUS]: 'shipped', [MONTH]: month, [COUNT]: at })),
    };
    expect(tilePartsOf(bySeries).series).toEqual([
      { value: months[0], label: 'Jan 2026' },
      { value: months[1], label: 'Feb 2026' },
    ]);
    const byPanel: RenderSpec = {
      chartType: 'trellis',
      encoding: { x: [STATUS], y: [COUNT], facet: [MONTH] },
      granularities: { 'orders.created_at': 'month' },
      rows: months.map((month, at) => ({ [STATUS]: 'shipped', [MONTH]: month, [COUNT]: at })),
    };
    expect(tilePartsOf(byPanel).panels).toEqual([
      { value: months[0], label: 'Jan 2026', index: 0 },
      { value: months[1], label: 'Feb 2026', index: 1 },
    ]);
  });
});
