import { isEmptyPredicate, matchesPredicate, type MarkingPredicate } from './predicate';

/**
 * Limiting a tile by the markings it follows (AC-107, direction.md rule 33).
 *
 * A details tile shows only what its master tiles have marked. Several
 * markings can limit one tile, combined as **All markings (AND)** or **Any
 * marking (OR)** by a per-tile setting.
 *
 * **Empty markings are skipped, and that rule is ours** — direction.md flags
 * it: "Proposed rule, not from Spotfire's docs: empty markings are skipped
 * when combining. The nothing-marked state applies only when every limiting
 * marking is empty."
 *
 * The naive reading is catastrophic under AND. A tile limited by two markings,
 * where the user has marked in only one of them, would intersect against an
 * empty set and show nothing — so the details tile goes blank exactly when
 * someone starts working, and the remedy ("go and mark something in the other
 * master tile as well") is not a thing anyone would guess.
 */
export type LimitCombination = 'all' | 'any';

/** The markings that actually restrict anything: the non-empty ones. */
export function limitingMarkings(
  markings: readonly MarkingPredicate[],
): readonly MarkingPredicate[] {
  return markings.filter((marking) => !isEmptyPredicate(marking));
}

/**
 * The rows a limited tile shows.
 *
 * **Every row when nothing is marked anywhere**, not none. What a tile shows
 * in that state is a per-tile setting — All data, an empty visualisation, or a
 * message, with the message the default — so the decision belongs to whoever
 * renders it. Returning nothing here would make "All data" impossible to
 * implement.
 *
 * Rows are returned by identity and in their original order: the tile's own
 * sort is the tile's business, and identity is what lets a renderer tell
 * whether a row actually changed.
 */
export function limitRowsBy<T extends Record<string, unknown>>(
  rows: readonly T[],
  markings: readonly MarkingPredicate[],
  combination: LimitCombination,
): readonly T[] {
  const limiting = limitingMarkings(markings);

  if (limiting.length === 0) return rows;

  return rows.filter((row) =>
    combination === 'all'
      ? limiting.every((marking) => matchesPredicate(marking, row))
      : limiting.some((marking) => matchesPredicate(marking, row)),
  );
}
