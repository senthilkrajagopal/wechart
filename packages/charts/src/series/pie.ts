/**
 * Pie and donut (AC-037).
 *
 * One series, one slice per category, the measure driving the angle. A donut
 * is the same chart with an inner radius, so the two share everything except
 * that number — writing them apart would let their slice ordering, colours and
 * gap treatment drift, which is exactly what a reader compares across a
 * dashboard.
 */
import { memberOn, membersOn, tableColumnsOf, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { nameWriter } from '../modelWriter';
import { DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';
import type { Canvas } from './bar';

/** A slice's value that is blank, as its legend entry writes it (AC-221). */
export const NO_VALUE = '(no value)';

/**
 * One slice: its name as the legend and tooltip write it — every value it is
 * grouped by, each written as the model says (AC-188) — and, apart, the raw
 * values a click, a marking or a highlight match rows by (AC-087, AC-117).
 */
export interface Slice {
  readonly name: string;
  readonly value: number;
  /** The category's value as it came; empty where it was blank. */
  readonly category: string;
  /** The second dimension's value as it came, where the pie is split. */
  readonly split?: string;
  /**
   * The values of any other member it is grouped by, as they came, where it
   * is grouped by more than its category and split: its marked share is its
   * own row's (T453), not every slice's with its category and split.
   */
  readonly grouped?: Readonly<Record<string, string>>;
}

const LAYOUT = {
  pie: { innerRadius: '0%' },
  donut: { innerRadius: '50%' },
} as const;

export type PieType = keyof typeof LAYOUT;

export function isPieType(chartType: string): chartType is PieType {
  return chartType in LAYOUT;
}

const OUTER_RADIUS = '70%';
/** How far an outer data label keeps from its box's edge: two of direction.md's 4 px steps. */
const EDGE_PX = 8;
/**
 * A data label's width, estimated: ECharts' 12 px text, at 0.6 em a
 * character, generous for digits (0.556 em in Helvetica) and wider than a
 * comma or a point.
 */
const LABEL_CHAR_PX = 12 * 0.6;
/** An outer label's line leaves the ring for 15 px, ECharts' `labelLine.length`, before it turns. */
const LABEL_LINE_PX = 15;

/** The member a pie's slices are also split by — its second dimension — if any. */
export function pieSplitOf(spec: RenderSpec): string | undefined {
  const split = memberOn(spec.encoding, 'color');
  return split === undefined || split === memberOn(spec.encoding, 'x') ? undefined : split;
}

/**
 * What a pie's slices are grouped by: its category, its split, then any other
 * member its rows carry that is not measured — a slice is a row, and one
 * named by fewer than all of these shared its name, and so its one legend
 * entry, with another (AC-221). A time member Cube also sends at its grain
 * (`orders.ordered_at.day` beside `orders.ordered_at`) is counted once.
 */
function groupingOf(spec: RenderSpec): string[] {
  const placed = [memberOn(spec.encoding, 'x'), pieSplitOf(spec)].filter(
    (member): member is string => member !== undefined,
  );
  // Which columns are measured is known only where the spec says (compile
  // always does); without it, a measure beside the drawn one would be taken
  // for a grouping.
  if (spec.measures === undefined) return placed;
  const measured = new Set([...spec.measures, ...membersOn(spec.encoding, 'y')]);
  const columns = tableColumnsOf(spec.rows).filter(
    (column) => !measured.has(column) && !placed.includes(column),
  );
  const rest = columns.filter(
    (column) => ![...placed, ...columns].some((other) => column.startsWith(`${other}.`)),
  );
  return [...placed, ...rest];
}

/** The slices a pie or donut draws, one per row with a measurement (AC-221). */
export function slicesOf(spec: RenderSpec): Slice[] {
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || measure === undefined) return [];
  const split = pieSplitOf(spec);
  const grouping = groupingOf(spec).map((member) => ({ member, write: nameWriter(spec, member) }));
  const others = grouping
    .map(({ member }) => member)
    .filter((member) => member !== category && member !== split);
  const blank = (value: unknown) => value === null || value === undefined || value === '';
  /** A row's other groupings; none that it lacks, as Top N's "Other" lacks them. */
  const groupedOf = (row: Record<string, unknown>) =>
    Object.fromEntries(
      others
        .filter((member) => row[member] !== undefined)
        .map((member) => [member, blank(row[member]) ? '' : String(row[member])]),
    );

  return (
    spec.rows
      .map((row): Slice | null => {
        const raw = row[measure];
        if (blank(raw)) return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) return null;
        /**
         * Every value it is grouped by, each written as the model says — a
         * blank one said, not left as an empty entry — and none that a row
         * lacks: "Other" from Top N carries its category alone.
         */
        const name = grouping
          .filter(({ member }, index) => index === 0 || !blank(row[member]))
          .map(({ member, write }) => (blank(row[member]) ? NO_VALUE : write(row[member])))
          .join(' · ');
        const grouped = groupedOf(row);
        return {
          name,
          value,
          // Blank as it came, so a click on it selects nothing (AC-117).
          category: blank(row[category]) ? '' : String(row[category]),
          ...(split === undefined || blank(row[split]) ? {} : { split: String(row[split]) }),
          ...(Object.keys(grouped).length === 0 ? {} : { grouped }),
        };
      })
      // A category with no measurement is left out rather than drawn as a
      // zero-width sliver: a sliver in the legend invites the reader to look
      // for a slice that is not there.
      .filter((slice) => slice !== null)
  );
}

