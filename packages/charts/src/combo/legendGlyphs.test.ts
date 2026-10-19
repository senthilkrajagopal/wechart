/**
 * T857 (AC-497, AC-500): where each combo legend entry's glyph is drawn, in
 * the chart's own pixels, so the chart editor can put a 20 px button over it.
 * Read from the drawn legend (research/echarts-legend-item-boxes.md), and
 * checked here against the SVG ECharts actually draws: an entry's text starts
 * 5 px past its 12 px glyph, level with its centre.
 */
import { describe, expect, it } from 'vitest';
import * as echarts from 'echarts/core';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import { RENDER_SIZE } from '../testing/renderToSvg';
import { legendEntryAt, legendGlyphBoxes } from './legendGlyphs';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';

const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, TARGET, MARGIN] },
  rows: [
    { [MONTH]: 'Jan', [REVENUE]: 120_000, [TARGET]: 100_000, [MARGIN]: 0.21 },
    { [MONTH]: 'Feb', [REVENUE]: 155_000, [TARGET]: 110_000, [MARGIN]: 0.38 },
  ],
  formats: { [REVENUE]: 'currency', [TARGET]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [TARGET]: 'Target', [MARGIN]: 'Margin %' },
  options: { series: { [MARGIN]: { mark: 'point', axis: 'right' } } },
};

/**
 * Each upright text's own anchor: its `x`, `y` plus its group's translation.
 * (`labelsOf` reads the translation alone, which for a legend entry is the
 * entry's corner, not its text.)
 */
function textsOf(svg: string): { text: string; x: number; y: number }[] {
  return [
    ...svg.matchAll(
      /<text\b[^>]*\bx="(-?[\d.]+)" y="(-?[\d.]+)" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"[^>]*>([^<]*)<\/text>/g,
    ),
  ].map(([, x = '0', y = '0', dx = '0', dy = '0', text = '']) => ({
    text,
    x: Number(x) + Number(dx),
    y: Number(y) + Number(dy),
  }));
}

/** The chart drawn headless, its boxes read, and its SVG for checking them. */
function drawn(option: unknown) {
  const instance = echarts.init(null, null, { renderer: 'svg', ssr: true, ...RENDER_SIZE });
  try {
    instance.setOption({ animation: false, ...(option as object) });
    return { boxes: legendGlyphBoxes(instance), svg: instance.renderToSVGString() };
  } finally {
    instance.dispose();
  }
}

describe("a combo legend's glyphs (T857)", () => {
  it('gives one box per entry, named by its series, in the legend’s order', () => {
    const { boxes } = drawn(optionFor(spec));

    expect(boxes.map((box) => box.name)).toEqual([REVENUE, TARGET, MARGIN]);
  });

  it('centres each box on its glyph: the entry’s text starts 11 px right of it, level', () => {
    const { boxes, svg } = drawn(optionFor(spec));
    const labels = textsOf(svg);

    for (const [name, text] of [
      [REVENUE, 'Revenue'],
      [TARGET, 'Target'],
    ] as const) {
      const box = boxes.find((one) => one.name === name);
      const label = labels.find((one) => one.text === text);
      expect(box).toBeDefined();
      expect(label).toBeDefined();
      // 6 px to the glyph's right edge (12 wide), then the legend's 5 px gap.
      expect(Math.abs((label?.x ?? 0) - ((box?.x ?? 0) + 11))).toBeLessThanOrEqual(1);
      expect(Math.abs((label?.y ?? 0) - (box?.y ?? 0))).toBeLessThanOrEqual(1);
    }
  });

  it('sits inside the chart, the entries left to right on one row', () => {
    const { boxes } = drawn(optionFor(spec));
    const xs = boxes.map((box) => box.x);

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThan(0);
      expect(box.x).toBeLessThan(RENDER_SIZE.width);
      expect(box.y).toBeGreaterThan(0);
      expect(box.y).toBeLessThan(RENDER_SIZE.height);
    }
  });

  it('gives each entry’s whole box, its glyph and its text, for a pointer over it (AC-500)', () => {
    const { boxes, svg } = drawn(optionFor(spec));
    const labels = textsOf(svg);
    const revenue = boxes.find((one) => one.name === REVENUE);
    const target = boxes.find((one) => one.name === TARGET);
    const text = labels.find((one) => one.text === 'Revenue');

    expect(revenue?.entry.left).toBeLessThanOrEqual((revenue?.x ?? 0) - 4);
    expect(revenue?.entry.top).toBeLessThanOrEqual((revenue?.y ?? 0) - 4);
    expect(revenue?.entry.bottom).toBeGreaterThanOrEqual((revenue?.y ?? 0) + 4);
    // Past "Revenue"'s start, by about its width, and short of the next entry.
    expect(revenue?.entry.right).toBeGreaterThan((text?.x ?? 0) + 30);
    expect(revenue?.entry.right).toBeLessThan(target?.entry.left ?? 0);
    // A pointer on its text finds it; one between the entries' rows finds none.
    expect(legendEntryAt(boxes, (text?.x ?? 0) + 10, text?.y ?? 0)?.name).toBe(REVENUE);
    expect(legendEntryAt(boxes, text?.x ?? 0, (revenue?.entry.bottom ?? 0) + 20)).toBeUndefined();
  });

  it('gives none before the chart has an option', () => {
    const instance = echarts.init(null, null, { renderer: 'svg', ssr: true, ...RENDER_SIZE });
    try {
      expect(legendGlyphBoxes(instance)).toEqual([]);
    } finally {
      instance.dispose();
    }
  });

  it('gives none for a chart with no legend', () => {
    const { boxes } = drawn(optionFor({ ...spec, encoding: { x: [MONTH], y: [REVENUE] } }));

    expect(boxes).toEqual([]);
  });
});
