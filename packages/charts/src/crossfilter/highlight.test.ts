import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { FADED_OPACITY } from './highlight';

/**
 * T123 / AC-117: what a highlighted tile draws. A pair set to Highlight keeps
 * the tile's own answer and shows the selection against it — the distinction
 * the criterion's failing state rests on, since a pair "set to Filter" that
 * "only highlights" is wrong precisely because the two are different
 * drawings.
 *
 * Two of them, by what the chart can honestly say
 * (`docs/research/cross-highlight.md`, options H2 and H1):
 * a share over the faded total, and a fade of everything that is not the
 * selection.
 */
const rows = [
  { 'orders.status': 'shipped', 'orders.count': 30 },
  { 'orders.status': 'processing', 'orders.count': 20 },
];

const bar: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows,
};

type Series = {
  type: string;
  name?: string;
  barGap?: string;
  data: unknown[];
  itemStyle?: unknown;
};
const seriesOf = (option: unknown) => (option as { series: Series[] }).series;
const opacityOf = (item: unknown) =>
  (item as { itemStyle?: { opacity?: number } }).itemStyle?.opacity;

describe('a share drawn over the tile’s own values', () => {
  const option = optionFor({
    ...bar,
    highlight: {
      member: 'products.category',
      value: 'Beverages',
      kind: 'share',
      // The same question, asked with the selection: its own answer, not a
      // fraction of the totals above.
      rows: [
        { 'orders.status': 'shipped', 'orders.count': 12 },
        { 'orders.status': 'processing', 'orders.count': 5 },
      ],
    },
  });

  it('keeps the tile’s own values, faded', () => {
    const [totals] = seriesOf(option);

    expect(totals?.data.map((each) => (each as { value: number }).value)).toEqual([30, 20]);
    expect(totals?.data.every((each) => opacityOf(each) === FADED_OPACITY)).toBe(true);
  });

  it('draws the selection’s own values over them, from the baseline', () => {
    const [, share] = seriesOf(option);

    expect(share?.data.map((each) => (each as { value: number }).value)).toEqual([12, 5]);
    // Over, not beside: the two bars share the slot, both starting at zero.
    expect(share?.barGap).toBe('-100%');
    expect(share?.data.every((each) => opacityOf(each) === undefined)).toBe(true);
  });

  it('names the selection, so the tooltip can say whose share it is', () => {
    // The tooltip, not the legend: a single-series bar shows no legend at all
    // (`legend.ts`, which needs two series), and the legend is computed from
    // the spec before the overlay exists (T123's review).
    const [, share] = seriesOf(option);

    expect(share?.name).toBe('Beverages');
  });

  it('leaves a chart with no highlight as it was: one series, nothing faded', () => {
    const [only, ...rest] = seriesOf(optionFor(bar));

    expect(rest).toEqual([]);
    expect(only?.data.every((each) => opacityOf(each) === undefined)).toBe(true);
    expect(only?.barGap).toBeUndefined();
  });
});

