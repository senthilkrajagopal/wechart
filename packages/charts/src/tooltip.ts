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
import type { ItemShare } from './marking/partialOption';
import { nameWriter, seriesWriter, titleOf } from './modelWriter';
import { boxesOf, whiskerRuleOf } from './series/boxplot';
import { isPieType } from './series/pie';
import { sankeyDrawnOf } from './series/sankey';
import { compactWriter } from './compact';

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
  /** The item as the option has it: a partly marked one carries its `share` (T387). */
  data?: unknown;
};

/** A partly marked item's total and marked part, where it has them (T387). */
const shareOf = (row: Params): ItemShare | undefined =>
  (row.data as { share?: ItemShare } | null | undefined)?.share;

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
    // A partly marked point's marked values, each beside its whole (T453).
    const markedBy = shareOf(params)?.markedBy ?? {};
    const marked = (member: string, format: (value: unknown) => string) =>
      markedBy[member] === undefined ? '' : ` · Marked: ${format(markedBy[member])}`;
    return [
      escapeHtml(seriesName(params.seriesName)),
      `${escapeHtml(xTitle)}: ${escapeHtml(fx(across) + marked(x, fx))}`,
      `${escapeHtml(yTitle)}: ${escapeHtml(fy(down) + marked(y, fy))}`,
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
    // A partly marked cell's marked value beside its whole (T453).
    const share = shareOf(params);
    const marked = share?.marked === undefined ? '' : ` · Marked: ${format(share.marked)}`;
    return [
      escapeHtml(heading),
      `${escapeHtml(named)}: ${escapeHtml(format(value) + marked)}`,
    ].join('<br/>');
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
      const [name, point] = value;
      // A point is said to be beyond the whiskers only when it is: All and
      // Beeswarm draw every point (T991).
      const its = boxes.find((one) => one.name === String(name));
      const beyond =
        its === undefined || Number(point) < its.stats.low || Number(point) > its.stats.high;
      return [
        escapeHtml(category(name)),
        `${escapeHtml(titleOf(spec, measure))}: ${escapeHtml(format(point))}${beyond ? ', beyond the whiskers' : ''}`,
      ].join('<br/>');
    }
    const box = boxes[params.dataIndex ?? -1];
    if (box === undefined) return '';
    const { stats } = box;
    // A partly marked box: how many of its points hold marked rows (T453).
    const marked = shareOf(params)?.marked;
    return [
      escapeHtml(category(box.name)),
      `n: ${stats.n.toLocaleString('en-US')}${
        marked === undefined ? '' : ` · Marked: ${marked.toLocaleString('en-US')}`
      }`,
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

/**
 * A Sankey's node or link (T987; design 23 sheet 10): a node its name and
 * total; a link "‹source› → ‹target›", its value, and its share of what
 * leaves its source and of what reaches its target ("32 % of Web · 51 % of
 * EMEA").
 */
function sankeyTooltip(spec: RenderSpec): EChartsOption {
  const { measure, flows } = sankeyDrawnOf(spec);
  const write = formatterFor(measure ?? '', spec.formats ?? {});
  const title = escapeHtml(titleOf(spec, measure ?? ''));
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const flow of flows) {
    out.set(flow.source, (out.get(flow.source) ?? 0) + flow.value);
    into.set(flow.target, (into.get(flow.target) ?? 0) + flow.value);
  }
  const pct = (part: number, whole: number | undefined) =>
    whole === undefined || whole === 0 ? '' : `${String(Math.round((part / whole) * 100))} %`;
  const short = compactWriter(spec, measure ?? '');
  const render = (params: Params & { dataType?: string }) => {
    const value = Number(params.value ?? 0);
    const link = params.data as
      { source?: string; target?: string; share?: { marked: number; total: number } } | undefined;
    if (params.dataType === 'edge' && link?.source !== undefined && link.target !== undefined) {
      return [
        `${escapeHtml(link.source)} → ${escapeHtml(link.target)}`,
        `${title}: ${escapeHtml(write(value))}`,
        `${pct(value, out.get(link.source))} of ${escapeHtml(link.source)} · ${pct(value, into.get(link.target))} of ${escapeHtml(link.target)}`,
        // A partly marked flow's share, not drawn: one width (T988, AC-612).
        ...(link.share === undefined
          ? []
          : [
              `Marked: ${escapeHtml(short(link.share.marked))} of ${escapeHtml(short(link.share.total))}`,
            ]),
      ].join('<br/>');
    }
    return [escapeHtml(params.name ?? ''), `${title}: ${escapeHtml(write(value))}`].join('<br/>');
  };
  return { tooltip: { trigger: 'item', formatter: render } };
}

