import { describe, expect, it } from 'vitest';

import { dashboardOf } from './DashboardPage';

/**
 * What a dashboard loses by being read and written back.
 *
 * AC-065 sends the whole document on save, and `save.test.ts` proves the
 * *sender* keeps fields it knows nothing about. But it hand-builds the
 * document it sends, so it never sees what the **reader** did first — and the
 * reader rebuilt the body as exactly four named fields. Everything else a
 * stored dashboard carries was dropped there, silently, one step upstream of
 * every assertion.
 *
 * `folderId` is the one that bites: `1758240002000_document-columns.cjs`
 * derives the `folder_id` column from `body->>'folderId'`, so a save without
 * it nulls that column and the dashboard disappears from its folder — AC-017's
 * failing state ("the list omits an item in the folder"), reached by saving,
 * not by moving anything. `owner` goes the same way, blanking a column AC-017
 * names.
 *
 * Found by cold review of T075, which is what made it reachable with no edit
 * at all: view mode → gear → "Save settings" is now a complete path from
 * opening a dashboard to losing its folder.
 */
const STORED = {
  id: 'd1',
  kind: 'dashboard' as const,
  version: 3,
  body: {
    schemaVersion: 1,
    title: 'Revenue',
    folderId: 'finance',
    owner: 'admin',
    settings: { width: 'fixed' as const },
    pages: [{ id: 'p1', title: 'Overview', items: [] }],
    // Not a field this build knows: markings arrive at F10. A document read
    // today and saved tomorrow must not quietly lose them either.
    markings: [{ id: 'm1', name: 'Selection' }],
  },
};

describe('reading a dashboard for editing', () => {
  it('keeps the fields it does not itself use', () => {
    const read = dashboardOf(STORED) as unknown as Record<string, unknown>;

    expect(read['folderId']).toBe('finance');
    expect(read['owner']).toBe('admin');
    expect(read['markings']).toEqual([{ id: 'm1', name: 'Selection' }]);
  });

  it('still reads the fields it does use', () => {
    // The carry-through must not come at the cost of the defaults a partly
    // written dashboard relies on.
    const read = dashboardOf(STORED);

    expect(read.title).toBe('Revenue');
    expect(read.pages).toHaveLength(1);
    expect(read.settings).toEqual({ width: 'fixed' });
  });

  it('never reads chart drafts out of a stored dashboard', () => {
    /**
     * Drafts belong to one edit session and are never saved (T032), so a
     * stored body carrying them was written by something else. Read as they
     * are, they would draw tiles from specs no query produced — and, being
     * part of the state the session opens with, survive a Discard.
     */
    const smuggled = {
      id: 'd3',
      kind: 'dashboard' as const,
      version: 1,
      body: { title: 'Revenue', chartDrafts: { c1: { document: {}, drawn: { spec: {} } } } },
    };

    expect('chartDrafts' in dashboardOf(smuggled)).toBe(false);
  });

  it('still supplies defaults for a dashboard saved before they existed', () => {
    const old = { id: 'd2', kind: 'dashboard' as const, version: 1, body: { title: 'Old' } };

    const read = dashboardOf(old);

    expect(read.pages).toEqual([]);
    expect(read.schemaVersion).toBe(1);
    expect(read.settings).toBeDefined();
  });
});
