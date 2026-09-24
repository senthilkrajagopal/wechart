import { memberOn, seriesOf, type RenderSpec } from '@wechart/core';

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
}

/** Chart types where a click means the series, not the category. */
const BY_SERIES = new Set(['groupedBar', 'stackedBar', 'multiLine', 'stackedArea', 'combo']);

export interface ClickedValue {
  readonly member: string;
  readonly value: string;
}

export function clickedValue(spec: RenderSpec, item: ClickedItem): ClickedValue | undefined {
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
