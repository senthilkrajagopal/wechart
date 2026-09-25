import { describe, expect, it } from 'vitest';

import { markFilterFrom, markFilterLabel } from './filterToMarked';

/**
 * T119 / AC-113: the filter bar's record of a marking turned into a filter —
 * what it holds and how it reads. Its Cube filter is `markedFilter`'s
 * (`core/src/markings/filterToMarked.test.ts`); the e2e shows the rows.
 */
const shipped = {
  items: [[{ member: 'orders.status', value: 'shipped' }]],
  ranges: [],
};

describe('a filter made from a marking', () => {
  it('holds the marking as a filter, the members it names, and reads as what it keeps', () => {
    const made = markFilterFrom(shipped, false, {
      id: 'f1',
      markingName: 'Marking',
      summary: 'Status: shipped',
    });

    expect(made).toEqual({
      id: 'f1',
      negate: false,
      markingName: 'Marking',
      summary: 'Status: shipped',
      filter: { member: 'orders.status', operator: 'equals', values: ['shipped'] },
      members: ['orders.status'],
    });
    if ('refused' in made) throw new Error('refused');
    expect(markFilterLabel(made)).toBe('Filtered to Marking: Status: shipped');
  });

  it('reads as what it leaves out when it is the negation', () => {
    const made = markFilterFrom(shipped, true, {
      id: 'f2',
      markingName: 'Marking',
      summary: 'Status: shipped',
    });
    if ('refused' in made) throw new Error('refused');

    expect(made.filter).toEqual({
      member: 'orders.status',
      operator: 'notEquals',
      values: ['shipped'],
    });
    expect(markFilterLabel(made)).toBe('Filtered out Marking: Status: shipped');
  });

  it('passes on why nothing marked makes no filter', () => {
    expect(
      markFilterFrom({ items: [], ranges: [] }, false, {
        id: 'f3',
        markingName: 'Marking',
        summary: '',
      }),
    ).toEqual({ refused: 'Nothing is marked.' });
  });
});
