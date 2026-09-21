import type { BoundedRange, MarkingSlot } from '@wechart/core';

/**
 * The coloured stripe that shows a marked range on an axis (AC-093).
 *
 * Geometry only: the conversion from axis values to pixels is ECharts'
 * `convertToPixel`, passed in by the caller, which `docs/research/echarts.md`
 * records as documented and stable. Keeping it a parameter means the stripe
 * can be tested without a chart instance — and makes the property the whole
 * criterion rests on assertable: the stripe is positioned from the range's
 * stored bounds and never from the data currently on screen.
 */
export interface AxisPixels {
  /** Where an axis value sits, in pixels along the axis. */
  readonly toPixel: (value: string | number) => number;
  /** The axis's own extent, so a stripe can be clipped to it. */
  readonly from: number;
  readonly to: number;
  readonly orientation: 'horizontal' | 'vertical';
}

export interface Stripe {
  readonly start: number;
  readonly end: number;
  readonly orientation: 'horizontal' | 'vertical';
  /** Which marking this range belongs to, so two are told apart. */
  readonly slot: MarkingSlot;
}

/**
 * The narrowest a stripe may be drawn.
 *
 * A range can be narrower than a pixel on a zoomed-out axis, and a zero-width
 * rectangle is a stripe that does not appear — which is the criterion's first
 * failing state, reached by arithmetic rather than by anyone forgetting to
 * draw it.
 */
const MIN_STRIPE_PX = 2;

/** The stripe for a range, or nothing when it lies entirely off the axis. */
export function stripeFor(range: BoundedRange, axis: AxisPixels, slot: MarkingSlot): Stripe | null {
  const [low, high] = axis.from <= axis.to ? [axis.from, axis.to] : [axis.to, axis.from];

  const a = axis.toPixel(range.from);
  const b = axis.toPixel(range.to);
  const [wanted, wantedEnd] = a <= b ? [a, b] : [b, a];

  // Entirely past one end. Clamping instead would paint a stripe at the edge
  // for a range that is not on this axis at all.
  if (wantedEnd < low || wanted > high) return null;

  const start = Math.max(wanted, low);
  const end = Math.min(wantedEnd, high);

  // Widened only when it would otherwise vanish, and away from the far edge so
  // the widening cannot push it off the axis.
  if (end - start >= MIN_STRIPE_PX) return { start, end, orientation: axis.orientation, slot };

  const widenedEnd = Math.min(start + MIN_STRIPE_PX, high);
  return {
    start: Math.max(widenedEnd - MIN_STRIPE_PX, low),
    end: widenedEnd,
    orientation: axis.orientation,
    slot,
  };
}
