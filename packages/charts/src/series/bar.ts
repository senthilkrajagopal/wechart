/**
 * The bar family (AC-037): bar, horizontal bar, grouped bar and stacked bar.
 *
 * All four are one ECharts `bar` series set; what separates them is which axis
 * carries the categories and whether the series share a stack. Writing them as
 * four renderers would let the four drift apart in axis handling, labels and
 * mark styling, which is the part users actually compare across a dashboard.
 */
import { seriesOf, type RenderSpec } from '@wechart/core';

import { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

/**
 * The four members of the family, and how each differs.
 *
 * `bar` and `groupedBar` share a layout on purpose, and it is worth being
 * explicit about why rather than leaving it to look like an oversight: a
 * grouped bar *is* a bar chart that happens to have more than one series.
 * Grouping is a property of the data, not a separate way of drawing. Making
 * `bar` refuse a second series would turn "add another measure" into an error
 * for something the user plainly meant, and drawing the second series on top
 * of the first would be worse. The two names are kept because AC-037 names
 * both and the recommender distinguishes them when it explains its choice.
 */
const LAYOUT = {
  bar: { horizontal: false, stacked: false },
  hbar: { horizontal: true, stacked: false },
  groupedBar: { horizontal: false, stacked: false },
  stackedBar: { horizontal: false, stacked: true },
} as const;

export type BarType = keyof typeof LAYOUT;

export function isBarType(chartType: string): chartType is BarType {
  return chartType in LAYOUT;
}

/**
 * Rounded data-ends, anchored at the baseline (direction.md §6).
 *
 * ECharts takes the four corner radii clockwise from the top-left, in the
 * chart's own orientation, so "the end the value grows towards" is a different
 * pair of corners for a horizontal bar — and a different pair again for a
 * negative value, which grows the other way. Rounding the top of a bar that
 * hangs below the axis would put the round end at the baseline and the flat
 * end at the data end: the rule exactly inverted.
 *
 * Only the outermost segment of a stack is rounded. Rounding every segment
 * would draw a pill at each boundary and read as separate bars.
 */
function cornerRadii(horizontal: boolean, outermost: boolean, value: number | null): number[] {
  if (!outermost) return [0, 0, 0, 0];
  const r = MARK.cornerRadiusPx;
  const negative = value !== null && value < 0;

  if (horizontal) return negative ? [r, 0, 0, r] : [0, r, r, 0];
  return negative ? [0, 0, r, r] : [r, r, 0, 0];
}

export function barOption(spec: RenderSpec): EChartsOption {
  if (!isBarType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a bar chart`);
  }

  const { horizontal, stacked } = LAYOUT[spec.chartType];
  const palette = spec.palette ?? DEFAULT_PALETTE;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const { categories, series } = seriesOf(spec);

  const categoryAxis = { type: 'category' as const, data: categories };
  const valueAxis = { type: 'value' as const };

  /**
   * The last series that actually draws something in this category. `seriesOf`
   * emits `null` for a category a series has no row for, so the topmost
   * *series* and the topmost *segment* are not the same thing — a stack whose
   * top series is missing here would otherwise get a flat top.
   */
  const outermostAt = (categoryIndex: number) => {
    if (!stacked) return series.length - 1;
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (series[index]?.values[categoryIndex] != null) return index;
    }
    return -1;
  };

  return {
    animation: false,
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: series.map((one, index) => ({
      type: 'bar' as const,
      name: one.name,
      // Per datum rather than per series: which corners are rounded depends on
      // the sign of each value, because a negative bar grows away from the
      // baseline in the opposite direction.
      data: one.values.map((value, categoryIndex) => ({
        value,
        itemStyle: {
          borderRadius: cornerRadii(horizontal, outermostAt(categoryIndex) === index, value),
        },
      })),
      ...(stacked ? { stack: 'total' } : {}),
      itemStyle: {
        color: palette[index % palette.length],
        // The gap between two touching marks is drawn as a border on each of
        // them in the surface colour. An SVG stroke straddles the boundary, so
        // two adjacent marks' strokes land in the same band: each mark must
        // carry the full width to leave a gap that wide, not half of it.
        borderColor: surface,
        borderWidth: MARK.gapPx,
      },
    })),
  };
}
