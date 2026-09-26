import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { labelsOf, renderToSvg } from './testing/renderToSvg';
import { themed } from './themed';

/**
 * T391, AC-299: WHEN a chart's value-axis labels would overlap at the tile's
 * width, THE SYSTEM SHALL thin or abbreviate them so no two overlap (the UI
 * review's gap 4).
 * `Fails when: two value-axis labels overlap in a drawn tile.`
 *
 * Read off the drawn SVG, at a tile's narrow width and a short one. ECharts'
 * SSR output carries no measured boxes, so each label's extent is its
 * characters at the axis's 12 px, 0.6 em apiece: generous for digits, so a
 * pass means real room between them.
 */
const REGION = 'orders.region';
const AMOUNT = 'orders.amount';
const FONT_PX = 12;
const CHAR_EM = 0.6;

const rows = ['North', 'South', 'East', 'West'].map((region, at) => ({
  [REGION]: region,
  [AMOUNT]: (at + 1) * 1_234_567,
}));

const spec = (chartType: 'bar' | 'hbar'): RenderSpec => ({
  chartType,
  encoding: { x: [REGION], y: [AMOUNT] },
  rows,
  palette: ['#123456'],
});

/** The value axis's labels: the numbers drawn along it, in order along it. */
const valueLabels = (svg: string, along: 'x' | 'y') =>
  labelsOf(svg)
    .filter((label) => /^-?[\d.,]+[KMB]?$/.test(label.text))
    .sort((a, b) => a[along] - b[along]);

describe('value-axis labels never overlap (T391, AC-299)', () => {
  it('across a tile of any width, a horizontal value axis keeps room between its labels', () => {
    const counts: number[] = [];
    for (const width of [220, 360, 640]) {
      const size = { width, height: 260 };
      const labels = valueLabels(renderToSvg(optionFor(spec('hbar'), size), size), 'x');
      counts.push(labels.length);
      for (let at = 1; at < labels.length; at += 1) {
        const [before, after] = [labels[at - 1]!, labels[at]!];
        const halves = ((before.text.length + after.text.length) * FONT_PX * CHAR_EM) / 2;
        expect(
          after.x - before.x,
          `${String(width)} px: ${before.text} and ${after.text}`,
        ).toBeGreaterThanOrEqual(halves);
      }
    }
    // Thinned, never emptied; and a wide tile still shows several.
    expect(counts.every((count) => count >= 1)).toBe(true);
    expect(counts[2]).toBeGreaterThanOrEqual(3);
    expect(counts[0]).toBeLessThan(counts[2]!);
  });

  it('down a short tile, a vertical value axis keeps a line between its labels', () => {
    // 80 px: unthinned, its labels are 6.8 px apart (T391's review; at 110 they had room anyway).
    for (const height of [110, 80]) {
      const size = { width: 400, height };
      const labels = valueLabels(renderToSvg(optionFor(spec('bar'), size), size), 'y');
      expect(labels.length).toBeGreaterThan(1);
      for (let at = 1; at < labels.length; at += 1)
        expect(labels[at]!.y - labels[at - 1]!.y).toBeGreaterThanOrEqual(FONT_PX);
    }
  });

  /** T391's review: the value axes its first cut missed. */
  it('on a log axis too', () => {
    const size = { width: 220, height: 260 };
    const log: RenderSpec = { ...spec('hbar'), options: { axes: { x: { log: true } } } };
    const labels = valueLabels(renderToSvg(optionFor(log, size), size), 'x');
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (let at = 1; at < labels.length; at += 1) {
      const [before, after] = [labels[at - 1]!, labels[at]!];
      const halves = ((before.text.length + after.text.length) * FONT_PX * CHAR_EM) / 2;
      expect(after.x - before.x, `${before.text} and ${after.text}`).toBeGreaterThanOrEqual(halves);
    }
  });

  it('in every panel of a trellis', () => {
    const size = { width: 640, height: 320 };
    const trellis: RenderSpec = {
      chartType: 'trellis',
      encoding: { facet: ['orders.store'], x: [REGION], y: [AMOUNT] },
      rows: Array.from({ length: 20 }, (_, panel) =>
        rows.map((row) => ({ ...row, 'orders.store': `s${String(panel)}` })),
      ).flat(),
      palette: ['#123456'],
    };
    // A panel's labels share their x, the axis they're drawn along: each
    // column of panels, top to bottom, keeps a line between its labels. Less
    // a tenth of a pixel: ECharts takes boxes that touch within 0.05 px as
    // not overlapping (`labelLayoutHelper.js`, `touchThreshold`), and its
    // panels keep two labels 11.92 px apart, a line being 12 (unthinned, 5.96).
    const columns = new Map<number, number[]>();
    for (const label of valueLabels(renderToSvg(optionFor(trellis, size), size), 'y'))
      columns.set(Math.round(label.x), [...(columns.get(Math.round(label.x)) ?? []), label.y]);
    expect(columns.size).toBeGreaterThan(1);
    for (const [x, ys] of columns)
      for (let at = 1; at < ys.length; at += 1)
        expect(
          ys[at]! - ys[at - 1]!,
          `the column at ${String(x)}: ${ys.map((y) => y.toFixed(1)).join(', ')}`,
        ).toBeGreaterThanOrEqual(FONT_PX - 0.1);
  });

  it('only on value axes, and alongside the axis editor’s settings', () => {
    const rotated: RenderSpec = {
      ...spec('hbar'),
      options: { axes: { x: { tickRotation: 45, numberFormat: 'compact' } } },
    };
    const option = themed(optionFor(rotated, { width: 400, height: 260 }), 'light');
    const [xAxis, yAxis] = [option.xAxis, option.yAxis] as {
      axisLabel?: { hideOverlap?: boolean; rotate?: number; formatter?: (value: number) => string };
    }[];
    // The values, thinned, still turned and formatted as asked, through the tile's theme.
    expect(xAxis?.axisLabel?.hideOverlap).toBe(true);
    expect(xAxis?.axisLabel?.rotate).toBe(45);
    expect(xAxis?.axisLabel?.formatter?.(1_234_567)).toBe('1.2M');
    // The categories keep ECharts' own interval.
    expect(yAxis?.axisLabel?.hideOverlap).toBeUndefined();
  });
});
