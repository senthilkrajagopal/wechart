/**
 * T848 as amended by R82 (AC-500, rules 119 and 2): each value axis of a
 * combo titled horizontally above itself with its unit alone ("$", "%"), or,
 * where its format has no unit, with its measures' names ("Orders"), never
 * with a mark glyph, the legend holding the glyphs; and tick labels in
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
const ORDERS = 'orders.count';
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
/** Whether a title holds a rich-text token, which is how a glyph is drawn. */
const hasGlyph = (axis: Axis | undefined) =>
  /\{\w+\|/.test(axis?.name ?? '') || Object.keys(axis?.nameTextStyle?.rich ?? {}).length > 0;

describe('the left axis’s title (AC-500, R82)', () => {
  const [left] = axesOf(comboOption(spec));

  it('is its unit alone, with no measure named', () => {
    expect(left?.name).toBe('$');
  });

  it('carries no mark glyph', () => {
    expect(hasGlyph(left)).toBe(false);
  });

  it('sits horizontally above its axis, from the axis line inwards', () => {
    expect(left?.nameLocation).toBe('end');
    expect(left?.nameRotate).toBe(0);
    expect(left?.nameTextStyle?.align).toBe('left');
  });
});

describe('the right axis’s title (AC-500, R82)', () => {
  const [, right] = axesOf(comboOption(spec));

  it('is its unit alone, ending at the axis line, with no glyph', () => {
    expect(right?.name).toBe('%');
    expect(hasGlyph(right)).toBe(false);
    expect(right?.nameTextStyle?.align).toBe('right');
    expect(right?.nameRotate).toBe(0);
  });

  it('names its measures where its format has no unit, as "Orders"', () => {
    const counts: RenderSpec = {
      ...spec,
      encoding: { x: [MONTH], y: [REVENUE, ORDERS] },
      rows: [
        { [MONTH]: 'Jan', [REVENUE]: 120_000, [ORDERS]: 310 },
        { [MONTH]: 'Feb', [REVENUE]: 155_000, [ORDERS]: 402 },
      ],
      formats: { [REVENUE]: 'currency' },
      titles: { [REVENUE]: 'Revenue', [ORDERS]: 'Orders' },
      options: { series: { [ORDERS]: { mark: 'line', axis: 'right' } } },
    };
    const [left, right] = axesOf(comboOption(counts));

    expect(left?.name).toBe('$');
    expect(right?.name).toBe('Orders');
    expect(hasGlyph(right)).toBe(false);
  });

  it('names each of several unitless measures once, joined by " · "', () => {
    const plain: RenderSpec = { ...spec, formats: {}, options: {} };
    const [axis] = axesOf(comboOption(plain));

    expect(axis?.name).toBe('Revenue · Target · Margin %');
  });
});

describe('one value axis', () => {
  it('is titled the same way while every series is on the left', () => {
    // Margin % in %, drawn by Auto on the left, isn't drawn beside money
    // (R67): the axis is titled with the unit of what it draws.
    const [axis] = axesOf(optionFor({ ...spec, options: {} }));

    expect(axis?.name).toBe('$');
    expect(axis?.nameRotate).toBe(0);
    expect(hasGlyph(axis)).toBe(false);
  });
});

describe('drawn', () => {
  it('writes both units upright above the plot', () => {
    const labels = labelsOf(renderToSvg(optionFor(spec)));
    const dollars = labels.find((label) => label.text === '$');
    const percent = labels.find((label) => label.text === '%');
    const ticks = labels.filter((label) => /\$\d/.test(label.text));

    expect(dollars).toBeDefined();
    expect(percent).toBeDefined();
    // Above every tick of the axis.
    expect(dollars!.y).toBeLessThan(Math.min(...ticks.map((tick) => tick.y)));
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
