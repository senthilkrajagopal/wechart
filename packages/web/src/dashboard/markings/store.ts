import { EMPTY_PREDICATE, type MarkingPredicate } from '@wechart/core';

import {
  isSection,
  isTabGroup,
  isTile,
  type DashboardDocument,
  type Element_,
} from '../model/document';

/**
 * What each marking currently holds, for the whole dashboard (AC-095,
 * direction.md rule 48: "Markings span every page tab").
 *
 * **Read by tiles, never pushed to them**, and that is the whole of the
 * criterion. Tabs load lazily, so a tile on a tab nobody has opened does not
 * exist yet; the obvious design — telling each mounted tile when a marking
 * changes — works for everything on screen and silently fails for everything
 * that is not, because the tab opens later and renders whatever it was told
 * last, or nothing. Holding the marking once and reading it at render time
 * means a tile that appears afterwards agrees with the ones already there by
 * construction.
 *
 * Kept out of the dashboard document on purpose. Rule 54: "Saved dashboards
 * store marking definitions only. Current marks are carried only by a link or
 * a bookmark" — so what is marked *now* is session state, not a document
 * change, and it must not make the edit session think the dashboard is dirty.
 */
export type MarkingState = Readonly<Record<string, MarkingPredicate>>;

/** What a marking holds, or nothing when it has never been set. */
export function markingOf(state: MarkingState, markingId: string): MarkingPredicate {
  return state[markingId] ?? EMPTY_PREDICATE;
}

/**
 * The state with one marking changed. The rest travel across untouched: four
 * markings can be live at once (AC-084), and a tile marking with one must not
 * repaint because another moved.
 */
export function withMarking(
  state: MarkingState,
  markingId: string,
  predicate: MarkingPredicate,
): MarkingState {
  return { ...state, [markingId]: predicate };
}

/**
 * Every tile a change to this marking reaches, across every page tab, in
 * document order.
 *
 * Two relationships count, and they are different things: a tile *marks with*
 * a marking (clicking in it edits that marking), and a tile is *limited by*
 * one (it shows only what that marking holds). Both change when the marking
 * does.
 */
export function tilesAffectedBy(document: DashboardDocument, markingId: string): readonly string[] {
  const found: string[] = [];

  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      if (isSection(element)) {
        walk(element.items);
        continue;
      }
      if (isTabGroup(element)) {
        // Every tab, not only the open one: a tile in a closed tab is exactly
        // the case this criterion is about.
        for (const tab of element.tabs) walk(tab.items);
        continue;
      }
      if (!isTile(element)) continue;

      const marks = element.marksWith === markingId;
      const limited = element.limitedBy?.includes(markingId) ?? false;
      if (marks || limited) found.push(element.id);
    }
  };

  for (const page of document.pages) walk(page.items);

  return found;
}
