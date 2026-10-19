/**
 * Box plot (T399, AC-306; research/box-plot.md; direction.md rule 88).
 *
 * Each category's box is computed from its rows by `boxStats` (type-7
 * quartiles), not by ECharts' own transform, which reads null as 0 and ends
 * Tukey whiskers at the fence rather than at the last value inside it. ECharts
 * draws what it's given: `[low, Q1, median, Q3, high]` per box, whatever the
 * two ends mean. The values beyond Tukey's whiskers are a scatter series.
 */
import {
  boxStats,
  drawnDistribution,
  formatterFor,
  memberOn,
  type BoxStats,
  type RenderSpec,
  type WhiskerRule,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { format } from 'echarts/core';

import { colourFor } from '../colours';
import { nameWriter } from '../modelWriter';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';
import { categoryAxisPx, DEFAULT_CANVAS, type Canvas } from './bar';
import { BOX_IN_VIOLIN_WIDTH, densityOf, violinSeries } from './violin';

export function isBoxplotType(chartType: string): boolean {
  return chartType === 'boxplot';
}

/** The chart option `whiskers`: Tukey's unless the user chose the minimum and maximum. */
export function whiskerRuleOf(spec: RenderSpec): WhiskerRule {
  return spec.options?.['whiskers'] === 'minmax' ? 'minmax' : 'tukey';
}

export interface Box {
  /** The category, as the rows carry it. */
  readonly name: string;
  readonly stats: BoxStats;
}

/**
 * One box per category that has values, in the order categories first appear.
 * The drawing and its tooltip both read these, so they can't disagree.
 */
export function boxesOf(spec: RenderSpec): Box[] {
  const category = memberOn(spec.encoding, 'x');
  const value = memberOn(spec.encoding, 'y');
  if (category === undefined || value === undefined) return [];

  // One pass over the rows, however many categories (up to 50,000 rows).
  const values = new Map<string, unknown[]>();
  for (const row of spec.rows) {
    const name = String(row[category] ?? '');
    let list = values.get(name);
    if (list === undefined) values.set(name, (list = []));
    list.push(row[value]);
  }
  const rule = whiskerRuleOf(spec);
  return [...values].flatMap(([name, list]) => {
    const stats = boxStats(list, rule);
    return stats === undefined ? [] : [{ name, stats }];
  });
}

/** A point's size and opacity, as outliers have always been drawn (rule 88; AC-592). */
export const POINT_PX = 8;
export const POINT_OPACITY = 0.6;

/** The space kept between two points' edges, so rounding never makes them touch. */
const POINT_GAP_PX = 0.5;
/** The prototype's grid (`layout/grid.ts`): kept around the plot and its labels. */
const GRID_PX = { top: 12, bottom: 8, left: 8, right: 28 } as const;
/** A note's line, in the chart's 12 px text. */
const NOTE_LINE_PX = 16;
const LABEL_FONT = `12px ${CHART_FONT}`;

/**
 * The one sentence the categories drawn as All in place of Beeswarm say
 * (AC-592): one is named, several are counted, so the note never takes the
 * plot's room (the coordinator's fix: a sentence per category filled a tile).
 */
export function fellBackNote(members: readonly string[]): string {
  const which = members.length === 1 ? members[0] : `${String(members.length)} categories`;
  return `Too many points to place side by side in ${which ?? ''}: drawn as All, jittered.`;
}

/** A note broken at its spaces into lines no wider than the canvas. */
function wrapped(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    const longer = last === undefined ? word : `${last} ${word}`;
    if (last !== undefined && format.getTextRect(longer, LABEL_FONT).width <= width)
      lines[lines.length - 1] = longer;
    else lines.push(word);
  }
  return lines;
}

/** A seeded generator (mulberry32): the same seed gives the same numbers, run after run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A category's seed: its name's FNV-1a hash, so it doesn't depend on the others. */
function seedOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < name.length; at += 1) {
    hash ^= name.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const round = (value: number) => Number(value.toPrecision(12));

/** The value axis's ends: the values' least and greatest, out to a whole step of about a fifth. */
export function niceExtent(values: readonly number[]): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((each) => each * magnitude).find((each) => each >= raw) ?? raw;
  return [round(Math.floor(min / step) * step), round(Math.ceil(max / step) * step)];
}

export interface PlacedPoint {
  /** Its category. */
  readonly name: string;
  readonly value: number;
  /** Sideways from its category's centre, in pixels. */
  readonly dx: number;
}

export interface PointsLayout {
  readonly points: readonly PlacedPoint[];
  /** The value axis's ends, which the placement measured by. */
  readonly extent: readonly [number, number];
  /** The categories a Beeswarm couldn't place side by side, drawn as All. */
  readonly fellBack: readonly string[];
  /** The note saying so, once, in lines that fit the canvas; none where none fell back. */
  readonly notes: readonly string[];
  /** The lines of note the plot was measured below: at least as many as `notes`. */
  readonly noteLines: number;
}

