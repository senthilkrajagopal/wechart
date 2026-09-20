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

/** Types whose colour says how much rather than which. */
const COLOUR_IS_A_SCALE: readonly ChartType[] = ['heatmap'];

/** Types with no marks for a legend to name. */
const NO_LEGEND: readonly ChartType[] = ['kpi', 'table', 'pivot', 'trellis'];

/** Types whose coloured things are their categories, not their series. */
const COLOURED_BY_CATEGORY: readonly ChartType[] = ['pie', 'donut', 'treemap'];

/** How many distinctly coloured things a chart draws. */
export function seriesCount(spec: RenderSpec): number {
  if (NO_LEGEND.includes(spec.chartType) || COLOUR_IS_A_SCALE.includes(spec.chartType)) return 0;

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

  return {
    legend: {
      top: 0,
      type: 'scroll',
      // Toggling visibility from the legend belongs to the interaction modes
      // of AC-070 and AC-071, not to drawing.
      selectedMode: false,
    },
    // Leave room for it, or it sits on top of the plot.
    grid: { top: 32 },
  };
}
