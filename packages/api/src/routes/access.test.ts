import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { pgSessionStore } from '../auth/session-store';
import { closeDb, getDb } from '../db/client';
import { documents, type StoredDocument } from '../repos/documents';
import { ROOT_ACCESS_ID, folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T314:
 *
 * AC-259: WHEN a Super-Admin, or a read-write member of a folder, creates a
 * subfolder or edits a folder's permissions, THE SYSTEM SHALL let them set
 * any number of AD groups with read-only access and any number with
 * read-write access, each setting optional, and never an individual user.
 * `Fails when: a permission can name an individual user, or someone who isn't
 * a Super-Admin or read-write member there can change it.`
 *
 * AC-260: WHILE a folder leaves its read-only or its read-write setting unset,
 * THE SYSTEM SHALL use the parent's effective setting for it, each setting
 * inherited on its own, and show the inherited groups with the folder they
 * come from.
 * `Fails when: an unset setting grants groups other than the parent's, or the
 * inherited groups are shown without their source folder.`
 *
 * The API's half: `PUT` and `GET /api/folders/:id/access`. Creating a
 * subfolder with its groups, and the panel showing them, are later tasks'.
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...base,
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
const servers: FastifyInstance[] = [];
function serving(config: typeof base | typeof secured): FastifyInstance {
  const app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    folderAccess: folderAccessStore(getDb()),
  });
  servers.push(app);
  return app;
}

