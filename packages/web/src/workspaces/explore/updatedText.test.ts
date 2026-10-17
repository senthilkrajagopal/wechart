import { describe, expect, it } from 'vitest';

import { updatedText } from './LibraryChartPage';

/**
 * T686 (DSH-12; design 06, main screen and state B; the coordinator's call):
 * a chart page's Updated section says the day it was last saved, as every day
 * is written since T477, and by whom where its history names an author the
 * user may see.
 */
describe('a chart page’s Updated section (T686)', () => {
  const now = new Date(2026, 9, 17, 12, 0);

  it('says the day and who saved it, where its history names them', () => {
    expect(updatedText(new Date(2026, 8, 21, 9, 30).toISOString(), { name: 'Ada Admin' }, now)).toBe(
      '21 Sep by Ada Admin',
    );
  });

  it('says the day alone where no author can be named', () => {
    expect(updatedText(new Date(2026, 8, 21, 9, 30).toISOString(), null, now)).toBe('21 Sep');
  });

  it('adds the year to a day in another one', () => {
    expect(updatedText(new Date(2025, 11, 2).toISOString(), null, now)).toBe('2 Dec 2025');
  });
});
