/**
 * The saved shape of a chart: which members sit in which well, and how it is
 * drawn. Engine-neutral by decision (CLAUDE.md) — nothing here mentions
 * ECharts, and the renderer reads this rather than the other way round.
 */

export type WellName = 'measures' | 'dimensions' | 'timeDimensions';

export interface ChartSpec {
  /** The cube or view the chart is built from. */
  readonly cube: string;
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  readonly timeDimensions: readonly string[];
  readonly chartType?: string;
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
  return { ...spec, [well]: spec[well].filter((existing) => existing !== member) };
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

  if (spec.timeDimensions.length > 0) {
    query['timeDimensions'] = [...spec.timeDimensions]
      .sort()
      .map((dimension) => ({ dimension, granularity: 'day' }));
  }

  return query;
}

/**
 * How many underlying rows the drawer asks for. A product decision, not a
 * figure from any source: direction.md §7a says the rows-behind drawer is "a
 * Cube `ungrouped` query, capped", without naming the cap.
 */
export const UNDERLYING_ROW_LIMIT = 100;

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
  return {
    measures: [...spec.measures].sort(),
    dimensions: [...spec.dimensions, ...spec.timeDimensions].sort(),
    ungrouped: true,
    limit,
  };
}
