import { describe, expect, it } from 'vitest';

import { PALETTE, insertionPoint, insertElement, newElement } from './insert';
import { isSized, pageKey, sectionKey, tabKey, type DashboardDocument } from './document';

/**
 * T064 / AC-058: WHEN the user adds an element from the sidebar, THE SYSTEM
 * SHALL offer chart, chart from folders, section, tab group, markdown, header,
 * divider, image, link and filter, and insert the chosen one after the
 * selection or into the chosen "+ Add" slot.
 * `Fails when: an element type is missing, or an insert lands somewhere other
 * than the stated position.`
 *
 * Two halves, and the first is the one a test can lose sight of: the palette
 * is asserted as a *list*, in the criterion's own order, so a type that is
 * dropped or quietly renamed fails here rather than being noticed by nobody.
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

const idsIn = (document: DashboardDocument, key: string): string[] => {
  const found: string[] = [];
  for (const page of document.pages) {
    if (key === pageKey(page.id)) found.push(...page.items.map((item) => item.id));
    const walk = (items: DashboardDocument['pages'][number]['items']) => {
      for (const element of items) {
        if (element.kind === 'section') {
          if (key === sectionKey(element.id)) found.push(...element.items.map((i) => i.id));
          walk(element.items);
        } else if (element.kind === 'tabs') {
          for (const tab of element.tabs) {
            if (key === tabKey(element.id, tab.id)) found.push(...tab.items.map((i) => i.id));
            walk(tab.items);
          }
        }
      }
    };
    walk(page.items);
  }
  return found;
};

describe('what the palette offers', () => {
  it('offers exactly the ten the criterion lists, in its order', () => {
    // "Exactly" is the criterion: a type missing is its failing state, and
    // asserting the whole list is what makes a rename or a removal fail here.
    expect(PALETTE.map((entry) => entry.id)).toEqual([
      'chart',
      'library',
      'section',
      'tabs',
      'markdown',
      'header',
      'divider',
      'image',
      'link',
      'filter',
    ]);
  });

  it('gives every entry something to show in the sidebar', () => {
    for (const entry of PALETTE) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('what each entry makes', () => {
  const mint = (n = 0) => {
    let next = n;
    return () => `new-${String((next += 1))}`;
  };

  it('makes a tile of the kind that was chosen', () => {
    expect(newElement('markdown', mint()).kind).toBe('markdown');
    expect(newElement('divider', mint()).kind).toBe('divider');
  });

  it('makes a chart from folders a chart tile, bound to nothing yet', () => {
    const made = newElement('library', mint());

    // The palette entry is its own thing, but what it inserts is a chart
    // tile; which shared chart it shows is chosen next (AC-058's "Chart from
    // folders" with search).
    expect(made.kind).toBe('chart');
  });

  it('makes a section and a tab group empty, not pre-filled', () => {
    const section = newElement('section', mint());
    const tabs = newElement('tabs', mint());

    expect(section.kind === 'section' ? section.items : null).toEqual([]);
    // Two tabs, because a tab group with one tab is not a tab group. Both
    // start empty — AC-068 says a template must not insert charts bound to
    // fields nobody chose, and the same reasoning holds here.
    expect(tabs.kind === 'tabs' ? tabs.tabs.map((tab) => tab.items) : null).toEqual([[], []]);
  });

  it('gives a size only to the kinds that have one', () => {
    // A header, a divider and a filter are as tall as their content, exactly
    // as a section is; only chart, markdown, image and link are dragged to a
    // size of their own.
    for (const entry of PALETTE) {
      const made = newElement(entry.id, mint());
      if (made.kind === 'section' || made.kind === 'tabs') continue;

      expect(made.h === undefined).toBe(!isSized(made));
    }
  });

  it('gives every element its own id', () => {
    const next = mint();
    const ids = PALETTE.map((entry) => newElement(entry.id, next).id);

    expect(new Set(ids).size).toBe(PALETTE.length);
  });
});

describe('where it lands', () => {
  const element = { id: 'new', kind: 'divider' as const, w: 12 };

  it('goes straight after the selection', () => {
    const at = insertionPoint(DOC, { selected: 'b', pageId: 'p1' });

    expect(at).toEqual({ key: sectionKey('s1'), index: 1 });
    expect(idsIn(insertElement(DOC, element, at), sectionKey('s1'))).toEqual(['b', 'new', 'tg']);
  });

  it('goes into the chosen "+ Add" slot, which wins over the selection', () => {
    // The slot is a deliberate aim at one container; a selection is only
    // where the user last happened to be.
    const at = insertionPoint(DOC, { selected: 'b', addTarget: tabKey('tg', 't'), pageId: 'p1' });

    expect(at).toEqual({ key: tabKey('tg', 't'), index: null });
    expect(idsIn(insertElement(DOC, element, at), tabKey('tg', 't'))).toEqual(['c', 'new']);
  });

  it('goes to the end of the open page when nothing is selected', () => {
    const at = insertionPoint(DOC, { pageId: 'p1' });

    expect(at).toEqual({ key: pageKey('p1'), index: null });
    expect(idsIn(insertElement(DOC, element, at), pageKey('p1'))).toEqual(['a', 's1', 'new']);
  });

  it('falls back to the page when the selection has gone', () => {
    const at = insertionPoint(DOC, { selected: 'deleted-since', pageId: 'p1' });

    expect(at).toEqual({ key: pageKey('p1'), index: null });
  });

  it('falls back to the page when the aimed-at container has gone', () => {
    // Reachable: add a section, aim its "+ Add here", press Undo. Passing the
    // dead key through produced an insert that landed nowhere, explained
    // nothing, and still counted as a change.
    const at = insertionPoint(DOC, { addTarget: sectionKey('deleted-since'), pageId: 'p1' });

    expect(at).toEqual({ key: pageKey('p1'), index: null });
  });

  it('leaves every other container alone', () => {
    const after = insertElement(DOC, element, insertionPoint(DOC, { selected: 'a', pageId: 'p1' }));

    expect(idsIn(after, pageKey('p1'))).toEqual(['a', 'new', 's1']);
    expect(idsIn(after, sectionKey('s1'))).toEqual(['b', 'tg']);
    expect(idsIn(after, tabKey('tg', 't'))).toEqual(['c']);
  });
});
