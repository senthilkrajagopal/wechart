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

/**
 * T507 / AC-096: each item is marked by the rows it was drawn from — never by
 * its place among the categories, which a heatmap's cells and a scatter's
 * points don't follow (T453's finding) — on every chart type that marks.
 * `Fails when: unmarked items render at full strength, or marked items carry
 * no outline.`
 */
describe('each item marked by its own rows (T507)', () => {
  const STATUS = 'orders.status';
  const REGION = 'orders.region';
  const HATCH = { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 };
  type Drawn = {
    value?: unknown;
    name?: string;
    itemStyle?: { opacity?: number; borderColor?: string; decal?: unknown };
  };
  const seriesIn = (option: unknown) =>
    (
      option as {
        series: {
          name?: string;
          type?: string;
          data: Drawn[];
          lineStyle?: { opacity?: number };
        }[];
      }
    ).series;
  const isMarked = (item: Drawn | undefined) =>
    item?.itemStyle?.borderColor === MARKING_COLOUR && (item.itemStyle.opacity ?? 1) === 1;
  const isFaded = (item: Drawn | undefined) => item?.itemStyle?.opacity === UNMARKED_OPACITY;

  it('marks a heatmap’s cells by their column and row, whatever order its rows come in', () => {
    // Not in column order: processing, shipped, processing.
    const heatmap = marked(
      {
        chartType: 'heatmap',
        encoding: { x: [STATUS], y: [REGION], color: ['orders.count'] },
        rows: [
          { [STATUS]: 'processing', [REGION]: 'South', 'orders.count': 3 },
          { [STATUS]: 'shipped', [REGION]: 'North', 'orders.count': 5 },
          { [STATUS]: 'processing', [REGION]: 'North', 'orders.count': 7 },
          { [STATUS]: 'shipped', [REGION]: 'South', 'orders.count': 2 },
        ],
      },
      ['shipped'],
    );
    const cells = seriesIn(optionFor(heatmap))[0]?.data ?? [];
    const byValue = (value: number) =>
      cells.find((cell) => (cell.value as number[] | undefined)?.[2] === value);

    expect([5, 2].map((value) => isMarked(byValue(value)))).toEqual([true, true]);
    expect([3, 7].map((value) => isFaded(byValue(value)))).toEqual([true, true]);
  });

  it('marks each of a scatter’s points by its own row, however many share a series', () => {
    const scatter = marked(
      {
        chartType: 'scatter',
        encoding: { x: ['orders.count'], y: ['orders.total'], color: [STATUS] },
        measures: ['orders.count', 'orders.total'],
        rows: [
          { [STATUS]: 'shipped', [REGION]: 'North', 'orders.count': 1, 'orders.total': 10 },
          { [STATUS]: 'processing', [REGION]: 'North', 'orders.count': 2, 'orders.total': 20 },
          { [STATUS]: 'shipped', [REGION]: 'South', 'orders.count': 3, 'orders.total': 30 },
          { [STATUS]: 'processing', [REGION]: 'South', 'orders.count': 1, 'orders.total': 40 },
        ],
      },
      ['shipped'],
    );
    const series = seriesIn(optionFor(scatter));

    expect(series.map((one) => [one.name, one.data.map(isMarked)])).toEqual([
      ['shipped', [true, true]],
      ['processing', [false, false]],
    ]);
    expect(series[1]?.data.every(isFaded)).toBe(true);
  });

  it('marks a trellis’s bars in each panel by its panel and category', () => {
    const trellis = marked(
      {
        chartType: 'trellis',
        encoding: { x: [STATUS], y: ['orders.count'], facet: [REGION] },
        rows: [
          { [REGION]: 'North', [STATUS]: 'processing', 'orders.count': 3 },
          { [REGION]: 'North', [STATUS]: 'shipped', 'orders.count': 5 },
          { [REGION]: 'South', [STATUS]: 'shipped', 'orders.count': 2 },
          { [REGION]: 'South', [STATUS]: 'processing', 'orders.count': 7 },
        ],
        palette: ['#2a78d6'],
      },
      ['shipped'],
    );
    const series = seriesIn(optionFor(trellis));

    // Its categories: processing, shipped, in every panel.
    expect(series.map((one) => [one.name, one.data.map(isMarked), one.data.map(isFaded)])).toEqual([
      ['North', [false, true], [true, false]],
      ['South', [false, true], [true, false]],
    ]);
  });

  it('marks a pie’s slice on every member it is grouped by, a third one too', () => {
    const TIER = 'customers.tier';
    const pie: RenderSpec = {
      chartType: 'pie',
      encoding: { x: [STATUS], y: ['orders.count'], color: [REGION] },
      measures: ['orders.count'],
      rows: [
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'silver', 'orders.count': 3 },
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'gold', 'orders.count': 4 },
      ],
      marking: {
        predicate: { items: [[{ member: TIER, value: 'gold' }]], ranges: [] },
        colour: MARKING_COLOUR,
      },
    };
    const [silver, gold] = seriesIn(optionFor(pie))[0]?.data ?? [];

    expect(isFaded(silver)).toBe(true);
    expect(isMarked(gold)).toBe(true);
  });

  describe('a box plot', () => {
    const EACH = 'customers.name';
    const rows = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((amount, index) => ({
        [STATUS]: 'paid',
        [EACH]: `c${String(index)}`,
        'orders.amount': amount,
      })),
      ...[5, 6, 7].map((amount, index) => ({
        [STATUS]: 'refunded',
        [EACH]: `r${String(index)}`,
        'orders.amount': amount,
      })),
    ];
    const boxplot = (member: string, values: readonly string[]): RenderSpec => ({
      chartType: 'boxplot',
      encoding: { x: [STATUS], y: ['orders.amount'] },
      measures: ['orders.amount'],
      rows,
      palette: ['#2a78d6'],
      marking: {
        predicate: { items: values.map((value) => [{ member, value }]), ranges: [] },
        colour: MARKING_COLOUR,
      },
    });

    it('outlines a box whose rows are all marked, and fades one with none', () => {
      const [boxes, outliers] = seriesIn(optionFor(boxplot(STATUS, ['refunded'])));

      expect(isFaded(boxes?.data[0])).toBe(true);
      expect(isMarked(boxes?.data[1])).toBe(true);
      expect(boxes?.data[1]?.itemStyle?.decal).toBeUndefined();
      expect(isFaded(outliers?.data[0])).toBe(true);
    });

    // A box is partly marked when some of its rows are (R43), never read by
    // its first row alone.
    it('hatches a box some of whose rows are marked, and marks an outlier by its own row', () => {
      const [boxes, outliers] = seriesIn(optionFor(boxplot(EACH, ['c3', 'c9'])));

      expect(boxes?.data[0]?.itemStyle).toMatchObject({
        opacity: 1,
        borderColor: MARKING_COLOUR,
        decal: HATCH,
      });
      expect(isFaded(boxes?.data[1])).toBe(true);
      // The outlier, 100, is c9's.
      expect(isMarked(outliers?.data[0])).toBe(true);
      expect(outliers?.data[0]?.itemStyle?.decal).toBeUndefined();
    });

    it('does not mark an outlier whose row is not marked', () => {
      const [, outliers] = seriesIn(optionFor(boxplot(EACH, ['c0'])));

      expect(isFaded(outliers?.data[0])).toBe(true);
    });

    // T992: with Points at None, the violin follows the boxes; it isn't
    // their points, so no item of it is read as an outlier's row.
    it('leaves a violin’s items alone, with no points between it and the boxes', () => {
      const violin = (marked: readonly string[]): RenderSpec => ({
        ...boxplot(EACH, marked),
        eachPointIs: EACH,
        options: { distribution: { points: 'none', violin: true } },
      });
      const [boxes, second] = seriesIn(optionFor(violin(['c3', 'c9'])));
      expect(isFaded(boxes?.data[1])).toBe(true);
      const unmarkedSpec = Object.fromEntries(
        Object.entries(violin([])).filter(([key]) => key !== 'marking'),
      ) as unknown as RenderSpec;
      const [, unmarked] = seriesIn(optionFor(unmarkedSpec));
      expect(second?.data).toEqual(unmarked?.data);
    });
  });

  /**
   * A line is faded, and the segments between adjacent marked points drawn
   * at full strength over it (research references-markings.md C3, Spotfire's
   * line marking): a full-strength line with faded points would read as
   * nothing marked.
   */
  it('fades a line, and draws its marked points’ segments at full strength over it', () => {
    const line = marked(
      {
        chartType: 'line',
        encoding: { x: [STATUS], y: ['orders.count'] },
        rows: [
          { [STATUS]: 'processing', 'orders.count': 3 },
          { [STATUS]: 'shipped', 'orders.count': 5 },
          { [STATUS]: 'refunded', 'orders.count': 4 },
        ],
      },
      ['processing', 'shipped'],
    );
    const [faded, overlay, ...others] = seriesIn(optionFor(line));

    expect(others).toEqual([]);
    expect(faded?.lineStyle?.opacity).toBe(UNMARKED_OPACITY);
    expect(faded?.data.map(isMarked)).toEqual([true, true, false]);
    expect(overlay?.name).toBe(faded?.name);
    expect(overlay?.lineStyle?.opacity).toBe(1);
    expect(overlay?.data.map((point) => point.value)).toEqual([3, 5, null]);
  });

  it('leaves a line at full strength while the marking is empty', () => {
    const line = marked(
      {
        chartType: 'line',
        encoding: { x: [STATUS], y: ['orders.count'] },
        rows: [{ [STATUS]: 'processing', 'orders.count': 3 }],
      },
      [],
    );
    const drawn = seriesIn(optionFor(line));

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.lineStyle?.opacity ?? 1).toBe(1);
  });
});
