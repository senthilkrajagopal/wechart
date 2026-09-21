import { EMPTY_PREDICATE, type MarkedItem, type MarkingPredicate } from './predicate';

/**
 * Marking rows in a table (AC-092, direction.md §7a rule 10).
 *
 * **Rows are markable only where a primary key is**, and that is not a
 * limitation borrowed for its own sake. `references-markings.md` quotes
 * Spotfire: "A primary key is required to know which rows to mark." The same
 * reasoning as AC-086 — a marking is a predicate over members, never a
 * position in a result — and without a key there is no member combination that
 * names one row rather than several. Marking would then mean "these rows and
 * any others that happen to look like them", which is not what the user
 * pointed at.
 *
 * Offering the gesture anyway and marking approximately would be worse than
 * not offering it: the user would have no way to tell the two apart.
 */
export interface RowClick {
  readonly shift: boolean;
  /** Where a Shift-range starts: the last row marked without Shift. */
  readonly anchor: number | null;
  /** The cube's primary key member, when it has one. */
  readonly primaryKey: string | undefined;
}

export interface RowMarking {
  readonly predicate: MarkingPredicate;
  /** The anchor to use for the next Shift-click, or null when nothing marked. */
  readonly anchor: number | null;
}

/** Whether a table's rows can be marked at all. */
export function rowsMarkable(primaryKey: string | undefined): boolean {
  return primaryKey !== undefined && primaryKey !== '';
}

/** The item that names exactly one row: its primary key value. */
export function itemForRow(row: Record<string, unknown>, primaryKey: string): MarkedItem {
  return [{ member: primaryKey, value: row[primaryKey] as string | number }];
}

/**
 * The marking after clicking a row.
 *
 * A plain click marks that row and becomes the anchor. Shift-click marks every
 * row from the anchor to here **in display order**, which is the order the
 * user sees and the only order the gesture can mean: the same two rows in a
 * differently sorted table enclose a different set, and that is correct —
 * Shift-click is a statement about what is on screen between two points.
 */
export function markRowClick(
  rows: readonly Record<string, unknown>[],
  index: number,
  { shift, anchor, primaryKey }: RowClick,
): RowMarking {
  // No key, no marking: there is nothing that names one row.
  if (!rowsMarkable(primaryKey) || primaryKey === undefined) {
    return { predicate: EMPTY_PREDICATE, anchor: null };
  }

  const clicked = rows[index];
  if (clicked === undefined) return { predicate: EMPTY_PREDICATE, anchor: null };

  if (!shift || anchor === null) {
    return {
      predicate: { ...EMPTY_PREDICATE, items: [itemForRow(clicked, primaryKey)] },
      anchor: index,
    };
  }

  const [first, last] = anchor <= index ? [anchor, index] : [index, anchor];
  const items = rows.slice(first, last + 1).map((row) => itemForRow(row, primaryKey));

  /**
   * The anchor does not move. Spotfire's Shift-range extends from where the
   * range began, so a second Shift-click grows or shrinks the same range
   * rather than starting a new one from wherever the last one ended.
   */
  return { predicate: { ...EMPTY_PREDICATE, items }, anchor };
}
