import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { buildServer } from '../server';
import { authCheckOf } from './authCheck';

/**
 * T175 / AC-169: IF Cube would accept unauthenticated requests, because
 * authentication checks are not enforced, THEN THE SYSTEM SHALL show a
 * persistent warning in the Security workspace.
 * Fails when: no warning is shown while Cube accepts an unauthenticated
 * request.
 *
 * Probed with `GET /v1/load` and no query. A Cube enforcing auth refuses it
 * with 403 "Authorization header isn't set" (no token) or "Invalid token"
 * (a bad one). Past auth, Cube asserts the `data` scope and then reads the
 * query: 403 "API scope is missing: data", or 400 "Query param is required"
 * — either proves the request was let in (research/cube/access-control.md,
 * "HTTP authentication", "Observed locally"; research/cube/
 * api-scope-probes.md). A 403 alone proves nothing: its words decide.
 */
type Answer = { status: number; body: unknown } | 'unreachable';

function answering(noToken: Answer, badToken: Answer) {
  const asked: { url: string; authorization: string | null; redirect?: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('authorization');
    asked.push({ url, authorization, ...(init?.redirect ? { redirect: init.redirect } : {}) });
    const answer = authorization === null ? noToken : badToken;
    if (answer === 'unreachable') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, asked };
}

const NO_HEADER = { status: 403, body: { error: "Authorization header isn't set" } };
const INVALID = { status: 403, body: { error: 'Invalid token' } };
/** Past auth, the query read: the request was let in. */
const LET_IN = { status: 400, body: { error: 'Query param is required' } };
/** Past auth, the scope asserted: let in too, as the empty context. */
const NO_SCOPE = { status: 403, body: { error: 'API scope is missing: data' } };
const BASE = 'http://cube:4000/cubejs-api';

describe('whether Cube accepts unauthenticated requests', () => {
  it('is enforced when Cube refuses a missing and an invalid token, in its own words', async () => {
    const { fetchImpl, asked } = answering(NO_HEADER, INVALID);
    expect(await authCheckOf(BASE, fetchImpl)).toEqual({ auth: 'enforced' });
    expect(asked.map(({ url }) => url)).toEqual([`${BASE}/v1/load`, `${BASE}/v1/load`]);
    // Never wechart's own token: the probe is of what anyone could ask.
    expect(asked.map(({ authorization }) => authorization)).toEqual([null, 'not-a-token']);
    // A redirect is not Cube's answer, and is not followed to one.
    expect(asked.map(({ redirect }) => redirect)).toEqual(['manual', 'manual']);
  });

  it('is open when a request with no token is let in', async () => {
    expect(await authCheckOf(BASE, answering(LET_IN, INVALID).fetchImpl)).toEqual({
      auth: 'open',
      accepted: ['no token'],
    });
  });

  it('is open when only a request with an invalid token is let in', async () => {
    expect(await authCheckOf(BASE, answering(NO_HEADER, LET_IN).fetchImpl)).toEqual({
      auth: 'open',
      accepted: ['an invalid token'],
    });
  });

  it('is open when Cube lets a request in only to refuse it a scope (T175’s review)', async () => {
    expect(await authCheckOf(BASE, answering(NO_SCOPE, NO_SCOPE).fetchImpl)).toEqual({
      auth: 'open',
      accepted: ['no token', 'an invalid token'],
    });
  });

  it('is unknown, not enforced, when Cube answers otherwise or cannot be asked', async () => {
    const other403 = { status: 403, body: { error: 'Forbidden' } };
    for (const [noToken, badToken] of [
      [other403, other403],
      ['unreachable', 'unreachable'],
      [{ status: 500, body: { error: 'boom' } }, INVALID],
      [{ status: 302, body: {} }, INVALID],
      [{ status: 200, body: { cubes: [] } }, INVALID],
    ] as [Answer, Answer][])
      expect(await authCheckOf(BASE, answering(noToken, badToken).fetchImpl)).toEqual({
        auth: 'unknown',
      });
  });

  it('reads a request that never answers as unknown', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'TimeoutError'));
        });
      })) as unknown as typeof fetch;
    expect(await authCheckOf(BASE, hanging, 20)).toEqual({ auth: 'unknown' });
  });

  it('reads a Cube that lets unsigned requests in as open, over the network', async () => {
    // A Cube not enforcing auth: whoever asks, it goes on to read the query.
    const headers: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      headers.push(request.headers.authorization);
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Query param is required' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const app = buildServer({
      config: loadConfig({
        CUBE_API_SECRET: 's',
        CUBE_API_URL: `http://127.0.0.1:${String(port)}/cubejs-api`,
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/cube-auth' });

    expect(response.json()).toEqual({ auth: 'open', accepted: ['no token', 'an invalid token'] });
    expect(headers.sort()).toEqual(['not-a-token', undefined]);
    await app.close();
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve(undefined));
    });
  });

  it('is answered by the API, asking the Cube API it is configured with', async () => {
    const config = loadConfig({
      CUBE_API_SECRET: 's',
      CUBE_API_URL: 'http://localhost:54000/cubejs-api',
    });
    const { fetchImpl, asked } = answering(LET_IN, INVALID);
    const app = buildServer({ config, healthFetch: fetchImpl });

    const response = await app.inject({ method: 'GET', url: '/api/cube-auth' });

    expect(response.json()).toEqual({ auth: 'open', accepted: ['no token'] });
    expect(asked.map(({ url }) => url)).toEqual([
      'http://localhost:54000/cubejs-api/v1/load',
      'http://localhost:54000/cubejs-api/v1/load',
    ]);
    await app.close();
  });
});
