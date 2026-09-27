/**
 * What a drawn chart is, independent of any renderer.
 *
 * `chart-spec.ts` holds the *authoring* shape — which members the user put in
 * which well. This holds the *drawing* shape: which member plays which role,
 * and the rows to draw. Keeping them apart matters because the wells do not
 * determine the roles on their own: two measures become two series, while one
 * measure split by a dimension becomes two series as well, and the renderer
 * should not have to rediscover that from the wells every time.
 *
 * Nothing here mentions ECharts (CLAUDE.md), and no colour is chosen here: the
 * palette is handed in, so @wechart/charts never imports the theme.
 */
import type { MemberFormats, MemberGranularities } from './format';
import type { MarkingPredicate } from './markings/predicate';

/**
 * Every chart type wechart draws — exactly the list AC-037 names.
 *
 * It lives here, in the spec, rather than in the recommender, because it is
 * the vocabulary a saved chart is written in. The recommender re-exports it so
 * there is one list: two lists would drift, and a recommender that proposed a
 * type the renderer had never heard of would fail at draw time.
 */
export type ChartType =
  | 'bar'
  | 'hbar'
  | 'groupedBar'
  | 'stackedBar'
  | 'line'
  | 'multiLine'
  | 'area'
  | 'stackedArea'
  | 'scatter'
  | 'pie'
  | 'donut'
  | 'treemap'
  | 'heatmap'
  | 'kpi'
  | 'table'
  | 'pivot'
  | 'trellis'
  | 'combo'
  // Phase 2 (AC-306): the spread of a measure's values in each category.
  | 'boxplot'
  // Phase 2 (AC-305): a measure by country, its dimension ISO-3 codes.
  | 'map';

/**
 * The visual channels a member can be bound to.
 *
 * Cut down from the channel model in docs/research/vega-lite.md to the ones
 * wechart's own chart types need. It lives here, with the drawing vocabulary,
 * and the saved document imports it — the same direction as `ChartType`.
 */
export type Channel = 'x' | 'y' | 'color' | 'size' | 'facet' | 'row' | 'column';

export const CHANNELS: readonly Channel[] = ['x', 'y', 'color', 'size', 'facet', 'row', 'column'];

/**
 * Every chart type, at runtime. The union above is the same list to the type
 * checker; this is for the places that have to iterate it — a picker offering
 * every type, or a test asserting that whatever has no renderer says so.
 */
export const CHART_TYPES: readonly ChartType[] = [
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
  'kpi',
  'table',
  'pivot',
  'trellis',
  'combo',
  'boxplot',
  'map',
];

/**
 * Which member plays which role in a drawn chart, as visual **channels**.
 *
 * Channels rather than `{category, series, values}`, because that trio was
 * fitted to the bar and line families and cannot express the rest of AC-037's
 * list: scatter has two value axes, a heatmap has two categorical axes plus a
 * measure on colour, a treemap has a hierarchy plus a size, a pivot has rows
 * and columns, a trellis has a facet. The channel vocabulary and the principle
 * that a spec "names data roles and visual channels" with rendering happening
 * only after compilation both come from docs/research/vega-lite.md.
 *
 * Every channel holds a list. Most hold at most one member; the value axis
 * genuinely takes several, and one uniform shape beats a union of singular and
 * plural channels that every caller would have to know about.
 */
export type Encoding = Partial<Record<Channel, readonly string[]>>;

/** The one member on a channel, where a chart expects at most one. */
export function memberOn(encoding: Encoding, channel: Channel): string | undefined {
  return encoding[channel]?.[0];
}

/** Every member on a channel, in order. */
export function membersOn(encoding: Encoding, channel: Channel): readonly string[] {
  return encoding[channel] ?? [];
}

