import { describe, expect, it } from 'vitest';

import { markingApplicability } from './applicability';
import { expandWholeTile, invertTileItems, markAllOfTile, MARKING_ITEM_LIMIT } from './limit';
import {
  isEmptyPredicate,
  markedCount,
  markingMembers,
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

const EMPTY: MarkingPredicate = { items: [], ranges: [] };

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
    // Filtered, every item is kept: shipped may have been marked everywhere.
    expect(predicate.items).toEqual([status('shipped'), category('Instruments')]);
    expect(predicate.wholes).toEqual([{ tileId: 't1', filters: [REGION], count: 3 }]);
    expect(markedCount(predicate)).toBe(5);
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
      or: [
        REGION,
        { member: 'orders.status', operator: 'equals', values: ['shipped'] },
        { member: 'products.category', operator: 'equals', values: ['Instruments'] },
      ],
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

  it('keeps another tile’s items when the tile is filtered; unfiltered, its own go into the whole', () => {
    // Filtered: a status item another tile marked across every region is
    // wider than this tile's North, so it stays (T121's third review).
    const regional = markAllOfTile(MARKED, 't1', [REGION], TILE, 'orders.status').predicate;
    expect(regional.items).toEqual(MARKED.items);
    // Unfiltered: every row, which holds them all.
    const everything = markAllOfTile(MARKED, 't1', [], TILE, 'orders.status').predicate;
    expect(everything.items).toEqual([category('Instruments')]);
    expect(everything.wholes?.[0]?.member).toBe('orders.status');
  });

  it('names a whole tile’s member and its filters’ among the marking’s members (AC-103)', () => {
    const whole = markAllOfTile(EMPTY, 't1', [REGION], TILE, 'orders.status').predicate;
    expect(markingMembers(whole)).toEqual(['orders.status', 'orders.region']);
    expect(markingApplicability(whole, ['orders.status']).linked).toBe(false);
  });

  it('inverts no item another tile’s whole already marks (T121’s third review)', () => {
    const everything = markAllOfTile(EMPTY, 't0', [], [status('x')], 'orders.status').predicate;
    const { predicate } = invertTileItems(everything, 't1', [category('Components')]);
    // Drawn as marked already, by the whole: not added as an item as well.
    expect(predicate.items).toEqual([]);
    expect(predicate.wholes).toHaveLength(1);
  });

  it('reads a whole’s filters as Cube does: case-insensitive matches, NULL passing no comparison', () => {
    const marked = (filter: Record<string, unknown>, row: Record<string, unknown>) =>
      matchesPredicate(markAllOfTile(EMPTY, 't1', [filter], TILE, 'm').predicate, row);
    const on = (operator: string, values: unknown[]) => ({ member: 'x', operator, values });
    expect(marked(on('startsWith', ['NO']), { x: 'North' })).toBe(true);
    expect(marked(on('endsWith', ['TH']), { x: 'North' })).toBe(true);
    expect(marked(on('notStartsWith', ['no']), { x: 'North' })).toBe(false);
    expect(marked(on('notEndsWith', ['xx']), { x: 'North' })).toBe(true);
    expect(marked(on('lte', ['100']), { x: null })).toBe(false);
    expect(marked(on('gt', ['1']), { x: '2' })).toBe(true);
    expect(marked(on('beforeOrOnDate', ['2026-09-01']), { x: '2026-09-01T00:00:00.000' })).toBe(
      true,
    );
    expect(marked(on('afterOrOnDate', ['2026-09-02']), { x: '2026-09-01T00:00:00.000' })).toBe(
      false,
    );
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
