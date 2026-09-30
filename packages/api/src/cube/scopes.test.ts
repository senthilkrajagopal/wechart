import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { buildServer } from '../server';
import { CubeClient } from './client';
import { scopesOf, type Ask } from './scopes';

/**
 * T176 / AC-170: THE SYSTEM SHALL show which API scopes the configured
 * context has, and mark a screen as unavailable when its scope is missing.
 * Fails when: a screen fails with an error instead of reporting the missing
 * scope.
 *
 * Cube lists no scopes, so each is probed with wechart's own token by the
 * cheapest request that proves it; Cube asserts a scope before anything else,
 * answering 403 "API scope is missing: <scope>" (research/cube/
 * api-scope-probes.md, and "Observed locally").
 */
type Answer = { status: number; body: unknown } | 'unreachable';

const GRANTED: Record<string, Answer> = {
  'GET /v1/meta': { status: 200, body: { cubes: [] } },
  'GET /v1/load': { status: 400, body: { error: 'Query param is required' } },
  'GET /v1/sql': { status: 400, body: { error: 'Query param is required' } },
  'POST /graphql': { status: 200, body: { data: { __typename: 'Query' }, extensions: {} } },
  'POST /v1/pre-aggregations/jobs': {
    status: 400,
    body: { error: 'No job description provided' },
  },
};

function asking(answers: Record<string, Answer>) {
  const asked: { method: string; path: string; body?: unknown }[] = [];
  const ask: Ask = async (path, init) => {
    const method = init.method ?? 'GET';
    asked.push({
      method,
      path,
      ...(init.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
    });
    const answer = answers[`${method} ${path}`];
    if (answer === undefined || answer === 'unreachable') throw new TypeError('fetch failed');
    return answer;
  };
  return { ask, asked };
}

describe('the API scopes wechart’s context has', () => {
  it('reads each scope granted from its probe’s expected answer', async () => {
    const { ask, asked } = asking(GRANTED);
    expect(await scopesOf(ask)).toEqual({
      meta: 'granted',
      data: 'granted',
      sql: 'granted',
      graphql: 'granted',
      jobs: 'granted',
    });
    // Probes that run no query and start no build.
    expect(asked).toEqual([
      { method: 'GET', path: '/v1/meta' },
      { method: 'GET', path: '/v1/load' },
      { method: 'GET', path: '/v1/sql' },
      { method: 'POST', path: '/graphql', body: { query: '{ __typename }' } },
      { method: 'POST', path: '/v1/pre-aggregations/jobs', body: {} },
    ]);
  });

  it('reads a scope as missing only on Cube’s own words for it', async () => {
    const { ask } = asking({
      ...GRANTED,
      'POST /v1/pre-aggregations/jobs': {
        status: 403,
        body: { error: 'API scope is missing: jobs' },
      },
      // A 403 for another reason is not a missing scope.
      'GET /v1/sql': { status: 403, body: { error: 'Invalid token' } },
    });
    expect(await scopesOf(ask)).toMatchObject({ jobs: 'missing', sql: 'unknown', meta: 'granted' });
  });

  it('is answered by the API, probing Cube with wechart’s own token', async () => {
    const asked: { path: string; authorization: string | null; redirect?: string }[] = [];
    const cube = new CubeClient({
      apiUrl: 'http://cube.invalid/cubejs-api',
      apiSecret: 'secret',
      securityContext: { tenant: 'acme' },
      fetchImpl: (async (url: string, init: RequestInit) => {
        const path = url.replace('http://cube.invalid/cubejs-api', '');
        asked.push({
          path,
          authorization: new Headers(init.headers).get('authorization'),
          ...(init.redirect === undefined ? {} : { redirect: init.redirect }),
        });
        const answer = GRANTED[`${init.method ?? 'GET'} ${path}`];
        if (path === '/v1/pre-aggregations/jobs')
          return Response.json({ error: 'API scope is missing: jobs' }, { status: 403 });
        return answer === undefined || answer === 'unreachable'
          ? new Response('', { status: 404 })
          : Response.json(answer.body, { status: answer.status });
      }) as typeof fetch,
    });
    const app = buildServer({
      config: loadConfig({
        CUBE_API_SECRET: 'secret',
        CUBE_API_URL: 'http://cube.invalid/cubejs-api',
      }),
      cube,
    });

    const response = await app.inject({ method: 'GET', url: '/api/cube-scopes' });

    expect(response.json()).toEqual({
      meta: 'granted',
      data: 'granted',
      sql: 'granted',
      graphql: 'granted',
      jobs: 'missing',
    });
    // Signed as wechart asks — its configured context — every probe, and no
    // redirect followed to someone else's answer.
    const claims = asked.map(({ authorization }) => {
      const payload = (authorization ?? '').replace('Bearer ', '').split('.')[1] ?? '';
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      // The token's own times aside: they are wechart's to set.
      return Object.fromEntries(
        Object.entries(decoded).filter(([key]) => key !== 'iat' && key !== 'exp'),
      );
    });
    expect(claims).toEqual(asked.map(() => ({ tenant: 'acme' })));
    expect(asked.map(({ redirect }) => redirect)).toEqual(asked.map(() => 'manual'));
    await app.close();
  });

  it('reads anything else as unknown: an error, another status, no answer', async () => {
    const { ask } = asking({
      ...GRANTED,
      'GET /v1/meta': { status: 500, body: { error: 'Compile error' } },
      'GET /v1/load': { status: 400, body: { error: 'Something else' } },
      'POST /graphql': 'unreachable',
    });
    expect(await scopesOf(ask)).toMatchObject({
      meta: 'unknown',
      data: 'unknown',
      graphql: 'unknown',
      sql: 'granted',
    });
  });

  it('reads a 200 that is not Cube’s own answer as unknown, not granted (T176’s review)', async () => {
    // A proxy's fallback page answers 200 to anything.
    const page = { status: 200, body: '<!doctype html><title>Sign in</title>' };
    const { ask } = asking({ ...GRANTED, 'GET /v1/meta': page, 'POST /graphql': page });
    expect(await scopesOf(ask)).toMatchObject({ meta: 'unknown', graphql: 'unknown' });
  });

  it('probes jobs with the credential wechart builds with, the service credential (T437, AC-326)', async () => {
    // A user's token: xcube grants it no jobs (research xcube-slice-4.md, "Scopes by role").
    const users = asking({
      ...GRANTED,
      'POST /v1/pre-aggregations/jobs': {
        status: 403,
        body: { error: 'API scope is missing: jobs' },
      },
    });
    const service = asking({
      'POST /v1/pre-aggregations/jobs': {
        status: 400,
        body: { error: 'No job description provided' },
      },
    });
    expect(await scopesOf(users.ask, service.ask)).toMatchObject({ jobs: 'granted' });
    expect(service.asked).toEqual([
      { method: 'POST', path: '/v1/pre-aggregations/jobs', body: {} },
    ]);
    expect(users.asked.map(({ path }) => path)).not.toContain('/v1/pre-aggregations/jobs');
  });
});
