/**
 * Folding a long tail into "Other" (AC-041).
 *
 * direction.md caps categorical colour at eight validated slots and says that
 * past it a chart facets or keeps the top members plus a neutral "Other". This
 * is the second of those.
 *
 * The **count** in the label is what stops "Other" being a lie: a slice
 * labelled only "Other" could cover two members or two hundred, and a reader
 * has no way to tell how much of the chart they are not seeing.
 */

import { membersOn, memberOn, type RenderSpec } from './render-spec';

export const OTHER_LABEL = 'Other';

function numberAt(row: Record<string, unknown>, member: string): number | null {
  const raw = row[member];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Add, treating gaps as absent rather than zero.
 *
 * Sum only, and with the same caveat the pivot carries: a total of averages is
 * not an average, and nothing here knows a measure's aggregation. A
 * non-additive measure needs its "Other" from Cube.
 */
function total(values: readonly (number | null)[]): number | null {
  let sum: number | null = null;
  for (const value of values) {
    if (value === null) continue;
    sum = (sum ?? 0) + value;
  }
  return sum;
}

/**
 * Collapse everything past the top N into one row, or return the spec
 * untouched when there is nothing to collapse.
 *
 * Returning the same object when nothing changes is deliberate: it keeps the
 * memoised chain above this cheap, and makes "did anything happen" answerable
 * by identity.
 */
export function applyTopN(spec: RenderSpec): RenderSpec {
  const limit = spec.options?.['topN'];
  const category = memberOn(spec.encoding, 'x');
  const measures = membersOn(spec.encoding, 'y');

  if (typeof limit !== 'number' || limit < 1 || category === undefined) return spec;
  /**
   * A scatter's x is a measure, and a heatmap's y its second grouping with
   * its measure the colour: neither has a category ranked by a measure on y,
   * and folding either drew points and cells no row holds (T242's review).
   */
  if (spec.chartType === 'scatter' || spec.chartType === 'heatmap') return spec;
  // A box plot's rows are its observations (T399): summing a tail into
  // "Other" would draw a box no category has.
  if (spec.chartType === 'boxplot') return spec;

  // One entry per category, in the order they arrived, with what to rank by.
  const byCategory = new Map<string, Record<string, unknown>[]>();
  for (const row of spec.rows) {
    const key = String(row[category] ?? '');
    byCategory.set(key, [...(byCategory.get(key) ?? []), row]);
  }

  if (byCategory.size <= limit) return spec;

  const ranked = [...byCategory.entries()]
    .map(([key, rows]) => ({
      key,
      rows,
      // Rank on the first measure: it is the one the chart is primarily
      // about, and ranking on a sum across measures of different units would
      // be adding pounds to counts.
      rank: total(rows.map((row) => numberAt(row, measures[0] ?? ''))) ?? Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => b.rank - a.rank);

  const kept = ranked.slice(0, limit);
  const folded = ranked.slice(limit);

  // Or not drawn at all, when the chart says so (T390, AC-041).
  if (spec.options?.['tail'] === 'drop') {
    return { ...spec, rows: kept.flatMap((entry) => entry.rows) };
  }

  const otherRow: Record<string, unknown> = {
    [category]: `${OTHER_LABEL} (${String(folded.length)})`,
  };
  for (const measure of measures) {
    otherRow[measure] = total(
      folded.flatMap((entry) => entry.rows.map((row) => numberAt(row, measure))),
    );
  }

  return { ...spec, rows: [...kept.flatMap((entry) => entry.rows), otherRow] };
}

/**
 * A chart's row limit (T390, AC-041): the rows past it are not drawn, in the
 * order the chart draws them, so it applies after sorting. The same object when
 * nothing is cut, as `applyTopN` returns it.
 */
export function applyRowLimit(spec: RenderSpec): RenderSpec {
  const limit = spec.options?.['rowLimit'];
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) return spec;
  if (spec.rows.length <= limit) return spec;
  return { ...spec, rows: spec.rows.slice(0, limit) };
}
