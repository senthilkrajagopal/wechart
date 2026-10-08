import { randomUUID } from 'node:crypto';

import { CHART_DOCUMENT_VERSION } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { folderXcubeIds } from '../repos/folder-xcube-ids';
import { buildServer, type ModelFile } from '../server';

/**
 * T340 (AC-268): every query names the item it serves, `for: { kind, id }`,
 * and wechart checks access before it reaches Cube.
 * `Fails when: any route returns … an item the asking user may not see …`
 *
 * - A query for an item the user may not see answers 404, as a missing item
 *   does, and asks Cube nothing.
 * - A query naming a member of a cube its item isn't bound to answers 403,
 *   and asks Cube nothing. An item is bound to the cubes it uses: a chart's,
 *   and a dashboard's with its charts'. One the user may change is bound to
 *   the cubes on its folder's path too, as the editor's picker offers them
 *   (AC-329); one in a workspace to the shared root's.
 * - With sign-in on, a query naming no item answers 400, but a Super-Admin's,
 *   who may see every item.
 *
 * Folders, with this run's groups:
 *
 *   /R    read-only   sales-ro   a dashboard on the root's `orders`
 *   /W    read-write  sales-rw   the cube `wsales`
 *   /W/2                          a chart on `orders`
 *   /X    no grant                the cube `xsales`, and a dashboard
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

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids = {
  r: '',
  w: '',
  w2: '',
  x: '',
  dashR: '',
  chartR: '',
  chartW2: '',
  dashX: '',
  mine: '',
  // A reader's dashboard in /R showing a library chart kept in /W, on /W's
  // cube, and one showing a chart this wechart can't read.
  dashShowsW: '',
  chartW: '',
  dashBroken: '',
  broken: '',
};
const full = { wsales: '', xsales: '', rjoined: '' };
let rootBefore: StoredDocument | null = null;
/** A proposal into /W by someone else, holding a chart on the root's `orders`. */
const proposalId = randomUUID();

/** What Cube was asked, by path; the field list answers every cube. */
const asked: string[] = [];
const cube = () =>
  new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async (url: string | URL) => {
      const path = new URL(String(url)).pathname.replace('/cubejs-api', '');
      asked.push(path);
      const body =
        path === '/v1/meta'
          ? {
              cubes: ['orders', full.wsales, full.xsales].map((name) => ({
                name,
                measures: [{ name: `${name}.count` }],
                dimensions: [],
              })),
            }
          : path === '/v1/sql'
            ? { sql: { sql: ['select 1', []], preAggregations: [] } }
            : path === '/v1/dry-run'
              ? { transformedQueries: [{}] }
              : { data: [{ 'orders.count': '1' }], annotation: {} };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch,
  });

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({
    kind,
    id,
    // A chart as the app stores one now: in the current format, read back as written.
    body: {
      owner: 'admin',
      ...(kind === 'chart' ? { schemaVersion: CHART_DOCUMENT_VERSION } : {}),
      ...body,
    },
  });
  return id;
}

