import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';
import { buildablesFrom, isFinished } from './build';

/**
 * T155 / AC-149: WHEN the user starts a build for a pre-aggregation, THE
 * SYSTEM SHALL submit it to Cube, show the job token, and poll until the job
 * reports done, missing partition, failure or not found.
 * Fails when: the job's terminal state is never shown, or the token is absent.
 *
 * Through Cube's documented jobs API, as the local Cube answered it
 * (research/cube/refresh-jobs-caching.md §B and "Observed locally").
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  port: 4100,
  modelDir: '',
};

function cubeAnswering(answer: (body: Record<string, unknown>) => Response) {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const cube = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: config.cubeApiSecret,
    securityContext: config.securityContext,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      sent.push({ path: new URL(url).pathname, body });
      return answer(body);
    }) as typeof fetch,
  });
  return { app: buildServer({ config, cube }), sent };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('starting a build (AC-149)', () => {
  it('asks Cube to build the pre-aggregation for the model wechart reads, and returns its tokens', async () => {
    const { app, sent } = cubeAnswering(() => json(['78f5612', '9a0bc3d']));

    const response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: 'monthly_orders.by_status_month' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tokens: ['78f5612', '9a0bc3d'] });
    expect(sent).toEqual([
      {
        path: '/cubejs-api/v1/pre-aggregations/jobs',
        body: {
          action: 'post',
          selector: {
            // The context wechart's own requests carry, so the build is of
            // the model Cube answers wechart from.
            contexts: [{ securityContext: config.securityContext }],
            timezones: ['UTC'],
            preAggregations: ['monthly_orders.by_status_month'],
          },
        },
      },
    ]);
    await app.close();
  });

  it('refuses a name that is not a pre-aggregation’s, without asking Cube', async () => {
    const { app, sent } = cubeAnswering(() => json([]));

    for (const preAggregation of [undefined, '', 'orders', 'a.b.c', 'orders.x;drop']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/builds',
        payload: { preAggregation },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(sent).toEqual([]);
    await app.close();
  });

  it('passes on Cube’s refusal of a pre-aggregation the model does not have', async () => {
    const refusal =
      "A user's selector doesn't match any of the pre-aggregations defined in the data model.";
    const { app } = cubeAnswering(() => json({ error: refusal }, 400));

    const response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: 'orders.nothing' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: refusal, source: 'cube' });
    await app.close();
  });
});

describe('following a build (AC-149)', () => {
  it('reports each token’s state and table, and not the security context Cube echoes', async () => {
    const { app, sent } = cubeAnswering(() =>
      json([
        {
          token: '78f5612',
          table: 'prod_pre_aggregations.monthly_orders_by_status_month20260101_zkut1k4w',
          status: 'processing',
          selector: { contexts: [{ securityContext: config.securityContext }] },
        },
        { token: 'gone', status: 'not_found' },
      ]),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: ['78f5612', 'gone'] },
    });

    // Whether each has finished is said here, by the one rule that is tested
    // (`isFinished`), not worked out again in the browser (T155's review).
    expect(response.json()).toEqual([
      {
        token: '78f5612',
        table: 'prod_pre_aggregations.monthly_orders_by_status_month20260101_zkut1k4w',
        status: 'processing',
        finished: false,
      },
      { token: 'gone', status: 'not_found', finished: true },
    ]);
    expect(sent[0]?.body).toEqual({ action: 'get', tokens: ['78f5612', 'gone'] });
    await app.close();
  });

  it('leaves out an answer that names no token or no state, rather than inventing one', async () => {
    const { app } = cubeAnswering(() =>
      json([{ token: 'a1', status: 'done' }, { token: 'b2' }, { status: 'done' }]),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: ['a1', 'b2'] },
    });

    expect(response.json()).toEqual([{ token: 'a1', status: 'done', finished: true }]);
    await app.close();
  });

  it('refuses a status request with no tokens, without asking Cube', async () => {
    const { app, sent } = cubeAnswering(() => json([]));

    for (const tokens of [undefined, [], ['ok', 3]]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/builds/status',
        payload: { tokens },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(sent).toEqual([]);
    await app.close();
  });
});

describe('what can be built (AC-149)', () => {
  it('lists the rollups and original-SQL pre-aggregations, with their type and partitioning', async () => {
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: config.cubeApiSecret,
      securityContext: config.securityContext,
      fetchImpl: (async (url: string) => {
        expect(new URL(url).pathname).toBe('/cubejs-api/v1/meta');
        expect(new URL(url).searchParams.get('extended')).toBe('true');
        return json({
          cubes: [
            {
              name: 'monthly_orders',
              preAggregations: [
                {
                  name: 'by_status_month',
                  type: 'rollup',
                  granularity: 'month',
                  partitionGranularity: 'year',
                },
                { name: 'cached', type: 'originalSql' },
                // Made of other rollups, and an authoring Non-goal: its build
                // through the jobs API is not researched, so it is not offered.
                { name: 'combined', type: 'rollupLambda' },
              ],
            },
            { name: 'orders', preAggregations: [] },
            { name: 'order_summary' },
          ],
        });
      }) as typeof fetch,
    });
    const app = buildServer({ config, cube });

    const response = await app.inject({ method: 'GET', url: '/api/preaggregations' });

    // Each with its trigger too (AC-229): none declared here, so Cube's
    // default. And its folder (T371): a cube with no `meta.xcube` is the root's.
    expect(response.json()).toEqual([
      {
        id: 'monthly_orders.by_status_month',
        folderId: 'root',
        shortName: 'monthly_orders',
        folderPath: ['Shared'],
        type: 'rollup',
        partitionGranularity: 'year',
        trigger: 'Every 1 hour (Cube’s default)',
      },
      {
        id: 'monthly_orders.cached',
        folderId: 'root',
        shortName: 'monthly_orders',
        folderPath: ['Shared'],
        type: 'originalSql',
        trigger: 'Every 1 hour (Cube’s default)',
      },
    ]);
    await app.close();
  });
});

/**
 * T239 / AC-229: THE SYSTEM SHALL list each pre-aggregation in Jobs with its
 * state as an icon and a label, the refresh key that triggers it, and its name
 * linking to its definition in Model …
 *
 * The trigger and the file are Cube's extended metadata's: each
 * pre-aggregation's `refreshKey` and `scheduledRefresh`, and its cube's
 * `fileName` (docs/research/cube/meta-extended-pre-aggregations.md).
 */