/** Each category's numeric values, in the rows' order, the categories as they first appear. */
function valuesByCategory(spec: RenderSpec): Map<string, number[]> {
  const category = memberOn(spec.encoding, 'x');
  const value = memberOn(spec.encoding, 'y');
  const values = new Map<string, number[]>();
  if (category === undefined || value === undefined) return values;
  for (const row of spec.rows) {
    const raw = row[value];
    const number = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
    if (!Number.isFinite(number)) continue;
    const name = String(row[category] ?? '');
    let list = values.get(name);
    if (list === undefined) values.set(name, (list = []));
    list.push(number);
  }
  return values;
}

/**
 * Beeswarm: each point, from the least value up, at the place nearest its
 * category's centre where it touches no point placed before it, measured in
 * pixels. Undefined where one would have to go further than `room`.
 */
function beeswarm(
  values: readonly number[],
  pxPerValue: number,
  room: number,
): number[] | undefined {
  const reach = POINT_PX + POINT_GAP_PX;
  const order = values
    .map((value, at) => ({ y: value * pxPerValue, at }))
    .sort((a, b) => a.y - b.y || a.at - b.at);
  const placed: { y: number; x: number }[] = [];
  const dx = new Array<number>(values.length).fill(0);
  for (const { y, at } of order) {
    const near: { x: number; half: number }[] = [];
    for (let back = placed.length - 1; back >= 0; back -= 1) {
      const other = placed[back]!;
      const dy = y - other.y;
      if (dy >= reach) break;
      near.push({ x: other.x, half: Math.sqrt(reach * reach - dy * dy) });
    }
    const candidates = [0, ...near.flatMap(({ x, half }) => [x - half, x + half])].sort(
      (a, b) => Math.abs(a) - Math.abs(b) || b - a,
    );
    const free = candidates.find((x) =>
      near.every((other) => Math.abs(x - other.x) >= other.half - 1e-9),
    );
    if (free === undefined || Math.abs(free) > room) return undefined;
    placed.push({ y, x: free });
    dx[at] = round(free);
  }
  return dx;
}

/**
 * Where a box plot's All or Beeswarm points go (T991, AC-592): sideways
 * from their category's centre by a pixel offset worked out here, not by
 * ECharts' jitter, which is unseeded and gives up on overlaps without a word
 * (research/echarts-scatter-jitter.md). All jitters each category's points
 * from a seed of its name; Beeswarm places them side by side, falling back to
 * All where they can't fit in the category's band.
 *
 * Measured against a plot no larger than the one ECharts lays out on this
 * canvas, on a value axis whose ends are set here, so points this places
 * 8.5 px apart are at least that far apart as drawn.
 */
export function pointsLayoutOf(
  spec: RenderSpec,
  points: 'all' | 'beeswarm',
  canvas: Canvas = DEFAULT_CANVAS,
): PointsLayout {
  const byCategory = valuesByCategory(spec);
  const all = [...byCategory.values()].flat();
  const extent = niceExtent(all.length === 0 ? [0] : all);
  const write = formatterFor(memberOn(spec.encoding, 'y') ?? '', spec.formats ?? {});
  const nameOf = nameWriter(spec, memberOn(spec.encoding, 'x'));
  const textWidth = (text: string) => format.getTextRect(text, LABEL_FONT).width;
  const valueLabels =
    Math.max(
      ...[extent[0], (extent[0] + extent[1]) / 2, extent[1]].map((at) => textWidth(write(at))),
    ) + 16;
  const plotWidth = canvas.width - GRID_PX.left - GRID_PX.right - valueLabels;
  const band = Math.max(0, plotWidth / Math.max(1, byCategory.size));
  const widestName = Math.max(0, ...[...byCategory.keys()].map(textWidth));
  // Level labels take a row; turned ones up to their length. Turned as
  // `fitCategoryLabels` turns them, by the span it measures, which keeps
  // 80 px for the value labels (T991's review).
  const span = categoryAxisPx(canvas, false) / Math.max(1, byCategory.size);
  const nameRoom = widestName * 1.3 < Math.min(band, span) ? 24 : widestName + 12;
  const room = band / 2 - POINT_PX / 2 - 1;
  const jitterWidth = Math.max(0, Math.min(band / 2, band - POINT_PX));

  const layout = (noteLines: number): PointsLayout => {
    const plotHeight =
      canvas.height - GRID_PX.top - GRID_PX.bottom - nameRoom - 8 - noteLines * NOTE_LINE_PX;
    const pxPerValue = Math.max(0, plotHeight) / (extent[1] - extent[0]);
    const fellBack: string[] = [];
    const placed = [...byCategory].flatMap(([name, values]) => {
      const swarm = points === 'beeswarm' ? beeswarm(values, pxPerValue, room) : undefined;
      if (points === 'beeswarm' && swarm === undefined) fellBack.push(name);
      const random = seeded(seedOf(name));
      return values.map((value, at) => ({
        name,
        value,
        dx: swarm?.[at] ?? round((random() - 0.5) * jitterWidth),
      }));
    });
    const notes =
      fellBack.length === 0
        ? []
        : wrapped(
            fellBackNote(fellBack.map((each) => nameOf(each))),
            canvas.width - GRID_PX.left - GRID_PX.right,
          );
    return { points: placed, extent, fellBack, notes, noteLines };
  };

  // A note takes height from the plot, which can push another category out
  // of its swarm: placed again, below as many lines as the note has taken at
  // most, until its note fits them. The lines kept only grow, so this ends; a
  // plot measured below more lines than drawn is taller as drawn, which only
  // moves its points further apart.
  let drawn = layout(0);
  while (drawn.notes.length > drawn.noteLines) drawn = layout(drawn.notes.length);
  return drawn;
}

