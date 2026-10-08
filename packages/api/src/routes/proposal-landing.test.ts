import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { PROPOSAL_BINDINGS, proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import type { Changeset } from '../xcube/changesets';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, TEST_TIME_ZONE, workspaceKeyOf } from './project-folder.fixture';

/**
 * T451 (AC-321, AC-288, AC-291, AC-322, AC-275; T350's note): a proposal's
 * models land through xcube's changeset. It is checked by the changeset's
 * dry run when it is proposed, and again at approval, where it is applied:
 * models first, then the charts and dashboard that bind to them. A refusal
 * leaves every folder and the proposal as they were, names each break the
 * approver may see, counts the rest, and is recorded. A copy renaming a name
 * a chart uses is refused before that, at its save: a landed name is fixed
 * (T706, AC-423).
 *
 * `writer` (`sales-rw`) proposes into /Sales; `super` approves. Against the
 * suite's database, the stub xcube, applying what is sent, and a stub Cube.
 */
const MARK = `pl${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `pln-${MARK}`;
const ORDERS = `${MARK}_orders`;
const CUSTOMERS = `${MARK}_customers`;
const KEPT = `${MARK}_kept`;
const MOVED = `${MARK}_moved`;
const SPARE = `${MARK}_spare`;
const OPS = `${MARK}_ops`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const measured = (name: string, measure: string) =>
  cube(name, `    measures:\n      - name: ${measure}\n        sql: amount\n        type: sum\n`);
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

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const sent: (Changeset | undefined)[] = [];
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', ops: '', east: '', project: '', spare: '' };
const shared = (path: string) => `cubes/${path}.yml`;

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
  const held = [
    [shared(ORDERS), cube(ORDERS)],
    [shared(KEPT), cube(KEPT)],
    [shared(MOVED), cube(MOVED)],
    [shared(SPARE), cube(SPARE)],
  ] as const;
  await files().write(held.map(([path, content]) => ({ folderId: ids.sales, path, content })));
  // One in /Ops, whose models a /Sales member doesn't see.
  ids.ops = randomUUID();
  made.push({ kind: 'folder', id: ids.ops });
  await docs().create({
    kind: 'folder',
    id: ids.ops,
    body: {
      owner: 'admin',
      title: `Ops ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: [`ops-${MARK}`] },
    },
  });
  await files().write([{ folderId: ids.ops, path: shared(OPS), content: cube(OPS) }]);
  // /Sales/East, beneath it: a name nearer than /Sales's (T456).
  ids.east = randomUUID();
  made.push({ kind: 'folder', id: ids.east });
  await docs().create({
    kind: 'folder',
    id: ids.east,
    body: { owner: 'admin', title: `East ${MARK}`, folderId: ids.sales },
  });

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
    [ids.ops, 'fops'],
    [ids.east, 'feast'],
  ]);
  const parentOf = new Map([[ids.east, ids.sales]]);
  stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
    { id: 'feast', parentId: 'fsales' },
  ]);
  // xcube holds what the store does of the folders it serves, as once synced:
  // the suite's root files too.
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
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map(
        [...xids.keys()].map((id) => [id, id === 'root' ? null : (parentOf.get(id) ?? 'root')]),
      ),
    }),
    // What a publish sends, applied as the sync applies it (T426).
    afterPublish: async (changeset) => {
      sent.push(changeset);
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

  const copied = await copy(shared(ORDERS));
  ids.project = copied.json<{ folderId: string }>().folderId;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // What each proposal bound to when it was made (T456), then the proposals.
  const proposed = await getDb()
    .selectFrom('proposals')
    .select('id')
    .where('target_folder_id', 'in', [ids.sales, ids.east])
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
  await getDb()
    .deleteFrom('proposals')
    .where('target_folder_id', 'in', [ids.sales, ids.east])
    .execute();
  await getDb()
    .deleteFrom('audit_records')
    .where('folder_id', 'in', [ids.sales, ids.east])
    .execute();
  await getDb()
    .deleteFrom('item_versions')
    .where('folder_id', 'in', [ids.sales, ids.east])
    .execute();
  await getDb()
    .deleteFrom('data_sources')
    .where('folder_id', 'in', [ids.sales, ids.project])
    .execute();
  await removeProjectFolders();
  await getDb()
    .deleteFrom('model_files')
    .where('folder_id', 'in', [ids.sales, ids.ops, ids.east])
    .execute();
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
/** /Sales's file copied into the writer's workspace: the project folder it is in (T523). */
async function copy(path: string) {
  const copied = await as('writer', {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: { kind: 'model', folderId: ids.sales, path, timeZone: TEST_TIME_ZONE },
  });
  expect(copied.statusCode, copied.body).toBe(201);
  return copied;
}
const copiedInto = async (path: string) => (await copy(path)).json<{ folderId: string }>().folderId;
const save = (path: string, content: string, folderId = ids.project, target = ids.sales) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: { folderId, files: [{ path, content }], targetFolderId: target },
  });
