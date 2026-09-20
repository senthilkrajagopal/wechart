/**
 * T038 / AC-037: pie and donut.
 *
 * A pie's whole claim is that each slice's **angle** is its share of the
 * total. Counting slices does not test that — a renderer that gave every
 * category an equal slice would pass a count. So the angles are read back out
 * of the drawn geometry and checked against the shares.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { pieOption } from './pie';
import { renderToSvg, sectorsOf } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const GREEN = '#0f9d58';
const PALETTE = [BLUE, ORANGE, GREEN];

const STATUS = 'orders.status';
const COUNT = 'orders.count';

const draw = (spec: RenderSpec) => renderToSvg(pieOption(spec));

/** Halves and quarters, so the expected angles are exact. */
const spec: RenderSpec = {
  chartType: 'pie',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 50 },
    { [STATUS]: 'refunded', [COUNT]: 25 },
    { [STATUS]: 'pending', [COUNT]: 25 },
  ],
  palette: PALETTE,
};

describe('pie', () => {
  it('draws one slice per category', () => {
    expect(sectorsOf(draw(spec), PALETTE)).toHaveLength(3);
  });

  it('gives each slice the angle its share of the total deserves', () => {
    const sectors = sectorsOf(draw(spec), PALETTE);
    const byFill = (fill: string) => sectors.find((sector) => sector.fill === fill);

    // 50 of 100 is half the circle; 25 of 100 is a quarter. A renderer that
    // ignored the values and split the circle evenly would give three 120°
    // slices and fail all three.
    expect(byFill(BLUE)?.sweepDeg).toBeCloseTo(180, 0);
    expect(byFill(ORANGE)?.sweepDeg).toBeCloseTo(90, 0);
    expect(byFill(GREEN)?.sweepDeg).toBeCloseTo(90, 0);
  });

  it('fills the circle, leaving no hole', () => {
    // Every slice runs to the middle. This is what a donut does not do.
    for (const sector of sectorsOf(draw(spec), PALETTE)) {
      expect(sector.touchesCentre).toBe(true);
    }
  });
});

describe('donut', () => {
  const donut: RenderSpec = { ...spec, chartType: 'donut' };

  it('draws the same slices as the pie', () => {
    const sectors = sectorsOf(draw(donut), PALETTE);

    expect(sectors).toHaveLength(3);
    expect(sectors.find((sector) => sector.fill === BLUE)?.sweepDeg).toBeCloseTo(180, 0);
  });

  it('leaves a hole in the middle', () => {
    // The one thing that makes it a donut rather than a pie, read from the
    // geometry rather than from the option that asked for it.
    for (const sector of sectorsOf(draw(donut), PALETTE)) {
      expect(sector.touchesCentre).toBe(false);
    }
  });
});

describe('a slice with nothing in it', () => {
  it('is left out rather than drawn as a zero-width sliver', () => {
    const withGap: RenderSpec = {
      ...spec,
      rows: [
        { [STATUS]: 'paid', [COUNT]: 50 },
        { [STATUS]: 'refunded', [COUNT]: null },
        { [STATUS]: 'pending', [COUNT]: 50 },
      ],
    };

    // A missing measurement is not a category worth nothing, and a sliver in
    // the legend invites the reader to look for a slice that is not there.
    expect(sectorsOf(draw(withGap), PALETTE)).toHaveLength(2);
  });
});
