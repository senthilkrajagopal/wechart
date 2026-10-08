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
import { proposalOverlayIdOf } from '../xcube/overlays';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';
import { SUBMITTED } from './submitted';

/**
 * T350 (AC-285; design 05, states A and G): a dashboard whose cubes resolve
 * through models only its author's workspace has is proposed with them, and
 * they are decided together. A model goes with it where a chart of it, or
 * one of its own filters, names a cube one of the workspace's models makes
 * where it is placed (its target, a copy's origin's folder); and so does
 * each workspace model those name in turn, by short name, as xcube resolves
 * an overlay item's names (research `xcube-slice-5.md`, Gotcha 5). Nothing
 * else of the workspace goes with it. Each model item lands in its own
 * target, replacing the file there that declares its name.
 *
 * `writer` (`sales-rw`) copies /Sales's `orders` into their workspace,
 * changes it to join a new `customers` of theirs, and makes `widgets`, which
 * nothing uses. Against the suite's database, the stub xcube and a stub Cube.
 */
const MARK = `pb${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `pbn-${MARK}`;
const ORDERS = `${MARK}_orders`;
const CUSTOMERS = `${MARK}_customers`;
const WIDGETS = `${MARK}_widgets`;
const OTHER = `${MARK}_other`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const CHANGED_ORDERS = cube(
  ORDERS,
  [
    '    joins:',
    `      - name: ${CUSTOMERS}`,
    `        sql: "{CUBE}.customer_id = {${CUSTOMERS}}.id"`,
    '        relationship: many_to_one',
    '    measures:',
    '      - name: margin',
    '        sql: amount',
    '        type: sum',
    '',
  ].join('\n'),
);

const asked: { claims: Record<string, unknown> }[] = [];
let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', project: '', sharedOrders: '' };

beforeAll(async () => {
  cubeServer = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}',
    ) as Record<string, unknown>;
    asked.push({ claims });
    const overlay = claims['wechartOverlay'];
    response.writeHead(200, {
      'content-type': 'application/json',
      ...(typeof overlay === 'string'
        ? { 'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}` }
        : {}),
    });
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
    { folderId: ids.sales, path: `cubes/${ORDERS}.yml`, content: cube(ORDERS) },
    { folderId: ids.sales, path: `cubes/${OTHER}.yml`, content: cube(OTHER) },
  ]);
  ids.sharedOrders = (await files().inFolders([ids.sales])).find(
    (file) => file.path === `cubes/${ORDERS}.yml`,
  )!.id;

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
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
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fsales', name: ORDERS, kind: 'cube', yaml: cube(ORDERS) },
    { folderId: 'fsales', name: OTHER, kind: 'cube', yaml: cube(OTHER) },
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

  // /Sales's orders, copied into the writer's workspace and changed to join
  // a customers of their own; and widgets, which nothing uses.
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
  expect(copied.statusCode, copied.body).toBe(201);
  ids.project = copied.json<{ folderId: string }>().folderId;
  for (const [path, content] of [
    [`cubes/${CUSTOMERS}.yml`, cube(CUSTOMERS)],
    [`cubes/${WIDGETS}.yml`, cube(WIDGETS)],
    [`cubes/${ORDERS}.yml`, CHANGED_ORDERS],
  ] as const) {
    const saved = await save(path, content);
    expect(saved.statusCode, saved.body).toBe(200);
  }
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
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
const save = (path: string, content: string) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: { folderId: ids.project, files: [{ path, content }], targetFolderId: ids.sales },
  });
const fileIdOf = async (path: string) =>
  (await files().inFolders([ids.project])).find((file) => file.path === path)!.id;

/** A dashboard in the writer's workspace, to go to /Sales, with a chart of its own naming `cubeName`. */
async function boardNaming(cubeName: string) {
  const board = randomUUID();
  const chart = randomUUID();
  await docs().create({
    kind: 'chart',
    id: chart,
    body: {
      schemaVersion: 1,
      owner: 'admin',
      title: `Margin ${MARK}`,
      localToDashboardId: board,
      chart: { source: { cube: cubeName }, wells: { measures: [`${cubeName}.margin`] } },
    },
  });
  await docs().create({
    kind: 'dashboard',
    id: board,
    body: {
      schemaVersion: 1,
      owner: USERS['writer']!.email,
      title: `Revenue ${randomUUID().slice(0, 6)} ${MARK}`,
      folderId: ids.project,
      targetFolderId: ids.sales,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
      charts: [chart],
    },
  });
  return { board, chart };
}

