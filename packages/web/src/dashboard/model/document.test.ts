import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import {
  containersOf,
  moveBy,
  moveTile,
  nameOfTile,
  pageKey,
  placeOf,
  removeElement,
  resizeTile,
  sectionKey,
  SIZED_KINDS,
  tabKey,
  TILE_KINDS,
  tileShowing,
  type DashboardDocument,
  type Element_,
} from './document';
import { SECTION_TEMPLATES, templateElements } from '../edit/templates';
import { PALETTE, newElement } from './insert';

/**
 * T061 / AC-055, the document half: a resize has to *change the dashboard*,
 * not just draw a different rectangle. `resize.ts` decides the new size and
 * the canvas shows it live; this is what the drag leaves behind.
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
            { id: 'b', kind: 'chart', w: 4, h: 24 },
            {
              id: 'tg',
              kind: 'tabs',
              w: 12,
              tabs: [{ id: 't', title: 'T', items: [{ id: 'c', kind: 'markdown', w: 3, h: 16 }] }],
            },
          ],
        },
      ],
    },
  ],
};

const find = (document: DashboardDocument, id: string): { w: number; h: number } => {
  const found: { w: number; h: number }[] = [];
  const walk = (items: DashboardDocument['pages'][number]['items']) => {
    for (const element of items) {
      if (element.kind === 'section') walk(element.items);
      else if (element.kind === 'tabs') for (const tab of element.tabs) walk(tab.items);
      else if (element.id === id) found.push({ w: element.w, h: element.h ?? -1 });
    }
  };
  for (const page of document.pages) walk(page.items);
  return found[0] ?? { w: -1, h: -1 };
};

/** The ids a container holds, in order. */
const idsIn = (document: DashboardDocument, key: string): string[] => {
  const found: string[] = [];
  const collect = (items: readonly Element_[]) => {
    for (const element of items) found.push(element.id);
  };

  for (const page of document.pages) {
    if (key === pageKey(page.id)) collect(page.items);
    const walk = (items: readonly Element_[]) => {
      for (const element of items) {
        if (element.kind === 'section') {
          if (key === sectionKey(element.id)) collect(element.items);
          walk(element.items);
        } else if (element.kind === 'tabs') {
          for (const tab of element.tabs) {
            if (key === tabKey(element.id, tab.id)) collect(tab.items);
            walk(tab.items);
          }
        }
      }
    };
    walk(page.items);
  }
  return found;
};

describe('resizing a tile in the document', () => {
  it('gives the tile its new size', () => {
    expect(find(resizeTile(DOC, 'a', { w: 9, h: 56 }), 'a')).toEqual({ w: 9, h: 56 });
  });

  it('reaches a tile inside a section, and one inside a tab group', () => {
    expect(find(resizeTile(DOC, 'b', { w: 8, h: 32 }), 'b')).toEqual({ w: 8, h: 32 });
    expect(find(resizeTile(DOC, 'c', { w: 5, h: 20 }), 'c')).toEqual({ w: 5, h: 20 });
  });

  it('leaves every other tile exactly as it was', () => {
    const after = resizeTile(DOC, 'a', { w: 9, h: 56 });

    expect(find(after, 'b')).toEqual({ w: 4, h: 24 });
    expect(find(after, 'c')).toEqual({ w: 3, h: 16 });
  });

  it('does not touch the document it was given', () => {
    resizeTile(DOC, 'a', { w: 9, h: 56 });

    // The edit session keeps past states and compares them by identity, so a
    // helper that mutated in place would rewrite the history as well as the
    // present — and Undo would have nothing different to go back to.
    expect(find(DOC, 'a')).toEqual({ w: 6, h: 40 });
  });

  it('shares the branches it did not change, by identity', () => {
    const after = resizeTile(DOC, 'a', { w: 9, h: 56 });

    // Identity, not equality. The changed branch is rebuilt...
    expect(after).not.toBe(DOC);
    expect(after.pages[0]?.items[0]).not.toBe(DOC.pages[0]?.items[0]);

    // ...and every branch that holds nothing changed is the very same object,
    // which is what lets the edit history tell one state from the next without
    // walking the tree. Rebuilding the whole document would pass an equality
    // check and fail this.
    expect(after.pages[1]).toBe(DOC.pages[1]);
    expect(after.pages[0]?.items[1]).toBe(DOC.pages[0]?.items[1]);
  });

  it('rebuilds only as far as the tile that changed, deep in the tree', () => {
    const after = resizeTile(DOC, 'c', { w: 5, h: 20 });
    const section = after.pages[0]?.items[1];
    const before = DOC.pages[0]?.items[1];

    // 'c' lives inside a tab of a tab group inside a section, so that chain is
    // rebuilt — while 'b', the section's other child, is untouched.
    expect(section).not.toBe(before);
    expect(section && 'items' in section ? section.items[0] : null).toBe(
      before && 'items' in before ? before.items[0] : undefined,
    );
  });

  it('resizes a tab group, which has a width of its own', () => {
    const after = resizeTile(DOC, 'tg', { w: 6, h: 0 });
    const section = after.pages[0]?.items[1];
    const group = section && 'items' in section ? section.items[1] : null;

    // A silent no-op here would be a trap for T062 and T064, where a tab group
    // becomes something the user can move and size.
    expect(group && 'w' in group ? group.w : null).toBe(6);
  });

  it('hands back the very same document when no element has that id', () => {
    const after = resizeTile(DOC, 'nobody', { w: 1, h: 1 });

    // Not merely equal: an edit that matched nothing must not register as a
    // change at all, or Undo would offer to undo it.
    expect(after).toBe(DOC);
  });
});

