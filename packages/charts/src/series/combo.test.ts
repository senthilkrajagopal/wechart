/**
 * T044 / AC-037: the combo chart, and the last of the eighteen types.
 *
 * A combo draws some measures as bars and some as a line. By Auto both go
 * against **one** value axis: direction.md is explicit that the recommender
 * never proposes a dual axis, because two scales in one frame let any two
 * series be made to look related (rule 117). So the test checks that the two
 * measures share a scale, not merely that one of each mark appears.
 *
 * T846 (AC-497, AC-037): each measure drawn with the mark and on the axis the
 * author chose, in §7h's draw order.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { comboOption, logScaleOmissions, withLineHalos } from './combo';
import { seriesCount } from '../legend';
import { optionFor } from '../optionFor';
import { labelsOf, marksOf, renderToSvg, strokesOf, untitled } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const PALETTE = [BLUE, ORANGE];

const STATUS = 'orders.status';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

// The plot alone, its axis titles tested in `axisTitles.test.ts`.
const draw = (spec: RenderSpec) => renderToSvg(untitled(comboOption(spec)));

/**
 * The second measure is ten times the first, which is what makes a shared
 * axis visible: on one scale the bars are short and the line sits high.
 */
const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [STATUS], y: [COUNT, AMOUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 10, [AMOUNT]: 100 },
    { [STATUS]: 'refunded', [COUNT]: 20, [AMOUNT]: 200 },
  ],
  palette: PALETTE,
};

describe('combo', () => {
  it('draws the first measure as bars', () => {
    expect(marksOf(draw(spec), [BLUE])).toHaveLength(2);
  });

  it('draws the second measure as a line', () => {
    const lines = strokesOf(draw(spec), [ORANGE]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.points).toHaveLength(2);
  });

  it('draws bars and a line at once, not one or the other', () => {
    const svg = draw(spec);

    expect(marksOf(svg, [BLUE]).length).toBeGreaterThan(0);
    expect(strokesOf(svg, [ORANGE]).length).toBeGreaterThan(0);
  });
});

describe('one value axis', () => {
  it('measures both series against the same scale', () => {
    const svg = draw(spec);
    const bars = marksOf(svg, [BLUE]);
    const line = strokesOf(svg, [ORANGE])[0];

    const tallestBar = Math.min(...bars.map((bar) => bar.top));
    const highestPoint = Math.min(...(line?.points ?? []).map(([, y]) => y));

    // The amounts are ten times the counts, so on one axis the line sits well
    // above every bar. With a second axis each series would be scaled to fill
    // the frame and the two would overlap — which is the readability problem
    // direction.md rules out.
    expect(highestPoint).toBeLessThan(tallestBar);
  });

  it('still shares the scale when the bars are the larger series', () => {
    const flipped: RenderSpec = {
      ...spec,
      encoding: { x: [STATUS], y: [AMOUNT, COUNT] },
    };
    const svg = draw(flipped);
    const bars = marksOf(svg, [BLUE]);
    const line = strokesOf(svg, [ORANGE])[0];

    const tallestBar = Math.min(...bars.map((bar) => bar.top));
    const highestPoint = Math.min(...(line?.points ?? []).map(([, y]) => y));

    // Now the bars are the big series, so the relationship reverses. A chart
    // that scaled each series independently would look identical both ways.
    expect(tallestBar).toBeLessThan(highestPoint);
  });
});

describe('a combo with only one measure', () => {
  it('draws it as bars and no line', () => {
    const single: RenderSpec = { ...spec, encoding: { x: [STATUS], y: [COUNT] } };
    const svg = draw(single);

    // There is nothing to combine, and inventing a second series would be
    // drawing data that was never asked for.
    expect(marksOf(svg, [BLUE])).toHaveLength(2);
    expect(strokesOf(svg, PALETTE)).toHaveLength(0);
  });
});

/**
 * Revenue bar/left by Auto, Target line/left by Auto, Margin % points on the
 * right and Cost an area on the left, both chosen (T846).
 */
