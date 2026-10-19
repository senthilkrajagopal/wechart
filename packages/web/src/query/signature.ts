import { admin1CountryOf, admin1Index, admin1RegionsOf } from '@wechart/charts';
import {
  countryCodeMarkingOf,
  geoPointOf,
  holdsCountryCodes,
  isRegionKey,
  kpiOptionsOf,
  regionKeyMarkingOf,
  scaleOf,
  targetCount,
  type ChartSpec,
  type MemberFormats,
  type RegionKeyMarking,
} from '@wechart/core';

/** What the caller knows of places (T1012): Cube's `geo` type, and region-key markings. */
export interface PlacesOf {
  readonly geo?: (member: string) => boolean;
  readonly regionMarking?: (member: string) => RegionKeyMarking;
}

/** How the model marks each dimension as a region key, from `/v1/meta` (T974, AC-623). */
export function regionMarkingsOf(meta: unknown): (member: string) => RegionKeyMarking {
  const marked = new Map<string, RegionKeyMarking>();
  const cubes = (meta as { cubes?: unknown } | null | undefined)?.cubes;
  for (const cube of Array.isArray(cubes) ? cubes : []) {
    const dimensions = (cube as { dimensions?: unknown }).dimensions;
    for (const dimension of Array.isArray(dimensions) ? dimensions : []) {
      const { name, meta: own } = dimension as { name?: unknown; meta?: unknown };
      const marking = regionKeyMarkingOf(own);
      if (typeof name === 'string' && marking !== undefined) marked.set(name, marking);
    }
  }
  return (member) => marked.get(member);
}

/**
 * How the model marks each dimension as holding country codes, from its
 * `meta.wechart.countryCode` in `/v1/meta` (T397, AC-313): true, false, or
 * unmarked.
 */
export function countryMarkingsOf(meta: unknown): (member: string) => boolean | undefined {
  const marked = new Map<string, boolean>();
  const cubes = (meta as { cubes?: unknown } | null | undefined)?.cubes;
  for (const cube of Array.isArray(cubes) ? cubes : []) {
    const dimensions = (cube as { dimensions?: unknown }).dimensions;
    for (const dimension of Array.isArray(dimensions) ? dimensions : []) {
      const { name, meta: own } = dimension as { name?: unknown; meta?: unknown };
      const marking = countryCodeMarkingOf(own);
      if (typeof name === 'string' && marking !== undefined) marked.set(name, marking);
    }
  }
  return (member) => marked.get(member);
}
import { recommend, type ChartType, type Signature } from '@wechart/recommender';

/**
 * What the recommender is asked about a chart: its fields, by kind, and how
 * many distinct values each grouping has *in this result* (AC-028).
 *
 * One function for the editor and the dashboard both, so that a chart drawn on
 * a dashboard is recommended exactly as it was where it was built. Two copies
 * would drift, and the drift would show up as a chart changing type between
 * the editor and the tile with nothing to explain why.
 *
 * Cardinalities come from the rows the query actually returned, not from a
 * separate count: what decides whether a chart reads is how many values are in
 * this result, and it costs nothing extra. It follows that the rows must be in
 * hand before recommending — deciding first would decide with none.
 */
export function signatureOf(
  spec: ChartSpec,
  rows: readonly Record<string, unknown>[],
  /**
   * How the model marks a dimension as holding country codes, where it does
   * (T398, AC-313): otherwise its values decide.
   */
  countryMarking?: (member: string) => boolean | undefined,
  /**
   * The model's formats, where known: each measure's scale, so metrics on
   * different scales are drawn as small multiples (T510; R67, the user).
   */
  formats?: MemberFormats,
  /**
   * The chart's options, where the caller has them: a bullet chart's or a
   * KPI's Target there, whatever the chart is drawn as, makes the pick a
   * bullet chart or a KPI against it (T968, AC-560).
   */
  options?: Readonly<Record<string, unknown>>,
  /**
   * Each measure's aggregation from the model, where the caller has it: a
   * 100 % stack is offered only for a summed measure (T969, AC-561).
   */
  aggTypes?: Readonly<Record<string, string>>,
  /**
   * Places, where the caller knows them (T1012, AC-560): a dimension of
   * Cube's `geo` type, and the model's region-key marking (AC-623).
   */
  places?: PlacesOf,
): Signature {
  const distinct = (member: string) => new Set(rows.map((row) => String(row[member] ?? ''))).size;
  const target = targetCount(options) > 0 || kpiOptionsOf(options).target !== undefined;
  const valuesOf = (member: string) => rows.map((row) => row[member]);
  const countryCodes = (member: string) =>
    holdsCountryCodes(valuesOf(member), countryMarking?.(member));
  /** Cube's `geo` type, or every value a "lat,lng" as Cube writes one (research `cube-geo-values.md`). */
  const geo = (member: string) => {
    if (places?.geo?.(member) === true) return true;
    const present = valuesOf(member).filter((value) => value !== null && value !== undefined && value !== '');
    return present.length > 0 && present.every((value) => geoPointOf(value) !== undefined);
  };
  /**
   * A region key of a boundary set other than Countries (AC-623): as the
   * model marks it, else Admin-1 where its index is in and every value
   * names one region of one country (T1012).
   */
  const regionSet = (member: string): string | undefined => {
    const marking = places?.regionMarking?.(member);
    if (marking === false || marking === 'countries') return undefined;
    if (marking !== undefined) return marking;
    const values = valuesOf(member);
    const index = admin1Index();
    const country = index === undefined ? undefined : admin1CountryOf(values, index);
    const regions = country === undefined ? undefined : admin1RegionsOf(country, index);
    return regions !== undefined && isRegionKey('admin1', regions, values, undefined)
      ? 'admin1'
      : undefined;
  };
  const placeOf = (member: string) => {
    if (countryCodes(member)) return { countryCodes: true };
    if (geo(member)) return { geo: true };
    const set = regionSet(member);
    return set === undefined ? {} : { regionSet: set };
  };

  return {
    fields: [
      ...spec.measures.map((name) => ({
        name,
        kind: 'measure' as const,
        ...(formats === undefined ? {} : { scale: scaleOf(formats[name]) }),
        ...(aggTypes?.[name] === undefined ? {} : { aggType: aggTypes[name] }),
      })),
      ...spec.dimensions.map((name) => ({
        name,
        kind: 'dimension' as const,
        ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        ...placeOf(name),
      })),
      ...spec.timeDimensions.map((name) => ({
        name,
        kind: 'timeDimension' as const,
        ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
      })),
    ],
    rowCount: rows.length,
    ...(target ? { target: true } : {}),
    // The rules a chart saved in Auto before R81 is drawn by (T970, AC-562).
    ...(spec.rules === undefined ? {} : { rules: spec.rules }),
  };
}

/**
 * The recommendation's pick, or null when it has none. Shared with the editor,
 * which keeps the whole recommendation for its runners-up and reasons but must
 * read the pick exactly as the dashboard does.
 */
export function topTypeOf(recommendation: ReturnType<typeof recommend>): ChartType | null {
  return recommendation.top?.candidate.chartType ?? null;
}

/**
 * The type the recommender would pick for this chart, or null when none:
 * with the model's formats where given, as the editor picks (T510, R67).
 */
export function recommendedTypeOf(
  spec: ChartSpec,
  rows: readonly Record<string, unknown>[],
  formats?: MemberFormats,
  /** The chart's options, for its Target (T968). */
  options?: Readonly<Record<string, unknown>>,
): ChartType | null {
  return topTypeOf(recommend(signatureOf(spec, rows, undefined, formats, options)));
}
