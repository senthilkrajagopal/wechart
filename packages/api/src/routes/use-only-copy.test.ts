import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { workspaceOverlayIdOf } from '../xcube/overlays';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T543 (AC-283; the user's answer "Yes, use-only copy", R53): a model of a
 * folder the user may only read is copied into their workspace to use, going
 * to a folder they may write, as a new model there. It is marked so, and is
 * never proposed back to the folder it came from. Its previews use it.
 *
 * `writer` (`sales-rw`) writes /Viewing/Sales and /Ops, and so reads every
 * kind of item in /Viewing (AC-262), which is `managers`' to write; /Ops has
 * a cube of the copied one's name already. `reader` (`sales-ro`) reads
 * /Viewing's dashboards alone (AC-263), its models not at all. Against the
 * suite's database, the stub xcube and a stub Cube that records each query.
 */
const MARK = `uo${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `uoc-${MARK}`;
const REGIONS = `${MARK}_regions`;
const PATH = `cubes/${REGIONS}.yml`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n      - name: count\n        type: count\n${extra}`;

const asked: { query: Record<string, unknown>; overlay: unknown }[] = [];
let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = {
  viewing: '',
  sales: '',
  ops: '',
  glimpsed: '',
  original: '',
  project: '',
  workspace: '',
};

beforeAll(async () => {
  cubeServer = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}',
    ) as Record<string, unknown>;
    let raw = '';
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    request.on('end', () => {
      const overlay = claims['wechartOverlay'];
      const query = raw === '' ? {} : (JSON.parse(raw) as { query: Record<string, unknown> }).query;
      asked.push({ query, overlay });
      response.writeHead(200, {
        'content-type': 'application/json',
        ...(typeof overlay === 'string'
          ? {
              'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}`,
            }
          : {}),
      });
      response.end(JSON.stringify({ data: [] }));
    });
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  for (const [key, access] of [
    ['viewing', { readOnly: ['sales-ro'], readWrite: ['managers'] }],
    ['sales', { readOnly: null, readWrite: ['sales-rw'] }],
    ['ops', { readOnly: null, readWrite: ['sales-rw'] }],
    // Its dashboards alone, to the writer: read-only there, writing nothing below.
    ['glimpsed', { readOnly: ['sales-rw'], readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: key === 'sales' ? ids.viewing : 'root',
        access,
      },
    });
    ids[key] = id;
  }
  await files().write([
    { folderId: ids.viewing, path: PATH, content: cube(REGIONS) },
    { folderId: ids.ops, path: PATH, content: cube(REGIONS, '    description: Ops’ own\n') },
    { folderId: ids.glimpsed, path: PATH, content: cube(REGIONS) },
  ]);
  ids.original = (await files().inFolders([ids.viewing]))[0]!.id;
  const xids = new Map([
    ['root', 'froot'],
    [ids.viewing, 'fviewing'],
    [ids.sales, 'fsales'],
    [ids.ops, 'fops'],
    [ids.glimpsed, 'fglimpsed'],
  ]);
  stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl,
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fviewing', parentId: 'froot' },
    { id: 'fsales', parentId: 'fviewing' },
    { id: 'fops', parentId: 'froot' },
    { id: 'fglimpsed', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fviewing', name: REGIONS, kind: 'cube', yaml: cube(REGIONS) },
    { folderId: 'fops', name: REGIONS, kind: 'cube', yaml: cube(REGIONS) },
  ]);
  app = buildServer({
    config: {
      cubeApiUrl,
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
    modelFiles: files(),
    dataSources: dataSourceStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map<string, string | null>([
        ['root', null],
        [ids.viewing, 'root'],
        [ids.sales, ids.viewing],
        [ids.ops, 'root'],
        [ids.glimpsed, 'root'],
      ]),
    }),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const folders = [ids.viewing, ids.sales, ids.ops, ids.glimpsed];
  await getDb().deleteFrom('proposals').where('target_folder_id', 'in', folders).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .where('kind', '!=', 'folder')
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const copy = (target?: string, who = 'writer') =>
  as(who, {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: {
      kind: 'model',
      folderId: ids.viewing,
      path: PATH,
      timeZone: TEST_TIME_ZONE,
      ...(target === undefined ? {} : { targetFolderId: target }),
    },
  });

describe('a model of a folder one may only read, copied to use (T543, AC-283)', () => {
  it('asks for a folder they may write, never the one it came from, nor one with a cube of its name', async () => {
    const none = await copy();
    expect(none.statusCode, none.body).toBe(400);
    expect(none.json<{ error: string }>().error).toBe(
      'You may only read the folder this model is in, so a copy of it can’t go back there. Name a folder you may write for it to go to, as a new model.',
    );
    expect((await copy(ids.viewing)).statusCode).toBe(403);
    // One who sees only its dashboards sees no model to copy (AC-263): one
    // with no workspace is told so first, and one with a workspace finds none.
    expect((await copy(undefined, 'reader')).statusCode).toBe(403);
    const glimpsed = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: {
        kind: 'model',
        folderId: ids.glimpsed,
        path: PATH,
        timeZone: TEST_TIME_ZONE,
        targetFolderId: ids.sales,
      },
    });
    expect(glimpsed.statusCode, glimpsed.body).toBe(404);
    const taken = await copy(ids.ops);
    expect(taken.statusCode, taken.body).toBe(409);
    expect(taken.json<{ error: string }>().error).toBe(
      `ops ${MARK} has a cube or view named “${REGIONS}” already. A use-only copy goes to its folder as a new model: choose another folder.`,
    );
  });

  it('is copied in, going to that folder, marked for use only, and its previews use it', async () => {
    const copied = await copy(ids.sales);
    expect(copied.statusCode, copied.body).toBe(201);
    ids.project = copied.json<{ folderId: string }>().folderId;
    ids.workspace = String((await docs().get('folder', ids.project))!.body['folderId']);
    const [file] = await files().inFolders([ids.project]);
    expect(file).toEqual(
      expect.objectContaining({
        path: PATH,
        content: cube(REGIONS),
        targetFolderId: ids.sales,
        origin: { id: ids.original, folderId: ids.viewing, path: PATH, version: 1, useOnly: true },
      }),
    );
    // Placed in its target, as a new model there.
    expect(
      stub
        .overlay(MODEL, workspaceOverlayIdOf(ids.workspace))
        ?.upserts.map(({ folderId, name }) => ({
          folderId,
          name,
        })),
    ).toEqual([{ folderId: 'fsales', name: REGIONS }]);
    // Explore says it is for use only.
    const contents = await as('writer', {
      method: 'GET',
      url: `/api/folders/${ids.project}/contents`,
    });
    expect(contents.json<{ kind: string; origin: unknown }[]>()).toEqual([
      expect.objectContaining({
        kind: 'model',
        origin: expect.objectContaining({ id: ids.original, folderId: ids.viewing, useOnly: true }),
      }),
    ]);

    // A workspace tile on the folder's cube answers from the copy.
    const board = randomUUID();
    await docs().create({
      kind: 'dashboard',
      id: board,
      body: {
        schemaVersion: 1,
        owner: 'admin',
        title: `Board ${MARK}`,
        folderId: ids.project,
        targetFolderId: ids.sales,
      },
    });
    asked.length = 0;
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/load',
      payload: {
        // Its one name, the original's (T709, R71): the copy stands in for it.
        query: { measures: [`${REGIONS}.count`] },
        for: { kind: 'dashboard', id: board },
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${REGIONS}.count`] },
      overlay: workspaceOverlayIdOf(ids.workspace),
    });

    // Copied again, the copy already there opens.
    const again = await copy(ids.sales);
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json()).toEqual({
      kind: 'model',
      created: false,
      folderId: ids.project,
      path: PATH,
    });
  });

  // One name per item (R71 8, T709): the copy holds its original's name,
  // which has landed, so its proposal is refused, saying only that the name
  // is in use: by wechart's own check at propose, before xcube is asked
  // (T705, AC-422, AC-424). T717 refuses it for every folder in its own words.
  it('is not proposed to the folder it goes to: its name is its original’s, landed', async () => {
    const [file] = await files().inFolders([ids.project]);
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file!.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string; names: string[] }>()).toEqual({
      error: `The name “${REGIONS}” is already in use, so it wasn’t proposed.`,
      names: [REGIONS],
    });
    expect(proposed.body).not.toContain(ids.viewing);
    expect(await proposalStore(getDb()).openFor('model', file!.id)).toBeNull();
  });

  it('is never proposed back to the folder it came from, even by one who may write it since', async () => {
    // However it came to go there: no route sends it, so it is set here.
    const [file] = await files().inFolders([ids.project]);
    await getDb()
      .updateTable('model_files')
      .set({ target_folder_id: ids.viewing })
      .where('id', '=', file!.id)
      .execute();
    const folder = (await docs().get('folder', ids.viewing))!;
    await docs().update({
      kind: 'folder',
      id: ids.viewing,
      body: { ...folder.body, access: { readOnly: null, readWrite: ['managers', 'sales-rw'] } },
      expectedVersion: folder.version!,
    });
    try {
      const proposed = await as('writer', {
        method: 'POST',
        url: '/api/proposals',
        payload: { kind: 'model', id: file!.id },
      });
      expect(proposed.statusCode, proposed.body).toBe(409);
      expect(proposed.json<{ error: string }>().error).toBe(
        `“${PATH}” is a copy for use only of a model in a folder you could only read: it can’t be proposed back there.`,
      );
    } finally {
      await getDb()
        .updateTable('model_files')
        .set({ target_folder_id: ids.sales })
        .where('id', '=', file!.id)
        .execute();
      const now = (await docs().get('folder', ids.viewing))!;
      await docs().update({
        kind: 'folder',
        id: ids.viewing,
        body: { ...now.body, access: folder.body['access'] },
        expectedVersion: now.version!,
      });
    }
  });
});
