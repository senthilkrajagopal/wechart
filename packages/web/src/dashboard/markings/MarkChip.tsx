import { isEmptyPredicate, type Marking, type MarkingPredicate } from '@wechart/core';

import { MenuButton } from '../../shell/MenuButton';

/**
 * The chip for a non-empty marking, in the filter bar's interaction group
 * (AC-098, direction.md rule 50: "every non-empty marking has a chip naming it
 * and summarising its values"), drawn as the prototype's `.mchip` (AC-200):
 * bordered in the marking's colour, its values by the members' titles, the
 * tile it came from, a ▾ menu and a × that unmarks.
 *
 * The other half of the secondary encoding the marking palette depends on —
 * see `MarkBadge`. The badge says how much of *this tile* is marked; the chip
 * says what the marking actually holds, dashboard-wide.
 */
export interface MarkChipProps {
  readonly marking: Marking;
  readonly colour: string;
  readonly predicate: MarkingPredicate;
  /** A member's title, which the chip names it by rather than its id (AC-200). */
  readonly titleOf?: ((member: string) => string | undefined) | undefined;
  /** The title of the tile it was last marked from (AC-200). */
  readonly from?: string | undefined;
  /** A tile's title, for one marked whole (AC-115). */
  readonly tileTitleOf?: ((tileId: string) => string | undefined) | undefined;
  /** Unmark it: the chip's × and its menu's Unmark (AC-200). */
  readonly onUnmark?: (() => void) | undefined;
}

/**
 * What a marking holds, in words.
 *
 * "Summarising its values" rather than counting them: a chip reading
 * "Marking (2)" names the marking and says nothing about what is in it, which
 * is the same failure as conveying it by colour — you can see that something
 * is marked and not what.
 *
 * Values are only written with their member when every marked item names the
 * *same single* member. A tuple across two dimensions cannot be written that
 * way without misstating it, so those are counted instead: an honest count
 * beats a readable untruth.
 *
 * Given the members' titles it reads as the prototype's chip does — "Status:
 * paid, shipped" (AC-200); without them, as `member = values`.
 */
export function summariseMarking(
  predicate: MarkingPredicate,
  titleOf?: (member: string) => string | undefined,
  /**
   * How many values to name before counting the rest as "+n" — the chip's
   * bound (T220's review): a marking can hold a thousand items (AC-102).
   */
  max?: number,
  /** A tile's title, for a tile marked whole ("all 3 in By status", AC-115). */
  tileTitleOf?: (tileId: string) => string | undefined,
): string {
  const parts: string[] = [];
  const named = (member: string) => titleOf?.(member) ?? member;

  if (predicate.items.length > 0) {
    const members = new Set(predicate.items.flatMap((item) => item.map((part) => part.member)));
    const single = predicate.items.every((item) => item.length === 1);

    if (single && members.size === 1) {
      const member = [...members][0] ?? '';
      const all = predicate.items.map((item) => String(item[0]?.value ?? ''));
      const values =
        max === undefined || all.length <= max
          ? all.join(', ')
          : `${all.slice(0, max).join(', ')} +${String(all.length - max)}`;
      parts.push(titleOf === undefined ? `${member} = ${values}` : `${named(member)}: ${values}`);
    } else {
      const n = predicate.items.length;
      parts.push(n === 1 ? '1 item' : `${String(n)} items`);
    }
  }

  for (const range of predicate.ranges) {
    parts.push(`${named(range.member)} ${String(range.from)} to ${String(range.to)}`);
  }

  for (const whole of predicate.wholes ?? []) {
    const tile = tileTitleOf?.(whole.tileId);
    parts.push(`all ${String(whole.count)} in ${tile ?? 'a tile'}`);
  }

  return parts.join(', ');
}

export function MarkChip({
  marking,
  colour,
  predicate,
  titleOf,
  from,
  tileTitleOf,
  onUnmark,
}: MarkChipProps) {
  // "Every *non-empty* marking has a chip": an empty one has nothing to name.
  if (isEmptyPredicate(predicate)) return null;

  return (
    <span className="mark-chip" data-testid="mark-chip" style={{ borderColor: colour }}>
      <span
        className="mark-chip__swatch"
        data-testid="mark-chip-swatch"
        aria-hidden="true"
        style={{ background: colour }}
      />
      <span className="mark-chip__name">{marking.name}</span>
      {/* Bounded to two values and "+n", the whole of it on hover. */}
      <span
        className="mark-chip__summary"
        title={summariseMarking(predicate, titleOf, undefined, tileTitleOf)}
      >
        {summariseMarking(predicate, titleOf, 2, tileTitleOf)}
      </span>
      {from === undefined ? null : <span className="mark-chip__from">from {from}</span>}
      {onUnmark === undefined ? null : (
        <>
          {/* The prototype's ▾: what can be done with what is marked. Its
              other actions arrive with their criteria (AC-113, AC-114,
              AC-123). */}
          <MenuButton
            label={`${marking.name} menu`}
            className="mark-chip__button"
            align="end"
            items={[{ key: 'unmark', label: 'Unmark', onSelect: onUnmark }]}
          >
            <span aria-hidden="true">▾</span>
          </MenuButton>
          <button
            type="button"
            className="mark-chip__button"
            aria-label={`Unmark ${marking.name}`}
            onClick={onUnmark}
          >
            <span aria-hidden="true">×</span>
          </button>
        </>
      )}
    </span>
  );
}
