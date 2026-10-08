import { describe, expect, it } from 'vitest';

import { clockOf, clockOrWhenOf, dayOf, exactOf, utcOf, whenOf } from './formatTime';

/**
 * T477 (AC-187; UX-110; the coordinator's calls Q6–Q10 under R37): one way
 * of writing a date and a time, as the later approved designs write them.
 * Day first ("27 Sep", never "Sep 27" or "27 Sept"), one 24-hour clock, the
 * year only when it isn't this one's, no comma between a date and its time,
 * and the exact local time with UTC beside it for a tooltip.
 *
 * Built from local parts, so each test reads the same in any zone; the UTC
 * half is checked against the Date's own UTC parts.
 */
const now = new Date(2026, 9, 8, 15, 30, 0); // Thu 8 Oct 2026, 15:30 local
const at = (month: number, day: number, hours: number, minutes: number, seconds = 0, year = 2026) =>
  new Date(year, month, day, hours, minutes, seconds);

describe('a day (T477)', () => {
  it('is day first with the short month, the year only for another year', () => {
    expect(dayOf(at(8, 27, 9, 0), now)).toBe('27 Sep');
    expect(dayOf(at(0, 1, 9, 0), now)).toBe('1 Jan');
    expect(dayOf(at(11, 31, 9, 0, 0, 2025), now)).toBe('31 Dec 2025');
  });

  it('writes September "Sep", never "Sept"', () => {
    for (const day of [1, 9, 24, 30]) expect(dayOf(at(8, day, 12, 0), now)).not.toMatch(/Sept/);
  });
});

describe('a clock (T477)', () => {
  it('is 24-hour, to the minute or to the second', () => {
    expect(clockOf(at(9, 8, 3, 27))).toBe('03:27');
    expect(clockOf(at(9, 8, 15, 2, 11), { seconds: true })).toBe('15:02:11');
    expect(clockOf(at(9, 8, 23, 5))).toBe('23:05');
    expect(clockOf(at(9, 8, 0, 0))).toBe('00:00');
  });
});

describe('a moment (T477)', () => {
  it('is "Today 14:05" and "Yesterday 16:40", then the day and its time with no comma', () => {
    expect(whenOf(at(9, 8, 14, 5), now)).toBe('Today 14:05');
    expect(whenOf(at(9, 7, 16, 40), now)).toBe('Yesterday 16:40');
    expect(whenOf(at(8, 24, 9, 40), now)).toBe('24 Sep 09:40');
    expect(whenOf(at(11, 31, 22, 1, 0, 2025), now)).toBe('31 Dec 2025 22:01');
  });

  it('carries seconds where a surface draws them', () => {
    expect(whenOf(at(9, 8, 15, 2, 11), now, { seconds: true })).toBe('Today 15:02:11');
    expect(whenOf(at(8, 24, 9, 40, 55), now, { seconds: true })).toBe('24 Sep 09:40:55');
  });

  it('counts today and yesterday by the calendar, not by 24 hours', () => {
    expect(whenOf(at(9, 7, 23, 59), new Date(2026, 9, 8, 0, 1))).toBe('Yesterday 23:59');
    expect(whenOf(at(9, 6, 23, 59), new Date(2026, 9, 8, 0, 1))).toBe('6 Oct 23:59');
  });
});

describe('a clock where a design draws one (T477)', () => {
  it('is the clock alone today, and the moment with its day on another day', () => {
    expect(clockOrWhenOf(at(9, 8, 14, 39), now)).toBe('14:39');
    expect(clockOrWhenOf(at(9, 7, 14, 39, 5), now, { seconds: true })).toBe('Yesterday 14:39:05');
    expect(clockOrWhenOf(at(8, 28, 9, 12), now)).toBe('28 Sep 09:12');
  });
});

describe('the UTC time, written beside a local one (T477)', () => {
  it('is the UTC clock to the second, its day named only where it differs', () => {
    const moment = new Date(Date.UTC(2026, 8, 27, 9, 48, 3));
    const sameDay = moment.getUTCDate() === moment.getDate();
    expect(utcOf(moment)).toBe(sameDay ? '09:48:03 UTC' : '27 Sep 09:48:03 UTC');
  });
});

describe('the exact time, for a tooltip (T477)', () => {
  it('is the local day and time to the second, with UTC beside it', () => {
    const moment = at(8, 27, 14, 5, 12);
    const pad = (n: number) => String(n).padStart(2, '0');
    const utcClock = `${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())}:${pad(moment.getUTCSeconds())}`;
    const sameDay = moment.getUTCDate() === moment.getDate();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const utc = sameDay
      ? `${utcClock} UTC`
      : `${String(moment.getUTCDate())} ${months[moment.getUTCMonth()] ?? ''} ${utcClock} UTC`;
    expect(exactOf(moment)).toBe(`27 Sep 2026 14:05:12 (${utc})`);
  });
});

/**
 * Where the local day and UTC's differ (T477's review): read in fixed zones,
 * so the branch is taken whatever zone the suite runs in. Node reads `TZ`
 * afresh each time it is set.
 */
describe('a moment on another UTC day (T477)', () => {
  const inZone = (zone: string, check: () => void) => {
    const was = process.env['TZ'];
    process.env['TZ'] = zone;
    try {
      check();
    } finally {
      if (was === undefined) delete process.env['TZ'];
      else process.env['TZ'] = was;
    }
  };

  it('names the UTC day east of Greenwich, where UTC is still yesterday', () => {
    inZone('Asia/Tokyo', () => {
      const moment = new Date(Date.UTC(2026, 8, 26, 23, 5, 12));
      expect(utcOf(moment)).toBe('26 Sep 23:05:12 UTC');
      expect(exactOf(moment)).toBe('27 Sep 2026 08:05:12 (26 Sep 23:05:12 UTC)');
    });
  });

  it('names the UTC day west of Greenwich, where UTC is already tomorrow', () => {
    inZone('America/Los_Angeles', () => {
      const moment = new Date(Date.UTC(2026, 8, 27, 3, 0, 0));
      expect(exactOf(moment)).toBe('26 Sep 2026 20:00:00 (27 Sep 03:00:00 UTC)');
    });
  });

  it('names the UTC year where it differs from the local one', () => {
    inZone('Asia/Tokyo', () => {
      const moment = new Date(Date.UTC(2026, 11, 31, 23, 30, 0));
      expect(exactOf(moment)).toBe('1 Jan 2027 08:30:00 (31 Dec 2026 23:30:00 UTC)');
    });
  });

  it('is the UTC clock alone on the same day', () => {
    inZone('Asia/Tokyo', () => {
      expect(utcOf(new Date(Date.UTC(2026, 8, 27, 9, 48, 3)))).toBe('09:48:03 UTC');
    });
  });
});
