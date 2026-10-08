import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { CubeClient } from '../cube/client';
import { buildServer } from '../server';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';

/**
 * T502 (AC-278, with AC-272 and AC-275): with sign-in on, a shared item is
 * never saved in place, so an approval is how it is published. Its cubes are
 * bound then, in the folder it lands in, as a save there bound them. A name
 * no folder on that path holds refuses the approval, naming it, and nothing
 * lands.
 *
 * The stub xcube holds the root's `orders` and /Sales's (`fsales`)
 * `sales_orders`, each under its own name (T709, R71).
 * `writer` (`sales-rw`) makes a chart in their workspace, to go to /Sales,
 * and approves their own proposal.
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

const MARK = `pbind${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let sales = '';
let ops = '';
let cookie = '';
let readerCookie = '';
let app: FastifyInstance;

beforeAll(async () => {
  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      // `reader` (`sales-ro`) sees /Sales's dashboards (T711, AC-263).
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  // /Ops, /Sales's sibling: its cube is off /Sales's path (T711, AC-272).
  ops = randomUUID();
  made.push({ kind: 'folder', id: ops });
  await docs().create({
    kind: 'folder',
    id: ops,
    body: {
      owner: 'admin',
      title: `Ops ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    },
  });

  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: secured.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
  ]);
  const cube = (folderId: string, name: string) => ({
    folderId,
    name,
    kind: 'cube' as const,
    yaml: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`,
  });
  stub.holdItems('dev', [
    cube('froot', 'orders'),
    cube('fsales', 'sales_orders'),
    cube('fops', 'ops_widgets'),
  ]);

  app = buildServer({
    config: secured,
    // A Cube answering every query with no rows, for a reader's tile (AC-263).
    cube: new CubeClient({
      apiUrl: secured.cubeApiUrl,
      apiSecret: secured.cubeApiSecret,
      securityContext: {},
      fetchImpl: (async () =>
        new Response(JSON.stringify({ data: [], annotation: {} }))) as typeof fetch,
    }),
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    xcube: admin,
    // Workspaces are no folder of xcube's: nothing binds there.
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [sales, 'fsales'],
        [ops, 'fops'],
      ]),
      parents: new Map<string, string | null>([
        ['root', null],
        [sales, 'root'],
        [ops, 'root'],
      ]),
    }),
  });
  cookie = await signIn(app, USERS['writer']!);
  readerCookie = await signIn(app, USERS['reader']!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const left = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .execute();
  for (const { kind, id } of left) await docs().remove(kind as DocumentKind, id);
  await removeProjectFolders();
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie } });

/** A chart naming `cube`, made in writer's workspace to go to /Sales, and proposed. */
async function proposed(cube: string) {
  const title = `${cube} ${MARK}`;
  const chart = await as({
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'chart', title, folderId: 'mine', targetFolderId: sales },
  });
  expect(chart.statusCode, chart.body).toBe(201);
  const id = chart.json<{ id: string }>().id;
  const stored = (await docs().get('chart', id))!;
  const saved = await as({
    method: 'PUT',
    url: `/api/documents/chart/${id}`,
    payload: {
      body: {
        ...stored.body,
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
        },
      },
      version: stored.version,
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  // Unbound in the workspace, which xcube's tree doesn't hold.
  expect(
    ((await docs().get('chart', id))!.body['chart'] as { source: { cube: string } }).source.cube,
  ).toBe(cube);
  const proposal = await as({
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'chart', id, description: `Adds ${title}.` },
  });
  expect(proposal.statusCode, proposal.body).toBe(201);
  return { title, proposalId: proposal.json<{ id: string }>().id };
}

