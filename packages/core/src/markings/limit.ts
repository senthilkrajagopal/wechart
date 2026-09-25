import { isItemMarked } from './apply';
import { matchesPredicate, type MarkedItem, type MarkingPredicate } from './predicate';

/**
 * The cap on how many items one marking stores, and the one operation exempt
 * from it (AC-102).
 *
 * **The exemption is the design, not a special case.** Every other gesture
 * enumerates: a lasso over ten thousand points stores ten thousand tuples, and
 * the cap exists because that has to be persisted, compared on every render
 * and sent to Cube. "Mark all" enumerates nothing — it stores the predicate
 * the tile is already filtered by — so there is no list to be too long.
 * Refusing it would refuse the one operation the cap was never about.
 *
 * **Provenance, stated because the two documents disagree.** `docs/spec.md`
 * fixes the figure at 1,000, and that is the contract this implements.
 * `docs/design/direction.md` still lists "The item cap. Spotfire's in-db
 * default is 1,000" under **"Still open for the user"** — so the number is the
 * spec's, traceable to Spotfire's in-database default, and the design doc has
 * not caught up. If the user settles on another figure, this constant and
 * AC-102 move together.
 */
export const MARKING_ITEM_LIMIT = 1000;

export interface LimitedMarking {
  readonly predicate: MarkingPredicate;
  /** How many items were left out because the marking was full. */
  readonly refused: number;
  /** What to tell the user, when anything was refused. */
  readonly message?: string;
}

/**
 * Add items, keeping the marking within the cap.
 *
 * Items past the cap are dropped rather than the whole gesture: a lasso over
 * 1,050 points is a reasonable thing to do and mostly succeeds, and throwing
 * all 1,050 away would punish someone for the size of their data and leave
 * them with nothing marked.
 */
export function addItemsWithinLimit(
  predicate: MarkingPredicate,
  items: readonly MarkedItem[],
): LimitedMarking {
  const added: MarkedItem[] = [];
  let refused = 0;

  for (const item of items) {
    // Already marked is not growth. Counting it would refuse items while
    // leaving room unused.
    if (
      isItemMarked(predicate, item) ||
      added.some((one) => isItemMarked({ ...predicate, items: [one] }, item))
    ) {
      continue;
    }

    if (predicate.items.length + added.length >= MARKING_ITEM_LIMIT) {
      refused += 1;
      continue;
    }

    added.push(item);
  }

  const next =
    added.length === 0 ? predicate : { ...predicate, items: [...predicate.items, ...added] };

  return {
    predicate: next,
    refused,
    ...(refused === 0
      ? {}
      : {
          message: `A marking holds at most ${MARKING_ITEM_LIMIT.toLocaleString('en-GB')} items. ${String(refused)} were not added.`,
        }),
  };
}

/**
 * Mark everything the tile is showing.
 *
 * Exempt from the cap because it stores the tile's filter — a predicate over
 * members, in the same language as every other marking (AC-086) — rather than
 * a list of the rows it happens to match today. That also means it keeps
 * meaning "everything here" as the data changes, which an enumeration would
 * not.
 */
export function markAll(tileFilter: MarkingPredicate): LimitedMarking {
  return { predicate: tileFilter, refused: 0 };
}

/** The predicate without this tile's items, nor its whole. Other tiles' are theirs. */
function withoutTile(
  predicate: MarkingPredicate,
  tileId: string,
  tileItems: readonly MarkedItem[],
): MarkingPredicate {
  const mine = { ...predicate, items: tileItems };
  return {
    ...predicate,
    items: predicate.items.filter((item) => !isItemMarked(mine, item)),
    wholes: (predicate.wholes ?? []).filter((whole) => whole.tileId !== tileId),
  };
}

const markedWhole = (predicate: MarkingPredicate, tileId: string) =>
  (predicate.wholes ?? []).some((whole) => whole.tileId === tileId);

/**
 * Invert marking on one tile (AC-115): of the items the tile shows, the
 * marked come off and the unmarked go on — within the cap (AC-102), since
 * this adds a list. A tile marked whole has no unmarked item, so it inverts
 * to none of it. Items another tile contributed are not the tile's, and stay
 * as they are; so do ranges.
 */
export function invertTileItems(
  predicate: MarkingPredicate,
  tileId: string,
  tileItems: readonly MarkedItem[],
): LimitedMarking {
  const rest = withoutTile(predicate, tileId, tileItems);
  if (markedWhole(predicate, tileId)) return { predicate: rest, refused: 0 };
  // Unmarked as drawn: an item another tile's whole already marks is marked
  // here too, and that whole is not this tile's to undo (T121's third
  // review) — so it is neither added nor taken away.
  const drawnMarked = (item: MarkedItem) =>
    isItemMarked(predicate, item) ||
    matchesPredicate(rest, Object.fromEntries(item.map((part) => [part.member, part.value])));
  return addItemsWithinLimit(
    rest,
    tileItems.filter((item) => !drawnMarked(item)),
  );
}

/**
 * Mark all on one tile (AC-115), stored as the tile's filter — what it was
 * drawn with — and how many items it showed, never as a list (AC-102, the
 * user's decision of 2026-09-24): so it is never refused, and stores nothing
 * the cap counts. Any earlier whole of it goes. Items equal to the tile's go
 * only where the whole marks every row: filtered, the whole may be narrower
 * than an item another tile marked across everything, and one item cannot be
 * told from the other (T121's third review).
 */
export function markAllOfTile(
  predicate: MarkingPredicate,
  tileId: string,
  filters: readonly Readonly<Record<string, unknown>>[],
  tileItems: readonly MarkedItem[],
  /** The member the tile's items are values of (AC-103). */
  member?: string,
): LimitedMarking {
  const rest =
    filters.length === 0
      ? withoutTile(predicate, tileId, tileItems)
      : withoutTile(predicate, tileId, []);
  return {
    predicate: {
      ...rest,
      wholes: [
        ...(rest.wholes ?? []),
        { tileId, ...(member === undefined ? {} : { member }), filters, count: tileItems.length },
      ],
    },
    refused: 0,
  };
}

/**
 * A tile marked whole, as its items again (within the cap), so one of them
 * can be toggled — a Ctrl-click on a wholly marked tile unmarks that one item
 * rather than doing nothing. A tile not marked whole is returned as it was.
 */
export function expandWholeTile(
  predicate: MarkingPredicate,
  tileId: string,
  tileItems: readonly MarkedItem[],
): LimitedMarking {
  if (!markedWhole(predicate, tileId)) return { predicate, refused: 0 };
  return addItemsWithinLimit(withoutTile(predicate, tileId, tileItems), tileItems);
}
