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
import { CUBE_STORE_TARGET, sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { xcubeSqlRunner } from '../xcube/sql-runner';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T798 (AC-447, AC-373, AC-383, AC-384): `GET /api/sql/sources`, the SQL
 * runner workspace's data source picker. Each user gets the data sources they
 * may run SQL on, and the off ones they may see off:
 *
 * - a read-write member, the ones switched on in their own folders and their
 *   own workspace's, plus the off ones of their own folders (AC-373, AC-383);
 * - a Super-Admin, every shared folder's, and Cube Store while it is on
 *   (AC-384);
 * - nobody, a source of a folder they see only as an ancestor's, nor another
 *   user's workspace source (AC-373, AC-447).
 *
 * Against the stub xcube. `writer` (`sales-rw`) writes /Sales; `reader`
 * (`sales-ro`) reads it; `manager` writes /Sales/Sub, below it, and sees
 * /Sales only as its ancestor; `super` is a Super-Admin.
 */
const MARK = `sqlsrc${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlsrc-${MARK}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const FIELDS = { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false };

const folders = { sales: '', sub: '' };
const xids = new Map<string, string>([['root', 'froot']]);
const ids = { on: '', off: '', subOn: '', writerCopy: '', managerCopy: '' };
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

interface Row {
  readonly id: string;
  readonly name: string;
  readonly driver: string | null;
  readonly cubeStore: boolean;
  readonly folderId: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly inWorkspace: boolean;
  readonly runner: 'on' | 'off' | 'no-switch';
}

/** What `who`'s picker lists. */
async function listFor(who: string): Promise<Row[]> {
  const answer = await as(who, { method: 'GET', url: '/api/sql/sources' });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<Row[]>();
}
/** This file's rows only, by name and state: the database holds others' too. */
const ours = (rows: readonly Row[]) =>
  rows
    .filter((row) => row.name.endsWith(MARK))
    .map((row) => `${row.name.replace(`_${MARK}`, '')}:${row.runner}`)
    .sort();

const create = async (folderId: string, tag: string) =>
  (
    await sources().create({
      folderId,
      name: `${tag}_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed(tag) },
    })
  ).id;

/** `who`'s copy of a shared data source, in their workspace (T346). */
async function copyOf(who: string, original: string) {
  const copied = await as(who, {
    method: 'POST',
    url: `/api/data-sources/${original}/copy`,
    payload: { timeZone: TEST_TIME_ZONE },
  });
  expect(copied.statusCode, copied.body).toBe(201);
  return copied.json<{ id: string }>().id;
}

const turnOn = async (id: string) => {
  const on = await as('super', {
    method: 'PUT',
    url: `/api/data-sources/${id}/sql-runner`,
    payload: { on: true, readOnlyConfirmed: true },
  });
  expect(on.statusCode, on.body).toBe(200);
};

