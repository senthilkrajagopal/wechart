/**
 * Why Cube did not serve a query from a rollup (T150, AC-144).
 *
 * Whether it does is Cube's to say — `/v1/sql` names the pre-aggregations it
 * will use, and that is what the panel reports as a match. Why it does not is
 * worked out here from what Cube matches on: the dry run's transformed query
 * (its leaf measures and their additivity, the dimensions and time dimensions
 * the query owns, and Cube's own granularity hierarchies), against the rollups
 * Cube compiled (`/v1/meta?extended=true`), by the matcher's additive rules:
 * every leaf measure, dimension and filtered member in the rollup, and each
 * time dimension at a granularity the rollup's can make
 * (research/cube/pre-aggregations.md §2, and "Observed locally" for the
 * shapes).
 *
 * The rollup reported is the one nearest to serving the query — the fewest
 * members missing — and the member named is the first that stops it.
 */

export interface Rollup {
  /** `<cube>.<name>`, as Cube's `preAggregationId`. */
  readonly id: string;
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  readonly timeDimension?: string;
  readonly granularity?: string;
}

/** The dry run's `transformedQueries[0]`, the parts read here. */
export interface Transformed {
  readonly leafMeasures?: readonly string[];
  readonly measureToLeafMeasures?: Readonly<
    Record<string, readonly { measure: string; additive: boolean; type?: string }[]>
  >;
  readonly ownedDimensions?: readonly string[];
  readonly ownedTimeDimensionsWithRollupGranularity?: readonly (readonly [string, string])[];
  readonly granularityHierarchies?: Readonly<Record<string, readonly string[]>>;
}

export interface Miss {
  /** The rollup nearest to serving it; null when its cubes have none. */
  readonly rollup: string | null;
  /** The member that stops it. */
  readonly member: string;
  readonly reason: string;
}

type Query = Record<string, unknown>;

/** `"[count, CUBE.total_amount, orders.status]"` → full member names. */
function references(text: unknown, cube: string): string[] {
  if (typeof text !== 'string') return [];
  return text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '')
    .map((each) => {
      if (each.startsWith('CUBE.')) return `${cube}.${each.slice('CUBE.'.length)}`;
      return each.includes('.') ? each : `${cube}.${each}`;
    });
}

/**
 * Each cube's rollups, as Cube compiled them. Only `rollup`s: an original_sql
 * pre-aggregation caches a cube's SQL and serves no rollup match, and a
 * lambda or join is made of rollups listed here already.
 */
export function rollupsFrom(meta: unknown): Readonly<Record<string, Rollup[]>> {
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes)) return {};
  const byCube: Record<string, Rollup[]> = {};
  for (const cube of cubes as { name?: unknown; preAggregations?: unknown }[]) {
    if (typeof cube.name !== 'string') continue;
    const name = cube.name;
    const declared = Array.isArray(cube.preAggregations) ? cube.preAggregations : [];
    byCube[name] = (declared as Record<string, unknown>[])
      .filter((each) => each['type'] === 'rollup' && typeof each['name'] === 'string')
      .map((each) => {
        const time = references(each['timeDimensionReference'], name)[0];
        const granularity = each['granularity'];
        return {
          id: `${name}.${String(each['name'])}`,
          measures: references(each['measureReferences'], name),
          dimensions: references(each['dimensionReferences'], name),
          ...(time === undefined ? {} : { timeDimension: time }),
          ...(typeof granularity === 'string' ? { granularity } : {}),
        };
      });
  }
  return byCube;
}

const cubeOf = (member: string) => member.split('.')[0] ?? member;

/** Every member a query filters on, through `and` and `or`. */
function filtered(filters: unknown): string[] {
  if (!Array.isArray(filters)) return [];
  return (filters as Record<string, unknown>[]).flatMap((filter) => {
    if (Array.isArray(filter['and'])) return filtered(filter['and']);
    if (Array.isArray(filter['or'])) return filtered(filter['or']);
    const member = filter['member'] ?? filter['dimension'];
    return typeof member === 'string' ? [member] : [];
  });
}

