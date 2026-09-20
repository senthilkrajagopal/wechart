/**
 * The tooltip (AC-046, direction.md §6 "Tooltip").
 *
 * AC-046 requires member formats "in axes, labels, tooltips and tables", which
 * means there has to *be* a tooltip. direction.md asks for a crosshair on line
 * and area charts and a per-mark tooltip on bar, dot and cell marks, so that
 * is the split here.
 *
 * Every value goes through the member's own formatter, so a currency measure
 * reads as money in the tooltip exactly as it does on the axis and in the
 * table. Getting that wrong is how the same number comes to appear three ways
 * in one chart.
 */
import { formatterFor, membersOn, type ChartType, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from './theme';

/** Types where a shared crosshair reads better than a per-mark hit. */
const CROSSHAIR_TYPES: readonly ChartType[] = ['line', 'multiLine', 'area', 'stackedArea', 'combo'];

/** Types with no marks to hover, or their own DOM rendering. */
const NO_TOOLTIP: readonly ChartType[] = ['kpi', 'table', 'pivot'];

/** Escaped, because ECharts' tooltip formatter returns raw HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tooltipFor(spec: RenderSpec): EChartsOption {
  if (NO_TOOLTIP.includes(spec.chartType)) return {};

  const measures = membersOn(spec.encoding, 'y');
  const formats = spec.formats ?? {};
  // One formatter per series, in series order, so each value is written the
  // way its own member declares rather than the way the first one does.
  const formatters = measures.map((measure) => formatterFor(measure, formats));
  const fallback = formatterFor(measures[0] ?? '', formats);

  type Params = { seriesName?: string; name?: string; value?: unknown; seriesIndex?: number };

  const render = (params: Params | Params[]) => {
    const rows = Array.isArray(params) ? params : [params];
    const heading = rows[0]?.name ?? '';

    const lines = rows.map((row) => {
      const format = formatters[row.seriesIndex ?? 0] ?? fallback;
      // A value can arrive as [x, y] on a scatter; the measure is the second.
      const raw = Array.isArray(row.value) ? row.value[1] : row.value;
      return `${escapeHtml(String(row.seriesName ?? ''))}: ${escapeHtml(format(raw))}`;
    });

    return [escapeHtml(String(heading)), ...lines].filter((line) => line !== '').join('<br/>');
  };

  return {
    tooltip: {
      trigger: CROSSHAIR_TYPES.includes(spec.chartType) ? 'axis' : 'item',
      ...(CROSSHAIR_TYPES.includes(spec.chartType)
        ? { axisPointer: { type: 'cross' as const } }
        : {}),
      formatter: render,
    },
  };
}
