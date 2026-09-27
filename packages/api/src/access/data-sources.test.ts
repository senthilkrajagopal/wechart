import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T335: data sources are folder items, and no credential reaches the browser.
 *
 * - AC-269, its data sources' half: a folder lists its data sources beside
 *   its other items, as "Data source" with the driver.
 * - AC-164: no response holds a stored secret, only that one is stored.
 * - AC-312: changing where a data source connects asks for its secret again.
 * - AC-161: its type never changes.
 * - AC-262, its data sources' half (from T327): `writer` (group `sales-rw`)
 *   has read-write on /A/B only, so /A's and the root's data sources are
 *   theirs to list and open, view-only: every change to them answers 403.
 * - AC-263: `reader` (group `sales-ro`), read-only on /A/B, sees none there.
 *   /C is `managers`' alone: to anyone else its data sources aren't there.
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

const MARK = `sources${randomUUID().slice(0, 8)}`;
/** Sized as xcube takes an envelope: a 32-byte `enc`, one 256-byte bucket and its tag. */
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const postgres = (folderId: string, name: string) => ({
  folderId,
  name,
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
  sealed: { password: sealed(name) },
});

const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { a: '', b: '', c: '' };
const held = { root: '', a: '', b: '', c: '' };
let app: FastifyInstance;
const cookies: Record<string, string> = {};
let rootBefore: StoredDocument | null = null;