/**
 * The member a slice is coloured as (AC-039): its category's own value, the
 * same name a bar split by that category colours a series by; a slice of a
 * split pie, or of a blank category, by its written name. The dashboard's
 * assignment claims these (T301), so the two must be one definition.
 */
export function colourKeyOf(slice: Slice): string {
  return slice.split === undefined && slice.category !== '' ? slice.category : slice.name;
}

export function pieOption(spec: RenderSpec): EChartsOption {
  if (!isPieType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a pie chart`);
  }

  const surface = spec.surface ?? DEFAULT_SURFACE;
  const slices = slicesOf(spec);

  return {
    animation: false,
    series: [
      {
        type: 'pie' as const,
        radius: [LAYOUT[spec.chartType].innerRadius, OUTER_RADIUS],
        /**
         * Its data labels, where Customize turns them on (T395, AC-303):
         * each whole, never cut to the room left ("$1,2..."): aligned to the
         * edges of the pie's box, and one that meets another hidden
         * (research `echarts-pie-labels.md`). `fitPieLabels` moves them
         * inside, or hides them, where the box leaves them no room.
         */
        label: { show: false, overflow: 'none', alignTo: 'edge', edgeDistance: EDGE_PX },
        labelLayout: { hideOverlap: true },
        data: slices.map((slice, index) => ({
          ...slice,
          itemStyle: {
            // By the slice's own value, so a category keeps its colour in
            // every tile of a dashboard (AC-039).
            color: colourFor(spec, colourKeyOf(slice), index),
            // The same surface-coloured gap the bar family uses, so slices of
            // a pie and segments of a stacked bar read the same way.
            borderColor: surface,
            borderWidth: MARK.gapPx,
          },
        })),
      },
    ],
  };
}

/**
 * A pie's data labels laid out for the canvas it is drawn in (T395, AC-303),
 * each whole and clear of the ring:
 * - beside the ring, aligned to the box's edge, where the widest has room
 *   between the ring and that edge;
 * - else beside a smaller ring, down to half its size, which leaves them
 *   that room;
 * - else, on a pie, inside the slices, where the widest stays within the
 *   box (a donut's band is too thin to hold them);
 * - else not drawn, the tooltip still giving each value.
 * Left to ECharts, an edge-aligned label wider than its room grows inward
 * from the edge, over the ring and out past the box's far side — past the
 * tile's edge, or over a side legend (T395's review).
 *
 * The box is the canvas less the room the series leaves a legend (a side
 * legend's 120 px, `customize.ts`); the ring's radii are shares of half the
 * box's shorter side, as ECharts lays them out (research
 * `echarts-pie-labels.md`).
 */
export function fitPieLabels(option: EChartsOption, canvas: Canvas): EChartsOption {
  const series = option['series'];
  if (!Array.isArray(series)) return option;
  return {
    ...option,
    series: (series as Record<string, unknown>[]).map((one) => {
      const label = one['label'] as Record<string, unknown> | undefined;
      if (one['type'] !== 'pie' || label?.['show'] !== true || !Array.isArray(one['radius']))
        return one;
      const px = (edge: string) => (typeof one[edge] === 'number' ? (one[edge] as number) : 0);
      const width = canvas.width - px('left') - px('right');
      const half = Math.min(width, canvas.height - px('top') - px('bottom')) / 2;
      const [inner = 0, outer = 0] = (one['radius'] as unknown[]).map(
        (radius) => (parseFloat(String(radius)) / 100) * half,
      );
      const widest = Math.max(
        0,
        ...labelTextsOf(one, label).map((text) => text.length * LABEL_CHAR_PX),
      );

      // The largest ring that leaves the widest label its room beside it.
      const room = width / 2 - widest - LABEL_LINE_PX - EDGE_PX;
      if (room >= outer) return one;
      if (room >= outer / 2) {
        const share = (px: number) => `${String((px / half) * 100)}%`;
        return { ...one, radius: [share((inner / outer) * room), share(room)] };
      }
      // Inside, a label is centred halfway between the ring's two edges.
      if (inner === 0 && widest / 2 <= width / 2 - outer / 2)
        return { ...one, label: { ...label, position: 'inside' } };
      return { ...one, label: { ...label, show: false } };
    }),
  };
}

/** Each slice's label as its formatter writes it. */
function labelTextsOf(one: Record<string, unknown>, label: Record<string, unknown>): string[] {
  const write = label['formatter'];
  return (Array.isArray(one['data']) ? (one['data'] as { value?: unknown }[]) : []).map((item) =>
    typeof write === 'function'
      ? String((write as (params: object) => unknown)({ ...item, data: item }))
      : String(item.value),
  );
}
