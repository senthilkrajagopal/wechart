/**
 * T847 (AC-499): a combo's two value axes, aligned.
 *
 * Both include zero whenever either carries bars; both zero lines sit at the
 * same height whenever both ranges include zero; the right axis has as many
 * ticks as the left, each on one of the left's gridlines, and no gridlines of
 * its own. ECharts' `alignTicks` matches the tick counts but not zero
 * (research/rich-tiles-and-combo-tech.md §2), so wechart computes both axes'
 * extents and intervals itself.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { alignedAxes, type AxisExtent } from './alignedAxes';
import { optionFor } from '../optionFor';
import { comboOption } from '../series/combo';
import { labelsOf, renderToSvg } from '../testing/renderToSvg';

/** Where zero sits on an axis, as a share of its height from the bottom. */
const zeroShare = (axis: AxisExtent) => -axis.min / (axis.max - axis.min);
/** How many ticks an axis draws: its ends and every interval between. */
const ticks = (axis: AxisExtent) => Math.round((axis.max - axis.min) / axis.interval) + 1;

describe('two axes whose ranges include zero', () => {
  const { left, right } = alignedAxes(
    { min: -38_000, max: 155_000, includeZero: true },
    { min: -0.04, max: 0.38, includeZero: true },
  );

  it('gives each a nice extent covering its data', () => {
    expect(left).toEqual({ min: -50_000, max: 200_000, interval: 50_000 });
    expect(right).toEqual({ min: -0.1, max: 0.4, interval: 0.1 });
  });

  it('gives both the same share below zero, so their zero lines are level', () => {
    expect(zeroShare(left)).toBeCloseTo(0.2, 12);
    expect(zeroShare(right)).toBeCloseTo(0.2, 12);
  });

  it('gives both five intervals, six ticks', () => {
    expect(ticks(left)).toBe(6);
    expect(ticks(right)).toBe(6);
  });
});

describe('an axis whose range excludes zero', () => {
  it('keeps the right axis at 20 %…40 % when its include zero is off and only lines are drawn', () => {
    const { left, right } = alignedAxes(
      { min: 0, max: 155_000, includeZero: true },
      { min: 0.21, max: 0.39, includeZero: false },
    );

    expect(left).toEqual({ min: 0, max: 200_000, interval: 50_000 });
    expect(right).toEqual({ min: 0.2, max: 0.4, interval: 0.05 });
    expect(ticks(right)).toBe(ticks(left));
  });

  it('takes zero in where include zero is on', () => {
    const { right } = alignedAxes(
      { min: 0, max: 155_000, includeZero: true },
      { min: 0.21, max: 0.39, includeZero: true },
    );

    expect(right.min).toBe(0);
  });
});

describe('an axis of counts', () => {
  it('ticks in whole numbers', () => {
    const { right } = alignedAxes(
      { min: -38_000, max: 155_000, includeZero: true },
      { min: 0, max: 3, includeZero: true, wholeNumbers: true },
    );

    expect(Number.isInteger(right.interval)).toBe(true);
    expect(right.max).toBeGreaterThanOrEqual(3);
  });
});