describe('each measure with its own mark, on its own axis (AC-497)', () => {
  const REVENUE = 'orders.revenue';
  const TARGET = 'orders.target';
  const MARGIN = 'orders.margin_pct';
  const COST = 'orders.cost';
  const GREEN = '#0f8a5f';
  const RED = '#c0392b';
  const SURFACE = '#fafaf9';
  const MONTH = 'orders.month';

  const mixed: RenderSpec = {
    chartType: 'combo',
    encoding: { x: [MONTH], y: [REVENUE, TARGET, MARGIN, COST] },
    rows: [
      { [MONTH]: 'Jan', [REVENUE]: 120, [TARGET]: 100, [MARGIN]: 0.2, [COST]: 80 },
      { [MONTH]: 'Feb', [REVENUE]: 150, [TARGET]: 110, [MARGIN]: 0.3, [COST]: 90 },
    ],
    palette: [BLUE, ORANGE, GREEN, RED],
    surface: SURFACE,
    options: {
      series: { [MARGIN]: { mark: 'point', axis: 'right' }, [COST]: { mark: 'area' } },
    },
  };

  type Drawn = Record<string, unknown> & {
    name?: string;
    type?: string;
    z?: number;
    yAxisIndex?: number;
    silent?: boolean;
    symbol?: string;
    symbolSize?: number;
    areaStyle?: { opacity?: number; color?: string };
    lineStyle?: { width?: number; color?: string };
    itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
    tooltip?: { show?: boolean };
  };
  const seriesOf = (option: Record<string, unknown>) => option['series'] as Drawn[];
  const named = (option: Record<string, unknown>, name: string) =>
    seriesOf(option).find((one) => one.name === name)!;

  it('draws bars, a line, points and an area', () => {
    expect(seriesOf(comboOption(mixed)).map((one) => [one.name, one.type])).toEqual([
      [REVENUE, 'bar'],
      [TARGET, 'line'],
      [MARGIN, 'scatter'],
      [COST, 'line'],
    ]);
  });

  it('fills an area in its colour at 0.24 opacity, and gives a plain line none', () => {
    const option = comboOption(mixed);

    expect(named(option, COST).areaStyle).toEqual({ color: RED, opacity: 0.24 });
    expect(named(option, TARGET).areaStyle).toBeUndefined();
  });

  it('puts Margin % on the right axis and the others on the left', () => {
    const option = comboOption(mixed);

    expect(seriesOf(option).map((one) => [one.name, one.yAxisIndex])).toEqual([
      [REVENUE, 0],
      [TARGET, 0],
      [MARGIN, 1],
      [COST, 0],
    ]);
    const axes = option['yAxis'] as Record<string, unknown>[];
    expect(axes).toHaveLength(2);
    expect(axes.map((axis) => [axis['type'], axis['position']])).toEqual([
      ['value', 'left'],
      ['value', 'right'],
    ]);
  });

  it('has one value axis while every series is on the left', () => {
    const left: RenderSpec = { ...mixed, options: { series: { [COST]: { mark: 'area' } } } };
    const option = comboOption(left);

    expect(Array.isArray(option['yAxis'])).toBe(false);
    expect(seriesOf(option).every((one) => (one.yAxisIndex ?? 0) === 0)).toBe(true);
  });

  it('orders the layers areas, bars, lines, points', () => {
    const z = (name: string) => named(comboOption(mixed), name).z ?? 0;

    expect(z(COST)).toBeLessThan(z(REVENUE));
    expect(z(REVENUE)).toBeLessThan(z(TARGET));
    expect(z(TARGET)).toBeLessThan(z(MARGIN));
  });

  it('draws a line 2 px wide, over a 5 px halo in the surface colour', () => {
    const drawn = seriesOf(optionFor(mixed));
    const line = drawn.find((one) => one.name === TARGET && one.lineStyle?.color === ORANGE)!;
    const halo = drawn.find((one) => one.name === TARGET && one.lineStyle?.color === SURFACE)!;

    expect(line.lineStyle?.width).toBe(2);
    expect([
      halo.type,
      halo.yAxisIndex,
      halo.symbol,
      halo.silent,
      halo['legendHoverLink'],
      halo.tooltip,
      halo.lineStyle,
    ]).toEqual(['line', 0, 'none', true, false, { show: false }, { color: SURFACE, width: 5 }]);
    expect(halo.data).toEqual([100, 110]);
    // Under its line, over the bars.
    expect(halo.z).toBeLessThan(line.z ?? 0);
    expect(halo.z).toBeGreaterThan(named(optionFor(mixed), REVENUE).z ?? 0);
    // After its line, so the legend takes its entry's colour from the line.
    expect(drawn.indexOf(halo)).toBeGreaterThan(drawn.indexOf(line));
  });

  it('gives an area and points no halo', () => {
    const halos = seriesOf(optionFor(mixed)).filter((one) => one.lineStyle?.color === SURFACE);

    expect(halos.map((one) => one.name)).toEqual([TARGET]);
  });

  it('paints the halo under the line and over the bars', () => {
    const svg = renderToSvg(optionFor(mixed));
    const at = (pattern: RegExp) => svg.search(pattern);

    const halo = at(new RegExp(`fill="none"[^>]*stroke="${SURFACE}"[^>]*stroke-width="5"`));
    const line = at(new RegExp(`fill="none"[^>]*stroke="${ORANGE}"[^>]*stroke-width="2"`));
    const bar = at(new RegExp(`fill="${BLUE}"`));
    expect(halo).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(halo);
    expect(halo).toBeLessThan(line);
  });

  it('draws points 8 px across, ringed 1.5 px in the surface colour', () => {
    const points = named(comboOption(mixed), MARGIN);

    expect([points.symbol, points.symbolSize, points.itemStyle]).toEqual([
      'circle',
      8,
      { color: GREEN, borderColor: SURFACE, borderWidth: 1.5 },
    ]);
  });

  it('formats each axis by its own first measure', () => {
    const formatted: RenderSpec = {
      ...mixed,
      formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
    };
    const axes = comboOption(formatted)['yAxis'] as {
      axisLabel?: { formatter?: (value: number) => string };
    }[];

    expect(axes[0]?.axisLabel?.formatter?.(1500)).toMatch(/^\$1,500/);
    expect(axes[1]?.axisLabel?.formatter?.(0.25)).toMatch(/^25/);
  });

  /** T846's review: split by colour, every series is the first measure's. */
  it('draws a split combo whose first measure is on the right', () => {
    const REGION = 'orders.region';
    const split: RenderSpec = {
      chartType: 'combo',
      encoding: { x: [MONTH], y: [REVENUE], color: [REGION] },
      rows: [
        { [MONTH]: 'Jan', [REGION]: 'East', [REVENUE]: 120 },
        { [MONTH]: 'Jan', [REGION]: 'West', [REVENUE]: 90 },
      ],
      options: { series: { [REVENUE]: { axis: 'right' } } },
    };
    const option = optionFor(split);
    const axes = option['yAxis'] as Record<string, unknown>[];

    expect(() => renderToSvg(option)).not.toThrow();
    expect(seriesOf(option).every((one) => one.yAxisIndex === 1)).toBe(true);
    expect(axes).toHaveLength(2);
  });

  /** T846's review: an axis no measure is on draws its gridlines, not numbers. */
  it('leaves the left axis unlabelled while every measure is on the right', () => {
    const right: RenderSpec = {
      ...mixed,
      encoding: { x: [MONTH], y: [MARGIN] },
      options: { series: { [MARGIN]: { mark: 'point', axis: 'right' } } },
    };
    const [left] = comboOption(right)['yAxis'] as {
      axisLabel?: { show?: boolean };
      splitLine?: { show?: boolean };
    }[];

    expect(left?.axisLabel?.show).toBe(false);
    expect(left?.splitLine?.show).toBe(true);
  });

  it('gives an area’s marked share no halo, as it gives the area none', () => {
    const option = withLineHalos(
      {
        series: [
          { type: 'line', name: COST, data: [80, 90], areaStyle: { opacity: 0.24 } },
          // A marked share drawn over the area, as `withMarkedShareLines`
          // draws it: each item its part of a share (T852: told by its items,
          // since split series share a name).
          {
            type: 'line',
            name: COST,
            data: [
              { value: 10, share: { part: 'marked' } },
              { value: null, share: { part: 'marked' } },
            ],
            areaStyle: undefined,
          },
        ],
      },
      mixed,
    );

    expect(seriesOf(option)).toHaveLength(2);
  });

  it('draws the right axis’s measure though it is on another scale than the first', () => {
    const formatted: RenderSpec = {
      ...mixed,
      formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
    };

    expect(seriesOf(optionFor(formatted)).map((one) => one.name)).toContain(MARGIN);
  });

  /**
   * T858 (AC-219): Customize › Axes' Left and Right groups each set their
   * own axis while two are drawn: a title, a number format, and the left's
   * gridlines (the right draws none of its own).
   */
  it('draws each axis group’s title, number format and the left’s gridlines', () => {
    const set: RenderSpec = {
      ...mixed,
      options: {
        ...mixed.options,
        axes: {
          y: { title: 'Money', gridlines: false },
          right: { title: 'Share', numberFormat: 'percent', tickRotation: 45 },
        },
      },
    };
    type Axis = {
      name?: string;
      splitLine?: { show?: boolean };
      axisLabel?: { formatter?: (value: unknown) => string; rotate?: number };
    };
    const [left, right] = optionFor(set)['yAxis'] as Axis[];

    expect(left?.name).toBe('Money');
    expect(right?.name).toBe('Share');
    expect(left?.splitLine?.show).toBe(false);
    expect(right?.splitLine?.show).toBe(false);
    expect(right?.axisLabel?.formatter?.(0.25)).toBe('25%');
    expect(right?.axisLabel?.rotate).toBe(45);
  });
});

