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
import { nameWriter, seriesWriter, titleOf } from './modelWriter';
import { boxesOf, whiskerRuleOf } from './series/boxplot';
import { isPieType } from './series/pie';

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

type Params = {
  seriesName?: string;
  name?: string;
  value?: unknown;
  seriesIndex?: number;
  seriesType?: string;
  dataIndex?: number;
};

/**
 * A scatter point is `[x, y]`, and both are measures, each with its own
 * format (T195): read as one value, the x measure never appeared.
 */
function scatterTooltip(spec: RenderSpec): EChartsOption {
  const x = memberOn(spec.encoding, 'x') ?? '';
  const y = memberOn(spec.encoding, 'y') ?? '';
  const formats = spec.formats ?? {};
  const [fx, fy] = [formatterFor(x, formats), formatterFor(y, formats)];
  // Split, its series by the split's values; unsplit, its one series is the
  // y measure, by its title (AC-220).
  const seriesName = seriesWriter(spec, memberOn(spec.encoding, 'color'));
  // Each axis's measure by its title (AC-220).
  const [xTitle, yTitle] = [titleOf(spec, x), titleOf(spec, y)];

  const render = (params: Params) => {
    const [across, down] = Array.isArray(params.value) ? params.value : [];
    return [
      escapeHtml(seriesName(params.seriesName)),
      `${escapeHtml(xTitle)}: ${escapeHtml(fx(across))}`,
      `${escapeHtml(yTitle)}: ${escapeHtml(fy(down))}`,
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
  const [column, row] = [nameWriter(spec, across), nameWriter(spec, down)];

  const render = (params: Params) => {
    const [at, down, value] = Array.isArray(params.value) ? params.value : [];
    const heading = `${column(columns[Number(at)])} · ${row(rows[Number(down)])}`;
    // The measure by its title (AC-220).
    const named = titleOf(spec, measure);
    return [escapeHtml(heading), `${escapeHtml(named)}: ${escapeHtml(format(value))}`].join(
      '<br/>',
    );
  };

  return { tooltip: { trigger: 'item', formatter: render } };
}

/**
 * A box: its category, n, the minimum, quartiles, median and maximum, and
 * under Tukey's rule where the whiskers end (direction.md rule 88; tabular
 * numerals come with every tooltip, `themed.ts`). ECharts hands a box over as
 * `[category index, low, Q1, median, Q3, high]`, without n, minimum or maximum,
 * so the box is read by its index from the same boxes the chart draws. An
 * outlier is `[category, value]`.
 */
function boxplotTooltip(spec: RenderSpec): EChartsOption {
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const format = formatterFor(measure, spec.formats ?? {});
  const category = nameWriter(spec, memberOn(spec.encoding, 'x'));
  const boxes = boxesOf(spec);
  const tukey = whiskerRuleOf(spec) === 'tukey';

  const render = (params: Params) => {
    const value = Array.isArray(params.value) ? params.value : [];
    if (params.seriesType === 'scatter') {
      const [name, outlier] = value;
      return [
        escapeHtml(category(name)),
        `${escapeHtml(titleOf(spec, measure))}: ${escapeHtml(format(outlier))}, beyond the whiskers`,
      ].join('<br/>');
    }
    const box = boxes[params.dataIndex ?? -1];
    if (box === undefined) return '';
    const { stats } = box;
    return [
      escapeHtml(category(box.name)),
      `n: ${stats.n.toLocaleString('en-US')}`,
      `Minimum: ${escapeHtml(format(stats.min))}`,
      `Q1: ${escapeHtml(format(stats.q1))}`,
      `Median: ${escapeHtml(format(stats.median))}`,
      `Q3: ${escapeHtml(format(stats.q3))}`,
      `Maximum: ${escapeHtml(format(stats.max))}`,
      ...(tukey
        ? [`Whiskers: ${escapeHtml(format(stats.low))} – ${escapeHtml(format(stats.high))}`]
        : []),
    ].join('<br/>');
  };

  return { tooltip: { trigger: 'item', formatter: render } };
}

export function tooltipFor(spec: RenderSpec): EChartsOption {
  if (NO_TOOLTIP.includes(spec.chartType)) return {};
  if (spec.chartType === 'scatter') return scatterTooltip(spec);
  if (spec.chartType === 'heatmap') return heatmapTooltip(spec);
  if (spec.chartType === 'boxplot') return boxplotTooltip(spec);

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
  /**
   * The heading is the category, and a series is named by the member it
   * splits by — the colour, or a trellis's panel — so a time among them is
   * written by its granularity, not as Cube's timestamp (AC-188).
   */
  const pie = isPieType(spec.chartType);
  // A pie's slice is named already, by every value it is grouped by (AC-221).
  const category = pie
    ? (value: unknown) => String(value ?? '')
    : nameWriter(spec, memberOn(spec.encoding, 'x'));
  /**
   * A series per measure by the measure's title (AC-220). A pie's or a
   * treemap's one series is its measure, whatever its parts are split by, and
   * is named by it rather than by the series ECharts numbers.
   */
  const whole = pie || spec.chartType === 'treemap';
  const seriesName = whole
    ? () => titleOf(spec, measures[0] ?? '')
    : seriesWriter(spec, memberOn(spec.encoding, 'color') ?? memberOn(spec.encoding, 'facet'));

  const render = (params: Params | Params[]) => {
    const rows = Array.isArray(params) ? params : [params];
    const heading = rows[0]?.name ?? '';

    const lines = rows.map((row) => {
      const format = split ? fallback : (formatters[row.seriesIndex ?? 0] ?? fallback);
      const raw = Array.isArray(row.value) ? row.value[1] : row.value;
      return `${escapeHtml(seriesName(row.seriesName))}: ${escapeHtml(format(raw))}`;
    });

    return [escapeHtml(heading === '' ? '' : category(heading)), ...lines]
      .filter((line) => line !== '')
      .join('<br/>');
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
