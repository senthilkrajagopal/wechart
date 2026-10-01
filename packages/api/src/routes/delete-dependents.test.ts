import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { buildServer } from '../server';

/**
 * R48 (F39): an item is deleted only when nothing depends on it, and then
 * with what is part of it.
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it.
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

const MARK = `del${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const bookmarks = () => bookmarkStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
/** /Sales, and /Hidden, `managers`' alone, which writer can't see; writer's workspace. */
const ids = { sales: '', hidden: '', workspace: '' };
let app: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.hidden = await doc('folder', {
    title: `Hidden ${MARK}`,
    folderId: 'root',
    access: { readOnly: [], readWrite: ['managers'] },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarks(),
    // A workspace item's open proposal, withdrawn with its delete (T528).
    dataSources: dataSourceStore(getDb()),
    connectionTests: connectionTestStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
  const me = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: cookies['writer']! },
  });
  ids.workspace = `ws:${me.json<{ key: string }>().key}`;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  // Proposals, their records, and what the writer's workspace was given (T528).
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await db.deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
  if (ids.workspace !== '') {
    await db
      .deleteFrom('documents')
      .where('kind', 'in', ['dashboard', 'chart'])
      .where('folder_id', '=', ids.workspace)
      .where('title', 'like', `%${MARK}%`)
      .execute();
    await db
      .deleteFrom('data_sources')
      .where('folder_id', '=', ids.workspace)
      .where('name', 'like', `%${MARK}%`)
      .execute();
  }
  // Models and data sources a folder's test put in it.
  await getDb().deleteFrom('model_files').where('path', 'like', `%${MARK}%`).execute();
  await getDb().deleteFrom('data_sources').where('name', 'like', `%${MARK}%`).execute();
  // Bookmarks on dashboards a test left standing.
  for (const { kind, id } of made) if (kind === 'dashboard') await bookmarks().removeFor(id);
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A dashboard in /Sales with one chart of its own, and a bookmark on it. */
async function boardWithOwnChart(title: string) {
  const board = randomUUID();
  const own = await doc('chart', {
    schemaVersion: 1,
    title: `Own of ${title}`,
    localToDashboardId: board,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title,
      folderId: ids.sales,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: own }] }],
      charts: [own],
    },
    board,
  );
  await bookmarks().save({ dashboardId: board, name: `Q3 ${MARK}`, state: {}, owner: 'someone' });
  return { board, own };
}

