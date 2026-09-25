/**
 * T231 / AC-219: THE SYSTEM SHALL offer in the chart editor's Customize tab
 * the axis settings — title, label rotation, include zero, logarithmic scale,
 * gridlines, minimum and maximum — the legend's visibility and position, each
 * series' colour and visibility and whether series stack, data labels, and
 * the number format.
 * `Fails when: the legend's position, data labels or "include zero" cannot be
 * set.`
 *
 * The drawing half: each setting, stored in the chart's options, changes what
 * is drawn. The tab that sets them is the editor's.
 */
import { describe, expect, it } from 'vitest';

import { formatterFor, type RenderSpec } from '@wechart/core';

import { STACKABLE_TYPES } from './customize';
import { optionFor } from './optionFor';
import { labelsOf, marksOf, renderToSvg } from './testing/renderToSvg';
import { MARK } from './theme';

const PALETTE = ['#123456', '#abcdef', '#0f9d58'];
const STATUS = 'orders.status';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const twoSeries = (options: Record<string, unknown> = {}): RenderSpec => ({
  chartType: 'groupedBar',
  encoding: { x: [STATUS], y: [COUNT, AMOUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 110, [AMOUNT]: 130 },
    { [STATUS]: 'refunded', [COUNT]: 120, [AMOUNT]: 140 },
  ],
  palette: PALETTE,
  options,
});

type Legend = {
  top?: unknown;
  right?: unknown;
  bottom?: unknown;
  left?: unknown;
  orient?: unknown;
};
const legendOf = (spec: RenderSpec) => (optionFor(spec) as { legend?: Legend }).legend;

describe('the legend’s visibility and position', () => {
  it('sits at the top by default', () => {
    expect(legendOf(twoSeries())?.top).toBe(0);
  });

  it('moves to the right, standing up, when asked', () => {
    const legend = legendOf(twoSeries({ legend: { position: 'right' } }));
    expect(legend?.right).toBe(0);
    expect(legend?.orient).toBe('vertical');
    expect(legend?.top).not.toBe(0);
  });

  it('moves to the bottom when asked', () => {
    const legend = legendOf(twoSeries({ legend: { position: 'bottom' } }));
    expect(legend?.bottom).toBe(0);
    expect(legend?.top).toBeUndefined();
  });

  it('is not drawn when hidden', () => {
    expect(legendOf(twoSeries({ legend: { show: false } }))).toBeUndefined();
  });
});

describe('data labels', () => {
  it('writes each mark’s value on it when on, and none when off', () => {
    const texts = (spec: RenderSpec) => labelsOf(renderToSvg(optionFor(spec))).map((l) => l.text);
    // 130 and 140 are not axis ticks; only a data label can write them.
    expect(texts(twoSeries())).not.toContain('130');
    const labelled = texts(twoSeries({ dataLabels: true }));
    expect(labelled).toContain('130');
    expect(labelled).toContain('140');
  });
});

