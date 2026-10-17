import { describe, expect, it } from 'vitest';

import { savedOn } from './savedOn';

/**
 * T742 (AC-343; design 10, state B; design-10-Q2): a bookmark's row shows the
 * date it was first saved, day first: "today", "22 Sep". In local time, as
 * the reader's day is.
 */
describe('savedOn', () => {
  const now = new Date(2026, 9, 17, 15, 30);

  it('says "today" for a time earlier the same day', () => {
    expect(savedOn(new Date(2026, 9, 17, 0, 5).toISOString(), now)).toBe('today');
  });

  it('says the day and the month, day first, for an earlier day this year', () => {
    expect(savedOn(new Date(2026, 8, 22, 9).toISOString(), now)).toBe('22 Sep');
    expect(savedOn(new Date(2026, 9, 16, 23, 59).toISOString(), now)).toBe('16 Oct');
    expect(savedOn(new Date(2026, 0, 3).toISOString(), now)).toBe('3 Jan');
  });

  it('adds the year for another year', () => {
    expect(savedOn(new Date(2025, 9, 17, 12).toISOString(), now)).toBe('17 Oct 2025');
  });

  it('says nothing for a date it can’t read', () => {
    expect(savedOn('not a date', now)).toBeUndefined();
  });
});
