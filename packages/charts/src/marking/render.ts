import { isEmptyPredicate, matchesPredicate, type MarkingPredicate } from '@wechart/core';

/**
 * How a tile draws a marking (AC-096, direction.md rule 49): "Marked items
 * keep their colour and gain an outline in the marking colour; unmarked items
 * fade."
 *
 * Per-item `itemStyle`, which `docs/research/echarts.md` identifies as what
 * covers this: ECharts' own `select`/`blur` states model one boolean per item
 * and cannot express our three-valued marking, so colour, border and opacity
 * are set per data item as the prototype does.
 *
 * Three things are true at once and each is separately losable. The item keeps
 * **its own** colour, so a marking does not destroy the series identity the
 * legend promised (AC-039). The outline is the **marking's** colour, so two
 * markings on one dashboard are told apart. Everything else fades.
 */

/**
 * direction.md §5: "Unmarked fade: opacity 0.28. Marked outline: 1.5 px in the
 * marking colour", both recorded there as derived by us rather than taken from
 * Spotfire, which publishes neither. Here once rather than per chart type, so
 * a bar and a scatter cannot disagree about what marked looks like.
 */
export const UNMARKED_OPACITY = 0.28;
export const MARKED_OUTLINE_PX = 1.5;

export interface TileMarking {
  readonly predicate: MarkingPredicate;
  /** The marking's own colour, from its slot (mk1–mk4). */
  readonly colour: string;
}

export interface ItemStyle {
  readonly color: string;
  readonly opacity: number;
  readonly borderColor?: string;
  readonly borderWidth: number;
}

/**
 * The style for one item of a tile that shows a marking.
 *
 * **An empty marking fades nothing.** Rule 49 read literally — "unmarked items
 * fade" — would fade every item on a dashboard where nobody has marked
 * anything, which is most dashboards most of the time. Nothing marked means
 * the tile is not showing a marking, not that everything is excluded from one.
 */
export function markedItemStyle(
  row: Record<string, unknown>,
  ownColour: string,
  marking: TileMarking,
): ItemStyle {
  if (isEmptyPredicate(marking.predicate)) {
    return { color: ownColour, opacity: 1, borderWidth: 0 };
  }

  if (!matchesPredicate(marking.predicate, row)) {
    // Faded, not greyed: which series an item belongs to stays readable, so a
    // marking narrows attention rather than destroying the chart underneath.
    return { color: ownColour, opacity: UNMARKED_OPACITY, borderWidth: 0 };
  }

  return {
    color: ownColour,
    opacity: 1,
    borderColor: marking.colour,
    borderWidth: MARKED_OUTLINE_PX,
  };
}
