import { describe, expect, it } from 'vitest';

import { refreshEveryRefusal } from './refresh-key';

/**
 * T258 / AC-153: THE SYSTEM SHALL accept only refresh-key crons Cube's
 * refresh worker can run. Cube's compile check only parses the cron; the
 * "equal intervals" check runs later, when a query or the worker generates the
 * refresh key, and then fails every query the rollup serves
 * (research/cube/refresh-key-schedule.md, "The equal-interval rule").
 */
describe('refreshEveryRefusal', () => {
  it('accepts the interval strings Cube reads as intervals', () => {
    for (const every of ['1 hour', '30 minute', '15 minutes', '1 day', '2 week', '10 second'])
      expect(refreshEveryRefusal(every), every).toBeUndefined();
  });

  it('accepts the cron shapes Cube runs as they read', () => {
    // research: "M * * * *", "M H * * *", "M H * * D", "* * * * *", and a leading seconds field.
    for (const every of [
      '* * * * *',
      '15 * * * *',
      '0 8 * * *',
      '30 5 * * 5',
      '0 * * * * *',
      '0 30 5 * * 5',
      '  0   8 * * * ',
    ])
      expect(refreshEveryRefusal(every), every).toBeUndefined();
  });

  it('refuses a cron Cube can’t run: ranges, lists, steps, a day of month or a month', () => {
    for (const every of [
      '55 7 * * 1-5',
      '0 9,17 * * *',
      '*/15 * * * *',
      '0 0 1 * *',
      '0 0 * 1 *',
      '0 8 * * MON',
      '@hourly',
    ])
      expect(refreshEveryRefusal(every), every).toMatch(/can’t run/);
  });

  it('refuses a cron Cube would run on another schedule than it states', () => {
    // "0 * * * 1" runs hourly every day; "* 9 * * *" every minute all day (the research's table).
    expect(refreshEveryRefusal('0 * * * 1')).toMatch(/every hour, every day/);
    expect(refreshEveryRefusal('* 9 * * *')).toMatch(/every minute, all day/);
    expect(refreshEveryRefusal('* 9 * * 1')).toMatch(/every minute/);
  });

  it('refuses a field out of its range, and a string that is neither', () => {
    expect(refreshEveryRefusal('61 * * * *')).toMatch(/minute/);
    expect(refreshEveryRefusal('0 24 * * *')).toMatch(/hour/);
    expect(refreshEveryRefusal('0 0 * * 8')).toMatch(/day of the week/);
    // Not an interval — Cube's own reads "1 Hour" as a cron, and refuses it.
    expect(refreshEveryRefusal('1 Hour')).toMatch(/interval|cron/);
    expect(refreshEveryRefusal('1 month')).toMatch(/interval|cron/);
  });
});
