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
 * T543 (AC-283; the user's answer "Yes, use-only copy", R53), as T717 has it
 * under R71 and R73: a model of a folder the user may only read is copied
 * into their workspace to use, asking for no folder: it is placed where its
 * original is, standing in for it in their previews, marked for use only, and
 * proposed to no folder. A dashboard drawn on its cube is proposed without
 * it, and lands on the landed cube.
 *
 * `writer` (`sales-rw`) writes /Viewing/Sales and /Ops, and so reads every
 * kind of item in /Viewing (AC-262), which is `managers`' to write. `reader`
 * (`sales-ro`) reads /Viewing's dashboards alone (AC-263), its models not at
 * all. Against the suite's database, the stub xcube and a stub Cube that
 * records each query.
 */
const MARK = `uo${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `uoc-${MARK}`;
const REGIONS = `${MARK}_regions`;
const PATH = `cubes/${REGIONS}.yml`;
const GLIMPSED = `${MARK}_glimpsed`;
const GLIMPSED_PATH = `cubes/${GLIMPSED}.yml`;
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
  // One item of a name (R71): /Glimpsed's cube is a name of its own.
  await files().write([
    { folderId: ids.viewing, path: PATH, content: cube(REGIONS) },
    { folderId: ids.glimpsed, path: GLIMPSED_PATH, content: cube(GLIMPSED) },
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
    { folderId: 'fglimpsed', name: GLIMPSED, kind: 'cube', yaml: cube(GLIMPSED) },
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

describe('a model of a folder one may only read, copied to use (T543, T717, AC-283)', () => {
  /**
   * T543 asked for a folder the user writes, where the copy went as a new
   * model; R73 takes that away with the copy's proposal (T717). Still: one
   * with no workspace is told so, and one who sees only a folder's
   * dashboards finds no model to copy there (AC-263).
   */
  it('is refused to one with no workspace, and finds none where only dashboards are seen', async () => {
    expect((await copy(undefined, 'reader')).statusCode).toBe(403);
    const glimpsed = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: {
        kind: 'model',
        folderId: ids.glimpsed,
        path: GLIMPSED_PATH,
        timeZone: TEST_TIME_ZONE,
      },
    });
    expect(glimpsed.statusCode, glimpsed.body).toBe(404);
  });

  it('is copied in asking for no folder, placed where its original is, marked for use only, and its previews use it', async () => {
    const copied = await copy();
    expect(copied.statusCode, copied.body).toBe(201);
    ids.project = copied.json<{ folderId: string }>().folderId;
    ids.workspace = String((await docs().get('folder', ids.project))!.body['folderId']);
    const [file] = await files().inFolders([ids.project]);
    expect(file).toEqual(
      expect.objectContaining({
        path: PATH,
        content: cube(REGIONS),
        targetFolderId: ids.viewing,
        origin: { id: ids.original, folderId: ids.viewing, path: PATH, version: 1, useOnly: true },
      }),
    );
    // Placed where its original is, standing in for it.
    expect(
      stub
        .overlay(MODEL, workspaceOverlayIdOf(ids.workspace))
        ?.upserts.map(({ folderId, name }) => ({
          folderId,
          name,
        })),
    ).toEqual([{ folderId: 'fviewing', name: REGIONS }]);
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

    // Copied again, the copy already there opens; a folder sent is no target of its.
    const again = await copy(ids.sales);
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json()).toEqual({
      kind: 'model',
      created: false,
      folderId: ids.project,
      path: PATH,
    });
  });

  /** The words a use-only copy's proposal is refused in, wherever it would go (T717). */
  const USE_ONLY = `“${PATH}” is a copy for use only, so it can’t be proposed to any folder. To change “${REGIONS}”, send its folder a request from the copy’s page.`;

  // T717 (AC-283): to no folder, in words of its own; nothing proposed.
  it('is proposed to no folder: refused, saying why and what to do instead', async () => {
    const [file] = await files().inFolders([ids.project]);
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file!.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string }>().error).toBe(USE_ONLY);
    expect(proposed.body).not.toContain(ids.viewing);
    expect(await proposalStore(getDb()).openFor('model', file!.id)).toBeNull();
    // Nor to a folder its maker writes, however it came to go there.
    await getDb()
      .updateTable('model_files')
      .set({ target_folder_id: ids.sales })
      .where('id', '=', file!.id)
      .execute();
    try {
      const elsewhere = await as('writer', {
        method: 'POST',
        url: '/api/proposals',
        payload: { kind: 'model', id: file!.id },
      });
      expect(elsewhere.statusCode, elsewhere.body).toBe(409);
      expect(elsewhere.json<{ error: string }>().error).toBe(USE_ONLY);
    } finally {
      await getDb()
        .updateTable('model_files')
        .set({ target_folder_id: ids.viewing })
        .where('id', '=', file!.id)
        .execute();
    }
  });

  // T717: a dashboard drawn on its cube goes without it, landing on the landed cube.
  it('stays behind when a dashboard drawn on its cube is proposed', async () => {
    const board = randomUUID();
    const chart = randomUUID();
    await docs().create({
      kind: 'chart',
      id: chart,
      body: {
        schemaVersion: 1,
        owner: 'admin',
        title: `Tile ${MARK}`,
        localToDashboardId: board,
        chart: { source: { cube: REGIONS }, wells: { measures: [`${REGIONS}.count`] } },
      },
    });
    await docs().create({
      kind: 'dashboard',
      id: board,
      body: {
        schemaVersion: 1,
        owner: 'admin',
        title: `Drawn ${MARK}`,
        folderId: ids.project,
        targetFolderId: ids.sales,
        pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
        charts: [chart],
      },
    });
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: board },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect(
      proposed.json<{ items: { kind: string }[] }>().items.map((item) => item.kind),
    ).not.toContain('model');
    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
  });

  it('is proposed to no folder even by one who may write its original’s since', async () => {
    const [file] = await files().inFolders([ids.project]);
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
      expect(proposed.json<{ error: string }>().error).toBe(USE_ONLY);
    } finally {
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

/**
 * T763 (AC-279, AC-368): a model chosen with a dashboard in Edit in my
 * workspace is copied `into` the folder the dashboard's copy made, not a
 * project folder of its own: an edit copy from a folder the user writes, a
 * use-only copy (AC-283, R73) from one they only read. An `into` anywhere but
 * their own workspace is refused, copying nothing.
 */
describe('a model copied into the folder a dashboard’s copy made (T763, AC-279, AC-368)', () => {
  const WRITABLE = `${MARK}_sold`;
  const READABLE = `${MARK}_stock`;
  const pathOf = (name: string) => `cubes/${name}.yml`;
  const copyInto = (folderId: string, path: string, into: string) =>
    as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'model', folderId, path, timeZone: TEST_TIME_ZONE, into },
    });

  it('puts each in that folder, an edit copy and a use-only copy, and refuses one outside their workspace', async () => {
    await files().write([
      { folderId: ids.sales, path: pathOf(WRITABLE), content: cube(WRITABLE) },
      { folderId: ids.viewing, path: pathOf(READABLE), content: cube(READABLE) },
    ]);
    stub.holdItems(MODEL, [
      { folderId: 'fviewing', name: REGIONS, kind: 'cube', yaml: cube(REGIONS) },
      { folderId: 'fglimpsed', name: GLIMPSED, kind: 'cube', yaml: cube(GLIMPSED) },
      { folderId: 'fsales', name: WRITABLE, kind: 'cube', yaml: cube(WRITABLE) },
      { folderId: 'fviewing', name: READABLE, kind: 'cube', yaml: cube(READABLE) },
    ]);
    // The folder a dashboard's copy made, in the writer's workspace.
    const project = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'folder', title: `Project ${MARK}`, folderId: ids.workspace },
    });
    expect(project.statusCode, project.body).toBe(201);
    const into = project.json<{ id: string }>().id;
    // Removed after, with what is copied into it (below, and afterAll).
    made.push({ kind: 'folder', id: into });
    /** The folders at the top of their workspace, where a project folder is made. */
    const workspaceFolders = async () =>
      (
        await getDb()
          .selectFrom('documents')
          .select('id')
          .where('kind', '=', 'folder')
          .where(({ eb, ref }) => eb(ref('body', '->>').key('folderId'), '=', ids.workspace))
          .execute()
      ).length;
    const foldersBefore = await workspaceFolders();

    // Into a shared folder: refused, nothing copied.
    const outside = await copyInto(ids.sales, pathOf(WRITABLE), ids.ops);
    expect(outside.statusCode, outside.body).toBe(400);
    expect(await files().inFolders([ids.ops])).toEqual([]);

    const edited = await copyInto(ids.sales, pathOf(WRITABLE), into);
    expect(edited.statusCode, edited.body).toBe(201);
    expect(edited.json()).toEqual({
      kind: 'model',
      created: true,
      folderId: into,
      path: pathOf(WRITABLE),
    });
    const used = await copyInto(ids.viewing, pathOf(READABLE), into);
    expect(used.statusCode, used.body).toBe(201);
    expect(used.json<{ folderId: string }>().folderId).toBe(into);

    const copied = await files().inFolders([into]);
    expect(
      copied
        .map((file) => [file.path, file.origin?.folderId, file.origin?.useOnly === true])
        .sort(),
    ).toEqual(
      [
        [pathOf(READABLE), ids.viewing, true],
        [pathOf(WRITABLE), ids.sales, false],
      ].sort(),
    );
    // No project folder of their own was made.
    expect(await workspaceFolders()).toBe(foldersBefore);
    await getDb().deleteFrom('model_files').where('folder_id', '=', into).execute();
  });
});
