/**
 * The Customize tab's settings (AC-219), applied to a drawn option.
 *
 * Stored in the chart's `options` beside its axes, and applied here once for
 * every renderer — as the axis settings are (`axis.ts`) — so no chart type is
 * quietly exempt from a setting the tab offers:
 *
 * - `legend`: `{ show?, position? }`. Shown by the series count's rule
 *   (AC-038) unless turned off; at the top unless placed elsewhere.
 * - `series`: `{ [name]: { colour?, hidden? } }`. A colour is read by
 *   `colourFor`; a hidden series is left undrawn.
 * - `stacked`: the series of a bar or line chart stacked on one another.
 * - `dataLabels`: each mark's value written on it.
 */
import { formatterFor, membersOn, type RenderSpec } from '@wechart/core';

import { PROTOTYPE_GRID } from './layout/grid';
import type { EChartsOption } from './theme';

export type LegendPosition = 'top' | 'right' | 'bottom' | 'left';

export interface LegendSettings {
  readonly show?: boolean;
  readonly position?: LegendPosition;
}

export interface SeriesSettings {
  readonly colour?: string;
  readonly hidden?: boolean;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function legendSettingsOf(spec: RenderSpec): LegendSettings {
  return record(spec.options?.['legend']) as LegendSettings;
}

export function seriesSettingsOf(spec: RenderSpec): Readonly<Record<string, SeriesSettings>> {
  return record(spec.options?.['series']) as Record<string, SeriesSettings>;
}

/** The series' names in the order set in Customize (T392, AC-300): none set, none. */
export function seriesOrderOf(spec: RenderSpec): readonly string[] {
  const order = spec.options?.['seriesOrder'];
  return Array.isArray(order)
    ? order.filter((name): name is string => typeof name === 'string')
    : [];
}

/**
 * Series in the order set (T392, AC-300): those it names first, as it names
 * them, then the rest in the order they came. ECharts draws, stacks (from the
 * baseline up) and lists its legend in the series' own order, so this one
 * order is all three; and it is the chart's, saved with it, so rows that come
 * back in another order on a refresh don't move it.
 */
export function inSeriesOrder<T extends { name?: unknown }>(
  series: readonly T[],
  order: readonly string[],
): T[] {
  const rank = (one: T) => {
    const at = typeof one.name === 'string' ? order.indexOf(one.name) : -1;
    return at === -1 ? order.length : at;
  };
  return series
    .map((one, at) => ({ one, at }))
    .sort((a, b) => rank(a.one) - rank(b.one) || a.at - b.at)
    .map(({ one }) => one);
}

/** A side legend's room, as the plot leaves it. */
const SIDE_ROOM_PX = 120;

/**
 * A pie's side legend's names, kept within its room (T309): the room less the
 * legend's 5 px padding each side, its 25 px icon and the 5 px before the
 * name (research/echarts.md, "A pie's layout box, and a legend's text
 * width"). A longer name ends in "…" rather than running over the ring,
 * which the legend is the only key to. A chart on axes keeps its names
 * whole, as before.
 */
const PIE_SIDE_NAMES = {
  textStyle: { width: SIDE_ROOM_PX - 2 * 5 - 25 - 5, overflow: 'truncate' },
};

/** Where a legend goes, and the room the plot leaves it. */
const PLACED: Record<LegendPosition, { legend: object; grid: object }> = {
  top: { legend: { top: 0 }, grid: { top: 32 } },
  right: {
    legend: { right: 0, top: 'middle', orient: 'vertical' },
    grid: { right: SIDE_ROOM_PX },
  },
  bottom: { legend: { bottom: 0 }, grid: { bottom: 56 } },
  left: {
    legend: { left: 0, top: 'middle', orient: 'vertical' },
    grid: { left: SIDE_ROOM_PX },
  },
};

/**
 * The edges a chart on axes is laid out within: the prototype's, with room
 * for its legend where one is drawn and where Customize puts it — the same
 * rule `applyCustomize` and `legendFor` apply (AC-038: a legend for two
 * series or more). What a bar's width is estimated against (T254's review).
 */
export function plotEdgesOf(
  spec: RenderSpec,
  seriesNames: readonly string[],
): { top: number; right: number; bottom: number; left: number } {
  const { top, right, bottom, left } = PROTOTYPE_GRID;
  const edges = { top, right, bottom, left };
  const settings = legendSettingsOf(spec);
  const hidden = seriesSettingsOf(spec);
  const drawn = seriesNames.filter((name) => hidden[name]?.hidden !== true).length;
  if (drawn < 2 || settings.show === false) return edges;
  return { ...edges, ...(PLACED[settings.position ?? 'top'].grid as Partial<typeof edges>) };
}

type Series = Record<string, unknown> & { name?: unknown; type?: unknown };

/** An object less one key. */
function without(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([each]) => each !== key));
}

/** Types whose series are what their legend names (not a pie's slices). */
const SERIES_COLOURED = ['bar', 'line', 'scatter'];

