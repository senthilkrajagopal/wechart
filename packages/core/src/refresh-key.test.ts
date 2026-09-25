import { describe, expect, it } from 'vitest';

import {
  nextRefreshes,
  refreshLagSeconds,
  refreshPeriodOf,
  refreshEveryRefusal,
} from './refresh-key';

/**
 * T159 / AC-153: the next runs a refresh key implies, as Cube computes its
 * turn-over: key(t) = floor((O + t − D) / I), turning over at D − O + k·I
 * (research/cube/refresh-key-schedule.md, "Turn-over formula"). I and D are
 * pinned by Cube's own tests (research, "The equal-interval rule").
 */
describe('refreshPeriodOf', () => {
  it('matches Cube’s own test vectors for I and D', () => {
    expect(refreshPeriodOf('0 * * * *')).toEqual({ period: 3600, phase: 0, cron: true });
    expect(refreshPeriodOf('30 * * * *')).toEqual({ period: 3600, phase: 1800, cron: true });
    expect(refreshPeriodOf('0 10 * * *')).toEqual({ period: 86400, phase: 36000, cron: true });
    expect(refreshPeriodOf('30 5 * * 5')).toEqual({ period: 604800, phase: 106200, cron: true });
    expect(refreshPeriodOf('0 * * * * *')).toEqual({ period: 60, phase: 0, cron: true });
    expect(refreshPeriodOf('* * * * *')).toEqual({ period: 60, phase: 0, cron: true });
    // Sunday as 7 is Sunday as 0.
    expect(refreshPeriodOf('0 0 * * 7')).toEqual(refreshPeriodOf('0 0 * * 0'));
  });

  it('reads an interval as its length from the epoch', () => {
    expect(refreshPeriodOf('1 hour')).toEqual({ period: 3600, phase: 0, cron: false });
    expect(refreshPeriodOf('30 minutes')).toEqual({ period: 1800, phase: 0, cron: false });
    expect(refreshPeriodOf('2 week')).toEqual({ period: 1209600, phase: 0, cron: false });
  });

  it('has none for what Cube can’t run', () => {
    expect(refreshPeriodOf('55 7 * * 1-5')).toBeUndefined();
    expect(refreshPeriodOf('0 * * * 1')).toBeUndefined();
  });
});

describe('nextRefreshes', () => {
  const at = (iso: string) => new Date(iso);

  it('turns a cron over at its time in its zone: 08:00 in Los Angeles is 15:00 UTC in summer', () => {
    // The research's worked example: 0 8 * * * in America/Los_Angeles, in PDT.
    expect(
      nextRefreshes('0 8 * * *', 'America/Los_Angeles', at('2026-09-24T12:00:00Z'), 2).map((each) =>
        each.toISOString(),
      ),
    ).toEqual(['2026-09-24T15:00:00.000Z', '2026-09-25T15:00:00.000Z']);
  });

  it('runs a cron with no zone in UTC, and a weekly one on its day', () => {
    expect(
      nextRefreshes('0 8 * * *', undefined, at('2026-09-24T12:00:00Z'), 1)[0]?.toISOString(),
    ).toBe('2026-09-25T08:00:00.000Z');
    // 2026-09-24 is a Thursday; "30 5 * * 5" is Fridays at 05:30.
    expect(
      nextRefreshes('30 5 * * 5', undefined, at('2026-09-24T12:00:00Z'), 2).map((each) =>
        each.toISOString(),
      ),
    ).toEqual(['2026-09-25T05:30:00.000Z', '2026-10-02T05:30:00.000Z']);
  });

  it('counts an interval from the epoch in UTC, where wechart builds', () => {
    expect(
      nextRefreshes('1 hour', undefined, at('2026-09-24T12:34:56Z'), 2).map((each) =>
        each.toISOString(),
      ),
    ).toEqual(['2026-09-24T13:00:00.000Z', '2026-09-24T14:00:00.000Z']);
    // An interval of a week turns over on Thursdays, as the epoch did.
    expect(
      nextRefreshes('1 week', undefined, at('2026-09-24T12:00:00Z'), 1)[0]?.toISOString(),
    ).toBe('2026-10-01T00:00:00.000Z');
  });

  it('shows none for what Cube can’t run', () => {
    expect(nextRefreshes('55 7 * * 1-5', 'UTC', at('2026-09-24T12:00:00Z'), 3)).toEqual([]);
  });
});

describe('refreshLagSeconds', () => {
  it('is how stale Cube lets a key get, plus the worker’s 30 s beat', () => {
    // research, "Refresh worker cadence": min(max(round(I/10), 1), 300) + 30.
    expect(refreshLagSeconds('* * * * *')).toBe(36);
    expect(refreshLagSeconds('15 minute')).toBe(120);
    expect(refreshLagSeconds('0 8 * * *')).toBe(330);
    expect(refreshLagSeconds('55 7 * * 1-5')).toBeUndefined();
  });
});

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
