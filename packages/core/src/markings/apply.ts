import {
  EMPTY_PREDICATE,
  type MarkedItem,
  type MarkingPredicate,
  type MemberValue,
} from './predicate';

/**
 * What a click does to a marking (AC-087, direction.md rule 47): "Click
 * replaces the marking, Ctrl/⌘+click toggles".
 *
 * The two are opposites, and getting the modifier backwards behaves perfectly
 * until something is already marked — which is why the tests all start from a
 * marking that holds something.
 */
export interface ClickModifiers {
  /** True for Ctrl-click and ⌘-click. */
  readonly toggle: boolean;
}

/** The marking after clicking an item. */
export function applyItemClick(
  predicate: MarkingPredicate,
  item: MarkedItem,
  { toggle }: ClickModifiers,
): MarkingPredicate {
  if (!toggle) {
    /**
     * Replace means replace: the ranges go too. A range left behind would go
     * on marking rows the user just replaced, so the tile would show a
     * marking wider than the one thing they clicked.
     *
     * Clicking something already marked still narrows to it rather than doing
     * nothing — otherwise there would be no way back from several marked
     * items to one.
     */
    return { ...EMPTY_PREDICATE, items: [item] };
  }

  const without = predicate.items.filter((marked) => !sameItem(marked, item));
  const removed = without.length !== predicate.items.length;

  // Ranges survive a toggle, because toggling one item is an adjustment to
  // the marking rather than a fresh start.
  return { ...predicate, items: removed ? without : [...predicate.items, item] };
}

/**
 * The marking after Ctrl-dragging a shape over a set of items (AC-089).
 *
 * Spotfire's ToggleOrAdd, quoted in `references-markings.md` from the Mods
 * API: it "will behave like toggle if all or no rows in the set are marked,
 * otherwise it is an add operation."
 *
 * **Not a toggle applied to each item in turn**, which is the tempting reading
 * and is wrong in exactly one case: over a partly marked set, per-item
 * toggling unmarks the items the user had already collected while marking the
 * rest. Dragging over a group to gather it would scatter half of it. Two of
 * the three cases are indistinguishable from outside — with none marked,
 * toggling marks them all; with some marked, adding marks them all — so only
 * the all-marked case shows the difference.
 */
export function applyToggleOrAdd(
  predicate: MarkingPredicate,
  enclosed: readonly MarkedItem[],
): MarkingPredicate {
  // An empty set is vacuously both "all marked" and "none marked", so the rule
  // does not decide it. Doing nothing is the only answer that does not destroy
  // a marking because someone dragged across blank space.
  if (enclosed.length === 0) return predicate;

  const allMarked = enclosed.every((item) => isItemMarked(predicate, item));
  if (allMarked) {
    return {
      ...predicate,
      items: predicate.items.filter((marked) => !enclosed.some((item) => sameItem(marked, item))),
    };
  }

  // Add: everything enclosed ends up marked, and nothing already marked comes
  // off. Ranges stay for the same reason a Ctrl-click keeps them — the
  // modifier means "and also".
  const added = enclosed.filter(
    (item, index) =>
      !isItemMarked(predicate, item) &&
      // A shape can enclose two representations of one item; marked twice, it
      // would need two toggles to clear.
      enclosed.findIndex((other) => sameItem(other, item)) === index,
  );

  return { ...predicate, items: [...predicate.items, ...added] };
}

/** Whether this exact item is one of the marked ones. */
export function isItemMarked(predicate: MarkingPredicate, item: MarkedItem): boolean {
  return predicate.items.some((marked) => sameItem(marked, item));
}

/**
 * Two items are the same when they name the same members at the same
 * granularities with the same values — **whatever order the parts are in**.
 *
 * The order comes from however a chart happens to list its dimensions, which
 * is not a promise anyone has made. Compared positionally, a toggle would fail
 * to recognise an item that is plainly marked, add a duplicate, and leave a
 * marking that needs two clicks to clear and paints itself twice.
 */
function sameItem(a: MarkedItem, b: MarkedItem): boolean {
  return a.length === b.length && a.every((part) => b.some((other) => samePart(part, other)));
}

function samePart(a: MemberValue, b: MemberValue): boolean {
  return a.member === b.member && a.granularity === b.granularity && a.value === b.value;
}