const workspaceFile = async (path: string, folderId = ids.project) =>
  (await files().inFolders([folderId])).find((file) => file.path === path)!;
const salesFiles = async () =>
  Object.fromEntries(
    (await files().inFolders([ids.sales])).map((file) => [
      file.path,
      { id: file.id, version: file.version, content: file.content },
    ]),
  );
const propose = (kind: string, id: string) =>
  as('writer', { method: 'POST', url: '/api/proposals', payload: { kind, id } });
const approve = (id: string, who = 'super') =>
  as(who, { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });
const withdraw = (id: string) =>
  as('writer', { method: 'POST', url: `/api/proposals/${id}/reject`, payload: {} });
const statusOf = async (id: string) =>
  (await as('super', { method: 'GET', url: `/api/proposals/${id}` })).json<{ status: string }>()
    .status;
const headItem = (name: string) =>
  stub.head(MODEL)?.items.find((item) => item.folderId === 'fsales' && item.name === name);
const dryRunsSince = (from: number) =>
  stub.calls
    .slice(from)
    .filter((call) => call.method === 'POST' && call.path.endsWith('/changesets?dryRun=true'));

/** A dashboard in the writer's workspace, to go to /Sales, with a chart of its own naming `cubeName`. */
async function boardNaming(cubeName: string, target = ids.sales) {
  const board = randomUUID();
  const chart = randomUUID();
  await docs().create({
    kind: 'chart',
    id: chart,
    body: {
      schemaVersion: 1,
      owner: USERS['writer']!.email,
      title: `Margin ${MARK}`,
      localToDashboardId: board,
      chart: { source: { cube: cubeName }, wells: { measures: [`${cubeName}.margin`] } },
    },
  });
  const title = `Revenue ${randomUUID().slice(0, 6)} ${MARK}`;
  await docs().create({
    kind: 'dashboard',
    id: board,
    body: {
      schemaVersion: 1,
      owner: USERS['writer']!.email,
      title,
      folderId: ids.project,
      targetFolderId: target,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
      charts: [chart],
    },
  });
  return { board, chart, title };
}

interface Landed {
  landed: { kind: string; id: string; version: number }[];
}

