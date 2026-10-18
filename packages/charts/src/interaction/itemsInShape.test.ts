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

  // T190 stage 7's review: a bar is the rectangle ECharts draws, not its centre line.
  it('takes a wide bar by its edge, not only across its centre', () => {
    // Three bands of 100 px: one bar per band is 100 − 31% = 69 px wide, centred.
    const shape = { kind: 'rect', x0: 70, y0: 290, x1: 80, y1: 299 } as const;

    expect(itemsInShape(converter, bars(), shape)).toEqual([
      { name: 'completed', seriesName: 'Count' },
    ]);
  });

  // T683 (CMP-12): a bar capped at its series' barMaxWidth is taken as drawn.
  it('takes a capped bar by its drawn width, centred in its band', () => {
    const capped = bars();
    const series = (capped.series as Record<string, unknown>[]).map((one) => ({
      ...one,
      barMaxWidth: 36,
    }));
    const option = { ...capped, series };
    // Drawn 36 px wide, centred on 50: 32 to 68. Its laid 69 px would reach 70.
    expect(
      itemsInShape(converter, option, { kind: 'rect', x0: 33, y0: 290, x1: 38, y1: 299 }),
    ).toEqual([{ name: 'completed', seriesName: 'Count' }]);
    expect(
      itemsInShape(converter, option, { kind: 'rect', x0: 70, y0: 290, x1: 80, y1: 299 }),
    ).toEqual([]);
  });

  it('takes a grouped bar by its own slot in the band, not its neighbour', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: { type: 'value' },
      series: [
        { type: 'bar', name: 'North', data: [50, 50] },
        { type: 'bar', name: 'South', data: [50, 50] },
      ],
    };
    // Band 0 is x 0–100. Two columns: each (100 − 27) / 2.1 ≈ 34.8 px, 10% of
    // one apart, the pair 73 wide and centred on 50 — North 13.5–48.3, South
    // 51.7–86.5, and the gap between them 48.3–51.7.
    const overSouth = { kind: 'rect', x0: 60, y0: 280, x1: 80, y1: 299 } as const;
    const inTheGap = { kind: 'rect', x0: 49, y0: 280, x1: 51, y1: 299 } as const;

    expect(itemsInShape(converter, option, overSouth)).toEqual([
      { name: 'a', seriesName: 'South' },
    ]);
    expect(itemsInShape(converter, option, inTheGap)).toEqual([]);
  });

  /**
   * T846's review: a combo's bars on two value axes still share one band,
   * side by side, as ECharts lays out bars by their category axis
   * (`barGrid.js`, `createLayoutInfoListOnAxis(baseAxis…)`).
   */
  it('takes a combo’s bars on two value axes by their slots in one band', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { type: 'bar', name: 'North', data: [50, 50] },
        { type: 'bar', name: 'South', yAxisIndex: 1, data: [50, 50] },
      ],
    };
    const overSouth = { kind: 'rect', x0: 60, y0: 280, x1: 80, y1: 299 } as const;
    const inTheGap = { kind: 'rect', x0: 49, y0: 280, x1: 51, y1: 299 } as const;

    expect(itemsInShape(converter, option, overSouth)).toEqual([
      { name: 'a', seriesName: 'South' },
    ]);
    expect(itemsInShape(converter, option, inTheGap)).toEqual([]);
  });

  it('takes a combo’s point, one value at its category, where it is drawn', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: { type: 'value' },
      series: [{ type: 'scatter', name: 'Margin', data: [20, { value: 40 }] }],
    };
    // "b" at x 150, 40 at y 260.
    const shape = { kind: 'rect', x0: 140, y0: 250, x1: 160, y1: 270 } as const;

    expect(itemsInShape(converter, option, shape)).toEqual([{ name: 'b', seriesName: 'Margin' }]);
  });

  it('stacks a negative segment below the baseline, as ECharts does by sign', () => {
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a'] },
      yAxis: { type: 'value' },
      series: [
        { type: 'bar', name: 'Up', stack: 'total', data: [100] },
        { type: 'bar', name: 'Down', stack: 'total', data: [-30] },
      ],
    };
    // Below the foot (y > 300 is below zero): only the negative segment.
    const below = { kind: 'rect', x0: 45, y0: 310, x1: 55, y1: 320 } as const;
    // At 80, inside the positive bar: not the negative one too.
    const at80 = { kind: 'rect', x0: 45, y0: 215, x1: 55, y1: 225 } as const;

    expect(itemsInShape(converter, option, below)).toEqual([{ name: 'a', seriesName: 'Down' }]);
    expect(itemsInShape(converter, option, at80)).toEqual([{ name: 'a', seriesName: 'Up' }]);
  });

  it('starts a bar at 1 on a log axis, and never marks what it cannot place', () => {
    const logarithmic: PixelConverter = {
      convertToPixel(finder, value) {
        if (finder.xAxisIndex !== undefined) return 100 * Number(value) + 50;
        // log10: 1 at the foot (300), 10 at 200, 100 at 100; 0 is -Infinity.
        return 300 - 100 * Math.log10(Number(value));
      },
    };
    const option: EChartsOption = {
      xAxis: { type: 'category', data: ['a', 'b', 'c'] },
      yAxis: { type: 'log' },
      series: [{ type: 'bar', name: 'Count', data: [100, 10, 1000] }],
    };
    const overA = { kind: 'rect', x0: 40, y0: 150, x1: 60, y1: 160 } as const;

    expect(itemsInShape(logarithmic, option, overA)).toEqual([{ name: 'a', seriesName: 'Count' }]);
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
