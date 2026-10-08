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
import { proposalOverlayIdOf, workspaceOverlayIdOf } from '../xcube/overlays';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T542 (AC-281, AC-323), under one name per item (R71, T709): a tile saved
 * against /Sales's `orders` keeps that name, which is the cube's in every
 * folder. Once the workspace holds its copy of `orders`, its previews ask
 * the same name through the workspace's overlay, where the copy stands in
 * for the landed cube (research `xcube-256d632371.md`, 2.6); the tile reads
 * the answer under the name it holds. A shared item's queries are as they
 * were. A proposal's previews go through the proposal's overlay, and its
 * dashboard takes the copy it names with it (AC-285).
 *
 * Against the suite's database, the stub xcube, and a stub Cube that answers
 * each query with a row under the members it was asked for.
 */
const MARK = `rb${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `rbn-${MARK}`;
const ORDERS = `${MARK}_orders`;
const STOCK = `${MARK}_stock`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n      - name: count\n        type: count\n${extra}`;

/** Each query Cube was asked, with the overlay its token named. */
const asked: { query: Record<string, unknown>; overlay: unknown }[] = [];
let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = {
  sales: '',
  ops: '',
  project: '',
  board: '',
  shared: '',
  workspace: '',
  // Where the workspace's copy of `orders` is kept (T716).
  copy: '',
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
      const url = new URL(request.url ?? '/', 'http://cube.test');
      // `/v1/sql` is asked by GET, its query in the address.
      const query = url.pathname.endsWith('/v1/sql')
        ? (JSON.parse(url.searchParams.get('query') ?? '{}') as Record<string, unknown>)
        : raw === ''
          ? {}
          : (JSON.parse(raw) as { query: Record<string, unknown> }).query;
      asked.push({ query, overlay });
      if (url.pathname.endsWith('/v1/sql')) {
        response.writeHead(200, {
          'content-type': 'application/json',
          ...(typeof overlay === 'string'
            ? {
                'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}`,
              }
            : {}),
        });
        response.end(JSON.stringify({ sql: { sql: ['SELECT 1', []] } }));
        return;
      }
      const measures = (query['measures'] ?? []) as string[];
      response.writeHead(200, {
        'content-type': 'application/json',
        ...(typeof overlay === 'string'
          ? {
              'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}`,
            }
          : {}),
      });
      response.end(
        JSON.stringify({
          query,
          data: [Object.fromEntries(measures.map((member) => [member, '7']))],
          annotation: {
            measures: Object.fromEntries(measures.map((member) => [member, { title: member }])),
            dimensions: {},
            segments: {},
            timeDimensions: {},
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  for (const key of ['sales', 'ops'] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: 'root',
        access: { readOnly: null, readWrite: ['sales-rw'] },
      },
    });
    ids[key] = id;
  }
  await files().write([
    { folderId: ids.sales, path: `cubes/${ORDERS}.yml`, content: cube(ORDERS) },
    // A cube the workspace holds no copy of (T716).
    { folderId: ids.sales, path: `cubes/${STOCK}.yml`, content: cube(STOCK) },
  ]);
  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
    [ids.ops, 'fops'],
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
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fsales', name: ORDERS, kind: 'cube', yaml: cube(ORDERS) },
    { folderId: 'fsales', name: STOCK, kind: 'cube', yaml: cube(STOCK) },
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
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);

  // A folder of the writer's in My workspace, with a dashboard going to
  // /Sales whose tile was saved against /Sales's orders.
  const folder = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'folder', title: `project-${MARK}`, folderId: 'mine' },
  });
  expect(folder.statusCode, folder.body).toBe(201);
  ids.project = folder.json<{ id: string }>().id;
  ids.workspace = String((await docs().get('folder', ids.project))!.body['folderId']);
  ids.board = await boardIn(ids.project, ids.sales);
  ids.shared = await boardIn(ids.sales);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await getDb()
    .deleteFrom('audit_records')
    .where('folder_id', 'in', [ids.sales, ids.ops])
    .execute();
  await getDb().deleteFrom('model_files').where('folder_id', '=', ids.project).execute();
  await getDb().deleteFrom('model_files').where('folder_id', '=', ids.sales).execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .where('kind', '!=', 'folder')
    .execute();
  await removeProjectFolders();
  if (ids.project !== '') await docs().remove('folder', ids.project);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A dashboard in `folderId` (going to `target`, in the workspace), its own tile on `cubeName`, /Sales's orders unless named. */
async function boardIn(folderId: string, target?: string, cubeName = ORDERS) {
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
      chart: {
        source: { cube: cubeName },
        wells: { measures: [`${cubeName}.count`] },
      },
    },
  });
  await docs().create({
    kind: 'dashboard',
    id: board,
    body: {
      schemaVersion: 1,
      owner: 'admin',
      title: `Board ${randomUUID().slice(0, 6)} ${MARK}`,
      folderId,
      ...(target === undefined ? {} : { targetFolderId: target }),
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
      charts: [chart],
    },
  });
  return board;
}

const load = (who: string, item: { kind: string; id: string }) =>
  as(who, {
    method: 'POST',
    url: '/api/load',
    payload: { query: { measures: [`${ORDERS}.count`] }, for: item },
  });

