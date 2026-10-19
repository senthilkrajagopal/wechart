import { CATEGORICAL } from '@wechart/ui';

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
 * A combo's layers (direction.md §7h, "Draw order": bands, areas, bars,
 * lines, points, reference lines, labels), as each series' `z`: ECharts
 * paints a higher `z` over a lower, and its defaults put bars and points
 * level and an area over bars (research/echarts-combo-layers.md). Each line's
 * halo lies under every line and over every bar.
 */
export const COMBO_Z = { area: 1, bar: 2, halo: 3, line: 4, point: 5 } as const;

/** direction.md §7h, a combo's marks: the area's fill, a line's halo, a point's ring. */
export const COMBO_MARK = {
  /** An area's fill opacity: bars behind it stay readable. */
  areaOpacity: 0.24,
  /** The width of the `bg-surface` stroke under a line. */
  haloPx: 5,
  /** The `bg-surface` ring round a point. */
  pointRingPx: 1.5,
} as const;

/**
 * direction.md §5, the light categorical ramp, in its fixed order: sixteen
 * slots from 2026-10-19 (COLOUR-1), past which a member is drawn in the
 * neutral. The recommender's cap on colour series stays 8 (AC-031).
 *
 * Re-exported from `@wechart/ui` rather than written out again. AC-099 audits
 * this ramp against the marking tokens, which live there, and a second copy of
 * the hex values is that many chances to disagree with the thing being audited.
 */
export const DEFAULT_PALETTE = CATEGORICAL.light;

/**
 * direction.md §5's sequential ramp: "a single blue hue, running 100→700".
 *
 * The two published values are the ends. direction.md names no intermediate
 * steps, so the shades between are interpolated by whatever consumes this — a
 * derivation, recorded as one, in the same way the unmarked-fade opacity is
 * recorded there as derived rather than published.
 */
export const SEQUENTIAL = ['#cde2fb', '#0d366b'] as const;

/** direction.md §5, `bg-surface` in the light theme. */
export const DEFAULT_SURFACE = '#ffffff';