beforeAll(async () => {
  await switches().off(CUBE_STORE_TARGET);
  for (const [key, parent, access] of [
    ['sales', 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['sub', 'sales', { readOnly: null, readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    folders[key] = id;
    xids.set(id, `f${key}`);
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
  ids.on = await create(folders.sales, 'on');
  ids.off = await create(folders.sales, 'off');
  ids.subOn = await create(folders.sub, 'subon');

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
    xcube: admin,
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      model: MODEL,
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    folders: async () => ({
      ids: xids,
      parents: new Map([
        ['root', null],
        [folders.sales, 'root'],
        [folders.sub, folders.sales],
      ]),
    }),
  });
  for (const who of ['super', 'writer', 'reader', 'manager'])
    cookies[who] = await signIn(app, USERS[who]!);
  await turnOn(ids.on);
  await turnOn(ids.subOn);
  // Unchanged copies, which their owners run with no switch (AC-383).
  ids.writerCopy = await copyOf('writer', ids.on);
  ids.managerCopy = await copyOf('manager', ids.subOn);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await switches().off(CUBE_STORE_TARGET);
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

describe('the SQL runner’s data source picker (T798, AC-447)', () => {
  it('gives a read-write member their folder’s on and off sources and their own workspace’s, My workspace first', async () => {
    const rows = await listFor('writer');

    // Their own copy is named as its original is; its state says it needs no
    // switch. /Sales/Sub's is theirs too: a grant reaches down whole. The
    // manager's copy of it ("subon:no-switch") is not.
    expect(ours(rows)).toEqual(['off:off', 'on:no-switch', 'on:on', 'subon:on']);
    const mine = rows.find((row) => row.id === ids.writerCopy)!;
    expect(mine).toMatchObject({ inWorkspace: true, runner: 'no-switch', driver: 'postgres' });
    const shared = rows.find((row) => row.id === ids.on)!;
    expect(shared).toMatchObject({
      inWorkspace: false,
      runner: 'on',
      driver: 'postgres',
      cubeStore: false,
      folderId: folders.sales,
      folderPath: [{ id: folders.sales, title: `sales ${MARK}` }],
    });
    expect(rows.find((row) => row.id === ids.off)).toMatchObject({ runner: 'off' });
    // My workspace's first.
    const firstShared = rows.findIndex((row) => !row.inWorkspace);
    expect(rows.slice(0, firstShared).every((row) => row.inWorkspace)).toBe(true);
    expect(rows.slice(firstShared).some((row) => row.inWorkspace)).toBe(false);
    // Never another user's workspace source (AC-447).
    expect(rows.some((row) => row.id === ids.managerCopy)).toBe(false);
  });

  it('gives nobody a source of a folder they see only as an ancestor’s (AC-373)', async () => {
    const rows = await listFor('manager');

    expect(ours(rows)).toEqual(['subon:no-switch', 'subon:on']);
    expect(rows.some((row) => row.id === ids.on || row.id === ids.off)).toBe(false);
    expect(rows.some((row) => row.id === ids.writerCopy)).toBe(false);
  });

  it('gives a read-only member nothing of the folder they read', async () => {
    expect(ours(await listFor('reader'))).toEqual([]);
  });

  it('gives a Super-Admin every shared folder’s source, on or off, and no one’s workspace source', async () => {
    const rows = await listFor('super');

    expect(ours(rows)).toEqual(['off:off', 'on:on', 'subon:on']);
  });

  it('lists Cube Store at the root while it is on, to a Super-Admin and to who may run SQL on a shared source (AC-384)', async () => {
    const cubeStoreOf = async (who: string) =>
      (await listFor(who)).filter((row) => row.cubeStore);
    for (const who of ['super', 'writer', 'manager', 'reader'])
      expect(await cubeStoreOf(who), `${who}, while off`).toEqual([]);

    await switches().on(CUBE_STORE_TARGET, { key: 'super', name: 'Super' });
    try {
      for (const who of ['super', 'writer', 'manager']) {
        const rows = await listFor(who);
        const listed = rows.filter((row) => row.cubeStore);
        expect(listed, who).toEqual([
          {
            id: 'cubestore',
            name: 'Cube Store',
            driver: null,
            cubeStore: true,
            folderId: 'root',
            folderPath: [],
            inWorkspace: false,
            runner: 'on',
          },
        ]);
        // Last, after every data source.
        expect(rows.at(-1)?.cubeStore, who).toBe(true);
      }
      expect(await cubeStoreOf('reader')).toEqual([]);

      // A source in My workspace doesn't count (Q7): with /Sales/Sub's
      // switched off, the manager runs SQL on their own copy alone.
      await as('super', {
        method: 'PUT',
        url: `/api/data-sources/${ids.subOn}/sql-runner`,
        payload: { on: false },
      });
      try {
        expect(ours(await listFor('manager'))).toEqual(['subon:no-switch', 'subon:off']);
        expect(await cubeStoreOf('manager')).toEqual([]);
      } finally {
        await turnOn(ids.subOn);
      }
    } finally {
      await switches().off(CUBE_STORE_TARGET);
    }
  });
});