/** T063 / AC-057, the document half: what the arrow keys and Delete leave behind. */
describe('moving a tile one place with the keyboard', () => {
  it('goes later, and earlier', () => {
    // Three items, not two: in a two-item container +1 and −1 produce the
    // same list, so a reversed direction or an off-by-one on the "earlier"
    // path would pass either way.
    const three = moveTile(DOC, 'a', { key: sectionKey('s1'), index: 0 });
    expect(idsIn(three, sectionKey('s1'))).toEqual(['a', 'b', 'tg']);

    expect(idsIn(moveBy(three, 'a', 1), sectionKey('s1'))).toEqual(['b', 'a', 'tg']);
    expect(idsIn(moveBy(three, 'tg', -1), sectionKey('s1'))).toEqual(['a', 'tg', 'b']);
    expect(idsIn(moveBy(three, 'b', -1), sectionKey('s1'))).toEqual(['b', 'a', 'tg']);
  });

  it('stops at the ends rather than wrapping round', () => {
    // A tile that jumped from the end of a page to its start because someone
    // pressed Right once too often would be a surprise, and an undo away.
    expect(moveBy(DOC, 'b', -1)).toBe(DOC);
    expect(moveBy(DOC, 'tg', 1)).toBe(DOC);
  });

  it('says where an element is, and how many it sits among', () => {
    expect(placeOf(DOC, 'b')).toEqual({ key: sectionKey('s1'), index: 0, of: 2 });
    expect(placeOf(DOC, 'a')).toEqual({ key: pageKey('p1'), index: 0, of: 2 });
    expect(placeOf(DOC, 'nobody')).toBeNull();
  });
});

describe('deleting an element', () => {
  it('takes the tile out', () => {
    expect(idsIn(removeElement(DOC, 'a'), pageKey('p1'))).toEqual(['s1']);
  });

  it('takes a container out with everything inside it', () => {
    const after = removeElement(DOC, 's1');

    // Whole, so that Undo restores it whole — AC-060 asks that an undo bring
    // back "the element and its contents".
    expect(idsIn(after, pageKey('p1'))).toEqual(['a']);
    expect(idsIn(after, sectionKey('s1'))).toEqual([]);
  });

  it('reaches a tile nested in a tab', () => {
    expect(idsIn(removeElement(DOC, 'c'), tabKey('tg', 't'))).toEqual([]);
  });

  it('hands back the very same document when there is nothing to delete', () => {
    expect(removeElement(DOC, 'nobody')).toBe(DOC);
  });
});

/**
 * T062 / AC-056, the document half. `dropTarget.ts` decides where a drop would
 * land and the canvas paints it; this is what the drop leaves behind.
 */