describe('over 500 random pairs whose ranges include zero', () => {
  /** A small seeded generator (mulberry32), so a failure can be replayed. */
  const random = (() => {
    let seed = 847;
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  /** A range including zero, of any magnitude from thousandths to millions. */
  const range = () => {
    const scale = 10 ** Math.floor(random() * 10 - 3);
    const below = random() < 0.3 ? 0 : random() * scale;
    const above = random() < 0.1 ? 0 : random() * scale * 4;
    return { min: -below, max: above === 0 && below === 0 ? scale : above, includeZero: true };
  };

  it('puts zero at the same height on both, gives both as many ticks, and covers the data', () => {
    for (let pair = 0; pair < 500; pair += 1) {
      const [a, b] = [range(), range()];
      const { left, right } = alignedAxes(a, b);

      expect(Math.abs(zeroShare(left) - zeroShare(right))).toBeLessThan(1e-9);
      expect(ticks(left)).toBe(ticks(right));
      expect(left.min).toBeLessThanOrEqual(a.min);
      expect(left.max).toBeGreaterThanOrEqual(a.max);
      expect(right.min).toBeLessThanOrEqual(b.min);
      expect(right.max).toBeGreaterThanOrEqual(b.max);
      // Each extent is a whole number of its intervals.
      expect(Math.abs((left.max - left.min) / left.interval - (ticks(left) - 1))).toBeLessThan(
        1e-9,
      );
    }
  });
});

/**
 * T847's review: where the zeros can't meet, the right axis still takes the
 * left's tick count and covers its data, for any pair, counts included. A
 * left axis of one whole-number interval once left no right interval that
 * could cover a range across zero, and the search never ended.
 */
describe('over 500 random pairs, any range, counts too', () => {
  const random = (() => {
    let seed = 8471;
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const range = () => {
    const wholeNumbers = random() < 0.4;
    const scale = wholeNumbers
      ? 10 ** Math.floor(random() * 4)
      : 10 ** Math.floor(random() * 10 - 3);
    const at = (random() - 0.4) * scale * 4;
    const span = random() < 0.2 ? (wholeNumbers ? 1 : scale / 7) : random() * scale * 3;
    const [min, max] = wholeNumbers
      ? [Math.round(at), Math.round(at) + Math.max(0, Math.round(span))]
      : [at, at + span];
    return { min, max, includeZero: random() < 0.3, wholeNumbers };
  };

  it('ends, covers the data, and gives both axes as many ticks', () => {
    for (let pair = 0; pair < 500; pair += 1) {
      const [a, b] = [range(), range()];
      const { left, right } = alignedAxes(a, b);

      expect(ticks(left)).toBe(ticks(right));
      expect(ticks(left)).toBeGreaterThanOrEqual(3);
      expect(left.min).toBeLessThanOrEqual(a.min);
      expect(left.max).toBeGreaterThanOrEqual(a.max);
      expect(right.min).toBeLessThanOrEqual(b.min);
      expect(right.max).toBeGreaterThanOrEqual(b.max);
      if (a.wholeNumbers) expect(Number.isInteger(left.interval)).toBe(true);
      if (b.wholeNumbers) expect(Number.isInteger(right.interval)).toBe(true);
    }
  });

  it('ends for a left axis of counts one apart beside a right range across zero', () => {
    const { left, right } = alignedAxes(
      { min: 5, max: 6, includeZero: false, wholeNumbers: true },
      { min: -3, max: 12, includeZero: true, wholeNumbers: true },
    );

    expect(ticks(right)).toBe(ticks(left));
    expect(right.min).toBeLessThanOrEqual(-3);
    expect(right.max).toBeGreaterThanOrEqual(12);
  });
});

describe('a combo drawn on two axes (AC-499)', () => {
  const MONTH = 'orders.month';
  const REVENUE = 'orders.revenue';
  const MARGIN = 'orders.margin_pct';
  const rows = [
    { [MONTH]: 'Jan', [REVENUE]: 120_000, [MARGIN]: 0.21 },
    { [MONTH]: 'Feb', [REVENUE]: 155_000, [MARGIN]: 0.39 },
  ];
  const combo = (options: Record<string, unknown>): RenderSpec => ({
    chartType: 'combo',
    encoding: { x: [MONTH], y: [REVENUE, MARGIN] },
    rows,
    options,
  });
  type Axis = { min?: number; max?: number; interval?: number; splitLine?: { show?: boolean } };
  const axesOf = (spec: RenderSpec) => comboOption(spec)['yAxis'] as Axis[];

  it('includes zero on both while either carries bars, though the right asks for none', () => {
    const [left, right] = axesOf(
      combo({
        series: { [MARGIN]: { axis: 'right' } },
        axes: { y: { includeZero: false }, right: { includeZero: false } },
      }),
    );

    expect(left?.min).toBe(0);
    expect(right?.min).toBe(0);
  });

  it('keeps the right axis to its data with lines only and include zero off there', () => {
    const [left, right] = axesOf(
      combo({
        series: { [REVENUE]: { mark: 'line' }, [MARGIN]: { axis: 'right' } },
        axes: { right: { includeZero: false } },
      }),
    );

    expect(left?.min).toBe(0);
    expect(right?.min).toBeGreaterThan(0);
  });

  it('draws gridlines for the left axis only', () => {
    const [left, right] = axesOf(combo({ series: { [MARGIN]: { axis: 'right' } } }));

    expect(right?.splitLine?.show).toBe(false);
    expect(left?.splitLine?.show).not.toBe(false);
  });

  it('draws each right tick level with a left tick, zero with zero, in the SVG', () => {
    const spec: RenderSpec = {
      ...combo({ series: { [MARGIN]: { axis: 'right' } } }),
      rows: [
        { [MONTH]: 'Jan', [REVENUE]: -38_000, [MARGIN]: -0.04 },
        { [MONTH]: 'Feb', [REVENUE]: 155_000, [MARGIN]: 0.38 },
      ],
      formats: { [MARGIN]: 'percent' },
    };
    const labels = labelsOf(renderToSvg(optionFor(spec)));
    const side = (onLeft: boolean) =>
      labels
        .filter((label) => /\d/.test(label.text) && (onLeft ? label.x < 100 : label.x > 540))
        .sort((a, b) => a.y - b.y);
    const [left, right] = [side(true), side(false)];

    expect(left.length).toBeGreaterThan(2);
    expect(right).toHaveLength(left.length);
    right.forEach((tick, at) =>
      expect(Math.abs(tick.y - (left[at]?.y ?? NaN))).toBeLessThanOrEqual(1),
    );
    const zeroOf = (ticks: typeof left) => ticks.find((tick) => /^0\D*$/.test(tick.text))?.y;
    expect(zeroOf(left)).toBeDefined();
    expect(Math.abs((zeroOf(left) ?? NaN) - (zeroOf(right) ?? NaN))).toBeLessThanOrEqual(1);
  });

  it('gives both axes as many ticks, their zero lines level', () => {
    const [left, right] = axesOf(combo({ series: { [MARGIN]: { axis: 'right' } } }));
    const extent = (axis: Axis | undefined): AxisExtent => ({
      min: axis?.min ?? NaN,
      max: axis?.max ?? NaN,
      interval: axis?.interval ?? NaN,
    });

    expect(ticks(extent(left))).toBe(ticks(extent(right)));
    expect(zeroShare(extent(left))).toBeCloseTo(zeroShare(extent(right)), 9);
  });
});
