import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { routesOf } from './guard';
import { pgSessionStore } from './session-store';
import { PUBLIC_URL, signIn, USERS } from './sign-in.fixture';

/**
 * T323 (AC-256, AC-265).
 * AC-256: THE SYSTEM SHALL take the Super-Admin group's name from the
 * deployment's configuration, and treat that group's members as Super-Admins.
 * `Fails when: a member of the configured group lacks a Super-Admin
 * permission, or someone outside it has one.`
 * AC-265: … give Super-Admins … every admin surface (Jobs, Schedules,
 * Security, folder permissions and the audit trail).
 *
 * The Security workspace's routes are the admin routes today: its Cube
 * diagnostics, and a previewed security context (T322). Users sign in through
 * the development provider: `super` is in `wechart-super-admins`, `writer`
 * isn't.
 */
const GROUP = 'wechart-super-admins';
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  port: 4100,
  modelDir: '',
};
/** Security on, with no Super-Admin group configured. */
const unconfigured = {
  ...base,
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
const secured = { ...unconfigured, superAdminGroup: GROUP };

/** A Cube that records the claims of each token it is sent, and answers plainly. */
function recordingCube(): { cube: CubeClient; claims: Record<string, unknown>[] } {
  const claims: Record<string, unknown>[] = [];
  const cube = new CubeClient({
    apiUrl: base.cubeApiUrl,
    apiSecret: base.cubeApiSecret,
    securityContext: base.securityContext,
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      const token = String(new Headers(init?.headers).get('authorization')).replace('Bearer ', '');
      claims.push(
        JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<
          string,
          unknown
        >,
      );
      const body = new URL(String(url)).pathname.endsWith('/sql')
        ? { sql: { sql: ['select 1', []] } }
        : { data: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch,
  });
  return { cube, claims };
}

/** Cube for `/api/cube-auth`'s probes, so they answer at once rather than time out. */
const cubeAnswering = (async () =>
  new Response(JSON.stringify({ error: 'Not a token Cube knows' }), {
    status: 403,
  })) as typeof fetch;

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

describe('the Super-Admin group, from the configuration (T323, AC-256)', () => {
  it('is read from WECHART_SUPER_ADMIN_GROUP', () => {
    const config = loadConfig({
      CUBE_API_SECRET: 'secret',
      WECHART_SUPER_ADMIN_GROUP: GROUP,
    });
    expect(config.superAdminGroup).toBe(GROUP);
    expect(loadConfig({ CUBE_API_SECRET: 'secret' }).superAdminGroup).toBeUndefined();
  });

  it('makes its members Super-Admins, and no one else', async () => {
    const app = serve({ config: secured, sessions: pgSessionStore(getDb()) });
    const superAdmin = await signIn(app, USERS['super']!);
    const writer = await signIn(app, USERS['writer']!);
    const me = async (cookie: string) =>
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json() as {
        superAdmin: boolean;
      };
    expect((await me(superAdmin)).superAdmin).toBe(true);
    expect((await me(writer)).superAdmin).toBe(false);
  });

  it('makes no one a Super-Admin where no group is configured', async () => {
    const app = serve({ config: unconfigured, sessions: pgSessionStore(getDb()) });
    const cookie = await signIn(app, USERS['super']!);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect((me.json() as { superAdmin: boolean }).superAdmin).toBe(false);
  });
});

describe('the admin routes (T323, AC-256, AC-265)', () => {
  it('are the Security workspace’s', async () => {
    const app = serve({ config: secured, sessions: pgSessionStore(getDb()) });
    await app.ready();
    const admin = routesOf(app)
      .filter((route) => route.access === 'admin' && route.method !== 'HEAD')
      .map((route) => `${route.method} ${route.url}`)
      .sort();
    // Whether Cube takes unsigned requests: the Security workspace's posture
    // check. Cube's scopes aren't here: Jobs, for read-write members, asks them.
    expect(admin).toEqual(['GET /api/cube-auth']);
  });

  it('answer a Super-Admin, and refuse anyone else with 403', async () => {
    const app = serve({
      config: secured,
      sessions: pgSessionStore(getDb()),
      healthFetch: cubeAnswering,
    });
    const superAdmin = await signIn(app, USERS['super']!);
    const writer = await signIn(app, USERS['writer']!);
    for (const url of ['/api/cube-auth']) {
      const refused = await app.inject({ method: 'GET', url, headers: { cookie: writer } });
      expect(refused.statusCode, url).toBe(403);
      expect(refused.json(), url).toEqual({ error: 'Only a Super-Admin can use this.' });
      const answered = await app.inject({ method: 'GET', url, headers: { cookie: superAdmin } });
      expect(answered.statusCode, url).toBe(200);
    }
  });

  it('let a Super-Admin preview another security context, which Cube is then asked as (T322’s review)', async () => {
    const { cube, claims } = recordingCube();
    const app = serve({ config: secured, cube, sessions: pgSessionStore(getDb()) });
    const cookie = await signIn(app, USERS['super']!);
    const preview = { query: { measures: ['orders.count'] }, context: { groups: ['managers'] } };
    for (const url of ['/api/load', '/api/sql']) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { cookie },
        payload: preview,
      });
      expect(response.statusCode, url).toBe(200);
    }
    expect(claims.map((each) => each['groups'])).toEqual([['managers'], ['managers']]);
  });

  it('are open with security off: the single user is a Super-Admin', async () => {
    const app = serve({ config: base, healthFetch: cubeAnswering });
    for (const url of ['/api/cube-auth']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
    }
  });
});
