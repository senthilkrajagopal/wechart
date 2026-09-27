import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T343 (AC-276, AC-277): every Super-Admin and read-write member has a
 * private workspace, "My workspace" (`mine` to the client; `ws:<their key>`
 * as stored), which no one else can list, open or search — Super-Admins
 * included. A user with read-only access everywhere has none, and creates
 * nothing there.
 *
 * `writer` (group `sales-rw`) is a read-write member of a folder made here;
 * `reader` (`sales-ro`) reads it; `super` is a Super-Admin.
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
const MARK = `ws${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;
let sales = '';

beforeAll(async () => {
  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: dataSourceStore(getDb()),
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const mine = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where('title', 'like', `%${MARK}%`)
    .execute();
  for (const { kind, id } of [...mine, ...made].reverse())
    await docs().remove(kind as DocumentKind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const create = (who: string, kind: DocumentKind, title: string, folderId: string) =>
  as(who, { method: 'POST', url: '/api/documents', payload: { kind, title, folderId } });
const contents = async (who: string, folderId: string) =>
  as(who, { method: 'GET', url: `/api/folders/${encodeURIComponent(folderId)}/contents` });
const titlesIn = async (who: string, folderId: string) =>
  ((await (await contents(who, folderId)).json()) as { title: string }[]).map((row) => row.title);
const found = async (who: string, q: string) =>
  (
    (await (await as(who, { method: 'GET', url: `/api/search?q=${q}` })).json()) as {
      title: string;
    }[]
  ).map((row) => row.title);

describe('each author’s private workspace (T343, AC-276)', () => {
  const ids: Record<string, { dashboard: string; folder: string; inner: string; stored: string }> =
    {};

  beforeAll(async () => {
    for (const who of ['writer', 'super']) {
      const dashboard = await create(who, 'dashboard', `${who} draft ${MARK}`, 'mine');
      expect(dashboard.statusCode, await dashboard.body).toBe(201);
      const folder = await create(who, 'folder', `${who} drafts ${MARK}`, 'mine');
      expect(folder.statusCode).toBe(201);
      const folderId = (folder.json() as { id: string }).id;
      const inner = await create(who, 'dashboard', `${who} inner ${MARK}`, folderId);
      expect(inner.statusCode).toBe(201);
      const dashboardId = (dashboard.json() as { id: string }).id;
      const stored = await docs().get('dashboard', dashboardId);
      ids[who] = {
        dashboard: dashboardId,
        folder: folderId,
        inner: (inner.json() as { id: string }).id,
        stored: String(stored?.body['folderId']),
      };
    }
  });

  it('keeps each one’s items in a workspace of their own, never the shared `mine`', () => {
    expect(ids['writer']?.stored).toMatch(/^ws:/);
    expect(ids['super']?.stored).toMatch(/^ws:/);
    expect(ids['writer']?.stored).not.toBe(ids['super']?.stored);
  });

  it('lists, opens and searches its owner’s own', async () => {
    for (const who of ['writer', 'super']) {
      expect(await titlesIn(who, 'mine')).toEqual(
        expect.arrayContaining([`${who} draft ${MARK}`, `${who} drafts ${MARK}`]),
      );
      expect(await titlesIn(who, ids[who]!.folder)).toEqual([`${who} inner ${MARK}`]);
      const opened = await as(who, {
        method: 'GET',
        url: `/api/documents/dashboard/${ids[who]!.inner}`,
      });
      expect(opened.statusCode).toBe(200);
      expect(await found(who, `draft%20${MARK}`)).toEqual([`${who} draft ${MARK}`]);
      const roots = (await as(who, { method: 'GET', url: '/api/folder-roots' })).json() as Record<
        string,
        number
      >;
      expect(roots['mine']).toBeGreaterThanOrEqual(2);
    }
  });

  it('shows no one else anything of it, Super-Admins included', async () => {
    for (const [who, other] of [
      ['writer', 'super'],
      ['super', 'writer'],
    ] as const) {
      const theirs = ids[other]!;
      expect(await titlesIn(who, 'mine')).not.toContain(`${other} draft ${MARK}`);
      expect((await contents(who, theirs.stored)).statusCode).toBe(404);
      expect((await contents(who, theirs.folder)).statusCode).toBe(404);
      for (const id of [theirs.dashboard, theirs.inner])
        expect(
          (await as(who, { method: 'GET', url: `/api/documents/dashboard/${id}` })).statusCode,
        ).toBe(404);
      expect(await found(who, `${other}%20draft%20${MARK}`)).toEqual([]);
      // Nor made in theirs by naming it.
      expect((await create(who, 'dashboard', `into ${MARK}`, theirs.stored)).statusCode).toBe(404);
    }
  });
});

/**
 * From T343's review: the client never sees the stored `ws:` id; a chart in a
 * workspace never reaches a dashboard outside it; nothing moves across a
 * workspace's edge, shared work being changed in a copy and reaching a shared
 * folder through a proposal (AC-278, F30).
 */
describe('a workspace’s edges (T343’s review)', () => {
  let chart = '';
  let board = '';
  let shared = '';

  beforeAll(async () => {
    chart = (
      (await create('writer', 'chart', `writer chart ${MARK}`, 'mine')).json() as { id: string }
    ).id;
    board = (
      (await create('writer', 'dashboard', `writer board ${MARK}`, 'mine')).json() as {
        id: string;
      }
    ).id;
    shared = (
      (await create('writer', 'dashboard', `shared board ${MARK}`, sales)).json() as { id: string }
    ).id;
  });

  it('names My workspace `mine` to its owner, never the stored id', async () => {
    const opened = await as('writer', { method: 'GET', url: `/api/documents/dashboard/${board}` });
    expect(opened.json()).toMatchObject({ body: { folderId: 'mine' } });
    expect(opened.body).not.toContain('ws:');
    const folders = (await as('writer', { method: 'GET', url: '/api/folders' })).json() as {
      title: string;
      parentId: string | null;
    }[];
    expect(folders.find((folder) => folder.title === `writer drafts ${MARK}`)?.parentId).toBe(
      'mine',
    );
    // And no one else's in the tree, a Super-Admin's included.
    const theirs = (await as('super', { method: 'GET', url: '/api/folders' })).json() as {
      title: string;
    }[];
    expect(theirs.map((folder) => folder.title)).not.toContain(`writer drafts ${MARK}`);
  });

  it('takes `mine` for the owner’s own wherever a body names a folder', async () => {
    const stored = (await docs().get('dashboard', board))!;
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${board}`,
      payload: {
        version: stored.version,
        body: { ...stored.body, folderId: 'mine', title: `writer board ${MARK}` },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('dashboard', board))?.body['folderId']).toMatch(/^ws:/);
  });

  it('never puts a chart in a workspace on a dashboard outside it', async () => {
    const attached = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${shared}/charts`,
      payload: { chartId: chart },
    });
    expect(attached.statusCode).toBe(409);
    // Nor does anyone open it by way of one.
    expect(
      (await as('reader', { method: 'GET', url: `/api/documents/chart/${chart}` })).statusCode,
    ).toBe(404);
  });

  it('moves nothing across its edge, either way, by either route', async () => {
    const patch = (id: string, folderId: string) =>
      as('writer', {
        method: 'PATCH',
        url: `/api/documents/dashboard/${id}`,
        payload: { folderId },
      });
    expect((await patch(board, sales)).statusCode).toBe(409);
    expect((await patch(shared, 'mine')).statusCode).toBe(409);
    const stored = (await docs().get('dashboard', shared))!;
    const put = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${shared}`,
      payload: { version: stored.version, body: { ...stored.body, folderId: 'mine' } },
    });
    expect(put.statusCode).toBe(409);
    expect((await docs().get('dashboard', shared))?.body['folderId']).toBe(sales);
  });
});

describe('no workspace for a read-only user (T343, AC-277)', () => {
  it('makes no data source in My workspace either: 403', async () => {
    const refused = await as('reader', {
      method: 'POST',
      url: '/api/data-sources',
      payload: { folderId: 'mine', name: 'warehouse', driver: 'postgres', authMethod: 'password' },
    });
    expect(refused.statusCode).toBe(403);
  });

  it('lists nothing in My workspace, and creates nothing there', async () => {
    expect((await contents('reader', 'mine')).statusCode).toBe(404);
    const refused = await create('reader', 'dashboard', `reader draft ${MARK}`, 'mine');
    expect(refused.statusCode).toBe(403);
    const roots = (
      await as('reader', { method: 'GET', url: '/api/folder-roots' })
    ).json() as Record<string, number>;
    expect(roots).not.toHaveProperty('mine');
  });
});
