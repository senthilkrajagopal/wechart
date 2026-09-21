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
import {
  distinctValues,
  formatterFor,
  memberOn,
  membersOn,
  type ChartType,
  type RenderSpec,
} from '@wechart/core';

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

type Params = { seriesName?: string; name?: string; value?: unknown; seriesIndex?: number };

/**
 * A scatter point is `[x, y]`, and both are measures, each with its own
 * format (T195): read as one value, the x measure never appeared.
 */
function scatterTooltip(spec: RenderSpec): EChartsOption {
  const x = memberOn(spec.encoding, 'x') ?? '';
  const y = memberOn(spec.encoding, 'y') ?? '';
  const formats = spec.formats ?? {};
  const [fx, fy] = [formatterFor(x, formats), formatterFor(y, formats)];

  const render = (params: Params) => {
    const [across, down] = Array.isArray(params.value) ? params.value : [];
    return [
      escapeHtml(String(params.seriesName ?? '')),
      `${escapeHtml(x)}: ${escapeHtml(fx(across))}`,
      `${escapeHtml(y)}: ${escapeHtml(fy(down))}`,
    ]
      .filter((line) => line !== '')
      .join('<br/>');
  };

  return { tooltip: { trigger: 'item', formatter: render } };
}

/**
 * A heatmap cell is `[column index, row index, measure]`, and the measure is
 * on the colour channel (T195). Read the way a bar's value is, the tooltip
 * showed the row's index through the measure's formatter, and never the
 * measure. The indices are into the same first-appearance lists the heatmap
 * draws from.
 */
function heatmapTooltip(spec: RenderSpec): EChartsOption {
  const across = memberOn(spec.encoding, 'x') ?? '';
  const down = memberOn(spec.encoding, 'y') ?? '';
  const measure = memberOn(spec.encoding, 'color') ?? '';
  const columns = distinctValues(spec.rows, across);
  const rows = distinctValues(spec.rows, down);
  const format = formatterFor(measure, spec.formats ?? {});

  const render = (params: Params) => {
    const [column, row, value] = Array.isArray(params.value) ? params.value : [];
    const heading = `${columns[Number(column)] ?? ''} · ${rows[Number(row)] ?? ''}`;
    return [escapeHtml(heading), `${escapeHtml(measure)}: ${escapeHtml(format(value))}`].join(
      '<br/>',
    );
  };

  return { tooltip: { trigger: 'item', formatter: render } };
}

export function tooltipFor(spec: RenderSpec): EChartsOption {
  if (NO_TOOLTIP.includes(spec.chartType)) return {};
  if (spec.chartType === 'scatter') return scatterTooltip(spec);
  if (spec.chartType === 'heatmap') return heatmapTooltip(spec);

  const measures = membersOn(spec.encoding, 'y');
  const formats = spec.formats ?? {};
  // One formatter per series, in series order, so each value is written the
  // way its own member declares rather than the way the first one does.
  const formatters = measures.map((measure) => formatterFor(measure, formats));
  // A trellis has one measure and one series per panel, so past the first
  // panel every series falls back to that measure's formatter.
  const fallback = formatterFor(measures[0] ?? '', formats);
  /**
   * Split by colour, a chart draws its first measure once per member of the
   * split, so every series is that measure. Picked by series index instead,
   * the second series took the second measure's format — 76,900 reading
   * "7,690,000%" (T195).
   */
  const split = memberOn(spec.encoding, 'color') !== undefined;

  const render = (params: Params | Params[]) => {
    const rows = Array.isArray(params) ? params : [params];
    const heading = rows[0]?.name ?? '';

    const lines = rows.map((row) => {
      const format = split ? fallback : (formatters[row.seriesIndex ?? 0] ?? fallback);
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
