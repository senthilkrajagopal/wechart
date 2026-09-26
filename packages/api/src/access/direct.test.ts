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
 * T329, AC-291: WHEN a read-write member creates a subfolder, sets
 * permissions, or renames, moves or deletes an item in a folder they may
 * write, THE SYSTEM SHALL apply it at once, without a proposal. A move SHALL
 * need read-write access to both folders.
 *
 * `writer` (`sales-rw`) may write /W and /V; `reader` (`sales-ro`) may only
 * read /R. The half of AC-291 about models, data sources and folders holding
 * them, applied only if every module they affect still compiles, is T426's.
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
let app: FastifyInstance | undefined;
const cookies: Record<string, string> = {};
const ids = { w: '', v: '', r: '', wDashboard: '', rDashboard: '', wChart: '' };
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
    title: 'W',
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.v = await make('folder', {
    title: 'V',
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.r = await make('folder', {
    title: 'R',
    folderId: 'root',
    access: { readOnly: ['sales-ro', 'sales-rw'], readWrite: null },
  });
  ids.wDashboard = await make('dashboard', { title: 'In W', folderId: ids.w });
  ids.wChart = await make('chart', { title: 'A library chart in W', folderId: ids.w });
  ids.rDashboard = await make('dashboard', { title: 'In R', folderId: ids.r });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
    images: imageStore(getDb()),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const { kind, id } of made.reverse()) {
    if ((await docs().get(kind, id)) !== null) await docs().remove(kind, id);
  }
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app!.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

describe('a read-write member’s direct changes, applied at once (T329, AC-291)', () => {
  it('creates a subfolder in their folder and sets its groups, both applied at once', async () => {
    const created = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'folder', title: 'Sub', folderId: ids.w },
    });
    expect(created.statusCode).toBe(201);
    const sub = created.json<{ id: string }>().id;
    made.push({ kind: 'folder', id: sub });
    expect((await docs().get('folder', sub))?.body).toMatchObject({
      title: 'Sub',
      folderId: ids.w,
    });

    const set = await as('writer', {
      method: 'PUT',
      url: `/api/folders/${sub}/access`,
      payload: { readOnly: ['sales-ro'], readWrite: null },
    });
    expect(set.statusCode).toBe(200);
    expect((await docs().get('folder', sub))?.body['access']).toEqual({
      readOnly: ['sales-ro'],
      readWrite: null,
    });
  });

  it('renames an item, and the new name is what the folder holds', async () => {
    const renamed = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.wDashboard}`,
      payload: { title: 'Renamed in W' },
    });
    expect(renamed.statusCode).toBe(200);
    expect((await docs().get('dashboard', ids.wDashboard))?.body['title']).toBe('Renamed in W');
  });

  it('moves an item between two folders they may write, at once', async () => {
    const moved = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/chart/${ids.wChart}`,
      payload: { folderId: ids.v },
    });
    expect(moved.statusCode).toBe(200);
    expect((await docs().get('chart', ids.wChart))?.body['folderId']).toBe(ids.v);
  });

  it('refuses a move into a folder they may only read, or out of one, and moves nothing', async () => {
    const into = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.wDashboard}`,
      payload: { folderId: ids.r },
    });
    expect(into.statusCode).toBe(403);
    const outOf = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.rDashboard}`,
      payload: { folderId: ids.w },
    });
    expect(outOf.statusCode).toBe(403);
    expect((await docs().get('dashboard', ids.wDashboard))?.body['folderId']).toBe(ids.w);
    expect((await docs().get('dashboard', ids.rDashboard))?.body['folderId']).toBe(ids.r);
  });

  /**
   * A folder is an item in the folder that holds it (T329's review): moving
   * or deleting it changes that folder too. `writer` may write /W and /V but
   * only view the root that holds them.
   */
  it('moves a subfolder between two folders they may write, at once', async () => {
    const sub = await make('folder', { title: 'Moving', folderId: ids.w });
    const moved = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/folder/${sub}`,
      payload: { folderId: ids.v },
    });
    expect(moved.statusCode).toBe(200);
    expect((await docs().get('folder', sub))?.body['folderId']).toBe(ids.v);
  });

  it('refuses moving or deleting a folder out of one they may only view, and changes nothing', async () => {
    const before = (await docs().get('folder', ids.w))!;
    const refusals: [string, InjectOptions][] = [
      [
        'move /W into /V',
        { method: 'PATCH', url: `/api/documents/folder/${ids.w}`, payload: { folderId: ids.v } },
      ],
      [
        'save /W into /V',
        {
          method: 'PUT',
          url: `/api/documents/folder/${ids.w}`,
          payload: { body: { ...before.body, folderId: ids.v }, version: before.version },
        },
      ],
      ['delete /W', { method: 'DELETE', url: `/api/documents/folder/${ids.w}` }],
    ];
    for (const [what, options] of refusals) {
      expect((await as('writer', options)).statusCode, what).toBe(403);
    }
    expect(await docs().get('folder', ids.w)).toEqual(before);
  });

  it('deletes an empty subfolder of their folder, at once', async () => {
    const empty = await make('folder', { title: 'Empty', folderId: ids.w });
    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/folder/${empty}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(await docs().get('folder', empty)).toBeNull();
  });

  it('deletes an item in their folder, at once', async () => {
    const doomed = await make('dashboard', { title: 'To delete', folderId: ids.w });
    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${doomed}?confirm=true`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(await docs().get('dashboard', doomed)).toBeNull();
  });
});

describe('a read-only member’s direct changes, all refused (T329, AC-291)', () => {
  it('answers 403 to a subfolder, groups, a rename, a move and a delete in their folder, and changes nothing', async () => {
    const before = (await docs().get('dashboard', ids.rDashboard))!;
    const folderBefore = (await docs().get('folder', ids.r))!;
    const refusals: [string, InjectOptions][] = [
      [
        'create a subfolder',
        {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'folder', title: 'Mine', folderId: ids.r },
        },
      ],
      [
        'set the folder’s groups',
        { method: 'PUT', url: `/api/folders/${ids.r}/access`, payload: { readOnly: ['sales-ro'] } },
      ],
      [
        'rename a dashboard',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.rDashboard}`,
          payload: { title: 'Changed' },
        },
      ],
      [
        'move a dashboard to the root',
        {
          method: 'PATCH',
          url: `/api/documents/dashboard/${ids.rDashboard}`,
          payload: { folderId: 'root' },
        },
      ],
      [
        'delete a dashboard',
        { method: 'DELETE', url: `/api/documents/dashboard/${ids.rDashboard}?confirm=true` },
      ],
    ];
    for (const [what, options] of refusals) {
      expect((await as('reader', options)).statusCode, what).toBe(403);
    }
    expect(await docs().get('dashboard', ids.rDashboard)).toEqual(before);
    expect(await docs().get('folder', ids.r)).toEqual(folderBefore);
  });
});