/**
 * T852 (AC-504): split by one dimension, every measure drawn once per
 * member, each member in its colour, each measure's members on its axis with
 * its mark, its bars grouped within each category in member order.
 */
describe('a combo split across every measure (AC-504)', () => {
  const QUARTER = 'orders.quarter';
  const REGION = 'orders.region';
  const REVENUE = 'orders.revenue';
  const MARGIN = 'orders.margin_pct';
  const COST = 'orders.cost';
  const regions = ['EMEA', 'APAC', 'AMER', 'LATAM'];
  const COLOURS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'];
  type Drawn = {
    name: string;
    type: string;
    yAxisIndex: number;
    z: number;
    data: unknown[];
    tooltip?: unknown;
    areaStyle?: unknown;
    itemStyle?: { color?: string };
  };
  const split = (options: Record<string, unknown> = {}): RenderSpec => ({
    chartType: 'combo',
    encoding: { x: [QUARTER], color: [REGION], y: [REVENUE, MARGIN] },
    rows: ['Q1', 'Q2'].flatMap((quarter, q) =>
      regions.map((region, r) => ({
        [QUARTER]: quarter,
        [REGION]: region,
        [REVENUE]: 100 * (q + 1) * (r + 1),
        [MARGIN]: 0.05 * (r + 1),
        [COST]: 50 * (r + 1),
      })),
    ),
    // Longer than the members, so a colour by series index would show.
    palette: [...COLOURS, '#9467bd', '#8c564b'],
    titles: { [REVENUE]: 'Revenue', [MARGIN]: 'Margin %', [COST]: 'Cost' },
    formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [COST]: 'currency' },
    options: { series: { [MARGIN]: { axis: 'right' } }, ...options },
  });
  const drawnOf = (spec: RenderSpec) =>
    (optionFor(spec)['series'] as Drawn[]).filter((one) => one.tooltip === undefined);

  it('draws 8 series: Revenue’s members as bars on the left, Margin %’s as lines on the right', () => {
    const series = drawnOf(split());

    expect(series.map((one) => `${one.name} ${one.type} ${String(one.yAxisIndex)}`)).toEqual([
      ...regions.map((region) => `${region} bar 0`),
      ...regions.map((region) => `${region} line 1`),
    ]);
  });

  it('colours each member alike in every measure', () => {
    const series = drawnOf(split());

    expect(series.map((one) => one.itemStyle?.color)).toEqual([...COLOURS, ...COLOURS]);
  });

  it('groups a measure’s bars in member order within each category, in the SVG', () => {
    const bars = marksOf(draw(split()), COLOURS)
      .filter((mark) => mark.bottom - mark.top > 2 && mark.right - mark.left > 4)
      .sort((a, b) => a.left - b.left);
    const firstQuarter = bars.slice(0, 4).map((bar) => bar.fill);

    expect(firstQuarter).toEqual(COLOURS);
  });

  it('puts a halo under each line, an area before it notwithstanding', () => {
    const spec = {
      ...split({ series: { [COST]: { mark: 'area' }, [MARGIN]: { axis: 'right' } } }),
      encoding: { x: [QUARTER], color: [REGION], y: [REVENUE, COST, MARGIN] },
    };
    const halos = (optionFor(spec)['series'] as Drawn[]).filter((one) => one.tooltip !== undefined);

    // 3 measures × 4 regions is past 8 series, so the regions fold to the
    // top 1 + Other (T853, AC-505; folded as drawn since checkpoint 1's
    // review): Margin %'s line is drawn twice, a halo under each.
    expect(halos).toHaveLength(2);
    expect(halos.every((one) => one.yAxisIndex === 1)).toBe(true);
  });

  it('writes each data label in its own measure’s format (T852’s review)', () => {
    const series = optionFor(split({ dataLabels: true }))['series'] as (Drawn & {
      label?: { formatter?: (params: { value: unknown }) => string };
    })[];
    const margin = series.find((one) => one.type === 'line' && one.tooltip === undefined);

    expect(margin?.label?.formatter?.({ value: 0.05 })).toMatch(/^5(\.0+)?%$/);
  });

  it('counts a member once for its legend, however many measures draw it (T852’s review)', () => {
    const one = { ...split(), rows: split().rows.filter((row) => row[REGION] === 'EMEA') };

    expect(seriesCount(one)).toBe(1);
    expect(seriesCount(split())).toBe(4);
  });

  it('writes each value in its own measure’s format in the tooltip, naming the measure', () => {
    const tooltip = optionFor(split())['tooltip'] as { formatter: (rows: unknown) => string };
    const text = tooltip.formatter([
      { seriesName: 'EMEA', seriesIndex: 0, name: 'Q1', value: 100 },
      { seriesName: 'EMEA', seriesIndex: 4, name: 'Q1', value: 0.05 },
    ]);

    expect(text).toContain('EMEA · Revenue: $100');
    expect(text).toContain('EMEA · Margin %: 5');
    expect(text).toMatch(/Margin %: 5(\.0+)?%/);
  });
});

