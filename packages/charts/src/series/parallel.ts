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

import { colourFor } from '../colours';
import { nameWriter, titleOf } from '../modelWriter';
import type { EChartsOption } from '../theme';

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
  if (members <= PARALLEL_LINE_CAP) {
    return { lineBy, colour, axes, scale, rows: spec.rows, members, drawn: members };
  }

  // The first 1,000 members by the first measure, largest first; a member
  // split by Colour across rows keeps all its rows.
  const [first] = axes;
  const ranked = [...spec.rows].sort(
    (a, b) =>
      (numberOf(b[first ?? '']) ?? Number.NEGATIVE_INFINITY) -
      (numberOf(a[first ?? '']) ?? Number.NEGATIVE_INFINITY),
  );
  const kept = new Set<string>();
  for (const row of ranked) {
    if (kept.size === PARALLEL_LINE_CAP) break;
    kept.add(String(row[lineBy] ?? ''));
  }
  const rows = spec.rows.filter((row) => kept.has(String(row[lineBy] ?? '')));
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

export function parallelOption(spec: RenderSpec): EChartsOption {
  if (!isParallelType(spec.chartType))
    throw new Error(`${spec.chartType} is not parallel coordinates`);
  const { lineBy, colour, axes, scale, rows, drawn } = parallelLinesOf(spec);

  const valuesOf = (member: string) => rows.map((row) => numberOf(row[member]));
  const shared = extentOf(axes.flatMap(valuesOf));
  const opacity = drawn > FADED_PAST ? FADED_OPACITY : 1;

  const parallelAxis = axes.map((member, dim) => {
    const [min, max] = scale === 'shared' ? shared : extentOf(valuesOf(member));
    const write = formatterFor(member, spec.formats ?? {});
    return {
      dim,
      type: 'value',
      // Its measure above, and under that its maximum (rule 159).
      name: `${titleOf(spec, member)}\n${write(max)}`,
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

  const name = lineBy === undefined ? undefined : nameWriter(spec, lineBy);
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

  return {
    animation: false,
    // Room above for each axis's two-line title, and below for its minimum.
    parallel: { left: 48, right: 48, top: 56, bottom: 32 },
    parallelAxis,
    series,
  };
}
