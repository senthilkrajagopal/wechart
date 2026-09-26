import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { routesOf } from './guard';
import { pgSessionStore } from './session-store';

/**
 * T318 (AC-251): WHERE security is enabled, WHEN a request without a
 * signed-in session reaches a wechart … API route, THE SYSTEM SHALL … answer
 * an API request with 401, returning no wechart content …. Health routes are
 * exempt.
 * `Fails when: … any API route other than health returns data, without a
 * signed-in session.`
 *
 * Every route declares its access class (tasks.md, Phase 2 decisions):
 * `public` (health and sign-in), `cube` (the model store Cube reads, which
 * checks its own key), `user`, or `admin` (a Super-Admin's alone, T323). The
 * sweep asks every route the server has,
 * so a route added later is covered without anyone adding it here.
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
  publicUrl: 'http://localhost:5373',
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid',
    allowHttp: true,
  },
};

const servers: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await closeDb();
});

/** An answer's `error`, where it has one: some answer with no body at all. */
const errorOf = (body: string): unknown => {
  try {
    return (JSON.parse(body) as { error?: unknown } | null)?.error;
  } catch {
    return undefined;
  }
};

/** A concrete address for a route's pattern: every parameter a made-up id. */
const addressOf = (url: string) => url.replace(/:[A-Za-z]+/g, 'no-such-id').replace(/\*$/, 'x');

describe('with security on and no session (T318, AC-251)', () => {
  // That the handler doesn't run is user.test.ts's "creates nothing on behalf
  // of a user who isn't there".
  it('answers every user route 401 with nothing but the error', async () => {
    const app = buildServer({ config: secured, sessions: pgSessionStore(getDb()) });
    servers.push(app);
    await app.ready();
    // Admin routes too (T323): a Super-Admin's, so no one's without a session.
    const routes = routesOf(app).filter(
      (route) => route.access === 'user' || route.access === 'admin',
    );
    // The API's own routes, not a handful: the sweep would pass vacuously on none.
    expect(routes.length).toBeGreaterThan(30);

    for (const route of routes) {
      const response = await app.inject({
        method: route.method as NonNullable<InjectOptions['method']>,
        url: addressOf(route.url),
        ...(route.method === 'GET' || route.method === 'HEAD' ? {} : { payload: {} }),
      });
      const where = `${route.method} ${route.url}`;
      expect(response.statusCode, where).toBe(401);
      if (route.method !== 'HEAD') {
        expect(response.json(), where).toEqual({ error: 'unauthenticated' });
      }
    }
  });

  it('exempts only health, sign-in and the model store Cube reads by its key', async () => {
    const app = buildServer({ config: secured, sessions: pgSessionStore(getDb()) });
    servers.push(app);
    await app.ready();
    const open = routesOf(app)
      .filter(
        (route) => route.access !== 'user' && route.access !== 'admin' && route.method !== 'HEAD',
      )
      .map((route) => `${route.access} ${route.method} ${route.url}`)
      .sort();
    expect(open).toEqual([
      'cube GET /api/cube-model/drafts/:id',
      'cube GET /api/cube-model/files',
      'cube GET /api/cube-model/version',
      'public GET /api/auth/callback',
      // Whether anyone is signed in, for the web server's page gate (T321).
      'public GET /api/auth/check',
      'public GET /api/auth/login',
      'public GET /api/cube-health',
      'public GET /api/health',
      'public POST /api/auth/logout',
    ]);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  // T318's review: the class alone was pinned, not what it lets through.
  it('lets Cube read the model with its key and no session, and no one without it', async () => {
    const app = buildServer({
      config: { ...secured, modelKey: 'the-model-key' },
      sessions: pgSessionStore(getDb()),
    });
    servers.push(app);
    const withKey = await app.inject({
      method: 'GET',
      url: '/api/cube-model/version',
      headers: { 'x-wechart-model-key': 'the-model-key' },
    });
    expect(withKey.statusCode).toBe(200);
    expect(withKey.json()).toHaveProperty('version');
    // Refused by the route's own key check, not taken for a lapsed sign-in.
    const without = await app.inject({ method: 'GET', url: '/api/cube-model/version' });
    expect(without.statusCode).toBe(401);
    expect(without.json()).toEqual({ error: 'Not Cube.' });
  });

  it('refuses to start with a route that declares no access class', async () => {
    const app = buildServer({ config: secured, sessions: pgSessionStore(getDb()) });
    servers.push(app);
    let failure: unknown;
    try {
      app.get('/api/unclassified', async () => ({ secret: true }));
      await app.ready();
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toMatch(/GET \/api\/unclassified declares no access class/);
  });
});

describe('with security off (T311’s review, AC-254)', () => {
  it('answers no route 401: nobody is asked to sign in', async () => {
    const app = buildServer({ config, introspectionRetryMs: 0 });
    servers.push(app);
    await app.ready();
    const routes = routesOf(app).filter((route) => route.method !== 'HEAD');
    expect(routes.length).toBeGreaterThan(30);
    for (const route of routes) {
      const response = await app.inject({
        method: route.method as NonNullable<InjectOptions['method']>,
        url: addressOf(route.url),
        ...(route.method === 'GET' ? {} : { payload: {} }),
      });
      const where = `${route.method} ${route.url}`;
      // No route asks anyone to sign in…
      expect(errorOf(response.body), where).not.toBe('unauthenticated');
      // …and only Cube's model routes, by their own key, refuse anyone at all.
      if (route.access !== 'cube') expect(response.statusCode, where).not.toBe(401);
    }
  });
});
