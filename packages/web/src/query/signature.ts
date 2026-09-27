import { countryCodeMarkingOf, holdsCountryCodes, type ChartSpec } from '@wechart/core';

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
): Signature {
  const distinct = (member: string) => new Set(rows.map((row) => String(row[member] ?? ''))).size;
  const countryCodes = (member: string) =>
    holdsCountryCodes(
      rows.map((row) => row[member]),
      countryMarking?.(member),
    );

  return {
    fields: [
      ...spec.measures.map((name) => ({ name, kind: 'measure' as const })),
      ...spec.dimensions.map((name) => ({
        name,
        kind: 'dimension' as const,
        ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        ...(countryCodes(name) ? { countryCodes: true } : {}),
      })),
      ...spec.timeDimensions.map((name) => ({
        name,
        kind: 'timeDimension' as const,
        ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
      })),
    ],
    rowCount: rows.length,
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

/** The type the recommender would pick for this chart, or null when none. */
export function recommendedTypeOf(
  spec: ChartSpec,
  rows: readonly Record<string, unknown>[],
): ChartType | null {
  return topTypeOf(recommend(signatureOf(spec, rows)));
}