describe('a proposal’s models, landed through xcube’s changeset (T451)', () => {
  it('are checked by its dry run when proposed, then land at approval, before the dashboard that binds to them', async () => {
    expect((await save(shared(ORDERS), CHANGED_ORDERS)).statusCode).toBe(200);
    expect((await save(shared(CUSTOMERS), cube(CUSTOMERS))).statusCode).toBe(200);
    const ordersBefore = (await salesFiles())[shared(ORDERS)]!;
    const { board, title } = await boardNaming(`${ORDERS}`);

    const from = stub.calls.length;
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;
    // Checked when made: the changeset its models would make, dry run.
    const checked = dryRunsSince(from);
    expect(checked).toHaveLength(1);
    expect(
      (checked[0]!.body as { upserts: { folderId: string; name: string; yaml: string }[] }).upserts,
    ).toEqual([
      { folderId: 'fsales', name: CUSTOMERS, kind: 'cube', yaml: cube(CUSTOMERS) },
      { folderId: 'fsales', name: ORDERS, kind: 'cube', yaml: CHANGED_ORDERS },
    ]);

    const approved = await approve(proposalId);
    expect(approved.statusCode, approved.body).toBe(200);
    const now = await salesFiles();
    // Each model in its folder: orders over its own file, its id kept; customers new.
    expect(now[shared(ORDERS)]).toEqual({
      id: ordersBefore.id,
      version: ordersBefore.version + 1,
      content: CHANGED_ORDERS,
    });
    expect(now[shared(CUSTOMERS)]?.content).toBe(cube(CUSTOMERS));
    const landed = approved.json<Landed>().landed;
    expect(landed.filter((each) => each.kind === 'model')).toEqual([
      { kind: 'model', id: ordersBefore.id, version: ordersBefore.version + 1 },
      { kind: 'model', id: now[shared(CUSTOMERS)]!.id, version: 1 },
    ]);
    // Applied in xcube.
    expect(headItem(ORDERS)?.yaml).toBe(CHANGED_ORDERS);
    expect(headItem(CUSTOMERS)?.yaml).toBe(cube(CUSTOMERS));
    // The dashboard landed too, its chart bound in /Sales.
    const dashboard = (await docs().named('dashboard', ids.sales, title))!;
    expect(dashboard).not.toBeNull();
    const [chart] = await docs().localTo(dashboard.id);
    expect((chart!.body['chart'] as { source: { cube: string } }).source.cube).toBe(`${ORDERS}`);
    // Each version kept: the one replaced, and the one landed (AC-288).
    const versions = await versionStore(getDb()).list('model', ordersBefore.id);
    expect(
      versions.map(({ version, content, proposalId: from }) => ({ version, content, from })),
    ).toEqual([
      {
        version: ordersBefore.version + 1,
        content: { path: shared(ORDERS), content: CHANGED_ORDERS },
        from: proposalId,
      },
      {
        version: ordersBefore.version,
        content: { path: shared(ORDERS), content: cube(ORDERS) },
        from: null,
      },
    ]);
    // Recorded with what landed with it, by kind (T451's review).
    const { records } = await auditStore(getDb()).list({
      folderIds: [ids.sales],
      events: ['approval'],
    });
    expect(records.find((each) => each.details?.['proposalId'] === proposalId)?.summary).toBe(
      `Approved “${title}” as version 1, with 1 chart and 2 models`,
    );
    // The workspace's models stay, each now a copy of the version it landed as.
    expect((await workspaceFile(shared(ORDERS))).origin).toEqual({
      id: ordersBefore.id,
      folderId: ids.sales,
      path: shared(ORDERS),
      version: ordersBefore.version + 1,
    });
    expect((await workspaceFile(shared(CUSTOMERS))).origin).toEqual({
      id: now[shared(CUSTOMERS)]!.id,
      folderId: ids.sales,
      path: shared(CUSTOMERS),
      version: 1,
    });
  });

  it('binds a chart to a cube only its models make, as it will resolve once they land (AC-285)', async () => {
    const fresh = `${MARK}_fresh`;
    expect((await save(shared(fresh), measured(fresh, 'margin'))).statusCode).toBe(200);
    const { board, title } = await boardNaming(`${fresh}`);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await salesFiles())[shared(fresh)]?.content).toBe(measured(fresh, 'margin'));
    const dashboard = (await docs().named('dashboard', ids.sales, title))!;
    const [chart] = await docs().localTo(dashboard.id);
    expect((chart!.body['chart'] as { source: { cube: string } }).source.cube).toBe(`${fresh}`);
  });

  it('refuses an approval the check finds breaking, naming each break, and changes nothing', async () => {
    ids.spare = await copiedInto(shared(SPARE));
    expect((await save(shared(SPARE), measured(SPARE, 'total'), ids.spare)).statusCode).toBe(200);
    const proposed = await propose('model', (await workspaceFile(shared(SPARE), ids.spare)).id);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;
    const before = await salesFiles();
    const head = stub.head(MODEL)?.revision;

    // A YAML error, whose line and column are the author's (AC-136, research 3b).
    stub.refuse([
      {
        folderId: 'fsales',
        name: SPARE,
        kind: 'yaml',
        line: 6,
        column: 13,
        message: 'measure total: unknown column amount',
      },
    ]);
    try {
      const refused = await approve(proposalId);
      expect(refused.statusCode, refused.body).toBe(422);
      expect(refused.json()).toEqual({
        error: '1 item would break, so nothing was approved.',
        errors: [
          {
            path: shared(SPARE),
            folderId: ids.sales,
            folderPath: ['Shared', `Sales ${MARK}`],
            line: 6,
            column: 13,
            message: 'measure total: unknown column amount',
          },
        ],
        hidden: 0,
      });
    } finally {
      stub.refuse(undefined);
    }
    // Every folder as it was, xcube's model too, and the proposal still waits.
    expect(await salesFiles()).toEqual(before);
    expect(stub.head(MODEL)?.revision).toBe(head);
    expect(await statusOf(proposalId)).toBe('open');
    // Recorded, every break with what the approver was shown (AC-322).
    const {
      records: [record],
    } = await auditStore(getDb()).list({
      folderIds: [ids.sales],
      events: ['publish-refused'],
    });
    expect(record?.details).toEqual(
      expect.objectContaining({
        change: 'approval',
        proposalId,
        breaks: [
          {
            path: shared(SPARE),
            folderId: ids.sales,
            line: 6,
            column: 13,
            message: 'measure total: unknown column amount',
          },
        ],
        shown: { named: 1, counted: 0 },
      }),
    );
    // Approved by a /Sales member, a break in a folder whose models they don't
    // see is only counted (AC-322).
    stub.refuse([{ folderId: 'fops', name: OPS, kind: 'compile', message: 'join to spare: gone' }]);
    try {
      const counted = await approve(proposalId, 'writer');
      expect(counted.statusCode, counted.body).toBe(422);
      expect(counted.json()).toEqual({
        error: '1 item would break, so nothing was approved.',
        errors: [],
        hidden: 1,
      });
    } finally {
      stub.refuse(undefined);
    }
    expect((await withdraw(proposalId)).statusCode).toBe(200);
  });

  it('is refused when proposed if the check finds it breaking, and no proposal is made', async () => {
    const id = (await workspaceFile(shared(SPARE), ids.spare)).id;
    stub.refuse([
      { folderId: 'fsales', name: SPARE, kind: 'compile', message: 'measure total: bad' },
    ]);
    try {
      const refused = await propose('model', id);
      expect(refused.statusCode, refused.body).toBe(422);
      expect(refused.json<{ error: string }>().error).toBe(
        '1 item would break, so it wasn’t proposed.',
      );
    } finally {
      stub.refuse(undefined);
    }
    expect(await proposalStore(getDb()).openFor('model', id)).toBeNull();
  });

  it('refuses one whose path in its folder another name’s file holds', async () => {
    // A draft's file is named for its cube (T737), so the clash is with a
    // /Sales file named otherwise than its cube, as one may be from before.
    const pathName = `${MARK}_pathclash`;
    const holder = `${MARK}_holder`;
    const path = shared(pathName);
    await files().write([{ folderId: ids.sales, path, content: cube(holder) }]);
    const project = ids.project;
    expect((await save(path, cube(pathName), project)).statusCode).toBe(200);
    try {
      const refused = await propose('model', (await workspaceFile(path, project)).id);
      expect(refused.statusCode, refused.body).toBe(409);
      expect(refused.json<{ error: string }>().error).toBe(
        `“${path}” can’t land: its folder’s file at that path declares “${holder}”. Give yours another path in your workspace, and propose it again.`,
      );
    } finally {
      await files().remove(project, path);
      await files().remove(ids.sales, path);
    }
  });

  /**
   * T705 (AC-422; `[R71]` 5): where T451 moved the folder's file of a name
   * to a new draft's path declaring it, a draft takes no landed name at all.
   * Only a copy made to edit the landed file changes it, at its own path.
   */
  it('refuses a draft at another path declaring the folder’s landed name, and leaves the landed file as it was', async () => {
    const before = (await salesFiles())[shared(MOVED)]!;
    const path = `models/${MOVED}.yml`;
    const saved = await save(path, measured(MOVED, 'weight'));
    expect(saved.statusCode, saved.body).toBe(422);
    expect(saved.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${MOVED}” is already in use.` },
    ]);
    expect((await files().inFolders([ids.project])).map((file) => file.path)).not.toContain(path);
    const now = await salesFiles();
    expect(now[path]).toBeUndefined();
    expect(now[shared(MOVED)]).toEqual(before);
    expect(headItem(MOVED)?.yaml).toBe(before.content);
    expect(headItem(MOVED)?.yaml).not.toBe(measured(MOVED, 'weight'));
  });

  // A landed name is fixed (T706, AC-423): where T451 refused a rename at
  // approval while a chart used the name, the copy can't take another name
  // at all, so nothing of it is proposed or lands.
  it('refuses a copy’s rename of a name a chart uses, at its save, before any proposal (AC-275, AC-423)', async () => {
    const kept = await copiedInto(shared(KEPT));
    const renamed = `${MARK}_renamed`;
    const chart = randomUUID();
    made.push({ kind: 'chart', id: chart });
    await docs().create({
      kind: 'chart',
      id: chart,
      body: {
        schemaVersion: 1,
        owner: 'admin',
        title: `Kept chart ${MARK}`,
        folderId: ids.sales,
        chart: {
          source: { cube: `${KEPT}` },
          wells: { measures: [`${KEPT}.count`] },
        },
      },
    });
    const before = await salesFiles();
    const chartBefore = (await docs().get('chart', chart))?.body;
    const from = stub.calls.length;

    const saved = await save(shared(KEPT), cube(renamed), kept);
    expect(saved.statusCode, saved.body).toBe(409);
    expect(saved.json<{ error: string }>().error).toBe(
      `“${KEPT}” has landed, so its name is fixed: a copy of it keeps that name. Its title can still change.`,
    );
    // Nothing of it kept, checked or landed; the chart still names what it did.
    expect((await workspaceFile(shared(KEPT), kept)).content).toBe(cube(KEPT));
    expect(dryRunsSince(from)).toEqual([]);
    expect(await salesFiles()).toEqual(before);
    expect(headItem(KEPT)?.yaml).toBe(cube(KEPT));
    expect(headItem(renamed)).toBeUndefined();
    expect((await docs().get('chart', chart))?.body).toEqual(chartBefore);
  });

  it('lands its data sources first, and leaves them landed when its models are refused (R52)', async () => {
    const sources = dataSourceStore(getDb());
    const name = `ledger_${MARK}`;
    const sealed = {
      v: 1 as const,
      kid: 'kid-1',
      enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
      ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
    };
    const fields = { host: 'ledger-db', port: 5432, database: 'ledger', user: 'cube', ssl: false };
    const drafted = await sources.create({
      folderId: ids.project,
      targetFolderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });
    const spare = await workspaceFile(shared(SPARE), ids.spare);
    // One proposal holding both, as a model naming its data source would.
    const proposal = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(ids.project), name: 'Wren Writer' },
      targetFolderId: ids.sales,
      description: null,
      items: [
        {
          kind: 'data-source',
          id: drafted.id,
          title: name,
          version: drafted.version,
          snapshot: {
            name,
            driver: 'postgres',
            authMethod: 'password',
            fields,
            description: null,
            origin: null,
            sealed: { password: sealed },
            revisions: {},
          },
          landsIn: ids.sales,
          replaces: null,
        },
        {
          kind: 'model',
          id: spare.id,
          title: spare.path,
          version: spare.version,
          snapshot: { path: spare.path, content: spare.content, origin: spare.origin },
          landsIn: ids.sales,
          replaces: spare.origin === null ? null : { id: spare.origin.id, version: 1 },
        },
      ],
    });
    const named = async () =>
      (await sources.inFolder(ids.sales)).filter((each) => each.name === name);

    stub.refuse([{ folderId: 'fsales', name: SPARE, kind: 'compile', message: 'bad' }]);
    try {
      const refused = await approve(proposal.id);
      expect(refused.statusCode, refused.body).toBe(422);
    } finally {
      stub.refuse(undefined);
    }
    // The data source landed, and stays; the model didn't; it still waits.
    const first = await named();
    expect(first).toHaveLength(1);
    expect(await statusOf(proposal.id)).toBe('open');
    expect((await salesFiles())[shared(SPARE)]?.content).toBe(cube(SPARE));

    // Approved again: the model lands, over the data source landed before, not beside it.
    const approved = await approve(proposal.id);
    expect(approved.statusCode, approved.body).toBe(200);
    const again = await named();
    expect(again.map((each) => each.id)).toEqual([first[0]!.id]);
    expect(approved.json<Landed>().landed.map((each) => each.kind)).toEqual([
      'data-source',
      'model',
    ]);
    expect((await salesFiles())[shared(SPARE)]?.content).toBe(measured(SPARE, 'total'));
  });

  it('lands a data source proposed as new beside its origin, never over it (T451’s review)', async () => {
    const sources = dataSourceStore(getDb());
    const sealed = {
      v: 1 as const,
      kid: 'kid-1',
      enc: Buffer.alloc(32, `enc2-${MARK}`).toString('base64url'),
      ct: Buffer.alloc(272, `ct2-${MARK}`).toString('base64url'),
    };
    const fields = { host: 'old-db', port: 5432, database: 'old', user: 'cube', ssl: false };
    // Its origin in /Sales, renamed there since it was copied: proposed as new.
    const origin = await sources.create({
      folderId: ids.sales,
      name: `legacy_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });
    const name = `fresh_${MARK}`;
    const copy = await sources.create({
      folderId: ids.project,
      targetFolderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: { ...fields, host: 'new-db' },
      sealed: { password: sealed },
    });
    await sources.setOrigin(copy.id, {
      id: origin.id,
      version: origin.version,
      folderId: ids.sales,
    });
    const proposal = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(ids.project), name: 'Wren Writer' },
      targetFolderId: ids.sales,
      description: null,
      items: [
        {
          kind: 'data-source',
          id: copy.id,
          title: name,
          version: copy.version,
          snapshot: {
            name,
            driver: 'postgres',
            authMethod: 'password',
            fields: { ...fields, host: 'new-db' },
            description: null,
            origin: { id: origin.id, version: origin.version, folderId: ids.sales },
            sealed: { password: sealed },
            revisions: {},
          },
          landsIn: ids.sales,
          replaces: null,
        },
      ],
    });
    const approved = await approve(proposal.id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await sources.get(origin.id))?.fields).toEqual(fields);
    expect(
      (await sources.inFolder(ids.sales))
        .filter((each) => each.name === name)
        .map((each) => each.id),
    ).toEqual([approved.json<Landed>().landed[0]!.id]);
  });
});

