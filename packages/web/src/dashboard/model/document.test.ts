import { describe, expect, it } from 'vitest';

import { resizeTile, type DashboardDocument } from './document';

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
      else if (element.id === id) found.push({ w: element.w, h: element.h });
    }
  };
  for (const page of document.pages) walk(page.items);
  return found[0] ?? { w: -1, h: -1 };
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
