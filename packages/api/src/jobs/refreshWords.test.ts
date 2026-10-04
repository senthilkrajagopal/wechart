import { describe, expect, it } from 'vitest';

import { modelKeysOf, refreshWordsOf, type ModelKeys } from './refreshWords';

/**
 * T551 / AC-154 (T160's review): a pre-aggregation's refresh schedule in
 * words and as written, one function for Schedules and Jobs' Trigger, by
 * the research's "honest description" of each kind of key
 * (research/cube/refresh-key-schedule.md, "What /v1/meta?extended shows" and
 * "For Schedules"), in design 16's words (screen 2, pin 6; D5).
 */
const ROOT = { folderId: 'root', shortName: 'orders' };
const said = (
  rollup: Record<string, unknown>,
  cube: Record<string, unknown> = {},
  model?: ModelKeys,
) =>
  refreshWordsOf(
    { type: 'rollup', name: 'main', ...rollup },
    { name: 'orders', ...cube },
    model,
    ROOT,
  );

describe('a refresh key in words', () => {
  it('says a cron Cube runs in plain words, in its zone, or UTC with none', () => {
    expect(
      said({ refreshKey: { every: '0 8 * * *', timezone: 'America/Los_Angeles' } }),
    ).toMatchObject({
      kind: 'key',
      scheduled: true,
      words: 'Daily at 08:00, Los Angeles',
      written: 'every: "0 8 * * *" · timezone: America/Los_Angeles',
      runs: { every: '0 8 * * *', timezone: 'America/Los_Angeles' },
    });
    expect(said({ refreshKey: { every: '0 2 * * *' } }).words).toBe('Daily at 02:00 UTC');
    expect(said({ refreshKey: { every: '0 7 * * 1', timezone: 'Europe/Berlin' } }).words).toBe(
      'At 07:00 every Monday, Berlin',
    );
    expect(said({ refreshKey: { every: '15 * * * *' } }).words).toBe('Hourly at :15');
    expect(said({ refreshKey: { every: '* * * * *' } }).words).toBe('Every minute');
    expect(said({ refreshKey: { every: '30 0 6 * * *' } }).words).toBe('Daily at 06:00:30 UTC');
  });

  it('says an interval with the clock it counts from, UTC, where that matters', () => {
    // research, "Turn-over formula": an interval counts from the epoch in the build zone, UTC.
    expect(said({ refreshKey: { every: '1 hour' } })).toMatchObject({
      words: 'Every hour',
      written: 'every: 1 hour',
      runs: { every: '1 hour' },
    });
    expect(said({ refreshKey: { every: '30 minute' } }).words).toBe('Every 30 minutes');
    expect(said({ refreshKey: { every: '6 hours' } }).words).toBe('Every 6 hours, from 00:00 UTC');
    expect(said({ refreshKey: { every: '1 day' } }).words).toBe('Every day, from 00:00 UTC');
    expect(said({ refreshKey: { every: '1 week' } }).words).toBe(
      'Every week, from Thursday 00:00 UTC',
    );
    expect(said({ refreshKey: { every: '7 hour' } }).words).toBe(
      'Every 7 hours, counted from 1 Jan 1970, 00:00 UTC',
    );
  });

  it('says what incremental rebuilds, on a cron as on an interval', () => {
    // research, "For Schedules": only partitions whose end plus update_window is after now.
    expect(
      said({ refreshKey: { every: '0 3 * * *', incremental: true, updateWindow: '7 day' } }),
    ).toMatchObject({
      words: 'Daily at 03:00 UTC, rebuilding only partitions ending in the last 7 day',
      written: 'every: "0 3 * * *" · incremental: true · update_window: 7 day',
    });
    expect(said({ refreshKey: { every: '1 hour', incremental: true } }).words).toBe(
      'Every hour, rebuilding only the current partition',
    );
  });

  it('says a key of SQL by its check, from the model’s file, which the metadata drops', () => {
    const model = modelKeysOf([
      {
        path: 'cubes/orders.yml',
        content: [
          'cubes:',
          '  - name: orders',
          '    pre_aggregations:',
          '      - name: main',
          '        refresh_key:',
          '          sql: SELECT MAX(id) FROM orders',
          '          every: 30 minute',
          '      - name: bare',
          '        refresh_key:',
          '          sql: SELECT MAX(id) FROM orders',
          '',
        ].join('\n'),
      },
    ]);
    expect(said({ refreshKey: { every: '30 minute' } }, {}, model)).toMatchObject({
      kind: 'sql',
      words: 'When its SQL returns a new value, checked every 30 minutes',
      written: 'sql: SELECT MAX(id) FROM orders · every: 30 minute',
    });
    expect(said({ refreshKey: { every: '30 minute' } }, {}, model).runs).toBeUndefined();
    expect(said({ name: 'bare', refreshKey: {} }, {}, model).words).toBe(
      'When its SQL returns a new value, checked every 10 seconds',
    );
    // Its SQL unread (a file wechart doesn't hold): `{}` is still a key of SQL alone.
    expect(said({ refreshKey: {} }).kind).toBe('sql');
  });

  it('says what none declared means, by its cube’s key and the cubes it reads', () => {
    // research, "The effective key when none is declared".
    expect(said({})).toMatchObject({
      kind: 'default',
      words: 'Cube’s default: every hour',
      written: 'no refresh_key declared',
      runs: { every: '1 hour' },
    });
    expect(said({}, { refreshKey: { every: '0 6 * * *' } })).toMatchObject({
      words: 'Its cube’s refresh key: daily at 06:00 UTC',
      written: 'no refresh_key declared · its cube’s: every: "0 6 * * *"',
      runs: { every: '0 6 * * *' },
    });
    const twoCubes = modelKeysOf([
      {
        path: 'cubes/orders.yml',
        content: [
          'cubes:',
          '  - name: orders',
          '    refresh_key:',
          '      every: 1 day',
          '    pre_aggregations:',
          '      - name: joined',
          '        measures: [CUBE.count, customers.count]',
          '      - name: own',
          '        measures: [count]',
          '  - name: customers',
          '    refresh_key:',
          '      sql: SELECT MAX(id) FROM customers',
          '',
        ].join('\n'),
      },
    ]);
    // Over several cubes, with a key on one: each cube's own, so no one schedule.
    expect(said({ name: 'joined' }, { refreshKey: { every: '1 day' } }, twoCubes)).toMatchObject({
      kind: 'cube-keys',
      words: 'Each of its cubes’ own refresh key',
    });
    expect(
      said({ name: 'joined' }, { refreshKey: { every: '1 day' } }, twoCubes).runs,
    ).toBeUndefined();
    expect(said({ name: 'own' }, { refreshKey: { every: '1 day' } }, twoCubes).words).toBe(
      'Its cube’s refresh key: every day, from 00:00 UTC',
    );
  });

  it('says original SQL’s default is its cube’s key, or its database’s', () => {
    expect(said({ type: 'originalSql' })).toMatchObject({
      kind: 'default',
      words: 'Cube’s default for its database',
      written: 'no refresh_key declared · original_sql',
    });
    expect(said({ type: 'originalSql' }).runs).toBeUndefined();
    expect(said({ type: 'originalSql' }, { refreshKey: { every: '1 hour' } }).words).toBe(
      'Its cube’s refresh key: every hour',
    );
  });

  it('says what Cube’s refresh worker never runs is not scheduled, as written', () => {
    expect(said({ scheduledRefresh: false, refreshKey: { every: '1 hour' } })).toMatchObject({
      kind: 'not-scheduled',
      scheduled: false,
      words: 'Not scheduled',
      written: 'scheduled_refresh: false',
    });
    expect(said({ type: 'rollupLambda' })).toMatchObject({
      kind: 'not-scheduled',
      written: 'type: rollup_lambda',
    });
    expect(said({ type: 'rollupJoin' }).written).toBe('type: rollup_join');
  });

  it('says a cron Cube can’t run as written, and foretells no run', () => {
    const odd = said({ refreshKey: { every: '55 7 * * 1-5' } });
    expect(odd.words).toBe('"55 7 * * 1-5", which Cube’s refresh worker can’t run');
    expect(odd.runs).toBeUndefined();
    // Why, in the words the model editor and the publish use (T551's review).
    expect(odd.problem).toBe(
      'Cube’s refresh worker can’t run "55 7 * * 1-5": Cube runs only crons of the form "[second] minute hour * * day-of-week", each of those a single number or *, with no ranges, lists, steps, names, day of the month or month.',
    );
  });
});