/** Everything a renderer needs to draw one chart. */
export interface RenderSpec {
  readonly chartType: ChartType;
  readonly encoding: Encoding;
  /** Cube's result rows, keyed by member name. */
  readonly rows: readonly Record<string, unknown>[];
  /**
   * Series colours in assignment order. Handed in rather than looked up so
   * the same member can keep one colour across a whole dashboard (AC-039),
   * which is a decision about the dashboard, not about one chart.
   */
  readonly palette?: readonly string[];
  /**
   * Colour per member, where the dashboard has decided one (AC-039).
   *
   * Data rather than a function, so a compiled spec stays inspectable and
   * serialisable. A member absent here falls back to the palette by position,
   * which is right for a chart standing on its own.
   */
  readonly colours?: Readonly<Record<string, string>>;
  /**
   * The `format` each member declares in the Cube model (AC-046).
   *
   * Carried on the spec rather than looked up per renderer, so that an axis,
   * a table cell and a tooltip of the same chart cannot disagree about how a
   * number is written.
   */
  readonly formats?: MemberFormats;
  /**
   * Each member's title from the model (AC-220), so a legend, a tooltip or a
   * table header names it as a reader knows it — "Orders Count", never
   * "orders.count". A member absent here is written as its name.
   */
  readonly titles?: Readonly<Record<string, string>>;
  /**
   * Each member's short title from the model — "Count" for "Orders Count" —
   * for where its cube or view is evident: the legend and KPI label of a
   * chart whose members are all one cube's (T403, AC-220). Its full title
   * everywhere else.
   */
  readonly shortTitles?: Readonly<Record<string, string>>;
  /**
   * Each time member's granularity in the query the rows answer (AC-188), so
   * every place a time value is written can write it by its bucket — "Jan
   * 2026" for a month — rather than as Cube's raw timestamp.
   */
  readonly granularities?: MemberGranularities;
  /**
   * The chart's measures (T179, AC-173), whichever channel draws them: an
   * export writes each one's raw number beside its formatted value.
   */
  readonly measures?: readonly string[];
  /**
   * The chart's fields in the wells' order (T393, AC-301): its time
   * dimensions, its dimensions, then its measures as the Metrics well has
   * them. What a table heads its columns by, and its CSV.
   */
  readonly fields?: readonly string[];
  /** The colour the chart is drawn on, used for the gap between marks. */
  readonly surface?: string;
  /**
   * What the user changed about how this chart type is drawn, carried through
   * from the saved document unchanged.
   *
   * Sparse: absent means every default applies. Deliberately not a union of
   * per-type option shapes — an option belonging to a type that is not
   * currently selected stays inert rather than becoming invalid, which is what
   * lets a user switch type and switch back. Grafana and Metabase both leave
   * the equivalent field untyped for the same reason.
   */
  readonly options?: Record<string, unknown>;
  /**
   * The cross-filter selection this chart shows, where a tile pair is set to
   * Highlight (AC-117, `docs/research/cross-highlight.md`).
   *
   * Filtering is not drawing: a filtered tile is asked a narrower question and
   * draws the answer, and nothing about that reaches here. A highlighted tile
   * is asked its own question and draws the selection *beside* its own
   * answer, so the renderer has to be told which value that is.
   */
  readonly highlight?: ChartHighlight;
  /**
   * The marking this tile shows, where it marks with one (AC-096).
   *
   * The predicate rather than a list of marked rows: a marking is a rule
   * about values, and the tile's own rows are what it is tested against — so
   * a tile whose rows change under a filter marks whatever now matches,
   * rather than keeping a stale set of row indices.
   */
  readonly marking?: ChartMarking;
  /**
   * The category a tile's keyboard is on (AC-100, T306): drawn with a focus
   * ring so a sighted keyboard user sees what Space will mark (AC-176). Only
   * while the tile has the keyboard; absent otherwise.
   */
  readonly keyboardFocus?: string | undefined;
}

export interface ChartMarking {
  readonly predicate: MarkingPredicate;
  /** The marking's own colour (its slot), for the outline on marked items. */
  readonly colour: string;
  /**
   * This tile is marked whole ("Mark all", AC-115): every item it draws is
   * marked, whatever its rows carry — its own filters are what chose them.
   */
  readonly whole?: boolean;
}

export interface ChartHighlight {
  readonly member: string;
  readonly value: string;
  /**
   * `fade`: the items that are the selection keep their strength and the rest
   * fade. `share`: the chart's own values fade, and the selection's own
   * values are drawn over them from the baseline, as Power BI draws a
   * cross-highlight.
   */
  readonly kind: 'fade' | 'share';
  /**
   * For a share: the same query's rows, answered with the selection applied.
   * Its own rows, not a fraction of these — a measure over a subset is not a
   * portion of the measure over everything, which is exactly why this is a
   * second answer from Cube rather than arithmetic here.
   */
  readonly rows?: readonly Record<string, unknown>[];
}

/**
 * The distinct values of a member, in the order the rows first mention them.
 *
 * First-appearance order, not sorted: the rows arrive in the order Cube was
 * asked for them, and re-sorting here would quietly override the chart's own
 * ordering (AC-044 owns that).
 */
export function distinctValues(rows: readonly Record<string, unknown>[], member: string): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    const value = String(row[member] ?? '');
    if (!seen.includes(value)) seen.push(value);
  }
  return seen;
}

/** One drawable series: its name, and one value per category. */
export interface SeriesData {
  readonly name: string;
  readonly values: readonly (number | null)[];
}

/**
 * The categories and series a spec draws, in draw order.
 *
 * A gap — a category a series has no row for — is `null` rather than 0. Zero
 * is a measurement; a missing row is the absence of one, and drawing it as a
 * zero-height bar would assert something the data never said.
 */
export function seriesOf(spec: RenderSpec): {
  categories: string[];
  series: SeriesData[];
} {
  const { encoding, rows } = spec;
  // The category axis is the x channel, the series split is colour, and the
  // value axis is y. A cartesian chart reads exactly those three.
  const category = memberOn(encoding, 'x');
  const splitBy = memberOn(encoding, 'color');
  const measures = membersOn(encoding, 'y');

  const categories = category === undefined ? [''] : distinctValues(rows, category);

  const valueAt = (member: string, match: (row: Record<string, unknown>) => boolean) => {
    const row = rows.find(match);
    if (row === undefined) return null;
    const raw = row[member];
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const inCategory = (name: string) => (row: Record<string, unknown>) =>
    category === undefined || String(row[category] ?? '') === name;

  // Split by a dimension: one series per member of it, all drawing the same
  // measure.
  if (splitBy !== undefined) {
    const measure = measures[0];
    if (measure === undefined) return { categories, series: [] };

    return {
      categories,
      series: distinctValues(rows, splitBy).map((member) => ({
        name: member,
        values: categories.map((name) =>
          valueAt(measure, (row) => inCategory(name)(row) && String(row[splitBy] ?? '') === member),
        ),
      })),
    };
  }

  // Otherwise one series per measure.
  return {
    categories,
    series: measures.map((measure) => ({
      name: measure,
      values: categories.map((name) => valueAt(measure, inCategory(name))),
    })),
  };
}
