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

/**
 * Everything one tile shows, marked with "Mark all" (AC-115): the tile's own
 * filters as it was drawn — a Cube filter each, ANDed — rather than a list of
 * what they matched then. So it is exempt from the item cap (AC-102: "because
 * it stores the tile's filter rather than a list"), and keeps meaning
 * "everything there" as the data changes. No filters is every row.
 */
export interface WholeTile {
  /** The tile it was marked on, which draws every item marked. */
  readonly tileId: string;
  readonly filters: readonly Readonly<Record<string, unknown>>[];
  /** How many items the tile showed when marked: what its badge counts. */
  readonly count: number;
}

export interface MarkingPredicate {
  /** Marked items. A row matches the predicate if it matches any of them. */
  readonly items: readonly MarkedItem[];
  /** Marked ranges, likewise alternatives rather than restrictions. */
  readonly ranges: readonly BoundedRange[];
  /** Whole tiles marked with "Mark all", likewise alternatives. */
  readonly wholes?: readonly WholeTile[];
}

export const EMPTY_PREDICATE: MarkingPredicate = { items: [], ranges: [] };

export function isEmptyPredicate(predicate: MarkingPredicate): boolean {
  return (
    predicate.items.length === 0 &&
    predicate.ranges.length === 0 &&
    (predicate.wholes ?? []).length === 0
  );
}

/** How many items a marking holds: its items, its ranges, and what each whole tile showed. */
export function markedCount(predicate: MarkingPredicate): number {
  return (
    predicate.items.length +
    predicate.ranges.length +
    (predicate.wholes ?? []).reduce((sum, whole) => sum + whole.count, 0)
  );
}

type Filter = Readonly<Record<string, unknown>>;

/**
 * Whether a row passes a Cube filter, read as Cube reads it
 * (research/cube/data-apis.md, the filter operators), for drawing a whole
 * tile's marking on another tile's rows. A row without the member cannot be
 * said to pass: like an item it names nothing, it marks nothing there.
 */
function passes(filter: Filter, row: Record<string, unknown>): boolean {
  const any = filter['or'];
  if (Array.isArray(any)) return (any as Filter[]).some((each) => passes(each, row));
  const all = filter['and'];
  if (Array.isArray(all)) return (all as Filter[]).every((each) => passes(each, row));
  const member = filter['member'];
  if (typeof member !== 'string' || !(member in row)) return false;
  const value = row[member];
  const values = (Array.isArray(filter['values']) ? (filter['values'] as unknown[]) : []).map(
    String,
  );
  const text = value === null || value === undefined ? undefined : String(value);
  const number = Number(value);
  switch (filter['operator']) {
    case 'equals':
      return text !== undefined && values.includes(text);
    case 'notEquals':
      return text === undefined || !values.includes(text);
    case 'set':
      return text !== undefined;
    case 'notSet':
      return text === undefined;
    case 'contains':
      return (
        text !== undefined && values.some((each) => text.toLowerCase().includes(each.toLowerCase()))
      );
    case 'notContains':
      return (
        text === undefined ||
        !values.some((each) => text.toLowerCase().includes(each.toLowerCase()))
      );
    case 'startsWith':
      return text !== undefined && values.some((each) => text.startsWith(each));
    case 'endsWith':
      return text !== undefined && values.some((each) => text.endsWith(each));
    case 'gt':
      return values.some((each) => number > Number(each));
    case 'gte':
      return values.some((each) => number >= Number(each));
    case 'lt':
      return values.some((each) => number < Number(each));
    case 'lte':
      return values.some((each) => number <= Number(each));
    case 'inDateRange':
      return (
        text !== undefined && text >= (values[0] ?? '') && text.slice(0, 10) <= (values[1] ?? '')
      );
    case 'notInDateRange':
      return (
        text !== undefined && (text < (values[0] ?? '') || text.slice(0, 10) > (values[1] ?? ''))
      );
    case 'beforeDate':
      return text !== undefined && text < (values[0] ?? '');
    case 'afterDate':
      return text !== undefined && text > (values[0] ?? '');
    default:
      // An operator not read here claims nothing.
      return false;
  }
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

  return (
    predicate.items.some(matchesItem) ||
    predicate.ranges.some(inRange) ||
    (predicate.wholes ?? []).some((whole) => whole.filters.every((filter) => passes(filter, row)))
  );
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
