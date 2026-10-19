/**
 * A combo's two value axes, aligned (AC-499, rule 118), or synchronized into
 * one scale (AC-501).
 *
 * ECharts' `alignTicks` gives the aligned axis the reference axis's number of
 * segments, but doesn't put the two zero lines at one height (research/
 * rich-tiles-and-combo-tech.md §2, apache/echarts#16154, #18541). So wechart
 * computes both axes' extents and intervals here and hands ECharts fixed
 * `min`, `max` and `interval`: an explicit `interval` is used as given
 * (research/echarts-axis-legend-bars.md §1), and with each extent a whole
 * number of its intervals the ticks fall at its ends and evenly between.
 *
 * - **Synchronized** (AC-501): one nice extent covering both axes' data, the
 *   left's fixed ends kept and the right's dropped, drawn on both sides.
 * - **Both ranges include zero:** both axes get `n` intervals, `k` of them
 *   below zero, so zero sits at `k / n` of each axis's height. `n` and `k`
 *   are chosen, near the target count, to waste the least height across the
 *   two (a wechart algorithm; no third-party source).
 * - **Otherwise** (lines only, an axis's include zero off and its data clear
 *   of zero, or fixed ends zero can't be levelled with): the left axis takes
 *   its own nice extent, and the right axis as many intervals, so each right
 *   tick lies on a left gridline, though the zeros can't then meet.
 *
 * A minimum or maximum set in Customize (decision T846-2, T849) ends its axis
 * exactly as typed: its intervals are then whatever divides the fixed span
 * into the shared count, not a nice step.
 */

/** One axis's data, before it is made nice. */
export interface AxisRange {
  readonly min: number;
  readonly max: number;
  /** Whether the axis must reach zero: forced while bars are drawn (AC-499). */
  readonly includeZero: boolean;
  /** Counts alone: whole-number intervals only (T683, DSH-02). */
  readonly wholeNumbers?: boolean;
  /** A minimum set in Customize: the axis starts here, as typed (AC-219). */
  readonly fixedMin?: number;
  /** A maximum set in Customize: the axis ends here, as typed (AC-219). */
  readonly fixedMax?: number;
}

/** An axis as drawn: its ends and the step between its ticks. */
export interface AxisExtent {
  readonly min: number;
  readonly max: number;
  readonly interval: number;
}

export interface AlignOptions {
  /** ECharts' target count of intervals. */
  readonly splitNumber?: number;
  /** Synchronize axes (AC-501): one scale on both sides. */
  readonly synchronize?: boolean;
}

/** ECharts' own target, five intervals (`splitNumber`; echarts-axis-legend-bars.md §1). */
const SPLIT_NUMBER = 5;

/** The mantissas a nice interval is made of. */
const NICE = [1, 2, 2.5, 5, 10];

/** A number rid of floating-point dust: 0.30000000000000004 is 0.3. */
const clean = (value: number) => Number(value.toPrecision(12));

/** The smallest nice interval at least `value`, a whole number where asked. */
function niceAtLeast(value: number, wholeNumbers = false): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const exponent = Math.floor(Math.log10(value));
  // Every finite value is reached by 10 × 10ⁿ within a decade or two.
  for (let power = exponent; power <= exponent + 2; power += 1) {
    for (const mantissa of NICE) {
      const nice = clean(mantissa * 10 ** power);
      if (nice >= value * (1 - 1e-12) && (!wholeNumbers || Number.isInteger(nice))) return nice;
    }
  }
  return wholeNumbers ? Math.ceil(value) : value;
}

/** The ends set in Customize that an axis keeps: both only where they make a range. */
interface Fixed {
  readonly min?: number;
  readonly max?: number;
}