/**
 * A cube published in a folder meanwhile, as a landing or a publish puts one
 * there: in the store and in xcube's head alike, so the next check is a
 * changeset's, not the whole model's.
 */
async function publishedIn(folderId: string, xcubeId: string, name: string, content: string) {
  await files().write([{ folderId, path: shared(name), content }]);
  await admin.applyChangeset({
    baseRevision: stub.head(MODEL)?.revision ?? null,
    upserts: [{ folderId: xcubeId, name, kind: 'cube', yaml: content }],
    deletes: [],
  });
}

/**
 * T456 (AC-321; R52, "a submitted item is frozen"), under one name per item
 * (R71): a name means one item wherever it is used, so a nearer namesake
 * can't be published to rebind one, and an approval lands what was proposed.
 * A name whose item is gone since is refused by the approval's binding
 * (T502's 422). T456's own comparison is retired (T713).
 */
describe('an approval binding an item otherwise than when it was proposed (T456)', () => {
  const eastItem = (name: string) =>
    stub.head(MODEL)?.items.find((item) => item.folderId === 'feast' && item.name === name);

  /**
   * One name per item (R71, T709): a nearer cube of a bound name can no
   * longer be published while a proposal waits, so the rebinding T456
   * refused can't arise that way. xcube refuses the namesake, and the
   * proposal lands as it was proposed.
   */
  const publishRefused = async (xcubeId: string, name: string, content: string) => {
    const answer = await admin.applyChangeset({
      baseRevision: stub.head(MODEL)?.revision ?? null,
      upserts: [{ folderId: xcubeId, name, kind: 'cube', yaml: content }],
      deletes: [],
    });
    expect(answer).toEqual({
      kind: 'refused',
      errors: [expect.objectContaining({ folderId: xcubeId, name, kind: 'name_in_use' })],
      cubeMessage: null,
    });
  };

  it('lands a model as proposed: no nearer cube of its join’s name can be published meanwhile', async () => {
    const base = `${MARK}_base`;
    const lines = `${MARK}_lines`;
    await publishedIn(ids.sales, 'fsales', base, cube(base));
    // New in the workspace, to go to /Sales/East, joined to /Sales's.
    const joined = cube(
      lines,
      [
        '    joins:',
        `      - name: ${base}`,
        `        sql: "{CUBE}.id = {${base}}.id"`,
        '        relationship: many_to_one',
        '',
      ].join('\n'),
    );
    expect((await save(shared(lines), joined, ids.project, ids.east)).statusCode).toBe(200);
    const id = (await workspaceFile(shared(lines))).id;
    const proposed = await propose('model', id);
    expect(proposed.statusCode, proposed.body).toBe(201);

    // /Sales/East can't publish a cube of that name meanwhile.
    await publishRefused('feast', base, cube(base));
    expect(eastItem(base)).toBeUndefined();
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(eastItem(lines)?.yaml).toBe(joined);
  });

  it('lands a chart as proposed: no nearer cube of its name can be published meanwhile', async () => {
    const solo = `${MARK}_solo`;
    await publishedIn(ids.sales, 'fsales', solo, measured(solo, 'margin'));
    // The workspace's dashboard for /Sales/East, its own chart on /Sales's cube.
    const { board, title } = await boardNaming(solo, ids.east);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);

    await publishRefused('feast', solo, measured(solo, 'margin'));
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    const [landed] = await docs().localTo((await docs().named('dashboard', ids.east, title))!.id);
    expect((landed!.body['chart'] as { source: { cube: string } }).source.cube).toBe(solo);
  });

  /**
   * Under R71 the case T456's refusal still meets (the coordinator's call,
   * 2026-10-07): a cube the proposal binds to is deleted between its
   * proposal and its approval. The approval is refused, naming the item and
   * the name, and nothing lands. The approval's binding (T502) refuses it.
   */
  it('is refused for a chart whose cube was deleted since it was proposed, and lands nothing', async () => {
    const gone = `${MARK}_gone`;
    await publishedIn(ids.sales, 'fsales', gone, measured(gone, 'margin'));
    const { board, title } = await boardNaming(gone, ids.east);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;

    // Deleted from /Sales meanwhile, in the store and in xcube.
    await files().remove(ids.sales, shared(gone));
    expect(
      await admin.applyChangeset({
        baseRevision: stub.head(MODEL)?.revision ?? null,
        upserts: [],
        deletes: [{ folderId: 'fsales', name: gone }],
      }),
    ).toMatchObject({ kind: 'stored' });
    const head = stub.head(MODEL)?.revision;
    const refused = await approve(proposalId);
    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json()).toEqual({
      error: `No folder on the path of “Margin ${MARK}” holds “${gone}”, so nothing was approved.`,
      names: [gone],
    });
    expect(await docs().named('dashboard', ids.east, title)).toBeNull();
    expect(stub.head(MODEL)?.revision).toBe(head);
    expect(await statusOf(proposalId)).toBe('open');
    expect((await withdraw(proposalId)).statusCode).toBe(200);
  });

  it('lands one whose items bind as they did when it was proposed', async () => {
    const steady = `${MARK}_steady`;
    await publishedIn(ids.sales, 'fsales', steady, measured(steady, 'margin'));
    const { board, title } = await boardNaming(`${steady}`, ids.east);
    const proposed = await propose('dashboard', board);
    expect(proposed.statusCode, proposed.body).toBe(201);
    // A cube of another name published meanwhile changes no binding of its.
    const other = `${MARK}_other`;
    await publishedIn(ids.east, 'feast', other, cube(other));
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    const [landed] = await docs().localTo((await docs().named('dashboard', ids.east, title))!.id);
    expect((landed!.body['chart'] as { source: { cube: string } }).source.cube).toBe(`${steady}`);
  });
});
