import { describe, expect, it } from 'vitest';

import {
  EMPTY_PREDICATE,
  isEmptyPredicate,
  matchesPredicate,
  predicateProblems,
  withItem,
  withRange,
  type MarkedItem,
} from './predicate';

/**
 * T092 / AC-086: THE SYSTEM SHALL store a marking only as a predicate over
 * Cube dimension members — tuples of member, granularity and value, or bounded
 * ranges — and never as row numbers or result positions (direction.md rule 46).
 * `Fails when: a stored marking references a row index or a position in a
 * result set.`
 *
 * The criterion is not a style preference. `references-markings.md`: "In-memory
 * row indexes don't exist behind Cube", which is why Spotfire itself marks
 * symbolically for every in-database table. A marking stored as "rows 3, 7 and
 * 12" means nothing the moment the query is re-run with a different sort, a
 * different filter, or simply later — it would silently mark whatever now
 * happens to sit in those positions.
 *
 * **How much of that these tests actually prove, stated plainly.** Position
 * independence is structural, not behavioural: `matchesPredicate` is handed a
 * row and never an index, so there is no position for it to match on, and the
 * reorder and refilter cases below cannot fail while that signature holds. I
 * tried to mutate a positional implementation into place to check them and
 * could not — the type would not allow it. They are kept because they state
 * the guarantee the criterion is about, and they would catch a future version
 * that took an index; they are not evidence that it is currently absent.
 *
 * What the tests do pin, mutation-verified: a marked item is a *conjunction*
 * (matching any one member instead of all of them fails five cases), several
 * marked items are alternatives, ranges include both bounds, and a stored
 * predicate with an empty tuple — which would mark every row on the dashboard
 * — is rejected.
 */
const paid: MarkedItem = [
  { member: 'orders.status', value: 'paid' },
  { member: 'orders.category', value: 'Components' },
];

const shipped: MarkedItem = [
  { member: 'orders.status', value: 'shipped' },
  { member: 'orders.category', value: 'Instruments' },
];

const rows = [
  { 'orders.status': 'paid', 'orders.category': 'Components', 'orders.count': 3 },
  { 'orders.status': 'shipped', 'orders.category': 'Instruments', 'orders.count': 5 },
  { 'orders.status': 'paid', 'orders.category': 'Instruments', 'orders.count': 8 },
];

describe('what a marking stores', () => {
  it('marks nothing to begin with', () => {
    expect(isEmptyPredicate(EMPTY_PREDICATE)).toBe(true);
    expect(rows.filter((row) => matchesPredicate(EMPTY_PREDICATE, row))).toEqual([]);
  });

  it('holds the member and value of what was marked, not where it was', () => {
    const marked = withItem(EMPTY_PREDICATE, paid);

    expect(marked.items).toEqual([paid]);
    // Every key in the stored shape names a member or a value. Nothing in it
    // could be read as an index or an offset.
    expect(JSON.stringify(marked)).not.toMatch(/index|position|rowNumber|offset/i);
  });

  it('matches the row it was made from', () => {
    const marked = withItem(EMPTY_PREDICATE, paid);

    expect(matchesPredicate(marked, rows[0])).toBe(true);
  });

  it('does not match a row that differs in any one member', () => {
    // The tuple is a conjunction: "paid" alone is not what was clicked, and a
    // marking that matched it would spread across the dashboard.
    const marked = withItem(EMPTY_PREDICATE, paid);

    expect(matchesPredicate(marked, rows[2])).toBe(false);
  });

  it('matches any of several marked items', () => {
    const marked = withItem(withItem(EMPTY_PREDICATE, paid), shipped);

    expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual([rows[0], rows[1]]);
  });

  it('still marks the same items after the result is reordered', () => {
    /**
     * The criterion's whole point — same query, different sort, which a user
     * can do to a tile at any time. True by construction today (see the note
     * at the top): this states the guarantee and guards the day someone
     * reaches for an index.
     */
    const marked = withItem(EMPTY_PREDICATE, paid);
    const resorted = [...rows].reverse();

    const before = rows.filter((row) => matchesPredicate(marked, row));
    const after = resorted.filter((row) => matchesPredicate(marked, row));

    expect(after).toEqual(before);
  });

  it('still marks the same item after rows around it disappear', () => {
    // A filter changes which rows come back and what position each has. A
    // marking must survive that, or every filter change silently re-marks.
    const marked = withItem(EMPTY_PREDICATE, shipped);
    const filtered = rows.filter((row) => row['orders.category'] === 'Instruments');

    expect(filtered.filter((row) => matchesPredicate(marked, row))).toEqual([rows[1]]);
  });

  it('marks nothing when the marked item is no longer in the result', () => {
    // Not an error: the item may return when the filter changes back. What it
    // must not do is mark whatever took its place.
    const marked = withItem(EMPTY_PREDICATE, paid);
    const elsewhere = rows.filter((row) => row['orders.status'] === 'shipped');

    expect(elsewhere.filter((row) => matchesPredicate(marked, row))).toEqual([]);
  });

  describe('bounded ranges', () => {
    const byDay = [
      { 'orders.created': '2026-03-01', 'orders.count': 1 },
      { 'orders.created': '2026-03-05', 'orders.count': 2 },
      { 'orders.created': '2026-03-20', 'orders.count': 3 },
    ];

    it('marks what falls inside, bounds included', () => {
      // Spotfire's range-based marking, which the references keep because
      // "bounds are symbolic" — the same reason the tuples are.
      const marked = withRange(EMPTY_PREDICATE, {
        member: 'orders.created',
        granularity: 'day',
        from: '2026-03-01',
        to: '2026-03-05',
      });

      expect(byDay.filter((row) => matchesPredicate(marked, row))).toEqual([byDay[0], byDay[1]]);
    });

    it('marks numbers by value, not by their place in the result', () => {
      const marked = withRange(EMPTY_PREDICATE, { member: 'orders.count', from: 2, to: 3 });

      expect(byDay.filter((row) => matchesPredicate(marked, row))).toEqual([byDay[1], byDay[2]]);
    });

    it('marks the union of its items and its ranges', () => {
      const marked = withRange(withItem(EMPTY_PREDICATE, paid), {
        member: 'orders.count',
        from: 5,
        to: 5,
      });

      expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual([rows[0], rows[1]]);
    });
  });

  describe('what a stored predicate may not be', () => {
    it('rejects a tuple naming no member', () => {
      expect(predicateProblems({ items: [[{ member: '', value: 'paid' }]], ranges: [] })).toContain(
        'a tuple with no member',
      );
    });

    it('rejects a range with no bounds', () => {
      expect(
        predicateProblems({
          items: [],
          ranges: [{ member: 'orders.count' } as never],
        }),
      ).toContain('a range with no bounds');
    });

    it('rejects a range whose bounds are the wrong way round', () => {
      expect(
        predicateProblems({ items: [], ranges: [{ member: 'orders.count', from: 9, to: 2 }] }),
      ).toContain('a range that ends before it starts');
    });

    it('rejects an empty tuple, which would match every row', () => {
      // A conjunction of nothing is true, so this would mark the entire
      // dashboard — the most damaging shape a stored marking can take.
      expect(predicateProblems({ items: [[]], ranges: [] })).toContain('a tuple with no members');
    });

    it('finds nothing wrong with a predicate this module built', () => {
      // The positive control: every case above asserts a problem is found, so
      // a function that always complained would satisfy all of them.
      expect(predicateProblems(withItem(EMPTY_PREDICATE, paid))).toEqual([]);
      expect(predicateProblems(EMPTY_PREDICATE)).toEqual([]);
    });
  });
});