/** What a box plot says in the chart of how it drew its points (AC-592). */
export function distributionNotes(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): string[] {
  const { points } = drawnDistribution(spec.options, spec.eachPointIs !== undefined);
  if (points !== 'beeswarm') return [];
  const { notes } = pointsLayoutOf(spec, points, canvas);
  return notes.length === 0 ? [] : [notes.join(' ')];
}

export function boxplotOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isBoxplotType(spec.chartType)) throw new Error(`${spec.chartType} is not a box plot`);
  const option = boxesAndPoints(spec, canvas);
  const { violin } = drawnDistribution(spec.options, spec.eachPointIs !== undefined);
  if (!violin) return option;

  // Customize › Distribution's Violin (T992, AC-592): each category's violin
  // in its colour, under its box, which narrows to 20 px inside it. Last of
  // the series, so the box and its points keep their places (the marking
  // reads them by place).
  const byCategory = valuesByCategory(spec);
  const violins = boxesOf(spec).map(({ name }, index) => ({
    name,
    density: densityOf(byCategory.get(name) ?? []),
    colour: colourFor(spec, name, index),
  }));
  const [box, ...rest] = (option['series'] as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...option,
    series: [
      // Open, so the violin shows through where its values gather, as sheet
      // 11 draws it (T992's review).
      ...(box === undefined
        ? []
        : [
            {
              ...box,
              boxWidth: [...BOX_IN_VIOLIN_WIDTH],
              itemStyle: { ...(box['itemStyle'] as object | undefined), color: 'none' },
            },
          ]),
      ...rest,
      violinSeries(`${memberOn(spec.encoding, 'y') ?? ''} (violin)`, violins),
    ],
  };
}

/** The boxes and their points as Points draws them, without a violin. */
function boxesAndPoints(spec: RenderSpec, canvas: Canvas): EChartsOption {
  const value = memberOn(spec.encoding, 'y') ?? '';
  // One series, so one colour: the measure's, as every renderer picks it (AC-039).
  const colour = colourFor(spec, value, 0);
  const boxes = boxesOf(spec);
  // Customize › Distribution's Points (T990, T991): Outliers unless chosen,
  // and All or Beeswarm only while Each point is says what a point is.
  const { points } = drawnDistribution(spec.options, spec.eachPointIs !== undefined);

  const box = {
    type: 'boxplot' as const,
    name: value,
    data: boxes.map(({ stats }) => [stats.low, stats.q1, stats.median, stats.q3, stats.high]),
    itemStyle: { borderColor: colour },
  };
  const xAxis = { type: 'category', data: boxes.map((each) => each.name) };

  // None: the boxes alone, not even the values beyond the whiskers.
  if (points === 'none') {
    return { animation: false, xAxis, yAxis: { type: 'value', scale: true }, series: [box] };
  }

  if (points === 'outliers') {
    // As drawn before R81 (AC-306).
    return {
      animation: false,
      xAxis,
      yAxis: { type: 'value', scale: true },
      series: [
        box,
        {
          // Outliers, in their category's colour at 60 % (direction.md rule 88).
          type: 'scatter' as const,
          name: `${value} (outliers)`,
          data: boxes.flatMap(({ name, stats }) =>
            stats.outliers.map((outlier) => [name, outlier]),
          ),
          symbolSize: POINT_PX,
          itemStyle: { color: colour, opacity: POINT_OPACITY },
        },
      ],
    };
  }

  // Every point, All or Beeswarm, each moved sideways by its own offset.
  const layout = pointsLayoutOf(spec, points, canvas);
  // Said once, in lines that fit the canvas, the plot set below them.
  const { notes } = layout;
  return {
    animation: false,
    xAxis,
    // Its ends set, so the placement's pixels are the drawing's.
    yAxis: { type: 'value', min: layout.extent[0], max: layout.extent[1] },
    ...(notes.length === 0
      ? {}
      : {
          grid: { top: GRID_PX.top + notes.length * NOTE_LINE_PX },
          graphic: [
            {
              type: 'text',
              left: 0,
              top: 0,
              style: {
                text: notes.join('\n'),
                fill: COLORS.light['text-secondary'],
                fontSize: 12,
                lineHeight: NOTE_LINE_PX,
              },
            },
          ],
        }),
    series: [
      box,
      {
        type: 'scatter' as const,
        name: `${value} (points)`,
        data: layout.points.map((point) => ({
          value: [point.name, point.value],
          symbolOffset: [point.dx, 0],
        })),
        symbolSize: POINT_PX,
        itemStyle: { color: colour, opacity: POINT_OPACITY },
        // Over the box.
        z: 3,
      },
    ],
  };
}
