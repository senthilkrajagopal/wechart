/**
 * T039 / AC-037: treemap and heatmap.
 *
 * Both are tested on the thing that makes them that chart rather than on the
 * option that asked for it: a treemap's rectangle **areas** are the shares,
 * and a heatmap's cell **darkness** is the value.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { heatmapOption } from './heatmap';
import { treemapOption } from './treemap';
import { cellsOf, marksOf, renderToSvg } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const GREEN = '#0f9d58';
const PALETTE = [BLUE, ORANGE, GREEN];

const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';

describe('treemap', () => {
  const spec: RenderSpec = {
    chartType: 'treemap',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: [
      { [STATUS]: 'paid', [COUNT]: 60 },
      { [STATUS]: 'refunded', [COUNT]: 30 },
      { [STATUS]: 'pending', [COUNT]: 10 },
    ],
    palette: PALETTE,
  };

  const draw = (next: RenderSpec) => marksOf(renderToSvg(treemapOption(next)), PALETTE);
  const areaOf = (box: { left: number; right: number; top: number; bottom: number }) =>
    (box.right - box.left) * (box.bottom - box.top);

  it('draws one rectangle per category', () => {
    expect(draw(spec)).toHaveLength(3);
  });

  it('sizes each rectangle by its share of the total', () => {
    const [biggest, middle, smallest] = draw(spec).sort((a, b) => areaOf(b) - areaOf(a)) as [
      ReturnType<typeof draw>[0],
      ReturnType<typeof draw>[0],
      ReturnType<typeof draw>[0],
    ];

    // 60 / 30 / 10. Area, not edge length — a treemap that laid three equal
    // tiles out would pass a count but fail every ratio here.
    expect(areaOf(biggest) / areaOf(middle)).toBeCloseTo(2, 0);
    expect(areaOf(middle) / areaOf(smallest)).toBeCloseTo(3, 0);
  });

  it('leaves out a category with nothing to show', () => {
    // Zero has no area, and a rectangle with no size still takes a legend
    // entry and a hit target.
    const withZero: RenderSpec = {
      ...spec,
      rows: [
        { [STATUS]: 'paid', [COUNT]: 60 },
        { [STATUS]: 'refunded', [COUNT]: 0 },
        { [STATUS]: 'pending', [COUNT]: 10 },
      ],
    };

    expect(draw(withZero)).toHaveLength(2);
  });
});

describe('heatmap', () => {
  const spec: RenderSpec = {
    chartType: 'heatmap',
    encoding: { x: [STATUS], y: [REGION], color: [COUNT] },
    rows: [
      { [STATUS]: 'paid', [REGION]: 'east', [COUNT]: 0 },
      { [STATUS]: 'refunded', [REGION]: 'east', [COUNT]: 50 },
      { [STATUS]: 'paid', [REGION]: 'west', [COUNT]: 100 },
    ],
    palette: PALETTE,
  };

  const draw = (next: RenderSpec) => cellsOf(renderToSvg(heatmapOption(next)));

  it('draws one cell per row of the result', () => {
    expect(draw(spec)).toHaveLength(3);
  });

  it('makes a larger value a darker cell', () => {
    const cells = draw(spec).sort((a, b) => b.luminance - a.luminance);
    const [palest, middle, darkest] = cells as [
      (typeof cells)[0],
      (typeof cells)[0],
      (typeof cells)[0],
    ];

    // The whole claim of a heatmap. A renderer that gave every cell the same
    // colour would leave three identical luminances and fail both.
    expect(palest.luminance).toBeGreaterThan(middle.luminance);
    expect(middle.luminance).toBeGreaterThan(darkest.luminance);
  });

  it('runs between the ends of the sequential ramp direction.md publishes', () => {
    const cells = draw(spec).sort((a, b) => b.luminance - a.luminance);

    // #cde2fb and #0d366b — the lowest value takes the pale end and the
    // highest the dark end, so the ramp is the one that was decided, not
    // ECharts' default.
    expect(cells.at(0)?.fill).toBe('rgb(205,226,251)');
    expect(cells.at(-1)?.fill).toBe('rgb(13,54,107)');
  });

  it('puts the two dimensions on the two axes', () => {
    const cells = draw(spec);
    const columns = new Set(cells.map((cell) => Math.round(cell.left)));
    const rows = new Set(cells.map((cell) => Math.round(cell.top)));

    // Two statuses across, two regions down: a heatmap that put both
    // dimensions on one axis would give one row or one column.
    expect(columns.size).toBe(2);
    expect(rows.size).toBe(2);
  });
});
