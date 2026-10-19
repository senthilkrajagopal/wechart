import {
  distinctValues,
  isPercentStack,
  kpiOptionsOf,
  memberOn,
  onOneScale,
  OTHER_LABEL,
  seriesOf,
  type MarkedItem,
  type RenderSpec,
} from '@wechart/core';

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
/**
 * Whether a chart is a KPI tiled by a dimension (T941, AC-568): as a
 * Highlight target it says the selection's share on each tile, where a
 * single KPI is filtered, as Power BI does.
 */
export function isTiledKpi(spec: RenderSpec): boolean {
  return spec.chartType === 'kpi' && kpiOptionsOf(spec.options).tileBy !== undefined;
}

export function seriesCountOf(spec: RenderSpec): number {
  try {
    // As drawn: a metric on another scale than the first is no series (T510).
    return seriesOf(onOneScale(spec)).series.length;
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
   * time is titled by its granularity and that is not the value. The panels
   * as drawn, so read against the spec the tile draws, as the filters leave
   * it (T632).
   */
  readonly panelIndex?: number | undefined;
  /**
   * The entity a box plot's point is, by its "Each point is" value as text
   * (AC-593): the point stands for it, not for its category.
   */
  readonly entity?: string | undefined;
  /**
   * What the item stands for as the chart drew it, where its type says so
   * itself (T988, AC-612): a Sankey node its member, a link its (source,
   * target) tuple. "Other" carries none, being no member.
   */
  readonly marks?: MarkedItem | undefined;
}

/** What a clicked item stands for as drawn (a Sankey's node or link, AC-612). */
export function clickedMarks(params: { data?: unknown }): MarkedItem | undefined {
  const { data } = params;
  const own =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as { marks?: unknown }).marks
      : undefined;
  if (!Array.isArray(own) || own.length === 0) return undefined;
  const parts = own.filter(
    (part): part is MarkedItem[number] =>
      typeof part === 'object' &&
      part !== null &&
      typeof (part as { member?: unknown }).member === 'string' &&
      ['string', 'number'].includes(typeof (part as { value?: unknown }).value),
  );
  return parts.length === own.length ? parts : undefined;
}

/** The entity a clicked item carries as drawn (a box plot's point, AC-593), as text. */
export function clickedEntity(params: { data?: unknown }): string | undefined {
  const { data } = params;
  const own =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as { entity?: unknown }).entity
      : undefined;
  return own === undefined || own === null ? undefined : String(own);
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
  /**
   * The rest of a tuple the item stands for, each filtered by too (a Sankey
   * link's target, T988, AC-612); none for a single member.
   */
  readonly also?: readonly { readonly member: string; readonly value: string }[];
}

/**
 * Whether a click on an item of this chart type marks its x category — the
 * item Invert marking and Mark all count as the tile's (AC-115). Not where a
 * click marks its series or its panel, nor a table's or a pivot's rows, which
 * are marked by their own keys (AC-092).
 */
export function clickMarksCategory(spec: Pick<RenderSpec, 'chartType' | 'encoding'>): boolean {
  if (panelledByMetric(spec)) return true;
  const { chartType } = spec;
  return !BY_SERIES.has(chartType) && !['trellis', 'table', 'pivot', 'kpi'].includes(chartType);
}

/**
 * Small multiples panelled by metric (T510): a panel per measure, nothing to
 * panel by. A bar there stands for its category, as a bar's does, and a
 * header names a measure, which is no value of anything.
 */
function panelledByMetric(spec: Pick<RenderSpec, 'chartType' | 'encoding'>): boolean {
  return spec.chartType === 'trellis' && memberOn(spec.encoding, 'facet') === undefined;
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
  // A Sankey's node is its member and its link its tuple (AC-612), and a
  // tiled KPI's tile its member (AC-568); "Other", or anything else that
  // carries nothing, is no member of anything. A parallel-coordinate line is
  // its member as its row holds it (T983, AC-599).
  if (
    spec.chartType === 'sankey' ||
    spec.chartType === 'kpi' ||
    (spec.chartType === 'parallel' && item.marks !== undefined)
  ) {
    const [first, ...rest] = item.marks ?? [];
    if (first === undefined) return undefined;
    const said = (part: MarkedItem[number]) => ({
      member: part.member,
      value: String(part.value),
    });
    return rest.length === 0 ? said(first) : { ...said(first), also: rest.map(said) };
  }
  // A box plot's point is its entity (AC-593): "a point to its Order".
  if (spec.chartType === 'boxplot' && item.entity !== undefined && spec.eachPointIs !== undefined)
    return { member: spec.eachPointIs, value: item.entity };
  const bySeries = BY_SERIES.has(spec.chartType);
  const byPanel = spec.chartType === 'trellis' && !panelledByMetric(spec);
  const channel = byPanel ? 'facet' : bySeries ? 'color' : 'x';
  /**
   * No fallback to x on these: where such a chart has no split, its series
   * are its *measures* (`core/render-spec.ts`, "one series per measure"), so
   * the name under the pointer is "orders.count", not a value of anything.
   * Paired with the x member it would make a filter no row can match —
   * `orders.status = 'orders.count'` — and empty every target it reached.
   */
  const member = memberOn(spec.encoding, channel);
  const value = bySeries || byPanel ? item.seriesName : item.name;

  // A click that lands on nothing nameable — an empty plot area, or a type
  // drawn from no dimension at all, such as a KPI — selects nothing.
  if (member === undefined || value === undefined || value === '') return undefined;
  return { member, value };
}

/**
 * The item a click marks (AC-087): what `clickedValue` names, as a one-member
 * item; but a segment of a stack drawn at 100 % marks its (category, colour
 * member) tuple — EMEA's Web segment, not every Web segment (T958, AC-585;
 * design 23 sheet 9) — while its legend entry still marks the colour member
 * (AC-090). A stack at Sum marks its segment's series, as it did.
 */
export function clickedMarkItem(spec: RenderSpec, item: ClickedItem): MarkedItem | undefined {
  // What the item stands for as drawn, its values as its rows hold them
  // (AC-612): a Sankey's node or link, a tiled KPI's tile (AC-568), a
  // parallel-coordinate line (T983, AC-599).
  if (
    spec.chartType === 'sankey' ||
    spec.chartType === 'kpi' ||
    (spec.chartType === 'parallel' && item.marks !== undefined)
  )
    return item.marks;
  const clicked = clickedValue(spec, item);
  if (clicked === undefined) return undefined;
  // A point's entity as its row holds it, so the row matches (AC-593).
  if (clicked.member === spec.eachPointIs && item.entity !== undefined) {
    const held = spec.rows.find((row) => String(row[clicked.member]) === clicked.value)?.[
      clicked.member
    ];
    return [
      {
        member: clicked.member,
        value: typeof held === 'number' || typeof held === 'string' ? held : clicked.value,
      },
    ];
  }
  const category = memberOn(spec.encoding, 'x');
  const tuple =
    isPercentStack(spec) &&
    item.legend === undefined &&
    item.panelIndex === undefined &&
    category !== undefined &&
    item.name !== undefined &&
    item.name !== '' &&
    // "Other (n)" past 8 series is no member of anything: no tuple of it
    // (T958's review), as the tile's items leave it out.
    !clicked.value.startsWith(`${OTHER_LABEL} (`);
  return tuple ? [{ member: category, value: item.name ?? '' }, clicked] : [clicked];
}
