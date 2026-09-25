import type { LimitCombination } from './limit-by';
import {
  isEmptyPredicate,
  type BoundedRange,
  type MarkedItem,
  type MarkingPredicate,
  type WholeTile,
} from './predicate';

/**
 * What a marking adds to a limited tile's Cube query (AC-107, direction.md
 * rule 33).
 *
 * **In the query, not in the rows.** A details tile limited by a marking asks
 * Cube a narrower question and draws the answer; filtering rows afterwards
 * would leave every aggregate computed over everything, so a "total" would
 * not be the total of what is shown.
 *
 * Cube's own shapes: `{or: […]}` and `{and: […]}` nest, and a filter is
 * `{member, operator, values}` (`docs/research/cube/data-apis.md`). Three
 * rules from `markings-query-support.md` shape what is emitted, and each is
 * a silent wrong answer if ignored: a time bucket is a span (`inDateRange`,
 * §1.2), a marked NULL is `notSet` (§1.5), and dimension and measure filters
 * may not share a logical operator (`data-apis.md`:226) — see `rangeFilter`,
 * which is where that last one will bite.
 */
export type CubeFilter = Record<string, unknown>;
type Filter = CubeFilter;

/** The end of the bucket a granularity's start instant opens. */
const GRAIN_END: Readonly<Record<string, (start: Date) => Date>> = {
  second: (at) => new Date(at.getTime() + 999),
  minute: (at) => new Date(at.getTime() + 59_999),
  hour: (at) => new Date(at.getTime() + 3_599_999),
  day: (at) => new Date(at.getTime() + 86_399_999),
  week: (at) => new Date(at.getTime() + 7 * 86_400_000 - 1),
  month: (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1) - 1),
  quarter: (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 3, 1) - 1),
  year: (at) => new Date(Date.UTC(at.getUTCFullYear() + 1, 0, 1) - 1),
};

/** `YYYY-MM-DDTHH:mm:ss.SSS`, the form Cube's own `drillDown` emits. */
const stamp = (at: Date): string => at.toISOString().replace('Z', '');

/**
 * A marked time bucket, as the span it covers.
 *
 * **A bucket is not an instant.** `markings-query-support.md` §1.2: "A time
 * bucket like `orders.order_date.month` cannot be a filter member", and each
 * bucket is sent as `inDateRange` over `["<start>.000","<end>.999"]` — the
 * bounds `ResultSet.drillDown` computes by snapping to the granularity.
 * Emitted as `equals` on the raw member it would ask for rows at exactly
 * midnight on the first of the month, which is almost nothing, and the tile
 * would go quietly empty.
 *
 * An unknown granularity — a model may declare its own — falls back to
 * `equals`, because guessing a span we cannot derive would be worse than
 * asking for what was literally marked.
 */
function bucketFilter(member: string, granularity: string, value: unknown): Filter | undefined {
  const end = GRAIN_END[granularity];
  if (end === undefined) return undefined;
  const start = new Date(String(value));
  if (Number.isNaN(start.getTime())) return undefined;
  return { member, operator: 'inDateRange', values: [stamp(start), stamp(end(start))] };
}

/**
 * One member equal to one value — or, for a marked NULL, `notSet`.
 *
 * §1.5: "The docs only say 'use `notSet`' for NULL checks… Emit `notSet`/`set`
 * for documented behavior." `equals ['']` is not the same question: it
 * compiles to `col = ''`, which matches empty strings and never NULLs, so a
 * tile limited by a marking holding a null category would silently drop
 * exactly the rows that were marked.
 */
const equals = (
  member: string,
  value: string | number | boolean | null,
  granularity?: string,
): Filter => {
  if (value === null) return { member, operator: 'notSet' };
  if (granularity !== undefined) {
    const bucket = bucketFilter(member, granularity, value);
    if (bucket !== undefined) return bucket;
  }
  return { member, operator: 'equals', values: [String(value)] };
};

/**
 * A canonical order for filters that mean the same thing (AC-105).
 *
 * A marking is a *set*; the order its items arrived in is the user's clicking
 * history, which Cube has no opinion about. Sorting by the filter's own JSON
 * makes "the same items marked again" the same query — so the second time is
 * a cache hit rather than a second trip to the database — and it needs no
 * rule per shape, because two filters that are equal serialise equally.
 */
const canonical = <T>(filters: readonly T[]): T[] =>
  [...filters].sort((one, other) => {
    const left = JSON.stringify(one);
    const right = JSON.stringify(other);
    // A real three-way comparison, including the tie. Returning -1 or 1 for
    // equal keys is not a consistent comparator, and a sort given one is free
    // to order equal elements differently on different inputs — which is
    // exactly the instability AC-105 is about.
    return left < right ? -1 : left > right ? 1 : 0;
  });