describe('a workspace item’s stored names in its previews, never rebound (T542, T716, AC-281)', () => {
  it('ask the landed cube while the workspace has none of the name', async () => {
    asked.length = 0;
    const answer = await load('writer', { kind: 'dashboard', id: ids.board });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)?.query['measures']).toEqual([`${ORDERS}.count`]);
  });

  it('ask the name through the overlay once the workspace holds its copy, and answer under the stored name', async () => {
    // The workspace's copy of /Sales's `orders`, changed: its name is the original's (R71 5).
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: {
        kind: 'model',
        folderId: ids.sales,
        path: `cubes/${ORDERS}.yml`,
        timeZone: TEST_TIME_ZONE,
      },
    });
    expect([200, 201], copied.body).toContain(copied.statusCode);
    ids.copy = copied.json<{ folderId: string }>().folderId;
    const saved = await as('writer', {
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: ids.copy,
        files: [{ path: `cubes/${ORDERS}.yml`, content: cube(ORDERS, '    description: Mine\n') }],
        targetFolderId: ids.sales,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);

    asked.length = 0;
    const answer = await load('writer', { kind: 'dashboard', id: ids.board });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${ORDERS}.count`] },
      overlay: workspaceOverlayIdOf(ids.workspace),
    });
    // The tile reads it under the name it holds.
    const body = answer.json<{
      data: Record<string, string>[];
      annotation: { measures: Record<string, unknown> };
      query: { measures: string[] };
    }>();
    expect(body.data).toEqual([{ [`${ORDERS}.count`]: '7' }]);
    expect(Object.keys(body.annotation.measures)).toEqual([`${ORDERS}.count`]);
    expect(body.query.measures).toEqual([`${ORDERS}.count`]);
  });

  // T716 (AC-281): a name the workspace holds no copy of is the landed cube's, asked as it is.
  it('ask a name the workspace holds no copy of as it is, the landed cube answering through the overlay', async () => {
    const onStock = await boardIn(ids.project, ids.sales, STOCK);
    asked.length = 0;
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: [`${STOCK}.count`] }, for: { kind: 'dashboard', id: onStock } },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${STOCK}.count`] },
      overlay: workspaceOverlayIdOf(ids.workspace),
    });
    expect(answer.json<{ data: unknown[] }>().data).toEqual([{ [`${STOCK}.count`]: '7' }]);
  });

  // T716 (AC-281): the copy answers a tile made after it as one made before.
  it('ask a tile made after the copy through the overlay too', async () => {
    const later = await boardIn(ids.project, ids.sales);
    asked.length = 0;
    const answer = await load('writer', { kind: 'dashboard', id: later });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${ORDERS}.count`] },
      overlay: workspaceOverlayIdOf(ids.workspace),
    });
  });

  it('show the SQL of the workspace’s copy, through the overlay', async () => {
    asked.length = 0;
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/sql',
      payload: {
        query: { measures: [`${ORDERS}.count`] },
        for: { kind: 'dashboard', id: ids.board },
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${ORDERS}.count`] },
      overlay: workspaceOverlayIdOf(ids.workspace),
    });
  });

  it('leave a shared item’s queries as they were', async () => {
    asked.length = 0;
    const answer = await load('writer', { kind: 'dashboard', id: ids.shared });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${ORDERS}.count`] },
      overlay: undefined,
    });
  });

  /**
   * A dashboard naming the cube the workspace holds a copy of was drawn
   * through the workspace, so the copy goes with it (AC-285), to the folder
   * it came from; the review previews through the proposal's overlay.
   */
  it('go to a proposal with the copy of the cube its tile names, previewed through the proposal’s overlay (AC-323, AC-285)', async () => {
    const board = await boardIn(ids.project, ids.sales);
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: board },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposal = proposed.json<{ id: string; items: { kind: string; landsIn: string }[] }>();
    expect(proposal.items.map(({ kind, landsIn }) => ({ kind, landsIn }))).toEqual([
      { kind: 'dashboard', landsIn: ids.sales },
      { kind: 'chart', landsIn: ids.sales },
      { kind: 'model', landsIn: ids.sales },
    ]);

    asked.length = 0;
    const answer = await load('writer', { kind: 'proposal', id: proposal.id });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${ORDERS}.count`] },
      overlay: proposalOverlayIdOf(proposal.id),
    });
    expect(answer.json<{ data: unknown[] }>().data).toEqual([{ [`${ORDERS}.count`]: '7' }]);
    // A name it holds no item of: the published model's, through the same overlay (T716).
    asked.length = 0;
    const published = await as('writer', {
      method: 'POST',
      url: '/api/load',
      payload: {
        query: { measures: [`${STOCK}.count`] },
        for: { kind: 'proposal', id: proposal.id },
      },
    });
    expect(published.statusCode, published.body).toBe(200);
    expect(asked.at(-1)).toEqual({
      query: { measures: [`${STOCK}.count`] },
      overlay: proposalOverlayIdOf(proposal.id),
    });

    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${proposal.id}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
  });

  // T716 (AC-281): with the copy gone, the landed cube of the name answers.
  it('ask the landed cube once the workspace’s copy is discarded', async () => {
    const discarded = await as('writer', {
      method: 'DELETE',
      url: `/api/model/files?folder=${ids.copy}&path=${encodeURIComponent(`cubes/${ORDERS}.yml`)}`,
    });
    expect(discarded.statusCode, discarded.body).toBeLessThan(300);

    asked.length = 0;
    const answer = await load('writer', { kind: 'dashboard', id: ids.board });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked.at(-1)).toEqual({ query: { measures: [`${ORDERS}.count`] }, overlay: undefined });
    expect(answer.json<{ data: unknown[] }>().data).toEqual([{ [`${ORDERS}.count`]: '7' }]);
  });
});
