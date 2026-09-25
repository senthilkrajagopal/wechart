import {
  markedFilter,
  markingMembers,
  type CubeFilter,
  type MarkingPredicate,
} from '@wechart/core';

/**
 * A filter made from a marking (AC-113, direction.md rule 53): "Filter to
 * marked" keeps the marked rows, "Filter out marked" every other row. It is
 * the marking's predicate as one Cube filter (`markedFilter`), held on the
 * dashboard's filter bar until removed, while the marking itself is cleared.
 */
export interface MarkFilter {
  readonly id: string;
  /** Filter out marked: every row but the marked ones. */
  readonly negate: boolean;
  /** The marking it was made from, by name, and what it held, in words. */
  readonly markingName: string;
  readonly summary: string;
  readonly filter: CubeFilter;
  /** Every member it names, so a tile whose cube cannot reach one is left as it is. */
  readonly members: readonly string[];
}

/** The filter a marking makes, or why it cannot make one. */
export function markFilterFrom(
  predicate: MarkingPredicate,
  negate: boolean,
  { id, markingName, summary }: { id: string; markingName: string; summary: string },
): MarkFilter | { readonly refused: string } {
  const made = markedFilter(predicate, negate);
  if ('refused' in made) return made;
  return {
    id,
    negate,
    markingName,
    summary,
    filter: made.filter,
    members: markingMembers(predicate),
  };
}

/** How a marking filter reads on the filter bar and its remove button. */
export function markFilterLabel(filter: MarkFilter): string {
  return `${filter.negate ? 'Filtered out' : 'Filtered to'} ${filter.markingName}: ${filter.summary}`;
}
