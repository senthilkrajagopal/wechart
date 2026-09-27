import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { DataSourceRefused, dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { buildServer } from '../server';
import { XcubeError } from '../xcube/client';

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
    connectionTests: connectionTestStore(getDb()),
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

describe('a save landing in xcube first (T442, AC-327)', () => {
  it('stores what xcube takes, and nothing xcube refuses, saying why', async () => {
    const landed: string[] = [];
    const open = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
      dataSourceLanding: {
        prepare: async () => ({
          land: async (source) => {
            if (source.name.endsWith('_refused'))
              throw new DataSourceRefused(
                422,
                'xcube can’t open a secret: password. Enter it again.',
              );
            landed.push(source.name);
          },
          unland: async (source) => {
            landed.push(`renamed from ${source.name}`);
          },
        }),
        unland: async (source) => {
          landed.push(`-${source.name}`);
        },
      },
    });
    try {
      const taken = await open.inject({
        method: 'POST',
        url: '/api/data-sources',
        payload: postgres(ids.b, `${MARK}_landed`),
      });
      expect(taken.statusCode).toBe(201);

      const refused = await open.inject({
        method: 'POST',
        url: '/api/data-sources',
        payload: postgres(ids.b, `${MARK}_refused`),
      });
      expect(refused.statusCode).toBe(422);
      expect(refused.json()).toEqual({
        error: 'xcube can’t open a secret: password. Enter it again.',
        problems: ['xcube can’t open a secret: password. Enter it again.'],
      });

      const id = taken.json<{ id: string }>().id;
      expect(
        (
          await open.inject({
            method: 'PUT',
            url: `/api/data-sources/${id}`,
            payload: {
              fields: { host: 'db', port: 5432, database: 'other', user: 'cube', ssl: true },
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await open.inject({ method: 'DELETE', url: `/api/data-sources/${id}` })).statusCode,
      ).toBe(204);
      expect(landed).toEqual([`${MARK}_landed`, `${MARK}_landed`, `-${MARK}_landed`]);
      // Cube takes its connections from xcube: wechart serves none (AC-327).
      await open.ready();
      const routes = open.printRoutes({ commonPrefix: false });
      expect(routes).toContain('/api/data-sources (POST)');
      expect(routes).not.toMatch(/connection/i);
      expect((await sources().inFolder(ids.b)).map((each) => each.name)).not.toContain(
        `${MARK}_refused`,
      );
    } finally {
      await open.close();
    }
  });
});

describe('a connection test, run by xcube (T361, AC-159, AC-312)', () => {
  const checks = [
    { id: 'secrets', status: 'passed', durationMs: 2 },
    { id: 'connect', status: 'failed', durationMs: 9, error: 'password authentication failed' },
  ];
  const testing = (answer: () => Promise<unknown> = async () => ({ ok: false, checks })) => {
    const asked: unknown[] = [];
    const app = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
      connectionTest: async (body) => {
        asked.push(body);
        return (await answer()) as never;
      },
    });
    return { app, asked };
  };

  it('tests a stored one as it is, with its stored envelopes, answering xcube’s checks', async () => {
    const { app, asked } = testing();
    try {
      const answer = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${held.b}/test`,
        payload: {},
      });
      expect(answer.statusCode).toBe(200);
      expect(answer.json()).toEqual({ ok: false, checks });
      expect(asked).toEqual([
        {
          driver: 'postgres',
          authMethod: 'password',
          fields: postgres(ids.b, 'x').fields,
          sealed: { password: sealed('warehouse') },
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('refuses a test where it would connect elsewhere with a secret not sealed again, asking xcube nothing', async () => {
    const { app, asked } = testing();
    const elsewhere = { ...postgres(ids.b, 'x').fields, host: 'elsewhere' };
    try {
      const refused = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${held.b}/test`,
        payload: { fields: elsewhere },
      });
      expect(refused.statusCode).toBe(422);
      expect(refused.json<{ error: string }>().error).toBe(
        'Enter password again: host changed where it connects.',
      );
      expect(asked).toEqual([]);

      // Sealed again for the new target: tested with the new envelope, nothing stored.
      const tested = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${held.b}/test`,
        payload: { fields: elsewhere, sealed: { password: sealed('elsewhere') } },
      });
      expect(tested.statusCode).toBe(200);
      expect(asked).toEqual([
        {
          driver: 'postgres',
          authMethod: 'password',
          fields: elsewhere,
          sealed: { password: sealed('elsewhere') },
        },
      ]);
      expect((await sources().get(held.b))?.fields['host']).toBe('db');
    } finally {
      await app.close();
    }
  });

  it('tests one not yet saved, refusing a secret sent as a field', async () => {
    const { app, asked } = testing();
    try {
      const whole = postgres(ids.b, `${MARK}_unsaved`);
      const folderId = whole.folderId;
      const shape = {
        driver: whole.driver,
        authMethod: whole.authMethod,
        fields: whole.fields,
        sealed: whole.sealed,
      };
      const tested = await app.inject({
        method: 'POST',
        url: '/api/data-sources/test',
        payload: { folderId, ...shape },
      });
      expect(tested.statusCode).toBe(200);
      expect(asked).toEqual([shape]);

      const plain = await app.inject({
        method: 'POST',
        url: '/api/data-sources/test',
        payload: { folderId, ...shape, fields: { ...shape.fields, password: 'hunter2' } },
      });
      expect(plain.statusCode).toBe(400);
      expect(plain.body).not.toContain('hunter2');
      expect(asked).toHaveLength(1);
      expect(await sources().inFolder(ids.b)).not.toContainEqual(
        expect.objectContaining({ name: `${MARK}_unsaved` }),
      );
    } finally {
      await app.close();
    }
  });

  it('runs one only for those who may change it (T361’s review)', async () => {
    // The secured app: a reader sees none of /A/B's, and a writer's /A is view-only.
    const tests = (who: string, url: string, payload: Record<string, unknown> = {}) =>
      as(who, { method: 'POST', url, payload });
    expect((await tests('reader', `/api/data-sources/${held.b}/test`)).statusCode).toBe(404);
    expect((await tests('writer', `/api/data-sources/${held.a}/test`)).statusCode).toBe(403);
    expect((await tests('nobody', `/api/data-sources/${held.c}/test`)).statusCode).toBe(404);
    const unsaved = postgres(ids.a, `${MARK}_viewonly`);
    expect(
      (
        await tests('writer', '/api/data-sources/test', {
          folderId: unsaved.folderId,
          driver: unsaved.driver,
          authMethod: unsaved.authMethod,
          fields: unsaved.fields,
          sealed: unsaved.sealed,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('keeps a stored secret for a change outside where it connects, and changes nothing stored', async () => {
    const { app, asked } = testing();
    try {
      const before = {
        source: await sources().get(held.b),
        sealed: await sources().sealedOf(held.b),
      };
      const other = { ...postgres(ids.b, 'x').fields, database: 'other' };
      const tested = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${held.b}/test`,
        payload: { fields: other },
      });
      expect(tested.statusCode).toBe(200);
      expect(asked).toEqual([
        {
          driver: 'postgres',
          authMethod: 'password',
          fields: other,
          sealed: { password: sealed('warehouse') },
        },
      ]);
      expect({
        source: await sources().get(held.b),
        sealed: await sources().sealedOf(held.b),
      }).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it('says xcube’s answer when it isn’t checks, and a timeout as one', async () => {
    const answers = [
      async () => {
        throw new XcubeError(401, undefined, 'xcube answered 401: Invalid service token');
      },
      async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    ];
    for (const [answer, status, error] of [
      [answers[0], 502, 'xcube refused the test: xcube answered 401: Invalid service token'],
      [answers[1], 504, 'xcube took too long to answer the test. Try again.'],
    ] as const) {
      const { app } = testing(answer);
      try {
        const answered = await app.inject({
          method: 'POST',
          url: `/api/data-sources/${held.b}/test`,
          payload: {},
        });
        expect(answered.statusCode).toBe(status);
        expect(answered.json()).toEqual({ error });
      } finally {
        await app.close();
      }
    }
  });

  it('records each answered test of a stored one, and lists its history newest first (T362, AC-163)', async () => {
    const recorded = connectionTestStore(getDb());
    const asked: unknown[] = [];
    let answer: unknown = { ok: false, checks };
    const app = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
      connectionTests: recorded,
      connectionTest: async (body) => {
        asked.push(body);
        if (answer instanceof Error) throw answer;
        return answer as never;
      },
    });
    try {
      const made = await sources().create(postgres(ids.b, `${MARK}_tested`));
      const run = () =>
        app.inject({ method: 'POST', url: `/api/data-sources/${made.id}/test`, payload: {} });
      expect((await run()).statusCode).toBe(200);
      answer = { ok: true, checks: [{ id: 'secrets', status: 'passed', durationMs: 1 }] };
      // The form's changes, not saved: its fields in another order are no change.
      const reordered = Object.fromEntries(Object.entries(made.fields).reverse());
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/data-sources/${made.id}/test`,
            payload: { fields: reordered },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/data-sources/${made.id}/test`,
            payload: { sealed: { password: sealed('tried') } },
          })
        ).statusCode,
      ).toBe(200);
      // xcube away: no test was run, so none is recorded.
      answer = new TypeError('fetch failed');
      expect((await run()).statusCode).toBe(503);

      const history = await app.inject({
        method: 'GET',
        url: `/api/data-sources/${made.id}/tests`,
      });
      expect(history.statusCode).toBe(200);
      const passed = [{ id: 'secrets', status: 'passed', durationMs: 1 }];
      const admin = { key: 'admin', name: 'admin' };
      expect(
        history
          .json<{ ok: boolean; checks: unknown; by: unknown; asStored: boolean }[]>()
          .map(({ ok, checks: ran, by, asStored }) => ({ ok, checks: ran, by, asStored })),
      ).toEqual([
        { ok: true, checks: passed, by: admin, asStored: false },
        { ok: true, checks: passed, by: admin, asStored: true },
        { ok: false, checks, by: admin, asStored: true },
      ]);
      // Its envelopes are the source's, never its history's.
      expect(history.body).not.toContain(sealed(`${MARK}_tested`).ct);
      expect(history.body).not.toContain(sealed('tried').ct);
    } finally {
      await app.close();
    }
  });

  it('shows a source’s tests only to those who may see it (T362)', async () => {
    expect(
      (await as('reader', { method: 'GET', url: `/api/data-sources/${held.b}/tests` })).statusCode,
    ).toBe(404);
    expect(
      (await as('writer', { method: 'GET', url: `/api/data-sources/${held.a}/tests` })).statusCode,
    ).toBe(200);
  });

  it('says when xcube can’t be reached to run it', async () => {
    const { app } = testing(async () => {
      throw new TypeError('fetch failed');
    });
    try {
      const away = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${held.b}/test`,
        payload: {},
      });
      expect(away.statusCode).toBe(503);
      expect(away.json<{ error: string }>().error).toBe(
        'xcube can’t be reached to run the test. Try again once it is back.',
      );
    } finally {
      await app.close();
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
