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
  /**
   * The marking's predicate it was made from: what a bookmark or a link
   * restores it by, so its filter and words are made again, never taken on
   * trust (T128's review).
   */
  readonly predicate: MarkingPredicate;
}

/** The filter a marking makes, or why it cannot make one. */
export function markFilterFrom(
  predicate: MarkingPredicate,
  negate: boolean,
  { id, markingName, summary }: { id: string; markingName: string; summary: string },
): MarkFilter | { readonly refused: string; readonly everything?: true } {
  const made = markedFilter(predicate, negate);
  if ('refused' in made) return made;
  return {
    id,
    negate,
    markingName,
    summary,
    filter: made.filter,
    members: markingMembers(predicate),
    predicate,
  };
}

/**
 * A marking filter as one tile is asked it (AC-113, AC-079): every member
 * named as that tile's cube or view takes it — a view by its own alias — or,
 * where the tile cannot reach one, that member, so the tile is left as it is
 * and says "Not filtered by" it. `reach` is the dashboard's, the same one its
 * filters are asked through; a member it cannot say about is kept as it is,
 * for Cube to answer.
 */
export function markFilterOn(
  // Its filter and members alone: a marking's share asks the same (T388).
  made: Pick<MarkFilter, 'filter' | 'members'>,
  reach: (member: string) => string | false | undefined,
): { readonly filter: CubeFilter } | { readonly unreached: string } {
  const names = new Map<string, string>();
  for (const member of made.members) {
    const as = reach(member);
    if (as === false) return { unreached: member };
    if (as !== undefined && as !== member) names.set(member, as);
  }
  return { filter: names.size === 0 ? made.filter : renamed(made.filter, names) };
}

/** A Cube filter with its members renamed, through its `and`s and `or`s. */
function renamed(filter: CubeFilter, names: ReadonlyMap<string, string>): CubeFilter {
  const out: CubeFilter = { ...filter };
  for (const key of ['and', 'or'] as const) {
    const parts = filter[key];
    if (Array.isArray(parts)) out[key] = parts.map((part) => renamed(part as CubeFilter, names));
  }
  const member = filter['member'];
  if (typeof member === 'string') out['member'] = names.get(member) ?? member;
  return out;
}

/** How a marking filter reads on the filter bar and its remove button. */
export function markFilterLabel(filter: MarkFilter): string {
  return `${filter.negate ? 'Filtered out' : 'Filtered to'} ${filter.markingName}: ${filter.summary}`;
}
