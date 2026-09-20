/**
 * The renderer's drawing constants, and the loose option type the series
 * modules build.
 *
 * Colours are *defaults*, not the source of truth: a chart is normally handed
 * its palette so a member can keep one colour across a dashboard (AC-039), and
 * so @wechart/charts never has to import the theme. These values exist so a
 * chart drawn with no palette still looks like wechart rather than like
 * ECharts' own defaults.
 */

/**
 * An ECharts option. Deliberately structural rather than ECharts' own
 * `EChartsOption`: the series modules build plain data, the renderer hands it
 * to `setOption`, and typing every option ECharts accepts here would tie the
 * chart spec's shape to one renderer's type definitions.
 */
export type EChartsOption = Record<string, unknown>;

/** direction.md §6, "Marks". */
export const MARK = {
  /** Surface-coloured gap between touching marks, in pixels. */
  gapPx: 2,
  /** Radius of the data-end of a bar, in pixels. */
  cornerRadiusPx: 4,
  /** Minimum marker diameter, in pixels. */
  markerPx: 8,
  /** Line thickness, in pixels. */
  linePx: 2,
} as const;

/**
 * direction.md §5, the light categorical ramp, in its fixed order. Eight
 * slots, which is also the recommender's hard cap on colour series — past
 * eight the chart facets or folds the tail into "Other" rather than inventing
 * a ninth hue.
 */
export const DEFAULT_PALETTE = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

/** direction.md §5, `bg-surface` in the light theme. */
export const DEFAULT_SURFACE = '#ffffff';
