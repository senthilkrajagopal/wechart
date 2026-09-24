import {
  DEFAULT_INTERACTIONS,
  INTERACTION_MODES,
  type InteractionMode,
  type Interactions,
} from '@wechart/core';

import type { DashboardSettings } from '../model/document';

/**
 * Reading and changing a dashboard's interaction mode (AC-070, direction.md
 * rule 56).
 *
 * **The shape and the default live in `@wechart/core`, not here.** A dashboard
 * is created by the API and read back by the browser, so a creation-time
 * default written in this package and a read-time default written in that one
 * would be equal today and diverge the day someone changed one of them — the
 * dashboard stored as one thing and read as another (AC-072). What stays here
 * is the behaviour the settings page needs, which nothing else has a use for.
 *
 * Re-exported so callers in this package have one place to import from rather
 * than having to know which half of the idea lives where.
 */
export { DEFAULT_INTERACTIONS, INTERACTION_MODES };
export type { CrossFilterConfig, InteractionMode, Interactions, PairAction } from '@wechart/core';

/**
 * The interactions of a dashboard's settings, which may predate them.
 *
 * Every dashboard stored before AC-070 has `settings` with no `interactions`
 * key, and all of them are at `schemaVersion: 1`, so this is the ordinary case
 * rather than a migration. Reading one has to produce a configuration or the
 * settings page opens onto nothing.
 *
 * This is also why AC-072 cannot be demonstrated by opening a dashboard: every
 * dashboard reads as Markings here, stored that way or not. Its test is at
 * creation, in the API.
 */
export function interactionsOf(settings: DashboardSettings): Interactions {
  return settings.interactions ?? DEFAULT_INTERACTIONS;
}

/**
 * The same interactions with a different mode active.
 *
 * The configuration of the mode being left travels across untouched — that is
 * the whole criterion. The tempting shape is to build the new mode's
 * configuration here, which reads as tidy and quietly discards the other side.
 */
export function setMode(interactions: Interactions, mode: InteractionMode): Interactions {
  // By identity when nothing changes, so a no-op switch is not a change for
  // the edit session to count (AC-074).
  if (interactions.mode === mode) return interactions;

  return { ...interactions, mode };
}

/** Whether this mode is the one in effect. Exactly one ever is. */
export function activityOf(
  interactions: Interactions,
  mode: InteractionMode,
): 'active' | 'inactive' {
  return interactions.mode === mode ? 'active' : 'inactive';
}

/** The word the settings nav shows beside a section (direction.md rule 56). */
export function labelOf(interactions: Interactions, mode: InteractionMode): 'Active' | 'Inactive' {
  return activityOf(interactions, mode) === 'active' ? 'Active' : 'Inactive';
}
