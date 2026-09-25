import { describe, expect, it } from 'vitest';

import { markFilterFrom, markFilterLabel, markFilterOn } from './filterToMarked';

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

describe('a filter made from a marking, as one tile is asked it (AC-113, AC-079)', () => {
  const two = {
    items: [
      [
        { member: 'orders.status', value: 'shipped' },
        { member: 'products.category', value: 'Toys' },
      ],
    ],
    ranges: [],
  };
  const made = markFilterFrom(two, false, { id: 'f4', markingName: 'Marking', summary: 's' });
  if ('refused' in made) throw new Error('made no filter');

  it('names each member as the tile’s view takes it', () => {
    const aliases: Record<string, string> = {
      'orders.status': 'order_summary.status',
      'products.category': 'order_summary.category',
    };
    expect(markFilterOn(made, (member) => aliases[member])).toEqual({
      filter: {
        and: [
          { member: 'order_summary.status', operator: 'equals', values: ['shipped'] },
          { member: 'order_summary.category', operator: 'equals', values: ['Toys'] },
        ],
      },
    });
  });

  it('keeps a member the model cannot say about as it is, for Cube to answer', () => {
    expect(markFilterOn(made, () => undefined)).toEqual({ filter: made.filter });
  });

  it('names the member the tile cannot reach, and asks nothing', () => {
    expect(
      markFilterOn(made, (member) => (member === 'products.category' ? false : member)),
    ).toEqual({ unreached: 'products.category' });
  });
});
