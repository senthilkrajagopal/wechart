import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { imageStore } from '../repos/images';
import { buildServer } from '../server';

/**
 * T327, AC-262: WHEN a group has read-write access to a folder, THE SYSTEM
 * SHALL let its members see, view-only, every dashboard, chart, model and data
 * source in each ancestor folder up to the root.
 *
 * `writer` (group `sales-rw`) has read-write on /A/B only. /A and the root grant
 * nothing, so all they get there comes from reaching up from /A/B. The
 * dashboards' and charts' half, library and local charts alike; models and
 * data sources become folder items with T334 and T335, and their half is
 * tested there.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  superAdminGroup: 'wechart-super-admins',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

/** A word no other test's titles carry, so search finds only this test's items. */
const MARK = `ancestors${randomUUID().slice(0, 8)}`;

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids = {
  a: '',
  b: '',
  aDashboard: '',
  aLocal: '',
  aLibrary: '',
  rootDashboard: '',
  rootLibrary: '',
  // The writer's own, in /A/B.
  bDashboard: '',
  bLibrary: '',
};
/** The root's groups, set aside so no grant there reaches this test's users. */
let rootBefore: StoredDocument | null = null;

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.a = await make('folder', { title: `A ${MARK}`, folderId: 'root' });
  ids.b = await make('folder', {
    title: `B ${MARK}`,
    folderId: ids.a,
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.aLibrary = await make('chart', { title: `Library chart in A ${MARK}`, folderId: ids.a });
  ids.aDashboard = await make('dashboard', {
    title: `Dashboard in A ${MARK}`,
    folderId: ids.a,
    charts: [ids.aLibrary],
  });
  ids.aLocal = await make('chart', {
    title: `A's dashboard's own chart ${MARK}`,
    folderId: ids.a,
    localToDashboardId: ids.aDashboard,
  });
  ids.rootLibrary = await make('chart', {
    title: `Library chart at the root ${MARK}`,
    folderId: 'root',
  });
  ids.rootDashboard = await make('dashboard', {
    title: `Dashboard at the root ${MARK}`,
    folderId: 'root',
  });
  ids.bLibrary = await make('chart', { title: `Library chart in B ${MARK}`, folderId: ids.b });
  ids.bDashboard = await make('dashboard', {
    title: `Dashboard in B ${MARK}`,
    folderId: ids.b,
    charts: [ids.bLibrary, ids.aLibrary],
  });

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
    images: imageStore(getDb()),
  });
  for (const who of ['writer', 'nobody']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  await app.close();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const open = (who: string, kind: string, id: string) =>
  as(who, { method: 'GET', url: `/api/documents/${kind}/${id}` });
const listed = async (who: string, folderId: string) =>
  (await as(who, { method: 'GET', url: `/api/folders/${folderId}/contents` }))
    .json<{ id: string }[]>()
    .map((row) => row.id);
const found = async (who: string) =>
  (await as(who, { method: 'GET', url: `/api/search?q=${MARK}&limit=50` }))
    .json<{ id: string }[]>()
    .map((hit) => hit.id);

describe('a read-write member sees their folder’s ancestors (T327, AC-262)', () => {
  it('lists every dashboard and chart in /A and at the root', async () => {
    expect(await listed('writer', ids.a)).toEqual(
      expect.arrayContaining([ids.b, ids.aDashboard, ids.aLibrary]),
    );
    expect(await listed('writer', 'root')).toEqual(
      expect.arrayContaining([ids.a, ids.rootDashboard, ids.rootLibrary]),
    );
  });

  it('opens each of them, and the folders on the way up', async () => {
    for (const [kind, id] of [
      ['folder', ids.a],
      ['dashboard', ids.aDashboard],
      ['chart', ids.aLibrary],
      ['chart', ids.aLocal],
      ['dashboard', ids.rootDashboard],
      ['chart', ids.rootLibrary],
    ] as const) {
      const opened = await open('writer', kind, id);
      expect(opened.statusCode, `${kind} ${id}`).toBe(200);
      expect(opened.json<{ id: string }>().id, `${kind} ${id}`).toBe(id);
    }
  });

  it('finds them in search', async () => {
    expect(await found('writer')).toEqual(
      expect.arrayContaining([ids.aDashboard, ids.aLibrary, ids.rootDashboard, ids.rootLibrary]),
    );
  });

  it('gives none of it to someone no grant reaches', async () => {
    const contents = await as('nobody', { method: 'GET', url: `/api/folders/${ids.a}/contents` });
    expect(contents.statusCode).toBe(404);
    for (const [kind, id] of [
      ['dashboard', ids.aDashboard],
      ['chart', ids.aLibrary],
      ['chart', ids.aLocal],
    ] as const) {
      expect((await open('nobody', kind, id)).statusCode, `${kind} ${id}`).toBe(404);
    }
    expect(await found('nobody')).toEqual([]);
  });
});

describe('a read-write member changes nothing above their folder (T327, AC-262)', () => {
  it('answers 403 to every create, change, move and delete in /A and at the root, and changes nothing', async () => {
    const before = {
      aDashboard: (await docs().get('dashboard', ids.aDashboard))!,
      aLibrary: (await docs().get('chart', ids.aLibrary))!,
      aLocal: (await docs().get('chart', ids.aLocal))!,
      a: (await docs().get('folder', ids.a))!,
      b: (await docs().get('folder', ids.b))!,
      rootDashboard: (await docs().get('dashboard', ids.rootDashboard))!,
      rootLibrary: (await docs().get('chart', ids.rootLibrary))!,
      bDashboard: (await docs().get('dashboard', ids.bDashboard))!,
    };
    const contentsBefore = {
      a: (await listed('writer', ids.a)).sort(),
      root: (await listed('writer', 'root')).sort(),
    };
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const refusals: [string, InjectOptions][] = [
      [
        'create a dashboard in /A',
        {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'dashboard', title: 'Mine', folderId: ids.a },
        },
      ],
      [
        'create a subfolder at the root',
        {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'folder', title: 'Mine', folderId: 'root' },
        },
      ],
      [
        'save the dashboard in /A',
        {
          method: 'PUT',
          url: `/api/documents/dashboard/${ids.aDashboard}`,
          payload: {
            body: { ...before.aDashboard.body, title: 'Changed' },
            version: before.aDashboard.version,
          },
        },
      ],
      [
        'save the dashboard in /A through the editor',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.aDashboard}`,
          payload: {
            dashboard: {
              body: { ...before.aDashboard.body, title: 'Changed' },
              version: before.aDashboard.version,
            },
            charts: [],
          },
        },
      ],
      [
        'save the library chart in /A',
        {
          method: 'PUT',
          url: `/api/documents/chart/${ids.aLibrary}`,
          payload: {
            body: { ...before.aLibrary.body, title: 'Changed' },
            version: before.aLibrary.version,
          },
        },
      ],
      [
        'save /A’s dashboard’s own chart',
        {
          method: 'PUT',
          url: `/api/documents/chart/${ids.aLocal}`,
          payload: {
            body: { ...before.aLocal.body, title: 'Changed' },
            version: before.aLocal.version,
          },
        },
      ],
      // The path only this reach opens: /A's library chart is on their own
      // dashboard, which they may save, and saving a library chart with it
      // changes it everywhere.
      [
        'save their own dashboard with /A’s library chart changed',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.bDashboard}`,
          payload: {
            dashboard: { body: before.bDashboard.body, version: before.bDashboard.version },
            charts: [
              {
                id: ids.aLibrary,
                body: { ...before.aLibrary.body, title: 'Changed' },
                version: before.aLibrary.version,
              },
            ],
          },
        },
      ],
      [
        'save their own dashboard, taking /A’s library chart into /A/B',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.bDashboard}`,
          payload: {
            dashboard: { body: before.bDashboard.body, version: before.bDashboard.version },
            charts: [
              {
                id: ids.aLibrary,
                body: { ...before.aLibrary.body, folderId: ids.b, title: 'Mine now' },
                version: before.aLibrary.version,
              },
            ],
          },
        },
      ],
      [
        'save their own dashboard with a new library chart in /A',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.bDashboard}`,
          payload: {
            dashboard: { body: before.bDashboard.body, version: before.bDashboard.version },
            charts: [{ id: randomUUID(), body: { title: 'Mine', folderId: ids.a }, version: 0 }],
          },
        },
      ],
      [
        'put a chart on /A’s dashboard',
        {
          method: 'POST',
          url: `/api/dashboards/${ids.aDashboard}/charts`,
          payload: { chartId: ids.bLibrary },
        },
      ],
      [
        'add an image to /A’s dashboard',
        {
          method: 'POST',
          url: `/api/dashboards/${ids.aDashboard}/images`,
          payload: { contentType: 'image/png', data: png.toString('base64') },
        },
      ],
      [
        'rename the root’s dashboard',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.rootDashboard}`,
          payload: { title: 'Changed' },
        },
      ],
      [
        'move /A’s dashboard into /A/B, which they may write',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.aDashboard}`,
          payload: { folderId: ids.b },
        },
      ],
      [
        'move their own dashboard into /A',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.bDashboard}`,
          payload: { folderId: ids.a },
        },
      ],
      [
        'move /A/B out of /A, to the root',
        { method: 'PATCH', url: `/api/documents/folder/${ids.b}`, payload: { folderId: 'root' } },
      ],
      [
        'delete the root’s library chart',
        { method: 'DELETE', url: `/api/documents/chart/${ids.rootLibrary}?confirm=true` },
      ],
      [
        'rename /A',
        {
          method: 'PUT',
          url: `/api/documents/folder/${ids.a}`,
          payload: { body: { ...before.a.body, title: 'Changed' }, version: before.a.version },
        },
      ],
      [
        'set /A’s groups',
        {
          method: 'PUT',
          url: `/api/folders/${ids.a}/access`,
          payload: { readWrite: ['sales-rw'] },
        },
      ],
      [
        'set the root’s groups',
        { method: 'PUT', url: '/api/folders/root/access', payload: { readWrite: ['sales-rw'] } },
      ],
    ];
    for (const [what, options] of refusals) {
      expect((await as('writer', options)).statusCode, what).toBe(403);
    }
    expect(await docs().get('dashboard', ids.aDashboard)).toEqual(before.aDashboard);
    expect(await docs().get('chart', ids.aLibrary)).toEqual(before.aLibrary);
    expect(await docs().get('chart', ids.aLocal)).toEqual(before.aLocal);
    expect(await docs().get('folder', ids.a)).toEqual(before.a);
    expect(await docs().get('folder', ids.b)).toEqual(before.b);
    expect(await docs().get('dashboard', ids.rootDashboard)).toEqual(before.rootDashboard);
    expect(await docs().get('chart', ids.rootLibrary)).toEqual(before.rootLibrary);
    expect(await docs().get('dashboard', ids.bDashboard)).toEqual(before.bDashboard);
    expect(await docs().get('setting', ROOT_ACCESS_ID)).toBeNull();
    expect((await listed('writer', ids.a)).sort()).toEqual(contentsBefore.a);
    expect((await listed('writer', 'root')).sort()).toEqual(contentsBefore.root);
  });
});
