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
import { granularitiesOf } from './chart-spec';
import type { MemberFormats } from './format';
import {
  calculatedMeasures,
  calculationsInEffect,
  periodGrainOf,
  withMemberLabels,
} from './quickCalc';
import { CHANNELS, type ChartType, type Encoding, type RenderSpec } from './render-spec';
import { applySort } from './sort';
import { applyRowLimit, applyTopN } from './topN';

export interface CompileOptions {
  readonly rows: readonly Record<string, unknown>[];
  /**
   * The chart type to draw when the document pins none — the recommender's
   * pick. The document's own type wins, so a manual choice survives (AC-032).
   */
  readonly chartType: ChartType;
  readonly palette?: readonly string[];
  readonly surface?: string;
  /** What each member declares in the Cube model (AC-046). */
  readonly formats?: MemberFormats;
  /** Each member's title from the model (AC-220). */
  readonly titles?: Readonly<Record<string, string>>;
  /** Each member's short title, for a one-source chart's legend and KPI label (T403, AC-220). */
  readonly shortTitles?: Readonly<Record<string, string>>;
}

/**
 * Which member goes on which channel when the user has said nothing.
 *
 * Time beats a plain dimension for the x axis: it is the axis a reader expects
 * to run left to right, and a second categorical member is more useful as the
 * series than fighting it for x. A channel nothing fills is left out rather
 * than set to an empty list, because empty means "the user cleared this".
 */
export function defaultEncoding(chart: ChartDefinition, chartType?: ChartType): Encoding {
  const { measures, dimensions, timeDimensions } = chart.wells;

  const [firstTime] = timeDimensions;
  const [firstDimension, secondDimension] = dimensions;

  // With a time dimension present it takes x and the first plain dimension
  // becomes the series; without one, the first dimension takes x and the
  // second becomes the series.
  const x = firstTime ?? firstDimension;
  const color = firstTime === undefined ? secondDimension : firstDimension;

  /**
   * The types that read their channels otherwise (T242, AC-037): a scatter
   * plots two measures, coloured by the first dimension; a heatmap lays its
   * two groupings across and down, coloured by its measure; small multiples
   * draw a panel per member of the split. Encoded as a bar is, each drew
   * nothing from the editor's wells.
   */
  const [firstMeasure, secondMeasure] = measures;
  const channel = (member: string | undefined) => (member === undefined ? undefined : [member]);
  const encoded = (channels: Partial<Record<keyof Encoding, readonly string[] | undefined>>) =>
    Object.fromEntries(
      Object.entries(channels).filter(([, members]) => members !== undefined),
    ) as Encoding;
  if (chartType === 'scatter')
    return encoded({
      x: channel(firstMeasure),
      y: channel(secondMeasure),
      color: channel(firstDimension),
    });
  if (chartType === 'heatmap')
    return encoded({ x: channel(x), y: channel(color), color: channel(firstMeasure) });
  // Its renderer draws the first measure in every panel.
  if (chartType === 'trellis')
    return encoded({ x: channel(x), y: channel(firstMeasure), facet: channel(color) });
  // A box per member of its first plain dimension, of its first measure's
  // values (T399): a box per day of a time dimension says nothing.
  if (chartType === 'boxplot')
    return encoded({ x: channel(firstDimension), y: channel(firstMeasure) });
  // A country per member of its first plain dimension, coloured by its first
  // measure (T398, AC-305).
  if (chartType === 'map') return encoded({ x: channel(firstDimension), y: channel(firstMeasure) });
  // Its groupings down the rows and across the columns, its measures in the cells.
  if (chartType === 'pivot')
    return encoded({
      row: channel(x),
      column: channel(color),
      y: measures.length === 0 ? undefined : [...measures],
    });

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
  // Encoded for the type it draws (T242).
  const defaults = defaultEncoding(chart, chart.chartType ?? options.chartType);
  const overrides = chart.encoding ?? {};

  const encoding: Encoding = {};
  for (const channel of CHANNELS) {
    // `in` rather than a truthiness check: an empty list is the user clearing
    // the channel, which has to beat the default just as a filled one does.
    const value = channel in overrides ? overrides[channel] : defaults[channel];
    if (value !== undefined) encoding[channel] = value;
  }

  const granularities = granularitiesOf(chart.wells.timeDimensions, chart.granularities);
  /**
   * The quick calculations Cube computed for the rows (AC-048), as the
   * chart's query asked for them (`toCubeQuery`): each measure named with its
   * calculation and written in its own way.
   */
  const grain = periodGrainOf(granularities);
  const calculated = calculatedMeasures(
    calculationsInEffect(
      {
        measures: chart.wells.measures,
        ...(chart.calculations === undefined ? {} : { calculations: chart.calculations }),
        // The type it is drawn as: the editor holds a chosen box plot outside the
        // chart, and asks its query as one (T382's review).
        chartType: chart.chartType ?? options.chartType,
      },
      grain,
    ),
    grain,
  );

  // Both transformations happen here rather than in each renderer, so a chart
  // type cannot be quietly exempt from either. Order matters: the cap
  // *selects* which categories are shown (AC-041) and the sort *arranges*
  // what survives (AC-044), so folding first means the tail is chosen on
  // merit rather than on whatever the sort put last.
  // The row limit last, on the rows as drawn (T390, AC-041).
  const drawn = applyRowLimit(
    applySort(
      applyTopN({
        chartType: chart.chartType ?? options.chartType,
        encoding,
        rows: options.rows,
        // Carried through unchanged. Compile decides the encoding; it has no
        // business interpreting what a chart type does with its own options.
        ...(chart.options === undefined ? {} : { options: chart.options }),
        ...(options.formats === undefined ? {} : { formats: options.formats }),
        ...(options.titles === undefined ? {} : { titles: options.titles }),
        ...(options.shortTitles === undefined ? {} : { shortTitles: options.shortTitles }),
        ...(Object.keys(calculated).length === 0 ? {} : { calculated }),
        // By the grain each was asked at, chosen or not (AC-188, AC-216).
        granularities,
        measures: [...chart.wells.measures],
        // The wells' order, which a table heads its columns by (T393, AC-301).
        fields: [
          ...chart.wells.timeDimensions,
          ...chart.wells.dimensions,
          // A box plot's "Each point is" is a dimension too (T393's review).
          ...(chart.wells.eachPointIs === undefined ? [] : [chart.wells.eachPointIs]),
          ...chart.wells.measures,
        ],
        ...(options.palette === undefined ? {} : { palette: options.palette }),
        ...(options.surface === undefined ? {} : { surface: options.surface }),
      }),
    ),
  );
  // Named with its calculation, and written as it is, even before the
  // model's titles and formats arrive (AC-048).
  return Object.keys(calculated).length === 0
    ? drawn
    : withMemberLabels(drawn, {
        formats: options.formats ?? {},
        titles: options.titles ?? {},
        shortTitles: options.shortTitles,
      });
}
