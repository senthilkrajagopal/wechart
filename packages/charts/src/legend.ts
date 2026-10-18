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
import {
  comboSeriesOf,
  distinctValues,
  memberOn,
  membersOn,
  seriesOf,
  type ChartType,
  type RenderSpec,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { GLYPH_PATHS } from './combo/axisTitles';
import { inSeriesOrder, seriesOrderOf, seriesSettingsOf } from './customize';
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
 * How a chart writes the name of each thing it colours, as its legend and
 * its direct labels (T681's follow-up) both say it: a category or a member
 * of the split, one of time by its granularity (AC-188); a series per
 * measure by the measure's title (AC-220), its short one in a one-source
 * chart (T403). A pie's slices come already written, by every value they are
 * grouped by (AC-221): none.
 */
export function seriesNameWriter(spec: RenderSpec): ((value: unknown) => string) | undefined {
  const named = COLOURED_BY_CATEGORY.includes(spec.chartType)
    ? memberOn(spec.encoding, 'x')
    : memberOn(spec.encoding, 'color');
  return PIE_TYPES.includes(spec.chartType)
    ? undefined
    : named === undefined && spec.titles !== undefined
      ? (value: unknown) => labelOf(spec, String(value ?? ''))
      : modelWriter(spec, named);
}

/**
 * A combo's legend (AC-500, rule 120): each entry with its mark's glyph,
 * a path scaled into a 12 × 8 item keeping its proportions (`GLYPH_PATHS`),
 * and a right-axis series' name followed by "(right)" in `text-secondary`.
 * Its entries listed, as the legend can't otherwise give each its own icon
 * (an explicit `legend.icon` wins over a series' own; research/echarts-axis-
 * legend-bars.md §2): the drawn series in the order Customize sets, none it
 * hides. Split by colour, its entries are members and keep their swatches
 * (the two-part legend is T852's).
 */
function comboLegendOf(
  spec: RenderSpec,
  write: ((value: unknown) => string) | undefined,
): Record<string, unknown> {
  if (spec.chartType !== 'combo' || memberOn(spec.encoding, 'color') !== undefined) return {};
  const settings = seriesSettingsOf(spec);
  const resolved = new Map(
    comboSeriesOf(membersOn(spec.encoding, 'y'), spec.options).map((one) => [one.measure, one]),
  );
  const names = inSeriesOrder(
    seriesOf(spec).series.filter((one) => settings[one.name]?.hidden !== true),
    seriesOrderOf(spec),
  ).map((one) => one.name);
  const named = (name: string) => (write === undefined ? name : write(name));
  return {
    data: names.map((name) => ({ name, icon: GLYPH_PATHS[resolved.get(name)?.mark ?? 'line'] })),
    itemWidth: 12,
    itemHeight: 8,
    formatter: (name: string) =>
      resolved.get(name)?.axis === 'right'
        ? `${named(name).replace(/[{}]/g, '')} {right|(right)}`
        : named(name),
    textStyle: { rich: { right: { color: COLORS.light['text-secondary'] } } },
  };
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
  const write = seriesNameWriter(spec);
  const combo = comboLegendOf(spec, write);

  return {
    legend: {
      top: 0,
      // The prototype's chrome() (T683, CMP-12; research/echarts-axis-legend-
      // bars.md §2–3): at the left, each swatch a 10 × 10 rounded square
      // 8 px from the next, with no stroke inherited from its series.
      left: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 8,
      itemStyle: { borderWidth: 0 },
      type: 'scroll',
      // Toggling visibility from the legend belongs to the interaction modes
      // of AC-070 and AC-071, not to drawing.
      selectedMode: false,
      ...(write === undefined ? {} : { formatter: (name: string) => write(name) }),
      ...combo,
    },
    // Leave room for it, or it sits on top of the plot.
    grid: { top: 32 },
  };
}
