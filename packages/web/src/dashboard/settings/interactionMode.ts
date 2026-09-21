import type { DashboardSettings } from '../model/document';

/**
 * The dashboard's interaction mode, and the rule that both configurations
 * survive a switch (AC-070, direction.md rule 56).
 *
 * direction.md: "Markings or Cross-filtering and cross-highlighting, as radio
 * cards. Both configurations are kept; only the selected one is active, and
 * the nav labels each section active or inactive." Rule 13 puts it more
 * strongly still — "Every dashboard uses exactly one interaction mode" — which
 * is the half this module enforces in the type: one `mode`, two configs beside
 * it, and no way to express both being on.
 *
 * **The two configurations are deliberately thin here.** What a marking is
 * made of is F10's (AC-084 onwards) and the cross-filter matrix is F12's
 * (AC-117, AC-118). This carries only what direction.md names for each — the
 * marking list, and the default action for tile pairs — so that "both
 * configurations are kept" has something real to keep without this task
 * inventing the contents of two features it does not build.
 */
export const INTERACTION_MODES = ['markings', 'crossFilter'] as const;

export type InteractionMode = (typeof INTERACTION_MODES)[number];

export interface CrossFilterConfig {
  /** direction.md: "the default action for tile pairs (Filter, Highlight or None)". */
  readonly defaultAction: 'filter' | 'highlight' | 'none';
}

/**
 * **Marking definitions are deliberately not in here.** They live at the top
 * of the document, beside `pages` and `settings`, because that is where the
 * record puts them: AC-065 lists "the layout, tile settings, dashboard
 * settings **and** marking definitions" as four peers, rule 54 says "Saved
 * dashboards store marking definitions", and `roundTrip.test.ts` has pinned a
 * top-level `markings` key since T075.
 *
 * They were briefly nested under the mode's configuration here, which gave
 * markings two homes in one repository and would have handed F10 a document
 * with a marking list in each. Keeping them out also makes AC-070's promise
 * about them structural: a mode switch cannot discard what it cannot reach.
 */
export interface Interactions {
  readonly mode: InteractionMode;
  readonly crossFilter: CrossFilterConfig;
}

/**
 * direction.md rule 57 and AC-072: a new dashboard starts in Markings mode
 * with one marking named "Marking" set as the default. The cross-filter side
 * is present from the start too — otherwise the first switch away from
 * Markings would have nothing to keep, and "keeps both configurations" would
 * only become true from the second switch onwards.
 *
 * The cross-filter default is Filter because direction.md rule 32 already
 * decided it — "The default comes from 'Default for tile pairs', which starts
 * at Filter" — and AC-118 traces to that rule. This first read "none, because
 * choosing is not this task's to do", which sounds careful and is the opposite:
 * the record had chosen, and "none" was the one value it ruled out. A value
 * written here is persisted, so F12 would have inherited documents whose
 * stored default contradicted its own criterion, with no migration.
 */
export const DEFAULT_INTERACTIONS: Interactions = {
  mode: 'markings',
  crossFilter: { defaultAction: 'filter' },
};

/**
 * The interactions of a dashboard's settings, which may predate them.
 *
 * Every dashboard stored so far has `settings` with no `interactions` key, and
 * all of them are at `schemaVersion: 1`, so this is not a migration but the
 * ordinary case. Reading one has to produce both configurations or the
 * settings page opens onto nothing.
 */
export function interactionsOf(settings: DashboardSettings): Interactions {
  return settings.interactions ?? DEFAULT_INTERACTIONS;
}

/**
 * The same interactions with a different mode active.
 *
 * Both configurations travel across untouched — that is the whole criterion.
 * The tempting shape is to build the new mode's configuration here, which
 * reads as tidy and quietly discards the other side.
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
