import {
  compile,
  isEmpty,
  toChartSpec,
  toCubeQuery,
  type ChartDocument,
  type RenderSpec,
} from '@wechart/core';

import { formatsOf } from '../editor/fields';
import { recommendedTypeOf } from '../query/signature';
import { NOTHING_CHOSEN } from './edit/templates';

/**
 * The error is carried as the thrown value, not as its message. `TileError`
 * offers the query JSON only for a `TileLoadError` (AC-012), and flattening to
 * a string throws away the one thing that makes a failed tile diagnosable.
 */
export type TileChart = { readonly spec: RenderSpec } | { readonly error: unknown };

/** Runs a chart's Cube query and returns its rows — `loadTile`, in the app. */
export type LoadRows = (query: Record<string, unknown>) => Promise<Record<string, unknown>[]>;

/**
 * One tile's chart, ready to draw: its rows, and the type to draw them as.
 *
 * **A chart with no saved type is drawn with the one the editor recommends**
 * (T193, AC-034). The document's rule is that a type is present only when the
 * user chose it — "Absent means the recommender's pick is followed" — and the
 * editor draws such a chart with its recommendation. This code used to refuse
 * it instead ("This chart has no chart type yet"), so a chart built following
 * its recommendation drew in the editor and failed on every dashboard: the
 * opposite of "a chart has to look the same on a dashboard as it did where it
 * was built". Storing the effective type instead would have been wrong too —
 * it would turn every such chart into a manual one that stops adapting.
 *
 * **Query first, then recommend.** The recommendation depends on the rows
 * (cardinality is counted in the result), so deciding before the query would
 * decide with no rows and could pick differently from the editor, which always
 * has them. The editor and this share `signatureOf` and `topTypeOf`, so the
 * same chart and rows give the same type in both.
 *
 * **An empty chart is not queried.** An empty spec is no query at all, and
 * sending one to Cube to learn that would put an error on a tile that simply
 * has not been built. The editor's guard is the same (`!isEmpty(spec)`).
 */
/**
 * Each member's number format from the Cube model (AC-046), or none.
 *
 * Never throws. None while the model has not arrived; none if it is
 * malformed — a `cubes` that is not a list, or holds a null, makes
 * `formatsOf` throw, and that would otherwise fail every tile together over
 * something that affects only how numbers are written.
 *
 * What a tile shows when the model is unavailable is not settled: no
 * criterion covers it, and the user has not decided. It draws unformatted —
 * which for a `percent` measure changes how large the number looks, not only
 * its style. Recorded on T194 as an open question.
 */
export function formatsFrom(meta: unknown): Readonly<Record<string, string>> {
  try {
    return formatsOf(meta);
  } catch {
    return {};
  }
}

/**
 * Every tile's chart with the model's formats applied (T194, AC-046).
 *
 * Applied when the dashboard draws, not when it loads. `compile` only carries
 * formats onto the spec — it computes nothing from them — so this is the same
 * result the editor gets by passing them to `compile`, without making any
 * tile wait for the model: each paints as soon as its own data arrives, and
 * picks up its formats when the model does. The first version awaited the
 * model inside every chart's load, so every tile's first paint waited on it
 * and a stuck model request held the whole dashboard.
 */
export function withFormats(
  specs: Readonly<Record<string, RenderSpec>>,
  formats: Readonly<Record<string, string>>,
): Readonly<Record<string, RenderSpec>> {
  return Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, { ...spec, formats }]));
}

export async function tileChartOf(document: ChartDocument, load: LoadRows): Promise<TileChart> {
  /**
   * Everything after reading the document is inside one `try`. Every tile's
   * chart is loaded together (`Promise.all` in DashboardPage), so a rejection
   * from any step — the query, reading its rows, recommending, compiling —
   * would fail them all, and every tile would read "no longer available". A
   * throw has to become *this* tile's error.
   */
  try {
    const spec = toChartSpec(document);
    // The same sentence a tile bound to no chart shows (AC-068), imported.
    if (isEmpty(spec)) return { error: NOTHING_CHOSEN };

    const rows = await load(toCubeQuery(spec));

    const chartType = document.chart.chartType ?? recommendedTypeOf(spec, rows);
    /**
     * Reached by a chart the recommender can place nowhere — one with only a
     * time dimension, say: every candidate needs a measure except a table,
     * and a table with no value and no category has nothing to encode. The
     * editor draws nothing for it either. The message is now true where it is
     * shown; before T193 every chart without a saved type received it.
     *
     * Such a chart is queried first, although its rows cannot change this
     * answer. That is the editor's behaviour too (it queries any non-empty
     * spec), and it keeps one path for every typeless chart.
     */
    if (chartType === null) return { error: 'This chart has no chart type yet.' };

    return { spec: compile(document, { rows, chartType }) };
  } catch (failure) {
    // AC-012: the thrown value itself, so a TileLoadError keeps its query.
    return { error: failure };
  }
}
