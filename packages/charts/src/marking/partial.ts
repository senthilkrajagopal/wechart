import { MARKED_OUTLINE_PX, UNMARKED_OPACITY, type ItemStyle } from './render';

/**
 * How a partly marked item is drawn (AC-097, direction.md rule 49).
 *
 * This is the one place where drawing the obvious thing is wrong. Splitting a
 * bar in proportion to the marked rows looks right for every measure and is
 * only *true* when the measure sums across rows: half the rows of an average
 * do not make half the average, and the distinct customers in a marked subset
 * are not a fraction of the distinct customers overall, because they overlap.
 * A sub-length there would be a confident, readable, precisely drawn lie — so
 * non-additive measures get a pattern and the exact numbers in the tooltip
 * instead, which says what is known without implying what is not.
 */

/**
 * The Cube aggregation types whose marked share is a share of the whole
 * (direction.md: "additive measures (Cube `sum` and `count`)").
 *
 * **`countDistinctApprox` is deliberately absent**, even though
 * `docs/research/cube/data-modeling.md` calls it "additive and
 * rollup-friendly". That is true of merging HyperLogLog sketches across
 * rollups and false of what matters here: a distinct count over a subset is
 * not a portion of the distinct count over everything. Two meanings of one
 * word, and taking the wrong one draws the lie above.
 *
 * Types come from that research's table, camelized as Cube camelizes them.
 */
const ADDITIVE = new Set(['sum', 'count']);

/** Whether a measure's marked share can honestly be drawn as a sub-length. */
export function isAdditive(aggType: string | undefined): boolean {
  // Unknown types are not additive. A sub-length is a claim about the data,
  // and one should not be made about a measure nothing is known about.
  return aggType !== undefined && ADDITIVE.has(aggType);
}

export interface PartlyMarked {
  /**
   * The measure's value over the item's marked rows: a part of the total for
   * an additive measure, a value of its own for any other. `undefined` when
   * none of its rows is marked, which a non-additive value of 0 doesn't say.
   */
  readonly marked: number | undefined;
  /** The value of the whole item. */
  readonly total: number;
  /** Cube's declared `aggType` for the measure, when the meta has one. */
  readonly aggType: string | undefined;
}

export interface MarkColours {
  readonly own: string;
  readonly marking: string;
}

export type PartialMark =
  | { readonly kind: 'none' }
  | { readonly kind: 'whole' }
  | {
      readonly kind: 'share';
      readonly marked: number;
      readonly remainder: number;
      readonly markedStyle: ItemStyle;
      readonly remainderStyle: ItemStyle;
    }
  | {
      readonly kind: 'pattern';
      readonly style: ItemStyle & { readonly decal: Record<string, unknown> };
      /** direction.md: the tooltip shows "Marked: X" beside the total. */
      readonly tooltip: string;
    };

/** How to draw one item, given how much of it is marked. */
export function partialMark(item: PartlyMarked, colours: MarkColours): PartialMark {
  const { marked, total, aggType } = item;
  if (marked === undefined) return { kind: 'none' };

  /**
   * A non-additive value over the marked rows says nothing about how many of
   * the item's rows they are: an average of the marked orders can equal, or
   * pass, the average of all of them while most are unmarked, and a minimum
   * over a subset is never below the whole's. So it is never "whole" from its
   * values — it is hatched, and the tooltip says both (T387's review).
   */
  if (!isAdditive(aggType)) {
    return {
      kind: 'pattern',
      style: {
        color: colours.own,
        opacity: 1,
        borderColor: colours.marking,
        borderWidth: MARKED_OUTLINE_PX,
        // ECharts' per-item `decal`, which the research names as covering the
        // marking visuals along with colour, border and opacity.
        decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 },
      },
      tooltip: `Marked: ${String(marked)} of ${String(total)}`,
    };
  }

  /**
   * A sum's parts: none marked, all of it, or a share — of either sign. A
   * negative share (refunds, losses) is drawn below the baseline as ECharts
   * stacks it, and a marked +3 of a -10 total is +3 marked over -13 unmarked:
   * both are what the rows hold. Summed apart, the marked rows can differ from
   * the total by rounding only.
   */
  if (marked === 0) return { kind: 'none' };
  if (Math.abs(marked - total) <= 1e-9 * Math.max(1, Math.abs(total))) return { kind: 'whole' };

  return {
    kind: 'share',
    marked,
    remainder: total - marked,
    markedStyle: {
      color: colours.own,
      opacity: 1,
      borderColor: colours.marking,
      borderWidth: MARKED_OUTLINE_PX,
    },
    remainderStyle: { color: colours.own, opacity: UNMARKED_OPACITY, borderWidth: 0 },
  };
}
