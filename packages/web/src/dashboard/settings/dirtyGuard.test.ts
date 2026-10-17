import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { changedSentence, changesOf, isDirty } from './dirtyGuard';

/**
 * T079 / AC-073: WHEN the user leaves the settings page with unsaved changes,
 * THE SYSTEM SHALL ask before discarding them.
 * `Fails when: unsaved changes are discarded without asking.`
 *
 * "Unsaved changes" is about *content*, not about whether anything was typed.
 * The settings page rebuilds its draft on every keystroke, so a page where the
 * user typed a letter and deleted it again holds a different object with
 * identical content — and asking "discard your changes?" about a dashboard
 * that is exactly as it was is a false alarm. A guard that cries wolf is one
 * people learn to click through, which is how it stops protecting anything.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [{ id: 'p1', title: 'Overview', items: [{ id: 'a', kind: 'chart', w: 6, h: 40 }] }],
};

describe('whether the settings page has unsaved changes', () => {
  it('is clean when nothing was touched', () => {
    expect(isDirty(DOC, DOC)).toBe(false);
  });

  it('is clean when a rebuilt draft holds the same content', () => {
    // What a keystroke and a correction leave behind: a different object,
    // the same dashboard.
    expect(isDirty(DOC, { ...DOC, settings: { ...DOC.settings } })).toBe(false);
  });

  it('is dirty when a value differs', () => {
    expect(isDirty(DOC, { ...DOC, title: 'Something else' })).toBe(true);
  });

  it('is dirty when a nested setting differs', () => {
    // Settings nest — the interaction mode is two levels down — so a shallow
    // comparison would call a mode switch clean and drop it without asking.
    expect(
      isDirty(DOC, {
        ...DOC,
        settings: {
          width: 'fixed',
          interactions: { mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } },
        },
      }),
    ).toBe(true);
  });

  it('is dirty when a setting is added that was not there', () => {
    expect(isDirty(DOC, { ...DOC, markings: [] })).toBe(true);
  });

  it('does not care about key order', () => {
    // Two objects written in different orders are the same dashboard; a
    // comparison by serialisation alone would disagree.
    const reordered = {
      settings: DOC.settings,
      pages: DOC.pages,
      title: DOC.title,
      schemaVersion: 1,
    };

    expect(isDirty(DOC, reordered as DashboardDocument)).toBe(false);
  });
});

/**
 * T685 (design 05 pin 1 and state C; DSH-08, DSH-10; the coordinator's call,
 * 2026-10-17, overturnable): the bar counts the unsaved changes, and the
 * discard question names them. One change per setting that differs from the
 * saved dashboard, in the page's order.
 */
describe('what the settings page has changed', () => {
  const crossFiltering = {
    ...DOC,
    settings: {
      ...DOC.settings,
      interactions: { mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } },
    },
  } as DashboardDocument;

  it('is nothing when nothing differs, a rebuilt default included', () => {
    expect(changesOf(DOC, DOC)).toEqual([]);
    // The defaults written out are the dashboard as it was.
    const spelled = {
      ...DOC,
      settings: {
        ...DOC.settings,
        interactions: { mode: 'markings', crossFilter: { defaultAction: 'filter' } },
      },
    } as DashboardDocument;
    expect(changesOf(DOC, spelled)).toEqual([]);
  });

  it('names each setting that differs, once, in the page’s order', () => {
    const draft: DashboardDocument = {
      ...crossFiltering,
      title: 'Takings',
      folderId: 'f-2',
      description: 'Weekly',
      settings: {
        width: 'full',
        interactions: {
          mode: 'crossFilter',
          crossFilter: { defaultAction: 'highlight', pairs: { 'a→b': 'none' } },
        },
      },
      markings: [{ id: 'm1', name: 'Mine', slot: 'mk2', isDefault: true }],
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [{ id: 'a', kind: 'chart', w: 6, h: 40, marksWith: '', limitedBy: ['m1'] }],
        },
      ],
    };
    expect(changesOf(DOC, draft)).toEqual([
      'the name',
      'the folder',
      'the description',
      'the interaction mode',
      'the markings',
      'the tiles’ markings',
      'cross-filtering',
      'the page width',
    ]);
  });

  it('counts a mode switch as one change, either way', () => {
    expect(changesOf(DOC, crossFiltering)).toEqual(['the interaction mode']);
    expect(changesOf(crossFiltering, DOC)).toEqual(['the interaction mode']);
  });

  it('still names something for any other difference, so a dirty page never reads as unchanged', () => {
    const other = { ...DOC, filters: [{ id: 'f', widget: 'checkbox', member: 'o.s' }] };
    expect(changesOf(DOC, other as DashboardDocument)).toEqual(['the settings']);
    // A setting it doesn't name one by one is still a change (T685's review).
    const unnamed = { ...DOC, settings: { ...DOC.settings, zoom: 2 } };
    expect(changesOf(DOC, unnamed as DashboardDocument)).toEqual(['the settings']);
  });
});

describe('the discard question’s sentence', () => {
  it('says the one change as design 05 draws it', () => {
    expect(changedSentence(['the interaction mode'])).toBe('You changed the interaction mode.');
  });

  it('joins two with "and", and more with commas and "and" before the last', () => {
    expect(changedSentence(['the name', 'the interaction mode'])).toBe(
      'You changed the name and the interaction mode.',
    );
    expect(changedSentence(['the name', 'the description', 'the interaction mode'])).toBe(
      'You changed the name, the description and the interaction mode.',
    );
  });
});
