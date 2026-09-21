import { describe, expect, it } from 'vitest';

import { limitRowsBy, limitingMarkings } from './limit-by';
import { EMPTY_PREDICATE, withItem } from './predicate';

/**
 * T113 / AC-107: WHEN a tile is limited by one or more markings, THE SYSTEM
 * SHALL restrict its query to those markings, combined as All markings (AND)
 * or Any marking (OR) according to its setting, and SHALL skip markings that
 * are empty (direction.md rule 33).
 * `Fails when: a tile limited by two markings with one empty returns no rows,
 * or OR behaves as AND.`
 *
 * **The skip-empty rule is ours, and direction.md says so**: "Proposed rule,
 * not from Spotfire's docs: empty markings are skipped when combining. The
 * nothing-marked state applies only when every limiting marking is empty."
 *
 * It matters because the naive reading is catastrophic under AND. A details
 * tile limited by two markings, where the user has only marked in one of them,
 * would intersect against an empty set and show nothing — so the tile would go
 * blank exactly when the user had just started working, and the fix would look
 * like "mark something in the other tile too", which is not a thing anyone
 * would guess.
 */
const rows = [
  { 'orders.status': 'paid', 'orders.region': 'east' },
  { 'orders.status': 'paid', 'orders.region': 'west' },
  { 'orders.status': 'shipped', 'orders.region': 'east' },
];

const paid = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'paid' }]);
const east = withItem(EMPTY_PREDICATE, [{ member: 'orders.region', value: 'east' }]);

describe('which markings actually limit a tile', () => {
  it('keeps the ones that hold something', () => {
    expect(limitingMarkings([paid, east])).toHaveLength(2);
  });

  it('skips the empty ones', () => {
    // The rule direction.md proposes, in one line.
    expect(limitingMarkings([paid, EMPTY_PREDICATE])).toEqual([paid]);
  });

  it('is empty only when every one of them is empty', () => {
    // Which is exactly when the "nothing marked" state applies — and not
    // before.
    expect(limitingMarkings([EMPTY_PREDICATE, EMPTY_PREDICATE])).toEqual([]);
  });
});

describe('limiting a tile’s rows', () => {
  describe('with All markings (AND)', () => {
    it('returns the rows every marking holds', () => {
      const limited = limitRowsBy(rows, [paid, east], 'all');

      expect(limited).toEqual([rows[0]]);
    });

    it('returns the non-empty marking’s rows when the other is empty', () => {
      /**
       * The criterion's first failing state, and the reason the skip rule
       * exists. Intersecting against an empty set would return nothing, so a
       * details tile would go blank the moment someone marked in one master
       * tile and not the other.
       */
      const limited = limitRowsBy(rows, [paid, EMPTY_PREDICATE], 'all');

      expect(limited).toEqual([rows[0], rows[1]]);
    });
  });

  describe('with Any marking (OR)', () => {
    it('returns the union, not the intersection', () => {
      // The criterion's second failing state. With AND these two markings give
      // one row; with OR they give three, so the two are never confusable in
      // this fixture.
      const limited = limitRowsBy(rows, [paid, east], 'any');

      expect(limited).toEqual(rows);
    });

    it('skips empty markings here too', () => {
      const limited = limitRowsBy(rows, [east, EMPTY_PREDICATE], 'any');

      expect(limited).toEqual([rows[0], rows[2]]);
    });
  });

  describe('when nothing is marked anywhere', () => {
    it('returns every row, leaving the empty state to the caller', () => {
      /**
       * Not zero rows. What a tile *shows* when no master has anything marked
       * is a per-tile setting — All data, an empty visualisation, or a message,
       * with the message the default (AC-109's) — so this returns the
       * unrestricted rows and lets that setting decide. Returning nothing here
       * would make "All data" impossible to implement.
       */
      expect(limitRowsBy(rows, [EMPTY_PREDICATE], 'all')).toEqual(rows);
      expect(limitRowsBy(rows, [], 'any')).toEqual(rows);
    });
  });

  it('does not reorder the rows it keeps', () => {
    // The tile's own sort is the tile's business; a limit that shuffled rows
    // would silently override it.
    const limited = limitRowsBy(rows, [paid], 'any');

    expect(limited).toEqual([rows[0], rows[1]]);
  });

  it('returns the rows themselves, not copies', () => {
    // Identity is what lets a renderer tell whether a row changed. Copying
    // would make every limited row look new on every marking change.
    const limited = limitRowsBy(rows, [east], 'all');

    expect(limited[0]).toBe(rows[0]);
  });
});
