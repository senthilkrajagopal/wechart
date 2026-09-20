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

/** Which member plays which role in a drawn chart. */
export interface Encoding {
  /** The member along the category axis. */
  readonly category?: string;
  /**
   * The member that splits the marks into one series each. Alternative to
   * several `values`: both produce multiple series, and a chart uses one or
   * the other, never both.
   */
  readonly series?: string;
  /** The measures drawn against the value axis. */
  readonly values: readonly string[];
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
  /** The colour the chart is drawn on, used for the gap between marks. */
  readonly surface?: string;
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
  const categories =
    encoding.category === undefined ? [''] : distinctValues(rows, encoding.category);

  const valueAt = (member: string, match: (row: Record<string, unknown>) => boolean) => {
    const row = rows.find(match);
    if (row === undefined) return null;
    const raw = row[member];
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const inCategory = (category: string) => (row: Record<string, unknown>) =>
    encoding.category === undefined || String(row[encoding.category] ?? '') === category;

  // Split by a dimension: one series per member of it, all drawing the same
  // measure.
  if (encoding.series !== undefined) {
    const measure = encoding.values[0];
    if (measure === undefined) return { categories, series: [] };

    return {
      categories,
      series: distinctValues(rows, encoding.series).map((member) => ({
        name: member,
        values: categories.map((category) =>
          valueAt(
            measure,
            (row) =>
              inCategory(category)(row) && String(row[encoding.series as string] ?? '') === member,
          ),
        ),
      })),
    };
  }

  // Otherwise one series per measure.
  return {
    categories,
    series: encoding.values.map((measure) => ({
      name: measure,
      values: categories.map((category) => valueAt(measure, inCategory(category))),
    })),
  };
}
