import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';
import { xcubePartitions } from '../xcube/partitions';
import { schedulesFrom } from './schedules';

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};

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

/**
 * T551 / AC-154: every pre-aggregation's schedule, a `public: false` cube's
 * included, from xcube's admin meta with `hidden=true` (research
 * xcube-jobs-schedules-routes.md §2), each with when Cube last built it,
 * from the partitions route (T375), and no outcome or starter (R41).
 */
describe('GET /api/schedules (T551, AC-154)', () => {
  it('lists a hidden cube’s rollups, read with hidden=true, each with when Cube last built it', async () => {
    const asked: unknown[] = [];
    class Meta extends CubeClient {
      override async modelMeta(options?: { readonly hidden?: boolean }): Promise<unknown> {
        asked.push(options);
        return {
          cubes: [
            {
              name: 'orders',
              public: options?.hidden === true ? false : undefined,
              preAggregations: [
                { name: 'main', type: 'rollup', refreshKey: { every: '1 hour' } },
                { name: 'never', type: 'rollup', refreshKey: { every: '1 hour' } },
              ],
            },
          ].filter(() => options?.hidden === true),
        };
      }
    }
    const cube = new Meta({
      apiUrl: config.cubeApiUrl,
      apiSecret: config.cubeApiSecret,
      securityContext: {},
      fetchImpl: (async () => Response.json({})) as typeof fetch,
    });
    const app = buildServer({
      config,
      cube,
      buildPartitions: xcubePartitions({
        cubeApiUrl: config.cubeApiUrl,
        model: 'dev',
        token: async () => 't',
        askAgainAfterMs: 0,
        fetch: (async () =>
          Response.json({
            preAggregationPartitions: ['main', 'never'].map((name) => ({
              errors: [],
              preAggregation: { id: `orders.${name}`, preAggregation: { type: 'rollup' } },
              partitions: [
                {
                  tableName: `prod_pre_aggregations.orders_${name}`,
                  versionEntries:
                    name === 'main' ? [{ last_updated_at: Date.UTC(2026, 9, 2, 14, 1) }] : [],
                },
              ],
            })),
          })) as typeof fetch,
      }),
    });

    const answer = await app.inject({ method: 'GET', url: '/api/schedules' });

    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked).toEqual([{ hidden: true }]);
    const rows = answer.json<Record<string, unknown>[]>();
    expect(rows.map(({ id, public: shown, lastBuiltAt }) => ({ id, shown, lastBuiltAt }))).toEqual([
      { id: 'orders.main', shown: false, lastBuiltAt: '2026-10-02T14:01:00.000Z' },
      { id: 'orders.never', shown: false, lastBuiltAt: null },
    ]);
    // A refresh key's last run is when Cube built it: no outcome, no starter (R41).
    for (const row of rows) {
      expect(row).not.toHaveProperty('outcome');
      expect(row).not.toHaveProperty('startedBy');
    }

    // Data as of reads only what queries can reach: no hidden cube's (T551's review).
    const seen = await app.inject({ method: 'GET', url: '/api/schedules?seen=1' });
    expect(seen.statusCode).toBe(200);
    expect(asked.at(-1)).toEqual({ hidden: false });
    expect(seen.json<unknown[]>()).toEqual([]);
    await app.close();
  });
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
  /** T551: in words and as written, by the function Jobs' Trigger shares (refreshWords.ts). */
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
      kind: 'key',
      scheduled: true,
      when: 'Daily at 08:00, Los Angeles',
      written: 'every: "0 8 * * *" · timezone: America/Los_Angeles',
      runs: { every: '0 8 * * *', timezone: 'America/Los_Angeles' },
      every: '0 8 * * *',
      timezone: 'America/Los_Angeles',
    });
    expect(bare?.when).toBe('Hourly at :00');
  });

  it('says an interval, and incremental and its window, on a cron too', () => {
    const [plain, incremental, cron] = schedulesFrom(
      meta([
        { name: 'daily', refreshKey: { every: '1 day' } },
        {
          name: 'recent',
          refreshKey: { every: '1 hour', incremental: true, updateWindow: '7 day' },
        },
        {
          name: 'nightly',
          refreshKey: { every: '0 3 * * *', incremental: true, updateWindow: '7 day' },
        },
      ]),
    );
    expect(plain?.when).toBe('Every day, from 00:00 UTC');
    expect(incremental?.when).toBe(
      'Every hour, rebuilding only partitions ending in the last 7 day',
    );
    expect(cron?.when).toBe(
      'Daily at 03:00 UTC, rebuilding only partitions ending in the last 7 day',
    );
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
      'Its cube’s refresh key: every 30 minutes',
    ]);
    expect(schedulesFrom(meta([{ name: 'plain' }]))[0]?.when).toBe('Cube’s default: every hour');
    expect(schedulesFrom(meta([{ name: 'plain' }]))[0]).toMatchObject({
      kind: 'default',
      written: 'no refresh_key declared',
    });
  });

  it('says a pre-aggregation Cube never refreshes is not scheduled, and why, as written', () => {
    const rows = schedulesFrom(
      meta([
        { name: 'off', type: 'rollup', scheduledRefresh: false, refreshKey: { every: '1 hour' } },
        { name: 'lambda', type: 'rollupLambda' },
        { name: 'joined', type: 'rollupJoin' },
      ]),
    );
    expect(rows.map(({ scheduled, when, written }) => ({ scheduled, when, written }))).toEqual([
      { scheduled: false, when: 'Not scheduled', written: 'scheduled_refresh: false' },
      { scheduled: false, when: 'Not scheduled', written: 'type: rollup_lambda' },
      { scheduled: false, when: 'Not scheduled', written: 'type: rollup_join' },
    ]);
  });

  it('marks a cube that isn’t public, which xcube’s admin meta lists with hidden=true', () => {
    // research xcube-jobs-schedules-routes.md §2: each cube marked "public": true | false.
    const [hidden] = schedulesFrom(
      meta([{ name: 'main', refreshKey: { every: '1 hour' } }], { public: false }),
    );
    expect(hidden).toMatchObject({ id: 'orders.main', public: false, when: 'Every hour' });
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
      kind: 'sql',
      when: 'When its SQL returns a new value, checked every hour',
    });
    // No run foretold: rebuilt when the SQL's value changes.
    expect(checked).not.toHaveProperty('runs');
    expect(plain).toMatchObject({ every: '1 hour', when: 'Every hour' });
    expect(plain).not.toHaveProperty('sql');
  });

  /**
   * T450's review: a folder's rollup is Cube's `<folderId>__<cube>.<rollup>`,
   * and its key's SQL is read from that folder's file — not missed, and not
   * taken from the root's cube of the same short name.
   */
  it('reads a folder rollup’s key SQL from that folder’s file, under its prefixed name', () => {
    // Paths of their own, so which file each link names can be told apart (T530's review).
    const file = (folderId: string, sql: string) => ({
      folderId,
      path: `cubes/${folderId}_orders.yml`,
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

    // Each link names its own folder's file: the root's as it always has, a
    // folder's with that folder, whose model page opens it (T342; T530, AC-222).
    expect(
      schedules.map(({ id, sql, fileName, fileFolderId }) => ({ id, sql, fileName, fileFolderId })),
    ).toEqual([
      {
        id: 'orders.main',
        sql: 'SELECT 1',
        fileName: 'cubes/root_orders.yml',
        fileFolderId: undefined,
      },
      {
        id: 'fsales__orders.main',
        sql: 'SELECT 2',
        fileName: 'cubes/sales_orders.yml',
        fileFolderId: 'sales',
      },
    ]);
  });
});
