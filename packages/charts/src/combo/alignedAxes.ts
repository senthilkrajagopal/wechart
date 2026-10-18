/**
 * A combo's two value axes, aligned (AC-499, rule 118).
 *
 * ECharts' `alignTicks` gives the aligned axis the reference axis's number of
 * segments, but doesn't put the two zero lines at one height (research/
 * rich-tiles-and-combo-tech.md §2, apache/echarts#16154, #18541). So wechart
 * computes both axes' extents and intervals here and hands ECharts fixed
 * `min`, `max` and `interval`: an explicit `interval` is used as given
 * (research/echarts-axis-legend-bars.md §1), and with each extent a whole
 * number of its intervals the ticks fall at its ends and evenly between.
 *
 * - **Both ranges include zero:** both axes get `n` intervals, `k` of them
 *   below zero, so zero sits at `k / n` of each axis's height. `n` and `k`
 *   are chosen, near the target count, to waste the least height across the
 *   two (a wechart algorithm; no third-party source).
 * - **Otherwise** (lines only, an axis's include zero off and its data clear
 *   of zero): the left axis takes its own nice extent, and the right axis as
 *   many intervals, each one nice, so each right tick lies on a left
 *   gridline, though the zeros can't then meet.
 */

/** One axis's data, before it is made nice. */
export interface AxisRange {
  readonly min: number;
  readonly max: number;
  /** Whether the axis must reach zero: forced while bars are drawn (AC-499). */
  readonly includeZero: boolean;
  /** Counts alone: whole-number intervals only (T683, DSH-02). */
  readonly wholeNumbers?: boolean;
}

/** An axis as drawn: its ends and the step between its ticks. */
export interface AxisExtent {
  readonly min: number;
  readonly max: number;
  readonly interval: number;
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

/** The range the axis must cover: its data, with zero where asked, never empty. */
function coverOf(range: AxisRange): { min: number; max: number } {
  const finite = Number.isFinite(range.min) && Number.isFinite(range.max);
  let min = finite ? Math.min(range.min, range.max) : 0;
  let max = finite ? Math.max(range.min, range.max) : 0;
  if (range.includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  // One value: zero to one, or half the value either side of it (with zero
  // in, one value other than zero already spans a range).
  if (min === max) {
    const half = Math.abs(min) / 2;
    return min === 0 ? { min: 0, max: 1 } : { min: min - half, max: max + half };
  }
  return { min, max };
}

const includesZero = ({ min, max }: { min: number; max: number }) => min <= 0 && max >= 0;

/** `n` intervals of `interval` from `min`. */
const extentOf = (min: number, interval: number, n: number): AxisExtent => ({
  min: clean(min),
  max: clean(min + n * interval),
  interval,
});

/** Both axes with zero at the same height: `k` of `n` intervals below it. */
function zeroAligned(
  ranges: readonly [AxisRange, AxisRange],
  covers: readonly [{ min: number; max: number }, { min: number; max: number }],
  splitNumber: number,
): [AxisExtent, AxisExtent] {
  let best: { cost: number; n: number; k: number; intervals: number[] } | undefined;
  for (let n = Math.max(2, splitNumber - 2); n <= splitNumber + 2; n += 1) {
    for (let k = 0; k <= n; k += 1) {
      const intervals: number[] = [];
      let cost = 0.05 * Math.abs(n - splitNumber);
      for (const [index, cover] of covers.entries()) {
        const below = -cover.min;
        const above = cover.max;
        if ((below > 0 && k === 0) || (above > 0 && k === n)) {
          cost = Infinity;
          break;
        }
        const step = Math.max(k === 0 ? 0 : below / k, k === n ? 0 : above / (n - k));
        const interval = niceAtLeast(step, ranges[index]?.wholeNumbers);
        intervals.push(interval);
        // The share of the axis's height the data leaves empty.
        cost += (n * interval) / (above + below);
      }
      if (cost < (best?.cost ?? Infinity)) best = { cost, n, k, intervals };
    }
  }
  const { n, k, intervals } = best!;
  const [left = 1, right = 1] = intervals;
  return [extentOf(-k * left, left, n), extentOf(-k * right, right, n)];
}

/** The left axis's own nice extent, and the right in as many nice intervals. */
function gridAligned(
  ranges: readonly [AxisRange, AxisRange],
  covers: readonly [{ min: number; max: number }, { min: number; max: number }],
  splitNumber: number,
): [AxisExtent, AxisExtent] {
  const [leftCover, rightCover] = covers;
  const leftInterval = niceAtLeast(
    (leftCover.max - leftCover.min) / splitNumber,
    ranges[0].wholeNumbers,
  );
  const leftMin = Math.floor(clean(leftCover.min / leftInterval)) * leftInterval;
  /**
   * At least two intervals (T847's review): with one, a right range across
   * zero has no interval that covers it — its foot is −I and its top 0 for
   * every I past its own foot — and the search below would never end. With
   * two, I at least the larger of its two sides always does.
   */
  const n = Math.max(2, Math.ceil(clean((leftCover.max - leftMin) / leftInterval)));

  let interval = niceAtLeast((rightCover.max - rightCover.min) / n, ranges[1].wholeNumbers);
  for (;;) {
    const min = Math.floor(clean(rightCover.min / interval)) * interval;
    if (clean(min + n * interval) >= rightCover.max) {
      return [extentOf(leftMin, leftInterval, n), extentOf(min, interval, n)];
    }
    interval = niceAtLeast(interval * (1 + 1e-9), ranges[1].wholeNumbers);
  }
}

/**
 * Both axes' extents: the right's ticks on the left's gridlines, and their
 * zero lines level wherever both ranges include zero (AC-499).
 */
export function alignedAxes(
  left: AxisRange,
  right: AxisRange,
  splitNumber: number = SPLIT_NUMBER,
): { left: AxisExtent; right: AxisExtent } {
  const ranges = [left, right] as const;
  const covers = [coverOf(left), coverOf(right)] as const;
  const [l, r] =
    includesZero(covers[0]) && includesZero(covers[1])
      ? zeroAligned(ranges, covers, splitNumber)
      : gridAligned(ranges, covers, splitNumber);
  return { left: l, right: r };
}