export function applyCustomize(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const legend = legendSettingsOf(spec);
  const perSeries = seriesSettingsOf(spec);
  const stacked = spec.options?.['stacked'] === true;
  const labelled = spec.options?.['dataLabels'] === true;
  let next: Record<string, unknown> = { ...option };

  // A hidden series is not drawn at all; with one left, its legend goes too,
  // as a single series has none (AC-038).
  const drawnSeries = Array.isArray(next['series'])
    ? (next['series'] as Series[]).filter(
        (one) => typeof one.name !== 'string' || perSeries[one.name]?.hidden !== true,
      )
    : undefined;
  const lonely =
    drawnSeries !== undefined &&
    drawnSeries.length < 2 &&
    drawnSeries.every((one) => SERIES_COLOURED.includes(String(one.type)));

  // The legend: off, or placed. Only where the chart has one (AC-038). The
  // plot's top goes back to the prototype's 12 px, not ECharts' default 65,
  // when the legend leaves the top (T254's review).
  if (next['legend'] !== undefined) {
    const grid = record(next['grid']);
    if (legend.show === false || lonely) {
      next = { ...without(next, 'legend'), grid: { ...grid, top: PROTOTYPE_GRID.top } };
    } else if (legend.position !== undefined && legend.position !== 'top') {
      next = {
        ...next,
        legend: { ...without(record(next['legend']), 'top'), ...PLACED[legend.position].legend },
        grid: { ...grid, top: PROTOTYPE_GRID.top, ...PLACED[legend.position].grid },
      };
    }
  }
  /**
   * A pie is laid out in a box of its own, not in the grid, so the room left
   * for a legend at its side has to be left in its box too, or the legend is
   * drawn over its ring (T309, AC-210; research/echarts.md, "A pie's layout
   * box").
   */
  const pieRoom =
    next['legend'] !== undefined && legend.position !== undefined && legend.position !== 'top'
      ? PLACED[legend.position].grid
      : undefined;
  if (
    pieRoom !== undefined &&
    (legend.position === 'right' || legend.position === 'left') &&
    drawnSeries?.some((one) => one.type === 'pie') === true
  )
    next = { ...next, legend: { ...record(next['legend']), ...PIE_SIDE_NAMES } };

  if (drawnSeries !== undefined) {
    // The cross-filter share drawn over a bar (AC-117) is not a series of the
    // chart's: it is neither stacked nor labelled.
    const isOverlay = (one: Series) => one['barGap'] === '-100%';
    const own = drawnSeries.filter((one) => !isOverlay(one));
    // The chart's own series in the order set, each overlay left where it was.
    const ordered = inSeriesOrder(own, seriesOrderOf(spec));
    let slot = 0;
    const placed = drawnSeries.map((one) => (isOverlay(one) ? one : ordered[slot++]!));
    // Stacked only where the tab offers it, and where there is more than one
    // series to stack (T231's review).
    const stacking = stacked && STACKABLE_TYPES.includes(spec.chartType) && own.length > 1;
    const inside = stacking || spec.chartType === 'stackedBar' || spec.chartType === 'stackedArea';
    next = {
      ...next,
      series: placed.map((one) =>
        isOverlay(one)
          ? one
          : {
              ...one,
              ...(stacking && (one.type === 'bar' || one.type === 'line')
                ? { stack: 'total' }
                : {}),
              ...(pieRoom !== undefined && one.type === 'pie' ? pieRoom : {}),
              ...(labelled
                ? { label: { ...record(one['label']), ...labelFor(spec, one, inside) } }
                : {}),
            },
      ),
    };
  }

  return next as EChartsOption;
}

/**
 * The types whose series the Customize tab offers to stack (AC-219): bars and
 * lines drawn side by side or over one another, a horizontal bar's included —
 * with two measures, or split by colour, it has two series side by side too
 * (T302). Not the stacked types, which already are; not a combo, whose one
 * bar series has nothing to stack on.
 */
export const STACKABLE_TYPES: readonly string[] = [
  'bar',
  'hbar',
  'groupedBar',
  'line',
  'multiLine',
  'area',
];

/**
 * A mark's value written on it (AC-219), in its measure's format (AC-046) —
 * or the Values section's number format, where one is chosen — placed where
 * a value reads for the mark: past a horizontal bar's end, above a column,
 * inside a stacked segment, a rectangle's cell or a slice's label.
 */
function labelFor(spec: RenderSpec, one: Series, inside: boolean): Record<string, unknown> {
  // A heatmap's measure is its colour; its y is a grouping (T242's review).
  const measures = membersOn(spec.encoding, spec.chartType === 'heatmap' ? 'color' : 'y');
  const name = typeof one.name === 'string' ? one.name : '';
  const measure = measures.includes(name) ? name : (measures[0] ?? '');
  const chosen = spec.options?.['valueFormat'];
  const write =
    (typeof chosen === 'string' ? VALUE_FORMATTERS[chosen] : undefined) ??
    formatterFor(measure, spec.formats ?? {});
  const valueOf = (value: unknown) => (Array.isArray(value) ? value[value.length - 1] : value);
  const position =
    one.type === 'pie' || one.type === 'treemap' || one.type === 'heatmap'
      ? {}
      : inside
        ? { position: 'inside' }
        : { position: spec.chartType === 'hbar' ? 'right' : 'top' };
  return {
    show: true,
    ...position,
    formatter: (params: { value?: unknown }) => write(valueOf(params.value)),
  };
}

/** A value's number format chosen in the Values section (AC-219). */
const VALUE_FORMATTERS: Record<string, (value: unknown) => string> = {
  compact: (value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(value)),
  full: (value) => new Intl.NumberFormat('en-US').format(Number(value)),
  percent: (value) => new Intl.NumberFormat('en-US', { style: 'percent' }).format(Number(value)),
  currency: (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)),
};