describe('data labels, as each measure is written (AC-046)', () => {
  const series = (spec: RenderSpec) =>
    (
      optionFor(spec) as {
        series?: {
          name?: string;
          stack?: unknown;
          label?: { position?: unknown; formatter?: (p: unknown) => string };
        }[];
      }
    ).series ?? [];

  // T242's review: a heatmap's measure is its colour; its y is a grouping.
  it('writes a heatmap cell’s label in the format of the measure it colours by', () => {
    const heatmap = series({
      chartType: 'heatmap',
      encoding: { x: [STATUS], y: ['orders.region'], color: [AMOUNT] },
      rows: [{ [STATUS]: 'paid', 'orders.region': 'North', [AMOUNT]: 130 }],
      palette: PALETTE,
      formats: { [AMOUNT]: 'currency' },
      options: { dataLabels: true },
    });
    expect(heatmap[0]?.label?.formatter?.({ value: [0, 0, 130] })).toBe(
      formatterFor(AMOUNT, { [AMOUNT]: 'currency' })(130),
    );
  });

  it('writes a label in its measure’s format, or the one chosen for values', () => {
    const money = { ...twoSeries({ dataLabels: true }), formats: { [AMOUNT]: 'currency' } };
    const amount = series(money).find((one) => one.name === AMOUNT);
    // As the measure's own format writes it everywhere else (AC-046).
    const asModel = formatterFor(AMOUNT, { [AMOUNT]: 'currency' })(130);
    expect(asModel).toContain('$');
    expect(amount?.label?.formatter?.({ value: 130 })).toBe(asModel);
    const compact = series({
      ...money,
      options: { dataLabels: true, valueFormat: 'compact' },
    }).find((one) => one.name === AMOUNT);
    expect(compact?.label?.formatter?.({ value: 1300 })).toBe('1.3K');
  });

  it('places a label past a horizontal bar’s end, and inside a stacked segment', () => {
    const hbar = series({ ...twoSeries({ dataLabels: true }), chartType: 'hbar' });
    expect(hbar[0]?.label?.position).toBe('right');
    const stacked = series({ ...twoSeries({ dataLabels: true }), chartType: 'stackedBar' });
    expect(stacked[0]?.label?.position).toBe('inside');
  });

  it('writes a slice’s value, not its name', () => {
    const pie = series({
      ...twoSeries({ dataLabels: true }),
      chartType: 'pie',
      encoding: { x: [STATUS], y: [COUNT] },
    });
    expect(pie[0]?.label?.formatter?.({ name: 'paid', value: 110 })).toBe('110');
  });

  // T232's review: the measure hidden on a bar, then the chart turned into a
  // pie — whose Customize tab lists no series to show it again.
  it('never hides a pie’s one series for a measure hidden on another type', () => {
    const pie = series({
      ...twoSeries({ series: { [COUNT]: { hidden: true } } }),
      chartType: 'pie',
      encoding: { x: [STATUS], y: [COUNT] },
    });
    expect(pie).toHaveLength(1);
  });
});

/**
 * T309, AC-210 (every row drawn visibly, whatever the tile's width): a donut
 * with its legend at the right drew the legend over its ring, in a tile five
 * columns wide (the Superset-parity rebuild's gap 3). The room a side legend
 * is given was made in `grid`, which a pie does not use
 * (research/echarts.md, "A pie's layout box").
 */
describe('a legend beside a pie or donut (T309)', () => {
  const TILE = { width: 400, height: 300 };
  const donut = (options: Record<string, unknown>): RenderSpec => ({
    chartType: 'donut',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: [
      { [STATUS]: 'Instruments and sensors', [COUNT]: 40 },
      { [STATUS]: 'Components and cables', [COUNT]: 30 },
      { [STATUS]: 'Services and support plans', [COUNT]: 20 },
    ],
    palette: PALETTE,
    options,
  });
  /** The ring's extent, and the legend's swatches (25 × 14). */
  const drawn = (options: Record<string, unknown>) => {
    const marks = marksOf(renderToSvg(optionFor(donut(options)), TILE), PALETTE);
    const swatch = (mark: (typeof marks)[number]) =>
      Math.round(mark.right - mark.left) === 25 && Math.round(mark.bottom - mark.top) === 14;
    const ring = marks.filter((mark) => !swatch(mark));
    return {
      left: Math.min(...ring.map((mark) => mark.left)),
      right: Math.max(...ring.map((mark) => mark.right)),
      swatches: marks.filter(swatch),
    };
  };

  it('draws the ring clear of a legend at the right', () => {
    const { right, swatches } = drawn({ legend: { position: 'right' } });
    expect(swatches).toHaveLength(3);
    expect(right).toBeLessThanOrEqual(Math.min(...swatches.map((mark) => mark.left)));
  });

  it('draws the ring clear of a legend at the left, and of its names', () => {
    const { left, swatches } = drawn({ legend: { position: 'left' } });
    expect(swatches).toHaveLength(3);
    // The side room is 120 px, as a chart on axes is given.
    expect(left).toBeGreaterThanOrEqual(120);
  });

  it('keeps a pie’s side legend’s names within its room, and a bar chart’s whole', () => {
    type WithText = { legend?: { textStyle?: { width?: unknown; overflow?: unknown } } };
    const legend = (optionFor(donut({ legend: { position: 'right' } })) as WithText).legend;
    // 120 less the legend's 5 px padding each side, its 25 px icon and 5 px gap.
    expect(legend?.textStyle).toMatchObject({ width: 80, overflow: 'truncate' });
    const bars = (optionFor(twoSeries({ legend: { position: 'right' } })) as WithText).legend;
    expect(bars?.textStyle?.overflow).toBeUndefined();
  });
});

