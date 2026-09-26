import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { returnToOf } from './routes';
import { pgSessionStore } from './session-store';
import { cookieOf, PUBLIC_URL, signIn, signInAtDex, USERS } from './sign-in.fixture';

/**
 * T321 (AC-251): the web server asks the API, for every page request, whether
 * anyone is signed in (nginx `auth_request`, research/openid-client.md,
 * "nginx: gating page requests"): 204 when someone is, 401 when nobody is. A
 * page it refuses goes to sign-in with the page's own address, which nginx
 * can only pass unencoded.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...config,
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const servers: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await closeDb();
});
const serve = (options: Parameters<typeof buildServer>[0]) => {
  const app = buildServer(options);
  servers.push(app);
  return app;
};

describe('whether anyone is signed in, for the web server (T321, AC-251)', () => {
  it('answers 401 with no session, and 204 with nothing else once signed in', async () => {
    const app = serve({ config: secured, sessions: pgSessionStore(getDb()) });
    const nobody = await app.inject({ method: 'GET', url: '/api/auth/check' });
    expect(nobody.statusCode).toBe(401);

    const cookie = await signIn(app, USERS['reader']!);
    const somebody = await app.inject({
      method: 'GET',
      url: '/api/auth/check',
      headers: { cookie },
    });
    expect(somebody.statusCode).toBe(204);
    expect(somebody.body).toBe('');
  });

  it('answers 204 with security off: the single user is always there', async () => {
    const app = serve({ config });
    expect((await app.inject({ method: 'GET', url: '/api/auth/check' })).statusCode).toBe(204);
  });
});

describe('where sign-in returns to, from the web server’s redirect (T321)', () => {
  it('keeps a page’s whole address, which nginx passes unencoded', async () => {
    const app = serve({ config: secured, sessions: pgSessionStore(getDb()) });
    // nginx: return 302 /api/auth/login?returnTo=$request_uri
    const login = await app.inject({
      method: 'GET',
      url: '/api/auth/login?returnTo=/explore?folder=seed-folder-0&panel=access',
    });
    const callback = new URL(await signInAtDex(login.headers.location as string, USERS['reader']!));
    const done = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: cookieOf(login.headers['set-cookie']) },
    });
    expect(done.headers.location).toBe('/explore?folder=seed-folder-0&panel=access');
  });

  // T321's review: nginx's address is still percent-encoded; decoding it
  // again turned %26 into a separator, %23 into a fragment, and a lone % broke it.
  it('keeps what the address encodes, whether nginx or the app sent it', () => {
    const shared =
      '/explore/dashboards/d1?filters=%7B%22x%22%3A%22R%26D%22%7D&view=%23top&pct=100%25';
    expect(returnToOf(`/api/auth/login?returnTo=${shared}`)).toBe(shared);
    expect(returnToOf(`/api/auth/login?returnTo=${encodeURIComponent(shared)}`)).toBe(shared);
    expect(returnToOf('/api/auth/login?other=1&returnTo=%2Fexplore')).toBe('/explore');
    expect(returnToOf('/api/auth/login')).toBeUndefined();
  });
});

describe('a sign-in lasts 12 hours, whatever the activity (T321’s review, AC-316)', () => {
  it('isn’t extended by asking to sign in again while signed in', async () => {
    const app = serve({ config: secured, sessions: pgSessionStore(getDb()) });
    const cookie = await signIn(app, USERS['writer']!);
    const id = decodeURIComponent(cookie.split('=')[1]!).split('.')[0]!;
    const expiry = () =>
      getDb()
        .selectFrom('sessions')
        .select('expires_at')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
    const before = (await expiry()).expires_at;

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const again = await app.inject({
      method: 'GET',
      url: '/api/auth/login?returnTo=/explore',
      headers: { cookie },
    });
    // Already signed in: straight back, and the session as it was.
    expect(again.statusCode).toBe(302);
    expect(again.headers.location).toBe('/explore');
    expect(again.headers['set-cookie']).toBeUndefined();
    expect((await expiry()).expires_at).toEqual(before);
  });
});
