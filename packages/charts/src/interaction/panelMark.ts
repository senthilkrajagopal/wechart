import { EMPTY_PREDICATE, type MarkingPredicate, type MemberValue } from '@wechart/core';

import type { EChartsOption } from '../theme';

/**
 * Marking a whole trellis panel from its header (AC-091).
 *
 * Spotfire 14.8's gesture, recorded in `references-markings.md`: "Clicking a
 * panel or page header marks all of its data", named there against wafer maps,
 * batch analysis and regional breakdowns — dense comparisons where reaching
 * every item in a panel any other way means a lot of dragging.
 *
 * The click arrives because `trellis.ts` sets `title.triggerEvent`, which
 * `docs/research/echarts.md` identifies as the mechanism: ECharts titles emit
 * no events without it, so the criterion's "marks nothing" failing state is
 * reached by omitting one line rather than by writing anything wrong.
 */

/**
 * The marking after clicking a panel header.
 *
 * A single-member tuple on the facet dimension, for the same reason a legend
 * click uses one: it matches every row in the panel whatever else varies
 * inside it. A tuple naming more would mark one item and satisfy the
 * criterion's first failing state exactly.
 *
 * It takes no previous marking, because it does not consult one: a plain panel
 * click replaces. A Ctrl- or ⌘-click adds further panels, as Spotfire's does
 * (`references-markings.md`), through `markFromLegend` with `add`, the
 * dashboard's own path for a legend entry's Ctrl-click (T635; the
 * coordinator's call on R64, with the tile menu's Ctrl+Enter, T634).
 */
export function markFromPanel(panel: MemberValue): MarkingPredicate {
  return { ...EMPTY_PREDICATE, items: [[panel]] };
}

/**
 * Which panel a title click names, from the `componentIndex` ECharts reports.
 *
 * Null for an index that names no panel: a click on some other title
 * component must not mark a panel that is not there, and must not quietly
 * mark the first one instead.
 */
export function panelOfTitleClick(option: EChartsOption, componentIndex: number): string | null {
  const titles = option.title as { text?: unknown }[] | undefined;
  const text = titles?.[componentIndex]?.text;

  return typeof text === 'string' ? text : null;
}
