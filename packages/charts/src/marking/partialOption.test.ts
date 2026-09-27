import { EMPTY_PREDICATE, withItem, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { marksOf, renderToSvg } from '../testing/renderToSvg';
import { focusedItemOf } from './focus';
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
});
