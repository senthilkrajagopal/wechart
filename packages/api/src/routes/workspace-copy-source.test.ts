import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T346 (AC-280, AC-298): a data source copied into the user's workspace
 * keeps its connection settings and its credentials, still sealed: the
 * original's envelopes, byte for byte, which wechart never opens. It keeps
 * its original's name, targets its original's folder, and names its origin,
 * so the workspace's overlay (T347) brings it in the original's place. Two
 * copies of the same name, from two folders, live side by side. A second copy
 * opens the first. Its type never changes (AC-161).
 *
 * `writer` (`sales-rw`) writes /Sales and /Ops; `reader` (`sales-ro`) only
 * reads /Sales and has no workspace; /Hidden is `managers`' alone.
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

const MARK = `cps${randomUUID().slice(0, 8)}`;
/** The server's clock (T523): 09:00 UTC on a day of a year of this run's own. */
const YEAR = 2100 + Math.floor(Math.random() * 800);
let clock = new Date(Date.UTC(YEAR, 8, 30, 9, 0, 30));
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const folders = { sales: '', ops: '', hidden: '' };
const held = { sales: '', ops: '', hidden: '', emea: '' };
const cookies: Record<string, string> = {};
const asked: { sealed: Record<string, SealedV1> }[] = [];
let app: FastifyInstance;

beforeAll(async () => {
  for (const [key, access] of [
    ['sales', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['ops', { readOnly: null, readWrite: ['sales-rw'] }],
    ['hidden', { readOnly: null, readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: { owner: 'admin', title: `${key} ${MARK}`, folderId: 'root', access },
    });
    folders[key] = id;
    held[key] = (
      await sources().create({
        folderId: id,
        name: 'warehouse',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: `${key}-db`, port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealed(key) },
      })
    ).id;
  }
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    connectionTests: connectionTestStore(getDb()),
    now: () => clock,
    connectionTest: async (body) => {
      asked.push(body as never);
      return { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] } as never;
    },
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // The copies first: they are in writer's workspace, named as their originals.
  await getDb()
    .deleteFrom('data_sources')
    .where('target_folder_id', 'in', Object.values(folders).filter(Boolean))
    .execute();
  for (const id of Object.values(held)) if (id !== '') await sources().remove(id);
  // The project folders they went into, described by what they copied (T523).
  await getDb()
    .deleteFrom('documents')
    .where('kind', '=', 'folder')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('description'), 'like', `%${MARK}%`))
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const copy = (who: string, id: string, payload: Record<string, unknown> = { timeZone: 'UTC' }) =>
  as(who, { method: 'POST', url: `/api/data-sources/${id}/copy`, payload });
/** A copy's folder: the project folder it went into, in the workspace (T523). */
const projectOf = async (folderId: string) => (await docs().get('folder', folderId))!;
/** The folders a description describes, by id. */
const describing = async (description: string) =>
  (
    await getDb()
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'folder')
      .where(({ eb, ref }) => eb(ref('body', '->>').key('description'), '=', description))
      .execute()
  )
    .map((row) => row.id)
    .sort();

