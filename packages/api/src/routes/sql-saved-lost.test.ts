import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { savedQueryStore } from '../repos/saved-queries';
import { sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { xcubeSqlRunner } from '../xcube/sql-runner';

/**
 * T814 (AC-459): a saved query whose data source its owner can no longer run
 * SQL on comes back with no data source at all, neither its id nor its name,
 * so the workspace opens it with none chosen. Its owner still renames,
 * duplicates and deletes it with Undo, each keeping the source it was saved
 * with (decision T814-1).
 *
 * Against the stub xcube. `writer` (`sales-rw`) writes /Sales.
 */
const MARK = `sqllost${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqllost-${MARK}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const FIELDS = { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false };

let sales = '';
const ids = { on: '', off: '' };
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());
const SUPER = { key: 'test-super', name: 'Test Super' };

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const save = (payload: Record<string, unknown>) =>
  as('writer', { method: 'POST', url: '/api/sql/saved', payload });
const reopen = (id: string) => as('writer', { method: 'GET', url: `/api/sql/saved/${id}` });
const listed = async () =>
  (await as('writer', { method: 'GET', url: '/api/sql/saved' }))
    .json<{ queries: Saved[] }>()
    .queries.filter((each) => each.name.includes(MARK));

interface Saved {
  id: string;
  name: string;
  sourceId: string | null;
  sql: string;
}

const QUERY = { description: '', sql: 'SELECT 1', parameters: [] };

beforeAll(async () => {
  sales = randomUUID();
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  for (const tag of ['on', 'off'] as const)
    ids[tag] = (
      await sources().create({
        folderId: sales,
        name: `${tag}_${MARK}`,
        driver: 'postgres',
        authMethod: 'password',
        fields: FIELDS,
        sealed: { password: sealed(tag) },
      })
    ).id;
  await switches().on(ids.on, SUPER);

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
  ]);
  stub.holdItems(MODEL, []);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://xcube.test/cubejs-api',
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
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: sources(),
    sqlRunnerSwitches: switches(),
    savedQueries: savedQueryStore(getDb()),
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
        [sales, 'fsales'],
      ]),
      parents: new Map([
        ['root', null],
        [sales, 'root'],
      ]),
    }),
  });
  cookies.writer = await signIn(app, USERS.writer!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('saved_queries').where('name', 'like', `%${MARK}%`).execute();
  for (const id of Object.values(ids)) {
    await switches().off(id);
    await sources().remove(id);
  }
  await docs().remove('folder', sales);
  await closeDb();
});

describe('a saved query whose data source its owner can no longer run SQL on (T814, AC-459)', () => {
  it('comes back with its source while they may run SQL on it, and with none, never named, once they may not', async () => {
    const made = await save({ ...QUERY, name: `Kept ${MARK}`, sourceId: ids.on });
    expect(made.statusCode, made.body).toBe(201);
    const { id } = made.json<Saved>();
    expect((await reopen(id)).json<Saved>().sourceId).toBe(ids.on);

    await switches().off(ids.on);
    try {
      const back = await reopen(id);
      expect(back.statusCode, back.body).toBe(200);
      expect(back.json<Saved>()).toMatchObject({ id, sourceId: null, sql: 'SELECT 1' });
      expect(back.body).not.toContain(ids.on);
      expect(back.body).not.toContain(`on_${MARK}`);
      const row = (await listed()).find((each) => each.id === id)!;
      expect(row.sourceId).toBeNull();
      expect(JSON.stringify(row)).not.toContain(ids.on);
    } finally {
      await switches().on(ids.on, SUPER);
    }
    // Back on: its own source again.
    expect((await reopen(id)).json<Saved>().sourceId).toBe(ids.on);
  });

  it('names a source they may run SQL on, for ⌘K’s second line, and only that one (T815, AC-460)', async () => {
    await save({ ...QUERY, name: `Named ${MARK}`, sourceId: ids.on });
    await save({ ...QUERY, name: `Unnamed ${MARK}`, sourceId: ids.off });
    const rows = await listed();
    expect(rows.find((each) => each.name === `Named ${MARK}`)).toMatchObject({
      sourceId: ids.on,
      sourceName: `on_${MARK}`,
    });
    expect(rows.find((each) => each.name === `Unnamed ${MARK}`)).not.toHaveProperty('sourceName');
  });

  it('comes back with none when saved on a source whose runner is off for them', async () => {
    const { id } = (await save({ ...QUERY, name: `Off ${MARK}`, sourceId: ids.off })).json<Saved>();
    const back = await reopen(id);
    expect(back.json<Saved>().sourceId).toBeNull();
    expect(back.body).not.toContain(ids.off);
  });

  it('is renamed, duplicated and deleted with Undo by its owner, each keeping the source it was saved with', async () => {
    const { id } = (await save({ ...QUERY, name: `Lost ${MARK}`, sourceId: ids.off })).json<Saved>();
    const stored = async (savedId: string) =>
      (
        await getDb()
          .selectFrom('saved_queries')
          .select('source_id')
          .where('id', '=', savedId)
          .executeTakeFirstOrThrow()
      ).source_id;

    // Rename: what the browser holds, its source none.
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/sql/saved/${id}`,
      payload: { ...QUERY, name: `Lost renamed ${MARK}`, sourceId: null },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json<Saved>()).toMatchObject({ name: `Lost renamed ${MARK}`, sourceId: null });
    expect(await stored(id)).toBe(ids.off);

    // Duplicate: from the one it copies.
    const copy = await save({ ...QUERY, name: `Lost copy ${MARK}`, sourceId: null, from: id });
    expect(copy.statusCode, copy.body).toBe(201);
    expect(copy.json<Saved>().sourceId).toBeNull();
    expect(await stored(copy.json<Saved>().id)).toBe(ids.off);
    // With no source and none to copy from, it is refused.
    const none = await save({ ...QUERY, name: `Lost none ${MARK}`, sourceId: null });
    expect(none.statusCode).toBe(400);
    expect(none.json<{ error: string }>().error).toBe('Say which data source it runs on: { sourceId }.');

    // Delete answers it as kept, for Undo alone, which brings it back whole.
    const gone = await as('writer', { method: 'DELETE', url: `/api/sql/saved/${id}` });
    expect(gone.statusCode).toBe(200);
    const kept = gone.json<Saved>();
    const back = await save({ ...QUERY, id, name: kept.name, sourceId: kept.sourceId });
    expect(back.statusCode, back.body).toBe(201);
    expect(back.json<Saved>().sourceId).toBeNull();
    expect(await stored(id)).toBe(ids.off);
  });
});
