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
import type { ChartType, RenderSpec } from '@wechart/core';

import { barOption, isBarType } from './series/bar';
import { applyAxes } from './axis';
import { isTrellisType, trellisOption } from './layout/trellis';
import { legendFor } from './legend';
import { comboOption, isComboType } from './series/combo';
import { heatmapOption, isHeatmapType } from './series/heatmap';
import { lineOption, isLineType } from './series/line';
import { pieOption, isPieType } from './series/pie';
import { scatterOption, isScatterType } from './series/scatter';
import { isTreemapType, treemapOption } from './series/treemap';
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
] as const satisfies readonly ChartType[];

export function isDrawable(chartType: string): boolean {
  return (DRAWABLE_TYPES as readonly string[]).includes(chartType);
}

export function optionFor(spec: RenderSpec): EChartsOption {
  // The legend is decided once, here, rather than in each renderer. AC-038 is
  // a rule about charts, not about bar charts, and a renderer that forgot it
  // would be a chart type quietly exempt from it.
  const base = legendFor(spec);
  const drawn = (option: EChartsOption): EChartsOption => applyAxes(withLegend(option), spec);

  const withLegend = (option: EChartsOption): EChartsOption => ({
    ...option,
    ...base,
    // The renderer's own grid wins on everything it sets; the legend only
    // needs room at the top.
    ...(base['grid'] === undefined || option['grid'] === undefined
      ? {}
      : { grid: { ...(option['grid'] as object), ...(base['grid'] as object) } }),
  });

  if (isBarType(spec.chartType)) return drawn(barOption(spec));
  if (isLineType(spec.chartType)) return drawn(lineOption(spec));
  if (isScatterType(spec.chartType)) return drawn(scatterOption(spec));
  if (isPieType(spec.chartType)) return drawn(pieOption(spec));
  if (isTreemapType(spec.chartType)) return drawn(treemapOption(spec));
  if (isHeatmapType(spec.chartType)) return drawn(heatmapOption(spec));
  if (isTrellisType(spec.chartType)) return trellisOption(spec);
  if (isComboType(spec.chartType)) return drawn(comboOption(spec));

  // Reached only by the DOM-rendered types — KPI, table and pivot — which
  // `ChartTile` routes before this is called, and which ECharts genuinely
  // does not draw.
  throw new Error(`No ECharts renderer draws ${spec.chartType}.`);
}
