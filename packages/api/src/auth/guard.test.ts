import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { forgetTestCounts, testCounter } from '../mcp/counter.fixture';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
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
 * `public` (health and sign-in), `user`, or `admin` (a Super-Admin's alone,
 * T323); the `cube` class went with the model store (T431). The sweep asks
 * every route the server has,
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
  await forgetTestCounts();
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

/**
 * A server with every route: those registered only with their store too,
 * the folder access routes (T314's review).
 */
function everyRoute(): FastifyInstance {
  const app = buildServer({
    // The data sources' routes, and the install Job's seeding route (T443).
    // MCP on (T774): its routes are in the sweep, so none is open by being forgotten.
    config: { ...secured, seedToken: 'a-seed-token-for-the-sweep', mcpHost: 'mcp.example.com' },
    sessions: pgSessionStore(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    // The audit trail's (T369) and proposals' (T349, T351) routes.
    documents: documents(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    // The personal access tokens' routes (T767 on).
    accessTokens: accessTokenStore(getDb()),
    // And `/mcp`'s request counts (T779, T780): with none kept, it takes nothing.
    mcpRateLimits: testCounter(),
  });
  servers.push(app);
  return app;
}

/** A concrete address for a route's pattern: every parameter a made-up id. */
const addressOf = (url: string) => url.replace(/:[A-Za-z]+/g, 'no-such-id').replace(/\*$/, 'x');

describe('with security on and no session (T318, AC-251)', () => {
  // That the handler doesn't run is user.test.ts's "creates nothing on behalf
  // of a user who isn't there".
  it('answers every user route 401 with nothing but the error', async () => {
    const app = everyRoute();
    await app.ready();
    // Admin routes too (T323): a Super-Admin's, so no one's without a session.
    const routes = routesOf(app).filter(
      (route) => route.access === 'user' || route.access === 'admin',
    );
    // The API's own routes, not a handful: the sweep would pass vacuously on none.
    expect(routes.length).toBeGreaterThan(30);
    // The routes registered only with their store are in it too (T314's review).
    expect(routes.map((route) => `${route.method} ${route.url}`)).toEqual(
      expect.arrayContaining([
        'GET /api/folders/:folderId/access',
        'PUT /api/folders/:folderId/access',
      ]),
    );

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

  it('exempts only health, sign-in and the install Job’s seeding', async () => {
    const app = everyRoute();
    await app.ready();
    const open = routesOf(app)
      .filter(
        (route) => route.access !== 'user' && route.access !== 'admin' && route.method !== 'HEAD',
      )
      .map((route) => `${route.access} ${route.method} ${route.url}`)
      .sort();
    expect(open).toEqual([
      // The install Job's, answering only its token (T443; AC-251 amended).
      'install POST /api/data-sources/root-default',
      // MCP, where a host is named (T774): a client signs in with its token,
      // never the session; until T776 checks it, every POST is 401 and the
      // rest 405, with nothing run.
      'public DELETE /mcp',
      'public GET /api/auth/callback',
      // Whether anyone is signed in, for the web server's page gate (T321).
      'public GET /api/auth/check',
      'public GET /api/auth/login',
      'public GET /api/cube-health',
      'public GET /api/health',
      'public GET /mcp',
      // Sign-in's own pages for its end (design 09, states C and D; T697): the
      // product mark and one sentence, no wechart content (AC-251's exemption).
      'public GET /sign-in-failed',
      'public GET /signed-out',
      'public POST /api/auth/logout',
      'public POST /mcp',
    ]);
    for (const method of ['POST', 'GET', 'DELETE'] as const) {
      // On the MCP host: any other is refused first (T775, AC-436).
      const mcp = await app.inject({ method, url: '/mcp', headers: { host: 'mcp.example.com' } });
      expect(mcp.statusCode, method).toBe(method === 'POST' ? 401 : 405);
    }
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  /**
   * T431, AC-251 and AC-327: `Fails when: … wechart serves any route for
   * Cube to read the model through.` xcube serves the model (T447), so the
   * store's routes are gone, the key Cube read them with means nothing, and
   * no route has a class of its own for Cube.
   */
  it('serves no route for Cube to read the model through', async () => {
    const app = buildServer({ config: secured, sessions: pgSessionStore(getDb()) });
    servers.push(app);
    await app.ready();
    const routes = routesOf(app);
    expect(routes.filter((route) => route.url.startsWith('/api/cube-model'))).toEqual([]);
    expect(routes.filter((route) => (route.access as string) === 'cube')).toEqual([]);
    for (const path of ['files', 'version', 'drafts/d1']) {
      const asked = await app.inject({
        method: 'GET',
        url: `/api/cube-model/${path}`,
        headers: { 'x-wechart-model-key': 'dev-model-key' },
      });
      // Asked as Cube once asked it: refused, and nothing of the model.
      expect(asked.statusCode, path).toBe(401);
      expect(asked.json(), path).toEqual({ error: 'unauthenticated' });
    }
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
    // As shipped: the data sources' routes, and the install Job's seeding (T443).
    const app = buildServer({
      config: { ...config, seedToken: 'a-seed-token-for-the-sweep-0123456789' },
      dataSources: dataSourceStore(getDb()),
      introspectionRetryMs: 0,
    });
    servers.push(app);
    await app.ready();
    // Not the install Job's route, which answers its token alone in every mode
    // (AC-251's exemption, T443): it is no user's permission, and none is asked for.
    const routes = routesOf(app).filter(
      (route) => route.method !== 'HEAD' && route.access !== 'install',
    );
    expect(routesOf(app).filter((route) => route.access === 'install')).toHaveLength(1);
    expect(routes.length).toBeGreaterThan(30);
    for (const route of routes) {
      const response = await app.inject({
        method: route.method as NonNullable<InjectOptions['method']>,
        url: addressOf(route.url),
        ...(route.method === 'GET' ? {} : { payload: {} }),
      });
      const where = `${route.method} ${route.url}`;
      // No route asks anyone to sign in, or refuses anyone at all.
      expect(errorOf(response.body), where).not.toBe('unauthenticated');
      expect(response.statusCode, where).not.toBe(401);
    }
  });
});
