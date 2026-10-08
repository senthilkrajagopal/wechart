import type { FastifyInstance } from 'fastify';
import * as oidc from 'openid-client';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { signOutTarget } from './routes';
import { pgSessionStore } from './session-store';
import { PUBLIC_URL, signIn, USERS } from './sign-in.fixture';

/**
 * T317 (AC-253): WHEN the user signs out, THE SYSTEM SHALL end the wechart
 * session, so that the next request needs a new sign-in.
 * `Fails when: after signing out, a page or API route still answers as that user.`
 */
const config = {
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

function serve(): FastifyInstance {
  const app = buildServer({ config, sessions: pgSessionStore(getDb()) });
  servers.push(app);
  return app;
}

const sessionIdOf = (cookie: string) => decodeURIComponent(cookie.split('=')[1]!).split('.')[0]!;

describe('signing out (T317, AC-253)', () => {
  it('ends the session: the same cookie no longer answers as the user, and its row is gone', async () => {
    const app = serve();
    const cookie = await signIn(app, USERS['writer']!);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode,
    ).toBe(200);
    const rowOf = () =>
      getDb()
        .selectFrom('sessions')
        .select('id')
        .where('id', '=', sessionIdOf(cookie))
        .executeTakeFirst();
    expect(await rowOf(), 'the signed-in session’s row').toEqual({ id: sessionIdOf(cookie) });

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    // Dex has no end-session endpoint (research/dex.md), so back to wechart:
    // its own signed-out page, never the provider's form (design 09, state C; T697).
    expect(out.json()).toEqual({ redirectTo: `${PUBLIC_URL}/signed-out` });

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: 'unauthenticated' });
    expect(await rowOf()).toBeUndefined();
  });

  it('tells the browser to drop its cookie', async () => {
    const app = serve();
    const cookie = await signIn(app, USERS['reader']!);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const cleared = [out.headers['set-cookie']].flat().find((each) => each?.startsWith('wechart='));
    expect(cleared, 'a Set-Cookie clearing the session cookie').toBeDefined();
    expect(cleared).toMatch(/^wechart=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/; Path=\//);
  });

  it('ends only that session, not another sign-in of the same user', async () => {
    const app = serve();
    const first = await signIn(app, USERS['writer']!);
    const second = await signIn(app, USERS['writer']!);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: first } });
    const other = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: second } });
    expect(other.statusCode).toBe(200);
  });

  it('is a POST: a link or an image a page embeds can’t sign anyone out', async () => {
    const app = serve();
    const cookie = await signIn(app, USERS['reader']!);
    const get = await app.inject({ method: 'GET', url: '/api/auth/logout', headers: { cookie } });
    expect(get.statusCode).toBe(404);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });

  it('answers without a session too, sending the browser back to wechart', async () => {
    const app = serve();
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ redirectTo: `${PUBLIC_URL}/signed-out` });
  });

  // T317's review: a cross-site form's POST carries no SameSite=Lax cookie. Were
  // the answer to clear the cookie anyway, the browser would drop it: a sign-out
  // forced from another site.
  it('clears no cookie a request didn’t send', async () => {
    const app = serve();
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { 'content-type': 'text/plain' },
      payload: 'from another site',
    });
    expect(out.statusCode).toBe(200);
    expect(out.headers['set-cookie']).toBeUndefined();
  });

  it('clears the __Host- cookie over HTTPS as it was set: Secure, on the whole site', async () => {
    const app = buildServer({
      config: { ...config, publicUrl: 'https://wechart.example', trustProxy: true },
      sessions: pgSessionStore(getDb()),
    });
    servers.push(app);
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { 'x-forwarded-proto': 'https', cookie: '__Host-wechart=some.session' },
    });
    const cleared = [out.headers['set-cookie']].flat()[0] ?? '';
    expect(cleared).toMatch(/^__Host-wechart=;/);
    expect(cleared).toMatch(/; Secure/);
    expect(cleared).toMatch(/; Path=\//);
    expect(cleared).not.toMatch(/; Domain=/);
  });
});

describe('where signing out sends the browser (T317, research/openid-client.md “Logout”)', () => {
  const provider = (endSession?: string) =>
    new oidc.Configuration(
      {
        issuer: 'https://login.example/tenant/v2.0',
        ...(endSession === undefined ? {} : { end_session_endpoint: endSession }),
      },
      'wechart',
    );

  it('to the provider’s end-session page when it has one, so it forgets the sign-in too', () => {
    const target = new URL(
      signOutTarget(provider('https://login.example/tenant/logout'), PUBLIC_URL, 'the.id.token'),
    );
    expect(`${target.origin}${target.pathname}`).toBe('https://login.example/tenant/logout');
    expect(target.searchParams.get('id_token_hint')).toBe('the.id.token');
    // Back to wechart's own signed-out page (design 09, state C; T697).
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${PUBLIC_URL}/signed-out`);
    expect(target.searchParams.get('client_id')).toBe('wechart');
  });

  it('back to wechart when the provider has none, or can’t be reached', () => {
    expect(signOutTarget(provider(), PUBLIC_URL, 'the.id.token')).toBe(`${PUBLIC_URL}/signed-out`);
    expect(signOutTarget(undefined, PUBLIC_URL, 'the.id.token')).toBe(`${PUBLIC_URL}/signed-out`);
  });

  it('without a hint when there was no ID token', () => {
    const target = new URL(
      signOutTarget(provider('https://login.example/tenant/logout'), PUBLIC_URL, undefined),
    );
    expect(target.searchParams.has('id_token_hint')).toBe(false);
  });
});
