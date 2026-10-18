import { describe, expect, it } from 'vitest';

import type { MarkFilter } from '../markings/filterToMarked';
import { filterChangeSaid, markFilterSaid } from './filterChangeSaid';

/**
 * T840 (AC-493; design 19 states B2, B4 and B5): what the dashboard's polite
 * live region says, once, for a change made while the header sheet is closed.
 */
describe('a filter change, said', () => {
  it('names a filter added and the new number set', () => {
    expect(
      filterChangeSaid({
        kind: 'added',
        what: 'Product is Côte de Blaye or Raclette Courdavault',
        set: 4,
      }),
    ).toBe('Filter added: Product is Côte de Blaye or Raclette Courdavault. 4 filters set.');
  });

  it('names a filter removed and the new number set', () => {
    expect(
      filterChangeSaid({
        kind: 'removed',
        what: 'Product is Côte de Blaye or Raclette Courdavault',
        set: 3,
      }),
    ).toBe('Filter removed: Product is Côte de Blaye or Raclette Courdavault. 3 filters set.');
  });

  it('says one filter, and none, in words', () => {
    expect(filterChangeSaid({ kind: 'added', what: 'Status is shipped', set: 1 })).toBe(
      'Filter added: Status is shipped. 1 filter set.',
    );
    expect(filterChangeSaid({ kind: 'removed', what: 'Status is shipped', set: 0 })).toBe(
      'Filter removed: Status is shipped. No filters set.',
    );
  });

  it('names a bookmark applied, its page, the number set and what is marked', () => {
    expect(
      filterChangeSaid({
        kind: 'bookmark',
        name: 'Q3 review',
        page: 'By country',
        set: 2,
        marked: 0,
      }),
    ).toBe('Bookmark applied: Q3 review. Page By country. 2 filters set. Nothing marked.');
    expect(filterChangeSaid({ kind: 'bookmark', name: 'Shipped', set: 1, marked: 1 })).toBe(
      'Bookmark applied: Shipped. 1 filter set. 1 item marked.',
    );
    // A dashboard with no filters says nothing of them.
    expect(filterChangeSaid({ kind: 'bookmark', name: 'Plain', marked: 1200 })).toBe(
      'Bookmark applied: Plain. 1,200 items marked.',
    );
    // A cross-filtering dashboard says nothing of markings (AC-120).
    expect(filterChangeSaid({ kind: 'bookmark', name: 'Cross', set: 0 })).toBe(
      'Bookmark applied: Cross. No filters set.',
    );
  });

  it('names a cross-filter set, with its tile, and one or all cleared', () => {
    expect(
      filterChangeSaid({
        kind: 'cross-filter',
        what: 'Category is Beverages',
        from: 'Revenue by category',
      }),
    ).toBe('Cross-filter: Category is Beverages, from Revenue by category.');
    expect(filterChangeSaid({ kind: 'cross-filter', what: 'Category is Beverages' })).toBe(
      'Cross-filter: Category is Beverages.',
    );
    expect(filterChangeSaid({ kind: 'cross-filter cleared', what: 'Category is Beverages' })).toBe(
      'Cross-filter cleared: Category is Beverages.',
    );
    expect(filterChangeSaid({ kind: 'cross-filter cleared' })).toBe('Cross-filters cleared.');
  });
});

const TITLES: Record<string, string> = {
  'products.name': 'Product',
  'orders.status': 'Status',
  'customers.country': 'Country',
};
const titleOf = (member: string) => TITLES[member];

const made = (over: Partial<MarkFilter>): MarkFilter => ({
  id: 'mark-filter-1',
  negate: false,
  markingName: 'Marking',
  summary: 'Product: Côte de Blaye, Raclette Courdavault',
  filter: {},
  members: ['products.name'],
  predicate: {
    items: [
      [{ member: 'products.name', value: 'Côte de Blaye' }],
      [{ member: 'products.name', value: 'Raclette Courdavault' }],
    ],
    ranges: [],
  },
  ...over,
});

describe('a filter made from a marking, in words', () => {
  it('reads as its field and its values, "or" between them', () => {
    expect(markFilterSaid(made({}), titleOf)).toBe(
      'Product is Côte de Blaye or Raclette Courdavault',
    );
  });

  it('reads "is not" for Filter out marked', () => {
    expect(markFilterSaid(made({ negate: true }), titleOf)).toBe(
      'Product is not Côte de Blaye or Raclette Courdavault',
    );
  });

  it('names three values, then counts the rest', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((value) => [{ member: 'orders.status', value }]);
    expect(markFilterSaid(made({ predicate: { items, ranges: [] } }), titleOf)).toBe(
      'Status is a, b, c or 2 more',
    );
    expect(
      markFilterSaid(made({ predicate: { items: items.slice(0, 3), ranges: [] } }), titleOf),
    ).toBe('Status is a, b or c');
  });

  it('falls back to the bar’s own label where its field and values cannot be said so', () => {
    // Two fields in one item, or a range: the bar's words, as its chip reads.
    const tuple = made({
      summary: '1 item',
      predicate: {
        items: [
          [
            { member: 'orders.status', value: 'shipped' },
            { member: 'customers.country', value: 'France' },
          ],
        ],
        ranges: [],
      },
    });
    expect(markFilterSaid(tuple, titleOf)).toBe('Filtered to Marking: 1 item');
    const ranged = made({
      negate: true,
      summary: 'Status a to c',
      predicate: { items: [], ranges: [{ member: 'orders.status', from: 'a', to: 'c' }] },
    });
    expect(markFilterSaid(ranged, titleOf)).toBe('Filtered out Marking: Status a to c');
  });

  it('names a field the model doesn’t title by its member', () => {
    expect(markFilterSaid(made({}), () => undefined)).toBe(
      'products.name is Côte de Blaye or Raclette Courdavault',
    );
  });
});
