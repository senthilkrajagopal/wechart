import { distinctValues, memberOn, seriesOf, type RenderSpec } from '@wechart/core';

/**
 * Which member value a click on a chart item stands for (AC-117).
 *
 * Not every chart type answers with the same channel. A bar's category is its
 * x member, but a click on a grouped or stacked bar, or on one line of
 * several, means the series it belongs to, and a click inside a trellis panel
 * means that panel. The prototype's own rule
 * (`docs/design/prototype/charts.js`, `onSelect`), which is also what the
 * chart shows the reader: the thing under the pointer is the thing named in
 * the legend or on the axis.
 */

/**
 * The members a chart groups by — what its items stand for. A highlight can
 * only be drawn as a fade where the clicked member is one of these, because
 * otherwise no item on the chart is the selection.
 */
export function membersDrawn(spec: RenderSpec): string[] {
  return (['x', 'color', 'facet'] as const).flatMap((channel) => {
    const member = memberOn(spec.encoding, channel);
    return member === undefined ? [] : [member];
  });
}

/**
 * How many series a chart draws. The share's overlay needs exactly one, and
 * the chart type does not say: a bar chart draws one series per measure, or
 * one per value of its colour split (`charts/src/series/bar.ts`).
 */
export function seriesCountOf(spec: RenderSpec): number {
  try {
    return seriesOf(spec).series.length;
  } catch {
    // A type `seriesOf` does not lay out — a treemap, a KPI — draws no
    // cartesian series, and neither draws a share.
    return 0;
  }
}

/** What the renderer reports about the item clicked. */
export interface ClickedItem {
  /** The category, as the axis writes it. */
  readonly name?: string | undefined;
  /** The series, as the legend writes it. */
  readonly seriesName?: string | undefined;
  /**
   * The legend entry clicked, where the click was on the legend rather than
   * on a mark (AC-090): every item of that category, not one of them.
   */
  readonly legend?: string | undefined;
  /**
   * The trellis panel whose header was clicked, by its place among the
   * panels (AC-091). Its index rather than its title, because a panel of
   * time is titled by its granularity and that is not the value.
   */
  readonly panelIndex?: number | undefined;
}

/** Chart types where a click means the series, not the category. */
// A scatter's x is a measure: a point stands for the series it is in (T242).
const BY_SERIES = new Set([
  'groupedBar',
  'stackedBar',
  'multiLine',
  'stackedArea',
  'combo',
  'scatter',
]);

/**
 * The name a click on an item carries: a pie's slice carries the category it
 * stands for apart from its written name — "shipped · North" is the slice's
 * name for its reader (AC-221), and no row's value — so that, and otherwise
 * the name ECharts reports.
 */
export function clickedName(params: { name?: string | undefined; data?: unknown }): string {
  const { data } = params;
  const own =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as { category?: unknown }).category
      : undefined;
  return typeof own === 'string' ? own : (params.name ?? '');
}

export interface ClickedValue {
  readonly member: string;
  readonly value: string;
}

export function clickedValue(spec: RenderSpec, item: ClickedItem): ClickedValue | undefined {
  /**
   * A legend entry names a category of the split — the member the legend was
   * drawn from. A chart with no split lists its measures there, and a
   * measure is not a value of anything (AC-090).
   */
  if (item.panelIndex !== undefined) {
    const facet = memberOn(spec.encoding, 'facet');
    const panel =
      facet === undefined ? undefined : distinctValues(spec.rows, facet)[item.panelIndex];
    return facet === undefined || panel === undefined ? undefined : { member: facet, value: panel };
  }
  if (item.legend !== undefined) {
    const split = memberOn(spec.encoding, 'color') ?? memberOn(spec.encoding, 'facet');
    return split === undefined || item.legend === ''
      ? undefined
      : { member: split, value: item.legend };
  }
  const bySeries = BY_SERIES.has(spec.chartType);
  const channel = spec.chartType === 'trellis' ? 'facet' : bySeries ? 'color' : 'x';
  /**
   * No fallback to x on these: where such a chart has no split, its series
   * are its *measures* (`core/render-spec.ts`, "one series per measure"), so
   * the name under the pointer is "orders.count", not a value of anything.
   * Paired with the x member it would make a filter no row can match —
   * `orders.status = 'orders.count'` — and empty every target it reached.
   */
  const member = memberOn(spec.encoding, channel);
  const value = bySeries || spec.chartType === 'trellis' ? item.seriesName : item.name;

  // A click that lands on nothing nameable — an empty plot area, or a type
  // drawn from no dimension at all, such as a KPI — selects nothing.
  if (member === undefined || value === undefined || value === '') return undefined;
  return { member, value };
}
