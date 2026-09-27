/**
 * The saved shape of a chart: which members sit in which well, and how it is
 * drawn. Engine-neutral by decision (CLAUDE.md) — nothing here mentions
 * ECharts, and the renderer reads this rather than the other way round.
 */

import type { MemberGranularities, TimeGranularity } from './format';
import type { ChartType } from './render-spec';

export type WellName = 'measures' | 'dimensions' | 'timeDimensions';

export interface ChartSpec {
  /** The cube or view the chart is built from. */
  readonly cube: string;
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  readonly timeDimensions: readonly string[];
  readonly chartType?: ChartType;
  /**
   * The grain a time member is asked at, where the user chose one from its
   * pill (AC-216); the day otherwise.
   */
  readonly granularities?: Readonly<Record<string, TimeGranularity>>;
  /** The chart's own filters, from its Filters well (AC-216). */
  readonly filters?: readonly ChartFilter[];
  /**
   * A box plot's "Each point is" (T400, AC-314): the dimension whose every
   * value within a category is one point, the measure computed once for it.
   * Unset, each row is a point.
   */
  readonly eachPointIs?: string;
}

/**
 * One of a chart's own filters (AC-216): a member held to, or kept from, some
 * of its values. One with no values yet — just added to the well — narrows
 * nothing, and is left out of the query.
 */
export interface ChartFilter {
  readonly member: string;
  readonly operator: 'equals' | 'notEquals';
  readonly values: readonly string[];
}

/** The chart's filters as Cube takes them: those with values, by member. */
function cubeFiltersOf(filters: readonly ChartFilter[] | undefined) {
  return (filters ?? [])
    .filter((filter) => filter.values.length > 0)
    .map((filter) => ({
      member: filter.member,
      operator: filter.operator,
      values: [...filter.values],
    }))
    .sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0));
}

export function emptySpec(cube = ''): ChartSpec {
  return { cube, measures: [], dimensions: [], timeDimensions: [] };
}

/**
 * Add a member to a well.
 *
 * Adding a member a well already holds is a no-op rather than a duplicate: a
 * second drop of the same field is the user missing, not asking for the
 * measure twice.
 */
export function addToWell(spec: ChartSpec, well: WellName, member: string): ChartSpec {
  if (spec[well].includes(member)) return spec;
  return { ...spec, [well]: [...spec[well], member] };
}

export function removeFromWell(spec: ChartSpec, well: WellName, member: string): ChartSpec {
  const removed = { ...spec, [well]: spec[well].filter((existing) => existing !== member) };
  // Its chosen grain goes with it, so none lingers in what is saved (T229's
  // review) and the field comes back at the day if added again.
  if (spec.granularities?.[member] === undefined) return removed;
  const granularities = Object.fromEntries(
    Object.entries(spec.granularities).filter(([name]) => name !== member),
  );
  if (Object.keys(granularities).length > 0) return { ...removed, granularities };
  return Object.fromEntries(
    Object.entries(removed).filter(([key]) => key !== 'granularities'),
  ) as unknown as ChartSpec;
}

/** Which well a member belongs in, from its kind in the metadata. */
export function wellFor(kind: string): WellName | null {
  switch (kind) {
    case 'measure':
      return 'measures';
    case 'dimension':
      return 'dimensions';
    case 'timeDimension':
      return 'timeDimensions';
    default:
      return null;
  }
}

export function isEmpty(spec: ChartSpec): boolean {
  return (
    spec.measures.length === 0 && spec.dimensions.length === 0 && spec.timeDimensions.length === 0
  );
}

/**
 * The Cube query a spec asks for.
 *
 * Time dimensions travel in `timeDimensions`, not `dimensions` — Cube treats
 * them differently, and `timeDimensions[].dateRange` is the only date form that
 * can match a pre-aggregation (research/cube/markings-query-support.md).
 *
 * Members are sorted so that the same spec always produces byte-identical
 * query JSON, which is what lets a result be served from cache (AC-105).
 */
