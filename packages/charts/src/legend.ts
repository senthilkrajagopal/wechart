/**
 * The legend (AC-038, direction.md rule 4).
 *
 * Two or more series get one; a single series gets none. The second half is
 * the one usually got wrong: a legend naming the one thing the axis and the
 * title already name is clutter, and on a small tile it is clutter that costs
 * the chart its height.
 *
 * "Series" means the things that carry a colour, which is not the same as the
 * number of ECharts series. A pie is one series and several coloured slices,
 * and it is the slices a legend names; a heatmap's colour is a *scale* rather
 * than a set, so naming its values would mean naming every cell.
 */
import { distinctValues, memberOn, seriesOf, type ChartType, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from './theme';
import { labelOf, modelWriter } from './modelWriter';
import { slicesOf } from './series/pie';

/** Types whose colour says how much rather than which. */
const COLOUR_IS_A_SCALE: readonly ChartType[] = ['heatmap'];

/** Types with no marks for a legend to name. */
const NO_LEGEND: readonly ChartType[] = ['kpi', 'table', 'pivot', 'trellis'];

/** Types whose coloured things are their categories, not their series. */
const COLOURED_BY_CATEGORY: readonly ChartType[] = ['pie', 'donut', 'treemap'];
const PIE_TYPES: readonly ChartType[] = ['pie', 'donut'];

/** How many distinctly coloured things a chart draws. */
export function seriesCount(spec: RenderSpec): number {
  if (NO_LEGEND.includes(spec.chartType) || COLOUR_IS_A_SCALE.includes(spec.chartType)) return 0;

  // A pie's slices, each named by every value it is grouped by (AC-221).
  if (PIE_TYPES.includes(spec.chartType))
    return new Set(slicesOf(spec).map((slice) => slice.name)).size;
  if (COLOURED_BY_CATEGORY.includes(spec.chartType)) {
    const category = memberOn(spec.encoding, 'x');
    return category === undefined ? 0 : distinctValues(spec.rows, category).length;
  }

  return seriesOf(spec).series.length;
}

/**
 * The legend for a chart, or nothing.
 *
 * Top by default, which direction.md sets and which keeps the legend out of
 * the way of a value axis; position becomes a chart option when AC-040's
 * inspector lands.
 */
export function legendFor(spec: RenderSpec): EChartsOption {
  if (seriesCount(spec) < 2) return {};

  /**
   * An entry names a category or a member of the split, and one of time is
   * written by its granularity (AC-188). ECharts calls the formatter with the
   * entry's name and keeps the name itself, so the entry still matches its
   * series (research/echarts.md).
   */
  const named = COLOURED_BY_CATEGORY.includes(spec.chartType)
    ? memberOn(spec.encoding, 'x')
    : memberOn(spec.encoding, 'color');
  // A series per measure is named by the measure's title (AC-220), its short
  // one in a one-source chart (T403); a pie's slices come already written,
  // by every value they are grouped by (AC-221).
  const write = PIE_TYPES.includes(spec.chartType)
    ? undefined
    : named === undefined && spec.titles !== undefined
      ? (value: unknown) => labelOf(spec, String(value ?? ''))
      : modelWriter(spec, named);

  return {
    legend: {
      top: 0,
      type: 'scroll',
      // Toggling visibility from the legend belongs to the interaction modes
      // of AC-070 and AC-071, not to drawing.
      selectedMode: false,
      ...(write === undefined ? {} : { formatter: (name: string) => write(name) }),
    },
    // Leave room for it, or it sits on top of the plot.
    grid: { top: 32 },
  };
}
