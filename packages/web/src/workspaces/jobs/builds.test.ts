import { describe, expect, it } from 'vitest';

import { exactOf } from '../../shell/formatTime';
import { whenOf } from './builds';

/**
 * T477 (AC-187; the coordinator's Q6–Q10): a build's moment as the one format
 * writes it. en-GB's short month is "Sept" in this runtime, which no design
 * writes; the title is the exact local time with UTC beside it.
 */
describe('when a build ran (T477)', () => {
  const now = new Date(2026, 9, 8, 15, 0);

  it('is "Today …", "Yesterday …", else the day first, with "Sep" for September', () => {
    expect(whenOf(new Date(2026, 9, 8, 14, 5, 12).toISOString(), now).shown).toBe('Today 14:05:12');
    expect(whenOf(new Date(2026, 9, 7, 16, 20, 31).toISOString(), now).shown).toBe(
      'Yesterday 16:20:31',
    );
    expect(whenOf(new Date(2026, 8, 29, 7, 55, 0).toISOString(), now).shown).toBe(
      '29 Sep 07:55:00',
    );
  });

  it('gives the exact local time with UTC beside it for its title', () => {
    const at = new Date(2026, 8, 29, 7, 55, 0);
    expect(whenOf(at.toISOString(), now).utc).toBe(exactOf(at));
  });
});