export function toCubeQuery(spec: ChartSpec): Record<string, unknown> {
  const query: Record<string, unknown> = {
    measures: [...spec.measures].sort(),
    dimensions: [...spec.dimensions].sort(),
  };

  // A box plot summarises the rows themselves (T399, AC-306): ungrouped, so
  // each row is one observation, and as many as Cube returns in one query.
  // Unordered: by default Cube sorts by the first measure, descending, so past
  // the limit the boxes would be drawn from one tail (research/box-plot.md).
  if (spec.chartType === 'boxplot') {
    const filters = cubeFiltersOf(spec.filters);
    // "Each point is" (T400, AC-314): grouped by the category — the first
    // dimension, which the boxes are drawn by (compile.ts) — and that field
    // alone, so Cube computes the measure once per value of it within each
    // category. Any other dimension in the well would split the points further.
    const grain = spec.eachPointIs;
    const category = spec.dimensions.slice(0, 1);
    return {
      ...query,
      ...(grain === undefined ? {} : { dimensions: [...new Set([...category, grain])].sort() }),
      ...(filters.length > 0 ? { filters } : {}),
      ...(grain === undefined ? { ungrouped: true } : {}),
      order: [],
      limit: BOX_PLOT_ROW_LIMIT,
      // Cube cuts rows at the limit without a word: its count of them all,
      // as if there were none, says when it has (T401, AC-315).
      total: true,
    };
  }

  if (spec.timeDimensions.length > 0) {
    const grains = granularitiesOf(spec.timeDimensions, spec.granularities);
    query['timeDimensions'] = [...spec.timeDimensions]
      .sort()
      .map((dimension) => ({ dimension, granularity: grains[dimension] ?? QUERY_GRANULARITY }));
  }

  const filters = cubeFiltersOf(spec.filters);
  if (filters.length > 0) query['filters'] = filters;

  return query;
}

/**
 * The granularity every time dimension is asked at. One constant, because the
 * rows are bucketed by it and their labels are written by it (AC-188): two
 * places deciding separately would label months as days.
 */
export const QUERY_GRANULARITY: TimeGranularity = 'day';

/**
 * Each time member of the wells, with the granularity its query asks for:
 * the one chosen for it (AC-216), or the day.
 */
export function granularitiesOf(
  timeDimensions: readonly string[],
  chosen: Readonly<Record<string, TimeGranularity>> = {},
): MemberGranularities {
  return Object.fromEntries(
    timeDimensions.map((member) => [member, chosen[member] ?? QUERY_GRANULARITY]),
  );
}

/**
 * How many underlying rows the drawer asks for. A product decision, not a
 * figure from any source: direction.md §7a says the rows-behind drawer is "a
 * Cube `ungrouped` query, capped", without naming the cap.
 */
export const UNDERLYING_ROW_LIMIT = 100;

/**
 * The most rows a box plot asks for: Cube's maximum for one query without
 * `CUBEJS_DB_QUERY_LIMIT` raised; a larger limit is refused, not capped
 * (research/box-plot.md §5). Past it, the box plot says it was computed from
 * part of the data (AC-315, T401).
 */
export const BOX_PLOT_ROW_LIMIT = 50_000;

/**
 * The rows underneath a chart's aggregate: the same query with no `GROUP BY`
 * (AC-036).
 *
 * Built from the same spec as `toCubeQuery`, so the two cannot name different
 * members — the drawer showing "data from a different query than the chart
 * rendered" is the criterion's own failing state.
 *
 * Two details are verified against Cube 1.7.42 rather than assumed:
 *
 * - `ungrouped` needs every cube's primary key *unless*
 *   `allow_ungrouped_without_primary_key`, which at 1.7.42 inherits
 *   `CUBESQL_SQL_PUSH_DOWN` and so defaults to on
 *   (research/cube/markings-query-support.md §"Corrections"). Confirmed
 *   against the running server: `customers`, whose primary key is not public,
 *   returns ungrouped rows.
 * - A time member travels in `dimensions` here, not in `timeDimensions`.
 *   Without a granularity Cube "filters without grouping"
 *   (research/cube/data-apis.md §"Time dimensions"), so a bare
 *   `timeDimensions` entry selects no column at all — confirmed: the same
 *   query returns `orders.ordered_at` from `dimensions` and omits it from
 *   `timeDimensions`. Ungrouped rows want the raw timestamp, not a bucket.
 */
export function toUnderlyingQuery(
  spec: ChartSpec,
  limit: number = UNDERLYING_ROW_LIMIT,
): Record<string, unknown> {
  const filters = cubeFiltersOf(spec.filters);
  return {
    measures: [...spec.measures].sort(),
    dimensions: [...spec.dimensions, ...spec.timeDimensions].sort(),
    // The rows the chart was filtered to, not all of them (AC-216).
    ...(filters.length === 0 ? {} : { filters }),
    ungrouped: true,
    limit,
  };
}
