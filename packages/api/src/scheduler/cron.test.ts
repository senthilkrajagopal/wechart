import { describe, expect, it } from 'vitest';

import { readCron, nextRunsOf } from './cron';

/**
 * T378 / AC-234 (design 16, states D2–D4): a wechart schedule's cron, five
 * fields and a zone. It is read back in words; one wechart can't read is
 * refused, naming the field; one a refresh key could run is accepted and
 * flagged (Q11); and its next runs come from pg-boss's own `previewSchedule`,
 * so what is shown is what it runs (research scheduler.md), listed across a
 * daylight-saving change at the zone's own time, with the change marked (Q3).
 */
describe('reading a cron', () => {
  it('reads a five-field cron back in words', () => {
    expect(readCron('0 6 * * *')).toEqual({
      ok: true,
      words: 'At 06:00 every day.',
      refreshKeyCould: true,
    });
    expect(readCron('0 5 1 * *')).toMatchObject({
      ok: true,
      words: 'At 05:00 on day 1 of every month.',
    });
    expect(readCron('0 4 1 1,4,7,10 *')).toMatchObject({
      ok: true,
      words: 'At 04:00 on day 1 of January, April, July and October.',
    });
    expect(readCron('0 7 * 10,11 1')).toMatchObject({
      ok: true,
      words: 'At 07:00 every Monday in October and November.',
    });
    expect(readCron('55 7 * * 1-5')).toMatchObject({
      ok: true,
      words: 'At 07:55, Monday to Friday.',
      refreshKeyCould: false,
    });
    expect(readCron('0 8-18 * * 1-5')).toMatchObject({
      ok: true,
      words: 'Every hour from 08:00 to 18:00, Monday to Friday.',
    });
    expect(readCron('*/15 * * * *')).toMatchObject({ ok: true, words: 'Every 15 minutes.' });
    expect(readCron('30 * * * *')).toMatchObject({
      ok: true,
      words: 'At 30 minutes past every hour.',
    });
  });

  it('refuses one it can’t read, naming the field', () => {
    expect(readCron('0 25 * * 1-5')).toEqual({
      ok: false,
      problem: 'The hour is 25; it must be 0 to 23.',
    });
    expect(readCron('0 0 7 * * 1')).toEqual({
      ok: false,
      problem:
        'That’s six fields. wechart’s schedules take five: minute, hour, day of month, month, day of week.',
    });
    expect(readCron('61 * * * *')).toMatchObject({
      ok: false,
      problem: 'The minute is 61; it must be 0 to 59.',
    });
    expect(readCron('0 0 32 * *')).toMatchObject({
      ok: false,
      problem: 'The day of month is 32; it must be 1 to 31.',
    });
    expect(readCron('0 0 * 13 *')).toMatchObject({
      ok: false,
      problem: 'The month is 13; it must be 1 to 12.',
    });
    expect(readCron('0 0 * * 8')).toMatchObject({
      ok: false,
      problem: 'The day of week is 8; it must be 0 to 7.',
    });
    expect(readCron('0 x * * *')).toMatchObject({
      ok: false,
      problem: 'The hour “x” isn’t a number, a range, a list or a step.',
    });
    expect(readCron('0 8 * *')).toMatchObject({
      ok: false,
      problem:
        'That’s four fields. wechart’s schedules take five: minute, hour, day of month, month, day of week.',
    });
  });

  it('flags one a refresh key could run, as Cube runs it as written (Q11)', () => {
    // core's refreshEveryRefusal: what Cube's refresh worker runs as written.
    expect(readCron('0 6 * * *')).toMatchObject({ refreshKeyCould: true });
    expect(readCron('30 5 * * 5')).toMatchObject({ refreshKeyCould: true });
    expect(readCron('0 5 1 * *')).toMatchObject({ refreshKeyCould: false });
    expect(readCron('*/15 * * * *')).toMatchObject({ refreshKeyCould: false });
  });
});

describe('a schedule’s next runs', () => {
  it('lists the next five in its zone and in UTC, across a daylight-saving change at the zone’s own time (D4)', () => {
    // "0 7 * 10,11 1" in Berlin from Fri 2 Oct 2026: the clocks go back on Sun 25 Oct.
    const { runs, change } = nextRunsOf(
      '0 7 * 10,11 1',
      'Europe/Berlin',
      new Date('2026-10-02T12:00:00Z'),
      5,
    );

    expect(runs.map((run) => run.toISOString())).toEqual([
      '2026-10-05T05:00:00.000Z',
      '2026-10-12T05:00:00.000Z',
      '2026-10-19T05:00:00.000Z',
      // 07:00 stays 07:00: an hour later in UTC.
      '2026-10-26T06:00:00.000Z',
      '2026-11-02T06:00:00.000Z',
    ]);
    expect(change).toEqual({ at: new Date('2026-10-25T01:00:00Z'), back: true, before: 3 });
  });

  it('lists five with no change marked when none comes among them', () => {
    const { runs, change } = nextRunsOf(
      '0 6 * * *',
      'Europe/Berlin',
      new Date('2026-09-01T12:00:00Z'),
      5,
    );
    expect(runs).toHaveLength(5);
    expect(change).toBeUndefined();
  });

  it('lists them across the spring change too, at the zone’s own time (D4)', () => {
    // Berlin's clocks go forward on Sun 29 Mar 2026, 01:00 UTC.
    const { runs, change } = nextRunsOf(
      '0 7 * 3,4 1',
      'Europe/Berlin',
      new Date('2026-03-10T12:00:00Z'),
      5,
    );

    expect(runs.map((run) => run.toISOString())).toEqual([
      '2026-03-16T06:00:00.000Z',
      '2026-03-23T06:00:00.000Z',
      // 07:00 stays 07:00: an hour earlier in UTC.
      '2026-03-30T05:00:00.000Z',
      '2026-04-06T05:00:00.000Z',
      '2026-04-13T05:00:00.000Z',
    ]);
    expect(change).toEqual({ at: new Date('2026-03-29T01:00:00Z'), back: false, before: 2 });
  });

  it('gives a time the spring change skips as pg-boss runs it: an hour later that day', () => {
    // 02:30 doesn't happen in Berlin on 29 Mar 2026; pg-boss runs it at 03:30.
    const { runs } = nextRunsOf('30 2 * * *', 'Europe/Berlin', new Date('2026-03-27T12:00:00Z'), 4);

    expect(runs.map((run) => run.toISOString())).toEqual([
      '2026-03-28T01:30:00.000Z',
      '2026-03-29T01:30:00.000Z',
      '2026-03-30T00:30:00.000Z',
      '2026-03-31T00:30:00.000Z',
    ]);
  });
});
