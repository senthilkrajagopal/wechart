/**
 * From a chart spec to a drawable option (AC-037).
 *
 * The renderers are written per family — one module knows bars, one knows
 * lines — and something has to choose between them. This is that choice, and
 * it is the only entry point the app needs.
 *
 * A type with no renderer yet throws rather than falling back. A fallback
 * would put a chart on screen that the spec never asked for, which is worse
 * than saying so: the caller can show the failure, and AC-033 already expects
 * the editor to explain when a chart cannot be drawn.
 */
import { foldForShares, onOneScale, type ChartType, type RenderSpec } from '@wechart/core';

import { barOption, DEFAULT_CANVAS, isBarType, type Canvas } from './series/bar';
import { withHighlight } from './crossfilter/highlight';
import { withKeyboardFocus } from './marking/focus';
import { withMarks } from './marking/option';
import { withMarkedShareLines } from './marking/partialOption';
import { applyAxes, thinValueLabels } from './axis';
import { fitCategoryLabels } from './layout/categoryLabels';
import { applyCustomize } from './customize';
import { isTrellisType, trellisOption } from './layout/trellis';
import { legendFor } from './legend';
import { tooltipFor } from './tooltip';
import { boxplotOption, isBoxplotType } from './series/boxplot';
import {
  comboOption,
  isComboType,
  withComboTooltip,
  withLineHalos,
  withSettledLogScale,
} from './series/combo';
import { withNarrowCombo } from './combo/narrow';
import { heatmapOption, isHeatmapType } from './series/heatmap';
import { countryMap } from './geo/countryMap';
import { isMapType, mapOption } from './series/map';
import { withMapPoints } from './series/mapPoints';
import { SERIES } from './series/registry';
import { withShares } from './series/stack100';
import { lineOption, isLineType } from './series/line';
import { fitPieLabels, pieOption, isPieType } from './series/pie';
import { scatterOption, isScatterType } from './series/scatter';
import { isTreemapType, treemapOption } from './series/treemap';
import { withDirectLabels } from './layout/directLabels';
import { PROTOTYPE_GRID } from './layout/grid';
import type { EChartsOption } from './theme';

/**
 * The types that have a renderer today, in the order they were built. The
 * remaining members of AC-037's list arrive with T039 to T044.
 */
export const DRAWABLE_TYPES = [
  'bar',
  'hbar',
  'groupedBar',
  'stackedBar',
  'line',
  'multiLine',
  'area',
  'stackedArea',
  'scatter',
  'pie',
  'donut',
  'treemap',
  'heatmap',
  'trellis',
  'combo',
  'boxplot',
  'map',
] as const satisfies readonly ChartType[];

export function isDrawable(chartType: string): boolean {
  return (
    (DRAWABLE_TYPES as readonly string[]).includes(chartType) ||
    // R81's types, once their series is registered (T934).
    Object.hasOwn(SERIES, chartType)
  );
}

/** A map's regions with no fill of their own: the visualMap's scale fills them. */
function regionsFilledByScale(option: EChartsOption): EChartsOption {
  const series = (option['series'] as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...option,
    series: series.map((one) => ({
      ...one,
      data: ((one['data'] as Record<string, unknown>[] | undefined) ?? []).map((item) => {
        const style = item['itemStyle'] as Record<string, unknown> | undefined;
        if (style === undefined || !('color' in style)) return item;
        const rest = { ...style };
        delete rest['color'];
        return { ...item, itemStyle: rest };
      }),
    })),
  };
}

/**
 * `canvas` is the box it will be drawn in: how wide a bar is laid out there
 * decides whether it keeps its surface gap (AC-210).
 */
