/**
 * Turning a saved chart into a drawable one (AC-037).
 *
 * The criterion says "render … **from a chart spec**", and this is the step
 * that makes that true: a stored document plus the rows its query returned
 * becomes the `RenderSpec` the renderers consume. It is a pure function, run
 * on every load and never stored — which is what Superset, Metabase and
 * Grafana all do, none of them persisting a render shape.
 *
 * The encoding is computed here and overridden by what the user pinned, rather
 * than being written into the document whenever a chart is saved. Metabase
 * takes the same approach: most settings are derived from the data and the
 * chart type, and only the ones the user changed are stored. That is what lets
 * a chart follow the recommendation as its data changes, and it is the same
 * distinction `chartTypeState` already draws in the editor.
 */

import type { ChartDefinition, ChartDocument } from './chart-document';
import { CHANNELS, type ChartType, type Encoding, type RenderSpec } from './render-spec';

export interface CompileOptions {
  readonly rows: readonly Record<string, unknown>[];
  /**
   * The chart type to draw when the document pins none — the recommender's
   * pick. The document's own type wins, so a manual choice survives (AC-032).
   */
  readonly chartType: ChartType;
  readonly palette?: readonly string[];
  readonly surface?: string;
}

/**
 * Which member goes on which channel when the user has said nothing.
 *
 * Time beats a plain dimension for the x axis: it is the axis a reader expects
 * to run left to right, and a second categorical member is more useful as the
 * series than fighting it for x. A channel nothing fills is left out rather
 * than set to an empty list, because empty means "the user cleared this".
 */
export function defaultEncoding(chart: ChartDefinition): Encoding {
  const { measures, dimensions, timeDimensions } = chart.wells;

  const [firstTime] = timeDimensions;
  const [firstDimension, secondDimension] = dimensions;

  // With a time dimension present it takes x and the first plain dimension
  // becomes the series; without one, the first dimension takes x and the
  // second becomes the series.
  const x = firstTime ?? firstDimension;
  const color = firstTime === undefined ? secondDimension : firstDimension;

  return {
    ...(x === undefined ? {} : { x: [x] }),
    ...(measures.length === 0 ? {} : { y: [...measures] }),
    ...(color === undefined ? {} : { color: [color] }),
  };
}

/**
 * Compile a saved chart into the shape a renderer draws.
 *
 * Overrides are applied per channel, not wholesale: naming one channel must
 * leave the rest at their defaults, or pinning a colour would blank the axes.
 */
export function compile(document: ChartDocument, options: CompileOptions): RenderSpec {
  const { chart } = document;
  const defaults = defaultEncoding(chart);
  const overrides = chart.encoding ?? {};

  const encoding: Encoding = {};
  for (const channel of CHANNELS) {
    // `in` rather than a truthiness check: an empty list is the user clearing
    // the channel, which has to beat the default just as a filled one does.
    const value = channel in overrides ? overrides[channel] : defaults[channel];
    if (value !== undefined) encoding[channel] = value;
  }

  return {
    chartType: chart.chartType ?? options.chartType,
    encoding,
    rows: options.rows,
    // Carried through unchanged. Compile decides the encoding; it has no
    // business interpreting what a chart type does with its own options.
    ...(chart.options === undefined ? {} : { options: chart.options }),
    ...(options.palette === undefined ? {} : { palette: options.palette }),
    ...(options.surface === undefined ? {} : { surface: options.surface }),
  };
}
