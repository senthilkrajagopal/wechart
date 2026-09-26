import { asUtc, GRAIN_END, stamp } from './buckets';
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

// A bucket's span, shared with what a range marks and draws (T386's review).
export { asUtc } from './buckets';

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
  const start = new Date(asUtc(String(value)));
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
 * The complement of each operator whose NULL behaviour is known
 * (`markings-query-support.md` §1.5, §1.7). A positive operator never keeps a
 * NULL row, and a NULL row is never marked, so its complement must keep them:
 * `notEquals` and `notContains` do so of their own accord (§1.5's table);
 * every other complement takes `notSet` beside it, which is right whether or
 * not the operator already keeps NULLs. `notEquals` and `notContains` keep
 * NULLs, so their complements are plain `equals` and `contains`. The other
 * negative operators' NULL behaviour is not researched — `notInDateRange`'s
 * under Tesseract among them — so they are not negated at all.
 */
const COMPLEMENT: Readonly<
  Record<string, { readonly operator: string; readonly blanks: boolean }>
> = {
  equals: { operator: 'notEquals', blanks: false },
  notEquals: { operator: 'equals', blanks: false },
  contains: { operator: 'notContains', blanks: false },
  notContains: { operator: 'contains', blanks: false },
  startsWith: { operator: 'notStartsWith', blanks: true },
  endsWith: { operator: 'notEndsWith', blanks: true },
  gt: { operator: 'lte', blanks: true },
  gte: { operator: 'lt', blanks: true },
  lt: { operator: 'gte', blanks: true },
  lte: { operator: 'gt', blanks: true },
  inDateRange: { operator: 'notInDateRange', blanks: true },
  beforeDate: { operator: 'afterOrOnDate', blanks: true },
  beforeOrOnDate: { operator: 'afterDate', blanks: true },
  afterDate: { operator: 'beforeOrOnDate', blanks: true },
  afterOrOnDate: { operator: 'beforeDate', blanks: true },
};

/**
 * A Cube filter's negation (AC-113's "Filter out marked"). Cube has no `not`,
 * so it is De Morgan over the tree: an `and` becomes an `or` of the negated
 * parts and the other way round, and each leaf its complement. Undefined when
 * any leaf's complement is not known, so the action is refused rather than
 * answered wrongly.
 */
export function negatedFilter(filter: Filter): Filter | undefined {
  for (const [group, flipped] of [
    ['and', 'or'],
    ['or', 'and'],
  ] as const) {
    const parts = filter[group];
    if (Array.isArray(parts)) {
      const negated = (parts as Filter[]).map(negatedFilter);
      return negated.every((part): part is Filter => part !== undefined)
        ? { [flipped]: negated }
        : undefined;
    }
  }
  const { member, operator } = filter;
  if (operator === 'set') return { member, operator: 'notSet' };
  if (operator === 'notSet') return { member, operator: 'set' };
  const complement = typeof operator === 'string' ? COMPLEMENT[operator] : undefined;
  if (complement === undefined) return undefined;
  const flipped: Filter = { ...filter, operator: complement.operator };
  return complement.blanks ? { or: [flipped, { member, operator: 'notSet' }] } : flipped;
}

/**
 * A marking as one dashboard filter, or its negation (AC-113, direction.md
 * rule 53): "Filter to marked" keeps exactly the marked rows, "Filter out
 * marked" every other row, blanks included. Refused, with the reason, when
 * nothing is marked, when every row is (there is nothing to filter to, or
 * nothing would be left), or when the marking holds a filter whose negation
 * is not known.
 */
export function markedFilter(
  predicate: MarkingPredicate,
  negate: boolean,
):
  | { readonly filter: Filter }
  /** `everything` when every row is marked: its rows are all the tile's. */
  | { readonly refused: string; readonly everything?: true } {
  const positive = predicateFilter(predicate);
  if (positive === undefined) return { refused: 'Nothing is marked.' };
  if (positive === EVERYTHING) {
    return {
      refused: negate
        ? 'Every row is marked, so filtering the marked rows out would leave nothing.'
        : 'Every row is marked, so filtering to the marked rows would change nothing.',
      everything: true,
    };
  }
  if (!negate) return { filter: positive };
  const negated = negatedFilter(positive);
  return negated === undefined
    ? {
        refused:
          'This marking holds a filter that cannot be reversed, so it cannot be filtered out.',
      }
    : { filter: negated };
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
