import { EMPTY_PREDICATE, withItem, type RenderSpec } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { optionFor } from '../optionFor';
import { marksOf, renderToSvg } from '../testing/renderToSvg';
import { focusedItemOf } from './focus';
import { HATCHED_POINT } from './partialOption';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from './render';

/**
 * T387 / AC-097: WHEN an item is partly marked and its measure is additive,
 * THE SYSTEM SHALL draw the marked share from the baseline at full strength
 * and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL
 * draw the whole item with a pattern and show the marked and total values in
 * its tooltip.
 * `Fails when: a partial average or distinct count is drawn as a sub-length,
 * or a partly marked sum shows no marked share.`
 *
 * direction.md §7a: in a stacked bar each segment is split on its own; a
 * line gets a full-strength line for the marked share over its faded total;
 * a pie's partly marked sectors are hatched, never a sub-angle. The share is
 * T388's second answer (`marking.share`), matched to each item by its
 * category and series.
 */
const MARKING = '#151107';
/** The hatch a partly marked, non-additive item wears. */
const HATCH = { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 };
const marked = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'shipped' }]);

type Item = { value: unknown; itemStyle?: Record<string, unknown>; share?: unknown };
type Series = { name?: string; stack?: string; data: Item[]; itemStyle?: Record<string, unknown> };
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];

const bySpec = (
  chartType: RenderSpec['chartType'],
  aggType: string,
  rows: RenderSpec['rows'],
  share: RenderSpec['rows'],
  encoding: RenderSpec['encoding'] = { x: ['products.category'], y: ['orders.amount'] },
): RenderSpec => ({
  chartType,
  encoding,
  rows,
  palette: ['#2a78d6', '#e87b2c'],
  marking: { predicate: marked, colour: MARKING, share, aggTypes: { 'orders.amount': aggType } },
});

const ROWS = [
  { 'products.category': 'Books', 'orders.amount': 10 },
  { 'products.category': 'Games', 'orders.amount': 20 },
  { 'products.category': 'Toys', 'orders.amount': 5 },
];
// Books partly marked, Games not at all, Toys wholly.
const SHARE = [
  { 'products.category': 'Books', 'orders.amount': 4 },
  { 'products.category': 'Toys', 'orders.amount': 5 },
];

