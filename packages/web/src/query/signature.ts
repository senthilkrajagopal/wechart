import type { ChartSpec } from '@wechart/core';
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
export function signatureOf(spec: ChartSpec, rows: readonly Record<string, unknown>[]): Signature {
  const distinct = (member: string) => new Set(rows.map((row) => String(row[member] ?? ''))).size;

  return {
    fields: [
      ...spec.measures.map((name) => ({ name, kind: 'measure' as const })),
      ...spec.dimensions.map((name) => ({
        name,
        kind: 'dimension' as const,
        ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
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
