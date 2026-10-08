import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { workspaceOverlayIdOf } from '../xcube/overlays';
import { xcubeSqlRunner } from '../xcube/sql-runner';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T539 (AC-386; design 15's P3): the schema browser beside the SQL editor,
 * a data source's schemas, tables and columns with their types, as xcube's
 * introspection lists them, asked by the data source's id, and only by those
 * who may run SQL on it.
 *
 * Against a stub Cube for introspection, and the stub xcube.
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it;
 * `manager` writes /Sales/Sub, below it; `super` is a Super-Admin.
 *
 * A data source in My workspace is read in its workspace's overlay, as its
 * SQL runs (T547; xcube 93a5f7a73b's `?overlay=`), named by wechart alone.
 */
const MARK = `sqlc${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlc-${MARK}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const FIELDS = { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false };

const folders = { sales: '', sub: '' };
let source = '';
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const asked: { path: string; method: string; body: unknown }[] = [];
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());

const BASE = '/cubejs-api/v1/introspection/data-sources';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeAll(async () => {
  for (const [key, parent, access] of [
    ['sales', 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['sub', 'sales', { readOnly: null, readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    folders[key] = id;
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: parent === 'root' ? 'root' : folders[parent],
        access,
      },
    });
  }
  source = (
    await sources().create({
      folderId: folders.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('sales') },
    })
  ).id;
  // This file's connections, as xcube serves them to Cube: each by its own
  // name in any folder (T701; research `xcube-256d632371.md`, 1.1).
  const connection = new RegExp(`^${BASE}/[A-Za-z0-9_]+_${MARK}(?:/|$)`);
  const cube = new CubeClient({
    apiUrl: 'http://cube.invalid/cubejs-api',
    apiSecret: 'secret',
    securityContext: {},
    fetchImpl: (async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url);
      const path = `${parsed.pathname}${parsed.search}`;
      asked.push({
        path,
        method: init.method ?? 'GET',
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      if (!connection.test(parsed.pathname))
        return json({ error: `Unknown data source: '${parsed.pathname}'` }, 404);
      // A workspace overlay's own data source, as xcube 93a5f7a73b reads it (T547):
      // its own catalog, never a landed one's.
      const overlay = parsed.searchParams.get('overlay');
      // An overlay gone from xcube, as 93a5f7a73b answers it.
      if (overlay !== null && parsed.pathname.includes(`/expired_`))
        return json(
          {
            error: `No overlay "${overlay}": it expired, was dropped, or never was`,
            code: 'unknown_overlay',
          },
          404,
        );
      if (overlay !== null && parsed.pathname.endsWith('/schemas'))
        return json({ schemas: [{ name: `own_${overlay.slice(-6)}` }] });
      if (parsed.pathname.endsWith('/schemas'))
        return json({ schemas: [{ name: 'public' }, { name: 'sales' }] });
      if (parsed.pathname.endsWith('/tables'))
        return json({
          tables: [{ schema: 'sales', name: 'orders', type: 'table', rawType: 'BASE TABLE' }],
          total: 1,
        });
      return json({
        tables: [
          {
            schema: 'sales',
            name: 'orders',
            columns: [
              { name: 'id', rawType: 'integer', type: 'number', primaryKey: true, foreignKeys: [] },
              {
                name: 'status',
                rawType: 'text',
                type: 'string',
                primaryKey: false,
                foreignKeys: [],
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
  });
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://xcube.test/cubejs-api',
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fsub', parentId: 'fsales' },
  ]);
  // A head, which a workspace's overlay is pushed over (T347).
  stub.holdItems(MODEL, []);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
      security: 'oidc',
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
    },
    cube,
    introspectionRetryMs: 1,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: sources(),
    sqlRunnerSwitches: switches(),
    xcube: admin,
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      model: MODEL,
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [folders.sales, 'fsales'],
        [folders.sub, 'fsub'],
      ]),
      parents: new Map([
        ['root', null],
        [folders.sales, 'root'],
        [folders.sub, folders.sales],
      ]),
    }),
  });
  for (const who of ['super', 'writer', 'reader', 'manager'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await removeProjectFolders();
  const made = await getDb()
    .selectFrom('data_sources')
    .select('id')
    .where('name', 'like', `%${MARK}%`)
    .execute();
  for (const { id } of made) {
    await switches().off(id);
    await sources().remove(id);
  }
  await docs().remove('folder', folders.sub);
  await docs().remove('folder', folders.sales);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const browse = (who: string, what: 'schemas' | 'tables' | 'columns', query = '') =>
  what === 'columns'
    ? as(who, {
        method: 'POST',
        url: `/api/data-sources/${source}/catalog/columns`,
        payload: { tables: [{ schema: 'sales', table: 'orders' }] },
      })
    : as(who, { method: 'GET', url: `/api/data-sources/${source}/catalog/${what}${query}` });

describe('the schema browser of a data source (T539, AC-386)', () => {
  it('is for nobody while its runner is off, and nothing reaches Cube', async () => {
    const before = asked.length;
    expect((await browse('writer', 'schemas')).statusCode).toBe(403);
    expect(asked).toHaveLength(before);
  });

  it('lists its schemas, a schema’s tables and a table’s columns with their types, as introspection does, to those who may run SQL', async () => {
    await switches().on(source, { key: 'super', name: 'Super' });
    for (const who of ['super', 'writer']) {
      const schemas = await browse(who, 'schemas');
      expect(schemas.statusCode, schemas.body).toBe(200);
      expect(schemas.json()).toEqual({ schemas: [{ name: 'public' }, { name: 'sales' }] });
    }
    // An overlay the browser names isn't passed on: only wechart names one (T547).
    const before = asked.length;
    const named = await browse('writer', 'tables', '?schema=sales&overlay=ws-theirs');
    expect(named.statusCode, named.body).toBe(200);
    expect(asked.slice(before).map((each) => each.path)).toEqual([
      `${BASE}/warehouse_${MARK}/tables?schema=sales`,
    ]);
    const tables = await browse('writer', 'tables', '?schema=sales');
    expect(tables.statusCode, tables.body).toBe(200);
    expect(tables.json()).toEqual({
      tables: [{ schema: 'sales', name: 'orders', type: 'table', rawType: 'BASE TABLE' }],
      total: 1,
    });
    const columns = await browse('writer', 'columns');
    expect(columns.statusCode, columns.body).toBe(200);
    expect(
      columns
        .json<{ tables: { columns: { name: string; rawType: string }[] }[] }>()
        .tables[0]!.columns.map((column) => [column.name, column.rawType]),
    ).toEqual([
      ['id', 'integer'],
      ['status', 'text'],
    ]);
    // Asked of Cube by its connection's name, its query passed on.
    expect(asked.map((each) => each.path)).toEqual(
      expect.arrayContaining([
        `${BASE}/warehouse_${MARK}/schemas`,
        `${BASE}/warehouse_${MARK}/tables?schema=sales`,
        `${BASE}/warehouse_${MARK}/columns`,
      ]),
    );
  });

  it('is refused to a member below its folder, and to a read-only one, as running SQL is, and nothing reaches Cube', async () => {
    const before = asked.length;
    expect((await browse('manager', 'schemas')).statusCode).toBe(403);
    expect((await browse('reader', 'schemas')).statusCode).toBe(404);
    expect((await browse('manager', 'columns')).statusCode).toBe(403);
    expect(asked).toHaveLength(before);
  });

  it('reads the columns asked for only once the user may browse, naming each table with its schema', async () => {
    const before = asked.length;
    const bodyOf = (who: string, payload: unknown) =>
      as(who, {
        method: 'POST',
        url: `/api/data-sources/${source}/catalog/columns`,
        payload: payload as Record<string, unknown>,
      });
    expect((await bodyOf('reader', {})).statusCode).toBe(404);
    for (const payload of [{}, { tables: [{ table: 'orders' }] }]) {
      const refused = await bodyOf('writer', payload);
      expect(refused.statusCode).toBe(400);
      expect(refused.json<{ error: string }>().error).toBe(
        'Name the tables as a list, each with its schema and table.',
      );
    }
    expect(asked).toHaveLength(before);
  });

  it('says so of a data source whose folder isn’t in xcube yet, asking Cube nothing', async () => {
    const unplaced = await docs().create({
      kind: 'folder',
      id: randomUUID(),
      body: {
        owner: 'admin',
        title: `unplaced ${MARK}`,
        folderId: 'root',
        access: { readOnly: null, readWrite: ['sales-rw'] },
      },
    });
    const there = await sources().create({
      folderId: unplaced.id,
      name: `unplaced_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('unplaced') },
    });
    await switches().on(there.id, { key: 'super', name: 'Super' });
    try {
      const before = asked.length;
      const answer = await as('writer', {
        method: 'GET',
        url: `/api/data-sources/${there.id}/catalog/schemas`,
      });
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json<{ error: string }>().error).toBe(
        'This data source’s folder isn’t in xcube yet, so its tables can’t be read.',
      );
      expect(asked).toHaveLength(before);
    } finally {
      await switches().off(there.id);
      await sources().remove(there.id);
      await docs().remove('folder', unplaced.id);
    }
  });
});

