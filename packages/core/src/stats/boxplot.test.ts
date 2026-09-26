import { describe, expect, it } from 'vitest';

import { boxStats, quantile7 } from './boxplot';

/**
 * T399 (AC-306): one box per category with its median and quartiles, computed
 * by linear interpolation (Hyndman–Fan type 7). Whiskers follow a chart
 * option: by default Tukey's, ending at the most extreme value within 1.5 × IQR
 * of the box, with values beyond drawn as dots; or else the minimum and
 * maximum. (research/box-plot.md §3, the T1 convention.)
 */
describe('type-7 quantiles', () => {
  it('interpolates between the order statistics as R, NumPy and PostgreSQL’s percentile_cont do', () => {
    // [1,2,3,4]: Q1 = 1.75, median 2.5, Q3 = 3.25 (research §3's worked example).
    expect(quantile7([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile7([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile7([1, 2, 3, 4], 0.75)).toBe(3.25);
    expect(quantile7([7], 0.25)).toBe(7);
    expect(quantile7([3, 1, 2], 0.5)).toBe(2);
  });
});

describe('a box’s statistics', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];

  it('ends Tukey whiskers at the most extreme values inside 1.5 × IQR, and lists the rest as outliers', () => {
    const box = boxStats(values, 'tukey')!;
    expect(box.q1).toBe(3.25);
    expect(box.median).toBe(5.5);
    expect(box.q3).toBe(7.75);
    // IQR 4.5; fences -3.5 and 14.5; the data inside them run from 1 to 9.
    expect(box.low).toBe(1);
    expect(box.high).toBe(9);
    expect(box.outliers).toEqual([100]);
    expect(box.n).toBe(10);
  });

  it('draws the minimum and maximum, with no dots, under the min/max option', () => {
    const box = boxStats(values, 'minmax')!;
    expect(box.low).toBe(1);
    expect(box.high).toBe(100);
    expect(box.outliers).toEqual([]);
  });

  it('ignores missing and non-numeric values, as SQL’s percentile_cont ignores nulls', () => {
    const box = boxStats([4, null, '2', 'n/a', undefined, 6, Number.NaN], 'tukey')!;
    expect(box.n).toBe(3);
    expect(box.median).toBe(4);
  });

  it('has nothing to draw for a category with no values', () => {
    expect(boxStats([null, undefined], 'tukey')).toBeUndefined();
  });

  it('puts outliers below the box among the dots too, in value order', () => {
    const box = boxStats([-50, 10, 11, 12, 13, 14, 15, 90], 'tukey')!;
    expect(box.outliers).toEqual([-50, 90]);
    expect(box.low).toBe(10);
    expect(box.high).toBe(15);
  });

  it('keeps the minimum and maximum for the tooltip, whatever the whiskers (rule 88)', () => {
    const box = boxStats([-50, 10, 11, 12, 13, 14, 15, 90], 'tukey')!;
    expect(box.min).toBe(-50);
    expect(box.max).toBe(90);
    const minmax = boxStats(values, 'minmax')!;
    expect([minmax.min, minmax.max]).toEqual([1, 100]);
  });

  it('draws every value inside when they are all the same, and both of two values', () => {
    // IQR 0: the fences are the value itself, and nothing lies beyond them.
    expect(boxStats([5, 5, 5, 5], 'tukey')).toEqual({
      n: 4,
      min: 5,
      low: 5,
      q1: 5,
      median: 5,
      q3: 5,
      high: 5,
      max: 5,
      outliers: [],
    });
    // [0, 10]: Q1 2.5, Q3 7.5, fences -5 and 15.
    expect(boxStats([10, 0], 'tukey')).toEqual({
      n: 2,
      min: 0,
      low: 0,
      q1: 2.5,
      median: 5,
      q3: 7.5,
      high: 10,
      max: 10,
      outliers: [],
    });
  });
});