describe('a partly marked bar', () => {
  it('draws a sum’s marked share from the baseline at full strength, and fades the rest', () => {
    const [share, rest, ...others] = seriesOf(optionFor(bySpec('bar', 'sum', ROWS, SHARE)));

    expect(others).toEqual([]);
    // One bar each, the marked part at its foot.
    expect(share?.stack).toBe(rest?.stack);
    expect(share?.stack).toBeDefined();
    expect(share?.data.map((item) => item.value)).toEqual([4, null, 5]);
    expect(rest?.data.map((item) => item.value)).toEqual([6, 20, null]);
    expect(share?.data[0]?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    expect(rest?.data[0]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(rest?.data[1]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    // Named as the measure it is: one series to the legend and the tooltip.
    expect(share?.name).toBe(rest?.name);
  });

  it('draws an average whole, hatched, and never as a sub-length', () => {
    const [share, rest] = seriesOf(optionFor(bySpec('bar', 'avg', ROWS, SHARE)));

    // Toys' marked average equals its whole's, and that doesn't make it
    // marked in full: hatched as well (T387's review).
    expect(share?.data.map((item) => item.value)).toEqual([null, null, null]);
    expect(rest?.data.map((item) => item.value)).toEqual([10, 20, 5]);
    expect(rest?.data[0]?.itemStyle?.['decal']).toBeDefined();
    expect(rest?.data[2]?.itemStyle?.['decal']).toEqual(HATCH);
    expect(rest?.data[0]?.itemStyle?.['opacity']).toBe(1);
    expect(rest?.data[1]?.itemStyle?.['decal']).toBeUndefined();
  });

  it('hatches an average whose marked value passes its total, and says both values', () => {
    const option = optionFor(
      bySpec('bar', 'avg', ROWS, [{ 'products.category': 'Books', 'orders.amount': 16 }]),
    );
    const [, rest] = seriesOf(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(rest?.data[0]?.value).toBe(10);
    expect(rest?.data[0]?.itemStyle?.['decal']).toBeDefined();
    expect(
      formatter({
        name: 'Books',
        seriesName: rest?.name,
        seriesIndex: 1,
        value: 10,
        data: rest?.data[0],
      }),
    ).toBe('Books<br/>orders.amount: 10 · Marked: 16');
  });

  it('draws a negative sum’s marked share below the baseline', () => {
    const rows = [{ 'products.category': 'Books', 'orders.amount': -10 }];
    const share = [{ 'products.category': 'Books', 'orders.amount': -4 }];
    const [marked, rest] = seriesOf(optionFor(bySpec('bar', 'sum', rows, share)));

    expect(marked?.data.map((item) => item.value)).toEqual([-4]);
    expect(rest?.data.map((item) => item.value)).toEqual([-6]);
  });

  it('gives Top N’s “Other” the marked share of the categories it folds', () => {
    const rows = [
      { 'products.category': 'Books', 'orders.amount': 10 },
      { 'products.category': 'Other (2)', 'orders.amount': 25 },
    ];
    // Asked without Top N (T388): Games and Toys are folded into Other.
    const share = [
      { 'products.category': 'Books', 'orders.amount': 4 },
      { 'products.category': 'Games', 'orders.amount': 3 },
      { 'products.category': 'Toys', 'orders.amount': 5 },
    ];
    const [marked, rest] = seriesOf(optionFor(bySpec('bar', 'sum', rows, share)));

    expect(marked?.data.map((item) => item.value)).toEqual([4, 8]);
    expect(rest?.data.map((item) => item.value)).toEqual([6, 17]);
  });

  it('says the marked and the total values in its tooltip', () => {
    const option = optionFor(bySpec('bar', 'avg', ROWS, SHARE));
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;
    const [share, rest] = seriesOf(option);

    expect(
      formatter({
        name: 'Books',
        seriesName: rest?.name,
        seriesIndex: 1,
        value: 10,
        data: rest?.data[0],
      }),
    ).toBe('Books<br/>orders.amount: 10 · Marked: 4');
    // Hovering the marked part of a sum's bar says the same.
    const sum = optionFor(bySpec('bar', 'sum', ROWS, SHARE));
    const [sumShare] = seriesOf(sum);
    expect(
      (sum['tooltip'] as { formatter: (params: unknown) => string }).formatter({
        name: 'Books',
        seriesName: sumShare?.name,
        seriesIndex: 0,
        value: 4,
        data: sumShare?.data[0],
      }),
    ).toBe('Books<br/>orders.amount: 10 · Marked: 4');
    expect(share).toBeDefined();
  });

  it('splits each segment of a stacked bar on its own, in its place in the stack', () => {
    const rows = [
      { 'products.category': 'Books', 'orders.region': 'East', 'orders.amount': 10 },
      { 'products.category': 'Books', 'orders.region': 'West', 'orders.amount': 6 },
    ];
    const share = [{ 'products.category': 'Books', 'orders.region': 'West', 'orders.amount': 2 }];
    const drawn = seriesOf(
      optionFor(
        bySpec('stackedBar', 'sum', rows, share, {
          x: ['products.category'],
          y: ['orders.amount'],
          color: ['orders.region'],
        }),
      ),
    );

    expect(drawn.map((one) => [one.name, one.stack, one.data.map((item) => item.value)])).toEqual([
      ['East', 'total', [null]],
      ['East', 'total', [10]],
      ['West', 'total', [2]],
      ['West', 'total', [4]],
    ]);
  });
});

describe('drawn', () => {
  it('paints a sum’s marked share as a shorter full-strength bar at the foot of its faded total', () => {
    const svg = renderToSvg(optionFor(bySpec('bar', 'sum', ROWS, SHARE)));
    const bars = marksOf(svg, ['#2a78d6']);
    // Books: 4 marked under 6 more; the marked part sits on the baseline.
    const books = bars.filter((bar) => Math.abs(bar.left - bars[0]!.left) < 1);
    expect(books).toHaveLength(2);
    const [foot, top] = [...books].sort((a, b) => b.bottom - a.bottom);
    expect(
      (foot!.bottom - foot!.top) / (top!.bottom - top!.top + foot!.bottom - foot!.top),
    ).toBeCloseTo(0.4, 1);
  });

  it('paints an average’s partly marked bar with a pattern, not a shorter bar', () => {
    const svg = renderToSvg(optionFor(bySpec('bar', 'avg', ROWS, SHARE)));
    expect(svg).toMatch(/<pattern\b/);
  });
});

describe('a partly marked line', () => {
  it('draws the marked share as a full-strength line over the faded total', () => {
    const [total, share] = seriesOf(optionFor(bySpec('line', 'sum', ROWS, SHARE)));

    expect(total?.data.map((item) => item.value)).toEqual([10, 20, 5]);
    expect(share?.data.map((item) => item.value)).toEqual([4, null, 5]);
    expect((total as unknown as { lineStyle: { opacity: number } }).lineStyle.opacity).toBe(
      UNMARKED_OPACITY,
    );
    expect(share?.name).toBe(total?.name);
  });

  it('draws an average’s marked line as it is, never capped at the total', () => {
    const share = [{ 'products.category': 'Books', 'orders.amount': 16 }];
    const [, marked] = seriesOf(optionFor(bySpec('line', 'avg', ROWS, share)));

    expect(marked?.data.map((item) => item.value)).toEqual([16, null, null]);
  });

  it('sits a stacked line’s marked share in its own band, on the lines below it', () => {
    const rows = [
      { 'products.category': 'Books', 'orders.region': 'East', 'orders.amount': 10 },
      { 'products.category': 'Books', 'orders.region': 'West', 'orders.amount': 6 },
    ];
    const share = [{ 'products.category': 'Books', 'orders.region': 'West', 'orders.amount': 2 }];
    const encoding = { x: ['products.category'], y: ['orders.amount'], color: ['orders.region'] };
    const expected = [
      ['East', [10]],
      ['East', [null]],
      ['West', [6]],
      // West's 2 marked, on East's 10.
      ['West', [12]],
    ];
    const drawn = (spec: RenderSpec) =>
      seriesOf(optionFor(spec)).map((one) => [one.name, one.data.map((item) => item.value)]);

    expect(drawn(bySpec('stackedArea', 'sum', rows, share, encoding))).toEqual(expected);
    // Stacked from the Customize tab, the same (T387's review).
    expect(
      drawn({ ...bySpec('line', 'sum', rows, share, encoding), options: { stacked: true } }),
    ).toEqual(expected);
  });

  it('says each point once in the crosshair tooltip, a gap included', () => {
    const option = optionFor(bySpec('line', 'sum', ROWS, SHARE));
    const [total, marked] = seriesOf(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;
    const at = (index: number) => [
      {
        name: 'x',
        seriesName: total?.name,
        seriesIndex: 0,
        value: total?.data[index]?.value,
        data: total?.data[index],
      },
      {
        name: 'x',
        seriesName: marked?.name,
        seriesIndex: 1,
        value: marked?.data[index]?.value,
        data: marked?.data[index],
      },
    ];

    expect(formatter(at(0))).toBe('x<br/>orders.amount: 10 · Marked: 4');
    // Games: nothing marked, and no empty line for the marked line's gap.
    expect(formatter(at(1))).toBe('x<br/>orders.amount: 20');
  });
});

describe('with the Customize tab', () => {
  const labels = (spec: RenderSpec) =>
    seriesOf(optionFor({ ...spec, options: { ...spec.options, dataLabels: true } })).map((one) =>
      one.data.map((item) =>
        item.value === null
          ? null
          : (
              one as unknown as { label: { formatter: (params: unknown) => string } }
            ).label.formatter({ value: item.value, data: item }),
      ),
    );

  it('labels a partly marked bar once, with its whole value', () => {
    expect(labels(bySpec('bar', 'sum', ROWS, SHARE))).toEqual([
      ['', null, '5'],
      ['10', '20', null],
    ]);
  });

  it('keeps a lone series without a legend, however its bars are split', () => {
    const option = optionFor({
      ...bySpec('bar', 'sum', ROWS, SHARE),
      encoding: { x: ['products.category'], y: ['orders.amount', 'orders.count'] },
      rows: ROWS.map((row) => ({ ...row, 'orders.count': 1 })),
      options: { series: { 'orders.count': { hidden: true } } },
    });

    expect(option['legend']).toBeUndefined();
  });
});

describe('the keyboard’s focus on a partly marked bar', () => {
  it('lands on the part that is drawn, for its tooltip', () => {
    const spec = { ...bySpec('bar', 'avg', ROWS, SHARE), keyboardFocus: 'Books' };

    // The marked part holds nothing for a hatched average: the rest is drawn.
    expect(focusedItemOf(optionFor(spec), spec)).toEqual({ seriesIndex: 1, dataIndex: 0 });
  });
});

describe('a partly marked pie slice', () => {
  it('is hatched and outlined, never a smaller angle', () => {
    const [slices] = seriesOf(optionFor(bySpec('pie', 'sum', ROWS, SHARE)));
    const byName = Object.fromEntries(
      (slices?.data ?? []).map((item) => [String((item as { name?: unknown }).name), item]),
    );

    expect(slices?.data.map((item) => item.value)).toEqual([10, 20, 5]);
    expect(byName['Books']?.itemStyle?.['decal']).toBeDefined();
    expect(byName['Books']?.itemStyle?.['borderColor']).toBe(MARKING);
    expect(byName['Games']?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(byName['Toys']?.itemStyle?.['borderColor']).toBe(MARKING);
    expect(byName['Toys']?.itemStyle?.['decal']).toBeUndefined();
  });

  /**
   * T453: a pie's slice is a row, grouped by every member its rows carry
   * (AC-221) — a third one too, which no channel names. Its share is the
   * share's rows of that slice alone, not of every slice with its category
   * and split.
   */
  it('matches its share on every member it is grouped by, a third one too', () => {
    const TIER = 'customers.tier';
    const encoding = { x: ['products.category'], y: ['orders.amount'], color: ['orders.region'] };
    const rows = [
      {
        'products.category': 'Books',
        'orders.region': 'East',
        [TIER]: 'gold',
        'orders.amount': 10,
      },
      {
        'products.category': 'Books',
        'orders.region': 'East',
        [TIER]: 'silver',
        'orders.amount': 6,
      },
    ];
    // Only the gold slice's rows are marked, and all of them.
    const share = [
      {
        'products.category': 'Books',
        'orders.region': 'East',
        [TIER]: 'gold',
        'orders.amount': 10,
      },
    ];
    const [slices] = seriesOf(
      optionFor({ ...bySpec('pie', 'sum', rows, share, encoding), measures: ['orders.amount'] }),
    );
    const [gold, silver] = slices?.data ?? [];

    // Gold is marked in full: outlined, whole, not hatched. Silver has none.
    expect(gold?.itemStyle?.['borderColor']).toBe(MARKING);
    expect(gold?.itemStyle?.['decal']).toBeUndefined();
    expect(gold?.share).toEqual({ marked: 10, total: 10 });
    expect(silver?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(silver?.share).toEqual({ total: 6 });
  });
});

/**
 * T453: the chart types T387 left fading every item (direction.md §7a).
 */
describe('a partly marked heatmap cell', () => {
  const encoding = {
    x: ['products.category'],
    y: ['orders.region'],
    color: ['orders.amount'],
  };
  const rows = [
    { 'products.category': 'Books', 'orders.region': 'East', 'orders.amount': 10 },
    { 'products.category': 'Books', 'orders.region': 'West', 'orders.amount': 6 },
    { 'products.category': 'Games', 'orders.region': 'East', 'orders.amount': 5 },
  ];
  // Books·East partly marked, Books·West not at all, Games·East in full.
  const share = [
    { 'products.category': 'Books', 'orders.region': 'East', 'orders.amount': 4 },
    { 'products.category': 'Games', 'orders.region': 'East', 'orders.amount': 5 },
  ];
  type Cell = { value: unknown[]; itemStyle?: Record<string, unknown>; share?: unknown };
  const cellsIn = (spec: RenderSpec) => seriesOf(optionFor(spec))[0]?.data as unknown as Cell[];

  it('is outlined dashed in the marking’s colour, the unmarked faded and the marked solid', () => {
    const [partly, none, whole] = cellsIn(bySpec('heatmap', 'sum', rows, share, encoding));

    // Every cell where it was: its column, its row and its whole value.
    expect([partly, none, whole].map((cell) => cell?.value)).toEqual([
      [0, 0, 10],
      [0, 1, 6],
      [1, 0, 5],
    ]);
    expect(partly?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
      borderType: 'dashed',
    });
    expect(none?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(whole?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect(whole?.itemStyle?.['borderType']).not.toBe('dashed');
    // Its colour is the scale's: a cell's own would stand in for its value.
    expect(partly?.itemStyle?.['color']).toBeUndefined();
  });

  it('is hatched as well where its measure is not additive (AC-097)', () => {
    const [partly, , whole] = cellsIn(bySpec('heatmap', 'avg', rows, share, encoding));

    expect(partly?.itemStyle).toMatchObject({ borderType: 'dashed', decal: HATCH });
    // An average marked "5 of 5" is not marked in full (T387's review).
    expect(whole?.itemStyle).toMatchObject({ borderType: 'dashed', decal: HATCH });
  });

  it('says its marked value beside its whole in its tooltip', () => {
    const option = optionFor(bySpec('heatmap', 'sum', rows, share, encoding));
    const [partly, none] = seriesOf(option)[0]?.data as unknown as Cell[];
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(formatter({ value: partly?.value, data: partly })).toBe(
      'Books · East<br/>orders.amount: 10 · Marked: 4',
    );
    expect(formatter({ value: none?.value, data: none })).toBe('Books · West<br/>orders.amount: 6');
  });

  it('is drawn with a dashed outline', () => {
    const svg = renderToSvg(optionFor(bySpec('heatmap', 'sum', rows, share, encoding)));

    expect(svg).toMatch(/<path\b[^>]*stroke="#151107"[^>]*stroke-dasharray="[^"]+"/);
  });

  it('keeps the keyboard’s focus on its column, drawn marked', () => {
    const spec = { ...bySpec('heatmap', 'sum', rows, share, encoding), keyboardFocus: 'Games' };

    // Games·East is the third cell: its column, not its place, says so.
    expect(focusedItemOf(optionFor(spec), spec)).toEqual({ seriesIndex: 0, dataIndex: 2 });
  });

  it('is drawn with a pattern where its measure is not additive', () => {
    expect(renderToSvg(optionFor(bySpec('heatmap', 'avg', rows, share, encoding)))).toMatch(
      /<pattern\b/,
    );
  });
});

describe('a partly marked combo', () => {
  const encoding = { x: ['products.category'], y: ['orders.amount', 'orders.count'] };
  const rows = [
    { 'products.category': 'Books', 'orders.amount': 10, 'orders.count': 3 },
    { 'products.category': 'Games', 'orders.amount': 20, 'orders.count': 4 },
  ];
  const share = [{ 'products.category': 'Books', 'orders.amount': 4, 'orders.count': 1 }];
  const combo = (): RenderSpec => ({
    ...bySpec('combo', 'sum', rows, share, encoding),
    marking: {
      predicate: marked,
      colour: MARKING,
      share,
      aggTypes: { 'orders.amount': 'sum', 'orders.count': 'count' },
    },
  });
  type Drawn = Series & { type?: string; lineStyle?: { opacity?: number } };

  it('splits its bars as a bar chart’s, and draws its line’s marked share over it faded', () => {
    const drawn = seriesOf(optionFor(combo())) as Drawn[];
    // A line's halo (T846) carries its line's values as plain numbers.
    const valueOf = (item: unknown) =>
      typeof item === 'object' && item !== null ? (item as { value?: unknown }).value : item;

    expect(drawn.map((one) => [one.type, one.name, one.data.map(valueOf)])).toEqual([
      ['bar', 'orders.amount', [4, null]],
      ['bar', 'orders.amount', [6, 20]],
      ['line', 'orders.count', [3, 4]],
      ['line', 'orders.count', [1, null]],
      // The line's surface halo, last, under the line (T846, §7h): the
      // whole line's values, not its marked share's.
      ['line', 'orders.count', [3, 4]],
    ]);
    const [foot, rest, total, line] = drawn;
    expect(foot?.stack).toBe(rest?.stack);
    expect(foot?.data[0]?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect(rest?.data[0]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(total?.lineStyle?.opacity).toBe(UNMARKED_OPACITY);
    expect(line?.lineStyle?.opacity).toBe(1);
  });

  it('says each item once in its crosshair tooltip, with its marked share', () => {
    const option = optionFor(combo());
    const drawn = seriesOf(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;
    const at = (index: number) =>
      drawn.map((one, seriesIndex) => ({
        name: 'Books',
        seriesName: one.name,
        seriesIndex,
        value: one.data[index]?.value,
        data: one.data[index],
      }));

    expect(formatter(at(0))).toBe(
      'Books<br/>orders.amount: 10 · Marked: 4<br/>orders.count: 3 · Marked: 1',
    );
  });
});

describe('a partly marked trellis panel', () => {
  const encoding = { x: ['products.category'], y: ['orders.amount'], facet: ['orders.region'] };
  const rows = [
    { 'orders.region': 'East', 'products.category': 'Books', 'orders.amount': 10 },
    { 'orders.region': 'East', 'products.category': 'Games', 'orders.amount': 8 },
    { 'orders.region': 'West', 'products.category': 'Books', 'orders.amount': 6 },
    { 'orders.region': 'West', 'products.category': 'Games', 'orders.amount': 2 },
  ];
  // Books in East partly, Games in West in full; nothing else.
  const share = [
    { 'orders.region': 'East', 'products.category': 'Books', 'orders.amount': 4 },
    { 'orders.region': 'West', 'products.category': 'Games', 'orders.amount': 2 },
  ];
  type Panel = Series & { xAxisIndex?: number; yAxisIndex?: number };

  /**
   * Its panels' marks are bars, so a sum's marked share is drawn from the
   * baseline as a bar's is (AC-097), in each panel on its own.
   */
  it('splits each panel’s bars by that panel’s share, in a stack of its own', () => {
    const drawn = seriesOf(optionFor(bySpec('trellis', 'sum', rows, share, encoding))) as Panel[];

    expect(
      drawn.map((one) => [one.name, one.xAxisIndex, one.data.map((item) => item.value)]),
    ).toEqual([
      ['East', 0, [4, null]],
      ['East', 0, [6, 8]],
      ['West', 1, [null, 2]],
      ['West', 1, [6, null]],
    ]);
    const [eastMarked, eastRest, westMarked, westRest] = drawn;
    expect(eastMarked?.stack).toBe(eastRest?.stack);
    expect(westMarked?.stack).toBe(westRest?.stack);
    expect(eastMarked?.stack).not.toBe(westMarked?.stack);
    expect(eastMarked?.data[0]?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    expect(eastRest?.data[1]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
  });

  it('hatches a partly marked average whole, never shorter', () => {
    const [marked, rest] = seriesOf(optionFor(bySpec('trellis', 'avg', rows, share, encoding)));

    expect(marked?.data.map((item) => item.value)).toEqual([null, null]);
    expect(rest?.data.map((item) => item.value)).toEqual([10, 8]);
    expect(rest?.data[0]?.itemStyle?.['decal']).toEqual(HATCH);
  });

  it('says its marked share in its tooltip', () => {
    const option = optionFor(bySpec('trellis', 'sum', rows, share, encoding));
    const [marked] = seriesOf(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(
      formatter({
        name: 'Books',
        seriesName: 'East',
        seriesIndex: 0,
        value: 4,
        data: marked?.data[0],
      }),
    ).toBe('Books<br/>East: 10 · Marked: 4');
  });
});

/**
 * T453, the user's answer of 2026-09-28 (R43): a scatter's point, a box plot's
 * box and a map's country are partly marked as a pie's slice is — outlined
 * and hatched, never faded, "· Marked: X" in the tooltip. A box is partly
 * marked when some of its rows are; each outlier is marked or not.
 */
describe('a partly marked scatter point', () => {
  const encoding = { x: ['orders.count'], y: ['orders.amount'], color: ['orders.region'] };
  const rows = [
    {
      'products.category': 'Books',
      'orders.region': 'East',
      'orders.count': 3,
      'orders.amount': 10,
    },
    {
      'products.category': 'Games',
      'orders.region': 'East',
      'orders.count': 4,
      'orders.amount': 20,
    },
    { 'products.category': 'Toys', 'orders.region': 'West', 'orders.count': 1, 'orders.amount': 5 },
  ];
  // Books partly marked, Games not at all, Toys in full.
  const share = [
    {
      'products.category': 'Books',
      'orders.region': 'East',
      'orders.count': 1,
      'orders.amount': 4,
    },
    { 'products.category': 'Toys', 'orders.region': 'West', 'orders.count': 1, 'orders.amount': 5 },
  ];
  const scatter = (aggType: string): RenderSpec => ({
    ...bySpec('scatter', aggType, rows, share, encoding),
    measures: ['orders.count', 'orders.amount'],
    marking: {
      predicate: marked,
      colour: MARKING,
      share,
      aggTypes: { 'orders.count': 'count', 'orders.amount': aggType },
    },
  });
  type Point = { value: unknown; itemStyle?: Record<string, unknown>; share?: unknown };
  const pointsOf = (option: Record<string, unknown>) =>
    seriesOf(option).map((one) => one.data as unknown as Point[]);

  it('is outlined and hatched, where the others are faded and the marked outlined', () => {
    const [[books, games] = [], [toys] = []] = pointsOf(optionFor(scatter('sum')));

    // Each where it was, at its whole values.
    expect([books?.value, games?.value, toys?.value]).toEqual([
      [3, 10],
      [4, 20],
      [1, 5],
    ]);
    expect(books?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    // ECharts draws no decal on a symbol (research/echarts-symbol-hatch.md):
    // its hatch is the point's own shape, crossed by strokes.
    expect((books as { symbol?: unknown } | undefined)?.symbol).toBe(HATCHED_POINT);
    expect(games?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(toys?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect((toys as { symbol?: unknown } | undefined)?.symbol).toBeUndefined();
  });

  it('says each measure’s marked value in its tooltip', () => {
    const option = optionFor(scatter('sum'));
    const [[books, games] = []] = pointsOf(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(formatter({ seriesName: 'East', value: books?.value, data: books })).toBe(
      'East<br/>orders.count: 3 · Marked: 1<br/>orders.amount: 10 · Marked: 4',
    );
    expect(formatter({ seriesName: 'East', value: games?.value, data: games })).toBe(
      'East<br/>orders.count: 4<br/>orders.amount: 20',
    );
  });

  it('is drawn as a disc crossed by strokes in the marking’s colour', () => {
    const svg = renderToSvg(optionFor(scatter('avg')));
    // Its outline and two strokes across it: three shapes in one path.
    const hatched = [...svg.matchAll(/<path\b([^>]*)>/g)]
      .map((match) => match[1] ?? '')
      .filter((attributes) => attributes.includes(`stroke="${MARKING}"`))
      .map((attributes) => (/\bd="([^"]*)"/.exec(attributes)?.[1] ?? '').match(/M/gi)?.length);

    expect(hatched).toContain(3);
  });
});

describe('a partly marked box plot', () => {
  const encoding = { x: ['orders.status'], y: ['orders.amount'] };
  const EACH = 'customers.id';
  // Each point a customer: paid has an outlier (100), refunded has none.
  const rows = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((amount, index) => ({
      'orders.status': 'paid',
      [EACH]: `c${String(index)}`,
      'orders.amount': amount,
    })),
    ...[5, 6, 7].map((amount, index) => ({
      'orders.status': 'refunded',
      [EACH]: `r${String(index)}`,
      'orders.amount': amount,
    })),
  ];
  const boxplot = (share: RenderSpec['rows']): RenderSpec => ({
    ...bySpec('boxplot', 'sum', rows, share, encoding),
    measures: ['orders.amount'],
  });
  type Drawn = { value?: unknown; itemStyle?: Record<string, unknown>; share?: unknown };
  const drawnOf = (spec: RenderSpec) => {
    const [boxes, outliers] = seriesOf(optionFor(spec)) as unknown as { data: Drawn[] }[];
    return { boxes: boxes?.data ?? [], outliers: outliers?.data ?? [] };
  };

  it('outlines and hatches a box some of whose rows are marked, and fades one with none', () => {
    // Two of paid's customers are partly marked; refunded has nothing marked.
    const { boxes } = drawnOf(
      boxplot([
        { 'orders.status': 'paid', [EACH]: 'c0', 'orders.amount': 1 },
        { 'orders.status': 'paid', [EACH]: 'c3', 'orders.amount': 2 },
      ]),
    );
    const [paid, refunded] = boxes;

    // Drawn where it was: its whiskers, quartiles and median.
    expect(paid?.value).toEqual([1, 3.25, 5.5, 7.75, 9]);
    expect(paid?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
      decal: HATCH,
    });
    expect(refunded?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
  });

  it('outlines a box whose every row is marked in full, unhatched', () => {
    const { boxes } = drawnOf(
      boxplot(
        [5, 6, 7].map((amount, index) => ({
          'orders.status': 'refunded',
          [EACH]: `r${String(index)}`,
          'orders.amount': amount,
        })),
      ),
    );

    expect(boxes[1]?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect(boxes[1]?.itemStyle?.['decal']).toBeUndefined();
  });

  it('marks an outlier whose row is marked, and fades one whose row is not', () => {
    const marked100 = drawnOf(
      boxplot([{ 'orders.status': 'paid', [EACH]: 'c9', 'orders.amount': 30 }]),
    ).outliers;
    const markedElsewhere = drawnOf(
      boxplot([{ 'orders.status': 'paid', [EACH]: 'c0', 'orders.amount': 1 }]),
    ).outliers;

    expect(marked100[0]?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    // Marked or not: never hatched.
    expect(marked100[0]?.itemStyle?.['decal']).toBeUndefined();
    expect(markedElsewhere[0]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
  });

  it('says how many of a box’s points are marked in its tooltip', () => {
    const spec = boxplot([
      { 'orders.status': 'paid', [EACH]: 'c0', 'orders.amount': 1 },
      { 'orders.status': 'paid', [EACH]: 'c3', 'orders.amount': 2 },
    ]);
    const option = optionFor(spec);
    const { boxes } = drawnOf(spec);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(
      formatter({ seriesType: 'boxplot', dataIndex: 0, value: boxes[0]?.value, data: boxes[0] }),
    ).toContain('n: 10 · Marked: 2<br/>');
  });

  it('is drawn with a pattern', () => {
    const svg = renderToSvg(
      optionFor(boxplot([{ 'orders.status': 'paid', [EACH]: 'c0', 'orders.amount': 1 }])),
    );
    expect(svg).toMatch(/<pattern\b/);
  });

  /**
   * T453's review: without "Each point is" a box plot's rows are ungrouped
   * (T399), each point one row of the data with nothing but its category and
   * value, and its share is the marked ones among them. A point is marked or
   * not, found by its value among its category's marked rows — never every
   * point of a category with any row marked.
   */
  describe('each point a row', () => {
    const ungrouped = (share: RenderSpec['rows']): RenderSpec => ({
      ...bySpec(
        'boxplot',
        'sum',
        rows.map((row) => ({
          'orders.status': row['orders.status'],
          'orders.amount': row['orders.amount'],
        })),
        share,
        encoding,
      ),
      measures: ['orders.amount'],
    });

    it('marks only the points whose rows are marked, and counts them', () => {
      const spec = ungrouped([
        { 'orders.status': 'paid', 'orders.amount': 1 },
        { 'orders.status': 'paid', 'orders.amount': 2 },
      ]);
      const { boxes, outliers } = drawnOf(spec);
      const formatter = (optionFor(spec)['tooltip'] as { formatter: (params: unknown) => string })
        .formatter;

      expect(boxes[0]?.itemStyle).toMatchObject({ borderColor: MARKING, decal: HATCH });
      expect(
        formatter({ seriesType: 'boxplot', dataIndex: 0, value: boxes[0]?.value, data: boxes[0] }),
      ).toContain('n: 10 · Marked: 2<br/>');
      // The outlier, 100, is none of the marked rows.
      expect(outliers[0]?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    });

    it('marks an outlier whose own row is marked', () => {
      const { outliers } = drawnOf(ungrouped([{ 'orders.status': 'paid', 'orders.amount': 100 }]));

      expect(outliers[0]?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    });

    it('outlines a box whose every row is marked, unhatched', () => {
      const { boxes } = drawnOf(
        ungrouped(
          [5, 6, 7].map((amount) => ({ 'orders.status': 'refunded', 'orders.amount': amount })),
        ),
      );

      expect(boxes[1]?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
      expect(boxes[1]?.itemStyle?.['decal']).toBeUndefined();
    });
  });
});

describe('a partly marked country', () => {
  beforeAll(() => {
    registerCountries(countries);
  });
  const encoding = { x: ['customers.country'], y: ['orders.amount'] };
  const rows = [
    { 'customers.country': 'FRA', 'orders.amount': 10 },
    { 'customers.country': 'NOR', 'orders.amount': 20 },
    { 'customers.country': 'USA', 'orders.amount': 5 },
  ];
  // France partly marked, Norway not at all, the USA in full.
  const share = [
    { 'customers.country': 'FRA', 'orders.amount': 4 },
    { 'customers.country': 'USA', 'orders.amount': 5 },
  ];
  type Region = { name?: string; itemStyle?: Record<string, unknown>; share?: unknown };
  const regionsIn = (option: Record<string, unknown>) =>
    seriesOf(option)[0]?.data as unknown as Region[];

  it('is outlined and hatched, never filled, where the others are faded and the marked outlined', () => {
    const [france, norway, usa] = regionsIn(optionFor(bySpec('map', 'sum', rows, share, encoding)));

    expect(france?.itemStyle).toMatchObject({
      opacity: 1,
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
      decal: HATCH,
    });
    // Its fill is the scale's (direction.md, "Country map").
    expect(france?.itemStyle?.['color']).toBeUndefined();
    expect(norway?.itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    expect(usa?.itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect(usa?.itemStyle?.['decal']).toBeUndefined();
  });

  it('says its marked value beside its whole in its tooltip', () => {
    const option = optionFor(bySpec('map', 'sum', rows, share, encoding));
    const [france] = regionsIn(option);
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;

    expect(formatter({ name: 'FRA', value: 10, data: france })).toBe('France<br/>10 · Marked: 4');
  });

  it('is drawn with a pattern over its scale’s fill', () => {
    expect(renderToSvg(optionFor(bySpec('map', 'sum', rows, share, encoding)))).toMatch(
      /<pattern\b/,
    );
  });
});
