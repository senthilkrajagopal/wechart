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

import { comboOption, withLineHalos } from './combo';
import { optionFor } from '../optionFor';
import { marksOf, renderToSvg, strokesOf } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const PALETTE = [BLUE, ORANGE];

const STATUS = 'orders.status';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const draw = (spec: RenderSpec) => renderToSvg(comboOption(spec));

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
          // A marked share drawn over the area, as `withMarkedShareLines` does.
          { type: 'line', name: COST, data: [10, null], areaStyle: undefined },
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
});
