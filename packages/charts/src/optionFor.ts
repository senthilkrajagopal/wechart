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
import { lineOption, isLineType } from './series/line';
import { pieOption, isPieType } from './series/pie';
import { scatterOption, isScatterType } from './series/scatter';
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
] as const satisfies readonly ChartType[];

export function isDrawable(chartType: string): boolean {
  return (DRAWABLE_TYPES as readonly string[]).includes(chartType);
}

export function optionFor(spec: RenderSpec): EChartsOption {
  if (isBarType(spec.chartType)) return barOption(spec);
  if (isLineType(spec.chartType)) return lineOption(spec);
  if (isScatterType(spec.chartType)) return scatterOption(spec);
  if (isPieType(spec.chartType)) return pieOption(spec);

  throw new Error(`No renderer draws ${spec.chartType} yet.`);
}
