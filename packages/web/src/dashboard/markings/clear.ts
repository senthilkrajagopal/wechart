import { EMPTY_PREDICATE, isEmptyPredicate } from '@wechart/core';

import type { Tile } from '../model/document';
import { markingOf, withMarking, type MarkingState } from './store';

/**
 * Unmarking from a tile (AC-094, direction.md rule 47: "Clicking an empty plot
 * area unmarks that tile's marking").
 *
 * **One marking, not all of them.** Four can be live at once (AC-084), so
 * "unmark" has to mean the one this tile marks with — a dashboard where
 * Escape or a stray click on background wiped every marking is one nobody
 * would risk either gesture on.
 *
 * direction.md distinguishes the two: Escape unmarks all markings, but "Esc on
 * a focused tile unmarks its marking". This is the focused case, which is what
 * AC-094 describes; **the global one has no criterion and is not built**.
 *
 * The gesture itself already exists: `itemClicks` reports a click on empty
 * plot area as `item: null` (T093), which is what routes here.
 */
export function clearTileMarking(state: MarkingState, tile: Tile): MarkingState {
  const markingId = tile.marksWith;

  /**
   * A "(None)" tile has no marking to clear (direction.md rule 44), and
   * picking one would be exactly the over-reach the criterion forbids.
   * Returned by identity so nothing downstream treats it as a change.
   */
  if (markingId === undefined) return state;
  if (isEmptyPredicate(markingOf(state, markingId))) return state;

  // Items *and* ranges: a range left behind would go on marking rows after the
  // user asked for nothing to be marked.
  return withMarking(state, markingId, EMPTY_PREDICATE);
}
