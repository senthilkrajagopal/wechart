import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { UNMARKED_OPACITY } from './render';

/**
 * T190 / AC-096: WHEN a tile shows a marking, THE SYSTEM SHALL draw marked
 * items in their own colour with an outline in the marking's colour and fade
 * unmarked items (direction.md rule 49).
 * `Fails when: unmarked items render at full strength, or marked items carry
 * no outline.`
 *
 * `markedItemStyle` decided what one item looks like at T102 and nothing ever
 * called it. This is the other half: finding the row behind each drawn item
 * so the style can be applied to it.
 */
const rows = [
  { 'orders.status': 'shipped', 'orders.count': 30 },
  { 'orders.status': 'processing', 'orders.count': 20 },
];

const bar: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows,
  palette: ['#2a78d6'],
};

const MARKING_COLOUR = '#151107';
const marked = (spec: RenderSpec, values: readonly string[]): RenderSpec => ({
  ...spec,
  marking: {
    predicate: {
      items: values.map((value) => [{ member: 'orders.status', value }]),
      ranges: [],
    },
    colour: MARKING_COLOUR,
  },
});

type Item = {
  itemStyle?: { color?: string; opacity?: number; borderColor?: string; borderWidth?: number };
};
const itemsOf = (option: unknown) =>
  ((option as { series: { data: Item[] }[] }).series[0]?.data ?? []) as Item[];

describe('a chart drawing a marking', () => {
  it('keeps a marked item’s own colour and outlines it in the marking’s', () => {
    const [shipped] = itemsOf(optionFor(marked(bar, ['shipped'])));

    expect(shipped?.itemStyle?.color).toBe('#2a78d6');
    expect(shipped?.itemStyle?.borderColor).toBe(MARKING_COLOUR);
    expect(shipped?.itemStyle?.borderWidth).toBeGreaterThan(0);
    expect(shipped?.itemStyle?.opacity).toBe(1);
  });

  it('fades the items that are not marked', () => {
    const [, processing] = itemsOf(optionFor(marked(bar, ['shipped'])));

    expect(processing?.itemStyle?.opacity).toBe(UNMARKED_OPACITY);
    // Faded, not recoloured: it is still its own series.
    expect(processing?.itemStyle?.color).toBe('#2a78d6');
  });

  it('fades nothing while the marking is empty', () => {
    const none = itemsOf(optionFor(marked(bar, [])));

    expect(none.every((item) => (item.itemStyle?.opacity ?? 1) === 1)).toBe(true);
  });

  it('marks the right slice of a pie, which names its items', () => {
    const pie = { ...bar, chartType: 'pie' as const };
    const items = itemsOf(optionFor(marked(pie, ['processing'])));

    expect(items[0]?.itemStyle?.opacity).toBe(UNMARKED_OPACITY);
    expect(items[1]?.itemStyle?.opacity).toBe(1);
    expect(items[1]?.itemStyle?.borderColor).toBe(MARKING_COLOUR);
  });

  // T232's review: a slice of a pie over two dimensions is named "a · b", which
  // is no row's value; it is matched by the values it carries.
  it('marks the right slice of a pie split by a second dimension', () => {
    const REGION = 'orders.region';
    const splitPie: RenderSpec = {
      chartType: 'pie',
      encoding: { x: ['orders.status'], y: ['orders.count'], color: [REGION] },
      rows: [
        { 'orders.status': 'shipped', [REGION]: 'North', 'orders.count': 3 },
        { 'orders.status': 'shipped', [REGION]: 'South', 'orders.count': 4 },
        { 'orders.status': 'processing', [REGION]: 'North', 'orders.count': 5 },
      ],
    };
    const items = itemsOf(optionFor(marked(splitPie, ['shipped'])));

    expect(items.map((item) => item.itemStyle?.opacity ?? 1)).toEqual([1, 1, UNMARKED_OPACITY]);
    expect(items[0]?.itemStyle?.borderColor).toBe(MARKING_COLOUR);
  });

  it('marks by the series where the chart is split by one', () => {
    const split: RenderSpec = {
      chartType: 'stackedBar',
      encoding: {
        x: ['orders.ordered_at'],
        y: ['orders.count'],
        color: ['products.category'],
      },
      rows: [
        { 'orders.ordered_at': '2026-01', 'products.category': 'Beverages', 'orders.count': 3 },
        { 'orders.ordered_at': '2026-01', 'products.category': 'Produce', 'orders.count': 7 },
      ],
      marking: {
        predicate: {
          items: [[{ member: 'products.category', value: 'Beverages' }]],
          ranges: [],
        },
        colour: MARKING_COLOUR,
      },
    };

    const series = (optionFor(split) as { series: { name?: string; data: Item[] }[] }).series;
    const opacityOf = (name: string) =>
      series.find((one) => one.name === name)?.data[0]?.itemStyle?.opacity;

    expect(opacityOf('Beverages')).toBe(1);
    expect(opacityOf('Produce')).toBe(UNMARKED_OPACITY);
  });

  it('leaves a chart with no marking exactly as it was', () => {
    const plain = itemsOf(optionFor(bar));

    // No per-item marking style at all: a bar's colour and its surface gap
    // are the series' business, and stay there.
    expect(plain.every((item) => item.itemStyle?.opacity === undefined)).toBe(true);
    expect(plain.every((item) => item.itemStyle?.borderColor === undefined)).toBe(true);
    expect(plain.every((item) => item.itemStyle?.color === undefined)).toBe(true);
  });
});

/**
 * T242's review: a heatmap's cell and a scatter's point are no category's
 * index — a cell is a column and a row, a point its two values in its series
 * — and each is matched to the row it was drawn from by those.
 */
describe('marking the types that draw from x and y otherwise', () => {
  const REGION = 'orders.region';

  it('marks the heatmap cells of the marked rows', () => {
    const heatmap = marked(
      {
        chartType: 'heatmap',
        encoding: { x: ['orders.status'], y: [REGION], color: ['orders.count'] },
        rows: [
          // A row with no measure draws no cell: indices would shift past it.
          { 'orders.status': 'processing', [REGION]: 'North', 'orders.count': null },
          { 'orders.status': 'processing', [REGION]: 'South', 'orders.count': 3 },
          { 'orders.status': 'shipped', [REGION]: 'North', 'orders.count': 5 },
        ],
      },
      ['shipped'],
    );
    const cells = itemsOf(optionFor(heatmap)) as unknown as {
      value: number[];
      itemStyle?: { opacity?: number };
    }[];
    expect(cells.map((cell) => [cell.value[2], cell.itemStyle?.opacity ?? 1])).toEqual([
      [3, UNMARKED_OPACITY],
      [5, 1],
    ]);
  });

  it('marks a scatter’s points by their series and their values', () => {
    const scatter = marked(
      {
        chartType: 'scatter',
        encoding: { x: ['orders.count'], y: ['orders.total'], color: ['orders.status'] },
        rows: [
          { 'orders.status': 'processing', 'orders.count': 1, 'orders.total': 10 },
          { 'orders.status': 'shipped', 'orders.count': 2, 'orders.total': 20 },
          { 'orders.status': 'shipped', 'orders.count': 3, 'orders.total': 30 },
        ],
      },
      ['shipped'],
    );
    const series = (
      optionFor(scatter) as {
        series: { name: string; data: { itemStyle?: { opacity?: number } }[] }[];
      }
    ).series;
    expect(
      series.map((one) => [one.name, one.data.map((point) => point.itemStyle?.opacity ?? 1)]),
    ).toEqual([
      ['processing', [UNMARKED_OPACITY]],
      ['shipped', [1, 1]],
    ]);
  });
});
