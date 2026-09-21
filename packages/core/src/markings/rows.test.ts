import { describe, expect, it } from 'vitest';

import { itemForRow, markRowClick, rowsMarkable } from './rows';
import { matchesPredicate } from './predicate';

/**
 * T098 / AC-092: WHEN the user clicks a row in a table tile, THE SYSTEM SHALL
 * mark it; Shift-click SHALL mark the range from the anchor row; and rows
 * SHALL be markable only when the cube's primary key is available.
 * `Fails when: Shift-click marks a single row, or rows are markable without a
 * primary key.`
 *
 * The primary-key clause is the one worth understanding rather than just
 * implementing. `references-markings.md` quotes Spotfire — "A primary key is
 * required to know which rows to mark" — and it is the same reasoning as
 * AC-086: a marking is a predicate over members, never a position in a result.
 * Without a key there is no combination of members that names *this* row
 * rather than every row that looks like it. Marking approximately would be
 * worse than refusing, because nothing would tell the user which they got.
 */
const rows = [
  { 'orders.id': 1, 'orders.status': 'paid' },
  { 'orders.id': 2, 'orders.status': 'paid' },
  { 'orders.id': 3, 'orders.status': 'shipped' },
  { 'orders.id': 4, 'orders.status': 'paid' },
];

const withKey = { shift: false, anchor: null, primaryKey: 'orders.id' };
const marked = (predicate: Parameters<typeof matchesPredicate>[0]) =>
  rows.filter((row) => matchesPredicate(predicate, row)).map((row) => row['orders.id']);

describe('marking rows in a table', () => {
  describe('whether they can be marked at all', () => {
    it('can when the cube has a primary key', () => {
      expect(rowsMarkable('orders.id')).toBe(true);
    });

    it('cannot when it has none', () => {
      expect(rowsMarkable(undefined)).toBe(false);
      expect(rowsMarkable('')).toBe(false);
    });

    it('marks nothing when the key is present but empty', () => {
      /**
       * `rowsMarkable('')` was tested, and the click path was not — so a
       * version that only checked for `undefined` passed every test here while
       * marking on a member with no name, which `predicateProblems` would
       * later reject as "a tuple with no member". Found by mutation, not by
       * reading.
       */
      const result = markRowClick(rows, 1, { shift: false, anchor: null, primaryKey: '' });

      expect(result.predicate.items).toEqual([]);
      expect(result.anchor).toBeNull();
    });

    it('marks nothing on a click when there is no key', () => {
      // The criterion's second failing state. Not an error and not a partial
      // marking: without a key there is nothing that names one row.
      const result = markRowClick(rows, 1, { shift: false, anchor: null, primaryKey: undefined });

      expect(result.predicate.items).toEqual([]);
      expect(result.anchor).toBeNull();
    });
  });

  describe('a plain click', () => {
    it('marks the row it was on', () => {
      const result = markRowClick(rows, 1, withKey);

      expect(marked(result.predicate)).toEqual([2]);
    });

    it('names the row by its key, so two rows that look alike stay apart', () => {
      // Rows 1, 2 and 4 all read "paid". Marked by anything but the key they
      // would be indistinguishable.
      const result = markRowClick(rows, 1, withKey);

      expect(result.predicate.items).toEqual([itemForRow(rows[1] as never, 'orders.id')]);
      expect(marked(result.predicate)).not.toContain(1);
    });

    it('becomes the anchor for the next Shift-click', () => {
      expect(markRowClick(rows, 2, withKey).anchor).toBe(2);
    });

    it('replaces what was marked before', () => {
      const first = markRowClick(rows, 0, withKey);
      const second = markRowClick(rows, 3, { ...withKey, anchor: first.anchor });

      expect(marked(second.predicate)).toEqual([4]);
    });
  });

  describe('a Shift-click', () => {
    it('marks every row from the anchor to here, not one of them', () => {
      // The criterion's first failing state, stated directly.
      const result = markRowClick(rows, 3, { ...withKey, shift: true, anchor: 1 });

      expect(marked(result.predicate)).toEqual([2, 3, 4]);
    });

    it('includes both ends', () => {
      const result = markRowClick(rows, 2, { ...withKey, shift: true, anchor: 1 });

      expect(marked(result.predicate)).toEqual([2, 3]);
    });

    it('works upwards as well as downwards', () => {
      // Shift-clicking above the anchor is the same request in the other
      // direction; a range that only ran forwards would mark nothing here.
      const result = markRowClick(rows, 0, { ...withKey, shift: true, anchor: 2 });

      expect(marked(result.predicate)).toEqual([1, 2, 3]);
    });

    it('keeps the anchor where it was, so the range can be adjusted', () => {
      /**
       * A second Shift-click grows or shrinks the same range rather than
       * starting a new one from wherever the last ended. Moving the anchor
       * would make the gesture unable to shrink a range at all.
       */
      const first = markRowClick(rows, 3, { ...withKey, shift: true, anchor: 1 });
      expect(first.anchor).toBe(1);

      const second = markRowClick(rows, 2, { ...withKey, shift: true, anchor: first.anchor });
      expect(marked(second.predicate)).toEqual([2, 3]);
    });

    it('marks just the row when there is no anchor yet', () => {
      // Shift-clicking first, before anything was marked, has no range to
      // describe. Marking the row is the reading that loses nothing.
      const result = markRowClick(rows, 2, { ...withKey, shift: true, anchor: null });

      expect(marked(result.predicate)).toEqual([3]);
    });

    it('marks nothing when there is no key, Shift or not', () => {
      const result = markRowClick(rows, 3, { shift: true, anchor: 1, primaryKey: undefined });

      expect(result.predicate.items).toEqual([]);
    });
  });

  it('marks in display order, which is the order the user is pointing at', () => {
    /**
     * The same two rows in a differently sorted table enclose a different set,
     * and that is correct: Shift-click is a statement about what is on screen
     * between two points, not about key values between two numbers.
     */
    const resorted = [...rows].reverse();

    const result = markRowClick(resorted, 2, { ...withKey, shift: true, anchor: 0 });

    expect(marked(result.predicate).sort()).toEqual([2, 3, 4]);
  });
});
