import { describe, expect, it } from 'vitest';

import { markedValuesTsv } from './markedValues';

/**
 * T271 / AC-241: WHEN the user chooses Copy › Marked values, THE SYSTEM SHALL
 * put the marked items' member values on the clipboard as tab-separated text
 * with a header row of the members' titles.
 * `Fails when: the clipboard text differs from the marked items, or has no
 * header row.`
 *
 * The text alone; the clipboard is the e2e's (jsdom has none — research/
 * clipboard-and-image-export.md, Gotchas).
 */
const titles: Record<string, string> = {
  'orders.status': 'Status',
  'orders.region': 'Region',
  'products.category': 'Category',
};
const titleOf = (member: string) => titles[member];

describe('the marked values as tab-separated text', () => {
  it('heads a column per member by its title, and gives a line per item', () => {
    expect(
      markedValuesTsv(
        {
          items: [
            [
              { member: 'orders.status', value: 'shipped' },
              { member: 'orders.region', value: 'EU' },
            ],
            [
              { member: 'orders.status', value: 'completed' },
              { member: 'orders.region', value: 'US' },
            ],
          ],
          ranges: [],
        },
        titleOf,
      ),
    ).toBe('Status\tRegion\nshipped\tEU\ncompleted\tUS');
  });

  it('leaves a member an item does not name empty, as items of several members are', () => {
    expect(
      markedValuesTsv(
        {
          items: [
            [{ member: 'orders.status', value: 'shipped' }],
            [{ member: 'products.category', value: 'Toys' }],
          ],
          ranges: [],
        },
        titleOf,
      ),
    ).toBe('Status\tCategory\nshipped\t\n\tToys');
  });

  it('writes a blank as nothing, and a tab or line break inside a value as a space', () => {
    // TSV carries neither inside a field (IANA TSV, via the research).
    expect(
      markedValuesTsv(
        {
          items: [
            [{ member: 'orders.status', value: null }],
            [{ member: 'orders.status', value: 'on\thold\nnow' }],
          ],
          ranges: [],
        },
        titleOf,
      ),
    ).toBe('Status\n\non hold now');
  });

  it('lists a whole tile’s items where its tile can name them (Mark all, AC-115)', () => {
    expect(
      markedValuesTsv(
        { items: [], ranges: [], wholes: [{ tileId: 't1', filters: [], count: 2 }] },
        titleOf,
        (tileId) =>
          tileId === 't1'
            ? [
                [{ member: 'orders.status', value: 'shipped' }],
                [{ member: 'orders.status', value: 'completed' }],
              ]
            : undefined,
      ),
    ).toBe('Status\nshipped\ncompleted');
  });

  it('is nothing when nothing is marked', () => {
    expect(markedValuesTsv({ items: [], ranges: [] }, titleOf)).toBe('');
  });
});
