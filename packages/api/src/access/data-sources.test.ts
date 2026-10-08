import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
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

/** xcube's answer to a test that passes, as the stub runners give it. */
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };
type Sent = (options: InjectOptions) => Promise<LightMyRequestResponse>;
/**
 * A create's body with the id of the passing test of its settings, which a
 * data source is made from and only from (T363, AC-158; the user's answer,
 * 2026-09-27: "test first").
 */
async function testedBy(send: Sent, payload: ReturnType<typeof postgres>) {
  const { name: _name, ...settings } = payload;
  void _name;
  const run = await send({ method: 'POST', url: '/api/data-sources/test', payload: settings });
  expect(run.statusCode, run.body).toBe(200);
  return { ...payload, testId: run.json<{ testId: string }>().testId };
}

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
  // One name per data source (T701, AC-421): its connection in xcube is that name.
  held.a = (await sources().create(postgres(ids.a, 'warehouse_a'))).id;
  held.b = (await sources().create(postgres(ids.b, 'warehouse'))).id;
  held.c = (await sources().create(postgres(ids.c, 'warehouse_c'))).id;

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () => PASSING as never,
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

  /**
   * T462 (AC-269, design 03 of 2026-09-27): its settings page heads it with
   * its folder's path and says whether the user may change it there.
   */
  it('opens one with its folder’s path and whether the user may change it there', async () => {
    const own = (await opened('writer', held.b)).json<Record<string, unknown>>();
    expect([own['folderPath'], own['canWrite'], own['inWorkspace']]).toEqual([
      [
        { id: ids.a, title: `A ${MARK}` },
        { id: ids.b, title: `B ${MARK}` },
      ],
      true,
      false,
    ]);
    const above = (await opened('writer', held.a)).json<Record<string, unknown>>();
    expect([above['folderPath'], above['canWrite']]).toEqual([
      [{ id: ids.a, title: `A ${MARK}` }],
      false,
    ]);
    expect(
      (await opened('writer', held.root)).json<Record<string, unknown>>()['folderPath'],
    ).toEqual([]);
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

describe('every data source the user may see, in every folder (T364, AC-157)', () => {
  type Listed = {
    id: string;
    name: string;
    folderPath: { id: string; title: string }[];
    driver: string;
    lastTest: { ok: boolean; ranAt: string } | null;
  };
  const listing = async (who: string) =>
    (await as(who, { method: 'GET', url: '/api/data-sources' })).json<Listed[]>();

  it('lists a read-write member’s own and their ancestors’, with each folder’s path, and none of /C’s', async () => {
    const mine = (await listing('writer')).filter((row) => Object.values(held).includes(row.id));
    expect(mine.map((row) => row.id).sort()).toEqual([held.root, held.a, held.b].sort());
    const b = mine.find((row) => row.id === held.b)!;
    expect(b).toMatchObject({ name: 'warehouse', driver: 'postgres' });
    expect(b.folderPath.map((folder) => folder.title)).toEqual([`A ${MARK}`, `B ${MARK}`]);
    expect(mine.find((row) => row.id === held.root)!.folderPath).toEqual([]);
  });

  it('lists none to a read-only member', async () => {
    expect(await listing('reader')).toEqual([]);
  });

  it('says each one’s health from the last test of its stored settings, a trial of changes aside', async () => {
    const tests = connectionTestStore(getDb());
    const stored = (await sources().get(held.b))!.settingsPrint;
    const base = { checks: [], fields: {}, by: null };
    await tests.record(held.b, { ...base, ok: true, asStored: true, settings: stored });
    await tests.record(held.b, { ...base, ok: false, asStored: false, settings: null });

    const b = (await listing('writer')).find((row) => row.id === held.b)!;
    expect(b.lastTest?.ok).toBe(true);
    expect((await listing('writer')).find((row) => row.id === held.a)?.lastTest).toBeNull();
  });

  /**
   * T459 (AC-157): beside each, the cubes xcube bound to it at publish, each
   * with its folder's path — a cube that extends another counted with its
   * parent's — and only those in folders the user sees every item of. Without
   * xcube, or with xcube away, the page is still given, with none known.
   */
  it('lists beside each the cubes bound to it, where the user sees them (T459)', async () => {
    const xids = new Map([
      ['root', 'froot'],
      [ids.a, 'fa'],
      [ids.b, 'fb'],
      [ids.c, 'fc'],
    ]);
    let away = false;
    const withXcube = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
      folders: async () => ({ ids: xids, parents: new Map() }),
      modelFiles: {
        list: async () => [],
        all: async () => [
          {
            folderId: ids.b,
            path: 'cubes/child.yml',
            content: 'cubes:\n  - name: child\n    extends: base\n',
          },
        ],
        seed: async () => undefined,
        write: async () => undefined,
      },
      xcube: {
        items: async () => {
          if (away) throw new TypeError('fetch failed');
          return [
            {
              folderId: 'fa',
              name: 'base',
              kind: 'cube',
              fullName: 'base',
              bindings: {},
              dataSource: 'warehouse_a',
            },
            {
              folderId: 'fb',
              name: 'child',
              kind: 'cube',
              fullName: 'child',
              bindings: { base: 'base' },
              dataSource: null,
            },
            {
              folderId: 'fc',
              name: 'secret',
              kind: 'cube',
              fullName: 'secret',
              bindings: {},
              dataSource: 'warehouse_a',
            },
          ];
        },
      } as never,
    });
    try {
      type Used = {
        id: string;
        usedBy: { name: string; folderPath: { title: string }[] }[] | null;
        usedElsewhere?: number;
      };
      const rowA = async () =>
        (
          await withXcube.inject({
            method: 'GET',
            url: '/api/data-sources',
            headers: { cookie: cookies['writer']! },
          })
        )
          .json<Used[]>()
          .find((row) => row.id === held.a);
      const usedBy = async () => (await rowA())?.usedBy;

      // /C's cube is counted, never named, as AC-322 counts what can't be seen.
      expect((await rowA())?.usedElsewhere).toBe(1);
      expect(await usedBy()).toEqual([
        { name: 'base', folderId: ids.a, folderPath: [{ id: ids.a, title: `A ${MARK}` }] },
        {
          name: 'child',
          folderId: ids.b,
          // Its model file, which wechart holds (T499); base's it doesn't.
          file: 'cubes/child.yml',
          folderPath: [
            { id: ids.a, title: `A ${MARK}` },
            { id: ids.b, title: `B ${MARK}` },
          ],
        },
      ]);
      away = true;
      expect(await usedBy()).toBeNull();
      expect((await rowA())?.usedElsewhere).toBe(0);
    } finally {
      await withXcube.close();
    }
    // Without xcube: none known.
    expect((await listing('writer')).find((row) => row.id === held.a)).toMatchObject({
      usedBy: null,
    });
  });

  it('refuses deleting one cubes are bound to, naming those the user sees and counting the rest (T519, AC-364)', async () => {
    const withXcube = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
      folders: async () => ({
        ids: new Map([
          ['root', 'froot'],
          [ids.a, 'fa'],
          [ids.b, 'fb'],
          [ids.c, 'fc'],
        ]),
        parents: new Map(),
      }),
      xcube: {
        items: async () => [
          {
            folderId: 'fb',
            name: 'orders',
            kind: 'cube',
            fullName: 'orders',
            bindings: {},
            dataSource: 'warehouse',
          },
          {
            folderId: 'fc',
            name: 'secret',
            kind: 'cube',
            fullName: 'secret',
            bindings: {},
            dataSource: 'warehouse',
          },
        ],
      } as never,
    });
    const unbound = (await sources().create(postgres(ids.b, `${MARK}_unbound`))).id;
    try {
      const refused = await withXcube.inject({
        method: 'DELETE',
        url: `/api/data-sources/${held.b}`,
        headers: { cookie: cookies['writer']! },
      });
      expect(refused.statusCode, refused.body).toBe(409);
      expect(refused.json()).toEqual({
        error: 'This data source is used by 2 cubes: change or delete them first.',
        cubes: [
          {
            name: 'orders',
            folderId: ids.b,
            folderPath: [
              { id: ids.a, title: `A ${MARK}` },
              { id: ids.b, title: `B ${MARK}` },
            ],
          },
        ],
        hidden: 1,
      });
      expect((await sources().get(held.b))?.id).toBe(held.b);

      // What its dialog asks first answers the same (T526; design 14, state C).
      const ask = (id: string, who = 'writer') =>
        withXcube.inject({
          method: 'GET',
          url: `/api/data-sources/${id}/dependents`,
          headers: { cookie: cookies[who]! },
        });
      const asked = await ask(held.b);
      expect(asked.statusCode, asked.body).toBe(200);
      const { error: _said, ...dependents } = refused.json<Record<string, unknown>>();
      void _said;
      expect(asked.json()).toEqual(dependents);
      expect((await ask(unbound)).json()).toEqual({ cubes: [], hidden: 0 });
      // To those who may delete it alone, as its delete is.
      expect((await ask(held.b, 'reader')).statusCode).toBe(404);

      // One no cube is bound to goes.
      const deleted = await withXcube.inject({
        method: 'DELETE',
        url: `/api/data-sources/${unbound}`,
        headers: { cookie: cookies['writer']! },
      });
      expect(deleted.statusCode, deleted.body).toBe(204);
      expect(await sources().get(unbound)).toBeUndefined();
    } finally {
      await withXcube.close();
    }
  });

  it('says, when xcube can’t be asked, that what is bound to it isn’t known, never that nothing is (T526’s review)', async () => {
    const away = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
      folders: async () => ({ ids: new Map([['root', 'froot']]), parents: new Map() }),
      xcube: {
        items: async () => {
          throw new Error('xcube is away');
        },
      } as never,
    });
    try {
      const asked = await away.inject({
        method: 'GET',
        url: `/api/data-sources/${held.b}/dependents`,
        headers: { cookie: cookies['writer']! },
      });
      expect(asked.statusCode, asked.body).toBe(503);
      expect(asked.json()).toEqual({
        error:
          'xcube couldn’t be asked which published cubes are bound to it. Try again once it’s back.',
      });
    } finally {
      await away.close();
    }
  });

  it('tells a read-write member from a read-only one, for the page with none to list (T364’s review)', async () => {
    const me = async (who: string) =>
      (await as(who, { method: 'GET', url: '/api/me' })).json<{ readWrite: boolean }>();
    expect((await me('writer')).readWrite).toBe(true);
    expect((await me('reader')).readWrite).toBe(false);
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
      // Only an empty folder is deleted, saying what it holds (T521, AC-366).
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({
        error: 'This folder holds 1 subfolder: only an empty folder can be deleted.',
        holds: { subfolders: 1, dashboards: 0, charts: 0, models: 0, dataSources: 0 },
      });
      expect(await docs().get('folder', outer)).not.toBeNull();
      // Nor is the folder holding the data source.
      const inside = await open.inject({ method: 'DELETE', url: `/api/documents/folder/${inner}` });
      expect(inside.statusCode).toBe(409);
      expect(inside.json<{ holds: unknown }>().holds).toEqual({
        subfolders: 0,
        dashboards: 0,
        charts: 0,
        models: 0,
        dataSources: 1,
      });
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
      // Each made from its passing test (T363).
      connectionTests: connectionTestStore(getDb()),
      connectionTest: async () => PASSING as never,
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
      const sent: Sent = (options) => open.inject(options);
      const taken = await open.inject({
        method: 'POST',
        url: '/api/data-sources',
        payload: await testedBy(sent, postgres(ids.b, `${MARK}_landed`)),
      });
      expect(taken.statusCode).toBe(201);

      const refused = await open.inject({
        method: 'POST',
        url: '/api/data-sources',
        payload: await testedBy(sent, postgres(ids.b, `${MARK}_refused`)),
      });
      expect(refused.statusCode).toBe(422);
      expect(refused.json()).toEqual({
        error: 'xcube can’t open a secret: password. Enter it again.',
        problems: ['xcube can’t open a secret: password. Enter it again.'],
      });

      const id = taken.json<{ id: string }>().id;
      // A change to its connection, saved from its passing test (T461).
      const change = {
        fields: { host: 'db', port: 5432, database: 'other', user: 'cube', ssl: true },
      };
      const changeTest = await open.inject({
        method: 'POST',
        url: `/api/data-sources/${id}/test`,
        payload: change,
      });
      expect(
        (
          await open.inject({
            method: 'PUT',
            url: `/api/data-sources/${id}`,
            payload: { ...change, testId: changeTest.json<{ testId: string }>().testId },
          })
        ).statusCode,
      ).toBe(200);
      // A description is no part of the connection: saved, nothing landed (T499's review).
      expect(
        (
          await open.inject({
            method: 'PUT',
            url: `/api/data-sources/${id}`,
            payload: { description: 'Read replica.' },
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
      expect(routes).toMatch(/\/api\/data-sources \([^)]*POST[^)]*\)/);
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

      // Its health is the newest test of its stored settings: the pass, not
      // the earlier failure, nor the trials (T364, AC-157). With security off,
      // the one user sees every folder's, /C's included.
      type Listed = { id: string; lastTest: { ok: boolean; current: boolean } | null };
      const listed = async (id: string) =>
        (await app.inject({ method: 'GET', url: '/api/data-sources' }))
          .json<Listed[]>()
          .find((row) => row.id === id);
      expect((await listed(made.id))?.lastTest).toMatchObject({ ok: true, current: true });
      const inC = await sources().create(postgres(ids.c, `${MARK}_in_c`));
      expect(await listed(inC.id)).toBeDefined();

      // A description changes no connection setting, so it keeps that health
      // (a landed one's name no longer changes at all, T706). A new password
      // is saved only from its passing test (T461), which is then its health;
      // untested, it is never saved (T364's review; R32).
      const save = (payload: Record<string, unknown>) =>
        app.inject({ method: 'PUT', url: `/api/data-sources/${made.id}`, payload });
      expect((await save({ description: `Described ${MARK}` })).statusCode).toBe(200);
      expect((await listed(made.id))?.lastTest).toMatchObject({ ok: true, current: true });
      const changed = { sealed: { password: sealed('changed') } };
      expect((await save(changed)).statusCode).toBe(422);
      answer = { ok: true, checks: passed };
      const tried = await app.inject({
        method: 'POST',
        url: `/api/data-sources/${made.id}/test`,
        payload: changed,
      });
      const testId = tried.json<{ testId: string }>().testId;
      expect((await save({ ...changed, testId })).statusCode).toBe(200);
      const health = (await listed(made.id))?.lastTest;
      expect(health?.ok).toBe(true);
      expect(health?.current).toBe(true);
      expect((await recorded.history(made.id))[0]?.id).toBe(testId);
    } finally {
      await app.close();
    }
  });

  it('says whether Cube uses a source’s settings, from xcube’s reports (T365, AC-161)', async () => {
    const asked: string[] = [];
    const app = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
      connectionHealth: async (source) => {
        asked.push(source.id);
        return {
          version: 4,
          instances: [
            {
              instance: 'cube-1/1/aaaaaa',
              version: 3,
              state: 'live',
              error: null,
              reportedAt: new Date().toISOString(),
              current: false,
            },
          ],
        };
      },
    });
    try {
      const answer = await app.inject({
        method: 'GET',
        url: `/api/data-sources/${held.b}/cube-state`,
      });
      expect(answer.statusCode).toBe(200);
      expect(answer.json()).toMatchObject({ state: 'waiting', version: 4 });
      expect(asked).toEqual([held.b]);
    } finally {
      await app.close();
    }
    // Never landed; xcube's own refusal; xcube away; no xcube at all (T365's review).
    for (const [health, status, body] of [
      [async () => undefined, 200, { state: 'unlanded' }],
      [
        async () => {
          throw new XcubeError(401, undefined, 'xcube answered 401: Invalid service token');
        },
        502,
        { error: 'xcube refused to say: xcube answered 401: Invalid service token' },
      ],
      [
        async () => {
          throw new TypeError('fetch failed');
        },
        503,
        { error: 'xcube can’t be reached to say whether Cube uses it. Try again once it is back.' },
      ],
      [
        undefined,
        503,
        {
          error: 'Cube’s use of a data source is told by xcube, which this deployment doesn’t run.',
        },
      ],
    ] as const) {
      const other = buildServer({
        config: { ...secured, security: 'off' as const },
        documents: docs(),
        catalog: catalog(getDb()),
        dataSources: sources(),
        ...(health === undefined ? {} : { connectionHealth: health }),
      });
      try {
        const answered = await other.inject({
          method: 'GET',
          url: `/api/data-sources/${held.b}/cube-state`,
        });
        expect(answered.statusCode).toBe(status);
        expect(answered.json()).toEqual(body);
      } finally {
        await other.close();
      }
    }
    // A read-only member sees no data source, nor its state.
    expect(
      (await as('reader', { method: 'GET', url: `/api/data-sources/${held.b}/cube-state` }))
        .statusCode,
    ).toBe(404);
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
      payload: await testedBy((options) => as('writer', options), postgres(ids.b, `${MARK}_made`)),
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
    // One in their workspace, to go to /A/B: a shared one's settings change
    // only through a proposal (T502, AC-278).
    const made = await as('writer', {
      method: 'POST',
      url: '/api/data-sources',
      payload: {
        ...(await testedBy((options) => as('writer', options), postgres('mine', `${MARK}_moved`))),
        targetFolderId: ids.b,
      },
    });
    expect(made.statusCode, made.body).toBe(201);
    const mine = made.json<{ id: string }>().id;
    const moved = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${mine}`,
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
      url: `/api/data-sources/${mine}`,
      payload: { driver: 'mysql' },
    });
    expect(retyped.statusCode).toBe(409);
    expect(retyped.json()).toEqual({
      error: 'A data source’s type never changes: make a new data source for MySQL.',
      problems: ['A data source’s type never changes: make a new data source for MySQL.'],
    });
  });
});

/**
 * T363 (AC-158, AC-163): a data source is made only from a test that passed,
 * of exactly its settings, by the one making it: never without one (the
 * user's answer, 2026-09-27). The test is kept as a row, so any replica can
 * check it, and it heads the new source's history.
 */
describe('a new one made only from its passing test (T363, AC-158)', () => {
  const REFUSED = {
    error:
      'Test its connection first: a data source is made only from a test of exactly its settings that passed.',
  };
  const passing = {
    ok: true,
    checks: [
      { id: 'secrets', status: 'passed', durationMs: 1 },
      { id: 'connect', status: 'passed', durationMs: 4 },
    ],
  };
  const failing = {
    ok: false,
    checks: [{ id: 'connect', status: 'failed', durationMs: 9, error: 'no route to host' }],
  };
  let answer: unknown = passing;
  const recorded = connectionTestStore(getDb());
  let gated: FastifyInstance;
  const cookieOf: Record<string, string> = {};

  beforeAll(async () => {
    gated = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
      connectionTests: recorded,
      connectionTest: async () => answer as never,
    });
    for (const who of ['writer', 'super']) cookieOf[who] = await signIn(gated, USERS[who]!);
  });
  afterAll(async () => {
    await gated.close();
  });

  const send = (who: string, url: string, payload: Record<string, unknown>) =>
    gated.inject({ method: 'POST', url, payload, headers: { cookie: cookieOf[who]! } });
  /** What the wizard tests: the settings, without a name. */
  const settingsOf = (name: string) => {
    const { name: _name, ...rest } = postgres(ids.b, name);
    void _name;
    return rest;
  };
  const tested = async (who: string, settings: Record<string, unknown>, with_ = passing) => {
    answer = with_;
    const run = await send(who, '/api/data-sources/test', settings);
    expect(run.statusCode, run.body).toBe(200);
    const { testId } = run.json<{ testId: string }>();
    expect(testId).toMatch(/^[0-9a-f-]{36}$/);
    return testId;
  };
  const namesIn = async () => (await sources().inFolder(ids.b)).map((source) => source.name);

  it('makes one naming its passing test, which heads its history and is its health (AC-163, AC-157)', async () => {
    const settings = settingsOf('x');
    const testId = await tested('writer', settings);
    const made = await send('writer', '/api/data-sources', {
      ...settings,
      name: `${MARK}_gated`,
      testId,
    });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json<{ id: string }>().id;

    const history = await recorded.history(id);
    expect(history.map((test) => [test.id, test.ok, test.asStored])).toEqual([
      [testId, true, true],
    ]);
    expect(history[0]!.by).toMatchObject({ name: expect.any(String) as string });
    const listed = (
      await gated.inject({
        method: 'GET',
        url: '/api/data-sources',
        headers: { cookie: cookieOf['writer']! },
      })
    )
      .json<{ id: string; lastTest: { ok: boolean; current: boolean } | null }[]>()
      .find((row) => row.id === id);
    expect(listed?.lastTest).toMatchObject({ ok: true, current: true });

    // Its test is its own now: it makes no other.
    const again = await send('writer', '/api/data-sources', {
      ...settings,
      name: `${MARK}_gated_again`,
      testId,
    });
    expect(again.statusCode).toBe(422);
    expect(await namesIn()).not.toContain(`${MARK}_gated_again`);
  });

  it('refuses one with no test, a failed test, a test of other settings or another’s test, and makes nothing', async () => {
    const settings = settingsOf('y');
    const failed = await tested('writer', settings, failing);
    const passed = await tested('writer', settings);
    const supers = await tested('super', settings);
    const cases: [string, Record<string, unknown>][] = [
      ['no test', {}],
      ['a failed test', { testId: failed }],
      ['a test that isn’t there', { testId: randomUUID() }],
      ['another host', { testId: passed, fields: { ...settings.fields, host: 'elsewhere' } }],
      ['another envelope', { testId: passed, sealed: { password: sealed('other') } }],
      ['another database', { testId: passed, fields: { ...settings.fields, database: 'hr' } }],
      ['another’s test', { testId: supers }],
    ];
    for (const [why, change] of cases) {
      const refused = await send('writer', '/api/data-sources', {
        ...settings,
        name: `${MARK}_refused`,
        ...change,
      });
      expect(refused.statusCode, why).toBe(422);
      expect(refused.json(), why).toEqual(REFUSED);
    }
    expect(await namesIn()).not.toContain(`${MARK}_refused`);
  });

  it('takes the wizard’s earlier tests into its history too, never another’s (T363’s review, AC-163)', async () => {
    const settings = settingsOf('w');
    const failed = await tested(
      'writer',
      { ...settings, fields: { ...settings.fields, port: 5433 } },
      failing,
    );
    const supers = await tested('super', settings, failing);
    const passed = await tested('writer', settings);
    const made = await send('writer', '/api/data-sources', {
      ...settings,
      name: `${MARK}_with_trials`,
      testId: passed,
      trials: [failed, supers],
    });
    expect(made.statusCode, made.body).toBe(201);
    const history = await recorded.history(made.json<{ id: string }>().id);
    expect(history.map((test) => [test.id, test.ok, test.asStored])).toEqual([
      [passed, true, true],
      [failed, false, false],
    ]);
  });

  it('makes one source only from one test, however close together the creates come (T363’s review)', async () => {
    const settings = settingsOf('v');
    const testId = await tested('writer', settings);
    const answers = await Promise.all(
      ['one', 'two', 'three'].map((suffix) =>
        send('writer', '/api/data-sources', {
          ...settings,
          name: `${MARK}_race_${suffix}`,
          testId,
        }),
      ),
    );
    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([201, 422, 422]);
    expect((await namesIn()).filter((name) => name.startsWith(`${MARK}_race_`))).toHaveLength(1);
  });

  it('keeps its test for another create when this one is refused (T363’s review)', async () => {
    const settings = settingsOf('u');
    const testId = await tested('writer', settings);
    const clash = await send('writer', '/api/data-sources', {
      ...settings,
      name: 'warehouse',
      testId,
    });
    expect(clash.statusCode).toBe(409);
    const made = await send('writer', '/api/data-sources', {
      ...settings,
      name: `${MARK}_after_clash`,
      testId,
    });
    expect(made.statusCode, made.body).toBe(201);
  });

  it('never makes one without a passing test, even when asked to (the user’s answer, 2026-09-27)', async () => {
    const settings = settingsOf('z');
    const failed = await tested('writer', settings, failing);
    for (const change of [{ override: true }, { override: true, testId: failed }]) {
      const refused = await send('writer', '/api/data-sources', {
        ...settings,
        name: `${MARK}_overridden`,
        ...change,
      });
      expect(refused.statusCode).toBe(422);
      expect(refused.json()).toEqual(REFUSED);
    }
    expect(await namesIn()).not.toContain(`${MARK}_overridden`);
  });
});

/**
 * T461 (AC-158; rule 23; the user's answer, R32: "test first, and dont save
 * if test fails.. both in create new as well as edit"): a change to a data
 * source's connection is saved only from a test of exactly that change, of
 * its stored version, that passed and was run by the one saving it. A rename
 * changes no connection, and needs none.
 */
describe('a change to its connection saved only from its passing test (T461, AC-158)', () => {
  const UNTESTED_CHANGE = {
    error:
      'Test the change first: a data source’s connection changes only when a test of exactly that change passed.',
  };
  const passing = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 3 }] };
  const failing = {
    ok: false,
    checks: [{ id: 'connect', status: 'failed', durationMs: 9, error: 'no route to host' }],
  };
  let answer: unknown = passing;
  const recorded = connectionTestStore(getDb());
  let gated: FastifyInstance;
  const cookieOf: Record<string, string> = {};
  let id = '';
  /** A second source with the very same settings: another's test is never this one's. */
  let twin = '';

  beforeAll(async () => {
    gated = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: sources(),
      connectionTests: recorded,
      connectionTest: async () => answer as never,
    });
    for (const who of ['writer', 'super']) cookieOf[who] = await signIn(gated, USERS[who]!);
    // In writer's workspace, to go to /A/B: a shared one's connection changes
    // only through a proposal (T502, AC-278).
    const send: Sent = (options) =>
      gated.inject({ ...options, headers: { ...options.headers, cookie: cookieOf['writer']! } });
    const made = async (name: string) => {
      const answer = await send({
        method: 'POST',
        url: '/api/data-sources',
        payload: { ...(await testedBy(send, postgres('mine', name))), targetFolderId: ids.b },
      });
      expect(answer.statusCode, answer.body).toBe(201);
      return answer.json<{ id: string }>().id;
    };
    id = await made(`${MARK}_edited`);
    twin = await made(`${MARK}_twin`);
  });
  afterAll(async () => {
    await gated.close();
    for (const each of [id, twin]) if (each !== '') await sources().remove(each);
  });

  const other = (database: string) => ({ ...postgres(ids.b, 'x').fields, database });
  const testOf = async (
    change: Record<string, unknown>,
    with_ = passing,
    { who = 'writer', on = id }: { who?: string; on?: string } = {},
  ) => {
    answer = with_;
    const run = await gated.inject({
      method: 'POST',
      url: `/api/data-sources/${on}/test`,
      payload: change,
      headers: { cookie: cookieOf[who]! },
    });
    expect(run.statusCode, run.body).toBe(200);
    const { testId } = run.json<{ testId: string }>();
    expect(testId).toMatch(/^[0-9a-f-]{36}$/);
    return testId;
  };
  const save = (payload: Record<string, unknown>, who = 'writer') =>
    gated.inject({
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload,
      headers: { cookie: cookieOf[who]! },
    });
  const stored = async () => (await sources().get(id))!;
  /** What a refused save must leave: its settings, secrets and version. */
  const unchanged = async (before: { settingsPrint: string; version: number }) => {
    const after = await stored();
    expect([after.settingsPrint, after.version]).toEqual([before.settingsPrint, before.version]);
  };

  it('refuses a changed connection with no test, a failed one, one of another change, another’s, or another source’s, and changes nothing', async () => {
    const before = await stored();
    const change = { fields: other('hr') };
    const failed = await testOf(change, failing);
    const ofAnother = await testOf({ fields: other('finance') });
    // Another user's test of it can't be run now it is writer's own, in their
    // workspace (T502); that another's is never claimed is shown below, by
    // `claimChange` with a key not the runner's.
    const twins = await testOf(change, passing, { on: twin });
    const method = {
      authMethod: 'client-certificate',
      fields: { ...other('sales'), sslCert: 'client certificate PEM' },
      sealed: { sslKey: sealed('key') },
    };
    for (const [why, sent] of [
      ['no test', change],
      ['a failed test', { ...change, testId: failed }],
      ['a test of another change', { ...change, testId: ofAnother }],
      ['a test that isn’t there', { ...change, testId: randomUUID() }],
      ['an override', { ...change, override: true }],
      ['another source’s test of the same change', { ...change, testId: twins }],
      ['a new secret, untested', { sealed: { password: sealed('untested') } }],
      ['a new way to sign in, untested', method],
    ] as const) {
      const refused = await save(sent);
      expect(refused.statusCode, why).toBe(422);
      expect(refused.json(), why).toEqual(UNTESTED_CHANGE);
    }
    await unchanged(before);
  });

  it('saves a new way to sign in from its passing test (AC-158)', async () => {
    const method = {
      authMethod: 'client-certificate',
      fields: { ...(await stored()).fields, sslCert: 'client certificate PEM' },
      sealed: { sslKey: sealed('key') },
    };
    const testId = await testOf(method);
    const saved = await save({ ...method, testId });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await stored()).authMethod).toBe('client-certificate');
    // Back to a password, tested too.
    const back = {
      authMethod: 'password',
      fields: { ...(await stored()).fields },
      sealed: { password: sealed('back') },
    };
    delete (back.fields as Record<string, unknown>)['sslCert'];
    const again = await testOf(back);
    expect((await save({ ...back, testId: again })).statusCode).toBe(200);
  });

  it('makes one save of one test, taken once in one statement, and gives it back when a save is refused', async () => {
    const change = { fields: other('racing') };
    const testId = await testOf(change);
    // Taken once, then never again, whoever asks at the same moment.
    const { shape } = await getDb()
      .selectFrom('connection_tests')
      .select('shape')
      .where('id', '=', testId)
      .executeTakeFirstOrThrow();
    const takes = await Promise.all(
      [1, 2, 3].map(() => recorded.claimChange(id, testId, shape!, 'writer-key-unused')),
    );
    expect(takes).toEqual([false, false, false]);
    const writerKey = (await recorded.history(id)).find((test) => test.id === testId)!.by!.key;
    const taken = await Promise.all(
      [1, 2, 3].map(() => recorded.claimChange(id, testId, shape!, writerKey)),
    );
    expect(taken.filter(Boolean)).toHaveLength(1);
    // Given back, it is there for the save it was made for.
    await recorded.releaseChange(id, testId, shape!);
    expect((await save({ ...change, testId })).statusCode).toBe(200);
    expect((await save({ ...change, name: `${MARK}_edited`, testId })).statusCode).toBe(200);

    // A save refused after taking its test (a name the store won't take)
    // gives the test back, for the save that follows.
    const next = { fields: other('retried') };
    const retried = await testOf(next);
    expect((await save({ ...next, name: 'Not A Name', testId: retried })).statusCode).toBe(400);
    expect((await save({ ...next, testId: retried })).statusCode).toBe(200);
    expect((await stored()).fields['database']).toBe('retried');
  });

  it('never saves over a version it wasn’t checked against (T461’s review)', async () => {
    const at = (await stored()).version;
    const refused = (await sources()
      .update(id, { fields: other('late') }, {}, at - 1)
      .catch((error: unknown) => error)) as DataSourceRefused;
    expect(refused).toBeInstanceOf(DataSourceRefused);
    expect(refused.status).toBe(409);
    expect((await stored()).fields['database']).not.toBe('late');
  });

  it('says the health of settings as they are now, before a newer test of settings since changed', async () => {
    type Listed = { id: string; lastTest: { ok: boolean; current: boolean } | null };
    const health = async () =>
      (
        await gated.inject({
          method: 'GET',
          url: '/api/data-sources',
          headers: { cookie: cookieOf['writer']! },
        })
      )
        .json<Listed[]>()
        .find((row) => row.id === id)?.lastTest;
    const change = { fields: other('health') };
    const testId = await testOf(change);
    // The stored settings tested after the change's test, and failing.
    await testOf({}, failing);
    expect((await save({ ...change, testId })).statusCode).toBe(200);
    const now = await health();
    expect(now?.ok).toBe(true);
    expect(now?.current).toBe(true);

    // Settings nobody tested: its last test is no longer current (AC-157).
    await sources().update(id, { fields: other('untested') });
    expect((await health())?.current).toBe(false);
  });

  it('saves the change its passing test was of, once, and that test is its health (AC-163, AC-157)', async () => {
    const change = { fields: other('hr') };
    const testId = await testOf(change);
    const saved = await save({ ...change, testId });
    expect(saved.statusCode, saved.body).toBe(200);
    const after = await stored();
    expect(after.fields['database']).toBe('hr');
    const [newest] = await recorded.history(id);
    expect([newest?.id, newest?.ok, newest?.asStored, newest?.settings]).toEqual([
      testId,
      true,
      true,
      after.settingsPrint,
    ]);
    // One test saves one change.
    const again = await save({ fields: other('hr2'), testId });
    expect(again.statusCode).toBe(422);
  });

  it('needs no test for a description, gives it back, and a copy keeps it (T499; design 03, state B)', async () => {
    const said = 'Read replica for EMEA order cubes.';
    const saved = await save({ description: said });
    expect(saved.statusCode, saved.body).toBe(200);
    const opened = await gated.inject({
      method: 'GET',
      url: `/api/data-sources/${id}`,
      headers: { cookie: cookieOf['writer']! },
    });
    expect(opened.json<{ description: string | null }>().description).toBe(said);
    const copy = await sources().copy(id, 'ws:t499');
    try {
      expect(copy.description).toBe(said);
    } finally {
      await sources().remove(copy.id);
    }
    // An empty one is none.
    expect((await save({ description: '' })).statusCode).toBe(200);
    expect((await stored()).description).toBeNull();
  });

  it('needs no test for a rename, and no longer takes a test once the source has changed since', async () => {
    const change = { fields: other('sales2') };
    const testId = await testOf(change);
    expect((await save({ name: `${MARK}_edited_renamed` })).statusCode).toBe(200);
    // Tested against the version before the rename: test it again.
    const stale = await save({ ...change, testId });
    expect(stale.statusCode).toBe(422);
    expect((await stored()).fields['database']).not.toBe('sales2');
  });
});