/** T551's review. */
describe('a refresh key in words, as Cube runs it', () => {
  it('says a key of SQL is checked on its interval with no clock to align to', () => {
    // research, "For Schedules": "The check runs once the cached value is `every` old; it is not aligned to the clock".
    const model = modelKeysOf([
      {
        path: 'cubes/orders.yml',
        content: [
          'cubes:',
          '  - name: orders',
          '    pre_aggregations:',
          '      - name: main',
          '        refresh_key:',
          '          sql: SELECT MAX(id) FROM orders',
          '          every: 1 day',
          '',
        ].join('\n'),
      },
    ]);
    expect(said({ refreshKey: { every: '1 day' } }, {}, model).words).toBe(
      'When its SQL returns a new value, checked every day',
    );
    expect(said({ refreshKey: { every: '7 hour' } }, {}, model).words).toBe(
      'When its SQL returns a new value, checked every 7 hours',
    );
  });

  it('counts the cubes a join path reaches among those a rollup reads', () => {
    // research cube/rollup-join-paths.md: a path reference adds each cube on it to the join.
    const model = modelKeysOf([
      {
        path: 'cubes/orders.yml',
        content: [
          'cubes:',
          '  - name: orders',
          '    refresh_key:',
          '      every: 1 day',
          '    pre_aggregations:',
          '      - name: by_city',
          '        measures: [CUBE.count]',
          '        dimensions: [CUBE.customers.city]',
          '',
        ].join('\n'),
      },
    ]);
    expect(said({ name: 'by_city' }, { refreshKey: { every: '1 day' } }, model)).toMatchObject({
      kind: 'cube-keys',
      words: 'Each of its cubes’ own refresh key',
    });
  });

  it('gives how late a run can start by the key’s own threshold: the hourly fallback’s is 10 s', () => {
    // research, "Refresh worker cadence": threshold + the 30 s tick.
    expect(said({ refreshKey: { every: '1 hour' } }).lagSeconds).toBe(330);
    expect(said({ refreshKey: { every: '* * * * *' } }).lagSeconds).toBe(36);
    expect(said({}).lagSeconds).toBe(40);
    expect(said({ refreshKey: {} }).lagSeconds).toBeUndefined();
  });
});
