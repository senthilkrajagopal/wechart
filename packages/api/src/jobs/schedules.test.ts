import { describe, expect, it } from 'vitest';

import { schedulesFrom } from './schedules';

/**
 * T160 / AC-154: Schedules lists every pre-aggregation's refresh schedule,
 * each Cube's refresh worker's, and says when one is not scheduled. The words
 * are the research's "honest description" for each kind of key, read from
 * `/v1/meta?extended`, which shows a key as written
 * (research/cube/refresh-key-schedule.md, "What /v1/meta?extended shows").
 */
const meta = (preAggregations: Record<string, unknown>[], cube: Record<string, unknown> = {}) => ({
  cubes: [{ name: 'orders', fileName: 'cubes/orders.yml', preAggregations, ...cube }],
});

describe('schedulesFrom, in items mode (T449)', () => {
  it('names the stored file that declares the cube, not xcube’s resolved file', () => {
    const [schedule] = schedulesFrom(
      {
        cubes: [
          {
            name: 'orders',
            fileName: 'orders.yml',
            preAggregations: [{ name: 'hourly', type: 'rollup', refreshKey: { every: '1 hour' } }],
          },
        ],
      },
      [{ path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' }],
    );

    expect(schedule?.fileName).toBe('cubes/orders.yml');
  });
});

describe('schedulesFrom', () => {
  it('says a cron with its zone, and a cron with none in UTC, as Cube runs it', () => {
    const [zoned, bare] = schedulesFrom(
      meta([
        {
          name: 'mornings',
          type: 'rollup',
          refreshKey: { every: '0 8 * * *', timezone: 'America/Los_Angeles' },
        },
        { name: 'hourly', type: 'rollup', refreshKey: { every: '0 * * * *' } },
      ]),
    );
    expect(zoned).toEqual({
      id: 'orders.mornings',
      cube: 'orders',
      name: 'mornings',
      type: 'rollup',
      fileName: 'cubes/orders.yml',
      owner: 'cube',
      scheduled: true,
      when: 'At "0 8 * * *" in America/Los_Angeles',
      every: '0 8 * * *',
      timezone: 'America/Los_Angeles',
    });
    expect(bare?.when).toBe('At "0 * * * *" in UTC');
  });

  it('says an interval, incremental and its window as written', () => {
    const [plain, incremental] = schedulesFrom(
      meta([
        { name: 'daily', refreshKey: { every: '1 day' } },
        {
          name: 'recent',
          refreshKey: { every: '1 hour', incremental: true, updateWindow: '7 day' },
        },
      ]),
    );
    expect(plain?.when).toBe('Every 1 day');
    expect(incremental?.when).toBe('Every 1 hour, incrementally, rebuilding the last 7 day');
  });

  it('says what the SQL check means, and a default key by its cube', () => {
    const rows = schedulesFrom(
      meta(
        [
          // A key of SQL alone: its SQL is dropped from the metadata (research, probe d).
          { name: 'by_sql', refreshKey: {} },
          { name: 'inherits' },
        ],
        { refreshKey: { every: '30 minute' } },
      ),
    );
    expect(rows.map((row) => row.when)).toEqual([
      'When its SQL returns a new value, checked every 10 seconds',
      'As its cube’s refresh key: every 30 minute',
    ]);
    expect(schedulesFrom(meta([{ name: 'plain' }]))[0]?.when).toBe('Every 1 hour (Cube’s default)');
  });

  it('says a pre-aggregation Cube never refreshes is not scheduled', () => {
    const rows = schedulesFrom(
      meta([
        { name: 'off', type: 'rollup', scheduledRefresh: false, refreshKey: { every: '1 hour' } },
        { name: 'lambda', type: 'rollupLambda' },
        { name: 'joined', type: 'rollupJoin' },
      ]),
    );
    expect(rows.map(({ scheduled, when }) => ({ scheduled, when }))).toEqual([
      { scheduled: false, when: 'Not scheduled: built only when asked for, from Jobs' },
      { scheduled: false, when: 'Not scheduled: it reads the rollups it joins' },
      { scheduled: false, when: 'Not scheduled: it reads the rollups it joins' },
    ]);
  });

  it('lists nothing from metadata it cannot read', () => {
    expect(schedulesFrom(undefined)).toEqual([]);
    expect(schedulesFrom({ cubes: 'no' })).toEqual([]);
  });

  /**
   * T273's review: the metadata drops a key's `sql`, so `{sql, every}` reads
   * as a plain `{every}` — "rebuilt hourly" where it is only checked hourly
   * and rebuilt when the SQL's value changes. The research: read `sql` from
   * the YAML wechart owns (refresh-key-schedule.md, "What /v1/meta?extended
   * shows").
   */
  it('says a key with SQL is checked on its interval and rebuilt when the SQL changes, from the model file', () => {
    const files = [
      {
        path: 'cubes/orders.yml',
        content: [
          'cubes:',
          '  - name: orders',
          '    sql_table: orders',
          '    pre_aggregations:',
          '      - name: checked',
          '        refresh_key:',
          '          sql: SELECT MAX(updated_at) FROM orders',
          '          every: 1 hour',
          '      - name: plain',
          '        refresh_key:',
          '          every: 1 hour',
        ].join('\n'),
      },
    ];
    const [checked, plain] = schedulesFrom(
      meta([
        { name: 'checked', refreshKey: { every: '1 hour' } },
        { name: 'plain', refreshKey: { every: '1 hour' } },
      ]),
      files,
    );

    expect(checked).toMatchObject({
      every: '1 hour',
      sql: 'SELECT MAX(updated_at) FROM orders',
      when: 'When its SQL returns a new value, checked every 1 hour',
    });
    expect(plain).toMatchObject({ every: '1 hour', when: 'Every 1 hour' });
    expect(plain).not.toHaveProperty('sql');
  });

  /**
   * T450's review: a folder's rollup is Cube's `<folderId>__<cube>.<rollup>`,
   * and its key's SQL is read from that folder's file — not missed, and not
   * taken from the root's cube of the same short name.
   */
  it('reads a folder rollup’s key SQL from that folder’s file, under its prefixed name', () => {
    const file = (folderId: string, sql: string) => ({
      folderId,
      path: 'cubes/orders.yml',
      content: [
        'cubes:',
        '  - name: orders',
        '    sql_table: orders',
        '    pre_aggregations:',
        '      - name: main',
        '        refresh_key:',
        `          sql: ${sql}`,
        '          every: 1 hour',
      ].join('\n'),
    });
    const schedules = schedulesFrom(
      {
        cubes: [
          {
            name: 'orders',
            preAggregations: [{ name: 'main', refreshKey: { every: '1 hour' } }],
          },
          {
            name: 'fsales__orders',
            preAggregations: [{ name: 'main', refreshKey: { every: '1 hour' } }],
          },
        ],
      },
      [file('sales', 'SELECT 2'), file('root', 'SELECT 1')],
      new Map([['sales', 'fsales']]),
    );

    // The root's link names its stored file; the folder's names none, since
    // Model opens only the root's files until T342.
    expect(schedules.map(({ id, sql, fileName }) => ({ id, sql, fileName }))).toEqual([
      { id: 'orders.main', sql: 'SELECT 1', fileName: 'cubes/orders.yml' },
      { id: 'fsales__orders.main', sql: 'SELECT 2', fileName: undefined },
    ]);
  });
});