describe('a fade of everything that is not the selection', () => {
  it('fades the categories that do not match, on a chart split by them', () => {
    const option = optionFor({
      ...bar,
      chartType: 'pie',
      highlight: { member: 'orders.status', value: 'shipped', kind: 'fade' },
    });
    const [slices] = seriesOf(option);

    const faded = slices?.data.map((each) => [
      (each as { name?: string }).name,
      opacityOf(each) ?? 1,
    ]);
    expect(faded).toEqual([
      ['shipped', 1],
      ['processing', FADED_OPACITY],
    ]);
  });

  // T232's review: a split pie's slices are named "a · b"; each is matched by
  // the values it carries, by its category or by its split.
  it('fades a split pie’s slices by the values they carry, category or split', () => {
    const REGION = 'orders.region';
    const splitPie: RenderSpec = {
      chartType: 'pie',
      encoding: { x: ['orders.status'], y: ['orders.count'], color: [REGION] },
      rows: [
        { 'orders.status': 'shipped', [REGION]: 'North', 'orders.count': 3 },
        { 'orders.status': 'processing', [REGION]: 'South', 'orders.count': 5 },
      ],
    };
    const opacities = (highlight: NonNullable<RenderSpec['highlight']>) =>
      seriesOf(optionFor({ ...splitPie, highlight }))[0]?.data.map((each) => opacityOf(each) ?? 1);

    expect(opacities({ member: 'orders.status', value: 'shipped', kind: 'fade' })).toEqual([
      1,
      FADED_OPACITY,
    ]);
    expect(opacities({ member: REGION, value: 'South', kind: 'fade' })).toEqual([FADED_OPACITY, 1]);
  });

  /**
   * Checkpoint 3's review (AC-599, AC-612): a brush's every member keeps its
   * strength, and a Sankey link's tuple is matched by every part of it.
   */
  it('keeps every value a brush passes, not its first alone', () => {
    const three: RenderSpec = {
      ...bar,
      chartType: 'pie',
      rows: [
        { 'orders.status': 'shipped', 'orders.count': 30 },
        { 'orders.status': 'processing', 'orders.count': 20 },
        { 'orders.status': 'returned', 'orders.count': 5 },
      ],
    };
    const option = optionFor({
      ...three,
      highlight: {
        member: 'orders.status',
        value: 'shipped',
        values: ['shipped', 'returned'],
        kind: 'fade',
      },
    });
    expect(seriesOf(option)[0]?.data.map((each) => opacityOf(each) ?? 1)).toEqual([
      1,
      FADED_OPACITY,
      1,
    ]);
  });

  it('matches a tuple by every part: the series by one member, the items by the other', () => {
    const REGION = 'orders.region';
    const stacked: RenderSpec = {
      chartType: 'stackedBar',
      encoding: { x: ['orders.channel'], y: ['orders.count'], color: [REGION] },
      rows: [
        { 'orders.channel': 'Web', [REGION]: 'EMEA', 'orders.count': 3 },
        { 'orders.channel': 'Retail', [REGION]: 'EMEA', 'orders.count': 4 },
        { 'orders.channel': 'Web', [REGION]: 'APAC', 'orders.count': 5 },
        { 'orders.channel': 'Retail', [REGION]: 'APAC', 'orders.count': 6 },
      ],
    };
    const series = seriesOf(
      optionFor({
        ...stacked,
        highlight: {
          member: 'orders.channel',
          value: 'Web',
          also: [{ member: REGION, value: 'EMEA' }],
          kind: 'fade',
        },
      }),
    );
    const emea = series.find((one) => one.name === 'EMEA');
    const apac = series.find((one) => one.name === 'APAC');
    // EMEA's Web bar alone keeps its strength; Retail in EMEA fades, and APAC whole.
    expect(emea?.data.map((each) => opacityOf(each) ?? 1)).toEqual([1, FADED_OPACITY]);
    expect((apac?.itemStyle as { opacity?: number } | undefined)?.opacity).toBe(FADED_OPACITY);
  });

  it('fades the series that do not match, where the selection is the series', () => {
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
      highlight: { member: 'products.category', value: 'Beverages', kind: 'fade' },
    };

    const series = seriesOf(optionFor(split));

    expect(series.map((one) => [one.name, opacityOf(one) ?? 1])).toEqual([
      ['Beverages', 1],
      ['Produce', FADED_OPACITY],
    ]);
  });

  it('keeps a heatmap’s cells, which are [column, row, value] triples', () => {
    // Spread as an object, a cell loses the `value` ECharts reads and the
    // whole map blanks out (T123's review).
    const heatmap: RenderSpec = {
      chartType: 'heatmap',
      encoding: {
        x: ['orders.status'],
        y: ['products.category'],
        color: ['orders.count'],
      },
      rows: [
        { 'orders.status': 'shipped', 'products.category': 'Beverages', 'orders.count': 3 },
        { 'orders.status': 'processing', 'products.category': 'Beverages', 'orders.count': 8 },
      ],
      highlight: { member: 'orders.status', value: 'shipped', kind: 'fade' },
    };

    const [cells] = seriesOf(optionFor(heatmap));
    // A cell it leaves alone stays the triple it was; a faded one carries it
    // as its `value`. Either way ECharts has to be able to read it.
    const drawn = (cells?.data ?? []).map((each) => {
      const item = each as { value?: unknown; itemStyle?: { opacity?: number } };
      return [Array.isArray(each) ? each : item.value, item.itemStyle?.opacity ?? 1];
    });

    expect(drawn).toEqual([
      [[0, 0, 3], 1],
      [[1, 0, 8], FADED_OPACITY],
    ]);
  });

  it('fades nothing when the chart does not show the selected member at all', () => {
    // Nothing on it is the selection, and fading every item would say the
    // whole tile was excluded, which is not what was asked.
    const option = optionFor({
      ...bar,
      highlight: { member: 'products.category', value: 'Beverages', kind: 'fade' },
    });
    const [totals] = seriesOf(option);

    expect(totals?.data.every((each) => opacityOf(each) === undefined)).toBe(true);
  });
});
