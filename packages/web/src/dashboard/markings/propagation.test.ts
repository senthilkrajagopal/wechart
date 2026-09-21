import { EMPTY_PREDICATE, withItem } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { markingOf, tilesAffectedBy, withMarking } from './store';

/**
 * T101 / AC-095: WHEN a marking changes, THE SYSTEM SHALL update every tile
 * that uses it or is limited by it, on every page tab of the dashboard
 * (direction.md rule 48: "Markings span every page tab").
 * `Fails when: a tile on another page tab still shows the previous marking
 * state when opened.`
 *
 * The failing state names *another page tab* for a reason, and it is the one
 * thing here that is easy to get wrong without noticing. direction.md says
 * tabs load lazily, so a tile on a tab nobody has opened does not exist yet —
 * and the obvious way to keep tiles up to date is to push each change out to
 * the tiles that are currently mounted. That works perfectly for everything on
 * screen and silently fails for everything that is not: the tab opens later
 * and renders whatever it was told last, or nothing at all.
 *
 * So the marking is held once for the dashboard and **read** when a tile
 * renders, never pushed. A tile that appears afterwards reads the same value
 * as everything already on screen, by construction rather than by care.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      items: [
        { id: 'marks-with-it', kind: 'chart', w: 6, h: 40, marksWith: 'mk1' },
        { id: 'marks-with-other', kind: 'chart', w: 6, h: 40, marksWith: 'mk2' },
        { id: 'marks-with-none', kind: 'chart', w: 6, h: 40 },
      ],
    },
    {
      id: 'appendix',
      title: 'Appendix',
      items: [
        { id: 'far-away', kind: 'chart', w: 6, h: 40, marksWith: 'mk1' },
        {
          id: 'section',
          kind: 'section',
          title: 'Detail',
          items: [
            { id: 'limited-deep', kind: 'chart', w: 12, h: 40, limitedBy: ['mk1'] },
            {
              id: 'group',
              kind: 'tabs',
              w: 12,
              tabs: [
                { id: 'first', title: 'First', items: [] },
                {
                  id: 'second',
                  title: 'Second',
                  // A tile in a tab nobody has opened: the lazy-loading case
                  // this criterion exists for, in miniature.
                  items: [{ id: 'in-closed-tab', kind: 'chart', w: 12, h: 40, marksWith: 'mk1' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('which tiles a marking change reaches', () => {
  it('finds tiles that mark with it', () => {
    expect(tilesAffectedBy(DOC, 'mk1')).toContain('marks-with-it');
  });

  it('finds tiles on every page tab, not only the open one', () => {
    // The criterion's failing state in one assertion: a tile two tabs away is
    // just as affected as the one under the pointer.
    expect(tilesAffectedBy(DOC, 'mk1')).toContain('far-away');
  });

  it('finds tiles nested inside sections', () => {
    // A details tile usually sits inside a section, so a search that only
    // walked a page's top level would miss exactly the tiles most likely to
    // be limited by a marking.
    expect(tilesAffectedBy(DOC, 'mk1')).toContain('limited-deep');
  });

  it('finds tiles in tabs nobody has opened', () => {
    /**
     * The lazy-loading case in miniature, and the one I had claimed in a
     * comment without testing: a mutation that walked only a tab group's
     * first tab passed everything until this fixture gained a second one.
     * A tile in a closed tab is precisely what "still shows the previous
     * marking state when opened" describes.
     */
    expect(tilesAffectedBy(DOC, 'mk1')).toContain('in-closed-tab');
  });

  it('finds tiles limited by it as well as tiles marking with it', () => {
    // Two different relationships, both of which make a tile change when the
    // marking does (direction.md: "Details tiles are limited by markings").
    expect(tilesAffectedBy(DOC, 'mk1')).toEqual([
      'marks-with-it',
      'far-away',
      'limited-deep',
      'in-closed-tab',
    ]);
  });

  it('leaves tiles that use a different marking alone', () => {
    expect(tilesAffectedBy(DOC, 'mk1')).not.toContain('marks-with-other');
  });

  it('leaves tiles that mark with nothing alone', () => {
    // "(None)" tiles cannot be marked at all (direction.md rule 44).
    expect(tilesAffectedBy(DOC, 'mk1')).not.toContain('marks-with-none');
  });

  it('finds nothing for a marking no tile uses', () => {
    expect(tilesAffectedBy(DOC, 'mk4')).toEqual([]);
  });
});

describe('what a tile reads when it renders', () => {
  const paid = [{ member: 'orders.status', value: 'paid' }];

  it('is nothing before anything is marked', () => {
    expect(markingOf({}, 'mk1')).toEqual(EMPTY_PREDICATE);
  });

  it('is the current marking, whenever the tile happens to render', () => {
    /**
     * The whole criterion, stated as a property rather than a sequence: the
     * state is read, not delivered. A tile rendering for the first time long
     * after the change reads exactly what a tile already on screen reads.
     */
    const state = withMarking({}, 'mk1', withItem(EMPTY_PREDICATE, paid));

    expect(markingOf(state, 'mk1')).toEqual(withItem(EMPTY_PREDICATE, paid));
  });

  it('leaves other markings untouched when one changes', () => {
    // Four markings can be live at once (AC-084), and changing one must not
    // disturb the others — a tile marking with mk2 does not repaint because
    // mk1 moved.
    const state = withMarking(
      withMarking({}, 'mk2', withItem(EMPTY_PREDICATE, paid)),
      'mk1',
      EMPTY_PREDICATE,
    );

    expect(markingOf(state, 'mk2')).toEqual(withItem(EMPTY_PREDICATE, paid));
  });

  it('replaces rather than merges when a marking changes', () => {
    const shipped = [{ member: 'orders.status', value: 'shipped' }];
    const first = withMarking({}, 'mk1', withItem(EMPTY_PREDICATE, paid));

    const second = withMarking(first, 'mk1', withItem(EMPTY_PREDICATE, shipped));

    expect(markingOf(second, 'mk1').items).toEqual([shipped]);
  });

  it('does not mutate the state it was given', () => {
    // The dashboard's edit session compares documents by identity; a store
    // that changed in place would make a change invisible to it.
    const before = withMarking({}, 'mk1', withItem(EMPTY_PREDICATE, paid));

    withMarking(before, 'mk1', EMPTY_PREDICATE);

    expect(markingOf(before, 'mk1').items).toEqual([paid]);
  });
});
