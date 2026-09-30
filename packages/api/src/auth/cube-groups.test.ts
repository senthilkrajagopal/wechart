import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { documents } from '../repos/documents';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { pgSessionStore } from './session-store';
import { PUBLIC_URL, signIn, USERS } from './sign-in.fixture';

/**
 * T322 (AC-008): WHEN wechart queries Cube, THE SYSTEM SHALL attach the
 * configured security context to every request. WHILE security is enabled, it
 * SHALL also attach the signed-in user's AD groups, so the model's access
 * policies apply by group.
 * `Fails when: … with security enabled, a request carries no groups or groups
 * other than the user's …`
 *
 * Cube stands in as a recorder of the tokens it is sent; the users sign in
 * through the real development provider.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
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

interface Asked {
  readonly path: string;
  readonly claims: Record<string, unknown>;
}

/**
 * A Cube that records each request's path and the claims its token carries.
 */
function recordingCube(): {
  cube: CubeClient;
  asked: Asked[];
} {
  const asked: Asked[] = [];
  const cube = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: config.cubeApiSecret,
    securityContext: config.securityContext,
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      const token = String(new Headers(init?.headers).get('authorization')).replace('Bearer ', '');
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const path = new URL(String(url)).pathname;
      asked.push({ path, claims });
      const body = path.endsWith('/sql')
        ? { sql: { sql: ['select 1', []] } }
        : path.endsWith('/meta')
          ? { cubes: [] }
          : path.endsWith('/dry-run')
            ? { pivotQuery: {}, normalizedQueries: [] }
            : { data: [], annotation: {} };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch,
  });
  return { cube, asked };
}

const servers: FastifyInstance[] = [];
/** Dashboards made here, removed after. */
const boards: string[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  for (const id of boards) await documents(getDb()).remove('dashboard', id);
  await closeDb();
});

/**
 * With sign-in on, a query names the item it serves (T340, AC-268): a
 * dashboard in the root filtering on `orders`, which the queries here use.
 */
async function rootBoard(): Promise<{ kind: 'dashboard'; id: string }> {
  const id = randomUUID();
  boards.push(id);
  await documents(getDb()).create({
    kind: 'dashboard',
    id,
    body: {
      title: 'Groups',
      folderId: 'root',
      owner: 'admin',
      filters: [{ member: 'orders.status' }],
    },
  });
  return { kind: 'dashboard', id };
}
const serve = (options: Parameters<typeof buildServer>[0]) => {
  const app = buildServer(options);
  servers.push(app);
  return app;
};

const QUERY = { query: { measures: ['orders.count'] } };

