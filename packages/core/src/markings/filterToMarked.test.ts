import { describe, expect, it } from 'vitest';

import { markedFilter, negatedFilter } from './query';
import { EMPTY_PREDICATE, type MarkingPredicate } from './predicate';

/**
 * T119 / AC-113: WHEN the user chooses "Filter to marked" or "Filter out
 * marked", THE SYSTEM SHALL create a removable dashboard filter equivalent to
 * the marking's predicate, or its negation, and then clear the marking.
 * `Fails when: the filter is not removable, the marking survives, or the rows
 * kept differ from the marked rows.`
 *
 * This is the "equivalent" half: the Cube filter a marking becomes, and its
 * negation. Cube has no `not`, so "Filter out" is De Morgan over the filter
 * tree (`markings-query-support.md` §1.7). The negations keep exactly the rows
 * that were not marked, NULLs included: `notEquals` keeps NULL rows of its own
 * accord (§1.5), while `notInDateRange` and a numeric bound drop them, so
 * those take `notSet` beside them — a NULL row was never marked, and filtering
 * out the marked rows must not take it away.
 */
const shippedOrCompleted: MarkingPredicate = {
  items: [
    [{ member: 'orders.status', value: 'shipped' }],
    [{ member: 'orders.status', value: 'completed' }],
  ],
  ranges: [],
};

describe('a marking as a filter', () => {
  it('filters to the marked values of one member', () => {
    expect(markedFilter(shippedOrCompleted, false)).toEqual({
      filter: { member: 'orders.status', operator: 'equals', values: ['completed', 'shipped'] },
    });
  });

  it('filters out the marked values, keeping the rows with none', () => {
    expect(markedFilter(shippedOrCompleted, true)).toEqual({
      filter: { member: 'orders.status', operator: 'notEquals', values: ['completed', 'shipped'] },
    });
  });

  it('filters out items of two members as NOT (a AND b), by De Morgan', () => {
    const pair: MarkingPredicate = {
      items: [
        [
          { member: 'orders.status', value: 'shipped' },
          { member: 'products.category', value: 'Instruments' },
        ],
      ],
      ranges: [],
    };

    expect(markedFilter(pair, true)).toEqual({
      filter: {
        or: [
          { member: 'orders.status', operator: 'notEquals', values: ['shipped'] },
          { member: 'products.category', operator: 'notEquals', values: ['Instruments'] },
        ],
      },
    });
  });

  it('keeps NULL-dated rows when a time bucket is filtered out', () => {
    const march: MarkingPredicate = {
      items: [
        [{ member: 'orders.ordered_at', granularity: 'month', value: '2026-03-01T00:00:00.000' }],
      ],
      ranges: [],
    };

    expect(markedFilter(march, true)).toEqual({
      filter: {
        or: [
          {
            member: 'orders.ordered_at',
            operator: 'notInDateRange',
            values: ['2026-03-01T00:00:00.000', '2026-03-31T23:59:59.999'],
          },
          { member: 'orders.ordered_at', operator: 'notSet' },
        ],
      },
    });
  });

  it('filters out a marked NULL as the rows that have a value', () => {
    const blank: MarkingPredicate = {
      items: [[{ member: 'orders.status', value: null }]],
      ranges: [],
    };

    expect(markedFilter(blank, true)).toEqual({
      filter: { member: 'orders.status', operator: 'set' },
    });
  });

  it('filters out a numeric range as below it, above it, or blank', () => {
    const amounts: MarkingPredicate = {
      items: [],
      ranges: [{ member: 'orders.amount', from: 10, to: 20 }],
    };

    expect(markedFilter(amounts, true)).toEqual({
      filter: {
        or: [
          {
            or: [
              { member: 'orders.amount', operator: 'lt', values: ['10'] },
              { member: 'orders.amount', operator: 'notSet' },
            ],
          },
          {
            or: [
              { member: 'orders.amount', operator: 'gt', values: ['20'] },
              { member: 'orders.amount', operator: 'notSet' },
            ],
          },
        ],
      },
    });
  });

  it('refuses with a reason when nothing is marked', () => {
    expect(markedFilter(EMPTY_PREDICATE, false)).toEqual({ refused: 'Nothing is marked.' });
  });

  it('refuses to filter out a marking of every row, which would leave nothing', () => {
    const everything: MarkingPredicate = {
      items: [],
      ranges: [],
      wholes: [{ tileId: 't1', filters: [], count: 3 }],
    };

    // Said to be every row, so the marked rows can be shown as the tile's
    // own (T120's review).
    expect(markedFilter(everything, true)).toEqual({
      refused: 'Every row is marked, so filtering the marked rows out would leave nothing.',
      everything: true,
    });
    // Filtering to it keeps every row: no filter at all, said so.
    expect(markedFilter(everything, false)).toEqual({
      refused: 'Every row is marked, so filtering to the marked rows would change nothing.',
      everything: true,
    });
  });
});

describe('negating a Cube filter', () => {
  it('swaps and and or, and each operator for its complement', () => {
    expect(
      negatedFilter({
        and: [
          { member: 'a.x', operator: 'equals', values: ['1'] },
          { member: 'a.y', operator: 'contains', values: ['z'] },
        ],
      }),
    ).toEqual({
      or: [
        { member: 'a.x', operator: 'notEquals', values: ['1'] },
        // `notContains` keeps NULL rows of its own accord (research §1.5).
        { member: 'a.y', operator: 'notContains', values: ['z'] },
      ],
    });
  });

  it('negates notContains to contains, which the research says kept NULLs', () => {
    expect(negatedFilter({ member: 'a.y', operator: 'notContains', values: ['z'] })).toEqual({
      member: 'a.y',
      operator: 'contains',
      values: ['z'],
    });
  });

  it('is undefined for an operator it cannot negate, so the action can be refused', () => {
    expect(negatedFilter({ member: 'a.x', operator: 'measureFilter' })).toBeUndefined();
    // Whether these keep NULL rows is not researched, so their complement is unknown.
    expect(
      negatedFilter({ member: 'a.x', operator: 'notStartsWith', values: ['z'] }),
    ).toBeUndefined();
  });
});