const propose = (kind: string, id: string) =>
  as('writer', { method: 'POST', url: '/api/proposals', payload: { kind, id } });
const withdraw = (id: string) =>
  as('writer', { method: 'POST', url: `/api/proposals/${id}/reject`, payload: {} });

interface Answered {
  id: string;
  status: string;
  items: {
    kind: string;
    id: string;
    title: string;
    landsIn: string;
    replaces: { id: string; version: number; copiedFrom: boolean } | null;
  }[];
}

describe('the workspace models a proposed dashboard needs (T350, AC-285)', () => {
  it('go in its proposal: the one its chart names, and the one that joins, and no other', async () => {
    const { board, chart } = await boardNaming(`${ORDERS}`);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposal = proposed.json<Answered>();
    expect(proposal.items.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: 'dashboard', id: board },
      { kind: 'chart', id: chart },
      { kind: 'model', id: await fileIdOf(`cubes/${ORDERS}.yml`) },
      { kind: 'model', id: await fileIdOf(`cubes/${CUSTOMERS}.yml`) },
    ]);
    const [, , orders, customers] = proposal.items;
    // Each in its own target, replacing the file there that declares its name.
    expect(orders).toEqual(
      expect.objectContaining({
        title: `cubes/${ORDERS}.yml`,
        landsIn: ids.sales,
        replaces: { id: ids.sharedOrders, version: 1, copiedFrom: true },
      }),
    );
    expect(customers).toEqual(
      expect.objectContaining({
        title: `cubes/${CUSTOMERS}.yml`,
        landsIn: ids.sales,
        replaces: null,
      }),
    );

    // Its review is drawn through them: the proposal's overlay holds both (AC-323).
    asked.length = 0;
    const load = await as('writer', {
      method: 'POST',
      url: '/api/load',
      payload: {
        query: { measures: [`${ORDERS}.margin`] },
        for: { kind: 'proposal', id: proposal.id },
      },
    });
    expect(load.statusCode, load.body).toBe(200);
    expect(asked.at(-1)?.claims['wechartOverlay']).toBe(proposalOverlayIdOf(proposal.id));
    expect(
      stub
        .overlay(MODEL, proposalOverlayIdOf(proposal.id))
        ?.upserts.map(({ folderId, name, yaml }) => ({
          folderId,
          name,
          yaml,
        })),
    ).toEqual([
      { folderId: 'fsales', name: CUSTOMERS, yaml: cube(CUSTOMERS) },
      { folderId: 'fsales', name: ORDERS, yaml: CHANGED_ORDERS },
    ]);

    // The reviewer is shown the model as proposed, against the folder's now.
    const opened = await as('super', { method: 'GET', url: `/api/proposals/${proposal.id}` });
    expect(opened.statusCode, opened.body).toBe(200);
    const shown = opened
      .json<{
        items: { kind: string; snapshot: unknown; replacesNow: number | null; current?: unknown }[];
      }>()
      .items.filter((item) => item.kind === 'model');
    expect(shown[0]).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({ path: `cubes/${ORDERS}.yml`, content: CHANGED_ORDERS }),
        replacesNow: 1,
        current: { content: cube(ORDERS), version: 1 },
      }),
    );
    expect(shown[1]).not.toHaveProperty('current');

    // Its author, once no longer a read-write member there, isn't shown the folder's file.
    const folder = (await docs().get('folder', ids.sales))!;
    const access = folder.body['access'];
    await docs().update({
      kind: 'folder',
      id: ids.sales,
      body: { ...folder.body, access: { readOnly: ['sales-ro'], readWrite: [] } },
      expectedVersion: folder.version!,
    });
    try {
      const lapsed = await as('writer', { method: 'GET', url: `/api/proposals/${proposal.id}` });
      expect(lapsed.statusCode, lapsed.body).toBe(200);
      const model = lapsed
        .json<{ items: { kind: string; current?: unknown }[] }>()
        .items.find((item) => item.kind === 'model');
      expect(model?.kind).toBe('model');
      expect(model).not.toHaveProperty('current');
    } finally {
      const now = (await docs().get('folder', ids.sales))!;
      await docs().update({
        kind: 'folder',
        id: ids.sales,
        body: { ...now.body, access },
        expectedVersion: now.version!,
      });
    }

    expect((await withdraw(proposal.id)).statusCode).toBe(200);
  });

  it('are none where its cubes resolve without the workspace, an unchanged copy too', async () => {
    // Copied in and left as it is: the folder's own answers the same.
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: {
        kind: 'model',
        folderId: ids.sales,
        path: `cubes/${OTHER}.yml`,
        timeZone: TEST_TIME_ZONE,
      },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const { board, chart } = await boardNaming(`${OTHER}`);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect(proposed.json<Answered>().items.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: 'dashboard', id: board },
      { kind: 'chart', id: chart },
    ]);
    expect((await withdraw(proposed.json<Answered>().id)).statusCode).toBe(200);
  });

  it('are listed by the Propose dialog’s check, and frozen with it while it waits', async () => {
    const { board } = await boardNaming(`${ORDERS}`);
    const checked = await as('writer', {
      method: 'POST',
      url: '/api/proposals/check',
      payload: { kind: 'dashboard', id: board },
    });
    expect(checked.statusCode, checked.body).toBe(200);
    expect(checked.json<Answered>().items.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'dashboard', title: expect.stringContaining(MARK) },
      { kind: 'chart', title: `Margin ${MARK}` },
      { kind: 'model', title: `cubes/${ORDERS}.yml` },
      { kind: 'model', title: `cubes/${CUSTOMERS}.yml` },
    ]);

    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const { id } = proposed.json<Answered>();
    // A model in it can't be changed (T541, AC-388); one not in it can.
    const frozen = await save(
      `cubes/${CUSTOMERS}.yml`,
      cube(CUSTOMERS, '    description: Changed\n'),
    );
    expect(frozen.statusCode, frozen.body).toBe(409);
    expect(frozen.json()).toEqual(SUBMITTED);
    expect(
      (await save(`cubes/${WIDGETS}.yml`, cube(WIDGETS, '    description: Free\n'))).statusCode,
    ).toBe(200);
    // Nor proposed again by itself, nor with another dashboard, which says which.
    const again = await propose('model', await fileIdOf(`cubes/${CUSTOMERS}.yml`));
    expect(again.statusCode, again.body).toBe(409);
    const other = await boardNaming(`${ORDERS}`);
    const another = await propose('dashboard', other.board);
    expect(another.statusCode, another.body).toBe(409);
    expect(another.json<{ error: string }>().error).toBe(
      `“cubes/${ORDERS}.yml”, which goes with it, is waiting for review in another proposal. That one must be decided first.`,
    );

    // Rejected together: each may change again.
    const rejected = await as('super', {
      method: 'POST',
      url: `/api/proposals/${id}/reject`,
      payload: { reason: 'Not yet' },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect((await save(`cubes/${CUSTOMERS}.yml`, cube(CUSTOMERS))).statusCode).toBe(200);
  });

  it('is never approved without them: a model the check refuses keeps the dashboard back too (T451)', async () => {
    const { board } = await boardNaming(`${ORDERS}`);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const { id } = proposed.json<Answered>();
    stub.refuse([{ folderId: 'fsales', name: CUSTOMERS, kind: 'compile', message: 'no table' }]);
    let approved;
    try {
      approved = await as('super', {
        method: 'POST',
        url: `/api/proposals/${id}/approve`,
        payload: {},
      });
    } finally {
      stub.refuse(undefined);
    }
    expect(approved.statusCode, approved.body).toBe(422);
    expect(approved.json<{ error: string }>().error).toBe(
      '1 item would break, so nothing was approved.',
    );
    // The folder is as it was, and the proposal still waits.
    expect(
      (await files().inFolders([ids.sales])).find((file) => file.path === `cubes/${CUSTOMERS}.yml`),
    ).toBe(undefined);
    const title = proposed.json<Answered>().items[0]!.title;
    expect(await docs().named('dashboard', ids.sales, title)).toBeNull();
    const still = await as('super', { method: 'GET', url: `/api/proposals/${id}` });
    expect(still.json<{ status: string }>().status).toBe('open');
    expect((await withdraw(id)).statusCode).toBe(200);
  });

  it('go with a chart proposed by itself too', async () => {
    const chart = randomUUID();
    await docs().create({
      kind: 'chart',
      id: chart,
      body: {
        schemaVersion: 1,
        owner: USERS['writer']!.email,
        title: `Alone ${MARK}`,
        folderId: ids.project,
        targetFolderId: ids.sales,
        chart: {
          source: { cube: `${ORDERS}` },
          wells: { measures: [`${ORDERS}.margin`] },
        },
      },
    });
    const proposed = await propose('chart', chart);
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect(proposed.json<Answered>().items.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'chart', title: `Alone ${MARK}` },
      { kind: 'model', title: `cubes/${ORDERS}.yml` },
      { kind: 'model', title: `cubes/${CUSTOMERS}.yml` },
    ]);
    expect((await withdraw(proposed.json<Answered>().id)).statusCode).toBe(200);
  });

  it('refuses one whose model is to go to a folder xcube doesn’t serve, rather than leave it behind', async () => {
    const gone = randomUUID();
    const path = `cubes/${MARK}_gone.yml`;
    await files().write([
      {
        folderId: ids.project,
        path,
        content: cube(`${MARK}_gone`),
        targetFolderId: gone,
      },
    ]);
    try {
      const chart = randomUUID();
      // Its one name, wherever it is to go (T709, AC-328).
      const full = `${MARK}_gone`;
      await docs().create({
        kind: 'chart',
        id: chart,
        body: {
          schemaVersion: 1,
          owner: USERS['writer']!.email,
          title: `Gone ${MARK}`,
          folderId: ids.project,
          targetFolderId: ids.sales,
          chart: { source: { cube: full }, wells: { measures: [`${full}.count`] } },
        },
      });
      const proposed = await propose('chart', chart);
      expect(proposed.statusCode, proposed.body).toBe(409);
      expect(proposed.json<{ error: string }>().error).toBe(
        `“${path}”, which goes with it, is to go to a folder xcube doesn’t serve now (it may have been deleted), so it can’t be proposed.`,
      );
    } finally {
      await files().remove(ids.project, path);
    }
  });

  it('a model proposed by itself goes with the models it names', async () => {
    const proposed = await propose('model', await fileIdOf(`cubes/${ORDERS}.yml`));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposal = proposed.json<Answered & { kind: string; title: string }>();
    expect(proposal.kind).toBe('model');
    expect(proposal.title).toBe(`cubes/${ORDERS}.yml`);
    expect(proposal.items.map(({ title }) => title)).toEqual([
      `cubes/${ORDERS}.yml`,
      `cubes/${CUSTOMERS}.yml`,
    ]);

    // Its delete's check names the file, for the dialog to name the proposal
    // it withdraws (T528, AC-372).
    const where = `folder=${encodeURIComponent(ids.project)}&path=${encodeURIComponent(`cubes/${CUSTOMERS}.yml`)}`;
    const checked = await as('writer', {
      method: 'GET',
      url: `/api/model/files/dependents?${where}`,
    });
    expect(checked.statusCode, checked.body).toBe(200);
    expect(checked.json<{ fileId: string }>().fileId).toBe(
      await fileIdOf(`cubes/${CUSTOMERS}.yml`),
    );
    // Deleting one in it withdraws the proposal, then deletes it.
    const deleted = await as('writer', { method: 'DELETE', url: `/api/model/files?${where}` });
    expect(deleted.statusCode, deleted.body).toBeLessThan(300);
    expect(
      (await files().inFolders([ids.project])).some(
        (file) => file.path === `cubes/${CUSTOMERS}.yml`,
      ),
    ).toBe(false);
    const after = await as('writer', { method: 'GET', url: `/api/proposals/${proposal.id}` });
    expect(after.json<{ status: string }>().status).toBe('withdrawn');
  });

  it('a model’s proposal is withdrawn when My workspace is cleared (T522, AC-367)', async () => {
    const proposed = await propose('model', await fileIdOf(`cubes/${WIDGETS}.yml`));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const { id } = proposed.json<Answered>();
    const asked = await as('writer', { method: 'GET', url: '/api/workspace/clear' });
    expect(
      asked.json<{ proposals: { id: string }[] }>().proposals.map((each) => each.id),
    ).toContain(id);
    const cleared = await as('writer', { method: 'POST', url: '/api/workspace/clear' });
    expect(cleared.statusCode, cleared.body).toBe(200);
    const after = await as('writer', { method: 'GET', url: `/api/proposals/${id}` });
    expect(after.json<{ status: string }>().status).toBe('withdrawn');
  });
});
