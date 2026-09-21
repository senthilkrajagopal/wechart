import { EMPTY_PREDICATE, type MarkingPredicate, type MemberValue } from '@wechart/core';

/**
 * Marking a whole category from its legend entry (AC-090, direction.md
 * §7a rule 7).
 *
 * `references-markings.md` records this as a conflict it resolved rather than
 * a preference: direction.md §6 originally had a legend click "toggle a
 * series", which contradicts Spotfire, Looker and Qlik, where clicking a
 * legend entry *marks* that category. The spec follows the marking reading,
 * and series visibility moves to the tile's Customize panel — which is why
 * `legendFor` sets `selectedMode: false` and why a legend click reaching
 * ECharts' own handler is one of this criterion's two failing states.
 *
 * **Ctrl-click here adds; on an item it toggles** (AC-087). That asymmetry is
 * the criteria's, not an oversight: AC-090 says "SHALL add further
 * categories", AC-087 says "SHALL toggle that item". Spotfire behaves the same
 * way round. A category is removed by marking again without it.
 */
export interface LegendModifiers {
  /** True for Ctrl-click and ⌘-click: a further category rather than a fresh mark. */
  readonly add: boolean;
}

/** The marking after clicking a legend entry. */
export function markFromLegend(
  predicate: MarkingPredicate,
  category: MemberValue,
  { add }: LegendModifiers,
): MarkingPredicate {
  /**
   * A single-member tuple, which is what makes "every item of that category"
   * true: it matches on the category alone, whatever else varies across the
   * rows underneath it. A tuple naming the other dimensions too would mark one
   * bar rather than the series.
   */
  const item = [category];

  if (!add) return { ...EMPTY_PREDICATE, items: [item] };

  const already = predicate.items.some(
    (marked) =>
      marked.length === 1 &&
      marked[0]?.member === category.member &&
      marked[0]?.granularity === category.granularity &&
      marked[0]?.value === category.value,
  );

  // Clicking an already-marked entry again is not a request for a duplicate
  // that would then need two clicks to undo.
  return already ? predicate : { ...predicate, items: [...predicate.items, item] };
}
