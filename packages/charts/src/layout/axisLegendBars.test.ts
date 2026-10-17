/**
 * T683 (AC-352, AC-187; design 04 pin 6; DSH-02, CMP-12), on
 * research/echarts-axis-legend-bars.md and the coordinator's calls on it
 * (2026-10-08):
 * - a value axis whose every measure is a count is ticked in whole numbers
 *   (`minInterval: 1`), and no other;
 * - the legend left-aligned with 10 × 10 rounded swatches 8 px apart, with
 *   no inherited stroke, and Customize's right placement still on the right;
 * - every bar at most 36 px wide, in bar, combo and trellis charts, the
 *   surface gap and the marking hit area reckoned on the drawn width.
 *
 * Drawn for real (`renderToSvg`, ECharts' SSR) where the doc asks for it.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import { gapFor, laidBarWidth } from '../series/bar';
import { BAR_MAX_PX, drawnBarWidth } from '../series/bar';
import { labelsOf, marksOf, renderToSvg } from '../testing/renderToSvg';
import { MARK } from '../theme';

const STATUS = 'orders.status';
const COUNT = 'orders.count';
const AMOUNT = 'orders.average_amount';
const PALETTE = ['#123456', '#abcdef', '#654321'];

const bars = (
  values: readonly number[],
  measureTypes: Record<string, string> = { [COUNT]: 'count' },
  options?: RenderSpec['options'],
  measure = COUNT,
): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [measure] },
  rows: values.map((value, at) => ({ [STATUS]: `s${String(at)}`, [measure]: value })),
  palette: PALETTE,
  measureTypes,
  ...(options === undefined ? {} : { options }),
});
const axis = (option: Record<string, unknown>, key: 'xAxis' | 'yAxis') =>
  option[key] as Record<string, unknown>;
/** The value axis's tick labels, as drawn: the texts left of the plot. */
const ticksOf = (svg: string) =>
  labelsOf(svg)
    .filter((label) => label.x < 40 && /^-?\d/.test(label.text))
    .map((label) => label.text);

describe('whole-number ticks on an axis of counts (DSH-02)', () => {
  // `/v1/meta`'s aggType spells them `countDistinct` and `countDistinctApprox`
  // (research/cross-highlight.md, "Measure metadata"); the model's own
  // snake_case spellings are taken too.
  it('ticks a count, a count distinct and an approximate one in whole numbers', () => {
    for (const type of [
      'count',
      'countDistinct',
      'countDistinctApprox',
      'count_distinct',
      'count_distinct_approx',
    ])
      expect(axis(optionFor(bars([1, 2], { [COUNT]: type })), 'yAxis')['minInterval'], type).toBe(1);
  });

  it('leaves any other measure, and one whose type isn’t known, as ECharts ticks it', () => {
    expect(
      axis(optionFor(bars([1, 2], { [AMOUNT]: 'avg' }, undefined, AMOUNT)), 'yAxis')['minInterval'],
    ).toBeUndefined();
    expect(axis(optionFor(bars([1, 2], {})), 'yAxis')['minInterval']).toBeUndefined();
  });

  it('puts it on the value axis of a horizontal bar, its x', () => {
    const option = optionFor({ ...bars([1, 2]), chartType: 'hbar' });
    expect(axis(option, 'xAxis')['minInterval']).toBe(1);
    expect(axis(option, 'yAxis')['minInterval']).toBeUndefined();
  });

  // T683's review: a quick calculation's values sit under the count's own
  // name (render-spec.ts, `calculated`), and "% of total" is a fraction, so
  // ticked whole its axis would collapse to 0 % and 100 %.
  it('leaves a count drawn as a quick calculation as ECharts ticks it', () => {
    const shared = {
      ...bars([0.336, 0.333, 0.331]),
      calculated: { [COUNT]: { label: '% of total', format: 'percent' as const } },
    };
    expect(axis(optionFor(shared), 'yAxis')['minInterval']).toBeUndefined();
  });

  // T683's review: a trellis's panels each have their own value axis.
  it('ticks every panel of a trellis of counts in whole numbers', () => {
    const trellis: RenderSpec = {
      chartType: 'trellis',
      encoding: { facet: ['orders.region'], x: [STATUS], y: [COUNT] },
      rows: [
        { 'orders.region': 'n', [STATUS]: 'a', [COUNT]: 1 },
        { 'orders.region': 's', [STATUS]: 'a', [COUNT]: 2 },
      ],
      palette: PALETTE,
      measureTypes: { [COUNT]: 'count' },
    };
    const values = (optionFor(trellis)['yAxis'] as Record<string, unknown>[]).filter(
      (one) => one['type'] === 'value',
    );
    expect(values.length).toBe(2);
    for (const one of values) expect(one['minInterval']).toBe(1);
    const averaged = { ...trellis, measureTypes: { [COUNT]: 'avg' } };
    for (const one of optionFor(averaged)['yAxis'] as Record<string, unknown>[])
      expect(one['minInterval']).toBeUndefined();
  });

  it('draws all-zero counts on 0 and 1, and a 0.4 count on 0 and 1, never 0.2 (the doc’s §1)', () => {
    expect(ticksOf(renderToSvg(optionFor(bars([0, 0]))))).toEqual(['0', '1']);
    expect(ticksOf(renderToSvg(optionFor(bars([0.4, 0.2]))))).toEqual(['0', '1']);
    // Small whole counts: every tick whole.
    for (const tick of ticksOf(renderToSvg(optionFor(bars([1, 3, 2])))))
      expect(Number.isInteger(Number(tick)), tick).toBe(true);
  });
});