describe('where a pre-aggregation is defined, in items mode (T449)', () => {
  /**
   * From the move to xcube's items mode, Cube's `fileName` is xcube's
   * resolved file (`monthly_orders.yml`), not wechart's (`cubes/…`): the
   * link to Model names the file in wechart's store that declares the cube.
   */
  it('names the stored file that declares its cube, whatever Cube calls the file', () => {
    const listed = buildablesFrom(
      {
        cubes: [
          {
            name: 'monthly_orders',
            fileName: 'monthly_orders.yml',
            preAggregations: [{ name: 'hourly', type: 'rollup' }],
          },
          { name: 'elsewhere', fileName: 'elsewhere.yml', preAggregations: [{ name: 'r' }] },
        ],
      },
      [{ path: 'cubes/monthly_orders.yml', content: 'cubes:\n  - name: monthly_orders\n' }],
    );

    expect(listed.map((each) => each.fileName)).toEqual([
      'cubes/monthly_orders.yml',
      // No stored file declares it: Cube's name, as before.
      'elsewhere.yml',
    ]);
  });
});

describe('what triggers a pre-aggregation, and where it is defined (AC-229)', () => {
  it('says its refresh key in words, Cube’s default where it declares none, and names its file', () => {
    const listed = buildablesFrom({
      cubes: [
        {
          name: 'monthly_orders',
          fileName: 'cubes/monthly_orders.yml',
          preAggregations: [
            { name: 'hourly', type: 'rollup', refreshKey: { every: '1 hour' } },
            {
              name: 'incremental',
              type: 'rollup',
              refreshKey: { every: '1 day', incremental: true, updateWindow: '7 day' },
            },
            { name: 'by_sql', type: 'rollup', refreshKey: { sql: 'SELECT MAX(id) FROM orders' } },
            { name: 'plain', type: 'rollup' },
            { name: 'manual', type: 'rollup', scheduledRefresh: false },
            // Both, and one this build cannot read (T239's review).
            {
              name: 'checked',
              type: 'rollup',
              refreshKey: { sql: 'SELECT MAX(id) FROM orders', every: '10 minute' },
            },
            { name: 'odd', type: 'rollup', refreshKey: { sql: { compiled: true } } },
          ],
        },
      ],
    });

    expect(listed.map((each) => [each.id, each.trigger, each.fileName])).toEqual([
      ['monthly_orders.hourly', 'Every 1 hour', 'cubes/monthly_orders.yml'],
      [
        'monthly_orders.incremental',
        'Every 1 day, incrementally, updating the last 7 day',
        'cubes/monthly_orders.yml',
      ],
      [
        'monthly_orders.by_sql',
        'When SELECT MAX(id) FROM orders changes',
        'cubes/monthly_orders.yml',
      ],
      ['monthly_orders.plain', 'Every 1 hour (Cube’s default)', 'cubes/monthly_orders.yml'],
      [
        'monthly_orders.manual',
        'Every 1 hour (Cube’s default) · not scheduled',
        'cubes/monthly_orders.yml',
      ],
      [
        'monthly_orders.checked',
        'When SELECT MAX(id) FROM orders changes, checked every 10 minute',
        'cubes/monthly_orders.yml',
      ],
      ['monthly_orders.odd', 'As its refresh key in the model says', 'cubes/monthly_orders.yml'],
    ]);
  });
});

describe('when a job has finished', () => {
  it('is once it is done, missing its partition, failed, or not found', () => {
    for (const status of [
      'done',
      'missing_partition',
      'failure: relation "public.orders" does not exist',
      'not_found',
      'pre_agg_not_found',
    ])
      expect(isFinished(status)).toBe(true);
    // Still in Cube's queue, or any other queue state it passes through.
    for (const status of ['scheduled', 'processing', 'toProcess', 'active'])
      expect(isFinished(status)).toBe(false);
  });
});