/** A shared data source of /Sales, and `writer`'s copy of it in their workspace (T346). */
async function copied(tag: string) {
  const original = await sources().create({
    folderId: folders.sales,
    name: `${tag}_${MARK}`,
    driver: 'postgres',
    authMethod: 'password',
    fields: FIELDS,
    sealed: { password: sealed(tag) },
  });
  const copy = await as('writer', {
    method: 'POST',
    url: `/api/data-sources/${original.id}/copy`,
    payload: { timeZone: TEST_TIME_ZONE },
  });
  expect(copy.statusCode, copy.body).toBe(201);
  return { original, copy: copy.json<{ id: string; folderId: string }>() };
}
const schemasOf = (who: string, id: string) =>
  as(who, { method: 'GET', url: `/api/data-sources/${id}/catalog/schemas` });
/** The workspace a folder is in: its top folder below the root. */
const workspaceOf = async (folderId: string): Promise<string> => {
  let at = folderId;
  for (let hops = 0; hops < 10; hops += 1) {
    const folder = await docs().get('folder', at);
    const parent = folder?.body['folderId'];
    if (typeof parent !== 'string' || parent === 'root' || parent === '') return at;
    at = parent;
  }
  return at;
};

/**
 * T547 (AC-386; R59, AC-386 kept whole): a workspace data source is browsed
 * as its SQL runs, in its workspace's overlay, through xcube's introspection
 * of an overlay's own data source (`?overlay=`, xcube 93a5f7a73b; research
 * xcube-93a5f7a73b.md): a copy, a copy pointed elsewhere, and one made new
 * there, each its own catalog, never a landed one's.
 */