/**
 * T850 (AC-502): both axes log or neither; never log while bars are drawn;
 * and a value at or below zero, which a log axis has no place for, not drawn
 * and counted under the chart.
 */
describe('log scale (AC-502)', () => {
  const MONTH = 'orders.month';
  const SESSIONS = 'web.sessions';
  const ORDERS = 'orders.count';
  const GREEN = '#0f9d58';
  type Axis = { type?: string; min?: number; max?: number; interval?: number };
  type Drawn = { name: string; data: unknown[] };
  const logCombo = (options: Record<string, unknown>): RenderSpec => ({
    chartType: 'combo',
    encoding: { x: [MONTH], y: [SESSIONS, ORDERS] },
    rows: [
      { [MONTH]: 'Jan', [SESSIONS]: 120, [ORDERS]: 0 },
      { [MONTH]: 'Feb', [SESSIONS]: 4_000, [ORDERS]: 0 },
      { [MONTH]: 'Mar', [SESSIONS]: 35_000, [ORDERS]: 0 },
      { [MONTH]: 'Apr', [SESSIONS]: 90_000, [ORDERS]: 12 },
    ],
    palette: [BLUE, GREEN],
    titles: { [SESSIONS]: 'Sessions', [ORDERS]: 'Orders' },
    options: {
      series: { [SESSIONS]: { mark: 'line' }, [ORDERS]: { mark: 'point', axis: 'right' } },
      axes: { y: { log: true } },
      ...options,
    },
  });
  const axesOf = (spec: RenderSpec) => optionFor(spec)['yAxis'] as Axis[];
  const decades = (axis: Axis | undefined) =>
    Math.round(Math.log10(axis?.max ?? NaN) - Math.log10(axis?.min ?? NaN));

  it('draws one point for Orders 0, 0, 0 and 12, and reports 3 values not drawn', () => {
    const spec = logCombo({});
    const orders = (optionFor(spec)['series'] as Drawn[]).find((one) => one.name === ORDERS);

    expect(orders?.data).toEqual([null, null, null, 12]);
    // Drawn without the legend, whose point glyph is no point of the series.
    expect(marksOf(draw(spec), [GREEN])).toHaveLength(1);
    expect(logScaleOmissions(spec)).toEqual({
      count: 3,
      text: '3 values not drawn: Orders was 0 in Jan, Feb and Mar, and a log scale has no zero.',
    });
  });

  it('makes both axes log, over as many decades, though only the left asked', () => {
    const [left, right] = axesOf(logCombo({}));

    expect(left?.type).toBe('log');
    expect(right?.type).toBe('log');
    expect(left?.interval).toBeUndefined();
    expect(decades(left)).toBe(decades(right));
    expect(left?.min).toBe(100);
    expect(left?.max).toBe(100_000);
    expect(right?.min).toBe(10);
  });

  it('draws each right tick level with a left one, in the SVG', () => {
    const labels = labelsOf(renderToSvg(optionFor(logCombo({}))));
    const side = (onLeft: boolean) =>
      labels
        .filter((label) => /\d/.test(label.text) && (onLeft ? label.x < 100 : label.x > 540))
        .sort((a, b) => a.y - b.y);
    const [left, right] = [side(true), side(false)];

    expect(left.length).toBe(4);
    expect(right).toHaveLength(left.length);
    right.forEach((tick, at) =>
      expect(Math.abs(tick.y - (left[at]?.y ?? NaN))).toBeLessThanOrEqual(1),
    );
  });

  it('gives both axes one log extent while synchronized', () => {
    const [left, right] = axesOf(logCombo({ combo: { synchronize: true } }));

    expect(right?.type).toBe('log');
    expect({ min: right?.min, max: right?.max }).toEqual({ min: left?.min, max: left?.max });
    expect(left?.min).toBe(10);
  });

  it('never draws log while a series draws bars, whatever is stored', () => {
    const spec = logCombo({
      series: { [SESSIONS]: { mark: 'bar' }, [ORDERS]: { mark: 'point', axis: 'right' } },
    });
    const [left, right] = axesOf(spec);

    expect(left?.type).toBe('value');
    expect(right?.type).toBe('value');
    expect(logScaleOmissions(spec)).toBeUndefined();
  });

  it('leaves a value at or below zero off a one-axis log chart too', () => {
    const spec = logCombo({ series: { [SESSIONS]: { mark: 'line' }, [ORDERS]: { mark: 'line' } } });
    const axis = optionFor(spec)['yAxis'] as Axis;
    const orders = (optionFor(spec)['series'] as Drawn[]).find((one) => one.name === ORDERS);

    expect(axis.type).toBe('log');
    expect(orders?.data).toEqual([null, null, null, 12]);
    expect(logScaleOmissions(spec)?.count).toBe(3);
  });

  it('says nothing when every value is above zero', () => {
    expect(
      logScaleOmissions({
        ...logCombo({}),
        rows: [{ [MONTH]: 'Jan', [SESSIONS]: 1, [ORDERS]: 2 }],
      }),
    ).toBeUndefined();
  });

  it('counts what the drawing leaves out, not a measure dropped for its scale (T850 review)', () => {
    const REVENUE = 'orders.revenue';
    const MARGIN = 'orders.margin';
    const spec: RenderSpec = {
      chartType: 'combo',
      encoding: { x: [MONTH], y: [REVENUE, MARGIN] },
      rows: [
        { [MONTH]: 'Jan', [REVENUE]: 0, [MARGIN]: 0 },
        { [MONTH]: 'Feb', [REVENUE]: 300, [MARGIN]: 0.2 },
      ],
      formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
      titles: { [REVENUE]: 'Revenue', [MARGIN]: 'Margin' },
      // Margin's bars are on Revenue's axis in another scale, so not drawn:
      // the chart is drawn log, and only Revenue's zero is left out.
      options: { series: { [REVENUE]: { mark: 'line' } }, axes: { y: { log: true } } },
    };

    expect((optionFor(spec)['yAxis'] as Axis).type).toBe('log');
    expect(logScaleOmissions(spec)).toEqual({
      count: 1,
      text: '1 value not drawn: Revenue was 0 in Jan, and a log scale has no zero.',
    });
  });

  it('names a negative value as below zero', () => {
    const spec = { ...logCombo({}), rows: [{ [MONTH]: 'Jan', [SESSIONS]: -5, [ORDERS]: 2 }] };

    expect(logScaleOmissions(spec)?.text).toBe(
      '1 value not drawn: Sessions was at or below 0 in Jan, and a log scale has nothing at or below zero.',
    );
  });
});

