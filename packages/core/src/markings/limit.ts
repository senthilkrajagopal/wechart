import { isItemMarked } from './apply';
import type { MarkedItem, MarkingPredicate } from './predicate';

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

/**
 * Invert marking on one tile (AC-115): of the items the tile shows, the
 * marked come off and the unmarked go on — within the cap (AC-102), since
 * this adds a list. Items another tile contributed are not the tile's, and
 * stay as they are; so do ranges.
 */
export function invertTileItems(
  predicate: MarkingPredicate,
  tileItems: readonly MarkedItem[],
): LimitedMarking {
  const marked = tileItems.filter((item) => isItemMarked(predicate, item));
  const kept: MarkingPredicate = {
    ...predicate,
    items: predicate.items.filter(
      (item) => !marked.some((each) => isItemMarked({ ...predicate, items: [each] }, item)),
    ),
  };
  return addItemsWithinLimit(
    kept,
    tileItems.filter((item) => !isItemMarked(predicate, item)),
  );
}

/**
 * Mark all on one tile (AC-115): every item it shows, each once, added to
 * what the marking holds — other tiles' items kept. Exempt from the cap, as
 * AC-102 makes "Mark all", and as the prototype's does
 * (docs/design/prototype/dashboard.js, `op === 'all'`): the tile's items are
 * its drawn categories, each already one of a bounded set on screen.
 */
export function markAllTileItems(
  predicate: MarkingPredicate,
  tileItems: readonly MarkedItem[],
): LimitedMarking {
  const added = tileItems.filter(
    (item, index) =>
      !isItemMarked(predicate, item) &&
      tileItems.findIndex((other) => isItemMarked({ ...predicate, items: [other] }, item)) ===
        index,
  );
  return {
    predicate:
      added.length === 0 ? predicate : { ...predicate, items: [...predicate.items, ...added] },
    refused: 0,
  };
}
