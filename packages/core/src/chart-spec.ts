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
