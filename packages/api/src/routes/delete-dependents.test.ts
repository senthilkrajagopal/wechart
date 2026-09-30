import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
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