describe('the legend, left, with 10 × 10 rounded swatches 8 px apart (CMP-12)', () => {
  const two: RenderSpec = {
    chartType: 'groupedBar',
    encoding: { x: [STATUS], y: [COUNT, 'orders.total'] },
    rows: [
      { [STATUS]: 'a', [COUNT]: 1, 'orders.total': 2 },
      { [STATUS]: 'b', [COUNT]: 3, 'orders.total': 4 },
    ],
    palette: PALETTE,
  };
  const legendOf = (option: Record<string, unknown>) => option['legend'] as Record<string, unknown>;

  it('sets the swatch, its size, its gap and no stroke, at the left', () => {
    expect(legendOf(optionFor(two))).toMatchObject({
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 8,
      itemStyle: { borderWidth: 0 },
      left: 0,
      top: 0,
    });
  });

  it('draws each swatch 10 × 10 with a 2.5 px corner, unstroked, near the left edge', () => {
    const svg = renderToSvg(optionFor(two));
    // The legend's own marks, as SSR tags them.
    const swatches = [...svg.matchAll(/<path\b[^>]*ecmeta_ssr_type="legend"[^>]*>/g)]
      .map((match) => match[0])
      .filter((path) => /fill="#(123456|abcdef)"/.test(path));
    expect(swatches.length).toBe(2);
    for (const path of swatches) {
      expect(path, path).not.toMatch(/stroke-width="[1-9]/);
      // A 10 × 10 square, rounded 2.5 px at its corners.
      expect(path, path).toMatch(/A2\.5 2\.5/);
      expect(path, path).toMatch(/d="M2\.5 0L7\.5 0/);
    }
    const lefts = swatches.map((path) =>
      Number(/transform="translate\((-?[\d.]+)[ ,]/.exec(path)?.[1] ?? Number.NaN),
    );
    expect(Math.min(...lefts)).toBeLessThan(20);
  });

  it('keeps Customize’s right placement on the right, its left taken off', () => {
    const option = optionFor({ ...two, options: { legend: { position: 'right' } } });
    expect(legendOf(option)['left']).toBeUndefined();
    expect(legendOf(option)['right']).toBe(0);
    const names = labelsOf(renderToSvg(option)).filter((label) =>
      ['Orders Count', 'orders.count', 'orders.total'].some((name) => label.text.endsWith(name.split('.')[1]!)),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.x).toBeGreaterThan(640 / 2);
  });
});

describe('bars at most 36 px wide (CMP-12)', () => {
  const series = (option: Record<string, unknown>) =>
    (option['series'] as Record<string, unknown>[]).filter((one) => one['type'] === 'bar');

  it('caps every bar series, in bar, grouped, combo and trellis charts', () => {
    const grouped: RenderSpec = {
      chartType: 'groupedBar',
      encoding: { x: [STATUS], y: [COUNT], color: ['orders.region'] },
      rows: [
        { [STATUS]: 'a', 'orders.region': 'n', [COUNT]: 1 },
        { [STATUS]: 'a', 'orders.region': 's', [COUNT]: 2 },
      ],
      palette: PALETTE,
    };
    const combo: RenderSpec = {
      chartType: 'combo',
      encoding: { x: [STATUS], y: [COUNT, 'orders.total'] },
      rows: [{ [STATUS]: 'a', [COUNT]: 1, 'orders.total': 2 }],
      palette: PALETTE,
    };
    const trellis: RenderSpec = {
      chartType: 'trellis',
      encoding: { facet: ['orders.region'], x: [STATUS], y: [COUNT] },
      rows: [
        { 'orders.region': 'n', [STATUS]: 'a', [COUNT]: 1 },
        { 'orders.region': 's', [STATUS]: 'a', [COUNT]: 2 },
      ],
      palette: PALETTE,
    };
    for (const spec of [bars([1, 2]), grouped, combo, trellis]) {
      const drawn = series(optionFor(spec));
      expect(drawn.length, spec.chartType).toBeGreaterThan(0);
      for (const one of drawn) expect(one['barMaxWidth'], spec.chartType).toBe(BAR_MAX_PX);
    }
  });

  it('draws two wide bands’ bars 36 px, centred in their bands', () => {
    const svg = renderToSvg(optionFor({ ...bars([3, 5]), palette: ['#123456'] }));
    const drawn = marksOf(svg, ['#123456']);
    expect(drawn.length).toBe(2);
    for (const bar of drawn) expect(Math.round(bar.right - bar.left)).toBeLessThanOrEqual(36);
    // Centred: each bar's middle under its category's label.
    const labels = labelsOf(svg).filter((label) => /^s\d$/.test(label.text));
    for (const [at, bar] of drawn.sort((a, b) => a.left - b.left).entries())
      expect(Math.abs((bar.left + bar.right) / 2 - labels.sort((a, b) => a.x - b.x)[at]!.x)).toBeLessThan(1);
  });

  it('reckons the surface gap on the drawn width', () => {
    // A band wide enough that the laid width passes the cap.
    expect(laidBarWidth(600, 2, 1)).toBeGreaterThan(BAR_MAX_PX);
    expect(drawnBarWidth(600, 2, 1)).toBe(BAR_MAX_PX);
    expect(gapFor(drawnBarWidth(600, 2, 1))).toBe(MARK.gapPx);
    expect(drawnBarWidth(60, 10, 1)).toBe(laidBarWidth(60, 10, 1));
  });
});