describe('a data source copied into the workspace (T346, AC-280, AC-298)', () => {
  it('keeps its settings, its name and its sealed credentials byte for byte, targets its folder, and names its origin', async () => {
    const original = (await sources().get(held.sales))!;
    const answer = await copy('writer', held.sales);
    expect(answer.statusCode, answer.body).toBe(201);
    const id = answer.json<{ id: string }>().id;
    expect(id).not.toBe(held.sales);

    const copied = (await sources().get(id))!;
    // In the workspace, in the project folder it made (T523, AC-368).
    expect((await projectOf(copied.folderId)).body['folderId']).toMatch(/^ws:/);
    expect([copied.name, copied.driver, copied.authMethod, copied.fields]).toEqual([
      'warehouse',
      'postgres',
      'password',
      original.fields,
    ]);
    expect(copied.targetFolderId).toBe(folders.sales);
    expect(copied.origin).toEqual({
      id: held.sales,
      version: original.version,
      folderId: folders.sales,
    });
    // The envelopes, as sealed: wechart holds no key that opens them.
    expect((await sources().sealedOf(id)).sealed).toEqual(
      (await sources().sealedOf(held.sales)).sealed,
    );
    // No answer holds them.
    for (const part of [sealed('sales').ct, sealed('sales').enc])
      expect(answer.body).not.toContain(part);
    expect(answer.json()).toMatchObject({ secrets: { password: { stored: true } }, created: true });
  });

  it('is tested by xcube with the very envelopes the original is', async () => {
    const id = (await copy('writer', held.sales)).json<{ id: string }>().id;
    asked.length = 0;
    for (const each of [held.sales, id])
      expect(
        (await as('writer', { method: 'POST', url: `/api/data-sources/${each}/test`, payload: {} }))
          .statusCode,
      ).toBe(200);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toEqual(asked[0]);
  });

  it('opens the copy already there, and keeps a copy of each folder’s data source of one name side by side', async () => {
    const first = (await copy('writer', held.sales)).json<{ id: string }>().id;
    const again = await copy('writer', held.sales);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ id: first, created: false });
    expect(again.body).not.toContain(sealed('sales').ct);

    const fromOps = await copy('writer', held.ops);
    expect(fromOps.statusCode, fromOps.body).toBe(201);
    const opsCopy = (await sources().get(fromOps.json<{ id: string }>().id))!;
    expect([opsCopy.name, opsCopy.targetFolderId]).toEqual(['warehouse', folders.ops]);
  });

  it('copies only what its copier may propose back, and never changes its type', async () => {
    // reader reads /Sales, and has no workspace (AC-277).
    expect((await copy('reader', held.sales)).statusCode).toBe(403);
    expect((await copy('writer', held.hidden)).statusCode).toBe(404);
    const id = (await copy('writer', held.sales)).json<{ id: string }>().id;
    // In a workspace already: it is changed there.
    expect((await copy('writer', id)).statusCode).toBe(400);
    const retyped = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload: { driver: 'mysql' },
    });
    expect(retyped.statusCode).toBe(409);
    expect(retyped.json<{ error: string }>().error).toBe(
      'A data source’s type never changes: make a new data source for MySQL.',
    );
  });

  it('keeps its original’s name, which it stands in for (T346’s review)', async () => {
    const id = (await copy('writer', held.sales)).json<{ id: string }>().id;
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload: { name: 'warehouse_mine' },
    });
    expect(renamed.statusCode).toBe(409);
    expect(renamed.json()).toEqual({
      error:
        'A copy keeps its original’s name, “warehouse”, which it stands in for in your workspace. Make a new data source for another name.',
    });
    expect((await sources().get(id))!.name).toBe('warehouse');
  });

  it('makes one copy however close together the copies come', async () => {
    await getDb().deleteFrom('data_sources').where('target_folder_id', '=', folders.ops).execute();
    const before = await describing(`Editing warehouse from ops ${MARK}`);
    const answers = await Promise.all([1, 2, 3].map(() => copy('writer', held.ops)));
    const ids = new Set(answers.map((answer) => answer.json<{ id: string }>().id));
    expect(ids.size).toBe(1);
    expect(answers.every((answer) => [200, 201].includes(answer.statusCode))).toBe(true);
    // In one project folder: none made for the copies that found it (T523).
    const copied = (await sources().get([...ids][0]!))!;
    expect(await describing(`Editing warehouse from ops ${MARK}`)).toEqual(
      [...before, copied.folderId].sort(),
    );
  });

  it('has no workspaces to copy into with sign-in off', async () => {
    const open = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      dataSources: sources(),
    });
    try {
      const refused = await open.inject({
        method: 'POST',
        url: `/api/data-sources/${held.sales}/copy`,
      });
      expect(refused.statusCode).toBe(404);
      expect(refused.json()).toEqual({ error: 'Workspaces need sign-in.' });
    } finally {
      await open.close();
    }
  });
});

/**
 * T523 (AC-368; design 14, state G4): a data source's own "Edit in my
 * workspace" copies it into a project folder of its own, named for the
 * minute in the user's time zone and described by it; copied with a
 * dashboard, it goes into the folder the dashboard's copy made.
 */