const sameMembers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** What stops one rollup serving the query, in the order Cube checks. */
function blockers(transformed: Transformed, query: Query, rollup: Rollup): Omit<Miss, 'rollup'>[] {
  const found: Omit<Miss, 'rollup'>[] = [];
  const leaves = transformed.leafMeasures ?? [];
  const dimensions = transformed.ownedDimensions ?? [];
  const times = transformed.ownedTimeDimensionsWithRollupGranularity ?? [];

  for (const measure of leaves)
    if (!rollup.measures.includes(measure))
      found.push({ member: measure, reason: `${measure} is not one of the rollup’s measures.` });
  for (const dimension of dimensions)
    if (!rollup.dimensions.includes(dimension))
      found.push({
        member: dimension,
        reason: `${dimension} is not one of the rollup’s dimensions.`,
      });
  for (const member of new Set(filtered(query['filters'])))
    if (!rollup.dimensions.includes(member) && member !== rollup.timeDimension)
      found.push({
        member,
        reason: `${member} is filtered on, and is not one of the rollup’s dimensions.`,
      });
  for (const [dimension, granularity] of times) {
    if (dimension !== rollup.timeDimension) {
      found.push({
        member: dimension,
        reason:
          rollup.timeDimension === undefined
            ? `${dimension} is grouped by ${granularity}, and the rollup has no time dimension.`
            : `${dimension} is not the rollup’s time dimension (${rollup.timeDimension}).`,
      });
      continue;
    }
    const serves = transformed.granularityHierarchies?.[`${dimension}.${granularity}`] ?? [
      granularity,
    ];
    if (rollup.granularity === undefined || !serves.includes(rollup.granularity))
      found.push({
        member: dimension,
        reason: `${dimension} is grouped by ${granularity}, and the rollup keeps it by ${rollup.granularity ?? 'no granularity'}.`,
      });
  }

  // A measure that does not add up can only be read from a rollup grouped
  // exactly as the query is (the matcher's non-additive path).
  const exact =
    sameMembers(dimensions, rollup.dimensions) &&
    times.every(([dimension]) => dimension === rollup.timeDimension) &&
    times.length > 0 === (rollup.timeDimension !== undefined && rollup.granularity !== undefined);
  if (!exact)
    for (const [measure, parts] of Object.entries(transformed.measureToLeafMeasures ?? {})) {
      const part = parts.find((each) => !each.additive);
      if (part !== undefined && rollup.measures.includes(part.measure))
        found.push({
          member: measure,
          reason: `${measure} does not add up${part.type === undefined ? '' : ` (${part.type})`}, so only a rollup grouped exactly as the query can serve it.`,
        });
    }
  return found;
}

export function missOf(
  transformed: Transformed,
  query: Query,
  rollups: Readonly<Record<string, readonly Rollup[]>>,
): Miss {
  const members = [
    ...(transformed.leafMeasures ?? []),
    ...(transformed.ownedDimensions ?? []),
    ...(transformed.ownedTimeDimensionsWithRollupGranularity ?? []).map(([dimension]) => dimension),
  ];
  const cubes = [...new Set(members.map(cubeOf))];
  const first = transformed.leafMeasures?.[0] ?? members[0] ?? '';
  const candidates = cubes.flatMap((cube) => rollups[cube] ?? []);
  if (candidates.length === 0)
    return {
      rollup: null,
      member: first,
      reason: `${cubes.length > 0 ? cubes.join(', ') : 'Its cube'} ${cubes.length > 1 ? 'have' : 'has'} no pre-aggregations.`,
    };

  let nearest: { rollup: Rollup; found: Omit<Miss, 'rollup'>[] } | undefined;
  for (const rollup of candidates) {
    const found = blockers(transformed, query, rollup);
    if (nearest === undefined || found.length < nearest.found.length) nearest = { rollup, found };
  }
  const { rollup, found } = nearest as { rollup: Rollup; found: Omit<Miss, 'rollup'>[] };
  const blocking = found[0];
  if (blocking !== undefined) return { rollup: rollup.id, ...blocking };

  // Every member is in it and Cube still did not use it: what the additive
  // rules do not cover here — a date range off the rollup's granularity, or
  // a time zone it was not built in (research §2, "Time dimensions").
  const time = (query['timeDimensions'] as { dimension?: unknown }[] | undefined)?.find(
    (each) => typeof each.dimension === 'string',
  )?.dimension;
  return {
    rollup: rollup.id,
    member: typeof time === 'string' ? time : first,
    reason: `Cube did not use ${rollup.id}, though it has every member the query asks for: the date range may not line up with its ${rollup.granularity ?? 'granularity'}, or the time zone with the one it was built in.`,
  };
}
