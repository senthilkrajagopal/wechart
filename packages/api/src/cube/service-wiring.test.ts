import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config';
import { buildServer } from '../server';

/**
 * T420 / AC-326, AC-250, through the server as it is wired (T420's review):
 * WHEN wechart calls Cube on its own behalf — a build, a build's state,
 * browsing a data source — THE SYSTEM SHALL carry the service credential,
 * never a user's token; its user's queries SHALL carry their own; and no
 * response to the browser SHALL contain the service credential.
 */
const SERVICE = 'the-service-token-never-shown';
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
  xcube: { model: 'e2e', serviceKey: 'read by main.ts alone' },
};

const asked: { path: string; authorization: string }[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
});

function serve() {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push({
      path: url.pathname.replace('/cubejs-api', ''),
      authorization: new Headers(init?.headers).get('authorization') ?? '',
    });
    const body =
      init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>);
    const answer = url.pathname.endsWith('/v1/pre-aggregations/jobs')
      ? body['action'] === 'post'
        ? ['job-1']
        : [{ token: 'job-1', status: 'done', table: 'prod_pre_aggregations.t' }]
      : url.pathname.includes('/v1/introspection/')
        ? { dataSources: [{ dataSource: 'default' }] }
        : { cubes: [] };
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  return buildServer({ config, serviceToken: async () => SERVICE });
}

describe('wechart’s own calls to Cube, as the server is wired (T420)', () => {
  it('build and follow a build with the service credential, and say nothing of it', async () => {
    const app = serve();

    const built = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: 'orders.daily' },
    });
    const state = await app.inject({
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: ['job-1'] },
    });

    expect(built.json()).toEqual({ tokens: ['job-1'] });
    expect(state.json()).toEqual([
      { token: 'job-1', status: 'done', finished: true, table: 'prod_pre_aggregations.t' },
    ]);
    expect(asked).toEqual([
      { path: '/v1/pre-aggregations/jobs', authorization: `Bearer ${SERVICE}` },
      { path: '/v1/pre-aggregations/jobs', authorization: `Bearer ${SERVICE}` },
    ]);
    for (const response of [built, state]) {
      expect(response.body).not.toContain(SERVICE);
      expect(JSON.stringify(response.headers)).not.toContain(SERVICE);
    }
  });

  it('browse a data source with it (AC-250), and say nothing of it', async () => {
    const app = serve();

    const sources = await app.inject({ url: '/api/introspection/sources' });

    expect(sources.statusCode).toBe(200);
    expect(asked).toEqual([
      { path: '/v1/introspection/data-sources', authorization: `Bearer ${SERVICE}` },
    ]);
    expect(sources.body).not.toContain(SERVICE);
  });

  it('ask Cube for the field list with wechart’s own token, never the service credential', async () => {
    const app = serve();

    await app.inject({ url: '/api/meta' });

    expect(asked.map((each) => each.path)).toEqual(['/v1/meta']);
    expect(asked[0]!.authorization).toMatch(/^Bearer /);
    expect(asked[0]!.authorization).not.toContain(SERVICE);
  });
});
