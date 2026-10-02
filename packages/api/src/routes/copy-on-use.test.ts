import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T527 (AC-371, AC-263; the user's answer on AC-263, "Copy on use"): with
 * sign-in on, a dashboard shows only library charts kept on the path of the
 * folder it lands in, that folder or one above it, where every reader of it
 * may open them. A library chart from anywhere else, put on it, becomes a
 * chart of its own: a copy, in no folder, which it shows instead. One on the
 * path stays shared. A workspace's dashboard, and a workspace's chart, are
 * judged by their target folders, where their proposals land them. With
 * sign-in off, nothing is copied.
 *
 *   /Sales <run>          writer read-write
 *   /Sales <run>/EMEA     (inherited)
 *   /Also <run>           writer read-write, beside /Sales
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...base,
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

const MARK = `cou${randomUUID().slice(0, 8)}`;
const DEFINITION = { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } };
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let cookie = '';
const ids = {
  sales: '',
  emea: '',
  also: '',
  inSales: '',
  inEmea: '',
  inAlso: '',
  toSales: '',
  toEmea: '',
};
let app: FastifyInstance;
let open: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}
const chartIn = (title: string, folderId: string) =>
  doc('chart', { schemaVersion: 1, title: `${title} ${MARK}`, folderId, chart: DEFINITION });

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie } });
const stored = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;

/** The writer's own, in their workspace, made as the app makes one: with its target. */
async function mine(kind: 'dashboard' | 'chart', title: string, targetFolderId: string) {
  const answer = await as({
    method: 'POST',
    url: '/api/documents',
    payload: { kind, title: `${title} ${MARK}`, folderId: 'mine', targetFolderId },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind, id });
  return id;
}

