import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';
import { isFinished } from './build';

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
  securityContext: { tenant: 'acme', wechartStore: 'http://host.docker.internal:4100' },
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

    expect(response.json()).toEqual([
      { id: 'monthly_orders.by_status_month', type: 'rollup', partitionGranularity: 'year' },
      { id: 'monthly_orders.cached', type: 'originalSql' },
    ]);
    await app.close();
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