describe('stacking, only where the tab offers it', () => {
  const stacks = (spec: RenderSpec) =>
    ((optionFor(spec) as { series?: { stack?: unknown }[] }).series ?? []).map((one) => one.stack);

  it('leaves a combo and a single series unstacked', () => {
    expect(stacks({ ...twoSeries({ stacked: true }), chartType: 'combo' })).not.toContain('total');
    expect(
      stacks({ ...twoSeries({ stacked: true }), encoding: { x: [STATUS], y: [COUNT] } }),
    ).not.toContain('total');
  });

  /**
   * T302 (the Superset-parity rebuild's gap 6). T231 left a horizontal bar
   * out, as a chart with one bar series; with two measures, or split by
   * colour, it has two, drawn side by side, and AC-219 offers to stack them.
   */
  it('stacks a horizontal bar’s two series, each segment starting where the one before it ends', () => {
    const hbar = { ...twoSeries({ stacked: true }), chartType: 'hbar' as const };
    expect(stacks(hbar)).toEqual(['total', 'total']);
    expect(STACKABLE_TYPES).toContain('hbar');

    // Drawn: in each category the second series' bar begins at the first's
    // end, past the surface gap between two touching marks (MARK.gapPx).
    const svg = renderToSvg(optionFor(hbar));
    // Taller than the legend's 14 px swatch: the bars alone.
    const bars = (colour: string) =>
      marksOf(svg, [colour])
        .filter((mark) => mark.bottom - mark.top > 20)
        .sort((a, b) => a.top - b.top);
    const first = bars(PALETTE[0] ?? '');
    const second = bars(PALETTE[1] ?? '');
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    for (const [index, mark] of first.entries()) {
      const gap = (second[index]?.left ?? Number.NaN) - mark.right;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(MARK.gapPx);
    }
  });

  it('writes a stacked horizontal bar’s labels inside its segments', () => {
    const labels = (
      (
        optionFor({
          ...twoSeries({ stacked: true, dataLabels: true }),
          chartType: 'hbar',
        }) as { series?: { label?: { position?: unknown } }[] }
      ).series ?? []
    ).map((one) => one.label?.position);
    expect(labels).toEqual(['inside', 'inside']);
  });
});

describe('include zero', () => {
  const minOf = (spec: RenderSpec) => {
    const yAxis = (optionFor(spec) as { yAxis?: { scale?: boolean } }).yAxis;
    return yAxis?.scale;
  };

  it('starts the value axis at zero by default, and at the data when turned off', () => {
    expect(minOf(twoSeries())).not.toBe(true);
    expect(minOf(twoSeries({ axes: { y: { includeZero: false } } }))).toBe(true);
    // Drawn: 0 is a tick with zero included, and not without it.
    const ticks = (spec: RenderSpec) => labelsOf(renderToSvg(optionFor(spec))).map((l) => l.text);
    expect(ticks(twoSeries())).toContain('0');
    expect(ticks(twoSeries({ axes: { y: { includeZero: false } } }))).not.toContain('0');
  });
});

describe('each series’ colour and visibility, and stacking', () => {
  /** The bars of a colour: its legend swatch, a short mark, is not one. */
  const barsIn = (svg: string, colour: string) =>
    marksOf(svg, [colour]).filter((mark) => mark.bottom - mark.top > 20);

  it('draws a series in the colour chosen for it', () => {
    const spec = twoSeries({ series: { [AMOUNT]: { colour: '#ff00aa' } } });
    const svg = renderToSvg(optionFor(spec));
    expect(barsIn(svg, '#ff00aa')).toHaveLength(2);
    expect(barsIn(svg, PALETTE[1] ?? '')).toHaveLength(0);
  });

  it('leaves a hidden series undrawn, and its legend with it once one is left', () => {
    const spec = twoSeries({ series: { [AMOUNT]: { hidden: true } } });
    const svg = renderToSvg(optionFor(spec));
    expect(barsIn(svg, PALETTE[0] ?? '')).toHaveLength(2);
    expect(marksOf(svg, [PALETTE[1] ?? ''])).toHaveLength(0);
    // One series drawn has no legend (AC-038).
    expect(legendOf(spec)).toBeUndefined();
  });

  it('stacks the series when asked, one bar per category', () => {
    const series = (spec: RenderSpec) =>
      (optionFor(spec) as { series?: { stack?: unknown }[] }).series ?? [];
    expect(series(twoSeries()).every((one) => one.stack === undefined)).toBe(true);
    expect(series(twoSeries({ stacked: true })).every((one) => one.stack === 'total')).toBe(true);
  });
});
