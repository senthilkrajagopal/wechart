import { describe, expect, it } from 'vitest';

import { applyAxisRange, rangeFromDrag } from './range';
import { EMPTY_PREDICATE, matchesPredicate, withItem, withRange } from './predicate';

/**
 * T099 / AC-093: WHILE a marking is in range mode, THE SYSTEM SHALL let the
 * user drag along an axis to mark a continuous range, show it as a coloured
 * stripe on that axis, and keep its bounds when filters change.
 * `Fails when: the stripe does not appear, or the bounds move when a filter
 * changes.`
 *
 * The stability clause is the interesting one, and `references-markings.md`
 * quotes Spotfire on exactly why it is a clause at all: a marked range "does
 * not take active filtering and data limitations into consideration". A range
 * derived from what is currently in the result — the minimum and maximum on
 * screen, say — would silently rescale itself every time a filter changed, so
 * the same stripe would mean something different from one moment to the next.
 * Stored as two values on the axis, it means what it said.
 */
const rows = [
  { 'orders.count': 1, 'orders.status': 'paid' },
  { 'orders.count': 5, 'orders.status': 'shipped' },
  { 'orders.count': 9, 'orders.status': 'paid' },
];

describe('marking a range by dragging along an axis', () => {
  it('takes the bounds from where the drag began and ended', () => {
    const range = rangeFromDrag({ member: 'orders.count', from: 2, to: 8 });

    expect(range).toEqual({ member: 'orders.count', from: 2, to: 8 });
  });

  it('is the same range dragged in either direction', () => {
    // Dragging right to left is the same intention as left to right, and a
    // range that ended before it started would match nothing.
    expect(rangeFromDrag({ member: 'orders.count', from: 8, to: 2 })).toEqual({
      member: 'orders.count',
      from: 2,
      to: 8,
    });
  });

  it('keeps the granularity of a time axis, which is part of what was marked', () => {
    const range = rangeFromDrag({
      member: 'orders.created',
      granularity: 'day',
      from: '2026-03-05',
      to: '2026-03-01',
    });

    expect(range).toEqual({
      member: 'orders.created',
      granularity: 'day',
      from: '2026-03-01',
      to: '2026-03-05',
    });
  });

  describe('what the drag does to the marking', () => {
    it('replaces the marking on a plain drag', () => {
      const before = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'paid' }]);

      const after = applyAxisRange(
        before,
        rangeFromDrag({ member: 'orders.count', from: 2, to: 8 }),
        {
          add: false,
        },
      );

      expect(after.items).toEqual([]);
      expect(after.ranges).toHaveLength(1);
    });

    it('adds a range on a Ctrl-drag, keeping the ranges already marked', () => {
      // references-markings.md: "Ctrl+drag adds a range."
      const before = withRange(EMPTY_PREDICATE, { member: 'orders.count', from: 1, to: 2 });

      const after = applyAxisRange(
        before,
        rangeFromDrag({ member: 'orders.count', from: 8, to: 9 }),
        {
          add: true,
        },
      );

      expect(after.ranges).toHaveLength(2);
    });

    it('keeps marked items on a Ctrl-drag, because adding is not restarting', () => {
      const before = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'paid' }]);

      const after = applyAxisRange(
        before,
        rangeFromDrag({ member: 'orders.count', from: 8, to: 9 }),
        {
          add: true,
        },
      );

      expect(after.items).toHaveLength(1);
    });
  });

  describe('bounds that do not move when filters change', () => {
    const marked = applyAxisRange(
      EMPTY_PREDICATE,
      rangeFromDrag({ member: 'orders.count', from: 2, to: 8 }),
      { add: false },
    );

    it('marks what falls inside it', () => {
      expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual([rows[1]]);
    });

    it('holds the same bounds after the result changes underneath it', () => {
      /**
       * The criterion's failing state. A range taken from the extent of the
       * data on screen would rescale here — the same stripe would cover a
       * different span of values after every filter change, and a user
       * comparing two moments would be comparing two different questions.
       */
      const filtered = rows.filter((row) => row['orders.status'] === 'paid');

      expect(marked.ranges[0]).toEqual({ member: 'orders.count', from: 2, to: 8 });
      // And it still marks by value: nothing in the filtered set falls inside.
      expect(filtered.filter((row) => matchesPredicate(marked, row))).toEqual([]);
    });

    it('marks the row again when the filter that hid it is lifted', () => {
      // The row was never unmarked, only absent. A range that had rescaled to
      // the filtered data would not find it again.
      expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual([rows[1]]);
    });
  });
});