describe('an approval publishes, binding each item in its folder (T502, AC-272)', () => {
  it('lands a chart bound to its folder’s own cube, by its own name', async () => {
    const { proposalId } = await proposed('sales_orders');
    const approved = await as({ method: 'POST', url: `/api/proposals/${proposalId}/approve` });
    expect(approved.statusCode, approved.body).toBe(200);
    const [landed] = approved.json<{ landed: { kind: string; id: string }[] }>().landed;
    const chart = (await docs().get('chart', landed!.id))!.body['chart'] as {
      source: { cube: string };
      wells: { measures: string[] };
    };
    expect([chart.source.cube, chart.wells.measures]).toEqual([
      'sales_orders',
      ['sales_orders.count'],
    ]);
  });

  it('refuses one naming a cube no folder on its path holds, naming it, and lands nothing', async () => {
    const { title, proposalId } = await proposed('widgets');
    const approved = await as({ method: 'POST', url: `/api/proposals/${proposalId}/approve` });
    expect(approved.statusCode, approved.body).toBe(422);
    expect(approved.json()).toEqual({
      error: `No folder on the path of “${title}” holds “widgets”, so nothing was approved.`,
      names: ['widgets'],
    });
    // Nothing in /Sales by that name, and the proposal open to decide again.
    const inSales = await getDb()
      .selectFrom('documents')
      .select('id')
      .where(({ eb, ref }) => eb(ref('body', '->>').key('folderId'), '=', sales))
      .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), '=', title))
      .execute();
    expect(inSales).toEqual([]);
    const proposal = await as({ method: 'GET', url: `/api/proposals/${proposalId}` });
    expect(proposal.json<{ status: string }>().status).toBe('open');
  });

  // T711 (AC-272): xcube answers `ops_widgets` wherever it is; the approval
  // binds it only where /Sales's path keeps it, as a save does.
  it('refuses one naming a cube kept only in a sibling folder, naming it, and lands nothing', async () => {
    const { title, proposalId } = await proposed('ops_widgets');
    const approved = await as({ method: 'POST', url: `/api/proposals/${proposalId}/approve` });
    expect(approved.statusCode, approved.body).toBe(422);
    expect(approved.json()).toEqual({
      error: `No folder on the path of “${title}” holds “ops_widgets”, so nothing was approved.`,
      names: ['ops_widgets'],
    });
    const proposal = await as({ method: 'GET', url: `/api/proposals/${proposalId}` });
    expect(proposal.json<{ status: string }>().status).toBe('open');
  });

  /**
   * T711 (AC-263): a reader of /Sales sees its dashboards, and their tiles
   * query the cubes the dashboard's charts were bound to when it landed: the
   * root's and /Sales's, by their own names. A cube none of them binds is
   * refused before Cube is asked.
   */
  it('lets a reader of the folder query the cubes its landed dashboard’s charts were bound to', async () => {
    const shared = randomUUID();
    made.push({ kind: 'dashboard', id: shared });
    await docs().create({
      kind: 'dashboard',
      id: shared,
      body: { owner: 'admin', schemaVersion: 1, title: `Read ${MARK}`, folderId: sales, pages: [] },
    });
    const copied = await as({
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: shared, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copyId = copied.json<{ id: string }>().id;
    const copy = (await docs().get('dashboard', copyId))!;
    const tile = (id: string, cube: string) => ({
      id,
      body: {
        schemaVersion: 1,
        title: `On ${cube} ${MARK}`,
        localToDashboardId: copyId,
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
        },
      },
      version: 0,
    });
    const [first, second] = [randomUUID(), randomUUID()];
    const saved = await as({
      method: 'PUT',
      url: `/api/dashboards/${copyId}`,
      payload: {
        dashboard: {
          body: {
            ...copy.body,
            pages: [
              {
                id: 'p1',
                items: [
                  { id: 't1', kind: 'chart', chartId: first },
                  { id: 't2', kind: 'chart', chartId: second },
                ],
              },
            ],
          },
          version: copy.version,
        },
        charts: [tile(first, 'sales_orders'), tile(second, 'orders')],
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const proposal = await as({
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: copyId, description: `Read ${MARK}.` },
    });
    expect(proposal.statusCode, proposal.body).toBe(201);
    const approved = await as({
      method: 'POST',
      url: `/api/proposals/${proposal.json<{ id: string }>().id}/approve`,
    });
    expect(approved.statusCode, approved.body).toBe(200);
    // Bound as landed, each by its own name.
    expect(
      (await docs().localTo(shared))
        .map((chart) => (chart.body['chart'] as { source: { cube: string } }).source.cube)
        .sort(),
    ).toEqual(['orders', 'sales_orders']);

    const load = (measure: string) =>
      app.inject({
        method: 'POST',
        url: '/api/load',
        headers: { cookie: readerCookie },
        payload: { query: { measures: [measure] }, for: { kind: 'dashboard', id: shared } },
      });
    for (const measure of ['sales_orders.count', 'orders.count']) {
      const answer = await load(measure);
      expect(answer.statusCode, `${measure}: ${answer.body}`).toBe(200);
    }
    expect((await load('ops_widgets.count')).statusCode).toBe(403);
  });

  it('lands none of a dashboard’s items, and keeps no version, when a later one is refused (T502’s review)', async () => {
    // A shared dashboard in /Sales, copied into writer's workspace, given an
    // own chart on `orders` (bound) and a filter on `widgets` (held nowhere).
    const shared = randomUUID();
    made.push({ kind: 'dashboard', id: shared });
    await docs().create({
      kind: 'dashboard',
      id: shared,
      body: {
        owner: 'admin',
        schemaVersion: 1,
        title: `Board ${MARK}`,
        folderId: sales,
        pages: [],
      },
    });
    const copied = await as({
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: shared, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copyId = copied.json<{ id: string }>().id;
    const copy = (await docs().get('dashboard', copyId))!;
    const own = randomUUID();
    const saved = await as({
      method: 'PUT',
      url: `/api/dashboards/${copyId}`,
      payload: {
        dashboard: {
          body: {
            ...copy.body,
            pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: own }] }],
            filters: [{ id: 'f1', widget: 'list', member: 'widgets.region' }],
          },
          version: copy.version,
        },
        charts: [
          {
            id: own,
            body: {
              schemaVersion: 1,
              title: `Own ${MARK}`,
              localToDashboardId: copyId,
              chart: {
                source: { cube: 'orders' },
                wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
              },
            },
            version: 0,
          },
        ],
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const proposal = await as({
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: copyId, description: `Filters ${MARK}.` },
    });
    expect(proposal.statusCode, proposal.body).toBe(201);

    const approved = await as({
      method: 'POST',
      url: `/api/proposals/${proposal.json<{ id: string }>().id}/approve`,
    });
    expect(approved.statusCode, approved.body).toBe(422);
    expect(approved.json<{ names: string[] }>().names).toEqual(['widgets']);
    // Its chart, bound first, not landed; the dashboard as it was; no version kept.
    expect(await docs().localTo(shared)).toEqual([]);
    expect((await docs().get('dashboard', shared))!.version).toBe(1);
    const kept = await getDb()
      .selectFrom('item_versions')
      .select('version')
      .where('item_id', '=', shared)
      .execute();
    expect(kept).toEqual([]);
  });
});
