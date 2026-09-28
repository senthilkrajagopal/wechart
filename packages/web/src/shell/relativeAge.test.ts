import { describe, expect, it } from 'vitest';

import { shortAgo, shortDay } from './relativeAge';

describe('times as design 01 of 2026-09-27 writes them (T490, T496)', () => {
  const now = new Date(2026, 8, 27, 15, 0);

  it('says how long ago in the health column’s short units', () => {
    expect(shortAgo(new Date(2026, 8, 27, 13, 0), now)).toBe('2 h ago');
    expect(shortAgo(new Date(2026, 8, 27, 14, 35), now)).toBe('25 min ago');
  });

  it('writes a day as the month and day, and the year only when it isn’t this one', () => {
    expect(shortDay(new Date(2026, 8, 26, 10, 0), now)).toBe('Sep 26');
    expect(shortDay(new Date(2026, 0, 3, 10, 0), now)).toBe('Jan 3');
    expect(shortDay(new Date(2025, 11, 30, 10, 0), now)).toBe('Dec 30, 2025');
  });
});
