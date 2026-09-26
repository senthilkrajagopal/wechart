/**
 * Why Cube did not serve a query from a rollup (T150, AC-144).
 *
 * Whether it does is Cube's to say — `/v1/sql` names the pre-aggregations it
 * will use, and that is what the panel reports as a match. Why it does not is
 * worked out here from what Cube matches on: the dry run's transformed query
 * (its leaf measures and their additivity, the dimensions — filtered ones and
 * segments included — and time dimensions the query owns, and Cube's own
 * granularity hierarchies), against the rollups Cube compiled
 * (`/v1/meta?extended=true`), by the matcher's rules: every leaf measure and
 * owned dimension in the rollup; each time dimension the rollup's, at a
 * granularity the rollup's can make; and a measure that does not add up only
 * from a rollup grouped exactly as the query (research/cube/
 * pre-aggregations.md §2, and "Observed locally" for the shapes).
 *
 * The rollup reported is the one nearest to serving the query — the fewest
 * members missing — and the member named is the first that stops it.
 */

export interface Rollup {
  /** `<cube>.<name>`, as Cube's `preAggregationId`. */
  readonly id: string;
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  /** Its segments: a query's segments are among its owned dimensions. */
  readonly segments?: readonly string[];
  readonly timeDimension?: string;
  readonly granularity?: string;
  /** `allow_non_strict_date_range_match: false`: matched on whole-period ranges only. */
  readonly strict?: true;
}

/** The dry run's `transformedQueries[0]`, the parts read here. */
export interface Transformed {
  readonly leafMeasures?: readonly string[];
  readonly measureToLeafMeasures?: Readonly<
    Record<string, readonly { measure: string; additive: boolean; type?: string }[]>
  >;
  readonly ownedDimensions?: readonly string[];
  readonly ownedTimeDimensionsWithRollupGranularity?: readonly (readonly [string, string | null])[];
  readonly ownedTimeDimensionsAsIs?: readonly (readonly [string, string | null])[];
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

/** How a reason writes a member or cube: as it is, unless told its title. */
export type Namer = (name: string) => string;
const asIs: Namer = (name) => name;

/**
 * Each cube's and member's title in the compiled model (`/v1/meta?extended`),
 * so a reason is written as a person reads the model (T403, AC-220): its
 * rules still match on names. A name the model doesn't title is written as
 * it is.
 */
export function titlesFrom(meta: unknown): Namer {
  const titles = new Map<string, string>();
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  for (const cube of Array.isArray(cubes) ? (cubes as Record<string, unknown>[]) : []) {
    if (typeof cube['name'] === 'string' && typeof cube['title'] === 'string')
      titles.set(cube['name'], cube['title']);
    for (const kind of ['measures', 'dimensions', 'segments'])
      for (const member of Array.isArray(cube[kind])
        ? (cube[kind] as Record<string, unknown>[])
        : [])
        if (typeof member['name'] === 'string' && typeof member['title'] === 'string')
          titles.set(member['name'], member['title']);
  }
  return (name) => titles.get(name) ?? name;
}

/**
 * A member by its own cube and name. The dry run spells a joined cube's member
 * by its join path from the query's root — `orders.customers.country` — where
 * the model and the query write `customers.country` (research, "Observed
 * locally"); compared as spelled, a rollup holding the member was blamed for
 * lacking it (T150's review).
 */
const own = (member: string) => member.split('.').slice(-2).join('.');

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
        const segments = references(each['segmentReferences'], name);
        return {
          id: `${name}.${String(each['name'])}`,
          measures: references(each['measureReferences'], name),
          dimensions: references(each['dimensionReferences'], name),
          ...(segments.length === 0 ? {} : { segments }),
          ...(time === undefined ? {} : { timeDimension: time }),
          ...(typeof granularity === 'string' ? { granularity } : {}),
          ...(each['allowNonStrictDateRangeMatch'] === false ? { strict: true as const } : {}),
        };
      });
  }
  return byCube;
}

const cubeOf = (member: string) => member.split('.')[0] ?? member;

/** Every member a query filters on, through `and` and `or`, by its own name. */
function filtered(filters: unknown): string[] {
  if (!Array.isArray(filters)) return [];
  return (filters as Record<string, unknown>[]).flatMap((filter) => {
    if (Array.isArray(filter['and'])) return filtered(filter['and']);
    if (Array.isArray(filter['or'])) return filtered(filter['or']);
    const member = filter['member'] ?? filter['dimension'];
    return typeof member === 'string' ? [own(member)] : [];
  });
}

/** The granularity the query itself asked a time dimension by, if any. */
function askedBy(query: Query, dimension: string): string | undefined {
  const asked = (
    query['timeDimensions'] as { dimension?: unknown; granularity?: unknown }[] | undefined
  )
    ?.filter((each) => typeof each.dimension === 'string' && own(each.dimension) === dimension)
    .map((each) => each.granularity)
    .find((granularity): granularity is string => typeof granularity === 'string');
  return asked;
}