describe('deleting a dashboard (T518, AC-363)', () => {
  it('removes it with its own charts and its bookmarks', async () => {
    const { board, own } = await boardWithOwnChart(`Revenue ${MARK}`);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('dashboard', board)).toBeNull();
    expect(await docs().get('chart', own)).toBeNull();
    const kept = await getDb()
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'bookmark')
      .where(({ eb, ref }) => eb(ref('body', '->>').key('dashboardId'), '=', board))
      .execute();
    expect(kept).toEqual([]);
  });

  it('removes nothing for a reader, who may not change it', async () => {
    const { board, own } = await boardWithOwnChart(`Margin ${MARK}`);
    const answer = await as('reader', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(403);
    expect((await docs().get('dashboard', board))?.id).toBe(board);
    expect((await docs().get('chart', own))?.id).toBe(own);
    expect((await bookmarks().list(board, 'someone')).map((each) => each.name)).toEqual([
      `Q3 ${MARK}`,
    ]);
  });

  it('says, asked first, how many own charts go with it and how many library charts stay (design 14, B3; T528)', async () => {
    const { board, own } = await boardWithOwnChart(`Counted ${MARK}`);
    const library = await doc('chart', {
      schemaVersion: 1,
      title: `Shown ${MARK}`,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const stored = (await docs().get('dashboard', board))!;
    await docs().update({
      kind: 'dashboard',
      id: board,
      body: {
        ...stored.body,
        pages: [
          {
            id: 'p1',
            items: [
              { id: 't1', kind: 'chart', chartId: own },
              { id: 't2', kind: 'chart', chartId: library },
            ],
          },
        ],
      },
      expectedVersion: stored.version ?? 1,
    });
    const asked = await as('writer', {
      method: 'GET',
      url: `/api/documents/dashboard/${board}/dependents`,
    });
    expect(asked.statusCode, asked.body).toBe(200);
    expect(asked.json()).toEqual({ ownCharts: 1, libraryCharts: 1 });
    // To those who may delete it alone.
    const reader = await as('reader', {
      method: 'GET',
      url: `/api/documents/dashboard/${board}/dependents`,
    });
    expect(reader.statusCode).toBe(403);
  });

  it('never has another dashboard show its own chart, which goes with it (T518’s review)', async () => {
    const { own } = await boardWithOwnChart(`Pipeline ${MARK}`);
    const other = await doc('dashboard', {
      schemaVersion: 1,
      title: `Other ${MARK}`,
      folderId: ids.sales,
      pages: [],
    });
    const answer = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${other}/charts`,
      payload: { chartId: own },
    });
    expect(answer.statusCode, answer.body).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'This chart is its dashboard’s own: save it to folders to show it on another.',
    );
    expect((await docs().get('dashboard', other))?.body['pages']).toEqual([]);
  });
});

describe('deleting a library chart (T517, AC-362)', () => {
  /** A library chart in /Sales, and a dashboard showing it in each of these folders. */
  async function chartOn(title: string, folders: readonly string[]) {
    const chart = await doc('chart', {
      schemaVersion: 1,
      title,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const boards: string[] = [];
    for (const [index, folderId] of folders.entries())
      boards.push(
        await doc('dashboard', {
          schemaVersion: 1,
          title: `${title} board ${String(index + 1)}`,
          folderId,
          pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
        }),
      );
    return { chart, boards };
  }
  const dependents = (id: string) =>
    as('writer', { method: 'GET', url: `/api/documents/chart/${id}/dependents` });

  it('refuses one a shared folder’s dashboards use, naming those the user may see and counting the rest, and keeps it', async () => {
    const title = `Top products ${MARK}`;
    const { chart, boards } = await chartOn(title, [ids.sales, ids.hidden]);
    const expected = {
      dashboards: [
        {
          id: boards[0],
          title: `${title} board 1`,
          folderId: ids.sales,
          folderPath: [{ id: ids.sales, title: `Sales ${MARK}` }],
        },
      ],
      hidden: 1,
    };

    // What the dialog reads first: what the delete's own refusal would name (design 14, A1).
    const asked = await dependents(chart);
    expect(asked.statusCode, asked.body).toBe(200);
    expect(asked.json()).toEqual(expected);

    // Nor does "confirm" get it past, as it did for AC-023, now retired.
    for (const url of [
      `/api/documents/chart/${chart}`,
      `/api/documents/chart/${chart}?confirm=true`,
    ]) {
      const answer = await as('writer', { method: 'DELETE', url });
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual({
        error: 'This chart is used by 2 dashboards: remove it from them first.',
        ...expected,
      });
    }
    expect((await docs().get('chart', chart))?.id).toBe(chart);
  });

  it('deletes one only drafts in a workspace show, the user’s or another’s, at any depth: their tiles find it gone', async () => {
    const inside = await doc('folder', { title: `Project ${MARK}`, folderId: ids.workspace });
    const { chart, boards } = await chartOn(`Draft use ${MARK}`, [
      ids.workspace,
      inside,
      `ws:someone-else-${MARK}`,
    ]);
    expect((await dependents(chart)).json()).toEqual({ dashboards: [], hidden: 0 });
    const answer = await as('writer', { method: 'DELETE', url: `/api/documents/chart/${chart}` });
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('chart', chart)).toBeNull();
    // The drafts stay, naming the chart they showed.
    for (const board of boards) expect((await docs().get('dashboard', board))?.id).toBe(board);
  });

  it('answers the ask about a shared dashboard’s own chart as its delete: part of the dashboard (T502)', async () => {
    const { own } = await boardWithOwnChart(`Own ${MARK}`);
    const asked = await dependents(own);
    const deleted = await as('writer', { method: 'DELETE', url: `/api/documents/chart/${own}` });
    expect([asked.statusCode, deleted.statusCode]).toEqual([409, 409]);
    expect(asked.json()).toEqual(deleted.json());
    expect((await docs().get('chart', own))?.id).toBe(own);
  });

  it('deletes one no dashboard uses, for a user who may change its folder', async () => {
    const { chart } = await chartOn(`Unused ${MARK}`, []);
    expect((await dependents(chart)).json()).toEqual({ dashboards: [], hidden: 0 });
    const answer = await as('writer', { method: 'DELETE', url: `/api/documents/chart/${chart}` });
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('chart', chart)).toBeNull();
  });

  it('answers a reader’s ask as it answers their delete: they may not change it', async () => {
    const { chart } = await chartOn(`Read only ${MARK}`, [ids.sales]);
    const asked = await as('reader', {
      method: 'GET',
      url: `/api/documents/chart/${chart}/dependents`,
    });
    const deleted = await as('reader', { method: 'DELETE', url: `/api/documents/chart/${chart}` });
    expect([asked.statusCode, deleted.statusCode]).toEqual([403, 403]);
    expect((await docs().get('chart', chart))?.id).toBe(chart);
  });
});

describe('deleting a folder (T521, AC-366)', () => {
  /** A folder in /Sales, or in the folder given. */
  const folderIn = (title: string, parent = ids.sales) =>
    doc('folder', { title: `${title} ${MARK}`, folderId: parent });
  const deleteFolder = (id: string) =>
    as('writer', { method: 'DELETE', url: `/api/documents/folder/${id}` });

  it('refuses one holding a subfolder, dashboards or a chart, saying what it holds, and keeps it', async () => {
    const full = await folderIn('Full');
    await folderIn('Inside', full);
    for (const title of ['A', 'B'])
      await doc('dashboard', {
        schemaVersion: 1,
        title: `${title} ${MARK}`,
        folderId: full,
        pages: [],
      });
    await doc('chart', {
      schemaVersion: 1,
      title: `C ${MARK}`,
      folderId: full,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const answer = await deleteFolder(full);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({
      error:
        'This folder holds 1 subfolder, 2 dashboards and 1 chart: only an empty folder can be deleted.',
      holds: { subfolders: 1, dashboards: 2, charts: 1, models: 0, dataSources: 0 },
    });
    expect((await docs().get('folder', full))?.id).toBe(full);
  });

  it('refuses one holding a model or a data source, saying so', async () => {
    const holding = await folderIn('Holding');
    await getDb()
      .insertInto('model_files')
      .values({ folder_id: holding, path: `cubes/held_${MARK}.yml`, content: 'cubes: []\n' })
      .execute();
    await getDb()
      .insertInto('data_sources')
      .values({
        id: randomUUID(),
        folder_id: holding,
        name: `held_${MARK}`,
        type: 'postgres',
        settings: JSON.stringify({}),
      })
      .execute();
    const answer = await deleteFolder(holding);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({
      error: 'This folder holds 1 model and 1 data source: only an empty folder can be deleted.',
      holds: { subfolders: 0, dashboards: 0, charts: 0, models: 1, dataSources: 1 },
    });
    expect((await docs().get('folder', holding))?.id).toBe(holding);
  });

  it('deletes an empty one, for a user who may change the folder holding it', async () => {
    const empty = await folderIn('Empty');
    const answer = await deleteFolder(empty);
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('folder', empty)).toBeNull();
  });
});

describe('deleting a workspace item waiting in a proposal (T528, AC-372)', () => {
  const proposals = () => proposalStore(getDb());
  const proposed = async (kind: string, id: string) => {
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind, id },
    });
    expect(answer.statusCode, answer.body).toBe(201);
    return answer.json<{ id: string }>().id;
  };
  /** A dashboard or chart made new in the writer's workspace, to go to /Sales. */
  const madeNew = async (kind: 'dashboard' | 'chart', title: string) => {
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind, title, folderId: 'mine', targetFolderId: ids.sales },
    });
    expect(answer.statusCode, answer.body).toBe(201);
    return answer.json<{ id: string }>().id;
  };

  it('withdraws a dashboard’s open proposal with it, its own record saying so', async () => {
    const board = await madeNew('dashboard', `Waiting board ${MARK}`);
    const proposal = await proposed('dashboard', board);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('dashboard', board)).toBeNull();
    const withdrawn = await proposals().get(proposal);
    expect(withdrawn?.status).toBe('withdrawn');
    expect(withdrawn?.decision?.reason).toBeNull();
    const recorded = await getDb()
      .selectFrom('audit_records')
      .select('summary')
      .where('folder_id', '=', ids.sales)
      .where('summary', 'like', `%Waiting board ${MARK}%`)
      .execute();
    expect(recorded.map((each) => each.summary)).toEqual([
      `Withdrew “Waiting board ${MARK}”: it was deleted from My workspace`,
    ]);
  });

  it('withdraws the proposal a chart goes with, though it isn’t the proposal’s own item', async () => {
    const chart = await madeNew('chart', `Waiting chart ${MARK}`);
    const stored = (await docs().get('chart', chart))!;
    await docs().update({
      kind: 'chart',
      id: chart,
      body: {
        ...stored.body,
        chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
      },
      expectedVersion: stored.version ?? 1,
    });
    const board = await madeNew('dashboard', `Showing board ${MARK}`);
    const boardStored = (await docs().get('dashboard', board))!;
    await docs().update({
      kind: 'dashboard',
      id: board,
      body: {
        ...boardStored.body,
        pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: chart }] }],
      },
      expectedVersion: boardStored.version ?? 1,
    });
    const proposal = await proposed('dashboard', board);
    expect((await proposals().openFor('chart', chart))?.id).toBe(proposal);
    const answer = await as('writer', { method: 'DELETE', url: `/api/documents/chart/${chart}` });
    expect(answer.statusCode, answer.body).toBe(204);
    expect((await proposals().get(proposal))?.status).toBe('withdrawn');
  });

  it('withdraws a data source’s open proposal with it', async () => {
    const source = await dataSourceStore(getDb()).create({
      folderId: ids.sales,
      name: `shared_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: {
        password: {
          v: 1,
          kid: 'kid-1',
          enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
          ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
        },
      },
    });
    const copy = await as('writer', { method: 'POST', url: `/api/data-sources/${source.id}/copy` });
    expect(copy.statusCode, copy.body).toBe(201);
    const copyId = copy.json<{ id: string }>().id;
    const proposal = await proposed('data-source', copyId);
    const answer = await as('writer', { method: 'DELETE', url: `/api/data-sources/${copyId}` });
    expect(answer.statusCode, answer.body).toBe(204);
    expect((await proposals().get(proposal))?.status).toBe('withdrawn');
  });

  it('leaves the proposals of items it isn’t in alone', async () => {
    const other = await madeNew('dashboard', `Still waiting ${MARK}`);
    const proposal = await proposed('dashboard', other);
    const board = await madeNew('dashboard', `Never proposed ${MARK}`);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(204);
    expect((await proposals().get(proposal))?.status).toBe('open');
  });
});
