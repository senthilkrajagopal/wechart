/**
 * Direct labels (T681's follow-up; R76 dashboard-Q1; design 04 pins 5–6;
 * direction.md §6 and rule 5): a line, area or bar chart of 2 to 4 series
 * names each series where it ends, so identity never rests on colour alone
 * now that a tile's Table view lives in ⋯. One series has no legend and needs
 * no name (AC-038); past 4, the legend alone names them.
 *
 * As research/echarts-end-labels.md finds ECharts 6.1.0, with the
 * coordinator's calls on its open points (2026-10-08):
 * - a line or area by `series-line.endLabel`, at its last non-null point
 *   (§1); a stacked area's on its band's top edge, as ECharts places it;
 * - a bar by a label on its last non-null item, placed by the doc's §3A
 *   table; ECharts has no `endLabel` for bars (§3);
 * - overlap by `labelLayout: { moveOverlap, hideOverlap }` per series (§4):
 *   a label hidden is acceptable, since the legend stays for 2 or more;
 * - text in an ink token with `valueAnimation: false`, room reserved in
 *   `grid.right`, the names measured with `getTextRect` and capped with a
 *   width and truncation (§5);
 * - never on a trellis, whose panels' labels `shiftY` would push into each
 *   other (it is chart-wide): `optionFor` draws a trellis without this.
 */
import { format } from 'echarts/core';
import { COLORS } from '@wechart/ui';
import type { RenderSpec } from '@wechart/core';

import { seriesSettingsOf } from '../customize';
import { seriesNameWriter } from '../legend';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';

/** The most series a chart names directly (direction.md §6, rule 5). */
export const MOST_DIRECTLY_LABELLED = 4;

const LINE_FAMILY = ['line', 'multiLine', 'area', 'stackedArea'];
const BAR_FAMILY = ['bar', 'hbar', 'groupedBar', 'stackedBar'];

/** `endLabel.distance`'s source default (§1), and a bar label's (§3A). */
const LINE_DISTANCE = 8;
const BAR_DISTANCE = 5;
/** The gap kept between two labels as they are moved apart (§4, `minMargin`). */
const MIN_MARGIN = 2;
/**
 * The widest a direct label may be before it is cut short with "…": the
 * name's room, so a long one never takes the plot's. Not a design figure:
 * wechart's choice, a third of the 360 px a half-width tile draws in.
 */
const MOST_LABEL_PX = 120;

/** In the legend's ink (themed swaps it for the dark theme's). */
const INK = COLORS.light['text-secondary'];

type Placement =
  | { readonly kind: 'end' }
  | {
      readonly kind: 'bar';
      readonly position: 'right' | 'outside' | 'top';
      readonly move: 'shiftX' | 'shiftY';
      readonly sideRoom: boolean;
    };

/** Where a family's direct labels go, by the doc's §1 and §3A. */
function placementOf(spec: RenderSpec): Placement | undefined {
  if (LINE_FAMILY.includes(spec.chartType)) return { kind: 'end' };
  if (!BAR_FAMILY.includes(spec.chartType)) return undefined;
  const stacked = spec.chartType === 'stackedBar' || spec.options?.['stacked'] === true;
  if (spec.chartType === 'hbar')
    return stacked
      ? { kind: 'bar', position: 'top', move: 'shiftX', sideRoom: false }
      : { kind: 'bar', position: 'outside', move: 'shiftY', sideRoom: true };
  return stacked
    ? { kind: 'bar', position: 'right', move: 'shiftY', sideRoom: true }
    : { kind: 'bar', position: 'outside', move: 'shiftX', sideRoom: false };
}

/** The series a chart draws, Customize's hidden ones left out. */
const drawnNames = (spec: RenderSpec, names: readonly string[]) => {
  const hidden = seriesSettingsOf(spec);
  return names.filter((name) => hidden[name]?.hidden !== true);
};

/** The placement, where this chart's series are named directly. */
function directly(spec: RenderSpec, names: readonly string[]): Placement | undefined {
  const placement = placementOf(spec);
  if (placement === undefined) return undefined;
  const count = drawnNames(spec, names).length;
  if (count < 2 || count > MOST_DIRECTLY_LABELLED) return undefined;
  // A chart Customize labels with its values keeps those, and its legend:
  // a series' value labels would join its name's overlap layout, which moves
  // labels chart-wide whatever their x (research §4; T681 follow-up's review).
  if (spec.options?.['dataLabels'] === true) return undefined;
  return placement;
}

type Series = Record<string, unknown> & { name?: unknown; data?: unknown[] };

/** The cross-filter share drawn over a bar (AC-117): no series of the chart's, as Customize has it. */
const isOverlay = (one: Series) => one['barGap'] === '-100%';

/**
 * The names of the series a drawn chart is made of: each once, as a marked
 * share's parts are drawn as series of their own under their series' name
 * (marking/partialOption.ts), and never a cross-filter share's.
 */