describe('moving a tile to another container', () => {
  it('puts the tile where the marker said, and takes it out of where it was', () => {
    const after = moveTile(DOC, 'a', { key: sectionKey('s1'), index: 0 });

    expect(idsIn(after, sectionKey('s1'))).toEqual(['a', 'b', 'tg']);
    expect(idsIn(after, pageKey('p1'))).toEqual(['s1']);
  });

  it('appends when the target is a tab label, which has no position to aim at', () => {
    const after = moveTile(DOC, 'a', { key: tabKey('tg', 't'), index: null });

    // The criterion singles this out: a drop on a tab label must move the tile
    // into that tab, not leave it where it was.
    expect(idsIn(after, tabKey('tg', 't'))).toEqual(['c', 'a']);
    expect(idsIn(after, pageKey('p1'))).toEqual(['s1']);
  });

  it('reorders within one container without losing or duplicating the tile', () => {
    const two = moveTile(DOC, 'a', { key: sectionKey('s1'), index: 0 });
    expect(idsIn(two, sectionKey('s1'))).toEqual(['a', 'b', 'tg']);

    /**
     * The index counts positions in the container **without** the tile being
     * moved, which is what `dropTargetAt` produces: it skips the tile in hand
     * when working out what the pointer is between. Both ends of the move have
     * to agree on that or every same-container reorder is out by one — so the
     * convention is pinned here from both sides.
     */
    expect(
      idsIn(moveTile(two, 'a', { key: sectionKey('s1'), index: 1 }), sectionKey('s1')),
    ).toEqual(['b', 'a', 'tg']);
    expect(
      idsIn(moveTile(two, 'a', { key: sectionKey('s1'), index: 2 }), sectionKey('s1')),
    ).toEqual(['b', 'tg', 'a']);
  });

  it('clamps a position past the end rather than leaving a hole', () => {
    const after = moveTile(DOC, 'a', { key: sectionKey('s1'), index: 99 });

    expect(idsIn(after, sectionKey('s1'))).toEqual(['b', 'tg', 'a']);
  });

  it('changes nothing when the tile does not exist', () => {
    expect(moveTile(DOC, 'nobody', { key: pageKey('p1'), index: 0 })).toBe(DOC);
  });

  it('refuses to move a container into itself, which would delete it', () => {
    // The section is a grid item, so it can be picked up; its own body is a
    // drop container. Moving it inside itself rebuilds the subtree and then
    // discards the very branch that was rebuilt, so the section and
    // everything in it disappear from the document. Silent loss from a
    // plausible gesture, and Undo is the only way back.
    const after = moveTile(DOC, 's1', { key: sectionKey('s1'), index: 0 });

    expect(idsIn(after, pageKey('p1'))).toEqual(['a', 's1']);
    expect(idsIn(after, sectionKey('s1'))).toEqual(['b', 'tg']);
  });

  it('refuses to move a container into something nested inside it', () => {
    // The same loss, one level deeper: the tab group lives inside the section.
    const after = moveTile(DOC, 's1', { key: tabKey('tg', 't'), index: 0 });

    expect(idsIn(after, pageKey('p1'))).toEqual(['a', 's1']);
    expect(idsIn(after, tabKey('tg', 't'))).toEqual(['c']);
  });

  it('finds the tile showing a chart, inside sections, tabs and later pages (T463)', () => {
    const showing: DashboardDocument = {
      ...DOC,
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [
            { id: 'a', kind: 'chart', w: 6, h: 40, chartId: 'ch-a' },
            {
              id: 'tg',
              kind: 'tabs',
              w: 12,
              tabs: [
                {
                  id: 't',
                  title: 'T',
                  items: [{ id: 'in-tab', kind: 'chart', w: 3, h: 16, chartId: 'ch-tab' }],
                },
              ],
            },
          ],
        },
        {
          id: 'p2',
          title: 'More',
          items: [
            {
              id: 's2',
              kind: 'section',
              title: 'Later',
              items: [{ id: 'later', kind: 'chart', w: 4, h: 24, chartId: 'ch-later' }],
            },
          ],
        },
      ],
    };

    expect(tileShowing(showing, 'ch-a')).toBe('a');
    expect(tileShowing(showing, 'ch-tab')).toBe('in-tab');
    expect(tileShowing(showing, 'ch-later')).toBe('later');
    // No tile shows it: nothing to open.
    expect(tileShowing(showing, 'ch-gone')).toBeUndefined();
  });

  it('lists every container a tile could be moved to, named for a menu', () => {
    const containers = containersOf(DOC).map((container) => container.key);

    // The ⋯ "Move to" menu is the single-pointer alternative WCAG SC 2.5.7
    // requires, and `docs/research/dashboard-grid.md` makes it a condition of
    // building the drag ourselves. It can only offer what this lists.
    expect(containers).toEqual([pageKey('p1'), sectionKey('s1'), tabKey('tg', 't')]);
    // Named by the path to them, so one "T" tab is distinguishable from
    // another in a menu that lists every container on the dashboard.
    expect(containersOf(DOC).map((container) => container.title)).toEqual([
      'Overview',
      'Overview › Detail',
      'Overview › Detail › T',
    ]);
  });
});

/**
 * T874 / AC-058 (R80): the Text tile is a kind of the dashboard's own, and
 * nothing a new dashboard is given is a markdown tile.
 */
describe('the text tile kind (AC-058)', () => {
  it('holds text among the tile kinds, sized as the markdown tile was', () => {
    expect(TILE_KINDS).toContain('text');
    expect(SIZED_KINDS).toContain('text');
  });

  it('names a Text tile by its first line, as a markdown tile was named by its text (T875’s review)', () => {
    const document: DashboardDocument = {
      ...DOC,
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [
            { id: 'n', kind: 'text', w: 6, document: textDocumentFromMarkdown('## Notes\n\nMore') },
          ],
        },
      ],
    };
    expect(nameOfTile(document, 'n')).toBe('text: Notes');
  });

  it('never makes a markdown tile, from any palette entry or template', () => {
    let n = 0;
    const mint = () => `m${String(n++)}`;
    const made = [
      ...PALETTE.map((entry) => newElement(entry.id, mint)),
      ...SECTION_TEMPLATES.flatMap((template) => templateElements(template.id, mint)),
    ];
    expect(made.map((element) => element.kind)).not.toContain('markdown');
  });
});
