import { describe, expect, it } from 'vitest';

import {
  bucketRangeAt,
  bucketStripeFor,
  edgeBetween,
  stripeFor,
  type AxisPixels,
  type BucketAxis,
} from './axisRange';

/**
 * T099 / AC-093, the visible half: "show it as a coloured stripe on that
 * axis".
 * `Fails when: the stripe does not appear, or the bounds move when a filter
 * changes.`
 *
 * The stripe is geometry, so it is computed here and drawn at the call site.
 * The converter is passed in — it is ECharts' `convertToPixel` in the running
 * chart — which keeps this testable without a chart instance and makes the
 * one thing worth asserting assertable: the stripe is positioned from the
 * range's stored bounds, never from the data currently on screen.
 */
const axis: AxisPixels = {
  // A linear axis where value 0 sits at pixel 100 and value 10 at pixel 500.
  toPixel: (value) => 100 + Number(value) * 40,
  from: 100,
  to: 500,
  orientation: 'horizontal',
};

describe('the stripe that shows a marked range', () => {
  it('spans the range, in pixels', () => {
    const stripe = stripeFor({ member: 'orders.count', from: 2, to: 8 }, axis, 'mk1');

    expect(stripe).toEqual({ start: 180, end: 420, orientation: 'horizontal', slot: 'mk1' });
  });

  it('wears the marking colour it belongs to', () => {
    // Four marking slots, and the stripe has to say which marking it is — two
    // markings with ranges on one axis would otherwise be indistinguishable.
    expect(stripeFor({ member: 'orders.count', from: 2, to: 8 }, axis, 'mk3')?.slot).toBe('mk3');
  });

  it('is clipped to the axis rather than drawn off the end of it', () => {
    // A range can extend past what the axis currently shows, because the
    // bounds do not move when filters do. The stripe stops at the axis.
    const stripe = stripeFor({ member: 'orders.count', from: -5, to: 50 }, axis, 'mk1');

    expect(stripe).toEqual({ start: 100, end: 500, orientation: 'horizontal', slot: 'mk1' });
  });

  it('appears even when the range is narrower than a pixel', () => {
    /**
     * The criterion's first failing state is "the stripe does not appear", and
     * a zero-width rectangle is a stripe that does not appear. A range marked
     * on a zoomed-out axis can round to nothing, and the user would be looking
     * at a marking with no sign of itself.
     */
    const stripe = stripeFor({ member: 'orders.count', from: 5, to: 5 }, axis, 'mk1');

    expect(stripe).not.toBeNull();
    expect((stripe?.end ?? 0) - (stripe?.start ?? 0)).toBeGreaterThan(0);
  });

  it('is nothing when the range lies entirely off the axis', () => {
    // Off the end in one direction: there is nothing to draw, and clamping
    // would paint a stripe at the edge for a range that is not there.
    expect(stripeFor({ member: 'orders.count', from: 20, to: 30 }, axis, 'mk1')).toBeNull();
  });

  it('runs the other way on a vertical axis', () => {
    const vertical: AxisPixels = { ...axis, orientation: 'vertical' };

    expect(
      stripeFor({ member: 'orders.count', from: 2, to: 8 }, vertical, 'mk1')?.orientation,
    ).toBe('vertical');
  });

  it('is positioned from the stored bounds, not from what is on screen', () => {
    // The same range against the same axis gives the same stripe, whatever
    // rows happen to be in the result. Stated here because it is the property
    // the whole criterion rests on.
    const range = { member: 'orders.count', from: 2, to: 8 };

    expect(stripeFor(range, axis, 'mk1')).toEqual(stripeFor(range, axis, 'mk1'));
  });
});

/**
 * T386, AC-093 on wechart's charts: a time dimension is drawn on a category
 * axis, one band per bucket, so a range is the buckets between its bounds and
 * its stripe runs from the first one's edge to the last one's.
 */
const MONTHS = ['2026-01-01T00:00:00.000', '2026-02-01T00:00:00.000', '2026-03-01T00:00:00.000'];
const months = (categories: readonly string[] = MONTHS): BucketAxis => ({
  categories,
  // Bands of 100 px from 50, each category at its band's centre.
  centreOf: (index) => 100 + index * 100,
  extent: { from: 50, to: 50 + categories.length * 100 },
  orientation: 'horizontal',
});

describe('a range over the buckets of a category axis (T386)', () => {
  it('stripes the buckets it covers, from the first one’s edge to the last one’s', () => {
    const range = {
      member: 'orders.ordered_at',
      granularity: 'month',
      from: MONTHS[0]!,
      to: MONTHS[1]!,
    };
    expect(bucketStripeFor(range, months(), 'mk2')).toEqual({
      start: 50,
      end: 250,
      orientation: 'horizontal',
      slot: 'mk2',
    });
  });

  it('keeps its bounds when a filter takes buckets away: it stripes those still inside them', () => {
    // January to March marked, then a filter leaves only February and April.
    const range = { member: 'orders.ordered_at', from: MONTHS[0]!, to: MONTHS[2]! };
    const filtered = months(['2026-02-01T00:00:00.000', '2026-04-01T00:00:00.000']);
    expect(bucketStripeFor(range, filtered, 'mk1')).toEqual({
      start: 50,
      end: 150,
      orientation: 'horizontal',
      slot: 'mk1',
    });
    // And nothing where no bucket is left inside them.
    expect(bucketStripeFor(range, months(['2026-05-01T00:00:00.000']), 'mk1')).toBeNull();
  });

  it('reaches the end of its last bucket at the grain it was marked at (T386’s review)', () => {
    // January to February by month, drawn on a tile by day.
    const days = months([
      '2026-01-31T00:00:00.000',
      '2026-02-01T00:00:00.000',
      '2026-02-28T00:00:00.000',
      '2026-03-01T00:00:00.000',
    ]);
    const range = {
      member: 'orders.ordered_at',
      granularity: 'month',
      from: '2026-01-01T00:00:00.000',
      to: '2026-02-01T00:00:00.000',
    };
    // Every day of it, February's last included: the first three bands.
    expect(bucketStripeFor(range, days, 'mk1')).toEqual({
      start: 50,
      end: 350,
      orientation: 'horizontal',
      slot: 'mk1',
    });
  });

  it('gives a lone bucket the whole axis', () => {
    const range = { member: 'orders.ordered_at', from: MONTHS[1]!, to: MONTHS[1]! };
    expect(bucketStripeFor(range, months([MONTHS[1]!]), 'mk1')).toEqual({
      start: 50,
      end: 150,
      orientation: 'horizontal',
      slot: 'mk1',
    });
  });

  it('reads a drag as the buckets under its two ends, either way round, within the axis', () => {
    expect(bucketRangeAt(MONTHS, 0.2, 1.4)).toEqual({ from: MONTHS[0], to: MONTHS[1] });
    // Right to left, and past both ends.
    expect(bucketRangeAt(MONTHS, 7, -3)).toEqual({ from: MONTHS[0], to: MONTHS[2] });
    expect(bucketRangeAt([], 0, 1)).toBeUndefined();
    // An end the chart couldn't place is no range (T386's review).
    expect(bucketRangeAt(MONTHS, Number.NaN, 1)).toBeUndefined();
  });
});

describe('where a grid ends, from the chart’s own containPixel (T386)', () => {
  it('finds the last pixel inside, between one inside and one outside', () => {
    // A grid from 40 to 260 px down the canvas.
    const inside = (y: number) => y >= 40 && y <= 260;
    expect(edgeBetween(inside, 150, 320)).toBe(260);
    expect(edgeBetween(inside, 150, 0)).toBe(40);
  });
});
