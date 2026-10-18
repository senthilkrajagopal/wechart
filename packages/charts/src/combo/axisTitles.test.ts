/**
 * T848 (AC-500, rules 119 and 2): each value axis of a combo titled
 * horizontally above itself with its measures, each after its mark glyph in
 * its series' colour, then the axis's unit; and tick labels in
 * `text-secondary`, never a series colour, in both themes.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { optionFor } from '../optionFor';
import { comboOption } from '../series/combo';
import { themed } from '../themed';
import { labelsOf, renderToSvg } from '../testing/renderToSvg';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const GREEN = '#1baa7d';

const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, TARGET, MARGIN] },
  rows: [
    { [MONTH]: 'Jan', [REVENUE]: 120_000, [TARGET]: 100_000, [MARGIN]: 0.21 },
    { [MONTH]: 'Feb', [REVENUE]: 155_000, [TARGET]: 110_000, [MARGIN]: 0.38 },
  ],
  palette: [BLUE, ORANGE, GREEN],
  formats: { [REVENUE]: 'currency', [TARGET]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [TARGET]: 'Target', [MARGIN]: 'Margin %' },
  options: { series: { [MARGIN]: { mark: 'point', axis: 'right' } } },
};

type Axis = {
  name?: string;
  nameLocation?: string;
  nameRotate?: number;
  nameTextStyle?: { align?: string; rich?: Record<string, Record<string, unknown>> };
  axisLabel?: { color?: string };
};
const axesOf = (option: Record<string, unknown>) => {
  const axes = option['yAxis'];
  return (Array.isArray(axes) ? axes : [axes]) as Axis[];
};
/** A title's words, its glyph tokens taken out. */
const wordsOf = (name: string | undefined) =>
  (name ?? '')
    .replace(/\{\w+\|\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** The rich style of each glyph token in a title, in order. */
const glyphsOf = (axis: Axis | undefined) =>
  [...(axis?.name ?? '').matchAll(/\{(\w+)\|\}/g)].map(
    ([, token]) => axis?.nameTextStyle?.rich?.[token ?? ''] ?? {},
  );

describe('the left axis’s title (AC-500)', () => {
  const [left] = axesOf(comboOption(spec));

  it('names its measures, then its unit', () => {
    expect(wordsOf(left?.name)).toBe('Revenue · Target ($)');
  });

  it('puts each measure after its mark’s glyph, in its series’ colour', () => {
    const name = left?.name ?? '';
    expect(name.indexOf('{')).toBe(0);
    expect(name.indexOf('Revenue')).toBeLessThan(name.lastIndexOf('{'));
    expect(glyphsOf(left)).toEqual([
      // A bar: an 8 × 8 square, radius 2.
      { width: 8, height: 8, borderRadius: 2, backgroundColor: BLUE },
      // A line: a 12 × 2 rule.
      { width: 12, height: 2, backgroundColor: ORANGE },
    ]);
  });

  it('sits horizontally above its axis, from the axis line inwards', () => {
    expect(left?.nameLocation).toBe('end');
    expect(left?.nameRotate).toBe(0);
    expect(left?.nameTextStyle?.align).toBe('left');
  });
});

describe('the right axis’s title (AC-500)', () => {
  const [, right] = axesOf(comboOption(spec));

  it('names its measure after a point’s glyph, then its unit, ending at the axis line', () => {
    expect(wordsOf(right?.name)).toBe('Margin % (%)');
    expect(glyphsOf(right)).toEqual([
      // A point: an 8 px dot, ringed 1 px in the surface colour.
      {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: GREEN,
        borderColor: '#ffffff',
        borderWidth: 1,
      },
    ]);
    expect(right?.nameTextStyle?.align).toBe('right');
    expect(right?.nameRotate).toBe(0);
  });

  it('writes an area as a 12 × 8 block, and a plain number with no unit', () => {
    const area: RenderSpec = {
      ...spec,
      formats: {},
      options: { series: { [MARGIN]: { mark: 'area', axis: 'right' } } },
    };
    const [, axis] = axesOf(comboOption(area));

    expect(wordsOf(axis?.name)).toBe('Margin %');
    expect(glyphsOf(axis)).toEqual([{ width: 12, height: 8, backgroundColor: GREEN }]);
  });
});

describe('one value axis', () => {
  it('is titled the same way while every series is on the left', () => {
    // Margin % in %, drawn by Auto on the left, isn't drawn beside money
    // (R67): the axis is titled with what it draws.
    const [axis] = axesOf(optionFor({ ...spec, options: {} }));

    expect(wordsOf(axis?.name)).toBe('Revenue · Target ($)');
    expect(axis?.nameRotate).toBe(0);
  });
});

describe('drawn', () => {
  it('writes both titles upright above the plot', () => {
    const labels = labelsOf(renderToSvg(optionFor(spec)));
    const revenue = labels.find((label) => label.text.includes('Revenue'));
    const margin = labels.find((label) => label.text.includes('Margin %'));
    const ticks = labels.filter((label) => /\$\d/.test(label.text));

    expect(revenue).toBeDefined();
    expect(margin).toBeDefined();
    // Above every tick of the axis.
    expect(revenue!.y).toBeLessThan(Math.min(...ticks.map((tick) => tick.y)));
  });
});

describe('tick labels (rule 2)', () => {
  it('stay text-secondary in light and dark, on both axes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const axes = axesOf(themed(optionFor(spec), theme));

      expect(axes.map((axis) => axis.axisLabel?.color)).toEqual([
        COLORS[theme]['text-secondary'],
        COLORS[theme]['text-secondary'],
      ]);
    }
  });
});