/** A dashboard's tiles, each showing a chart. */
const showing = (...chartIds: string[]) => [
  {
    id: 'p1',
    title: 'Page 1',
    items: chartIds.map((chartId, index) => ({
      id: `t${String(index + 1)}`,
      kind: 'chart',
      chartId,
    })),
  },
];
const tilesOf = (body: Record<string, unknown>) =>
  (body['pages'] as { items: { chartId?: string }[] }[])[0]!.items.map((tile) => tile.chartId);

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.emea = await doc('folder', { title: `EMEA ${MARK}`, folderId: ids.sales });
  ids.also = await doc('folder', {
    title: `Also ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.inSales = await chartIn('In Sales', ids.sales);
  ids.inEmea = await chartIn('In EMEA', ids.emea);
  ids.inAlso = await chartIn('In Also', ids.also);

  const wiring = {
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
  };
  app = buildServer({ config: secured, ...wiring });
  open = buildServer({ config: base, ...wiring });
  cookie = await signIn(app, USERS['writer']!);

  ids.toSales = await mine('dashboard', 'To Sales', ids.sales);
  ids.toEmea = await mine('dashboard', 'To EMEA', ids.emea);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (open !== undefined) await open.close();
  for (const { kind, id } of made.reverse()) {
    if (kind === 'dashboard')
      for (const chart of await docs().localTo(id)) await docs().remove('chart', chart.id);
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  }
  await closeDb();
});

/** The copy a reply names, as stored: the dashboard's own, and a copy of `from`. */
async function copyOf(
  reply: { copied?: { from: string; id: string; title: string }[] },
  from: string,
  dashboardId: string,
) {
  const named = reply.copied?.find((each) => each.from === from);
  expect(named, JSON.stringify(reply.copied)).toBeDefined();
  const source = await stored('chart', from);
  const copy = await stored('chart', named!.id);
  const board = await stored('dashboard', dashboardId);
  expect(named!.title).toBe(source.body['title']);
  // Where it was, and whose, aren't the copy's: it is in no folder, and goes where it is to go.
  const { folderId: _folder, owner: _owner, targetFolderId: _target, ...content } = source.body;
  void [_folder, _owner, _target];
  expect(copy.body).toEqual({
    ...content,
    localToDashboardId: dashboardId,
    owner: board.body['owner'],
  });
  return named!.id;
}

describe('copy on use (T527, AC-371, AC-263)', () => {
  it('adds a chart kept in its folder, or above it, as itself', async () => {
    for (const [dashboardId, chartId] of [
      [ids.toSales, ids.inSales],
      [ids.toEmea, ids.inSales],
    ] as const) {
      const answer = await as({
        method: 'POST',
        url: `/api/dashboards/${dashboardId}/charts`,
        payload: { chartId },
      });
      expect(answer.statusCode, answer.body).toBe(204);
      expect((await stored('dashboard', dashboardId)).body['charts']).toContain(chartId);
    }
  });

  it('adds a chart from beside its folder, or below it, as its own copy', async () => {
    for (const chartId of [ids.inAlso, ids.inEmea]) {
      const before = await stored('chart', chartId);
      const answer = await as({
        method: 'POST',
        url: `/api/dashboards/${ids.toSales}/charts`,
        payload: { chartId },
      });
      expect(answer.statusCode, answer.body).toBe(201);
      const copyId = await copyOf(answer.json(), chartId, ids.toSales);
      const listed = (await stored('dashboard', ids.toSales)).body['charts'] as string[];
      expect(listed).toContain(copyId);
      expect(listed).not.toContain(chartId);
      // The one it came from is as it was.
      expect(await stored('chart', chartId)).toEqual(before);
    }
  });

  it('saves a dashboard showing one with its own copy in its place, and the rest as they are', async () => {
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: {
        body: { ...board.body, pages: showing(ids.inAlso, ids.inSales, ids.inAlso) },
        version: board.version,
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), ids.inAlso, ids.toSales);
    // One copy, for every tile that showed it.
    expect(answer.json<{ copied: unknown[] }>().copied).toHaveLength(1);
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([
      copyId,
      ids.inSales,
      copyId,
    ]);
  });

  it('saves one with its charts the same way, in the same write', async () => {
    const board = await stored('dashboard', ids.toEmea);
    const own = randomUUID();
    const answer = await as({
      method: 'PUT',
      url: `/api/dashboards/${ids.toEmea}`,
      payload: {
        dashboard: {
          body: { ...board.body, pages: showing(own, ids.inAlso, ids.inEmea, ids.inSales) },
          version: board.version,
        },
        charts: [
          {
            id: own,
            body: {
              schemaVersion: 1,
              title: `Own ${MARK}`,
              localToDashboardId: ids.toEmea,
              chart: DEFINITION,
            },
            version: 0,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), ids.inAlso, ids.toEmea);
    expect(answer.json<{ copied: unknown[] }>().copied).toHaveLength(1);
    // Its own chart, and EMEA's and Sales', stay as they were sent.
    expect(tilesOf((await stored('dashboard', ids.toEmea)).body)).toEqual([
      own,
      copyId,
      ids.inEmea,
      ids.inSales,
    ]);
  });

  it('judges a workspace’s chart by the folder it is to land in', async () => {
    const toAlso = await mine('chart', 'Mine to Also', ids.also);
    const toSales = await mine('chart', 'Mine to Sales', ids.sales);
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: { body: { ...board.body, pages: showing(toAlso, toSales) }, version: board.version },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), toAlso, ids.toSales);
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([copyId, toSales]);
  });

  it('copies a chart saved with it as it is sent, and nothing again on the next save', async () => {
    const toAlso = await mine('chart', 'Sent to Also', ids.also);
    const sent = await stored('chart', toAlso);
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/dashboards/${ids.toSales}`,
      payload: {
        dashboard: { body: { ...board.body, pages: showing(toAlso) }, version: board.version },
        charts: [
          {
            id: toAlso,
            body: { ...sent.body, title: `Edited ${MARK}`, chart: DEFINITION },
            version: sent.version,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const [copied] = answer.json<{ copied: { from: string; id: string }[] }>().copied;
    expect(copied?.from).toBe(toAlso);
    expect((await stored('chart', copied!.id)).body['title']).toBe(`Edited ${MARK}`);

    // Saved again as it is now stored: it shows its own copy, so none is made.
    const after = await stored('dashboard', ids.toSales);
    const again = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: { body: after.body, version: after.version },
    });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json<{ copied?: unknown }>().copied).toBeUndefined();
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([copied!.id]);
  });

  it('with sign-in off, copies nothing', async () => {
    const board = await doc('dashboard', {
      schemaVersion: 1,
      title: `Open ${MARK}`,
      folderId: ids.sales,
      pages: [],
    });
    const before = await stored('dashboard', board);
    const answer = await open.inject({
      method: 'PUT',
      url: `/api/documents/dashboard/${board}`,
      payload: { body: { ...before.body, pages: showing(ids.inAlso) }, version: before.version },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<{ copied?: unknown }>().copied).toBeUndefined();
    expect(tilesOf((await stored('dashboard', board)).body)).toEqual([ids.inAlso]);
  });
});
