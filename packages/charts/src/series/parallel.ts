/**
 * Parallel coordinates (T982, AC-598; design 23 sheet 7; direction.md rule
 * 159 and §7i): one 1.5 px line per member of Line by across an axis per
 * measure, in Metrics' order, coloured by an optional dimension; each axis
 * from its own minimum to its maximum (or, on a Shared scale, all of them
 * from the measures' least to their greatest), titled above with its measure
 * and its maximum and labelled below with its minimum. Past 50 lines they are
 * drawn at 0.6 so crossings read; past 1,000 members only the first 1,000 by
 * the first measure are drawn, the cap the marking has (23-Q5 (a)), and the
 * tile says so (`ParallelNotes`). With fewer than 3 measures nothing is drawn
 * (AC-597): the tile says what the chart needs instead.
 *
 * ECharts' own `parallel` series on a `parallel` coordinate system, one
 * `parallelAxis` per measure (research/echarts-parallel.md).
 */
import {
  formatterFor,
  memberOn,
  membersOn,
  MIN_PARALLEL_AXES,
  parallelOf,
  type ParallelScale,
  type RenderSpec,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { format } from 'echarts/core';

import { colourFor } from '../colours';
import { labelOf, nameWriter, titleOf } from '../modelWriter';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';
import { DEFAULT_CANVAS, type Canvas } from './bar';

export function isParallelType(chartType: string): boolean {
  return chartType === 'parallel';
}

/** The most lines drawn: the marking's cap, so a brush can mark all that's drawn (23-Q5 (a)). */
export const PARALLEL_LINE_CAP = 1000;

/** Past this many lines, each is drawn at `FADED_OPACITY` so crossings read (rule 159). */
export const FADED_PAST = 50;
export const FADED_OPACITY = 0.6;

/** A line's width, in pixels (direction.md §7i). */
export const PARALLEL_LINE_PX = 1.5;

type Row = Readonly<Record<string, unknown>>;

export interface ParallelLines {
  readonly lineBy: string | undefined;
  readonly colour: string | undefined;
  /** One axis per measure, in order. */
  readonly axes: readonly string[];
  readonly scale: ParallelScale;
  /** The rows drawn, one line each: none with fewer than 3 axes or no Line by. */
  readonly rows: readonly Row[];
  /** How many members of Line by the rows hold. */
  readonly members: number;
  /** How many members are drawn: all of them, up to the cap. */
  readonly drawn: number;
}

const numberOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * What parallel coordinates draw from a spec: its rows, the first 1,000
 * members' by the first measure, largest first, where there are more. The
 * series and the tile's notes both read this, so they can't disagree.
 */
export function parallelLinesOf(spec: RenderSpec): ParallelLines {
  const lineBy = memberOn(spec.encoding, 'x');
  const colour = memberOn(spec.encoding, 'color');
  const axes = membersOn(spec.encoding, 'y');
  const { scale } = parallelOf(
    {
      wells: { measures: axes, dimensions: [lineBy, colour].filter((one) => one !== undefined) },
      options: spec.options,
    },
    axes.map((member) => spec.formats?.[member]),
  );
  const members = new Set(
    lineBy === undefined ? [] : spec.rows.map((row) => String(row[lineBy] ?? '')),
  ).size;
  if (lineBy === undefined || axes.length < MIN_PARALLEL_AXES) {
    return { lineBy, colour, axes, scale, rows: [], members, drawn: 0 };
  }
  // Each row is a line: one per member, or one per member and Colour where
  // Colour splits a member.
  if (spec.rows.length <= PARALLEL_LINE_CAP) {
    return { lineBy, colour, axes, scale, rows: spec.rows, members, drawn: members };
  }

  // The members with the largest first measure, each with all its lines,
  // while they come to at most 1,000 lines (the first 1,000 members where
  // each is one line).
  const [first] = axes;
  const memberOf = (row: Row) => String(row[lineBy] ?? '');
  const linesOf = new Map<string, number>();
  for (const row of spec.rows) linesOf.set(memberOf(row), (linesOf.get(memberOf(row)) ?? 0) + 1);
  const ranked = [...spec.rows].sort(
    (a, b) =>
      (numberOf(b[first ?? '']) ?? Number.NEGATIVE_INFINITY) -
      (numberOf(a[first ?? '']) ?? Number.NEGATIVE_INFINITY),
  );
  const kept = new Set<string>();
  let lines = 0;
  for (const row of ranked) {
    const member = memberOf(row);
    if (kept.has(member)) continue;
    const more = linesOf.get(member) ?? 1;
    if (lines + more > PARALLEL_LINE_CAP) break;
    kept.add(member);
    lines += more;
  }
  const rows = spec.rows.filter((row) => kept.has(memberOf(row)));
  return { lineBy, colour, axes, scale, rows, members, drawn: kept.size };
}

/** The least and greatest of these values; one value is widened so its axis has a length. */
function extentOf(values: readonly (number | null)[]): [number, number] {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return [0, 1];
  const min = Math.min(...present);
  const max = Math.max(...present);
  return min === max ? [min - 1, max + 1] : [min, max];
}

/** The axes' titles and ends: ECharts' 12 px, in the chart's face. */
const TITLE_FONT = `12px ${CHART_FONT}`;
/** The least room between two neighbouring axes' titles. */
const TITLE_GAP_PX = 8;
/** The room kept between the outer axes' widest text and the tile's edge. */
const EDGE_PX = 4;

/** The plot's room above for the axes' two-line titles, and below for their minimums. */
const PLOT_TOP_PX = 56;
const PLOT_BOTTOM_PX = 32;

/**
 * The most lines named at their right ends (the user, 2026-10-18, "Label
 * line ends (Recommended)"; AC-598): past it, the tooltip and the table view
 * name them.
 */
export const MOST_NAMED_LINES = 10;
/** A name's gap from the last axis, as a line's end label has (`directLabels`' 8). */
const NAME_GAP_PX = 8;
/** The widest a name may be before it is cut short with "…", as a direct label's (120). */
const MOST_NAME_PX = 120;
/** The least distance between two names' centres: a 12 px name and a 2 px gap. */
const NAME_LINE_PX = 14;
/**
 * In the legend's ink, as direct labels are; in-chart text, so in the light
 * theme's ink in the dark one too, as the box plot's notes and the map's are
 * (a known limit, laneCHB handoff).
 */
const NAME_INK = COLORS.light['text-secondary'];

const widthOf = (text: string): number => format.getTextRect(text, TITLE_FONT).width;

/**
 * Heights moved apart so no two are nearer than `gap`, each as near its own
 * as that allows, within `[top, bottom]`: pushed down in order of height,
 * then, where the last is past the bottom, back up. In the given order.
 */
function apartFrom(heights: readonly number[], gap: number, top: number, bottom: number): number[] {
  const order = heights.map((y, at) => ({ y, at })).sort((a, b) => a.y - b.y || a.at - b.at);
  const placed = order.map((one) => Math.min(Math.max(one.y, top), bottom));
  for (let at = 1; at < placed.length; at += 1)
    placed[at] = Math.max(placed[at]!, placed[at - 1]! + gap);
  const lastAt = placed.length - 1;
  if (lastAt >= 0 && placed[lastAt]! > bottom) {
    placed[lastAt] = bottom;
    for (let at = lastAt - 1; at >= 0; at -= 1)
      placed[at] = Math.min(placed[at]!, placed[at + 1]! - gap);
  }
  const result = new Array<number>(heights.length);
  order.forEach((one, at) => (result[one.at] = placed[at]!));
  return result;
}

/** A title cut short with "…" to fit its room; as it is where it fits. */
function fitted(text: string, room: number): string {
  if (widthOf(text) <= room) return text;
  for (let length = text.length - 1; length > 0; length -= 1) {
    const cut = `${text.slice(0, length).trimEnd()}…`;
    if (widthOf(cut) <= room) return cut;
  }
  return '…';
}

export function parallelOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isParallelType(spec.chartType))
    throw new Error(`${spec.chartType} is not parallel coordinates`);
  const { lineBy, colour, axes, scale, rows } = parallelLinesOf(spec);

  const valuesOf = (member: string) => rows.map((row) => numberOf(row[member]));
  const shared = extentOf(axes.flatMap(valuesOf));
  // By the lines drawn, a row each (T982's review).
  const opacity = rows.length > FADED_PAST ? FADED_OPACITY : 1;

  // Each axis's title is centred over it (the coordinator's fix: "ales lines
  // Revenue", cut at the tile's edge). The outer two are cut short to a slot
  // of the canvas shared equally by the axes, and set in from the edges by
  // half their widest text, so nothing is drawn past the tile; the axes
  // between are then at least a slot apart, and each inner title is cut
  // short to the room between its axis and its neighbours'. Short titles
  // where the chart is one cube's (AC-220).
  const last = axes.length - 1;
  const slot = Math.max(canvas.width / Math.max(axes.length, 1) - TITLE_GAP_PX, 0);
  const ends = axes.map((member) => {
    const [min, max] = scale === 'shared' ? shared : extentOf(valuesOf(member));
    return { min, max, write: formatterFor(member, spec.formats ?? {}) };
  });
  const sideOf = (at: number) => {
    const { min, max, write } = ends[at]!;
    const title = fitted(labelOf(spec, axes[at]!), slot);
    return Math.ceil(
      Math.max(widthOf(title), widthOf(write(max)), widthOf(write(min))) / 2 + EDGE_PX,
    );
  };
  const name = lineBy === undefined ? undefined : nameWriter(spec, lineBy);
  // The user, 2026-10-18 ("Label line ends"; AC-598): 10 or fewer lines are
  // each named at the right, beside the last axis; their room is kept there.
  const labelled = rows.length > 0 && rows.length <= MOST_NAMED_LINES && name !== undefined;
  const labels = labelled
    ? rows.map((row) => fitted(name(row[lineBy ?? '']), Math.min(MOST_NAME_PX, slot)))
    : [];
  const nameRoom =
    labels.length === 0 ? 0 : NAME_GAP_PX + Math.max(...labels.map(widthOf)) + EDGE_PX;
  const left = last < 0 ? 0 : sideOf(0);
  const right = last < 0 ? 0 : Math.max(sideOf(last), Math.ceil(nameRoom));
  const apart = last > 0 ? (canvas.width - left - right) / last : canvas.width;
  // ECharts cuts an axis's name to the step between axes itself, with
  // "..." (`layoutAxisWithoutExpand`'s `axisNameAvailableWidth`,
  // research/echarts-parallel.md), so no title is let past it; the outer
  // ones no wider than they were when their sides were set, either.
  const between = Math.max(apart - TITLE_GAP_PX, 0);
  const titleOfAxis = (at: number) =>
    fitted(labelOf(spec, axes[at]!), at === 0 || at === last ? Math.min(slot, between) : between);

  const parallelAxis = axes.map((_member, dim) => {
    const { min, max, write } = ends[dim]!;
    const title = titleOfAxis(dim);
    return {
      dim,
      type: 'value',
      // Its measure above, and under that its maximum (rule 159).
      name: `${title}\n${write(max)}`,
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { fontSize: 12, lineHeight: 16, align: 'center' },
      min,
      max,
      // Ticks at the two ends alone: the axis is read by its ends, not a grid.
      interval: max - min,
      axisTick: { show: false },
      axisLine: { lineStyle: { width: 1 } },
      // Its minimum, under the axis's lower end; no other tick is labelled.
      axisLabel: {
        formatter: (value: number) => (value === min ? write(min) : ''),
        align: 'center',
        verticalAlign: 'top',
        margin: 0,
        fontSize: 12,
        showMaxLabel: false,
      },
    };
  });

  const lineOf = (row: Row) => ({
    name: name === undefined ? '' : name(row[lineBy ?? '']),
    value: axes.map((member) => numberOf(row[member])),
  });
  const lineStyle = (colourOf: string) => ({
    width: PARALLEL_LINE_PX,
    opacity,
    color: colourOf,
  });

  // A series per Colour member, so the legend names them; one otherwise.
  const groups = new Map<string, Row[]>();
  if (colour !== undefined) {
    for (const row of rows) {
      const key = String(row[colour] ?? '');
      let list = groups.get(key);
      if (list === undefined) groups.set(key, (list = []));
      list.push(row);
    }
  }
  const series =
    colour === undefined
      ? [
          {
            type: 'parallel' as const,
            name: lineBy === undefined ? '' : titleOf(spec, lineBy),
            lineStyle: lineStyle(colourFor(spec, axes[0] ?? '', 0)),
            data: rows.map(lineOf),
          },
        ]
      : [...groups].map(([member, list], index) => ({
          type: 'parallel' as const,
          name: nameWriter(spec, colour)(member),
          lineStyle: lineStyle(colourFor(spec, member, index)),
          data: list.map(lineOf),
        }));

  // Each name beside the last axis that holds its line's value, at that
  // value's height, moved apart where two would meet and kept in the tile.
  const plotHeight = Math.max(canvas.height - PLOT_TOP_PX - PLOT_BOTTOM_PX, 0);
  const named = labels.flatMap((text, at) => {
    const values = axes.map((member) => numberOf(rows[at]?.[member]));
    let end = values.length - 1;
    while (end >= 0 && values[end] === null) end -= 1;
    if (end < 0) return [];
    const { min, max } = ends[end]!;
    const value = values[end]!;
    const y = PLOT_TOP_PX + ((max - value) / (max - min || 1)) * plotHeight;
    return [{ text, x: left + end * apart + NAME_GAP_PX, y }];
  });
  const ys = apartFrom(
    named.map((one) => one.y),
    NAME_LINE_PX,
    NAME_LINE_PX / 2,
    canvas.height - NAME_LINE_PX / 2,
  );
  const graphic = named.map((one, at) => ({
    type: 'text' as const,
    x: one.x,
    y: ys[at] ?? one.y,
    silent: true,
    style: {
      text: one.text,
      fill: NAME_INK,
      fontSize: 12,
      fontFamily: CHART_FONT,
      align: 'left' as const,
      verticalAlign: 'middle' as const,
    },
  }));

  return {
    animation: false,
    // Room above for each axis's two-line title, below for its minimum, and
    // at each side for half the outer axes' widest text, or at the right for
    // the lines' names.
    parallel: { left, right, top: PLOT_TOP_PX, bottom: PLOT_BOTTOM_PX },
    ...(graphic.length === 0 ? {} : { graphic }),
    parallelAxis,
    series,
  };
}