describe('a signed-in user’s groups in every Cube request (T322, AC-008)', () => {
  it('asks Cube with the configured context and exactly the user’s groups', async () => {
    const { cube, asked } = recordingCube();
    // A dashboard of theirs to ask for (T340), in a root granting each of
    // their groups, so every one is named and carried (T437).
    const payload = { ...QUERY, for: await rootBoard() };
    const app = serve({
      config: secured,
      cube,
      sessions: pgSessionStore(getDb()),
      documents: documents(getDb()),
      folderAccess: {
        tree: async () => [
          {
            id: 'root',
            parentId: null,
            access: { readOnly: [...USERS['many']!.groups], readWrite: null },
          },
        ],
        set: async () => true,
      },
    });
    const cookie = await signIn(app, USERS['many']!);
    const headers = { cookie };

    const answers = [
      await app.inject({ method: 'GET', url: '/api/meta', headers }),
      await app.inject({ method: 'POST', url: '/api/load', headers, payload }),
      await app.inject({ method: 'POST', url: '/api/sql', headers, payload }),
      await app.inject({ method: 'POST', url: '/api/acceleration', headers, payload }),
      await app.inject({ method: 'DELETE', url: '/api/running-query/r-1', headers }),
    ];
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200, 200, 200, 204]);

    // Every route above reached Cube: none skipped by an error.
    expect(asked.map(({ path }) => path.replace('/cubejs-api', ''))).toEqual([
      '/v1/meta',
      '/v1/load',
      '/v1/sql',
      '/v1/sql',
      '/v1/dry-run',
      '/v1/meta',
      '/v1/running-query/r-1',
    ]);
    for (const { path, claims } of asked) {
      expect({ tenant: claims['tenant'], groups: claims['groups'] }, path).toEqual({
        tenant: 'acme',
        groups: USERS['many']!.groups,
      });
    }
  });

  it('keeps each set of groups’ metadata apart: what Cube shows depends on them', async () => {
    const { cube, asked } = recordingCube();
    const app = serve({ config: secured, cube, sessions: pgSessionStore(getDb()) });
    const writer = await signIn(app, USERS['writer']!);
    const reader = await signIn(app, USERS['reader']!);

    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie: writer } });
    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie: reader } });
    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie: writer } });

    const metas = asked.filter(({ path }) => path.endsWith('/meta'));
    // One fetch per set of groups; the second writer request is answered from theirs.
    expect(metas.map(({ claims }) => claims['groups'])).toEqual([['sales-rw'], ['sales-ro']]);
  });

  // T322's review: a publish must reach every set's metadata, not only the
  // configured context's, or a new member is missing for up to a minute.
  it('asks each set of groups afresh after a publish', async () => {
    const { cube, asked } = recordingCube();
    const files: { path: string; content: string }[] = [];
    const app = serve({
      // With a Super-Admin to publish (T334).
      config: { ...secured, superAdminGroup: 'wechart-super-admins' },
      cube,
      sessions: pgSessionStore(getDb()),
      modelFiles: {
        list: async () => files,
        seed: async () => undefined,
        write: async (written) => {
          files.push(...written);
        },
      },
      // xcube checks the publish (T445, T431).
      xcube: xcubeAdmin({
        cubeApiUrl: config.cubeApiUrl,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: fakeXcube().fetch,
      }),
    });
    const cookie = await signIn(app, USERS['writer']!);
    const writersMeta = () =>
      asked.filter(
        ({ path, claims }) =>
          path.endsWith('/meta') && JSON.stringify(claims['groups']) === '["sales-rw"]',
      );

    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie } });
    expect(writersMeta()).toHaveLength(1);
    // By someone who may change the root's models (T334): here, with no
    // folder's groups stored, a Super-Admin alone.
    const published = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      headers: { cookie: await signIn(app, USERS['super']!) },
      payload: {
        files: [{ path: 'cubes/a.yml', content: 'cubes:\n  - name: a\n    sql_table: a\n' }],
      },
    });
    expect(published.statusCode, published.body).toBe(200);
    await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie } });
    expect(writersMeta()).toHaveLength(2);
  });

  it('refuses a previewed context to anyone but a Super-Admin: it would stand in for their groups', async () => {
    const { cube, asked } = recordingCube();
    const app = serve({ config: secured, cube, sessions: pgSessionStore(getDb()) });
    const cookie = await signIn(app, USERS['writer']!);
    const preview = { ...QUERY, context: { groups: ['managers'] } };

    for (const url of ['/api/load', '/api/sql']) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { cookie },
        payload: preview,
      });
      expect(response.statusCode, url).toBe(403);
    }
    expect(asked).toEqual([]);
  });
});

/**
 * T437 (AC-008, AC-326): a signed-in user's token carries only their groups
 * that some access policy names or some folder's allowed set holds: every
 * group granted on a folder, and the Super-Admin group (requirements "A
 * token's groups").
 */
describe('only the groups some policy or folder names (T437, AC-008)', () => {
  it('carries, on every route, the user’s groups a folder grants or a policy names, and no other', async () => {
    const { cube, asked } = recordingCube();
    // A dashboard in the root, which g03 reads, to ask for (T340).
    const payload = { ...QUERY, for: await rootBoard() };
    const app = serve({
      config: { ...secured, superAdminGroup: 'wechart-super-admins' },
      cube,
      sessions: pgSessionStore(getDb()),
      documents: documents(getDb()),
      folderAccess: {
        tree: async () => [
          { id: 'root', parentId: null, access: { readOnly: ['g03'], readWrite: null } },
          { id: 'f-a', parentId: 'root', access: { readOnly: null, readWrite: ['g17', 'x'] } },
        ],
        set: async () => true,
      },
      modelFiles: {
        list: async () => [],
        all: async () => [
          {
            folderId: 'f-a',
            path: 'hr.yml',
            content:
              'cubes:\n  - name: hr\n    sql_table: hr\n    access_policy:\n      - groups: [g09, g20]\n      - group: "*"\n',
          },
        ],
        seed: async () => undefined,
        write: async () => undefined,
      },
    });
    const headers = { cookie: await signIn(app, USERS['many']!) };

    const answers = [
      await app.inject({ method: 'GET', url: '/api/meta', headers }),
      await app.inject({ method: 'POST', url: '/api/load', headers, payload }),
      await app.inject({ method: 'POST', url: '/api/sql', headers, payload }),
      await app.inject({ method: 'POST', url: '/api/acceleration', headers, payload }),
      await app.inject({ method: 'DELETE', url: '/api/running-query/r-1', headers }),
    ];
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200, 200, 200, 204]);
    expect(asked).toHaveLength(7);
    for (const { path, claims } of asked)
      expect(claims['groups'], path).toEqual(['g03', 'g09', 'g17', 'g20']);
  });
});

describe('with security off (AC-008, phase 1)', () => {
  it('asks Cube with the configured context alone', async () => {
    const { cube, asked } = recordingCube();
    const app = serve({ config, cube });
    await app.inject({ method: 'POST', url: '/api/load', payload: QUERY });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.claims['tenant']).toBe('acme');
    expect(asked[0]!.claims).not.toHaveProperty('groups');
  });
});
