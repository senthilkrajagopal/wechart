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

import { NO_VALUE, pieOption, slicesOf } from './pie';
import { seriesCount } from '../legend';
import { optionFor } from '../optionFor';
import { labelsOf, renderToSvg, sectorsOf } from '../testing/renderToSvg';

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

/**
 * T232 / AC-221: WHEN a pie or donut is drawn, THE SYSTEM SHALL list every
 * slice in its legend.
 * `Fails when: a slice has no legend entry.`
 *
 * Over two dimensions a pie has a slice per pair, and slices named by their
 * category alone shared names — and legend entries — with each other.
 */
describe('a pie over two dimensions (AC-221)', () => {
  const REGION = 'orders.region';
  const twoDimensions: RenderSpec = {
    chartType: 'pie',
    encoding: { x: [STATUS], y: [COUNT], color: [REGION] },
    rows: [
      { [STATUS]: 'paid', [REGION]: 'North', [COUNT]: 10 },
      { [STATUS]: 'paid', [REGION]: 'South', [COUNT]: 20 },
      { [STATUS]: 'refunded', [REGION]: 'North', [COUNT]: 30 },
      { [STATUS]: 'refunded', [REGION]: 'South', [COUNT]: 40 },
    ],
    palette: ['#111111', '#222222', '#333333', '#444444'],
  };

  it('lists every slice in its legend, each by both its values', () => {
    const legendNames = labelsOf(renderToSvg(optionFor(twoDimensions))).map((label) => label.text);
    for (const name of ['paid · North', 'paid · South', 'refunded · North', 'refunded · South'])
      expect(legendNames).toContain(name);
    expect(seriesCount(twoDimensions)).toBe(4);
  });

  it('heads its tooltip by the slice as written, its value by the measure’s title (AC-220)', () => {
    const option = optionFor({ ...twoDimensions, titles: { [COUNT]: 'Orders Count' } }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    // The series as ECharts names one it was given no name for.
    const seriesName = 'series\u00000';
    expect(
      option.tooltip?.formatter?.({ name: 'paid · North', seriesName, seriesIndex: 0, value: 10 }),
    ).toBe('paid · North<br/>Orders Count: 10');
  });

  it('keeps each slice’s own values apart from its name, for a click or a marking to match', () => {
    const [first] = slicesOf(twoDimensions);
    expect(first).toEqual({ name: 'paid · North', value: 10, category: 'paid', split: 'North' });
  });

  it('names a slice by every grouping its rows carry, a blank one said (T232’s review)', () => {
    const TIER = 'customers.tier';
    const three: RenderSpec = {
      ...twoDimensions,
      measures: [COUNT],
      rows: [
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'gold', [COUNT]: 10 },
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'silver', [COUNT]: 20 },
        { [STATUS]: null, [REGION]: 'South', [TIER]: 'gold', [COUNT]: 30 },
      ],
    };
    expect(slicesOf(three).map((slice) => slice.name)).toEqual([
      'paid · North · gold',
      'paid · North · silver',
      `${NO_VALUE} · South · gold`,
    ]);
    expect(seriesCount(three)).toBe(3);
  });

  it('names Top N’s "Other" by its category alone, with no empty second value', () => {
    const folded: RenderSpec = {
      ...twoDimensions,
      rows: [...twoDimensions.rows, { [STATUS]: 'Other (3)', [COUNT]: 5 }],
    };
    expect(slicesOf(folded).at(-1)?.name).toBe('Other (3)');
  });
});

describe('a pie with a blank category (T232’s review)', () => {
  it('lists it in the legend by a name, not as an empty entry', () => {
    const blank: RenderSpec = {
      chartType: 'pie',
      encoding: { x: [STATUS], y: [COUNT] },
      rows: [
        { [STATUS]: 'paid', [COUNT]: 10 },
        { [STATUS]: null, [COUNT]: 20 },
      ],
      palette: PALETTE,
    };
    const legendNames = labelsOf(renderToSvg(optionFor(blank))).map((label) => label.text);
    expect(legendNames).toContain(NO_VALUE);
    expect(slicesOf(blank).at(-1)).toEqual({ name: NO_VALUE, value: 20, category: '' });
  });
});