describe('a data source’s copy in its project folder (T523, AC-368, AC-369)', () => {
  const emea = { folder: '', source: '' };

  beforeAll(async () => {
    emea.folder = randomUUID();
    made.push({ kind: 'folder', id: emea.folder });
    await docs().create({
      kind: 'folder',
      id: emea.folder,
      body: { owner: 'admin', title: `EMEA ${MARK}`, folderId: folders.sales },
    });
    emea.source = (
      await sources().create({
        folderId: emea.folder,
        name: 'emea_replica',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'emea-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealed('emea') },
      })
    ).id;
    held.emea = emea.source;
  });

  afterAll(async () => {
    await getDb().deleteFrom('data_sources').where('target_folder_id', '=', emea.folder).execute();
  });

  it('copies one alone into a new folder, named for the minute in the user’s time zone and described by it', async () => {
    clock = new Date(Date.UTC(YEAR, 8, 30, 9, 1, 30));
    const answer = await copy('writer', emea.source, { timeZone: 'Asia/Kolkata' });
    expect(answer.statusCode, answer.body).toBe(201);
    const copied = (await sources().get(answer.json<{ id: string }>().id))!;
    const project = await projectOf(copied.folderId);
    expect(project.body['folderId']).toMatch(/^ws:/);
    // 09:01 UTC is 14:31 in Kolkata.
    expect(project.body['title']).toBe(`project-${String(YEAR)}-09-30-1431`);
    expect(project.body['description']).toBe(
      `Editing emea_replica from sales ${MARK} / EMEA ${MARK}`,
    );
    await getDb().deleteFrom('data_sources').where('id', '=', copied.id).execute();
  });

  it('goes into the folder its dashboard’s copy made, when it is named, making none', async () => {
    // A dashboard of EMEA's, copied as the dialog copies it: the dashboard first.
    const board = randomUUID();
    made.push({ kind: 'dashboard', id: board });
    await docs().create({
      kind: 'dashboard',
      id: board,
      body: {
        owner: 'admin',
        schemaVersion: 1,
        title: `EMEA board ${MARK}`,
        folderId: emea.folder,
        pages: [],
      },
    });
    const boardCopy = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: board, timeZone: 'UTC' },
    });
    expect(boardCopy.statusCode, boardCopy.body).toBe(201);
    const { id: copyId, folderId: into } = boardCopy.json<{ id: string; folderId: string }>();
    made.push({ kind: 'dashboard', id: copyId });
    const before = await describing(`Editing emea_replica from sales ${MARK} / EMEA ${MARK}`);
    const answer = await copy('writer', emea.source, { into });
    expect(answer.statusCode, answer.body).toBe(201);
    // Beside the dashboard's copy, in the one folder its description names.
    expect((await sources().get(answer.json<{ id: string }>().id))!.folderId).toBe(into);
    expect((await docs().get('dashboard', copyId))!.body['folderId']).toBe(into);
    expect((await projectOf(into)).body['description']).toBe(
      `Editing EMEA board ${MARK} from sales ${MARK} / EMEA ${MARK}`,
    );
    expect(await describing(`Editing emea_replica from sales ${MARK} / EMEA ${MARK}`)).toEqual(
      before,
    );
    await getDb().deleteFrom('data_sources').where('target_folder_id', '=', emea.folder).execute();

    // Named `mine`, as an answer names the root: My workspace's root (T523's review).
    const toRoot = await copy('writer', emea.source, { into: 'mine' });
    expect(toRoot.statusCode, toRoot.body).toBe(201);
    expect((await sources().get(toRoot.json<{ id: string }>().id))!.folderId).toMatch(/^ws:/);
    await getDb().deleteFrom('data_sources').where('target_folder_id', '=', emea.folder).execute();
  });

  it('goes into no folder outside the user’s own workspace, and needs a time zone where it makes one', async () => {
    for (const into of [folders.sales, randomUUID(), 'mine-not', 7]) {
      const refused = await copy('writer', emea.source, { into });
      expect(refused.statusCode).toBe(404);
      expect(refused.json()).toEqual({ error: 'There’s no such folder in your workspace.' });
    }
    for (const payload of [{}, { timeZone: 'Mars/Olympus_Mons' }]) {
      const refused = await copy('writer', emea.source, payload);
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toEqual({
        error: 'Say the time zone its folder is named in: { timeZone }, as the browser names it.',
      });
    }
    expect(
      await getDb()
        .selectFrom('data_sources')
        .select('id')
        .where('target_folder_id', '=', emea.folder)
        .execute(),
    ).toEqual([]);
  });
});