async function folder(body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({ kind: 'folder', id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.a = await folder({ title: `A ${MARK}`, folderId: 'root' });
  ids.b = await folder({
    title: `B ${MARK}`,
    folderId: ids.a,
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.c = await folder({
    title: `C ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['managers'] },
  });
  held.root = (await sources().create(postgres('root', `${MARK}_root`))).id;
  held.a = (await sources().create(postgres(ids.a, 'warehouse'))).id;
  held.b = (await sources().create(postgres(ids.b, 'warehouse'))).id;
  held.c = (await sources().create(postgres(ids.c, 'warehouse'))).id;

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
  });
  for (const who of ['writer', 'reader', 'nobody']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  // Built last in beforeAll: cleaned up even if that stopped short.
  if (app !== undefined) await app.close();
  for (const id of Object.values(held)) if (id !== '') await sources().remove(id);
  await getDb().deleteFrom('data_sources').where('name', 'like', `${MARK}%`).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const listed = async (who: string, folderId: string) =>
  (await as(who, { method: 'GET', url: `/api/folders/${folderId}/contents` }))
    .json<{ kind: string; id: string; title: string; driver?: string }[]>()
    .filter((row) => row.kind === 'data-source')
    .map(({ kind, id, title, driver }) => ({ kind, id, title, driver }));
const opened = (who: string, id: string) =>
  as(who, { method: 'GET', url: `/api/data-sources/${id}` });

describe('a folder’s data sources, listed and opened (T335, AC-269, AC-164)', () => {
  it('lists each one in its folder as a data source, with its driver', async () => {
    expect(await listed('writer', ids.b)).toEqual([
      { kind: 'data-source', id: held.b, title: 'warehouse', driver: 'postgres' },
    ]);
  });

  it('opens one with its settings, saying a secret is stored and never what it is', async () => {
    const answer = await opened('writer', held.b);

    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({
      id: held.b,
      folderId: ids.b,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      secrets: { password: { stored: true } },
    });
    expect(answer.body).not.toContain(sealed('warehouse').ct);
    expect(answer.body).not.toContain(sealed('warehouse').enc);
  });
});

describe('who may change them (AC-262, AC-263, AC-264)', () => {
  it('lets a read-write member of /A/B see /A’s and the root’s, and change neither', async () => {
    expect((await listed('writer', ids.a)).map((row) => row.id)).toEqual([held.a]);
    expect((await listed('writer', 'root')).map((row) => row.id)).toContain(held.root);
    for (const id of [held.a, held.root]) {
      expect((await opened('writer', id)).statusCode).toBe(200);
      const changed = await as('writer', {
        method: 'PUT',
        url: `/api/data-sources/${id}`,
        payload: { fields: { host: 'db', database: 'other', user: 'cube' } },
      });
      expect(changed.statusCode).toBe(403);
      expect(
        (await as('writer', { method: 'DELETE', url: `/api/data-sources/${id}` })).statusCode,
      ).toBe(403);
    }
    const created = await as('writer', {
      method: 'POST',
      url: '/api/data-sources',
      payload: postgres(ids.a, `${MARK}_new`),
    });
    expect(created.statusCode).toBe(403);
  });

  it('shows a read-only member none, and /C’s to no one outside it', async () => {
    expect(await listed('reader', ids.b)).toEqual([]);
    expect((await opened('reader', held.b)).statusCode).toBe(404);
    for (const who of ['writer', 'reader', 'nobody'])
      expect((await opened(who, held.c)).statusCode, who).toBe(404);
  });

  it('refuses a read-only member’s new data source as view-only, in a folder they see (T335’s review)', async () => {
    const made = await as('reader', {
      method: 'POST',
      url: '/api/data-sources',
      payload: postgres(ids.b, `${MARK}_reader`),
    });
    expect(made.statusCode).toBe(403);
    // In a folder they don't see at all, it isn't there.
    const hidden = await as('reader', {
      method: 'POST',
      url: '/api/data-sources',
      payload: postgres(ids.c, `${MARK}_reader`),
    });
    expect(hidden.statusCode).toBe(404);
    expect(await sources().inFolder(ids.b)).toHaveLength(1);
  });
});

describe('a folder holding data sources (T335’s review)', () => {
  it('isn’t deleted while it or a folder beneath it holds one: none is left without a folder', async () => {
    const open = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
    });
    const outer = await folder({ title: `Outer ${MARK}`, folderId: 'root' });
    const inner = await folder({ title: `Inner ${MARK}`, folderId: outer });
    const held = await sources().create(postgres(inner, 'lake'));
    try {
      const refused = await open.inject({
        method: 'DELETE',
        url: `/api/documents/folder/${outer}`,
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({
        error: 'This folder holds 1 data source, in it or beneath it: delete it first.',
      });
      expect(await docs().get('folder', outer)).not.toBeNull();
    } finally {
      await sources().remove(held.id);
      await open.close();
    }
  });
});

describe('the key a secret is sealed to (T441, AC-325)', () => {
  it('is xcube’s public key, as configured, for anyone signed in, and nothing that decrypts', async () => {
    const key = { kid: 'uYWeMx6i173fsiolFp1xi-qiav50k52AGinM56Y8JEw', x: 'x'.repeat(43) };
    const keyed = buildServer({
      config: { ...secured, xcubePublicKey: key },
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
    });
    try {
      const cookie = await signIn(keyed, USERS['reader']!);
      const answer = await keyed.inject({
        method: 'GET',
        url: '/api/data-sources/sealing-key',
        headers: { cookie },
      });
      expect(answer.statusCode).toBe(200);
      expect(answer.json()).toEqual({ kid: key.kid, x: key.x });
      expect(
        (await keyed.inject({ method: 'GET', url: '/api/data-sources/sealing-key' })).statusCode,
      ).toBe(401);
    } finally {
      await keyed.close();
    }
    // Without one, none is made up.
    const unkeyed = await as('writer', { method: 'GET', url: '/api/data-sources/sealing-key' });
    expect(unkeyed.statusCode).toBe(503);
    expect(unkeyed.json()).toEqual({
      error: 'wechart has no key to seal a data source’s secrets to: set WECHART_XCUBE_PUBLIC_KEY.',
    });
  });
});

describe('a read-write member’s changes (AC-312, AC-161)', () => {
  it('creates one in their folder, sealed, and refuses one whose secret is in plain text', async () => {
    const created = await as('writer', {
      method: 'POST',
      url: '/api/data-sources',
      payload: postgres(ids.b, `${MARK}_made`),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ secrets: { password: { stored: true } } });

    const plain = await as('writer', {
      method: 'POST',
      url: '/api/data-sources',
      payload: {
        ...postgres(ids.b, `${MARK}_plain`),
        fields: { host: 'db', database: 'sales', user: 'cube', password: 'hunter2' },
        sealed: {},
      },
    });
    expect(plain.statusCode).toBe(400);
    expect(plain.body).not.toContain('hunter2');
  });

  it('asks for the secret again when where it connects changes, and refuses a change of type', async () => {
    const moved = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${held.b}`,
      payload: {
        fields: { host: 'elsewhere', port: 5432, database: 'sales', user: 'cube', ssl: true },
      },
    });
    expect(moved.statusCode).toBe(422);
    expect(moved.json()).toMatchObject({
      error: expect.stringMatching(/^Enter password again/) as string,
    });

    const retyped = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${held.b}`,
      payload: { driver: 'mysql' },
    });
    expect(retyped.statusCode).toBe(409);
    expect(retyped.json()).toEqual({
      error: 'A data source’s type never changes: make a new data source for MySQL.',
      problems: ['A data source’s type never changes: make a new data source for MySQL.'],
    });
  });
});