/** One marked item: every member it names, together. */
function itemFilter(item: MarkedItem): Filter | undefined {
  const parts = canonical(item.map((part) => equals(part.member, part.value, part.granularity)));
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? (parts[0] as Filter) : { and: parts };
}

/**
 * The marked items of a marking.
 *
 * **Items of one plain member collapse to a single `equals`** carrying every
 * value: the shape Cube matches pre-aggregations on, and the one a reader
 * recognises in the SQL. An OR of single-value `equals` would mean the same
 * and read like a machine wrote it.
 *
 * Two things block the collapse. A granularity makes the member a *bucket*,
 * which is a range rather than a value, and a marked NULL needs `notSet`,
 * which has no `values` list to join — §1.6 puts it beside the `equals` in an
 * `or` instead.
 */
function itemFilters(items: readonly MarkedItem[]): Filter[] {
  const members = new Set(items.flatMap((item) => item.map((part) => part.member)));
  const collapsible =
    members.size === 1 &&
    items.every((item) => item.length === 1 && item[0]?.granularity === undefined);

  if (!collapsible)
    return items.map(itemFilter).filter((filter): filter is Filter => filter !== undefined);

  const member = [...members][0] as string;
  const values = items.map((item) => item[0]?.value).filter((value) => value !== null);
  const marked: Filter[] = [];
  if (values.length > 0)
    marked.push({ member, operator: 'equals', values: canonical(values.map(String)) });
  if (values.length < items.length) marked.push({ member, operator: 'notSet' });
  return marked;
}

/**
 * One marked range.
 *
 * A range over a *time* member is `inDateRange` over its two ends, for the
 * same reason a bucket is (§1.2). A range over anything else is `gte`/`lte`,
 * which `data-apis.md` documents for "measures; number dimensions".
 *
 * **A range over a measure cannot share a logical operator with a dimension
 * filter** — data-apis.md:226, "You can not put dimensions and measures
 * filters in the same logical operator". This function cannot tell the two
 * apart: a predicate names members, and only the model knows which are
 * measures. Today nothing produces such a range — range mode is AC-093, and
 * unbuilt — so the constraint is recorded here rather than guessed at, and
 * AC-093 must supply the member kinds when it lands.
 */
function rangeFilter(range: BoundedRange): Filter {
  if (range.granularity !== undefined) {
    const from = bucketFilter(range.member, range.granularity, range.from);
    const to = bucketFilter(range.member, range.granularity, range.to);
    if (from !== undefined && to !== undefined)
      return {
        member: range.member,
        operator: 'inDateRange',
        values: [
          (from['values'] as string[])[0] as string,
          (to['values'] as string[])[1] as string,
        ],
      };
  }
  return {
    and: [
      { member: range.member, operator: 'gte', values: [String(range.from)] },
      { member: range.member, operator: 'lte', values: [String(range.to)] },
    ],
  };
}

/** A marking that marks every row: one with a whole tile drawn with no filter (AC-115). */
const EVERYTHING = 'everything';

/** A whole tile (AC-115): what it was filtered by, ANDed; with nothing, every row. */
function wholeFilter(whole: WholeTile): Filter | typeof EVERYTHING {
  const filters = whole.filters as Filter[];
  if (filters.length === 0) return EVERYTHING;
  return filters.length === 1 ? (filters[0] as Filter) : { and: filters };
}

/** One marking: any of its items, any of its ranges, and any whole tile. */
function predicateFilter(predicate: MarkingPredicate): Filter | typeof EVERYTHING | undefined {
  if (isEmptyPredicate(predicate)) return undefined;

  const wholes = (predicate.wholes ?? []).map(wholeFilter);
  if (wholes.includes(EVERYTHING)) return EVERYTHING;
  const parts = canonical([
    ...itemFilters(predicate.items),
    ...predicate.ranges.map(rangeFilter),
    ...(wholes as Filter[]),
  ]);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? (parts[0] as Filter) : { or: parts };
}

/**
 * The filter for every marking limiting a tile, combined as the tile is set.
 *
 * **An empty marking is skipped, not applied.** Treated as "match nothing" it
 * would empty a tile limited by two markings whenever either was untouched,
 * which is this criterion's own failing state; rule 33 says the same.
 */
export function limitFilterFor(
  markings: readonly MarkingPredicate[],
  combination: LimitCombination,
): Filter | undefined {
  const each = markings.map(predicateFilter);
  // A marking of every row limits nothing: any of them is then every row, and
  // all of them are the others.
  if (combination === 'any' && each.includes(EVERYTHING)) return undefined;
  const parts = each.filter(
    (filter): filter is Filter => filter !== undefined && filter !== EVERYTHING,
  );

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0] as Filter;
  return combination === 'any' ? { or: parts } : { and: parts };
}