export function optionFor(given: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  /**
   * An unsplit bar, line or area draws the metrics on its first metric's
   * scale alone (T510; R67, the user: "Draw the first only"): one axis can't
   * honour two, and a count beside revenue was drawn flat on its axis. Its
   * axis then wears the first's format; the editor's pill names the rest.
   */
  // A combo's log scale as it can be drawn: never with bars, on both axes
  // or neither (AC-502), before the axis settings read it. At 100 %, past 8
  // series the smallest fold into "Other (n)" first (T957).
  const spec = foldForShares(withSettledLogScale(onOneScale(given)));
  // The legend is decided once, here, rather than in each renderer. AC-038 is
  // a rule about charts, not about bar charts, and a renderer that forgot it
  // would be a chart type quietly exempt from it.
  const base = legendFor(spec);
  const drawn = (option: EChartsOption): EChartsOption => ({
    // The Customize tab's legend, series, stacking and labels (AC-219) last:
    // they place and trim what the rest has drawn. A line's marked share goes
    // over the lines as they are then stacked (T387).
    ...withMarkedShareLines(
      applyCustomize(
        thinValueLabels(
          // Category labels turned before any is hidden, unless the axis
          // editor set a rotation (T467, UX-117).
          fitCategoryLabels(
            applyAxes(
              withLegend(withKeyboardFocus(withMarks(withHighlight(option, spec), spec), spec)),
              spec,
            ),
            spec,
            canvas,
          ),
        ),
        spec,
      ),
      spec,
    ),
    // A tooltip has to exist before its values can carry member formats
    // (AC-046), and no renderer sets one.
    ...tooltipFor(spec),
  });

  const withLegend = (option: EChartsOption): EChartsOption => ({
    ...option,
    ...base,
    // The renderer's own grid wins on everything it sets; the legend only
    // needs room at the top.
    ...(base['grid'] === undefined || option['grid'] === undefined
      ? {}
      : { grid: { ...(option['grid'] as object), ...(base['grid'] as object) } }),
  });

  /**
   * The prototype's grid (T254, F9): its `{ left: 8, right: 28, top: 12,
   * bottom: 8, containLabel: true }` in ECharts 6's own terms — "same" outer
   * bounds that hold the axes' labels and names inside those edges
   * (research/echarts-text-and-grid.md, Q3). ECharts' default grid, 15% and
   * 10% at the sides and 65 and 80 px above and below, left an empty band
   * under the axis. A renderer's own grid, the legend's room and the Customize
   * tab's placement still win.
   */
  const onGrid = (option: EChartsOption): EChartsOption => ({
    ...option,
    grid: { ...PROTOTYPE_GRID, ...(option['grid'] as object | undefined) },
  });

  // Bars, lines and areas of 2 to 4 series name each where it ends, last, on
  // the series and grid as drawn (T681's follow-up; R76 dashboard-Q1).
  // A stacked bar or area at 100 % drawn as shares last (T957).
  if (isBarType(spec.chartType))
    return withShares(withDirectLabels(drawn(onGrid(barOption(spec, canvas))), spec), spec);
  if (isLineType(spec.chartType))
    return withShares(withDirectLabels(drawn(onGrid(lineOption(spec))), spec), spec);
  if (isScatterType(spec.chartType)) return drawn(onGrid(scatterOption(spec)));
  // Its labels laid out last, for the box Customize's legend leaves it (T395).
  if (isPieType(spec.chartType)) return fitPieLabels(drawn(pieOption(spec)), canvas);
  if (isTreemapType(spec.chartType)) return drawn(treemapOption(spec));
  if (isHeatmapType(spec.chartType)) return drawn(onGrid(heatmapOption(spec)));
  // Its own axes (an array, per panel, formatted by the layout), and no
  // legend — but a tooltip like every other chart (AC-046, T195), and each
  // panel's value labels thinned like any other's (T391's review). Its bars
  // marked, and partly marked, as any chart's are (T453, T507).
  if (isTrellisType(spec.chartType)) {
    return thinValueLabels({
      // Panelled by metric, its keys step through categories: the one they
      // are on ringed in every panel (T510's review, AC-176).
      ...withKeyboardFocus(withMarks(trellisOption(spec, canvas), spec), spec),
      ...tooltipFor(spec),
    });
  }
  // Its lines' halos last, under the lines as drawn (§7h; T846).
  // Split, its tooltip tells a member's measures apart (T852).
  // Below 1,024 px, its ticks compact, its labels level and its legend wrapped (T866).
  if (isComboType(spec.chartType))
    return withComboTooltip(
      withLineHalos(withNarrowCombo(drawn(onGrid(comboOption(spec, canvas))), spec, canvas), spec),
      spec,
    );
  if (isBoxplotType(spec.chartType)) return drawn(onGrid(boxplotOption(spec, canvas)));
  // Its own legend and tooltip, and no axes (T398). Drawn only once its
  // boundaries are registered: the tile loads them first (`loadCountryMap`).
  if (isMapType(spec.chartType)) {
    const map = countryMap();
    if (map === undefined) throw new Error('The country map’s boundaries are not loaded yet.');
    // Marked, highlighted and focused as every chart is (T398's review), in
    // outline and fade only: a region's fill is the scale's, and a colour
    // of the item's own would stand in for it (direction.md, "Country map").
    // Its Points layer over the regions, in colours of its own (T976).
    return withMapPoints(
      regionsFilledByScale(
        withKeyboardFocus(withMarks(withHighlight(mapOption(spec, map), spec), spec), spec),
      ),
      spec,
    );
  }

  // R81's types, each from its own module (T934; `series/registry.ts`).
  const own = SERIES[spec.chartType];
  if (own !== undefined) return drawn(onGrid(own(spec, canvas)));

  // Reached only by the DOM-rendered types — KPI, table and pivot — which
  // `ChartTile` routes before this is called, and which ECharts genuinely
  // does not draw; and by R81's types until their series is registered.
  throw new Error(`No ECharts renderer draws ${spec.chartType}.`);
}
