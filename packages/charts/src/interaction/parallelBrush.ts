/**
 * Brushing along parallel axes (T983, AC-599; design 23 sheet 7; direction.md
 * rule 159): a drag along an axis is a range of its measure; the members
 * whose lines pass through every brushed range are what the tile marks, as a
 * member list (AC-102's 1,000 at most), or filters the others by.
 *
 * wechart's own, not ECharts' built-in parallel brush, which can't add a
 * second brush by pointer, forgets its ranges on every redraw and swallows
 * clicks (research/echarts-parallel-brush.md). The axes are placed here as
 * ECharts lays them out: across the `parallel` box, a value at its height
 * between the axis's `min` and `max`.
 */
import { membersOn, memberOn, type ParallelBrush, type RenderSpec } from '@wechart/core';

import { titleOf } from '../modelWriter';
import { parallelLinesOf } from '../series/parallel';
import type { EChartsOption } from '../theme';
import type { Shape } from './hitTest';

/** How near an axis, in pixels either side, a drag must be to brush it. */
const AXIS_REACH_PX = 12;

/** An axis as laid out: its measure, where it stands, and its values' heights. */
export interface ParallelAxisPlace {
  readonly member: string;
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly min: number;
  readonly max: number;
  readonly yOf: (value: number) => number;
  readonly valueAt: (y: number) => number;
}

const numeric = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The axes of a drawn parallel-coordinates option, as ECharts lays them out on a canvas this size. */
export function parallelAxesOf(
  spec: RenderSpec,
  option: EChartsOption,
  size: { readonly width: number; readonly height: number },
): ParallelAxisPlace[] {
  // As set, or as `getOption` gives it back: a list of one.
  const given = option['parallel'];
  const box = ((Array.isArray(given) ? given[0] : given) ?? {}) as Record<string, unknown>;
  const left = numeric(box['left'], 80);
  const right = numeric(box['right'], 80);
  const top = numeric(box['top'], 60);
  const bottomGap = numeric(box['bottom'], 60);
  const width = Math.max(size.width - left - right, 0);
  const height = Math.max(size.height - top - bottomGap, 0);
  const members = membersOn(spec.encoding, 'y');
  const axes =
    (option['parallelAxis'] as { dim?: number; min?: number; max?: number }[] | undefined) ?? [];
  const last = Math.max(axes.length - 1, 1);
  return axes.map((axis, at) => {
    const min = numeric(axis.min, 0);
    const max = numeric(axis.max, 1);
    const span = max - min || 1;
    return {
      member: members[axis.dim ?? at] ?? '',
      x: left + (at * width) / last,
      top,
      bottom: top + height,
      min,
      max,
      yOf: (value) => top + height * (1 - (value - min) / span),
      valueAt: (y) => min + (1 - (y - top) / (height || 1)) * span,
    };
  });
}

/**
 * The brush a drag makes (AC-599): on the axis nearest its middle, within
 * 12 px of it, from the value at its foot to the value at its head, kept
 * to the axis's ends. None where it is near no axis.
 */
export function parallelBrushOf(
  spec: RenderSpec,
  option: EChartsOption,
  size: { readonly width: number; readonly height: number },
  shape: Shape,
): ParallelBrush | undefined {
  const xs = shape.kind === 'rect' ? [shape.x0, shape.x1] : shape.points.map(([x]) => x);
  const ys = shape.kind === 'rect' ? [shape.y0, shape.y1] : shape.points.map(([, y]) => y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const middle = (x0 + x1) / 2;
  const axis = parallelAxesOf(spec, option, size)
    .filter((one) => one.x >= x0 - AXIS_REACH_PX && one.x <= x1 + AXIS_REACH_PX)
    .sort((a, b) => Math.abs(a.x - middle) - Math.abs(b.x - middle))[0];
  if (axis === undefined) return undefined;
  const clamp = (value: number) => Math.min(Math.max(value, axis.min), axis.max);
  const from = clamp(axis.valueAt(Math.max(...ys)));
  const to = clamp(axis.valueAt(Math.min(...ys)));
  return { member: axis.member, from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * The brushes after one more (AC-599): with Ctrl or ⌘ it is added, in place
 * of any on its axis; without, it replaces them all.
 */
export function withBrush(
  brushes: readonly ParallelBrush[],
  brush: ParallelBrush,
  add: boolean,
): ParallelBrush[] {
  return add ? [...brushes.filter((one) => one.member !== brush.member), brush] : [brush];
}

const EPSILON = 1e-9;

/**
 * The members whose lines pass through every brushed range, bounds
 * included, of the lines drawn, in their order (AC-599); a line with no
 * value on a brushed axis passes through none of it.
 */
export function membersBrushed(spec: RenderSpec, brushes: readonly ParallelBrush[]): unknown[] {
  const { lineBy, rows } = parallelLinesOf(spec);
  if (lineBy === undefined || brushes.length === 0) return [];
  const seen = new Set<string>();
  const members: unknown[] = [];
  for (const row of rows) {
    const passes = brushes.every((brush) => {
      const raw = row[brush.member];
      const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
      return value >= brush.from - EPSILON && value <= brush.to + EPSILON;
    });
    const key = String(row[lineBy] ?? '');
    if (passes && !seen.has(key)) {
      seen.add(key);
      members.push(row[lineBy]);
    }
  }
  return members;
}

/** A list as a sentence says it: "A", "A and B", "A, B and C". */
function listed(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/**
 * What a brush marks or filters by, in its chip's words (AC-599): "Product:
 * 6 brushed in Margin %"; across several axes, "… in Margin % and Return rate".
 */
export function brushedWords(
  spec: RenderSpec,
  brushes: readonly ParallelBrush[],
  count: number,
): string {
  const lineBy = memberOn(spec.encoding, 'x') ?? '';
  return `${titleOf(spec, lineBy)}: ${count.toLocaleString('en-US')} brushed in ${listed(
    brushes.map((brush) => titleOf(spec, brush.member)),
  )}`;
}
