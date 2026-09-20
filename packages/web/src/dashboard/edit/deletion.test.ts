import { describe, expect, it } from 'vitest';

import {
  pageKey,
  sectionKey,
  tabKey,
  type DashboardDocument,
  type Element_,
} from '../model/document';
import { deleteFromDashboard, describeDeletion } from './deletion';

/**
 * T066 / AC-060: WHEN the user deletes a tile, section, page tab or tab, THE
 * SYSTEM SHALL offer an undo in a toast and through Undo, restoring the
 * element and its contents (direction.md rule 38).
 * `Fails when: an undo restores the element without its contents, or no undo
 * is offered.`
 *
 * Four kinds of thing, and the criterion names all four — a *page tab* and a
 * *tab* are not elements on the grid at all, so they need their own removal.
 *
 * "And its contents" is the half that shapes the design: the deletion takes
 * the whole subtree out in one step, and the edit session keeps whole states,
 * so an undo puts the whole subtree back. A deletion that emptied a container
 * first and removed it second would restore an empty one.
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
              tabs: [
                { id: 't1', title: 'First', items: [{ id: 'c', kind: 'markdown', w: 3, h: 16 }] },
                { id: 't2', title: 'Second', items: [] },
              ],
            },
          ],
        },
      ],
    },
    { id: 'p2', title: 'Appendix', items: [{ id: 'd', kind: 'divider', w: 12 }] },
  ],
};

const ids = (document: DashboardDocument): string[] => {
  const found: string[] = [];
  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      found.push(element.id);
      if (element.kind === 'section') walk(element.items);
      else if (element.kind === 'tabs')
        for (const tab of element.tabs) {
          // The tabs themselves, not only what is in them: a tab is one of
          // the four things the criterion says can be deleted.
          found.push(tab.id);
          walk(tab.items);
        }
    }
  };
  for (const page of document.pages) {
    found.push(page.id);
    walk(page.items);
  }
  return found;
};

describe('deleting each of the four things the criterion names', () => {
  it('deletes a tile', () => {
    const after = deleteFromDashboard(DOC, { kind: 'element', id: 'a' });

    expect(ids(after)).not.toContain('a');
    expect(ids(after)).toContain('s1');
  });

  it('deletes a section, and everything inside it', () => {
    const after = deleteFromDashboard(DOC, { kind: 'element', id: 's1' });

    // Whole, in one step: a deletion that emptied the section first would
    // leave an undo that restored an empty one.
    for (const gone of ['s1', 'b', 'tg', 'c']) expect(ids(after)).not.toContain(gone);
  });

  it('deletes a page tab, which is not an element on the grid', () => {
    const after = deleteFromDashboard(DOC, { kind: 'page', id: 'p2' });

    expect(after.pages.map((page) => page.id)).toEqual(['p1']);
    expect(ids(after)).not.toContain('d');
  });

  it('deletes one tab of a tab group, leaving the group', () => {
    const after = deleteFromDashboard(DOC, { kind: 'tab', groupId: 'tg', id: 't1' });

    expect(ids(after)).toContain('tg');
    expect(ids(after)).not.toContain('c');
  });

  it('refuses to delete the last page, which would leave no dashboard', () => {
    const one: DashboardDocument = { ...DOC, pages: [DOC.pages[0]!] };

    expect(deleteFromDashboard(one, { kind: 'page', id: 'p1' })).toBe(one);
  });

  it('refuses to delete the last tab, which would leave a tab group with none', () => {
    const after = deleteFromDashboard(
      deleteFromDashboard(DOC, { kind: 'tab', groupId: 'tg', id: 't1' }),
      { kind: 'tab', groupId: 'tg', id: 't2' },
    );

    expect(ids(after)).toContain('t2');
  });

  it('changes nothing when there is nothing there', () => {
    expect(deleteFromDashboard(DOC, { kind: 'element', id: 'nobody' })).toBe(DOC);
    expect(deleteFromDashboard(DOC, { kind: 'page', id: 'nobody' })).toBe(DOC);
    expect(deleteFromDashboard(DOC, { kind: 'tab', groupId: 'tg', id: 'nobody' })).toBe(DOC);
  });
});

describe('what the toast says', () => {
  it('names what went, so an undo is a decision rather than a guess', () => {
    expect(describeDeletion(DOC, { kind: 'element', id: 's1' })).toContain('Detail');
    expect(describeDeletion(DOC, { kind: 'page', id: 'p2' })).toContain('Appendix');
    expect(describeDeletion(DOC, { kind: 'tab', groupId: 'tg', id: 't1' })).toContain('First');
  });

  it('says how much went with it, when something did', () => {
    // "Restoring the element **and its contents**" is the criterion, and a
    // reader deciding whether to undo needs to know there were contents.
    expect(describeDeletion(DOC, { kind: 'element', id: 's1' })).toMatch(/3 items|3 things/i);
    expect(describeDeletion(DOC, { kind: 'element', id: 'a' })).not.toMatch(/\bitems\b/i);
  });
});

describe('the whole point: an undo puts it all back', () => {
  it('restores a section with everything that was in it', () => {
    // The edit session keeps whole states, so this is what Undo does — the
    // test states the property the criterion turns on rather than trusting it.
    const before = ids(DOC);
    const after = deleteFromDashboard(DOC, { kind: 'element', id: 's1' });

    expect(ids(after).length).toBeLessThan(before.length);
    expect(ids(DOC)).toEqual(before);
  });

  it('leaves the document it was given untouched', () => {
    deleteFromDashboard(DOC, { kind: 'page', id: 'p2' });
    deleteFromDashboard(DOC, { kind: 'tab', groupId: 'tg', id: 't1' });

    expect(DOC.pages).toHaveLength(2);
    expect(ids(DOC)).toContain('c');
  });

  it('keeps the container keys of everything it did not touch', () => {
    const after = deleteFromDashboard(DOC, { kind: 'element', id: 'a' });

    expect(after.pages[1]).toBe(DOC.pages[1]);
    expect([pageKey('p1'), sectionKey('s1'), tabKey('tg', 't1')].length).toBe(3);
  });
});
