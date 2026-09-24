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

import { optionFor } from './optionFor';
import { labelsOf, marksOf, renderToSvg } from './testing/renderToSvg';

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
});

describe('stacking, only where the tab offers it', () => {
  const stacks = (spec: RenderSpec) =>
    ((optionFor(spec) as { series?: { stack?: unknown }[] }).series ?? []).map((one) => one.stack);

  it('leaves a combo, a horizontal bar and a single series unstacked', () => {
    expect(stacks({ ...twoSeries({ stacked: true }), chartType: 'combo' })).not.toContain('total');
    expect(stacks({ ...twoSeries({ stacked: true }), chartType: 'hbar' })).not.toContain('total');
    expect(
      stacks({ ...twoSeries({ stacked: true }), encoding: { x: [STATUS], y: [COUNT] } }),
    ).not.toContain('total');
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
