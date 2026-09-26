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

import { rangeEndOf } from './buckets';

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
  /**
   * The member the tile's items are values of: a tile that cannot reach it
   * cannot be marked by the whole, and says so (AC-103).
   */
  readonly member?: string;
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

/** The members a Cube filter reads, its groups' too. */
function filterMembers(filter: Filter): string[] {
  const groups = [filter['or'], filter['and']].filter(Array.isArray) as Filter[][];
  if (groups.length > 0) return groups.flatMap((group) => group.flatMap(filterMembers));
  return typeof filter['member'] === 'string' ? [filter['member']] : [];
}

/**
 * Every member a marking names — its items', its ranges', and each whole
 * tile's own and its filters' — once each, in order: what a tile must reach
 * to show the marking (AC-103).
 */
export function markingMembers(predicate: MarkingPredicate): string[] {
  const members = [
    ...predicate.items.flatMap((item) => item.map((part) => part.member)),
    ...predicate.ranges.map((range) => range.member),
    ...(predicate.wholes ?? []).flatMap((whole) => [
      ...(whole.member === undefined ? [] : [whole.member]),
      ...whole.filters.flatMap(filterMembers),
    ]),
  ];
  return [...new Set(members)];
}

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
  // A NULL (or blank) passes no comparison, as in SQL; only `notSet` claims it.
  if (value === null || value === undefined || value === '') return filter['operator'] === 'notSet';
  const text = String(value);
  const lower = text.toLowerCase();
  const number = Number(value);
  // Cube's text operators are a case-insensitive LIKE (data-apis.md).
  const like = (test: (needle: string) => boolean) =>
    values.some((each) => test(each.toLowerCase()));
  /** A day as a bound: its first instant as a start, its last as an end, as ISO text. */
  const bound = (at: string | undefined, end: boolean) =>
    at !== undefined && end && /^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T23:59:59.999` : at;
  const from = bound(values[0], false) ?? '';
  const to = bound(values[1] ?? values[0], true) ?? '';
  // A relative range ("last 7 days") is Cube's to resolve: no row claims it here.
  const dated = (at: string) => /^\d{4}-\d{2}-\d{2}/.test(at);
  switch (filter['operator']) {
    case 'equals':
      return values.includes(text);
    case 'notEquals':
      return !values.includes(text);
    case 'set':
      return true;
    case 'contains':
      return like((each) => lower.includes(each));
    case 'notContains':
      return !like((each) => lower.includes(each));
    case 'startsWith':
      return like((each) => lower.startsWith(each));
    case 'notStartsWith':
      return !like((each) => lower.startsWith(each));
    case 'endsWith':
      return like((each) => lower.endsWith(each));
    case 'notEndsWith':
      return !like((each) => lower.endsWith(each));
    case 'gt':
      return values.some((each) => number > Number(each));
    case 'gte':
      return values.some((each) => number >= Number(each));
    case 'lt':
      return values.some((each) => number < Number(each));
    case 'lte':
      return values.some((each) => number <= Number(each));
    case 'inDateRange':
      return dated(from) && dated(to) && text >= from && text <= to;
    case 'notInDateRange':
      return dated(from) && dated(to) && (text < from || text > to);
    case 'beforeDate':
      return dated(from) && text < from;
    case 'beforeOrOnDate':
      return dated(to) && text <= to;
    case 'afterDate':
      return dated(to) && text > to;
    case 'afterOrOnDate':
      return dated(from) && text >= from;
    default:
      // An operator not read here — `notSet` on a value among them — claims nothing.
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
    // To the end of its last bucket, at the grain it was marked at (T386's review).
    if (typeof value === 'string')
      return value >= String(range.from) && value <= String(rangeEndOf(range));
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

/**
 * A predicate read from outside — a bookmark, a link (T128, T129) — if that is
 * what it is, and one that holds (`predicateProblems`); otherwise nothing.
 * JSON anyone can have written, so every part is checked, never trusted.
 */
export function predicateFrom(raw: unknown): MarkingPredicate | undefined {
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const named = (value: unknown): value is string => typeof value === 'string' && value !== '';
  const bound = (value: unknown): value is string | number =>
    typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
  const granularityOf = (value: Record<string, unknown>) =>
    value['granularity'] === undefined
      ? {}
      : named(value['granularity'])
        ? { granularity: value['granularity'] }
        : undefined;
  /** Each of a list read as one thing, or nothing if any isn't. */
  const each = <T>(value: unknown, read: (item: unknown) => T | undefined): T[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const out: T[] = [];
    for (const item of value) {
      const got = read(item);
      if (got === undefined) return undefined;
      out.push(got);
    }
    return out;
  };

  if (!record(raw)) return undefined;
  const items = each(raw['items'], (item) =>
    each(item, (part): MemberValue | undefined => {
      if (!record(part) || !named(part['member'])) return undefined;
      const value = part['value'];
      const granularity = granularityOf(part);
      if (granularity === undefined) return undefined;
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
        return undefined;
      return { member: part['member'], ...granularity, value: value as MemberValue['value'] };
    }),
  );
  const ranges = each(raw['ranges'], (range): BoundedRange | undefined => {
    if (!record(range) || !named(range['member'])) return undefined;
    const granularity = granularityOf(range);
    const { from, to } = range;
    if (granularity === undefined || !bound(from) || !bound(to)) return undefined;
    return { member: range['member'], ...granularity, from, to };
  });
  const wholes =
    raw['wholes'] === undefined
      ? []
      : each(raw['wholes'], (whole): WholeTile | undefined => {
          if (!record(whole) || !named(whole['tileId'])) return undefined;
          const filters = each(whole['filters'], (filter) => (record(filter) ? filter : undefined));
          const { count, member } = whole;
          if (filters === undefined || typeof count !== 'number' || !Number.isFinite(count))
            return undefined;
          if (member !== undefined && !named(member)) return undefined;
          return {
            tileId: whole['tileId'],
            ...(member === undefined ? {} : { member }),
            filters,
            count,
          };
        });
  if (items === undefined || ranges === undefined || wholes === undefined) return undefined;
  const predicate: MarkingPredicate = {
    items,
    ranges,
    ...(raw['wholes'] === undefined ? {} : { wholes }),
  };
  return predicateProblems(predicate).length === 0 ? predicate : undefined;
}
