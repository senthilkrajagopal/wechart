import { describe, expect, it } from 'vitest';

import { pageKey, sectionKey, tabKey, type DashboardDocument } from './document';
import { placeInGrammar } from './grammar';
import { newElement } from './insert';

/**
 * T065 / AC-059: WHEN a tab group would be added outside a section, THE SYSTEM
 * SHALL wrap it in a new section and say so (direction.md rule 37).
 * `Fails when: a tab group is created directly on a page tab, or no message
 * explains the wrapping.`
 *
 * Both halves matter, and the second is the one that is easy to drop: silently
 * producing a section the user did not ask for is its own kind of wrong. The
 * rule exists because a tab group is a grouping *within* a titled block, and a
 * dashboard whose top level is a row of tab strips has no structure left.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'a', kind: 'chart', w: 6, h: 40 },
        {
          id: 's1',
          kind: 'section',
          title: 'Detail',
          items: [
            {
              id: 'tg',
              kind: 'tabs',
              w: 12,
              tabs: [{ id: 't', title: 'T', items: [] }],
            },
          ],
        },
      ],
    },
  ],
};

const mint = () => {
  let n = 0;
  return () => `new-${String((n += 1))}`;
};

const tabsAt = (key: string) => {
  const group = newElement('tabs', mint());
  return { group, at: { key, index: null } };
};

describe('a tab group added outside a section', () => {
  it('is wrapped in a new section when added to a page tab', () => {
    const { group, at } = tabsAt(pageKey('p1'));
    const placed = placeInGrammar(DOC, group, at, mint());

    // The criterion's failing state is a tab group created directly on a page
    // tab, so what goes in must be the section, not the group.
    expect(placed.element.kind).toBe('section');
    expect(placed.element.kind === 'section' ? placed.element.items : []).toEqual([group]);
  });

  it('says why, because a section nobody asked for is its own surprise', () => {
    const { group, at } = tabsAt(pageKey('p1'));
    const placed = placeInGrammar(DOC, group, at, mint());

    expect(placed.message).toBeTypeOf('string');
    expect(placed.message ?? '').toMatch(/section/i);
  });

  it('is wrapped inside a tab as well, which is not a section either', () => {
    // A tab belongs to a tab group, not to a section — direction.md rule 37
    // says "only inside a section", and a tab group nested straight into
    // another group's tab is the structure it exists to prevent.
    const { group, at } = tabsAt(tabKey('tg', 't'));
    const placed = placeInGrammar(DOC, group, at, mint());

    expect(placed.element.kind).toBe('section');
  });

  it('keeps the position it was aimed at', () => {
    const { group } = tabsAt(pageKey('p1'));
    const placed = placeInGrammar(DOC, group, { key: pageKey('p1'), index: 1 }, mint());

    // Wrapping changes what is inserted, never where.
    expect(placed.at).toEqual({ key: pageKey('p1'), index: 1 });
  });

  it('gives the wrapping section a title of its own', () => {
    const { group, at } = tabsAt(pageKey('p1'));
    const placed = placeInGrammar(DOC, group, at, mint());

    expect(placed.element.kind === 'section' ? placed.element.title : '').not.toBe('');
  });
});

describe('everything that is already legal', () => {
  it('leaves a tab group added to a section exactly as it is', () => {
    const { group, at } = tabsAt(sectionKey('s1'));
    const placed = placeInGrammar(DOC, group, at, mint());

    expect(placed.element).toBe(group);
    expect(placed.message).toBeUndefined();
  });

  it('leaves every other kind alone, wherever it goes', () => {
    for (const id of ['chart', 'text', 'header', 'divider', 'image', 'link', 'filter'] as const) {
      const element = newElement(id, mint());
      const placed = placeInGrammar(DOC, element, { key: pageKey('p1'), index: null }, mint());

      // Only tab groups are restricted. Wrapping anything else would be a
      // rule direction.md does not have.
      expect(placed.element).toBe(element);
      expect(placed.message).toBeUndefined();
    }
  });

  it('leaves a section on a page alone, which is where sections belong', () => {
    const section = newElement('section', mint());
    const placed = placeInGrammar(DOC, section, { key: pageKey('p1'), index: null }, mint());

    expect(placed.element).toBe(section);
  });
});
