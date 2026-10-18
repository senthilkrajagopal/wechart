import { describe, expect, it } from 'vitest';

import {
  BOXPLOT_POINTS,
  boxplotDistributionOf,
  distributionPatch,
  drawnDistribution,
  needsEachPointIs,
  POINTS_NEED_EACH_POINT_IS,
} from './boxplotDistribution';

/**
 * T990 / AC-591, AC-306: a box plot's Customize › Distribution — Points (None,
 * Outliers, All, Beeswarm), Outliers by default, and Violin, on or off. All,
 * Beeswarm and Violin need Each point is.
 * `Fails when: a choice is missing or another is offered; the default isn't
 * Outliers; …` (AC-591), and `a box plot with Points at Outliers draws other
 * than before R81` (AC-306).
 */
describe('a box plot’s Distribution (AC-591, AC-306)', () => {
  it('offers exactly None, Outliers, All and Beeswarm, in that order', () => {
    expect(BOXPLOT_POINTS).toEqual(['none', 'outliers', 'all', 'beeswarm']);
  });

  it('reads a box plot saved before R81 as Points Outliers and no Violin', () => {
    // Saved before R81: only its whiskers, or nothing, among its options.
    expect(boxplotDistributionOf(undefined)).toEqual({ points: 'outliers', violin: false });
    expect(boxplotDistributionOf({})).toEqual({ points: 'outliers', violin: false });
    expect(boxplotDistributionOf({ whiskers: 'minmax' })).toEqual({
      points: 'outliers',
      violin: false,
    });
  });

  it('reads what was chosen, and anything else as the default', () => {
    expect(boxplotDistributionOf({ distribution: { points: 'beeswarm', violin: true } })).toEqual({
      points: 'beeswarm',
      violin: true,
    });
    expect(boxplotDistributionOf({ distribution: { points: 'none' } })).toEqual({
      points: 'none',
      violin: false,
    });
    expect(boxplotDistributionOf({ distribution: { points: 'swarm', violin: 'yes' } })).toEqual({
      points: 'outliers',
      violin: false,
    });
    expect(boxplotDistributionOf({ distribution: 'beeswarm' })).toEqual({
      points: 'outliers',
      violin: false,
    });
  });

  it('says All, Beeswarm and Violin need Each point is, and None and Outliers don’t', () => {
    expect(needsEachPointIs('none')).toBe(false);
    expect(needsEachPointIs('outliers')).toBe(false);
    expect(needsEachPointIs('all')).toBe(true);
    expect(needsEachPointIs('beeswarm')).toBe(true);
    expect(needsEachPointIs('violin')).toBe(true);
    expect(POINTS_NEED_EACH_POINT_IS).toBe(
      'Points need Each point is: choose what one point is, such as an Order.',
    );
  });

  it('draws a choice that needs Each point is as Outliers, with no Violin, while it’s empty', () => {
    const chosen = { distribution: { points: 'beeswarm', violin: true } };
    expect(drawnDistribution(chosen, false)).toEqual({ points: 'outliers', violin: false });
    expect(drawnDistribution(chosen, true)).toEqual({ points: 'beeswarm', violin: true });
    // None is a box plot's own to choose, Each point is or not.
    expect(drawnDistribution({ distribution: { points: 'none' } }, false)).toEqual({
      points: 'none',
      violin: false,
    });
  });

  it('keeps the saved options sparse: the defaults are stored as nothing', () => {
    expect(distributionPatch({ points: 'outliers', violin: false })).toEqual({
      distribution: undefined,
    });
    expect(distributionPatch({ points: 'beeswarm', violin: false })).toEqual({
      distribution: { points: 'beeswarm' },
    });
    expect(distributionPatch({ points: 'outliers', violin: true })).toEqual({
      distribution: { violin: true },
    });
    expect(distributionPatch({ points: 'all', violin: true })).toEqual({
      distribution: { points: 'all', violin: true },
    });
  });
});
