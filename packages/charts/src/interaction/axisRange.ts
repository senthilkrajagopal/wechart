import { rangeEndOf, type BoundedRange, type MarkingSlot } from '@wechart/core';

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

/**
 * A category axis of time buckets (T386): wechart draws a time dimension one
 * band per bucket, in order, so a range is the buckets between its bounds.
 */
export interface BucketAxis {
  /** The buckets, in the axis's order: Cube's own timestamps, which sort as text. */
  readonly categories: readonly string[];
  /** Where a bucket's band is centred, in pixels along the axis: ECharts' `convertToPixel`. */
  readonly centreOf: (index: number) => number;
  /** The grid's span along the axis, which the first and last bands reach. */
  readonly extent: { readonly from: number; readonly to: number };
  readonly orientation: 'horizontal' | 'vertical';
}

/**
 * The stripe for a range over buckets (T386, AC-093): from the edge of the
 * first bucket inside its bounds to the edge of the last, or nothing when no
 * bucket on the axis is inside them. From the stored bounds alone, so a
 * filter that takes buckets away shortens the stripe to those left inside,
 * and never moves the bounds.
 */
export function bucketStripeFor(
  range: BoundedRange,
  axis: BucketAxis,
  slot: MarkingSlot,
): Stripe | null {
  // To the end of its last bucket, at the grain it was marked at, as the rows
  // it marks and the filter it becomes reach (T386's review).
  const [low, high] = [String(range.from), String(rangeEndOf(range))];
  const { categories, centreOf, extent } = axis;
  const inside = categories.flatMap((bucket, index) =>
    bucket >= low && bucket <= high ? [index] : [],
  );
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (first === undefined || last === undefined) return null;
  // Each band reaches halfway to its neighbours, the outer ones to the grid.
  const before = first === 0 ? extent.from : (centreOf(first - 1) + centreOf(first)) / 2;
  const after =
    last === categories.length - 1 ? extent.to : (centreOf(last) + centreOf(last + 1)) / 2;
  return {
    start: Math.min(before, after),
    end: Math.max(before, after),
    orientation: axis.orientation,
    slot,
  };
}

/**
 * The buckets under a drag's two ends (T386): the categories at the indices
 * ECharts' `convertFromPixel` reads there, rounded and kept on the axis, the
 * lower first. Nothing on an axis with no buckets.
 */
export function bucketRangeAt(
  categories: readonly string[],
  fromIndex: number,
  toIndex: number,
): { from: string; to: string } | undefined {
  if (categories.length === 0 || !Number.isFinite(fromIndex) || !Number.isFinite(toIndex))
    return undefined;
  const onAxis = (index: number) => Math.min(categories.length - 1, Math.max(0, Math.round(index)));
  const [a, b] = [onAxis(fromIndex), onAxis(toIndex)];
  return { from: categories[Math.min(a, b)]!, to: categories[Math.max(a, b)]! };
}

/**
 * The last pixel still inside something, found between one pixel inside it
 * and one outside, by halving (T386): where the grid ends, from the chart's
 * documented `containPixel` (research/echarts.md), for the axis a stripe runs
 * along.
 */
export function edgeBetween(
  isInside: (at: number) => boolean,
  inside: number,
  outside: number,
): number {
  let [lo, hi] = [inside, outside];
  while (Math.abs(hi - lo) > 1) {
    const mid = Math.round((lo + hi) / 2);
    if (isInside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

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
