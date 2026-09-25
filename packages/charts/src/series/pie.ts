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
  const blank = (value: unknown) => value === null || value === undefined || value === '';

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
        return {
          name,
          value,
          // Blank as it came, so a click on it selects nothing (AC-117).
          category: blank(row[category]) ? '' : String(row[category]),
          ...(split === undefined || blank(row[split]) ? {} : { split: String(row[split]) }),
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
        label: { show: false },
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