describe('the schema browser in My workspace (T539, T547, AC-386, AC-383)', () => {
  it('lists an unchanged copy’s catalog to its owner, read in their workspace’s overlay', async () => {
    const { copy } = await copied('same');
    const overlay = workspaceOverlayIdOf(await workspaceOf(copy.folderId));
    const before = asked.length;
    const schemas = await schemasOf('writer', copy.id);
    expect(schemas.statusCode, schemas.body).toBe(200);
    expect(asked.slice(before).map((each) => each.path)).toEqual([
      `${BASE}/same_${MARK}/schemas?overlay=${overlay}`,
    ]);
    expect((await schemasOf('super', copy.id)).statusCode).toBe(404);
  });

  it('lists its own catalog for a copy pointed elsewhere, and one whose secret was entered again, never its original’s', async () => {
    const moved = (await copied('moved')).copy;
    // Another host: no switch needed (a new secret is), and not its original's catalog.
    await sources().update(moved.id, {
      fields: { ...FIELDS, host: 'sales-db-2' },
      sealed: { password: sealed('moved-again') },
    });
    const resealed = (await copied('resealed')).copy;
    await sources().update(resealed.id, { sealed: { password: sealed('resealed-again') } });
    const overlay = workspaceOverlayIdOf(await workspaceOf(moved.folderId));
    for (const [id, name] of [
      [moved.id, `moved_${MARK}`],
      [resealed.id, `resealed_${MARK}`],
    ] as const) {
      const before = asked.length;
      const schemas = await schemasOf('writer', id);
      expect(schemas.statusCode, schemas.body).toBe(200);
      expect(schemas.json()).toEqual({ schemas: [{ name: `own_${overlay.slice(-6)}` }] });
      expect(asked.slice(before).map((each) => each.path)).toEqual([
        `${BASE}/${name}/schemas?overlay=${overlay}`,
      ]);
    }
  });

  it('lists the tables and columns of one made new there, under its target, in its overlay', async () => {
    const { copy } = await copied('beside');
    const made = await sources().create({
      folderId: copy.folderId,
      targetFolderId: folders.sales,
      name: `fresh_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('fresh') },
    });
    const overlay = workspaceOverlayIdOf(await workspaceOf(copy.folderId));
    const before = asked.length;
    const tables = await as('writer', {
      method: 'GET',
      url: `/api/data-sources/${made.id}/catalog/tables?schema=sales`,
    });
    expect(tables.statusCode, tables.body).toBe(200);
    const columns = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${made.id}/catalog/columns`,
      payload: { tables: [{ schema: 'sales', table: 'orders' }] },
    });
    expect(columns.statusCode, columns.body).toBe(200);
    expect(asked.slice(before).map((each) => [each.method, each.path, each.body])).toEqual([
      // wechart's overlay first: a padded query can't push it past a parser's
      // limit on parameters (T547's review).
      ['GET', `${BASE}/fresh_${MARK}/tables?overlay=${overlay}&schema=sales`, undefined],
      [
        'POST',
        `${BASE}/fresh_${MARK}/columns?overlay=${overlay}`,
        { tables: [{ schema: 'sales', table: 'orders' }] },
      ],
    ]);
  });

  it('names its own overlay first, whatever the browser pads its query with, and none of the browser’s (T547’s review)', async () => {
    const { copy } = await copied('padded');
    const overlay = workspaceOverlayIdOf(await workspaceOf(copy.folderId));
    const before = asked.length;
    const padding = Array.from({ length: 1000 }, () => 'schema=sales').join('&');
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/data-sources/${copy.id}/catalog/tables?${padding}&=&%5Boverlay%5D=ws-theirs`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const [path] = asked.slice(before).map((each) => each.path);
    expect(path?.startsWith(`${BASE}/padded_${MARK}/tables?overlay=${overlay}&schema=sales&`)).toBe(
      true,
    );
    expect(path).not.toContain('ws-theirs');
    expect(path).not.toContain('&=');
  });

  it('says xcube no longer holds the workspace’s preview, in wechart’s words, where xcube finds no overlay (T547’s review)', async () => {
    const { copy } = await copied('expired');
    const before = asked.length;
    const answer = await schemasOf('writer', copy.id);
    expect(answer.statusCode, answer.body).toBe(404);
    expect(answer.json()).toEqual({
      error: 'xcube no longer holds your workspace’s preview. Open the SQL tab again.',
    });
    expect(asked.slice(before)).toHaveLength(1);
  });

  it('asks where one made new there is to go before reading it, as its SQL does, asking Cube nothing', async () => {
    const { copy } = await copied('aside');
    const made = await sources().create({
      folderId: copy.folderId,
      name: `untargeted_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('untargeted') },
    });
    const before = asked.length;
    const refused = await schemasOf('writer', made.id);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json<{ error: string }>().error).toBe(
      'Choose the folder it is to go to first: its tables are read in your workspace’s preview, which places it there.',
    );
    expect(asked).toHaveLength(before);
  });
});