function fixedOf(range: AxisRange): Fixed {
  const min = Number.isFinite(range.fixedMin) ? range.fixedMin : undefined;
  const max = Number.isFinite(range.fixedMax) ? range.fixedMax : undefined;
  // A minimum at or above the maximum makes no axis: neither is kept.
  if (min !== undefined && max !== undefined && min >= max) return {};
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

interface Cover {
  readonly min: number;
  readonly max: number;
}

/**
 * The range the axis must cover: its data, with zero where asked, never
 * empty; a fixed end replaces the data's, zero or no zero, as it does on a
 * single axis (`applyAxes`).
 */
function coverOf(range: AxisRange, fixed: Fixed): Cover {
  const finite = Number.isFinite(range.min) && Number.isFinite(range.max);
  let min = finite ? Math.min(range.min, range.max) : 0;
  let max = finite ? Math.max(range.min, range.max) : 0;
  if (range.includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (fixed.min !== undefined) min = fixed.min;
  if (fixed.max !== undefined) max = fixed.max;
  if (min > max) {
    // One fixed end past the data's other: the data's end gives way.
    if (fixed.min !== undefined) max = min;
    else min = max;
  }
  // One value: zero to one, or half the value either side of it (with zero
  // in, one value other than zero already spans a range).
  if (min === max) {
    const half = Math.abs(min) / 2 || 1;
    if (fixed.min !== undefined) return { min, max: min + (min === 0 ? 1 : half * 2) };
    if (fixed.max !== undefined) return { min: max - (max === 0 ? 1 : half * 2), max };
    return min === 0 ? { min: 0, max: 1 } : { min: min - half, max: max + half };
  }
  return { min, max };
}

const includesZero = ({ min, max }: Cover) => min <= 0 && max >= 0;

/** `n` intervals of `interval` from `min`. */
const extentOf = (min: number, interval: number, n: number): AxisExtent => ({
  min: clean(min),
  max: clean(min + n * interval),
  interval,
});

/** An axis's settings as the alignment reads them. */
interface Side {
  readonly range: AxisRange;
  readonly fixed: Fixed;
  readonly cover: Cover;
}

const sideOf = (range: AxisRange): Side => {
  const fixed = fixedOf(range);
  return { range, fixed, cover: coverOf(range, fixed) };
};

/**
 * One axis's interval with `k` of `n` intervals below zero, or none where
 * that can't cover its range or meet its fixed ends.
 */
function zeroStep({ range, fixed, cover }: Side, n: number, k: number): number | undefined {
  const below = -cover.min;
  const above = cover.max;
  if ((below > 0 && k === 0) || (above > 0 && k === n)) return undefined;
  const span = above + below;
  if (fixed.min !== undefined && fixed.max !== undefined) {
    const interval = span / n;
    return Math.abs(k * interval - below) <= 1e-9 * span ? interval : undefined;
  }
  if (fixed.max !== undefined && k < n) {
    const interval = above / (n - k);
    return k * interval >= below * (1 - 1e-12) ? interval : undefined;
  }
  if (fixed.min !== undefined && k > 0) {
    const interval = below / k;
    return (n - k) * interval >= above * (1 - 1e-12) ? interval : undefined;
  }
  return niceAtLeast(
    Math.max(k === 0 ? 0 : below / k, k === n ? 0 : above / (n - k)),
    range.wholeNumbers,
  );
}

/** Both axes with zero at the same height: `k` of `n` intervals below it, or none can. */
function zeroAligned(
  sides: readonly [Side, Side],
  splitNumber: number,
): [AxisExtent, AxisExtent] | undefined {
  let best: { cost: number; n: number; k: number; intervals: number[] } | undefined;
  for (let n = Math.max(2, splitNumber - 2); n <= splitNumber + 2; n += 1) {
    for (let k = 0; k <= n; k += 1) {
      const intervals: number[] = [];
      let cost = 0.05 * Math.abs(n - splitNumber);
      for (const side of sides) {
        const interval = zeroStep(side, n, k);
        if (interval === undefined) {
          cost = Infinity;
          break;
        }
        intervals.push(interval);
        // The share of the axis's height the data leaves empty.
        cost += (n * interval) / (side.cover.max - side.cover.min);
      }
      if (cost < (best?.cost ?? Infinity)) best = { cost, n, k, intervals };
    }
  }
  if (best === undefined) return undefined;
  const { n, k, intervals } = best;
  const [left = 1, right = 1] = intervals;
  return [extentOf(-k * left, left, n), extentOf(-k * right, right, n)];
}

/**
 * An axis in exactly `n` intervals covering its range: its fixed ends as
 * typed, otherwise the smallest nice interval whose multiples cover it.
 */
function fitted({ range, fixed, cover }: Side, n: number): AxisExtent {
  if (fixed.min !== undefined && fixed.max !== undefined) {
    return { min: fixed.min, max: fixed.max, interval: (fixed.max - fixed.min) / n };
  }
  if (fixed.min !== undefined) {
    return extentOf(fixed.min, niceAtLeast((cover.max - fixed.min) / n, range.wholeNumbers), n);
  }
  if (fixed.max !== undefined) {
    const interval = niceAtLeast((fixed.max - cover.min) / n, range.wholeNumbers);
    return { min: clean(fixed.max - n * interval), max: fixed.max, interval };
  }
  let interval = niceAtLeast((cover.max - cover.min) / n, range.wholeNumbers);
  for (;;) {
    const min = Math.floor(clean(cover.min / interval)) * interval;
    if (clean(min + n * interval) >= cover.max) return extentOf(min, interval, n);
    interval = niceAtLeast(interval * (1 + 1e-9), range.wholeNumbers);
  }
}

/** An axis's own extent, its count of intervals its own: what the other then follows. */
function ownExtent(side: Side, splitNumber: number): AxisExtent {
  const { cover, range, fixed } = side;
  if (fixed.min !== undefined && fixed.max !== undefined) return fitted(side, splitNumber);
  const interval = niceAtLeast((cover.max - cover.min) / splitNumber, range.wholeNumbers);
  // A fixed end is a tick as typed, and the intervals run from it.
  if (fixed.max !== undefined) {
    const n = Math.max(2, Math.ceil(clean((fixed.max - cover.min) / interval)));
    return { min: clean(fixed.max - n * interval), max: fixed.max, interval };
  }
  const min = fixed.min ?? Math.floor(clean(cover.min / interval)) * interval;
  /**
   * At least two intervals (T847's review): with one, a right range across
   * zero has no interval that covers it — its foot is −I and its top 0 for
   * every I past its own foot — and the search in `fitted` would never end.
   * With two, I at least the larger of its two sides always does.
   */
  const n = Math.max(2, Math.ceil(clean((cover.max - min) / interval)));
  return extentOf(min, interval, n);
}

/** The left axis's own extent, and the right in as many intervals. */
function gridAligned(sides: readonly [Side, Side], splitNumber: number): [AxisExtent, AxisExtent] {
  const left = ownExtent(sides[0], splitNumber);
  const n = Math.round((left.max - left.min) / left.interval);
  return [left, fitted(sides[1], n)];
}

/**
 * One scale for both (AC-501): both axes' data, either's need of zero, and
 * the left's fixed ends; the right's are dropped, since it follows the left.
 */
function synchronized(left: AxisRange, right: AxisRange, splitNumber: number): AxisExtent {
  const finite = (range: AxisRange) => Number.isFinite(range.min) && Number.isFinite(range.max);
  const ranges = [left, right].filter(finite);
  const shared: AxisRange = {
    min: ranges.length === 0 ? 0 : Math.min(...ranges.map((range) => range.min)),
    max: ranges.length === 0 ? 0 : Math.max(...ranges.map((range) => range.max)),
    includeZero: left.includeZero || right.includeZero,
    wholeNumbers: left.wholeNumbers === true && right.wholeNumbers === true,
    ...(left.fixedMin === undefined ? {} : { fixedMin: left.fixedMin }),
    ...(left.fixedMax === undefined ? {} : { fixedMax: left.fixedMax }),
  };
  return ownExtent(sideOf(shared), splitNumber);
}

/**
 * Both axes' extents: the right's ticks on the left's gridlines, and their
 * zero lines level wherever both ranges include zero (AC-499); or, while
 * synchronized, one extent for both (AC-501).
 */
export function alignedAxes(
  left: AxisRange,
  right: AxisRange,
  { splitNumber = SPLIT_NUMBER, synchronize = false }: AlignOptions = {},
): { left: AxisExtent; right: AxisExtent } {
  if (synchronize) {
    const one = pinned(synchronized(left, right, splitNumber), fixedOf(left));
    return { left: one, right: one };
  }
  const sides = [sideOf(left), sideOf(right)] as const;
  const [l, r] =
    (includesZero(sides[0].cover) && includesZero(sides[1].cover)
      ? zeroAligned(sides, splitNumber)
      : undefined) ?? gridAligned(sides, splitNumber);
  return { left: pinned(l, sides[0].fixed), right: pinned(r, sides[1].fixed) };
}

/** A log axis's data: its values above zero, the only ones it draws (AC-502). */
export interface LogRange {
  /** The smallest value above zero, or none. */
  readonly min: number | undefined;
  /** The largest value above zero, or none. */
  readonly max: number | undefined;
  readonly fixedMin?: number;
  readonly fixedMax?: number;
}

/** A log axis as drawn: its ends, ECharts choosing ticks at powers of ten. */
export interface LogExtent {
  readonly min: number;
  readonly max: number;
}

/** The whole decades a log axis's data spans: `lo` to `hi`, at least one. */
function decadesOf(range: LogRange): { lo: number; hi: number } {
  const { min, max } = range;
  if (min === undefined || max === undefined || !(min > 0) || !(max > 0)) return { lo: 0, hi: 1 };
  const lo = Math.floor(clean(Math.log10(min)));
  const hi = Math.max(lo + 1, Math.ceil(clean(Math.log10(max))));
  return { lo, hi };
}

const power = (exponent: number) => clean(10 ** exponent);

/** A fixed end above zero as typed, which a log axis can draw. */
function logPinned(extent: LogExtent, range: LogRange): LogExtent {
  const fixedMin = (range.fixedMin ?? 0) > 0 ? range.fixedMin : undefined;
  const fixedMax = (range.fixedMax ?? 0) > 0 ? range.fixedMax : undefined;
  const min = fixedMin ?? extent.min;
  const max = fixedMax ?? extent.max;
  return min < max ? { min, max } : extent;
}

/**
 * Two log axes, ticks aligned (AC-502): ECharts ticks a log axis at powers of
 * its base, one decade apart while it spans fewer than ten, and ten apart up
 * to a hundred (`max(quantity(span), 1)` decades: research/
 * echarts-axis-legend-bars.md, "type: 'log'"). So each axis is given whole
 * decades from its own lowest, both as many as the wider needs, and each
 * right tick then lies on a left one. Synchronized, both take one extent over
 * both axes' data (AC-501). A fixed end above zero is kept as typed (T846-2),
 * which can put its ticks off the other's; one at or below zero is ignored.
 */
export function alignedLogAxes(
  left: LogRange,
  right: LogRange,
  { synchronize = false }: Pick<AlignOptions, 'synchronize'> = {},
): { left: LogExtent; right: LogExtent } {
  const [l, r] = [decadesOf(left), decadesOf(right)];
  if (synchronize) {
    const has = (range: LogRange) => range.min !== undefined && range.max !== undefined;
    const both = has(left) && has(right);
    const lo = both ? Math.min(l.lo, r.lo) : has(right) ? r.lo : l.lo;
    const hi = both ? Math.max(l.hi, r.hi) : has(right) ? r.hi : l.hi;
    const one = logPinned({ min: power(lo), max: power(hi) }, left);
    return { left: one, right: one };
  }
  /**
   * Past ten decades ECharts steps `quantity(span)` decades at a time, from
   * multiples of the step (T850's review): both axes then start on one.
   */
  const span = Math.max(l.hi - l.lo, r.hi - r.lo);
  const step = span >= 10 ? 10 ** Math.floor(Math.log10(span)) : 1;
  const [leftLo, rightLo] = [l.lo, r.lo].map((lo) => Math.floor(lo / step) * step) as [
    number,
    number,
  ];
  const n = Math.ceil(Math.max(l.hi - leftLo, r.hi - rightLo) / step) * step;
  return {
    left: logPinned({ min: power(leftLo), max: power(leftLo + n) }, left),
    right: logPinned({ min: power(rightLo), max: power(rightLo + n) }, right),
  };
}

/** A fixed end exactly as typed, where the arithmetic left it a hair off. */
const pinned = (extent: AxisExtent, fixed: Fixed): AxisExtent => ({
  ...extent,
  ...(fixed.min === undefined ? {} : { min: fixed.min }),
  ...(fixed.max === undefined ? {} : { max: fixed.max }),
});
