/**
 * T036 / AC-037: line, multi-series line, area and stacked area.
 *
 * As with the bar family, every assertion is made against a chart that was
 * actually rendered. A line is a stroke with `fill="none"`, so the marks are
 * read back with `strokesOf`; an area draws both a filled polygon and the line
 * on top of it, and the two are checked separately.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { lineOption } from './line';
import {
  categoryLabelsOf,
  markersOf,
  marksOf,
  renderToSvg,
  strokesOf,
} from '../testing/renderToSvg';

/**
 * Deliberately not the default ramp: with `DEFAULT_PALETTE[0]` and `[1]` every
 * assertion would pass even if `lineOption` ignored `spec.palette` entirely.
 */
const BLUE = '#123456';
const ORANGE = '#abcdef';
const SURFACE = '#fedcba';
const PALETTE = [BLUE, ORANGE];

const MONTH = 'orders.month';
const COUNT = 'orders.count';
const TOTAL = 'orders.total';

const MONTHS = ['jan', 'feb', 'mar'];

const draw = (spec: RenderSpec) => renderToSvg(lineOption(spec));

const oneMeasure = (chartType: RenderSpec['chartType']): RenderSpec => ({
  chartType,
  encoding: { x: [MONTH], y: [COUNT] },
  rows: [
    { [MONTH]: 'jan', [COUNT]: 10 },
    { [MONTH]: 'feb', [COUNT]: 30 },
    { [MONTH]: 'mar', [COUNT]: 20 },
  ],
  palette: PALETTE,
  surface: SURFACE,
});

const twoMeasures = (chartType: RenderSpec['chartType']): RenderSpec => ({
  chartType,
  encoding: { x: [MONTH], y: [COUNT, TOTAL] },
  rows: [
    { [MONTH]: 'jan', [COUNT]: 10, [TOTAL]: 20 },
    { [MONTH]: 'feb', [COUNT]: 30, [TOTAL]: 10 },
    { [MONTH]: 'mar', [COUNT]: 20, [TOTAL]: 30 },
  ],
  palette: PALETTE,
  surface: SURFACE,
});

describe('line', () => {
  it('draws one line through one point per category', () => {
    const strokes = strokesOf(draw(oneMeasure('line')), PALETTE);

    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.points).toHaveLength(MONTHS.length);
  });

  it('puts the categories along the horizontal axis', () => {
    const labels = categoryLabelsOf(draw(oneMeasure('line')), MONTHS);

    expect(labels.map((label) => label.text)).toEqual(MONTHS);
    expect(new Set(labels.map((label) => label.y)).size).toBe(1);
  });

  it('follows the values: the tallest month is the highest point', () => {
    const points = strokesOf(draw(oneMeasure('line')), PALETTE)[0]?.points ?? [];
    const [jan, feb, mar] = points as [number, number][];

    // Smaller y is higher on screen. feb (30) is the peak, jan (10) the trough.
    expect(feb?.[1]).toBeLessThan(mar?.[1] as number);
    expect(mar?.[1]).toBeLessThan(jan?.[1] as number);
  });

  it('draws the line at the weight direction.md §6 asks for', () => {
    expect(strokesOf(draw(oneMeasure('line')), PALETTE)[0]?.widthPx).toBe(2);
  });

  it('breaks the line at a gap rather than joining across it', () => {
    const withGap: RenderSpec = {
      ...oneMeasure('line'),
      rows: [
        { [MONTH]: 'jan', [COUNT]: 10 },
        { [MONTH]: 'feb', [COUNT]: null },
        { [MONTH]: 'mar', [COUNT]: 20 },
      ],
    };

    // A missing month is not a month with no orders. Joining jan straight to
    // mar would draw a trend through data that was never measured.
    expect(strokesOf(draw(withGap), PALETTE)[0]?.breaks).toBe(1);
    expect(strokesOf(draw(oneMeasure('line')), PALETTE)[0]?.breaks).toBe(0);
  });

  it('fills nothing: a line chart is not an area chart', () => {
    expect(marksOf(draw(oneMeasure('line')), PALETTE)).toHaveLength(0);
  });

  it('draws a marker per point, no smaller than direction.md §6 allows', () => {
    const markers = markersOf(draw(oneMeasure('line')), PALETTE);

    expect(markers).toHaveLength(MONTHS.length);
    for (const marker of markers) expect(marker.diameterPx).toBeGreaterThanOrEqual(8);
  });
});

describe('multiLine', () => {
  it('draws one line per measure, each in its own colour', () => {
    const strokes = strokesOf(draw(twoMeasures('multiLine')), PALETTE);

    expect(strokes.map((stroke) => stroke.colour)).toEqual([BLUE, ORANGE]);
    expect(strokes.every((stroke) => stroke.points.length === MONTHS.length)).toBe(true);
  });

  it('leaves the lines independent, so neither rides on the other', () => {
    const strokes = strokesOf(draw(twoMeasures('multiLine')), PALETTE);
    const [count, total] = strokes as [(typeof strokes)[0], (typeof strokes)[0]];

    // In jan, count (10) is below total (20); in feb, count (30) is above
    // total (10). Stacked series could never cross.
    expect(count.points[0]?.[1]).toBeGreaterThan(total.points[0]?.[1] as number);
    expect(count.points[1]?.[1]).toBeLessThan(total.points[1]?.[1] as number);
  });
});

describe('area', () => {
  it('fills beneath the line as well as drawing it', () => {
    const svg = draw(oneMeasure('area'));

    expect(strokesOf(svg, PALETTE)).toHaveLength(1);
    expect(marksOf(svg, PALETTE)).toHaveLength(1);
  });

  it('fills down to the baseline, below every point of the line', () => {
    const svg = draw(oneMeasure('area'));
    const fill = marksOf(svg, PALETTE)[0];
    const line = strokesOf(svg, PALETTE)[0];
    const lowestPoint = Math.max(...(line?.points ?? []).map(([, y]) => y));

    expect(fill?.bottom).toBeGreaterThan(lowestPoint);
  });
});

describe('stackedArea', () => {
  it('fills one region per measure', () => {
    expect(marksOf(draw(twoMeasures('stackedArea')), PALETTE)).toHaveLength(2);
  });

  it('rests the upper series on the lower one instead of overlapping it', () => {
    const svg = draw(twoMeasures('stackedArea'));
    const lower = strokesOf(svg, PALETTE).find((stroke) => stroke.colour === BLUE);
    const upper = strokesOf(svg, PALETTE).find((stroke) => stroke.colour === ORANGE);

    // Stacked: the upper line is the sum, so it sits above the lower line at
    // every category. Unstacked, the two cross (see multiLine above), so this
    // fails for a chart that only claims to stack.
    for (const [index, point] of (upper?.points ?? []).entries()) {
      expect(point[1]).toBeLessThan(lower?.points[index]?.[1] as number);
    }
  });
});
