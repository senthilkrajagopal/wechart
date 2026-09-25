import { describe, expect, it } from 'vitest';

import type { EChartsOption } from '../theme';
import { itemsInShape, type PixelConverter } from './itemsInShape';

/**
 * T094 / AC-088 and AC-089: which of a drawn chart's items a rectangle or a
 * lasso touches, named as a click on the same item names it — its category
 * and its series — so a drag and a click reach the same marking.
 *
 * The chart is stood in for by a converter: category *i* sits at x = 100·i +
 * 50, and a value v at y = 300 − v (the plot's foot at 300). ECharts'
 * `convertToPixel` answers the same questions on a real instance.
 */
const converter: PixelConverter = {
  convertToPixel(finder, value) {
    if (finder.xAxisIndex !== undefined) return 100 * Number(value) + 50;
    return 300 - Number(value);
  },
};

/** The same geometry turned on its side, for a horizontal bar. */
const sideways: PixelConverter = {
  convertToPixel(finder, value) {
    if (finder.yAxisIndex !== undefined) return 100 * Number(value) + 50;
    return Number(value);
  },
};

const bars = (stacked = false): EChartsOption => ({
  xAxis: { type: 'category', data: ['completed', 'shipped', 'processing'] },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'bar',
      name: 'Count',
      data: [{ value: 80 }, { value: 120 }, 40],
      ...(stacked ? { stack: 'total' } : {}),
    },
    ...(stacked
      ? [{ type: 'bar', name: 'Later', stack: 'total', data: [{ value: 50 }, 60, 30] }]
      : []),
  ],
});

describe('what a shape touches on a chart', () => {
  it('takes a bar the rectangle crosses anywhere along its length, not only at its end', () => {
    // Across the feet of the first two bars: neither's top is inside.
    const shape = { kind: 'rect', x0: 40, y0: 290, x1: 160, y1: 299 } as const;

    expect(itemsInShape(converter, bars(), shape)).toEqual([
      { name: 'completed', seriesName: 'Count' },
      { name: 'shipped', seriesName: 'Count' },
    ]);
  });

  it('takes nothing when the shape misses every item', () => {
    const shape = { kind: 'rect', x0: 0, y0: 0, x1: 20, y1: 20 } as const;

    expect(itemsInShape(converter, bars(), shape)).toEqual([]);
  });

  it('rings one bar with a lasso', () => {
    const shape = {
      kind: 'lasso',
      points: [
        [240, 250],
        [260, 250],
        [260, 299],
        [240, 299],
      ],
    } as const;

    expect(itemsInShape(converter, bars(), shape)).toEqual([
      { name: 'processing', seriesName: 'Count' },
    ]);
  });

  it('finds a stacked segment where it is drawn, above the one below it', () => {
    // Between 80 and 130 over "completed": the second segment alone.
    const shape = { kind: 'rect', x0: 45, y0: 175, x1: 55, y1: 215 } as const;

    expect(itemsInShape(converter, bars(true), shape)).toEqual([
      { name: 'completed', seriesName: 'Later' },
    ]);
  });

  it('reads a horizontal bar along the x axis', () => {
    const option: EChartsOption = {
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: ['north', 'south'] },
      series: [{ type: 'bar', name: 'Count', data: [100, 30] }],
    };
    // A strip at x 60–70: only the long bar reaches it.
    const shape = { kind: 'rect', x0: 60, y0: 0, x1: 70, y1: 400 } as const;

    expect(itemsInShape(sideways, option, shape)).toEqual([{ name: 'north', seriesName: 'Count' }]);
  });

  it('takes a line’s point, and a scatter’s, where they are drawn', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['Jan', 'Feb'] },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Revenue', data: [100, 200] },
        { type: 'scatter', name: 'North', data: [[1, 10]] },
      ],
    };
    // Around (150, 100): Feb's point on the line, not the scatter's (150, 290).
    const shape = { kind: 'rect', x0: 140, y0: 90, x1: 160, y1: 110 } as const;

    expect(itemsInShape(converter, option, shape)).toEqual([
      { name: 'Feb', seriesName: 'Revenue' },
    ]);
  });

  it('names an item by the category it carries, as a click does', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['Completed (label)'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', name: 'Count', data: [{ value: 10, category: 'completed' }] }],
    };
    const shape = { kind: 'rect', x0: 40, y0: 280, x1: 60, y1: 299 } as const;

    expect(itemsInShape(converter, option, shape)).toEqual([
      { name: 'completed', seriesName: 'Count' },
    ]);
  });

  it('skips a gap a series has no value for', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', name: 'Count', data: [null, 10] }],
    };
    const shape = { kind: 'rect', x0: 0, y0: 0, x1: 400, y1: 300 } as const;

    expect(itemsInShape(converter, option, shape)).toEqual([{ name: 'b', seriesName: 'Count' }]);
  });
});