/** A parallel-coordinate line (T982): its member, then its value on each axis, in order. */
function parallelTooltip(spec: RenderSpec): EChartsOption {
  const axes = membersOn(spec.encoding, 'y');
  const formats = spec.formats ?? {};
  const writers = axes.map((measure) => formatterFor(measure, formats));
  const render = (params: Params | Params[]) => {
    const line = Array.isArray(params) ? params[0] : params;
    const values = Array.isArray(line?.value) ? line.value : [];
    return [
      escapeHtml(String(line?.name ?? '')),
      ...axes.map(
        (measure, at) =>
          `${escapeHtml(titleOf(spec, measure))}: ${escapeHtml(writers[at]?.(values[at]) ?? '')}`,
      ),
    ].join('<br/>');
  };
  return { tooltip: { trigger: 'item', formatter: render } };
}

export function tooltipFor(
  spec: RenderSpec,
  /**
   * The measure a series draws, by its index in the option as drawn, where
   * its name is a member's that several measures share: a combo split across
   * every measure (T852, AC-504; `withComboTooltip`).
   */
  measureOfSeries?: (seriesIndex: number) => string | undefined,
): EChartsOption {
  if (NO_TOOLTIP.includes(spec.chartType)) return {};
  if (spec.chartType === 'parallel') return parallelTooltip(spec);
  if (spec.chartType === 'sankey') return sankeyTooltip(spec);
  if (spec.chartType === 'scatter') return scatterTooltip(spec);
  if (spec.chartType === 'heatmap') return heatmapTooltip(spec);
  if (spec.chartType === 'boxplot') return boxplotTooltip(spec);

  const measures = membersOn(spec.encoding, 'y');
  const formats = spec.formats ?? {};
  // One formatter per series, in series order, so each value is written the
  // way its own member declares rather than the way the first one does.
  const formatters = measures.map((measure) => formatterFor(measure, formats));
  // A trellis panelled by a member has one measure and one series per panel,
  // so past the first panel every series falls back to that measure's
  // formatter. One panelled by metric names each series by its metric (T510).
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

    /**
     * A partly marked item's parts — a bar's two, a line and its marked line —
     * are one item: said once, as its whole (T387, direction.md: "Marked: X"
     * beside the total). By its remainder where there is one, else as the
     * first of them, so a gap in both lines is one gap. Only rows of a series
     * that carries a share are merged: the cross-filter's overlay may share a
     * series' name and is said on its own.
     */
    // A split combo's series of one member are told apart by their measure.
    const ownMeasure = (row: Params) =>
      row.seriesIndex === undefined ? undefined : measureOfSeries?.(row.seriesIndex);
    const said = rows.filter((row) => {
      const same = rows.filter(
        (other) => other.seriesName === row.seriesName && ownMeasure(other) === ownMeasure(row),
      );
      if (same.length < 2 || !same.some((other) => shareOf(other) !== undefined)) return true;
      return (same.find((other) => shareOf(other)?.part === 'rest') ?? same[0]) === row;
    });
    const lines = said.map((row) => {
      const own = ownMeasure(row);
      // By the series' measure, found by its name: its place moves with the
      // order set in Customize, or a series hidden before it (T392's review).
      const named = measures.indexOf(String(row.seriesName ?? ''));
      const format =
        own !== undefined
          ? formatterFor(own, formats)
          : split
            ? fallback
            : (formatters[named === -1 ? (row.seriesIndex ?? 0) : named] ?? fallback);
      const share = shareOf(row);
      const raw = share?.total ?? (Array.isArray(row.value) ? row.value[1] : row.value);
      const marked = share?.marked === undefined ? '' : ` · Marked: ${format(share.marked)}`;
      // Its member, then its measure, where several measures share a member.
      const label =
        own === undefined
          ? seriesName(row.seriesName)
          : `${seriesName(row.seriesName)} · ${titleOf(spec, own)}`;
      return `${escapeHtml(label)}: ${escapeHtml(format(raw) + marked)}`;
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
