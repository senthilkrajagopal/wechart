import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { isDirty } from './dirtyGuard';

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
