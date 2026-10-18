/**
 * A box plot's Customize › Distribution (T990, AC-591, AC-306; design 23
 * sheet 11; direction.md rule 157): which of its values it draws as points,
 * and whether it adds a violin where they gather.
 *
 * Stored sparse in the chart's options as `distribution: { points, violin }`,
 * absent meaning today's drawing — Outliers and no Violin — so a box plot
 * saved before R81 draws as it did.
 */

/** Points, in the order offered: None, Outliers (the default), All, Beeswarm. */
export const BOXPLOT_POINTS = ['none', 'outliers', 'all', 'beeswarm'] as const;
export type BoxplotPoints = (typeof BOXPLOT_POINTS)[number];

export interface BoxplotDistribution {
  readonly points: BoxplotPoints;
  readonly violin: boolean;
}

/** Today's drawing: the values beyond the whiskers as dots, and no violin. */
export const DEFAULT_DISTRIBUTION: BoxplotDistribution = { points: 'outliers', violin: false };

/** Why All, Beeswarm and Violin can't be chosen while Each point is is empty. */
export const POINTS_NEED_EACH_POINT_IS =
  'Points need Each point is: choose what one point is, such as an Order.';

const isPoints = (value: unknown): value is BoxplotPoints =>
  (BOXPLOT_POINTS as readonly unknown[]).includes(value);

/** What the chart's options chose, anything unknown read as the default. */
export function boxplotDistributionOf(
  options: Readonly<Record<string, unknown>> | undefined,
): BoxplotDistribution {
  const stored = options?.['distribution'];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return DEFAULT_DISTRIBUTION;
  }
  const { points, violin } = stored as Record<string, unknown>;
  return {
    points: isPoints(points) ? points : DEFAULT_DISTRIBUTION.points,
    violin: violin === true,
  };
}

/**
 * Whether a choice draws one mark per point, which needs Each point is to say
 * what one point is: All, Beeswarm and Violin do; None and Outliers don't.
 */
export function needsEachPointIs(choice: BoxplotPoints | 'violin'): boolean {
  return choice === 'all' || choice === 'beeswarm' || choice === 'violin';
}

/**
 * What is drawn: the choice, except that while Each point is is empty a
 * choice needing it falls back to the default — the choice is kept in the
 * options, so it returns when Each point is is set again.
 */
export function drawnDistribution(
  options: Readonly<Record<string, unknown>> | undefined,
  hasEachPointIs: boolean,
): BoxplotDistribution {
  const chosen = boxplotDistributionOf(options);
  if (hasEachPointIs) return chosen;
  return {
    points: needsEachPointIs(chosen.points) ? DEFAULT_DISTRIBUTION.points : chosen.points,
    violin: false,
  };
}

/** The options patch storing a choice, sparse: each default stored as nothing. */
export function distributionPatch(next: BoxplotDistribution): {
  distribution: Record<string, unknown> | undefined;
} {
  const stored = {
    ...(next.points === DEFAULT_DISTRIBUTION.points ? {} : { points: next.points }),
    ...(next.violin ? { violin: true } : {}),
  };
  return { distribution: Object.keys(stored).length === 0 ? undefined : stored };
}
