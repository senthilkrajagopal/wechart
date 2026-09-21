import { describe, expect, it } from 'vitest';

import { MARKING_ITEM_LIMIT, addItemsWithinLimit, markAll } from './limit';
import { EMPTY_PREDICATE, withItem, type MarkedItem } from './predicate';

/**
 * T108 / AC-102: IF a marking would exceed 1,000 items, THEN THE SYSTEM SHALL
 * refuse the additional items and explain the limit; "Mark all" SHALL be
 * exempt because it stores the tile's filter rather than a list.
 * `Fails when: a marking exceeds 1,000 stored items, or "Mark all" is
 * refused.`
 *
 * The exemption is the whole design, not a special case bolted on. Everything
 * else here enumerates: a lasso over ten thousand points stores ten thousand
 * tuples, and the limit exists because that has to be persisted, compared and
 * sent to Cube. "Mark all" enumerates nothing — it stores the predicate the
 * tile is already filtered by — so there is no list to be too long. Refusing
 * it would be refusing the one operation the limit was never about.
 */
const item = (n: number): MarkedItem => [{ member: 'orders.id', value: n }];

const many = (count: number) => Array.from({ length: count }, (_, index) => item(index));

const full = () => ({ ...EMPTY_PREDICATE, items: many(MARKING_ITEM_LIMIT) });

describe('the item limit', () => {
  it('is the figure the spec names', () => {
    expect(MARKING_ITEM_LIMIT).toBe(1000);
  });

  it('accepts items up to the limit', () => {
    const result = addItemsWithinLimit(EMPTY_PREDICATE, many(MARKING_ITEM_LIMIT));

    expect(result.predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
    expect(result.refused).toBe(0);
  });

  it('refuses the ones past it rather than the whole gesture', () => {
    /**
     * A lasso over 1,050 points is a reasonable thing to do and mostly
     * succeeds. Dropping all 1,050 because fifty are too many would punish
     * the user for the size of the data, and leave them with nothing marked
     * and no idea why.
     */
    const result = addItemsWithinLimit(EMPTY_PREDICATE, many(MARKING_ITEM_LIMIT + 50));

    expect(result.predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
    expect(result.refused).toBe(50);
  });

  it('explains the limit rather than failing silently', () => {
    // "and explain the limit": a marking that quietly held fewer items than
    // the user selected would be wrong in a way nothing on screen admits.
    const result = addItemsWithinLimit(EMPTY_PREDICATE, many(MARKING_ITEM_LIMIT + 50));

    expect(result.message).toContain('1,000');
    expect(result.message).toContain('50');
  });

  it('says nothing when nothing was refused', () => {
    expect(addItemsWithinLimit(EMPTY_PREDICATE, many(3)).message).toBeUndefined();
  });

  it('counts what is already marked, not just what is being added', () => {
    // The limit is on the marking, not on the gesture. Ten gestures of 200
    // would otherwise reach 2,000. The ids are deliberately past the ones
    // already marked — overlapping ones are skipped as duplicates, which is a
    // different rule and was the first version of this test's mistake.
    const fresh = Array.from({ length: 10 }, (_, index) => item(MARKING_ITEM_LIMIT + index));

    const result = addItemsWithinLimit(full(), fresh);

    expect(result.predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
    expect(result.refused).toBe(10);
  });

  it('does not count an item that is already marked twice', () => {
    // Re-adding something already in the marking is not growth, and counting
    // it would refuse items while leaving room unused.
    const before = withItem(EMPTY_PREDICATE, item(1));

    const result = addItemsWithinLimit(before, [item(1), item(2)]);

    expect(result.predicate.items).toHaveLength(2);
    expect(result.refused).toBe(0);
  });

  it('leaves the marking untouched when everything is refused', () => {
    const before = full();

    expect(addItemsWithinLimit(before, many(5)).predicate.items).toHaveLength(MARKING_ITEM_LIMIT);
  });
});

/**
 * **How much these prove, stated plainly.** The exemption is structural:
 * `markAll` takes a predicate and returns it, so there is no enumeration that
 * could reach the cap and no mutation that makes it refuse without changing
 * its signature. I tried routing it through `addItemsWithinLimit` and every
 * test stayed green, because adding nothing to anything refuses nothing.
 *
 * So these cases hold the *shape* of the exemption — that what is stored is
 * the filter and not a list — which is the thing a future version could get
 * wrong by enumerating the tile's rows and marking those instead.
 */
describe('"Mark all"', () => {
  const tileFilter = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'paid' }]);

  it('is never refused, however much the tile holds', () => {
    // The criterion's second failing state.
    const result = markAll(tileFilter);

    expect(result.refused).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it('stores the tile’s filter rather than a list of items', () => {
    /**
     * Which is *why* it is exempt. There is no enumeration to be too long:
     * the marking says "whatever this tile is showing", in the same predicate
     * language as everything else (AC-086), so it stays symbolic.
     */
    const result = markAll(tileFilter);

    expect(result.predicate).toEqual(tileFilter);
    expect(result.predicate.items.length).toBeLessThanOrEqual(1);
  });

  it('is exempt even from a tile whose filter is empty', () => {
    // An unfiltered tile shows everything, and "everything" is still one
    // predicate rather than a list of every row.
    const result = markAll(EMPTY_PREDICATE);

    expect(result.refused).toBe(0);
    expect(result.predicate).toEqual(EMPTY_PREDICATE);
  });

  it('replaces whatever was marked, as marking everything must', () => {
    const result = markAll(tileFilter);

    expect(result.predicate.items).toEqual(tileFilter.items);
  });
});
