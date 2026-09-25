/**
 * The bar family (AC-037): bar, horizontal bar, grouped bar and stacked bar.
 *
 * All four are one ECharts `bar` series set; what separates them is which axis
 * carries the categories and whether the series share a stack. Writing them as
 * four renderers would let the four drift apart in axis handling, labels and
 * mark styling, which is the part users actually compare across a dashboard.
 */
import { seriesOf, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { PROTOTYPE_GRID } from '../layout/grid';
import { DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

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

export function barOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isBarType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a bar chart`);
  }

  const { horizontal, stacked } = LAYOUT[spec.chartType];
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
  /**
   * The surface gap, where the bars are wide enough on this canvas to keep
   * it (AC-210): 243 grouped bars at a tile's width once drew blank axes, each
   * bar painted out by its own gap.
   */
  const gap = gapFor(
    laidBarWidth(
      categoryAxisPx(canvas, horizontal),
      categories.length,
      stacked ? 1 : Math.max(1, series.length),
    ),
  );

  const outermostAt = (categoryIndex: number) => {
    if (!stacked) return series.length - 1;
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (series[index]?.values[categoryIndex] != null) return index;
    }
    return -1;
  };

  return {
    animation: false,
    // The grid its bars' widths are estimated against (T254).
    grid: { ...PROTOTYPE_GRID },
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
        // By member where the dashboard has decided one (AC-039), by position
        // otherwise.
        color: colourFor(spec, one.name, index),
        // The gap between two touching marks is drawn as a border on each of
        // them in the surface colour. An SVG stroke straddles the boundary, so
        // two adjacent marks' strokes land in the same band: each mark must
        // carry the full width to leave a gap that wide, not half of it.
        borderColor: surface,
        borderWidth: gap,
      },
    })),
  };
}

/** The box a chart is drawn in, in CSS pixels. */
export interface Canvas {
  readonly width: number;
  readonly height: number;
}

/** A chart drawn without being told its canvas: the headless renderer's. */
export const DEFAULT_CANVAS: Canvas = { width: 640, height: 400 };

/**
 * How long the category axis of a chart on this canvas is, by the prototype's
 * grid that `optionFor` lays every chart on axes out on (T254: 8 px left, 28
 * right, 12 above and 8 below; research/echarts-text-and-grid.md, Q3). Its
 * labels come out of that too, which this leaves in: slightly over rather
 * than under, as a legend moves the grid as well, which only errs towards
 * keeping a gap the colour still shows beside (research/echarts-bar-density.md).
 */
export function categoryAxisPx(canvas: Canvas, horizontal: boolean): number {
  return horizontal ? canvas.height - 20 : canvas.width - 36;
}

/**
 * How wide ECharts lays out each bar (barGrid.js, `calcBarWidthAndOffset`),
 * for `columns` bars side by side in each of `categories` bands along an axis
 * `axisPx` long: each band less its category gap — 35% less 4% for each
 * column, never under 15% — shared among the columns, with 10% of a bar
 * between two of them. Never under a pixel, ECharts' own `barMinWidth`.
 */
export function laidBarWidth(axisPx: number, categories: number, columns: number): number {
  const band = Math.max(0, axisPx) / Math.max(1, categories);
  const categoryGap = (Math.max(35 - columns * 4, 15) / 100) * band;
  return Math.max(1, (band - categoryGap) / (columns + (columns - 1) * 0.1));
}

/**
 * The surface gap a bar this wide is drawn with (AC-210). ECharts draws it as
 * a border inside the bar on both sides (BarView.js: the bar is shrunk by its
 * border), so a bar under two gaps wide shows no colour of its own at all.
 * The gap is kept only where the colour left between its two sides is at
 * least as wide as one of them; below that, the bars touch rather than vanish.
 * Shared by every chart that draws bars — bar, combo and trellis.
 */
export function gapFor(barPx: number): number {
  return barPx >= 3 * MARK.gapPx ? MARK.gapPx : 0;
}