export function seriesNamesOf(option: EChartsOption): string[] {
  const series = (option['series'] as Series[] | undefined) ?? [];
  return [
    ...new Set(series.filter((one) => !isOverlay(one)).map((one) => String(one.name ?? ''))),
  ];
}

/**
 * The room a grouped vertical bar's name takes over the plot: its distance
 * and a 12 px line of text, so the tallest bar's is never cut off at the top.
 */
export const DIRECT_LABEL_TOP = 17;

/** The widest name, as ECharts measures a 12 px label in the chart's face, capped. */
function widestOf(spec: RenderSpec, names: readonly string[]): number {
  const write = seriesNameWriter(spec);
  const font = `12px ${CHART_FONT}`;
  const widths = drawnNames(spec, names).map(
    (name) => format.getTextRect(write === undefined ? name : write(name), font).width,
  );
  return Math.min(MOST_LABEL_PX, Math.ceil(Math.max(0, ...widths)));
}

/**
 * The room the direct labels take at the plot's right, beyond its own edge:
 * none where they sit inside it (grouped bars, a stacked hbar). What a bar's
 * width and a category label's room are reckoned against too, so they are
 * laid out on the plot as it is drawn (§5; research/echarts-bar-density.md).
 */
export function directLabelRoom(spec: RenderSpec, names: readonly string[]): number {
  const placement = directly(spec, names);
  if (placement === undefined) return 0;
  if (placement.kind === 'bar' && !placement.sideRoom) return 0;
  const distance = placement.kind === 'end' ? LINE_DISTANCE : BAR_DISTANCE;
  return distance + widestOf(spec, names) + MIN_MARGIN;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** An item's value: a bare value, or `{ value }`. */
const valueOf = (item: unknown) =>
  typeof item === 'object' && item !== null && 'value' in item
    ? (item as { value: unknown }).value
    : item;

/** The chart drawn with each series named at its end, where it has 2 to 4. */
export function withDirectLabels(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const series = (option['series'] as Series[] | undefined) ?? [];
  const names = seriesNamesOf(option);
  const placement = directly(spec, names);
  if (placement === undefined) return option;

  const write = seriesNameWriter(spec);
  const name = (params: { seriesName?: string }) =>
    write === undefined ? String(params.seriesName ?? '') : write(params.seriesName ?? '');
  // Cut short only past the cap: the room is measured as ECharts measures,
  // but in the face the chart is drawn in, which a server-drawn chart only
  // estimates (T681's follow-up).
  const text = {
    formatter: name,
    color: INK,
    minMargin: MIN_MARGIN,
    width: MOST_LABEL_PX,
    overflow: 'truncate',
  };
  const grid = record(option['grid']);
  const room = directLabelRoom(spec, names);
  const top =
    placement.kind === 'bar' && placement.position === 'outside' && placement.move === 'shiftX'
      ? DIRECT_LABEL_TOP
      : 0;

  /**
   * Which drawn series carries each name, and at which item. A line's is its
   * first series of that name: a marked share's line comes after its total
   * (`withMarkedShareLines`). A bar's is where its stack ends: the last
   * category any of its parts has a value in, on the last part drawn there,
   * so a partly marked bar is named over its rest, not its marked foot.
   */
  const hosts = new Map<number, number>();
  for (const name of names) {
    const own = series.flatMap((one, index) =>
      !isOverlay(one) && String(one.name ?? '') === name ? [index] : [],
    );
    if (placement.kind === 'end') {
      if (own[0] !== undefined) hosts.set(own[0], -1);
      continue;
    }
    const valued = (index: number, at: number) => valueOf(series[index]?.data?.[at]) != null;
    const length = Math.max(0, ...own.map((index) => series[index]?.data?.length ?? 0));
    for (let at = length - 1; at >= 0; at -= 1) {
      const host = [...own].reverse().find((index) => valued(index, at));
      if (host !== undefined) {
        hosts.set(host, at);
        break;
      }
    }
  }

  return {
    ...option,
    ...(room === 0 && top === 0
      ? {}
      : {
          grid: {
            ...grid,
            ...(room === 0 ? {} : { right: Number(grid['right'] ?? 0) + room }),
            ...(top === 0 ? {} : { top: Number(grid['top'] ?? 0) + top }),
          },
        }),
    series: series.map((one, index) => {
      const last = hosts.get(index);
      if (last === undefined) return one;
      if (placement.kind === 'end')
        return {
          ...one,
          endLabel: { show: true, ...text, distance: LINE_DISTANCE, valueAnimation: false },
          labelLayout: { moveOverlap: 'shiftY', hideOverlap: true },
        };
      const data = one.data ?? [];
      return {
        ...one,
        label: { ...record(one['label']), show: false, ...text, distance: BAR_DISTANCE },
        labelLayout: { moveOverlap: placement.move, hideOverlap: true },
        data: data.map((item, at) =>
          at !== last
            ? item
            : {
                ...(typeof item === 'object' && item !== null ? item : { value: item }),
                label: { show: true, position: placement.position },
              },
        ),
      };
    }),
  };
}
