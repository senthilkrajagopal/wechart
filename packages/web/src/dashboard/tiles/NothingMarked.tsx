import { isEmptyPredicate, type MarkingPredicate } from '@wechart/core';

/**
 * What a limited tile shows when nothing is marked anywhere (AC-109,
 * direction.md rule 33).
 *
 * This is the decision `limitRowsBy` (T113) refused to make: it returns *every*
 * row when nothing is marked, precisely so this setting can choose. Returning
 * none there would have made "All data" impossible to implement.
 *
 * **Message is the default** — a user decision of 2026-09-19, recorded as
 * direction.md rule 58 — and it earns that: a details tile silently showing
 * everything reads as unfiltered data, and one silently showing nothing reads
 * as broken. Naming the master tiles is the only state that explains itself,
 * and the tile to go and click may be on another page tab.
 *
 * Not to be confused with a marking that holds something whose items are all
 * filtered out. direction.md keeps those apart — "If a limiting marking isn't
 * empty but its items are all filtered out, the tile says so instead of
 * showing the nothing-marked state" — because the remedies differ: one wants a
 * mark, the other wants a filter changed. AC-111 (T117) covers that case, and
 * must be tested *before* this one when both could apply.
 */
export type NothingMarkedState = 'all' | 'empty' | 'message';

/**
 * direction.md rule 58: the state a newly limited tile starts in (user
 * decision 2026-09-19). Setting it on the tile is AC-110's job (T116); this
 * constant is the value T116 stores, kept beside the states it names.
 */
export const NOTHING_MARKED_DEFAULT: NothingMarkedState = 'message';

/**
 * Whether *every* marking limiting a tile is empty — AC-109's trigger.
 *
 * Takes all of the tile's limiting markings, empty ones included. That is the
 * opposite of core's `limitingMarkings`, which returns only the non-empty ones
 * ("the markings that actually restrict anything"), so the two must never be
 * composed: `allLimitsEmpty(limitingMarkings(xs))` is false for every input,
 * because every survivor is non-empty and an empty array fails `length > 0`.
 * This function is named for what it asserts rather than for the state it
 * detects, so that mistake reads as wrong at the call site.
 *
 * A tile no marking limits is not waiting on anything, so it has no
 * nothing-marked state — hence `length > 0`.
 */
export function allLimitsEmpty(limiting: readonly MarkingPredicate[]): boolean {
  return limiting.length > 0 && limiting.every((marking) => isEmptyPredicate(marking));
}

/**
 * The message a newly limited tile starts with, "pre-filled with the master
 * tiles' names" (direction.md rule 58 and §7a; rule 33 itself lists only the
 * three options).
 *
 * It lives here beside the component that renders it, but it is deliberately
 * *not* called by that component: pre-filled text is text the user may then
 * edit, so composing the sentence at render would overwrite the edit on every
 * paint. T116 (AC-110) calls this once, when the tile is first limited, and
 * stores the result on the tile.
 *
 * @param masters The tiles whose markings limit this one, by name.
 */
export function defaultNothingMarkedMessage(masters: readonly string[]): string {
  // With no names to give, the sentence has to stand on its own: "Mark
  // something *there*" has no antecedent once the names are dropped. The
  // branch is reachable — a tile keeps its `limitedBy` when the master tile is
  // deleted, and a marking no tile marks with is legal.
  if (masters.length === 0) {
    return 'Nothing is marked yet. Mark something in a master tile to fill this tile.';
  }

  return `Nothing is marked in ${masters.join(' or ')}. Mark something there to fill this tile.`;
}

export interface NothingMarkedProps {
  readonly state: NothingMarkedState;
  /**
   * The message stored on the tile. Rendered verbatim, and only when `state`
   * is `'message'` — a tile switched to another state must not leak the text
   * it still holds.
   */
  readonly message: string;
}

export function NothingMarked({ state, message }: NothingMarkedProps) {
  // "All data" means the tile draws normally, so this gets out of the way
  // entirely rather than rendering a wrapper the tile has to reason about.
  if (state === 'all') return null;

  if (state === 'empty') {
    return (
      // Same box, no text. It keeps `height: 100%` so the tile holds its place
      // in the grid instead of collapsing and shoving its neighbours around
      // every time a mark is cleared. No modifier class: it had no rule of its
      // own, and a class the stylesheet does not mention is a false lead.
      <div className="nothing-marked" data-testid="nothing-marked-empty" aria-hidden="true" />
    );
  }

  /**
   * No live-region role here. This paragraph is mounted at the same moment as
   * its text, and `MarkingAnnouncer` records what that costs: "a region added
   * at the same moment as its content is commonly not announced at all". A
   * role that does nothing is worse than none, because it reads as covered.
   * AC-101's announcer already exists to say that the marking changed.
   */
  return (
    <p className="nothing-marked" data-testid="nothing-marked">
      {message}
    </p>
  );
}
