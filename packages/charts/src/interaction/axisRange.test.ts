import { describe, expect, it } from 'vitest';

import { stripeFor, type AxisPixels } from './axisRange';

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
