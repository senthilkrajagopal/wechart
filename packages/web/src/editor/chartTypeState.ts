import type { ChartType } from '@wechart/recommender';

/**
 * Whether the chart type follows the recommendation or the user's own choice
 * (AC-032).
 *
 * The rule is one-directional: a field change never clears a manual choice.
 * Only Auto, or the Recommended card's Use, does (R76). Re-recommending over someone's explicit
 * decision every time they add a field is the behaviour the criterion exists
 * to forbid — it looks like the application arguing with them.
 */
export interface ChartTypeState {
  /** Null while the chart follows the recommendation. */
  readonly manual: ChartType | null;
}

export const FOLLOWING_RECOMMENDATION: ChartTypeState = { manual: null };

export function chooseType(chartType: ChartType): ChartTypeState {
  return { manual: chartType };
}

export function backToRecommended(): ChartTypeState {
  return FOLLOWING_RECOMMENDATION;
}

/**
 * A field change leaves the choice alone — stated as a function rather than
 * left implicit, so the intent is visible and testable.
 */
export function afterFieldChange(state: ChartTypeState): ChartTypeState {
  return state;
}

export function effectiveType(
  state: ChartTypeState,
  recommended: ChartType | null,
): ChartType | null {
  return state.manual ?? recommended;
}

export function isManual(state: ChartTypeState): boolean {
  return state.manual !== null;
}
