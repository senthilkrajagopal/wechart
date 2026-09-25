import { markingsFrom } from '@wechart/core';

import { adoptValues } from '../../filters/url';
import type { DashboardDocument } from '../model/document';
import { interactionsOf } from '../settings/interactionMode';
import type { ViewState } from './viewState';

/**
 * What applying a bookmark restores (T128, AC-122), fitted to the dashboard as
 * it is now — it may have changed since the bookmark was saved:
 *
 * - its page tab, or the first page where that one has gone;
 * - its filters' values, on the filters still there, and each on another
 *   filter on the same field where its own has gone, as a link's values are
 *   taken on (AC-064);
 * - its marks, on the markings still there, and only in Markings mode —
 *   there are no marks in any other (AC-120);
 * - the filters "Filter to marked" made, which stand on their own.
 *
 * All of it the reader's view state: nothing here is the dashboard's saved
 * definition, which applying never touches.
 */
export function viewFor(document: DashboardDocument, state: ViewState): ViewState {
  const pages = document.pages.map((page) => page.id);
  const marking = interactionsOf(document.settings).mode === 'markings';
  const markings = new Set(markingsFrom(document.markings).map((each) => each.id));
  const ours = <T>(record: Readonly<Record<string, T>>) =>
    marking ? Object.fromEntries(Object.entries(record).filter(([id]) => markings.has(id))) : {};
  return {
    page: pages.includes(state.page) ? state.page : (pages[0] ?? ''),
    filters: adoptValues(document.filters ?? [], state.filters),
    marks: ours(state.marks),
    markFilters: state.markFilters,
    from: ours(state.from),
  };
}
