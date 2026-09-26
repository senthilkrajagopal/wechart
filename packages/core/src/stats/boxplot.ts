/**
 * A box plot's statistics, computed from the rows (T399, AC-306;
 * research/box-plot.md §3, §7).
 *
 * Quartiles and median by linear interpolation, Hyndman–Fan type 7 — what R,
 * NumPy, d3, ECharts and PostgreSQL's `percentile_cont` compute — so the
 * seeded Postgres is an independent check. wechart computes them itself rather
 * than through ECharts' transform, which treats null as 0 and ends Tukey
 * whiskers at the fence rather than at the last value inside it.
 */

/** Tukey's whiskers (1.5 × IQR, values beyond as dots), or the minimum and maximum. */
export type WhiskerRule = 'tukey' | 'minmax';

export interface BoxStats {
  /** The values the box summarises. */
  readonly n: number;
  /** The smallest value, whatever the whiskers: the tooltip lists it (rule 88). */
  readonly min: number;
  /** Where the lower whisker ends. */
  readonly low: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  /** Where the upper whisker ends. */
  readonly high: number;
  /** The largest value, whatever the whiskers. */
  readonly max: number;
  /** Values beyond the whiskers, drawn as dots, in value order. */
  readonly outliers: readonly number[];
}

/** Type-7 quantile of values already sorted ascending. */
function sortedQuantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const j = Math.floor(h);
  const low = sorted[j] ?? Number.NaN;
  const high = sorted[Math.min(j + 1, sorted.length - 1)] ?? low;
  return h === j ? low : low + (h - j) * (high - low);
}

/** The type-7 quantile of some numbers. */
export function quantile7(values: readonly number[], p: number): number {
  return sortedQuantile(
    [...values].sort((a, b) => a - b),
    p,
  );
}

/**
 * Cube sends numbers as strings; a missing or non-numeric value is left out,
 * as SQL's percentile_cont leaves out NULL.
 */
function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** One category's box, or nothing when it has no values. */
export function boxStats(values: readonly unknown[], rule: WhiskerRule): BoxStats | undefined {
  const sorted = values
    .map(numeric)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;

  const q1 = sortedQuantile(sorted, 0.25);
  const median = sortedQuantile(sorted, 0.5);
  const q3 = sortedQuantile(sorted, 0.75);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  if (rule === 'minmax') {
    return { n: sorted.length, min, low: min, q1, median, q3, high: max, max, outliers: [] };
  }

  const reach = 1.5 * (q3 - q1);
  const lowFence = q1 - reach;
  const highFence = q3 + reach;
  const inside = sorted.filter((value) => value >= lowFence && value <= highFence);
  return {
    n: sorted.length,
    min,
    // The most extreme values inside the fences (T1); with none inside, the box itself.
    low: inside[0] ?? q1,
    q1,
    median,
    q3,
    high: inside[inside.length - 1] ?? q3,
    max,
    outliers: sorted.filter((value) => value < lowFence || value > highFence),
  };
}
