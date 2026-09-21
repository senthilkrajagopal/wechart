/**
 * What a marking stores: a predicate over Cube dimension members (AC-086,
 * direction.md rule 46).
 *
 * Never row numbers or result positions, and the reason is not tidiness.
 * `references-markings.md`: "In-memory row indexes don't exist behind Cube",
 * which is why Spotfire marks symbolically for every in-database table. A
 * marking stored as "rows 3, 7 and 12" means nothing once the query is re-run
 * with a different sort or a different filter — it would go on marking
 * whatever now sits in those positions, which is worse than marking nothing.
 *
 * The shape is a union of conjunctions, which is what a marked item is: one
 * bar in "orders by status and category" is *status = paid AND category =
 * Components*, and marking a second bar adds an alternative rather than
 * narrowing the first. Bounded ranges sit beside the tuples for Spotfire's
 * range-based marking, kept because "bounds are symbolic" in the same way.
 */

/** One member, optionally at a granularity, equal to one value. */
export interface MemberValue {
  /** A Cube member name, such as `orders.status`. */
  readonly member: string;
  /**
   * For a time dimension: the granularity the value is expressed at. Cube's
   * predefined granularities are second to year, and a model may declare its
   * own, so this is not a closed set.
   */
  readonly granularity?: string;
  readonly value: string | number | boolean | null;
}

/** A bounded range over one member. Both ends are included. */
export interface BoundedRange {
  readonly member: string;
  readonly granularity?: string;
  readonly from: string | number;
  readonly to: string | number;
}

/**
 * One marked item: every member value that identifies it, all of which must
 * hold. A tuple of nothing would match every row, so it is not a valid item —
 * `predicateProblems` says so.
 */
export type MarkedItem = readonly MemberValue[];

export interface MarkingPredicate {
  /** Marked items. A row matches the predicate if it matches any of them. */
  readonly items: readonly MarkedItem[];
  /** Marked ranges, likewise alternatives rather than restrictions. */
  readonly ranges: readonly BoundedRange[];
}

export const EMPTY_PREDICATE: MarkingPredicate = { items: [], ranges: [] };

export function isEmptyPredicate(predicate: MarkingPredicate): boolean {
  return predicate.items.length === 0 && predicate.ranges.length === 0;
}

/** The predicate with one more marked item in it. */
export function withItem(predicate: MarkingPredicate, item: MarkedItem): MarkingPredicate {
  return { ...predicate, items: [...predicate.items, item] };
}

/** The predicate with one more marked range in it. */
export function withRange(predicate: MarkingPredicate, range: BoundedRange): MarkingPredicate {
  return { ...predicate, ranges: [...predicate.ranges, range] };
}

/**
 * Whether a result row is marked.
 *
 * Reads the row by member name, which is the whole point: the same row is
 * marked wherever it appears in the result and however the result is sorted,
 * and an item that is no longer in the result simply marks nothing rather
 * than marking whatever took its place.
 */
export function matchesPredicate(
  predicate: MarkingPredicate,
  row: Record<string, unknown> | undefined,
): boolean {
  if (row === undefined) return false;

  const matchesItem = (item: MarkedItem) =>
    item.length > 0 && item.every((part) => row[keyOf(part)] === part.value);

  const inRange = (range: BoundedRange) => {
    const value = row[keyOf(range)];
    if (typeof value === 'number' && typeof range.from === 'number') {
      return value >= range.from && value <= Number(range.to);
    }
    if (typeof value === 'string') return value >= String(range.from) && value <= String(range.to);
    return false;
  };

  return predicate.items.some(matchesItem) || predicate.ranges.some(inRange);
}

/**
 * A row is addressed by member name.
 *
 * The granularity is stored — AC-086 asks for "tuples of member, granularity
 * and value" — because it is part of what was marked: March at month
 * granularity and 1 March at day granularity are different marks even where
 * the value string looks similar. It is deliberately *not* folded into the
 * lookup key here. Cube may return a granular time dimension under a suffixed
 * key, but `docs/research/cube/data-apis.md` does not say so, and inventing
 * the response shape is exactly the guess CLAUDE.md forbids. The task that
 * translates a predicate into a Cube filter needs that answer and should
 * research it; until then nothing depends on it.
 */
function keyOf(part: { member: string; granularity?: string }): string {
  return part.member;
}

/**
 * What is wrong with a stored predicate, in words, or nothing when it holds.
 *
 * Markings are persisted, so a predicate arrives from the database and can be
 * anything. The dangerous shape is not a malformed one — it is a tuple with no
 * members, because a conjunction of nothing is true and it would mark every
 * row on every tile.
 */
export function predicateProblems(predicate: MarkingPredicate): readonly string[] {
  const problems: string[] = [];

  if (predicate.items.some((item) => item.length === 0)) problems.push('a tuple with no members');
  if (predicate.items.some((item) => item.some((part) => !part.member))) {
    problems.push('a tuple with no member');
  }
  if (predicate.ranges.some((range) => range.from === undefined || range.to === undefined)) {
    problems.push('a range with no bounds');
  }
  if (
    predicate.ranges.some(
      (range) => range.from !== undefined && range.to !== undefined && range.from > range.to,
    )
  ) {
    problems.push('a range that ends before it starts');
  }

  return problems;
}
