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
 * T326:
 *
 * AC-263: WHILE a user has only read-only access to a folder, THE SYSTEM SHALL
 * show them the dashboards (and the charts on them) in it, its descendants and
 * its ancestors, and no model, data source or library chart.
 *
 * AC-266: read-only users view, export and bookmark, and change nothing.
 *
 * AC-264: a folder or item no grant reaches is neither listed nor opened.
 *
 * The dashboards' and charts' half, through the routes that open and change
 * them. Models and data sources become folder items with T334 and T335; their
 * half waits for those.
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

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids = {
  r: '',
  x: '',
  dashboard: '',
  local: '',
  onDashboard: '',
  library: '',
  // The writer's: W (read-write `sales-rw`) and W2 beneath it, a dashboard in
  // W with a chart of its own kept apart from it (in X), and a library chart
  // in W that a dashboard in X shows too.
  w: '',
  w2: '',
  writersDashboard: '',
  keptApart: '',
  shared: '',
  hiddenDashboard: '',
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
  ids.w = await make('folder', {
    title: 'Write here',
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.w2 = await make('folder', { title: 'Beneath', folderId: ids.w });
  ids.r = await make('folder', {
    title: 'Read here',
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: null },
  });
  ids.x = await make('folder', { title: 'Hidden', folderId: 'root' });
  // A library chart kept in a folder the reader can't see, shown on their dashboard.
  ids.onDashboard = await make('chart', { title: 'Shown on the dashboard', folderId: ids.x });
  ids.dashboard = await make('dashboard', {
    title: 'The dashboard',
    folderId: ids.r,
    charts: [ids.onDashboard],
  });
  ids.local = await make('chart', {
    title: 'The dashboard’s own chart',
    folderId: ids.r,
    localToDashboardId: ids.dashboard,
  });
  // A library chart in the reader's folder, on no dashboard of theirs.
  ids.library = await make('chart', { title: 'A library chart', folderId: ids.r });
  ids.shared = await make('chart', { title: 'Shared', folderId: ids.w });
  ids.writersDashboard = await make('dashboard', {
    title: 'The writer’s dashboard',
    folderId: ids.w,
    charts: [ids.shared],
  });
  // Its own chart, whose folder field names X: its dashboard's rights govern it.
  ids.keptApart = await make('chart', {
    title: 'Kept apart',
    folderId: ids.x,
    localToDashboardId: ids.writersDashboard,
  });
  ids.hiddenDashboard = await make('dashboard', {
    title: 'Hidden dashboard',
    folderId: ids.x,
    charts: [ids.shared],
    tiles: [{ member: 'orders.count' }],
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
  for (const who of ['super', 'writer', 'reader', 'nobody'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  await app.close();
  await bookmarkStore(getDb()).removeFor(ids.dashboard);
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

describe('a read-only user opens dashboards and the charts on them (T326, AC-263, AC-264)', () => {
  it('opens the folder, its dashboard, the dashboard’s own chart and the library chart on it', async () => {
    for (const [kind, id] of [
      ['folder', ids.r],
      ['dashboard', ids.dashboard],
      ['chart', ids.local],
      // Kept where they can't see, but on a dashboard they can.
      ['chart', ids.onDashboard],
    ] as const) {
      expect((await open('reader', kind, id)).statusCode, `${kind} ${id}`).toBe(200);
    }
  });

  it('opens no library chart that isn’t on a dashboard of theirs, and no hidden folder', async () => {
    for (const [kind, id] of [
      ['chart', ids.library],
      ['folder', ids.x],
    ] as const) {
      const refused = await open('reader', kind, id);
      expect(refused.statusCode, `${kind} ${id}`).toBe(404);
      // As one that isn't there.
      expect(refused.json()).toEqual((await open('reader', kind, randomUUID())).json());
    }
  });

  it('opens nothing for someone no grant reaches, and everything for a Super-Admin', async () => {
    for (const [kind, id] of [
      ['dashboard', ids.dashboard],
      ['chart', ids.local],
      ['chart', ids.onDashboard],
      ['folder', ids.r],
    ] as const) {
      expect((await open('nobody', kind, id)).statusCode, `nobody: ${kind}`).toBe(404);
      expect((await open('super', kind, id)).statusCode, `super: ${kind}`).toBe(200);
    }
    expect((await open('super', 'chart', ids.library)).statusCode).toBe(200);
  });

  it('lists only the dashboards of theirs that a chart is on', async () => {
    const using = await as('reader', {
      method: 'GET',
      url: `/api/charts/${ids.onDashboard}/dashboards`,
    });
    expect(using.json<{ id: string }[]>().map((dashboard) => dashboard.id)).toEqual([
      ids.dashboard,
    ]);
    const nobody = await as('nobody', {
      method: 'GET',
      url: `/api/charts/${ids.onDashboard}/dashboards`,
    });
    expect(nobody.json()).toEqual([]);
  });
});

describe('a read-only user changes nothing (T326, AC-266)', () => {
  it('answers 403 to every create, change, move and delete, and changes nothing', async () => {
    const before = await docs().get('dashboard', ids.dashboard);
    const version = before!.version;
    const refusals: [string, InjectOptions][] = [
      [
        'create a dashboard',
        {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'dashboard', title: 'Mine', folderId: ids.r },
        },
      ],
      [
        'create a subfolder',
        {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'folder', title: 'Mine', folderId: ids.r },
        },
      ],
      [
        'save the dashboard',
        {
          method: 'PUT',
          url: `/api/documents/dashboard/${ids.dashboard}`,
          payload: { body: { ...before!.body, title: 'Changed' }, version },
        },
      ],
      [
        'save it with its charts',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.dashboard}`,
          payload: {
            dashboard: { body: { ...before!.body, title: 'Changed' }, version },
            charts: [],
          },
        },
      ],
      [
        'save its own chart',
        {
          method: 'PUT',
          url: `/api/documents/chart/${ids.local}`,
          payload: { body: { title: 'Changed' }, version: 1 },
        },
      ],
      [
        'rename it',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.dashboard}`,
          payload: { title: 'Changed' },
        },
      ],
      [
        'move it',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.dashboard}`,
          payload: { folderId: 'root' },
        },
      ],
      [
        'delete it',
        { method: 'DELETE', url: `/api/documents/dashboard/${ids.dashboard}?confirm=true` },
      ],
      [
        'put a chart on it',
        {
          method: 'POST',
          url: `/api/dashboards/${ids.dashboard}/charts`,
          payload: { chartId: ids.onDashboard },
        },
      ],
      [
        'set the folder’s groups',
        {
          method: 'PUT',
          url: `/api/folders/${ids.r}/access`,
          payload: { readWrite: ['sales-ro'] },
        },
      ],
    ];
    for (const [what, options] of refusals) {
      const refused = await as('reader', options);
      expect(refused.statusCode, what).toBe(403);
    }
    const after = await docs().get('dashboard', ids.dashboard);
    expect(after).toEqual(before);
    expect(await docs().get('chart', ids.local)).toMatchObject({ version: 1 });
  });

  it('still bookmarks a dashboard they can open', async () => {
    const saved = await as('reader', {
      method: 'POST',
      url: `/api/dashboards/${ids.dashboard}/bookmarks`,
      payload: { name: 'My view', state: { filters: {}, marks: {} } },
    });
    expect(saved.statusCode).toBe(201);
    // Not one they can't.
    const hidden = await as('nobody', {
      method: 'POST',
      url: `/api/dashboards/${ids.dashboard}/bookmarks`,
      payload: { name: 'My view', state: { filters: {}, marks: {} } },
    });
    expect(hidden.statusCode).toBe(404);
    // As a dashboard that isn't there (T326's review).
    const missing = await as('nobody', {
      method: 'POST',
      url: `/api/dashboards/${randomUUID()}/bookmarks`,
      payload: { name: 'My view', state: { filters: {}, marks: {} } },
    });
    expect(hidden.json()).toEqual(missing.json());
    expect(
      (await as('reader', { method: 'GET', url: `/api/dashboards/${ids.dashboard}/bookmarks` }))
        .statusCode,
    ).toBe(200);
    expect(
      (await as('nobody', { method: 'GET', url: `/api/dashboards/${ids.dashboard}/bookmarks` }))
        .statusCode,
    ).toBe(404);
  });

  it('adds no image to a dashboard they may not change', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const refused = await as('reader', {
      method: 'POST',
      url: `/api/dashboards/${ids.dashboard}/images`,
      payload: { contentType: 'image/png', data: png.toString('base64') },
    });
    expect(refused.statusCode).toBe(403);
  });

  it('opens a folder without its groups, which are its writers’ to see', async () => {
    const asReader = (await open('reader', 'folder', ids.r)).json<{
      body: Record<string, unknown>;
    }>();
    expect('access' in asReader.body).toBe(false);
    const asSuper = (await open('super', 'folder', ids.r)).json<{
      body: Record<string, unknown>;
    }>();
    expect(asSuper.body['access']).toEqual({ readOnly: ['sales-ro'], readWrite: null });
  });
});

/**
 * The same checks from a read-write member's side (T326's review): what they
 * may change goes through, and nothing moves into, or shows, what they may not.
 */
describe('a read-write member changes their folder, and only theirs (T326, AC-266, AC-264)', () => {
  const current = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;

  it('saves, renames and creates in their own folder', async () => {
    const dashboard = await current('dashboard', ids.writersDashboard);
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.writersDashboard}`,
      payload: { body: { ...dashboard.body, title: 'Saved' }, version: dashboard.version },
    });
    expect(saved.statusCode).toBe(200);
    const renamed = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.writersDashboard}`,
      payload: { title: 'Renamed' },
    });
    expect(renamed.statusCode).toBe(200);
    const created = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: 'New', folderId: ids.w2 },
    });
    expect(created.statusCode).toBe(201);
    made.push({ kind: 'dashboard', id: created.json<{ id: string }>().id });
  });

  it('opens their dashboard’s own chart by the dashboard’s rights, wherever its folder field points', async () => {
    expect((await open('writer', 'chart', ids.keptApart)).statusCode).toBe(200);
    expect((await open('reader', 'chart', ids.keptApart)).statusCode).toBe(404);
  });

  it('moves nothing into a folder they may not write in, nor a folder into itself or beneath it', async () => {
    const dashboard = await current('dashboard', ids.writersDashboard);
    const folder = await current('folder', ids.w);
    const own = await current('chart', ids.keptApart);
    const { localToDashboardId: _local, ...unhooked } = own.body;
    void _local;
    const refusals: [string, InjectOptions][] = [
      [
        'PUT the dashboard into X',
        {
          method: 'PUT',
          url: `/api/documents/dashboard/${ids.writersDashboard}`,
          payload: { body: { ...dashboard.body, folderId: ids.x }, version: dashboard.version },
        },
      ],
      [
        'save the dashboard into X',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.writersDashboard}`,
          payload: {
            dashboard: { body: { ...dashboard.body, folderId: ids.x }, version: dashboard.version },
            charts: [],
          },
        },
      ],
      [
        'move the dashboard into X',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.writersDashboard}`,
          payload: { folderId: ids.x },
        },
      ],
      [
        'PUT the folder into X',
        {
          method: 'PUT',
          url: `/api/documents/folder/${ids.w}`,
          payload: { body: { ...folder.body, folderId: ids.x }, version: folder.version },
        },
      ],
      [
        'move the folder into itself',
        { method: 'PATCH', url: `/api/documents/folder/${ids.w}`, payload: { folderId: ids.w } },
      ],
      [
        'move the folder beneath itself',
        { method: 'PATCH', url: `/api/documents/folder/${ids.w}`, payload: { folderId: ids.w2 } },
      ],
      [
        'make its own chart a library chart in X',
        {
          method: 'PUT',
          url: `/api/documents/chart/${ids.keptApart}`,
          payload: { body: { ...unhooked, folderId: ids.x }, version: own.version },
        },
      ],
    ];
    for (const [what, options] of refusals) {
      expect((await as('writer', options)).statusCode, what).toBe(403);
    }
    expect((await current('dashboard', ids.writersDashboard)).body['folderId']).toBe(ids.w);
    expect((await current('folder', ids.w)).body['folderId']).toBe('root');
    expect((await current('chart', ids.keptApart)).body['localToDashboardId']).toBe(
      ids.writersDashboard,
    );
  });

  it('can’t open a hidden chart by putting it on their dashboard', async () => {
    const dashboard = await current('dashboard', ids.writersDashboard);
    const withHidden = { ...dashboard.body, charts: [ids.shared, ids.library] };
    for (const [what, options] of [
      [
        'PUT',
        {
          method: 'PUT',
          url: `/api/documents/dashboard/${ids.writersDashboard}`,
          payload: { body: withHidden, version: dashboard.version },
        },
      ],
      [
        'save',
        {
          method: 'PUT',
          url: `/api/dashboards/${ids.writersDashboard}`,
          payload: { dashboard: { body: withHidden, version: dashboard.version }, charts: [] },
        },
      ],
    ] as [string, InjectOptions][]) {
      expect((await as('writer', options)).statusCode, what).toBe(403);
    }
    expect((await open('writer', 'chart', ids.library)).statusCode).toBe(404);
  });

  it('names only the dashboards they may see, deleting a chart or asking what uses a member', async () => {
    const asked = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/chart/${ids.shared}`,
    });
    expect(asked.statusCode).toBe(409);
    expect(
      asked.json<{ dashboards: { id: string }[] }>().dashboards.map((each) => each.id),
    ).toEqual([ids.writersDashboard]);
    const uses = async (who: string) =>
      (
        await as(who, {
          method: 'POST',
          url: '/api/model/references',
          payload: { members: ['orders.count'] },
        })
      )
        .json<{ dashboards: { id: string }[] }>()
        .dashboards.map((each) => each.id);
    expect(await uses('writer')).not.toContain(ids.hiddenDashboard);
    expect(await uses('super')).toContain(ids.hiddenDashboard);
  });
});
