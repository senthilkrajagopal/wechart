import { isEmptyPredicate, type Marking, type MarkingPredicate } from '@wechart/core';

/**
 * The chip for a non-empty marking, in the filter bar's interaction group
 * (AC-098, direction.md rule 50: "every non-empty marking has a chip naming it
 * and summarising its values").
 *
 * The other half of the secondary encoding the marking palette depends on —
 * see `MarkBadge`. The badge says how much of *this tile* is marked; the chip
 * says what the marking actually holds, dashboard-wide.
 */
export interface MarkChipProps {
  readonly marking: Marking;
  readonly colour: string;
  readonly predicate: MarkingPredicate;
}

/**
 * What a marking holds, in words.
 *
 * "Summarising its values" rather than counting them: a chip reading
 * "Marking (2)" names the marking and says nothing about what is in it, which
 * is the same failure as conveying it by colour — you can see that something
 * is marked and not what.
 *
 * Values are only written as `member = a, b` when every marked item names the
 * *same single* member. A tuple across two dimensions cannot be written that
 * way without misstating it, so those are counted instead: an honest count
 * beats a readable untruth.
 */
export function summariseMarking(predicate: MarkingPredicate): string {
  const parts: string[] = [];

  if (predicate.items.length > 0) {
    const members = new Set(predicate.items.flatMap((item) => item.map((part) => part.member)));
    const single = predicate.items.every((item) => item.length === 1);

    if (single && members.size === 1) {
      const member = [...members][0] ?? '';
      const values = predicate.items.map((item) => String(item[0]?.value ?? ''));
      parts.push(`${member} = ${values.join(', ')}`);
    } else {
      const n = predicate.items.length;
      parts.push(n === 1 ? '1 item' : `${String(n)} items`);
    }
  }

  for (const range of predicate.ranges) {
    parts.push(`${range.member} ${String(range.from)} to ${String(range.to)}`);
  }

  return parts.join(', ');
}

export function MarkChip({ marking, colour, predicate }: MarkChipProps) {
  // "Every *non-empty* marking has a chip": an empty one has nothing to name.
  if (isEmptyPredicate(predicate)) return null;

  return (
    <span className="mark-chip" data-testid="mark-chip">
      <span
        className="mark-chip__swatch"
        data-testid="mark-chip-swatch"
        aria-hidden="true"
        style={{ background: colour }}
      />
      {marking.name}: {summariseMarking(predicate)}
    </span>
  );
}