/** The root's groups are shared: set aside here, unset for these tests, and put back. */
let rootBefore: StoredDocument | null = null;
beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
});
/** The folders made here, removed after: their grants name the Dex test users' groups. */
const made: string[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  for (const id of made) await docs().remove('folder', id);
  if ((await docs().get('setting', ROOT_ACCESS_ID)) !== null) {
    await docs().remove('setting', ROOT_ACCESS_ID);
  }
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

async function folder(parent: string): Promise<string> {
  const id = randomUUID();
  made.push(id);
  await docs().create({
    kind: 'folder',
    id,
    body: { title: 'F', folderId: parent, owner: 'admin' },
  });
  return id;
}

const put = (app: FastifyInstance, id: string, payload: unknown, cookie?: string) =>
  app.inject({
    method: 'PUT',
    url: `/api/folders/${id}/access`,
    headers: cookie === undefined ? {} : { cookie },
    payload: payload as Record<string, unknown>,
  });
const get = (app: FastifyInstance, id: string, cookie?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/folders/${id}/access`,
    headers: cookie === undefined ? {} : { cookie },
  });

describe('setting a folder’s groups (T314, AC-259)', () => {
  it('takes any number of read-only and read-write groups, each setting optional', async () => {
    const app = serving(base);
    const a = await folder('root');

    const set = await put(app, a, { readOnly: ['sales-ro', 'audit'], readWrite: null });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({
      folderId: a,
      setting: { readOnly: ['sales-ro', 'audit'], readWrite: null },
      effective: {
        readOnly: [
          { group: 'sales-ro', from: a, setHere: true },
          { group: 'audit', from: a, setHere: true },
        ],
        readWrite: [],
      },
    });

    // A setting left out is unset; an empty list sets none.
    const other = await put(app, a, { readWrite: [] });
    expect(other.statusCode).toBe(200);
    expect(other.json<{ setting: unknown }>().setting).toEqual({ readOnly: null, readWrite: [] });
  });

  it('takes the shared root’s groups too', async () => {
    const app = serving(base);
    const set = await put(app, 'root', { readOnly: ['everyone'], readWrite: ['admins'] });
    expect(set.statusCode).toBe(200);
    expect(set.json<{ setting: unknown }>().setting).toEqual({
      readOnly: ['everyone'],
      readWrite: ['admins'],
    });
    // Unset again, for the tests after it.
    expect((await put(app, 'root', { readOnly: null, readWrite: null })).statusCode).toBe(200);
  });

  it('never names an individual user: a body naming users or members is refused', async () => {
    const app = serving(base);
    const a = await folder('root');
    for (const body of [
      { users: ['alice@example.com'] },
      { members: ['bob'] },
      { readOnly: ['sales-ro'], users: [] },
      { readWrite: ['sales-rw'], user: 'carol' },
    ]) {
      const refused = await put(app, a, body);
      expect(refused.statusCode, JSON.stringify(body)).toBe(400);
      expect(refused.json<{ error: string }>().error, JSON.stringify(body)).toMatch(
        /AD groups.*never a person/,
      );
    }
    // Nothing was set by any of them.
    expect((await get(app, a)).json<{ setting: unknown }>().setting).toEqual({
      readOnly: null,
      readWrite: null,
    });
  });

  it('refuses a setting that isn’t a list of group names or null', async () => {
    const app = serving(base);
    const a = await folder('root');
    for (const body of [
      { readOnly: 'sales-ro' },
      { readWrite: [''] },
      { readWrite: ['  '] },
      { readOnly: [7] },
      [],
    ]) {
      const refused = await put(app, a, body);
      expect(refused.statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('answers 404 for a folder that isn’t in the shared tree, a workspace’s included', async () => {
    const app = serving(base);
    const inWorkspace = await folder('ws:someone');
    for (const id of [randomUUID(), inWorkspace]) {
      expect((await put(app, id, { readOnly: ['g'] })).statusCode).toBe(404);
      expect((await get(app, id)).statusCode).toBe(404);
    }
  });
});

describe('a folder’s effective groups (T314, AC-260)', () => {
  it('shows each unset setting’s groups inherited on its own, each with the folder it comes from', async () => {
    const app = serving(base);
    const a = await folder('root');
    const b = await folder(a);
    const c = await folder(b);
    await put(app, a, { readOnly: ['a-ro'], readWrite: ['a-rw'] });
    // B sets read-write only: its read-only is A's.
    await put(app, b, { readWrite: ['b-rw'] });

    const shown = await get(app, c);
    expect(shown.statusCode).toBe(200);
    expect(shown.json()).toEqual({
      folderId: c,
      setting: { readOnly: null, readWrite: null },
      effective: {
        readOnly: [{ group: 'a-ro', from: a, setHere: false }],
        // Nearest first; A's still reaches C (AC-261).
        readWrite: [
          { group: 'b-rw', from: b, setHere: false },
          { group: 'a-rw', from: a, setHere: false },
        ],
      },
    });

    // B's own: its read-write set here, its read-only inherited from A.
    expect((await get(app, b)).json()).toEqual({
      folderId: b,
      setting: { readOnly: null, readWrite: ['b-rw'] },
      effective: {
        readOnly: [{ group: 'a-ro', from: a, setHere: false }],
        readWrite: [
          { group: 'b-rw', from: b, setHere: true },
          { group: 'a-rw', from: a, setHere: false },
        ],
      },
    });
  });
});

describe('who may change a folder’s groups, with security on (T314, AC-259)', () => {
  let app: FastifyInstance;
  let a: string;
  let b: string;
  const cookies: Record<string, string> = {};
  beforeAll(async () => {
    app = serving(secured);
    for (const who of ['super', 'writer', 'reader', 'nobody']) {
      cookies[who] = await signIn(app, USERS[who]!);
    }
    a = await folder('root');
    b = await folder(a);
    // A Super-Admin sets them: writer's group writes in A, reader's reads there.
    const set = await put(
      app,
      a,
      { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
      cookies['super'],
    );
    expect(set.statusCode).toBe(200);
  });

  it('lets a read-write member change the folder, and those beneath it', async () => {
    expect(
      (
        await put(
          app,
          a,
          { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'x'] },
          cookies['writer'],
        )
      ).statusCode,
    ).toBe(200);
    expect((await put(app, b, { readOnly: ['b-ro'] }, cookies['writer'])).statusCode).toBe(200);
  });

  it('refuses anyone else who can see it with 403, and changes nothing', async () => {
    const settingOf = async (id: string) =>
      (await get(app, id, cookies['super'])).json<{ setting: unknown }>().setting;
    const before = { a: await settingOf(a), b: await settingOf(b), root: await settingOf('root') };
    // The reader reads in A; the writer only sees the root above A.
    for (const [who, id] of [
      ['reader', a],
      ['reader', b],
      ['writer', 'root'],
    ] as const) {
      const refused = await put(app, id, { readWrite: [...USERS[who]!.groups] }, cookies[who]);
      expect(refused.statusCode, `${who} on ${id}`).toBe(403);
      expect(refused.json<{ error: string }>().error).toBe(
        'Only a Super-Admin or a read-write member of this folder can change its groups.',
      );
      // Nor see them: the Access panel is a writer's (direction.md rule 68).
      const hidden = await get(app, id, cookies[who]);
      expect(hidden.statusCode, `${who} reading ${id}`).toBe(403);
      expect(hidden.json<{ error: string }>().error).toBe(
        'Only a Super-Admin or a read-write member of this folder can see its groups.',
      );
    }
    expect({ a: await settingOf(a), b: await settingOf(b), root: await settingOf('root') }).toEqual(
      before,
    );
  });

  it('can’t be changed through the folder document itself (T314’s review)', async () => {
    // The reader reads the folder, as they may, and saves it back with a grant:
    // refused, as every change of theirs is (T326).
    const before = (await get(app, a, cookies['super'])).json<{ setting: unknown }>().setting;
    const opened = await app.inject({
      method: 'GET',
      url: `/api/documents/folder/${a}`,
      headers: { cookie: cookies['reader']! },
    });
    const { body } = opened.json<{ body: Record<string, unknown> }>();
    const saveAs = async (who: string, access: unknown) =>
      app.inject({
        method: 'PUT',
        url: `/api/documents/folder/${a}`,
        headers: { cookie: cookies[who]! },
        payload: {
          body: access === undefined ? { ...body, access: undefined } : { ...body, access },
          version: (await docs().get('folder', a))!.version,
        },
      });
    expect((await saveAs('reader', { readOnly: null, readWrite: ['sales-ro'] })).statusCode).toBe(
      403,
    );
    // A read-write member saves it: the rest of the folder is saved, and its
    // groups are as they were, whatever the body said or left out.
    for (const access of [{ readOnly: null, readWrite: ['sales-ro'] }, undefined]) {
      expect((await saveAs('writer', access)).statusCode).toBe(200);
      expect((await get(app, a, cookies['super'])).json<{ setting: unknown }>().setting).toEqual(
        before,
      );
    }
  });

  it('answers 404 to someone no group lets see the folder', async () => {
    expect((await get(app, a, cookies['nobody'])).statusCode).toBe(404);
    expect((await put(app, a, { readWrite: ['mine'] }, cookies['nobody'])).statusCode).toBe(404);
  });

  it('asks for sign-in first', async () => {
    expect((await get(app, a)).statusCode).toBe(401);
    expect((await put(app, a, { readWrite: ['mine'] })).statusCode).toBe(401);
  });
});
