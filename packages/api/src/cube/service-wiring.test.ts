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
  xcube: { model: 'e2e', serviceKey: 'read by main.ts alone', signingKey: 'read by main.ts alone' },
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

  /**
   * T437 (AC-326), through the server as it is wired (T437's review): once
   * its key is pushed, every query token the server's own client signs is
   * RS256 under it, and wechart's own calls keep the service credential.
   */
  it('signs queries RS256 under the pushed key, and builds with the service credential still', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { querySigner } = await import('./signing');
    const signer = await querySigner({
      privateKeyPem: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string,
      issuer: 'wechart',
    });
    serve();
    const app = buildServer({
      config,
      serviceToken: async () => SERVICE,
      querySigner: () => signer,
    });

    await app.inject({ url: '/api/meta' });
    await app.inject({
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: ['orders.count'] } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: 'orders.daily' },
    });

    const headerOf = (authorization: string) =>
      JSON.parse(
        Buffer.from(authorization.replace('Bearer ', '').split('.')[0]!, 'base64url').toString(),
      ) as Record<string, unknown>;
    expect(asked.map(({ path }) => path)).toEqual([
      '/v1/meta',
      '/v1/load',
      '/v1/pre-aggregations/jobs',
    ]);
    for (const { authorization } of asked.slice(0, 2))
      expect(headerOf(authorization)).toEqual({ alg: 'RS256', kid: signer.kid, typ: 'JWT' });
    expect(asked[2]!.authorization).toBe(`Bearer ${SERVICE}`);
  });

  /**
   * T436 (AC-320, AC-334), as wired: Jobs' and Schedules' field list is the
   * whole model's, xcube's own, with the service credential at the recorded
   * revision; under the folder gate wechart's query token would see no
   * folder's cubes.
   */
  it('read Jobs’ and Schedules’ field list from xcube’s own meta with it', async () => {
    const { memoryPublications } = await import('../xcube/publications');
    const publications = memoryPublications();
    await publications.put('e2e', { generation: 'g', revision: 4, contentHash: 'h' });
    serve();
    const app = buildServer({ config, serviceToken: async () => SERVICE, publications });

    const listed = await app.inject({ url: '/api/preaggregations' });
    const scheduled = await app.inject({ url: '/api/schedules' });

    expect([listed.statusCode, scheduled.statusCode]).toEqual([200, 200]);
    expect(asked).toEqual([
      {
        path: '/v1/semantic/models/e2e/meta',
        authorization: `Bearer ${SERVICE}`,
      },
      {
        path: '/v1/semantic/models/e2e/meta',
        authorization: `Bearer ${SERVICE}`,
      },
    ]);
  });

  it('ask Cube for the field list with wechart’s own token, never the service credential', async () => {
    const app = serve();

    await app.inject({ url: '/api/meta' });

    expect(asked.map((each) => each.path)).toEqual(['/v1/meta']);
    expect(asked[0]!.authorization).toMatch(/^Bearer /);
    expect(asked[0]!.authorization).not.toContain(SERVICE);
  });
});
