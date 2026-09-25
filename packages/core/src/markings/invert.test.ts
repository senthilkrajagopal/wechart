import { describe, expect, it } from 'vitest';

import { expandWholeTile, invertTileItems, markAllOfTile, MARKING_ITEM_LIMIT } from './limit';
import {
  isEmptyPredicate,
  markedCount,
  matchesPredicate,
  type MarkedItem,
  type MarkingPredicate,
} from './predicate';
import { limitFilterFor } from './query';

/**
 * T121 / AC-115: WHEN the user chooses Invert marking or Mark all on a tile,
 * THE SYSTEM SHALL mark exactly the tile's unmarked items, or all of its
 * items, and leave other tiles' contributions to that marking unchanged.
 * `Fails when: an inverted marking keeps a previously marked item, or Mark all
 * misses a visible item.`
 *
 * AC-102: "Mark all" is exempt from the 1,000-item cap "because it stores the
 * tile's filter rather than a list" — as the user confirmed (2026-09-24): it
 * stores what the tile was filtered by, and how many items that was.
 */
const status = (value: string): MarkedItem => [{ member: 'orders.status', value }];
const category = (value: string): MarkedItem => [{ member: 'products.category', value }];

const TILE = [status('shipped'), status('completed'), status('processing')];

/** The tile's shipped, and another tile's Instruments, marked. */
const MARKED: MarkingPredicate = {
  items: [status('shipped'), category('Instruments')],
  ranges: [],
};

const REGION = { member: 'orders.region', operator: 'equals', values: ['North'] };

describe('Invert marking on one tile (AC-115)', () => {
  it('marks the tile’s unmarked items, unmarks its marked ones, keeps another tile’s', () => {
    const { predicate, refused } = invertTileItems(MARKED, 't1', TILE);
    expect(predicate.items).toEqual([
      category('Instruments'),
      status('completed'),
      status('processing'),
    ]);
    expect(refused).toBe(0);
  });

  it('keeps an invert to the 1,000-item cap, and says so (AC-102)', () => {
    const many = Array.from({ length: MARKING_ITEM_LIMIT + 5 }, (_, at) =>
      status(`s${String(at)}`),
    );
    const inverted = invertTileItems({ items: [], ranges: [] }, 't1', many);
    expect(inverted.predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
    expect(inverted.refused).toBe(5);
    expect(inverted.message).toContain('at most 1,000 items');
  });

  it('inverts a tile marked whole to none of it, another tile’s kept', () => {
    const whole = markAllOfTile(MARKED, 't1', [REGION], TILE).predicate;
    const { predicate } = invertTileItems(whole, 't1', TILE);
    expect(predicate).toEqual({ items: [category('Instruments')], ranges: [], wholes: [] });
  });
});

describe('Mark all on one tile, stored as its filter (AC-115, AC-102)', () => {
  it('stores the tile’s filter and its count, not a list; another tile’s kept', () => {
    const { predicate, refused } = markAllOfTile(MARKED, 't1', [REGION], TILE);
    expect(predicate.items).toEqual([category('Instruments')]);
    expect(predicate.wholes).toEqual([{ tileId: 't1', filters: [REGION], count: 3 }]);
    expect(markedCount(predicate)).toBe(4);
    expect(refused).toBe(0);
  });

  it('is never refused, and stores no list past the cap', () => {
    const many = Array.from({ length: MARKING_ITEM_LIMIT + 5 }, (_, at) =>
      status(`s${String(at)}`),
    );
    const { predicate, refused } = markAllOfTile({ items: [], ranges: [] }, 't1', [], many);
    expect(refused).toBe(0);
    expect(predicate.items).toHaveLength(0);
    expect(markedCount(predicate)).toBe(MARKING_ITEM_LIMIT + 5);
    expect(isEmptyPredicate(predicate)).toBe(false);
  });

  it('marks every row its filter passes, and a tile with no filter marks every row', () => {
    const regional = markAllOfTile({ items: [], ranges: [] }, 't1', [REGION], TILE).predicate;
    expect(matchesPredicate(regional, { 'orders.region': 'North', 'orders.status': 'x' })).toBe(
      true,
    );
    expect(matchesPredicate(regional, { 'orders.region': 'South' })).toBe(false);
    // A row that does not carry the member cannot be said to pass.
    expect(matchesPredicate(regional, { 'orders.status': 'x' })).toBe(false);
    const everything = markAllOfTile({ items: [], ranges: [] }, 't1', [], TILE).predicate;
    expect(matchesPredicate(everything, { 'products.category': 'Components' })).toBe(true);
  });

  it('limits another tile by the filter; a whole tile unfiltered limits nothing', () => {
    const regional = markAllOfTile(MARKED, 't1', [REGION], TILE).predicate;
    // In the canonical order every limit is written in (AC-105).
    expect(limitFilterFor([regional], 'all')).toEqual({
      or: [REGION, { member: 'products.category', operator: 'equals', values: ['Instruments'] }],
    });
    const everything = markAllOfTile(MARKED, 't1', [], TILE).predicate;
    expect(limitFilterFor([everything], 'all')).toBeUndefined();
    // Any of two markings, one of them everything: everything.
    expect(
      limitFilterFor([everything, { items: [status('x')], ranges: [] }], 'any'),
    ).toBeUndefined();
    expect(limitFilterFor([everything, { items: [status('x')], ranges: [] }], 'all')).toEqual({
      member: 'orders.status',
      operator: 'equals',
      values: ['x'],
    });
  });

  it('turns a whole tile back into its items to toggle one, within the cap', () => {
    const whole = markAllOfTile(MARKED, 't1', [REGION], TILE).predicate;
    const { predicate } = expandWholeTile(whole, 't1', TILE);
    expect(predicate.wholes).toEqual([]);
    expect(predicate.items).toEqual([category('Instruments'), ...TILE]);
    // A tile not marked whole is left as it is.
    expect(expandWholeTile(MARKED, 't1', TILE).predicate).toBe(MARKED);
  });
});
