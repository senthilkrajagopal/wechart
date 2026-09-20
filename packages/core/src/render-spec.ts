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
  | 'combo';

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
  readonly formats?: Readonly<Record<string, string>>;
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
