import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { pgSessionStore } from './session-store';
import { cookieOf, PUBLIC_URL, signIn, signInAtDex, USERS } from './sign-in.fixture';

/**
 * T316 (AC-252): WHERE security is enabled, WHEN a user signs in, THE SYSTEM
 * SHALL take their identity and AD groups from the provider's token, as the
 * configuration names them (issuer, client, groups claim).
 *
 * Signs in through the real development provider (Dex, started by the test
 * setup), with `sign-in.fixture.ts` filling in Dex's form as a browser would.
 */
const config = (groupsClaim = 'groups') => ({
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim,
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
});

const servers: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await closeDb();
});

function serve(groupsClaim?: string): FastifyInstance {
  const app = buildServer({ config: config(groupsClaim), sessions: pgSessionStore(getDb()) });
  servers.push(app);
  return app;
}

describe('signing in through the configured OIDC provider (T316, AC-252)', () => {
  it('sends the browser to the provider, and makes nobody signed in until it returns', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(login.statusCode).toBe(302);
    const authorize = new URL(login.headers.location as string);
    expect(authorize.searchParams.get('client_id')).toBe('wechart');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${PUBLIC_URL}/api/auth/callback`);
    expect(authorize.searchParams.get('scope')).toBe('openid profile email groups');
  });

  it('takes the user’s identity and exactly the token’s groups', async () => {
    const app = serve();
    const cookie = await signIn(app, USERS['writer']!);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    // The identity as the provider sent it, for the account menu (T319).
    expect(me.json()).toEqual({
      name: 'Wren Writer',
      identity: 'writer@wechart.test',
      groups: ['sales-rw'],
      superAdmin: false,
      // No store of folders' groups here, so no folder it writes (T364's review).
      readWrite: false,
      security: 'oidc',
    });
  });

  it('carries all 20 groups of a user in 20 groups', async () => {
    const app = serve();
    const cookie = await signIn(app, USERS['many']!);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect((me.json() as { groups: string[] }).groups).toEqual(USERS['many']!.groups);
  });

  it('reads groups from the claim the configuration names, and no other', async () => {
    // Dex emits only `groups` for groups (research/dex.md §3), so another of
    // its claims stands in: a single string becomes a one-group list.
    const named = serve('preferred_username');
    const cookie = await signIn(named, USERS['writer']!);
    const me = await named.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect((me.json() as { groups: string[] }).groups).toEqual(['writer']);

    // A claim the provider doesn't send gives no groups, never `groups`'s.
    const absent = serve('roles');
    const none = await signIn(absent, USERS['writer']!);
    const meToo = await absent.inject({ method: 'GET', url: '/api/me', headers: { cookie: none } });
    expect((meToo.json() as { groups: string[] }).groups).toEqual([]);
  });

  /**
   * T697 (design 09, state D): a callback that fails lands on wechart's own
   * page, the reason in its Details, and signs nobody in; never a JSON body
   * in the browser.
   */
  it('sends a callback it didn’t start to wechart’s sign-in-failed page, and signs nobody in', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const cookie = cookieOf(login.headers['set-cookie']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=x&state=not-the-one-it-sent',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(302);
    // Its address carries no words of its own (T697's review): the reason is
    // kept in this browser's session, for the page.
    expect(response.headers.location).toBe('/sign-in-failed');
    const failed = await app.inject({ method: 'GET', url: '/sign-in-failed', headers: { cookie } });
    expect(failed.body).toContain(
      '<pre class="state-card__code">This sign-in wasn’t started here.</pre>',
    );
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('sends a code the provider refuses to the sign-in-failed page with the provider’s reason', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login?returnTo=/jobs' });
    const cookie = cookieOf(login.headers['set-cookie']);
    const state = new URL(login.headers.location as string).searchParams.get('state')!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=not-a-code-dex-issued&state=${state}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/sign-in-failed');
    const failed = await app.inject({ method: 'GET', url: '/sign-in-failed', headers: { cookie } });
    // The provider's words, as openid-client gives them, for Details: some
    // reason, and not the one for a sign-in wechart didn't start.
    const detail = /<pre class="state-card__code">([^<]+)<\/pre>/.exec(failed.body)?.[1];
    expect(detail?.trim().length).toBeGreaterThan(0);
    expect(detail).not.toBe('This sign-in wasn’t started here.');
    // "Try again" returns to where the sign-in started.
    expect(failed.body).toContain(
      '<a class="btn btn-primary" href="/api/auth/login?returnTo=%2Fjobs">Try again</a>',
    );
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('shows nothing a link puts in the sign-in-failed page’s address (T697’s review)', async () => {
    const app = serve();
    const page = await app.inject({
      method: 'GET',
      url: `/sign-in-failed?detail=${encodeURIComponent('Your account is locked. Call 555-0100.')}&returnTo=${encodeURIComponent('https://evil.example')}`,
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain('Your account is locked');
    expect(page.body).not.toContain('<details');
    expect(page.body).toContain(
      '<a class="btn btn-primary" href="/api/auth/login?returnTo=%2F">Try again</a>',
    );
  });

  it('gives the session a new id once signed in (no session fixation)', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login?returnTo=/explore' });
    const before = cookieOf(login.headers['set-cookie']);
    const callback = new URL(await signInAtDex(login.headers.location as string, USERS['reader']!));
    const done = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: before },
    });
    const after = cookieOf(done.headers['set-cookie']);
    expect(after).not.toBe(before);
    // The session the attempt was made in no longer signs anyone in.
    const old = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: before } });
    expect(old.statusCode).toBe(401);
  });
});

describe('where sign-in sends the browser back to (T316’s review)', () => {
  it('only to a path on wechart itself', async () => {
    for (const returnTo of [
      'https://evil.example/steal',
      '//evil.example/steal',
      '/%09/evil.example/steal',
      '/%5Cevil.example/steal',
      '/\\evil.example',
      'javascript:alert(1)',
    ]) {
      const app = serve();
      const login = await app.inject({
        method: 'GET',
        url: `/api/auth/login?returnTo=${encodeURIComponent(returnTo).replace(/%25/g, '%')}`,
      });
      const callback = new URL(
        await signInAtDex(login.headers.location as string, USERS['reader']!),
      );
      const done = await app.inject({
        method: 'GET',
        url: `${callback.pathname}${callback.search}`,
        headers: { cookie: cookieOf(login.headers['set-cookie']) },
      });
      expect(done.headers.location, returnTo).toBe('/');
    }
  });

  it('keeps a path, its query and its hash', async () => {
    const app = serve();
    const login = await app.inject({
      method: 'GET',
      url: `/api/auth/login?returnTo=${encodeURIComponent('/explore/dashboards/d1?filters=a#t')}`,
    });
    const callback = new URL(await signInAtDex(login.headers.location as string, USERS['reader']!));
    const done = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: cookieOf(login.headers['set-cookie']) },
    });
    expect(done.headers.location).toBe('/explore/dashboards/d1?filters=a#t');
  });
});

const setCookieOf = (header: string | string[] | undefined): string =>
  (Array.isArray(header) ? header[0] : header) ?? '';

describe('the session cookie and how long a sign-in lasts (T316’s review, AC-316)', () => {
  it('is HttpOnly and SameSite=Lax, and not Secure over plain HTTP', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const cookie = setCookieOf(login.headers['set-cookie']);
    expect(cookie).toMatch(/^wechart=/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('is Secure and __Host- over HTTPS behind a trusted proxy', async () => {
    const app = buildServer({
      // `inject`'s peer is 127.0.0.1: the proxy, trusted by its address (T773: never `true`).
      config: { ...config(), publicUrl: 'https://wechart.example', trustProxy: ['127.0.0.1'] },
      sessions: pgSessionStore(getDb()),
    });
    servers.push(app);
    const login = await app.inject({
      method: 'GET',
      url: '/api/auth/login',
      headers: { 'x-forwarded-proto': 'https' },
    });
    const cookie = setCookieOf(login.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-wechart=/);
    expect(cookie).toMatch(/; Secure/);
  });

  it('lets an unfinished sign-in lapse after 15 minutes, and a finished one after 12 hours', async () => {
    const app = serve();
    const login = await app.inject({ method: 'GET', url: '/api/auth/login?returnTo=/' });
    const pending = Date.parse(
      /Expires=([^;]+)/.exec(setCookieOf(login.headers['set-cookie']))![1]!,
    );
    expect(Math.abs(pending - (Date.now() + 15 * 60_000))).toBeLessThan(60_000);

    const callback = new URL(await signInAtDex(login.headers.location as string, USERS['reader']!));
    const done = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: cookieOf(login.headers['set-cookie']) },
    });
    const signedIn = Date.parse(
      /Expires=([^;]+)/.exec(setCookieOf(done.headers['set-cookie']))![1]!,
    );
    expect(Math.abs(signedIn - (Date.now() + 12 * 3_600_000))).toBeLessThan(60_000);
  });

  it('keeps no more than a few sign-in attempts in one session', async () => {
    const app = serve();
    let cookie = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const login = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        headers: cookie === '' ? {} : { cookie },
      });
      cookie =
        login.headers['set-cookie'] === undefined ? cookie : cookieOf(login.headers['set-cookie']);
    }
    const id = decodeURIComponent(cookie.split('=')[1]!).split('.')[0]!;
    const row = await getDb()
      .selectFrom('sessions')
      .select('session')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(Object.keys((row.session as { oidcTx: object }).oidcTx).length).toBeLessThanOrEqual(10);
  });
});

describe('when the provider can’t be reached', () => {
  it('says so, rather than failing with an internal error', async () => {
    const app = buildServer({
      config: {
        ...config(),
        oidc: { ...config().oidc, issuer: 'http://localhost:1/unreachable' },
      },
      sessions: pgSessionStore(getDb()),
    });
    servers.push(app);
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(login.statusCode).toBe(503);
    expect((login.json() as { error: string }).error).toMatch(/sign-in provider/i);
  });
});
