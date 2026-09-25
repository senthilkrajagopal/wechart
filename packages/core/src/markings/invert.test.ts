import { describe, expect, it } from 'vitest';

import { invertTileItems, markAllTileItems, MARKING_ITEM_LIMIT } from './limit';
import type { MarkedItem, MarkingPredicate } from './predicate';

/**
 * T121 / AC-115: WHEN the user chooses Invert marking or Mark all on a tile,
 * THE SYSTEM SHALL mark exactly the tile's unmarked items, or all of its
 * items, and leave other tiles' contributions to that marking unchanged.
 * `Fails when: an inverted marking keeps a previously marked item, or Mark all
 * misses a visible item.`
 */
const status = (value: string): MarkedItem => [{ member: 'orders.status', value }];
const category = (value: string): MarkedItem => [{ member: 'products.category', value }];

const TILE = [status('shipped'), status('completed'), status('processing')];

/** The tile's shipped, and another tile's Instruments, marked. */
const MARKED: MarkingPredicate = {
  items: [status('shipped'), category('Instruments')],
  ranges: [],
};

describe('Invert marking and Mark all on one tile (AC-115)', () => {
  it('inverts: the tile’s unmarked items marked, its marked ones not, another tile’s kept', () => {
    const { predicate, refused } = invertTileItems(MARKED, TILE);
    expect(predicate.items).toEqual([
      category('Instruments'),
      status('completed'),
      status('processing'),
    ]);
    expect(refused).toBe(0);
  });

  it('marks all: every item of the tile, once, another tile’s kept', () => {
    const { predicate, refused } = markAllTileItems(MARKED, TILE);
    expect(predicate.items).toEqual([
      status('shipped'),
      category('Instruments'),
      status('completed'),
      status('processing'),
    ]);
    expect(refused).toBe(0);
  });

  it('holds an invert to the limit, and says so; Mark all is exempt (AC-102)', () => {
    const many = Array.from({ length: MARKING_ITEM_LIMIT + 5 }, (_, at) =>
      status(`s${String(at)}`),
    );
    const inverted = invertTileItems({ items: [], ranges: [] }, many);
    expect(inverted.predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
    expect(inverted.refused).toBe(5);
    expect(inverted.message).toContain('at most 1,000 items');
    const all = markAllTileItems({ items: [], ranges: [] }, many);
    expect(all.predicate.items).toHaveLength(MARKING_ITEM_LIMIT + 5);
    expect(all.refused).toBe(0);
  });
});