/**
 * T851 (AC-503, rule 126): stacking set once for the whole chart, keyed per
 * axis so a stack never crosses axes (ECharts stacks by the `stack` string
 * alone; research/rich-tiles-and-combo-tech.md §2).
 */
describe('stacking (AC-503)', () => {
  const MONTH = 'orders.month';
  const REVENUE = 'orders.revenue';
  const COST = 'orders.cost';
  const ORDERS = 'orders.count';
  const RETURNS = 'orders.returns';
  const SESSIONS = 'orders.sessions';
  const FOUR = [BLUE, ORANGE, '#0f8a5f', '#c0392b'];

  /** Revenue and Cost bars on the left; Orders and Returns bars on the right. */
  const bars = (combo?: Record<string, unknown>): RenderSpec => ({
    chartType: 'combo',
    encoding: { x: [MONTH], y: [REVENUE, COST, ORDERS, RETURNS] },
    rows: [
      { [MONTH]: 'Jan', [REVENUE]: 120, [COST]: 80, [ORDERS]: 10, [RETURNS]: 2 },
      { [MONTH]: 'Feb', [REVENUE]: 150, [COST]: 90, [ORDERS]: 12, [RETURNS]: 3 },
    ],
    palette: FOUR,
    options: {
      series: {
        [COST]: { mark: 'bar' },
        [ORDERS]: { mark: 'bar', axis: 'right' },
        [RETURNS]: { mark: 'bar', axis: 'right' },
      },
      ...(combo === undefined ? {} : { combo }),
    },
  });
  /** Revenue and Cost areas on the left, Sessions an area on the right. */
  const areas = (combo?: Record<string, unknown>): RenderSpec => ({
    chartType: 'combo',
    encoding: { x: [MONTH], y: [REVENUE, COST, SESSIONS] },
    rows: [
      { [MONTH]: 'Jan', [REVENUE]: 120, [COST]: 80, [SESSIONS]: 1000 },
      { [MONTH]: 'Feb', [REVENUE]: 150, [COST]: 90, [SESSIONS]: 1400 },
    ],
    palette: PALETTE,
    options: {
      series: {
        [REVENUE]: { mark: 'area' },
        [COST]: { mark: 'area' },
        [SESSIONS]: { mark: 'area', axis: 'right' },
      },
      ...(combo === undefined ? {} : { combo }),
    },
  });

  type Drawn = { name?: string; stack?: string; type?: string; areaStyle?: unknown };
  const stacksOf = (spec: RenderSpec) =>
    Object.fromEntries(
      (comboOption(spec)['series'] as Drawn[])
        // A line's halo isn't one of its series (T846-1).
        .filter((one) => one.type !== 'line' || one.areaStyle !== undefined)
        .map((one) => [one.name, one.stack]),
    );
  type Axis = { min?: number; max?: number };
  const axesOf = (spec: RenderSpec) => comboOption(spec)['yAxis'] as Axis[];

  it('draws bars side by side by default, in no stack', () => {
    expect(stacksOf(bars())).toEqual({
      [REVENUE]: undefined,
      [COST]: undefined,
      [ORDERS]: undefined,
      [RETURNS]: undefined,
    });
  });

  it('stacks every bar series, the left’s in "0:bars" and the right’s in "1:bars"', () => {
    expect(stacksOf(bars({ bars: 'stacked' }))).toEqual({
      [REVENUE]: '0:bars',
      [COST]: '0:bars',
      [ORDERS]: '1:bars',
      [RETURNS]: '1:bars',
    });
  });

  it('gives overlapping areas no stack, and stacked areas "‹axis›:areas"', () => {
    expect(stacksOf(areas())).toEqual({
      [REVENUE]: undefined,
      [COST]: undefined,
      [SESSIONS]: undefined,
    });
    expect(stacksOf(areas({ areas: 'stacked' }))).toEqual({
      [REVENUE]: '0:areas',
      [COST]: '0:areas',
      [SESSIONS]: '1:areas',
    });
  });

  it('never stacks a line or a point, even with both stackings on', () => {
    const spec: RenderSpec = {
      ...bars({ bars: 'stacked', areas: 'stacked' }),
      options: {
        series: { [COST]: { mark: 'point' }, [ORDERS]: { mark: 'line' } },
        combo: { bars: 'stacked', areas: 'stacked' },
      },
    };
    const drawn = comboOption(spec)['series'] as Drawn[];

    const unstacked = drawn.filter((one) => one.name === COST || one.name === ORDERS);

    expect(unstacked.length).toBeGreaterThan(0);
    expect(unstacked.map((one) => one.stack)).toEqual(unstacked.map(() => undefined));
  });

  it('scales each axis to its stacks’ totals, so no stack runs off the top', () => {
    const [left, right] = axesOf(bars({ bars: 'stacked' }));

    // Feb's stack is 150 + 90 = 240 on the left and 12 + 3 = 15 on the right.
    expect(left?.max).toBeGreaterThanOrEqual(240);
    expect(right?.max).toBeGreaterThanOrEqual(15);
    // Side by side, the tallest bar is all each axis needs to reach.
    const [sideLeft] = axesOf(bars());
    expect(sideLeft?.max).toBeLessThan(240);
  });

  type Bar = {
    name?: string;
    type?: string;
    data?: unknown[];
    itemStyle?: { borderWidth?: number; borderRadius?: number[] };
  };
  const barsOf = (spec: RenderSpec, canvas?: { width: number; height: number }) =>
    (comboOption(spec, canvas)['series'] as Bar[]).filter((one) => one.type === 'bar');
  /** Each bar's corner radii, per category, as drawn. */
  const radiiOf = (bar: Bar | undefined) =>
    (bar?.data ?? []).map((item) =>
      typeof item === 'object' && item !== null && 'itemStyle' in item
        ? (item as { itemStyle: { borderRadius: number[] } }).itemStyle.borderRadius
        : bar?.itemStyle?.borderRadius,
    );

  it('rounds only each stack’s outermost segment, at its data end (T851’s review)', () => {
    const drawn = barsOf(bars({ bars: 'stacked' }));
    const named = (name: string) => drawn.find((one) => one.name === name);

    // Revenue is under Cost on the left, Orders under Returns on the right.
    expect(radiiOf(named(REVENUE))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(radiiOf(named(COST))).toEqual([
      [4, 4, 0, 0],
      [4, 4, 0, 0],
    ]);
    expect(radiiOf(named(ORDERS))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(radiiOf(named(RETURNS))).toEqual([
      [4, 4, 0, 0],
      [4, 4, 0, 0],
    ]);
  });

  it('rounds a stack’s segment below zero at its foot, and the top one where the outermost has no value', () => {
    const spec = bars({ bars: 'stacked' });
    const rows = [
      { [MONTH]: 'Jan', [REVENUE]: 120, [COST]: -80, [ORDERS]: 10, [RETURNS]: 2 },
      { [MONTH]: 'Feb', [REVENUE]: 150, [COST]: null, [ORDERS]: 12, [RETURNS]: 3 },
    ];
    const drawn = barsOf({ ...spec, rows });
    const named = (name: string) => drawn.find((one) => one.name === name);

    expect(radiiOf(named(COST))[0]).toEqual([0, 0, 4, 4]);
    expect(radiiOf(named(REVENUE))[1]).toEqual([4, 4, 0, 0]);
  });

  it('keeps the bars’ surface gap where two stacks a category leave them wide enough (AC-210)', () => {
    const months = Array.from({ length: 20 }, (_, at) => `M${String(at)}`);
    const wide = (combo?: Record<string, unknown>): RenderSpec => ({
      ...bars(combo),
      rows: months.map((month) => ({
        [MONTH]: month,
        [REVENUE]: 120,
        [COST]: 80,
        [ORDERS]: 10,
        [RETURNS]: 2,
      })),
    });
    const canvas = { width: 600, height: 320 };
    const gapOf = (spec: RenderSpec) => barsOf(spec, canvas)[0]?.itemStyle?.borderWidth;

    // Four bars a month side by side are too narrow for the gap…
    expect(gapOf(wide())).toBe(0);
    // …two stacks a month are not.
    expect(gapOf(wide({ bars: 'stacked' }))).toBeGreaterThan(0);
  });

  it('draws a right stack beside the left one, never on top of it', () => {
    const svg = draw(bars({ bars: 'stacked' }));
    const marks = marksOf(svg, FOUR);

    expect(marks).toHaveLength(8);

    // Two stacks per month, one per axis, side by side: four columns of bars
    // whose left edges differ.
    expect(new Set(marks.map((mark) => Math.round(mark.left))).size).toBe(4);
  });
});