const chartOn = (source: string, measure = `${source}.count`) => ({
  source: { cube: source },
  wells: { measures: [measure], dimensions: [], timeDimensions: [] },
});

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.r = await make('folder', {
    title: 'R',
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: null },
  });
  ids.w = await make('folder', {
    title: 'W',
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.w2 = await make('folder', { title: '2', folderId: ids.w });
  ids.x = await make('folder', { title: 'X', folderId: 'root' });
  await folderXcubeIds(getDb()).of([ids.w, ids.x, ids.w2, ids.r]);
  // Each folder's cube under its own name, as in every folder (T709, AC-328).
  full.wsales = 'wsales';
  full.xsales = 'xsales';
  full.rjoined = 'rjoined';

  ids.chartR = await make('chart', { title: 'R chart', folderId: ids.r, chart: chartOn('orders') });
  ids.dashR = await make('dashboard', {
    title: 'R dashboard',
    folderId: ids.r,
    charts: [ids.chartR],
    filters: [{ member: 'orders.status' }],
  });
  ids.chartW2 = await make('chart', {
    title: 'W2 chart',
    folderId: ids.w2,
    chart: chartOn('orders'),
  });
  ids.dashX = await make('dashboard', { title: 'X dashboard', folderId: ids.x, charts: [] });
  ids.chartW = await make('chart', {
    title: 'W chart',
    folderId: ids.w,
    chart: chartOn(full.wsales),
  });
  ids.dashShowsW = await make('dashboard', {
    title: 'Shows W',
    folderId: ids.r,
    charts: [ids.chartW],
  });
  // Saved by a newer wechart: stored as it is, since reading one back refuses it.
  ids.broken = randomUUID();
  made.push({ kind: 'chart', id: ids.broken });
  await getDb()
    .insertInto('documents')
    .values({
      kind: 'chart',
      id: ids.broken,
      body: JSON.stringify({ title: 'Newer', folderId: ids.r, owner: 'admin', schemaVersion: 999 }),
    })
    .execute();
  ids.dashBroken = await make('dashboard', {
    title: 'Broken chart',
    folderId: ids.r,
    charts: [ids.broken, ids.chartR],
  });

  const files: Record<string, ModelFile[]> = {
    root: [{ path: 'orders.yml', content: 'cubes:\n  - name: orders\n    sql_table: t\n' }],
    [ids.w]: [{ path: 'w.yml', content: 'cubes:\n  - name: wsales\n    sql_table: t\n' }],
    [ids.r]: [{ path: 'r.yml', content: 'cubes:\n  - name: rjoined\n    sql_table: t\n' }],
    [ids.x]: [{ path: 'x.yml', content: 'cubes:\n  - name: xsales\n    sql_table: t\n' }],
  };
  app = buildServer({
    config: secured,
    cube: cube(),
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: {
      list: async (folderId = 'root') => files[folderId] ?? [],
      seed: async () => undefined,
      write: async () => undefined,
    },
    folders: () => folderXcubeIds(getDb()).published(),
    // The one proposal the queries ask for (its store's `get` alone is asked).
    proposals: {
      get: async (id: string) =>
        id === proposalId
          ? {
              id,
              kind: 'chart',
              itemId: 'copy-1',
              title: 'Proposed',
              targetFolderId: ids.w,
              author: { key: 'someone-else', name: 'Someone' },
              description: null,
              proposedAt: new Date(),
              status: 'open',
              replaces: null,
              items: [
                {
                  kind: 'chart',
                  id: 'copy-1',
                  title: 'Proposed',
                  version: 1,
                  snapshot: { title: 'Proposed', chart: chartOn('orders') },
                  landsIn: ids.w,
                  replaces: null,
                },
                // Its author wrote this one naming /X's cube, which no folder it lands in reaches.
                {
                  kind: 'chart',
                  id: 'copy-2',
                  title: 'Naming X',
                  version: 1,
                  snapshot: { title: 'Naming X', chart: chartOn(full.xsales) },
                  landsIn: ids.w,
                  replaces: null,
                },
              ],
              decision: null,
              dismissedAt: null,
            }
          : null,
    } as unknown as NonNullable<Parameters<typeof buildServer>[0]['proposals']>,
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
  // The writer's own chart, in My workspace, made as the app makes one there.
  const mine = await app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: { cookie: cookies['writer']! },
    payload: { kind: 'chart', title: 'Mine', folderId: 'mine', targetFolderId: ids.w },
  });
  expect(mine.statusCode, mine.body).toBe(201);
  ids.mine = mine.json<{ id: string }>().id;
  made.push({ kind: 'chart', id: ids.mine });
  const stored = (await docs().get('chart', ids.mine))!;
  await docs().update({
    kind: 'chart',
    id: ids.mine,
    body: { ...stored.body, chart: chartOn('orders') },
    expectedVersion: stored.version,
  });
});

afterAll(async () => {
  await app.close();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await closeDb();
});