const sameMembers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** What stops one rollup serving the query, in the order Cube checks. */
function blockers(
  transformed: Transformed,
  query: Query,
  rollup: Rollup,
  name: Namer,
): Omit<Miss, 'rollup'>[] {
  const found: Omit<Miss, 'rollup'>[] = [];
  const leaves = (transformed.leafMeasures ?? []).map(own);
  // Filtered dimensions and segments are among these; a filtered measure is not.
  const dimensions = (transformed.ownedDimensions ?? []).map(own);
  const servable = [...rollup.dimensions, ...(rollup.segments ?? [])];
  const filters = new Set(filtered(query['filters']));
  // A rollup that allows ranges off its periods is matched on the time
  // dimensions as asked; a strict one, on the granularity a range needs.
  const times = (
    (rollup.strict
      ? transformed.ownedTimeDimensionsWithRollupGranularity
      : (transformed.ownedTimeDimensionsAsIs ??
        transformed.ownedTimeDimensionsWithRollupGranularity)) ?? []
  ).map(([dimension, granularity]) => [own(dimension), granularity] as const);

  for (const measure of leaves)
    if (!rollup.measures.includes(measure))
      found.push({
        member: measure,
        reason: `${name(measure)} is not one of the rollup’s measures.`,
      });
  for (const dimension of dimensions)
    if (!servable.includes(dimension))
      found.push({
        member: dimension,
        reason: filters.has(dimension)
          ? `${name(dimension)} is filtered on, and is not one of the rollup’s dimensions.`
          : `${name(dimension)} is not one of the rollup’s dimensions.`,
      });
  for (const [dimension, granularity] of times) {
    if (dimension !== rollup.timeDimension) {
      found.push({
        member: dimension,
        reason:
          rollup.timeDimension === undefined
            ? `${name(dimension)} is in the query, and the rollup has no time dimension.`
            : `${name(dimension)} is not the rollup’s time dimension (${name(rollup.timeDimension)}).`,
      });
      continue;
    }
    // A date range with no grouping: the rollup's time dimension is enough.
    if (granularity === null) continue;
    const serves = transformed.granularityHierarchies?.[`${dimension}.${granularity}`] ?? [
      granularity,
    ];
    if (rollup.granularity === undefined || !serves.includes(rollup.granularity)) {
      const asked = askedBy(query, dimension);
      found.push({
        member: dimension,
        reason:
          asked !== undefined && asked !== granularity
            ? // By month over a range that is not whole months, for a rollup
              // that matches only whole periods.
              `${name(dimension)}’s date range is not whole ${rollup.granularity ?? 'periods'}, and the rollup matches only ranges that are.`
            : `${name(dimension)} is grouped by ${granularity}, and the rollup keeps it by ${rollup.granularity ?? 'no granularity'}.`,
      });
    }
  }

  // A measure that does not add up can only be read from a rollup grouped
  // exactly as the query is — the same dimensions, and the same time
  // dimension at the same granularity (the matcher's exact path).
  const exact =
    sameMembers(dimensions, servable) &&
    (times.length === 0
      ? rollup.timeDimension === undefined
      : times.every(
          ([dimension, granularity]) =>
            dimension === rollup.timeDimension && granularity === rollup.granularity,
        ));
  if (!exact)
    for (const [measure, parts] of Object.entries(transformed.measureToLeafMeasures ?? {})) {
      const part = parts.find((each) => !each.additive);
      if (part !== undefined && rollup.measures.includes(own(part.measure)))
        found.push({
          member: own(measure),
          reason: `${name(own(measure))} does not add up${part.type === undefined ? '' : ` (${part.type})`}, so only a rollup grouped exactly as the query can serve it.`,
        });
    }
  return found;
}

/** The query's first member, for a dry run that owns none. */
function firstOf(query: Query): string {
  for (const key of ['measures', 'dimensions'])
    for (const member of (query[key] as unknown[] | undefined) ?? [])
      if (typeof member === 'string') return member;
  return '';
}

export function missOf(
  transformed: Transformed,
  query: Query,
  rollups: Readonly<Record<string, readonly Rollup[]>>,
  /** How its reason writes a member or cube: by title, given `titlesFrom` (T403). */
  name: Namer = asIs,
): Miss {
  const members = [
    ...(transformed.leafMeasures ?? []),
    ...(transformed.ownedDimensions ?? []),
    ...(
      transformed.ownedTimeDimensionsAsIs ??
      transformed.ownedTimeDimensionsWithRollupGranularity ??
      []
    ).map(([dimension]) => dimension),
  ].map(own);
  // Every cube the query involves: Cube searches the rollups of each (§2).
  const cubes = [...new Set(members.map(cubeOf))];
  const first = transformed.leafMeasures?.[0] ?? members[0] ?? firstOf(query);
  const candidates = cubes.flatMap((cube) => rollups[cube] ?? []);
  if (candidates.length === 0)
    return {
      rollup: null,
      member: own(first),
      reason: `${cubes.length > 0 ? cubes.map(name).join(', ') : 'Its cube'} ${cubes.length > 1 ? 'have' : 'has'} no pre-aggregations.`,
    };

  let nearest: { rollup: Rollup; found: Omit<Miss, 'rollup'>[] } | undefined;
  for (const rollup of candidates) {
    const found = blockers(transformed, query, rollup, name);
    if (nearest === undefined || found.length < nearest.found.length) nearest = { rollup, found };
  }
  const { rollup, found } = nearest as { rollup: Rollup; found: Omit<Miss, 'rollup'>[] };
  const blocking = found[0];
  if (blocking !== undefined) return { rollup: rollup.id, ...blocking };

  // Every member is in it and Cube still did not use it: what these rules do
  // not cover — a date range off the rollup's granularity, or a time zone it
  // was not built in (research §2, "Time dimensions").
  const time = (query['timeDimensions'] as { dimension?: unknown }[] | undefined)?.find(
    (each) => typeof each.dimension === 'string',
  )?.dimension;
  return {
    rollup: rollup.id,
    member: typeof time === 'string' ? own(time) : own(first),
    reason: `Cube did not use ${rollup.id}, though it has every member the query asks for: the date range may not line up with its ${rollup.granularity ?? 'granularity'}, or the time zone with the one it was built in.`,
  };
}
