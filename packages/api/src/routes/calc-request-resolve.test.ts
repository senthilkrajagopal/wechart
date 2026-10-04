import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { calcRequestStore } from '../repos/calc-requests';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { PROPOSAL_BINDINGS, proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T385 / AC-052 (amended 2026-10-04, R63): WHEN a requested measure is added
 * to the model and its proposal is approved into the folder, THE SYSTEM SHALL
 * mark the request as resolved and name the member that resolves it. A
 * requested measure is one that a proposal adds to the request's cube, where
 * the proposal's author is a member who took the request up by opening it in
 * their workspace (AC-051). A measure added by anyone who hasn't opened the
 * request leaves it open.
 * Fails when: the request stays open after the approval of a proposal that
 * adds a measure to its cube, from a member who took it up, or names no
 * member.
 *
 * /Sales (read-write `sales-rw`, read-only `sales-ro`) holds two cubes, each
 * in its own file. `super` asks three calculations: two on the first cube and
 * one on the second. `writer` takes up one of the first cube's and the second
 * cube's, then adds a measure to the first cube in My workspace and proposes
 * it; `super` approves. Against the suite's database, the stub xcube,
 * applying what is sent, and a stub Cube.
 */
const MARK = `rs${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `crr-${MARK}`;
const ORDERS = `${MARK}_orders`;
const STOCK = `${MARK}_stock`;
const path = (name: string) => `cubes/${name}.yml`;
const cube = (name: string, measures = '      - name: count\n        type: count\n') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n${measures}`;
const WITH_MARGIN = cube(
  ORDERS,
  '      - name: count\n        type: count\n      - name: margin\n        sql: amount - cost\n        type: sum\n',
);

let cubeServer: Server;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', chart: '' };

beforeAll(async () => {
  cubeServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  ids.sales = randomUUID();
  made.push({ kind: 'folder', id: ids.sales });
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  await files().write([
    { folderId: ids.sales, path: path(ORDERS), content: cube(ORDERS) },
    { folderId: ids.sales, path: path(STOCK), content: cube(STOCK) },
  ]);

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
  ]);
  const stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
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
    proposalBindings: proposalBindingStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    calcRequests: calcRequestStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
    // What a publish sends, applied as the sync applies it (T426).
    afterPublish: async (changeset) => {
      if (changeset === undefined) return;
      const base = (await admin.revision()).current?.revision ?? null;
      await admin.applyChangeset({
        baseRevision: base,
        upserts: changeset.upserts,
        deletes: changeset.deletes,
      });
    },
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);

  // Super's chart, in their workspace, that the calculations are asked from.
  const created = await as('super', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'chart', title: `Asked ${MARK}`, folderId: 'mine', targetFolderId: ids.sales },
  });
  expect(created.statusCode, created.body).toBe(201);
  ids.chart = created.json<{ id: string }>().id;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const proposed = await getDb()
    .selectFrom('proposals')
    .select('id')
    .where('target_folder_id', '=', ids.sales)
    .execute();
  if (proposed.length > 0)
    await getDb()
      .deleteFrom('documents')
      .where('kind', '=', PROPOSAL_BINDINGS)
      .where(
        'id',
        'in',
        proposed.map((each) => String(each.id)),
      )
      .execute();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('item_versions').where('folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('calc_requests').where('folder_id', '=', ids.sales).execute();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', '=', ids.sales).execute();
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

/** A calculation `super` asks on one of /Sales's cubes. */
async function asked(name: string, description: string): Promise<string> {
  const response = await as('super', {
    method: 'POST',
    url: '/api/calc-requests',
    payload: {
      chartId: ids.chart,
      cube: `fsales__${name}`,
      fields: { measures: [`fsales__${name}.count`] },
      description: `${description} (${MARK})`,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}

const take = async (id: string) => {
  const taken = await as('writer', { method: 'POST', url: `/api/calc-requests/${id}/take` });
  expect(taken.statusCode, taken.body).toBe(200);
};

interface Listed {
  id: string;
  status: string;
  resolution: { members: string[]; by: string; approvedBy: string; at: string } | null;
}

const listed = async (who: string) =>
  (await as(who, { method: 'GET', url: '/api/calc-requests' })).json<{ requests: Listed[] }>()
    .requests;

const nameOf = async (who: string) =>
  (await as(who, { method: 'GET', url: '/api/me' })).json<{ name: string }>().name;

describe('a calculation request resolved by its taker’s approved measure (T385, AC-052)', () => {
  it('is resolved by the approval, naming the measure; one not taken up, or on another cube, stays open', async () => {
    const taken = await asked(ORDERS, 'Margin, taken up');
    const untaken = await asked(ORDERS, 'Margin, not taken up');
    const elsewhere = await asked(STOCK, 'Stock cover, taken up');
    await take(taken);
    await take(elsewhere);

    // The writer adds the measure to the first cube in My workspace, and proposes it.
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'model', folderId: ids.sales, path: path(ORDERS), timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const project = copied.json<{ folderId: string }>().folderId;
    const saved = await as('writer', {
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: project,
        files: [{ path: path(ORDERS), content: WITH_MARGIN }],
        targetFolderId: ids.sales,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const file = (await files().inFolders([project])).find((each) => each.path === path(ORDERS))!;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    // Proposed is not yet resolved.
    expect((await listed('writer')).find((each) => each.id === taken)?.status).toBe('open');

    const approved = await as('super', {
      method: 'POST',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const now = await listed('writer');
    const resolved = now.find((each) => each.id === taken)!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toEqual({
      members: [`fsales__${ORDERS}.margin`],
      by: await nameOf('writer'),
      approvedBy: await nameOf('super'),
      at: expect.any(String) as unknown,
    });
    // Not taken up: the measure doesn't answer it. On another cube: nothing added there.
    for (const open of [untaken, elsewhere])
      expect(now.find((each) => each.id === open)).toMatchObject({
        status: 'open',
        resolution: null,
      });
  });
});