beforeEach(() => {
  asked.length = 0;
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const load = (who: string, query: Record<string, unknown>, item?: { kind: string; id: string }) =>
  as(who, {
    method: 'POST',
    url: '/api/load',
    payload: { query, ...(item === undefined ? {} : { for: item }) },
  });
/** Whether anything but the field list was asked of Cube. */
const queried = () => asked.filter((path) => path !== '/v1/meta');

describe('a query names the item it serves, and is checked before Cube (T340, AC-268)', () => {
  it('answers a reader’s dashboard query on the cubes it uses', async () => {
    const answer = await load(
      'reader',
      { measures: ['orders.count'], dimensions: ['orders.status'] },
      { kind: 'dashboard', id: ids.dashR },
    );
    expect(answer.statusCode, answer.body).toBe(200);
    expect(queried()).toEqual(['/v1/load']);
  });

  it('answers 404 for an item the user may not see, as for one that isn’t there, and asks Cube nothing', async () => {
    for (const item of [
      { kind: 'dashboard', id: ids.dashX },
      { kind: 'dashboard', id: randomUUID() },
      // The writer's own, in their workspace: theirs alone.
      { kind: 'chart', id: ids.mine },
    ]) {
      const answer = await load('reader', { measures: ['orders.count'] }, item);
      expect(answer.statusCode, JSON.stringify(item)).toBe(404);
    }
    expect(queried()).toEqual([]);
  });

  it('answers 403 for a member of a cube the item isn’t bound to, wherever the query names it, and asks Cube nothing', async () => {
    const item = { kind: 'dashboard', id: ids.dashR };
    for (const query of [
      { measures: [`${full.wsales}.count`] },
      { measures: ['orders.count'], dimensions: [`${full.xsales}.status`] },
      { measures: ['orders.count'], timeDimensions: [{ dimension: `${full.wsales}.at` }] },
      { measures: ['orders.count'], segments: [`${full.wsales}.big`] },
      {
        measures: ['orders.count'],
        filters: [{ or: [{ member: 'orders.status' }, { member: `${full.xsales}.status` }] }],
      },
      { measures: ['orders.count'], order: [[`${full.wsales}.count`, 'desc']] },
      { measures: ['orders.count'], order: { [`${full.wsales}.count`]: 'desc' } },
    ]) {
      const answer = await load('reader', query, item);
      expect(answer.statusCode, JSON.stringify(query)).toBe(403);
    }
    expect(queried()).toEqual([]);
  });

  it('answers 400 to a query naming no item, or one it can’t read, but a Super-Admin’s', async () => {
    for (const item of [undefined, { kind: 'folder', id: ids.r }, { kind: 'dashboard' }]) {
      const answer = await load(
        'reader',
        { measures: ['orders.count'] },
        item as { kind: string; id: string } | undefined,
      );
      expect(answer.statusCode, JSON.stringify(item)).toBe(400);
    }
    expect(queried()).toEqual([]);
    expect((await load('super', { measures: [`${full.xsales}.count`] })).statusCode).toBe(200);
    expect(queried()).toEqual(['/v1/load']);
  });

  it('lets a chart the user may change query the cubes on its folder’s path, and no other', async () => {
    const item = { kind: 'chart', id: ids.chartW2 };
    // /W/2's path is /W, then the root: /W's own cube, not yet the chart's.
    expect((await load('writer', { measures: [`${full.wsales}.count`] }, item)).statusCode).toBe(
      200,
    );
    expect((await load('writer', { measures: [`${full.xsales}.count`] }, item)).statusCode).toBe(
      403,
    );
    expect(queried()).toEqual(['/v1/load']);
  });

  it('lets a chart in the user’s workspace query the shared root’s cubes, as its picker offers them', async () => {
    const item = { kind: 'chart', id: ids.mine };
    expect((await load('writer', { measures: ['orders.count'] }, item)).statusCode).toBe(200);
    // Neither on the root's path nor its target's (/W): /X's.
    expect((await load('writer', { measures: [`${full.xsales}.count`] }, item)).statusCode).toBe(
      403,
    );
  });

  it('checks a query’s SQL and its acceleration alike', async () => {
    for (const url of ['/api/sql', '/api/acceleration']) {
      const hidden = await as('reader', {
        method: 'POST',
        url,
        payload: {
          query: { measures: ['orders.count'] },
          for: { kind: 'dashboard', id: ids.dashX },
        },
      });
      const unbound = await as('reader', {
        method: 'POST',
        url,
        payload: {
          query: { measures: [`${full.wsales}.count`] },
          for: { kind: 'dashboard', id: ids.dashR },
        },
      });
      const named = await as('reader', {
        method: 'POST',
        url,
        payload: { query: { measures: ['orders.count'] } },
      });
      expect([hidden.statusCode, unbound.statusCode, named.statusCode], url).toEqual([
        404, 403, 400,
      ]);
    }
    expect(queried()).toEqual([]);
  });

  /**
   * A proposal's review view draws what it holds, whose workspace copy its
   * reviewer can't open (T356): its queries name the proposal, which its
   * author, the read-write members of every folder it lands in and the
   * Super-Admins may open, as its route has it (T351), bound to its items'
   * cubes and those on their folders' paths.
   */
  it('answers a proposal’s review for those who may open it, on its items’ cubes', async () => {
    const item = { kind: 'proposal', id: proposalId };
    expect((await load('writer', { measures: [`${full.wsales}.count`] }, item)).statusCode).toBe(
      200,
    );
    expect((await load('writer', { measures: [`${full.xsales}.count`] }, item)).statusCode).toBe(
      403,
    );
    expect((await load('reader', { measures: ['orders.count'] }, item)).statusCode).toBe(404);
    expect(
      (await load('writer', { measures: ['orders.count'] }, { kind: 'proposal', id: 'gone' }))
        .statusCode,
    ).toBe(404);
  });

  /**
   * T340's review: a drill asks the cubes joined to a tile's (AC-236, AC-237),
   * which bind along its folder's path, so whoever may open an item may ask
   * the cubes on that path: a reader drills too.
   */
  it('lets a reader drill into a cube on their dashboard’s folder path, and no further', async () => {
    const item = { kind: 'dashboard', id: ids.dashR };
    const drilled = await load(
      'reader',
      { measures: ['orders.count'], dimensions: [`${full.rjoined}.city`] },
      item,
    );
    expect(drilled.statusCode, drilled.body).toBe(200);
    expect((await load('reader', { measures: [`${full.wsales}.count`] }, item)).statusCode).toBe(
      403,
    );
  });

  it('lets a dashboard ask the cubes of a library chart it shows from elsewhere, and names it by the chart too', async () => {
    const shown = await load(
      'reader',
      { measures: [`${full.wsales}.count`] },
      { kind: 'dashboard', id: ids.dashShowsW },
    );
    expect(shown.statusCode, shown.body).toBe(200);
    // Opened through the dashboard that shows it (AC-263).
    const asChart = await load(
      'reader',
      { measures: [`${full.wsales}.count`] },
      { kind: 'chart', id: ids.chartW },
    );
    expect(asChart.statusCode, asChart.body).toBe(200);
  });

  it('answers the rest of a dashboard whose one chart this wechart can’t read', async () => {
    const answer = await load(
      'reader',
      { measures: ['orders.count'] },
      { kind: 'dashboard', id: ids.dashBroken },
    );
    expect(answer.statusCode, answer.body).toBe(200);
  });

  it('refuses, before Cube, a query it can’t read, and reads the cubes a join hint names', async () => {
    const item = { kind: 'dashboard', id: ids.dashR };
    for (const query of [
      [{ measures: [`${full.xsales}.count`] }],
      { measures: [7] },
      { measures: ['orders.count'], filters: [{ member: 7 }] },
      { measures: ['orders.count'], timeDimensions: ['orders.at'] },
    ]) {
      const answer = await as('reader', {
        method: 'POST',
        url: '/api/sql',
        payload: { query, for: item },
      });
      expect(answer.statusCode, JSON.stringify(query)).toBe(400);
    }
    const hinted = await load(
      'reader',
      { measures: ['orders.count'], joinHints: [['orders', full.xsales]] },
      item,
    );
    expect(hinted.statusCode).toBe(403);
    expect(queried()).toEqual([]);
  });

  /**
   * T340's review: what a workspace item's body names is its author's to
   * write, and it is bound to nothing until published. It reaches the
   * shared root's cubes and those on its target folder's path (AC-329),
   * never a cube its body names elsewhere; nor does what a proposal's
   * author wrote in it.
   */
  it('lets no workspace item or proposal reach a cube by naming it', async () => {
    const stored = (await docs().get('chart', ids.mine))!;
    await docs().update({
      kind: 'chart',
      id: ids.mine,
      body: { ...stored.body, chart: chartOn(full.xsales) },
      expectedVersion: stored.version,
    });
    const mine = { kind: 'chart', id: ids.mine };
    expect((await load('writer', { measures: [`${full.xsales}.count`] }, mine)).statusCode).toBe(
      403,
    );
    // Its target is /W: /W's cube, and the root's.
    expect((await load('writer', { measures: [`${full.wsales}.count`] }, mine)).statusCode).toBe(
      200,
    );
    expect(
      (
        await load(
          'writer',
          { measures: [`${full.xsales}.count`] },
          { kind: 'proposal', id: proposalId },
        )
      ).statusCode,
    ).toBe(403);
  });

  it('gives an item’s field list its cubes alone, and none for an item the user may not see', async () => {
    const hidden = await as('reader', {
      method: 'GET',
      url: `/api/meta?for=dashboard:${ids.dashX}`,
    });
    expect(hidden.statusCode).toBe(404);
    const own = await as('reader', { method: 'GET', url: `/api/meta?for=dashboard:${ids.dashR}` });
    expect(own.statusCode).toBe(200);
    expect(own.json<{ cubes: { name: string }[] }>().cubes.map((each) => each.name)).toEqual([
      'orders',
    ]);
  });
});
