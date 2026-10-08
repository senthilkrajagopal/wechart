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
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';

/**
 * T714 (AC-425, AC-272, AC-263, AC-371): every cube or view a chart or a
 * dashboard uses stays in its folder or one above it through every move. A
 * move of a chart, a dashboard or a folder holding them that would leave one
 * using a cube off its new path is refused, naming the item and the cube,
 * and nothing moves. A move rebinds nothing: one that keeps every cube on the
 * path applies, and each stored name stays as it was, a copy a move makes
 * (AC-371) included.
 *
 *   /A <run>       writer read-write; xcube's `fa` keeps `<run>_a`
 *   /A <run>/B     a dashboard whose own chart uses `<run>_a`, and a library chart that does
 *   /A <run>/K     a dashboard whose own chart and filter use the root's `orders`,
 *                  stored as `Orders`, and a library chart that does
 *   /A <run>/F     a dashboard showing /A/F's library chart on `Orders`
 *   /C <run>       writer read-write, beside /A
 *
 * The root's `orders` is kept in xcube's `froot`.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
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

const MARK = `mvp${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const A_CUBE = `${MARK}_a`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = {
  a: '',
  b: '',
  k: '',
  f: '',
  c: '',
  onB: '',
  ownOnB: '',
  libraryInB: '',
  onB2: '',
  libraryInA: '',
  k2: '',
  onK2: '',
  ownOnK2: '',
  libraryInK2: '',
  onK: '',
  ownOnK: '',
  libraryInK: '',
  onF: '',
  libraryInF: '',
};
let app: FastifyInstance;
let cookie = '';

async function doc(kind: DocumentKind, body: Record<string, unknown>) {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}
const definition = (cube: string) => ({
  source: { cube },
  wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
});
const chartBody = (title: string, cube: string, place: Record<string, string>) => ({
  schemaVersion: 1,
  title: `${title} ${MARK}`,
  ...place,
  chart: definition(cube),
});
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
/** A dashboard in a folder, with its own chart on `cube`. */
async function boardWithOwn(title: string, folderId: string, cube: string, extra = {}) {
  const board = await doc('dashboard', { title: `${title} ${MARK}`, folderId, ...extra });
  const own = await doc('chart', chartBody(`Own on ${title}`, cube, { localToDashboardId: board }));
  const stored = (await docs().get('dashboard', board))!;
  await docs().update({
    kind: 'dashboard',
    id: board,
    body: { ...stored.body, pages: showing(own) },
    expectedVersion: stored.version ?? 0,
  });
  return { board, own };
}

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie } });
const move = (kind: DocumentKind, id: string, folderId: string) =>
  as({ method: 'PATCH', url: `/api/documents/${kind}/${id}`, payload: { folderId } });
const bodyOf = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!.body;

beforeAll(async () => {
  const rw = { readOnly: null, readWrite: ['sales-rw'] };
  ids.a = await doc('folder', { title: `A ${MARK}`, folderId: 'root', access: rw });
  ids.b = await doc('folder', { title: `B ${MARK}`, folderId: ids.a });
  ids.k = await doc('folder', { title: `K ${MARK}`, folderId: ids.a });
  ids.f = await doc('folder', { title: `F ${MARK}`, folderId: ids.a });
  ids.c = await doc('folder', { title: `C ${MARK}`, folderId: 'root', access: rw });

  ({ board: ids.onB, own: ids.ownOnB } = await boardWithOwn('On B', ids.b, A_CUBE));
  ids.libraryInB = await doc('chart', chartBody('In B', A_CUBE, { folderId: ids.b }));
  // On /A/B's path now; off it, and its copy with it, once /A/B is under /C.
  ids.libraryInA = await doc('chart', chartBody('In A', A_CUBE, { folderId: ids.a }));
  ids.onB2 = await doc('dashboard', {
    title: `On B2 ${MARK}`,
    folderId: ids.b,
    pages: showing(ids.libraryInA),
  });
  ids.k2 = await doc('folder', { title: `K2 ${MARK}`, folderId: ids.a });
  ({ board: ids.onK2, own: ids.ownOnK2 } = await boardWithOwn('On K2', ids.k2, 'Orders', {
    filters: [{ id: 'f1', widget: 'list', member: 'Orders.status' }],
  }));
  ids.libraryInK2 = await doc('chart', chartBody('In K2', 'Orders', { folderId: ids.k2 }));
  ({ board: ids.onK, own: ids.ownOnK } = await boardWithOwn('On K', ids.k, 'Orders', {
    filters: [{ id: 'f1', widget: 'list', member: 'Orders.status' }],
  }));
  ids.libraryInK = await doc('chart', chartBody('In K', 'Orders', { folderId: ids.k }));
  ids.libraryInF = await doc('chart', chartBody('In F', 'Orders', { folderId: ids.f }));
  ids.onF = await doc('dashboard', {
    title: `On F ${MARK}`,
    folderId: ids.f,
    pages: showing(ids.libraryInF),
  });

  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: config.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fb', parentId: 'fa' },
    { id: 'fk', parentId: 'fa' },
    { id: 'fk2', parentId: 'fa' },
    { id: 'ff', parentId: 'fa' },
    { id: 'fc', parentId: 'froot' },
  ]);
  const cube = (folderId: string, name: string) => ({
    folderId,
    name,
    kind: 'cube' as const,
    yaml: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`,
  });
  stub.holdItems('dev', [cube('froot', 'orders'), cube('fa', A_CUBE)]);
  app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    xcube: admin,
    // wechart's tree as it is now: a folder's move is read from it.
    folders: async () => {
      const parentOf = async (id: string) => {
        const parent = (await docs().get('folder', id))?.body['folderId'];
        return typeof parent === 'string' ? parent : null;
      };
      return {
        ids: new Map([
          ['root', 'froot'],
          [ids.a, 'fa'],
          [ids.b, 'fb'],
          [ids.k, 'fk'],
          [ids.k2, 'fk2'],
          [ids.f, 'ff'],
          [ids.c, 'fc'],
        ]),
        parents: new Map<string, string | null>([
          ['root', null],
          [ids.a, 'root'],
          [ids.b, await parentOf(ids.b)],
          [ids.k, await parentOf(ids.k)],
          [ids.k2, await parentOf(ids.k2)],
          [ids.f, await parentOf(ids.f)],
          [ids.c, 'root'],
        ]),
      };
    },
  });
  cookie = await signIn(app, USERS['writer']!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const { kind, id } of made.reverse()) {
    if (kind === 'dashboard')
      for (const chart of await docs().localTo(id)) await docs().remove('chart', chart.id);
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  }
  await closeDb();
});

const STRANDED = (title: string, extra: Record<string, unknown> = {}) => ({
  title: `${title} ${MARK}`,
  names: [A_CUBE],
  ...extra,
});

describe('a move that would leave a chart or dashboard using a cube off its path (T714, AC-425)', () => {
  it('refuses moving the dashboard from /A/B to /C, naming its chart and the cube, and moves nothing', async () => {
    const before = await bodyOf('dashboard', ids.onB);
    const answer = await move('dashboard', ids.onB, ids.c);

    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      error: `Moved, “Own on On B ${MARK}” on “On B ${MARK}” would use “${A_CUBE}”, which isn’t in its folder or one above it. Nothing was moved.`,
      stranded: [
        {
          kind: 'chart',
          id: ids.ownOnB,
          ...STRANDED('Own on On B', { dashboard: `On B ${MARK}` }),
        },
      ],
    });
    expect(await bodyOf('dashboard', ids.onB)).toEqual(before);
  });

  it('refuses moving /A/B under /C, naming each chart left off its cube’s path, a copy’s included, and moves nothing', async () => {
    const before = await bodyOf('dashboard', ids.onB2);
    const answer = await move('folder', ids.b, ids.c);

    expect(answer.statusCode, answer.body).toBe(422);
    const said = answer.json<{ error: string; stranded: { id: string }[] }>();
    expect(said.stranded).toEqual(
      expect.arrayContaining([
        { kind: 'chart', id: ids.libraryInB, ...STRANDED('In B') },
        {
          kind: 'chart',
          id: ids.ownOnB,
          ...STRANDED('Own on On B', { dashboard: `On B ${MARK}` }),
        },
        // /A's chart, which On B2 would show as its own copy (AC-371), its cube off the path.
        {
          kind: 'chart',
          id: ids.libraryInA,
          ...STRANDED('In A', { dashboard: `On B2 ${MARK}` }),
        },
      ]),
    );
    expect(said.stranded).toHaveLength(3);
    expect(said.error).toContain(
      `“In B ${MARK}” would use “${A_CUBE}”, which isn’t in its folder or one above it`,
    );
    expect(said.error).toContain(
      `“In A ${MARK}” on “On B2 ${MARK}” would use “${A_CUBE}”, which isn’t in its folder or one above it`,
    );
    expect(said.error).toMatch(/Nothing was moved\.$/);
    expect((await bodyOf('folder', ids.b))['folderId']).toBe(ids.a);
    expect(await bodyOf('dashboard', ids.onB2)).toEqual(before);
    expect(await docs().localTo(ids.onB2)).toEqual([]);
  });

  it('refuses moving the library chart from /A/B to /C, naming it and the cube', async () => {
    const answer = await move('chart', ids.libraryInB, ids.c);

    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      error: `Moved, “In B ${MARK}” would use “${A_CUBE}”, which isn’t in its folder or one above it. Nothing was moved.`,
      stranded: [{ kind: 'chart', id: ids.libraryInB, ...STRANDED('In B') }],
    });
    expect((await bodyOf('chart', ids.libraryInB))['folderId']).toBe(ids.b);
  });
});

describe('a move that keeps every cube on the path (T714, AC-272)', () => {
  it('moves the dashboard to /C and changes no stored name, its own chart’s or its filter’s', async () => {
    const own = await bodyOf('chart', ids.ownOnK);
    const board = await bodyOf('dashboard', ids.onK);

    const answer = await move('dashboard', ids.onK, ids.c);

    expect(answer.statusCode, answer.body).toBe(200);
    expect(await bodyOf('dashboard', ids.onK)).toEqual({ ...board, folderId: ids.c });
    expect(await bodyOf('chart', ids.ownOnK)).toEqual(own);
  });

  it('moves the library chart to /C, and changes no stored name', async () => {
    const chart = await bodyOf('chart', ids.libraryInK);

    const moved = await move('chart', ids.libraryInK, ids.c);
    expect(moved.statusCode, moved.body).toBe(200);
    expect(await bodyOf('chart', ids.libraryInK)).toEqual({ ...chart, folderId: ids.c });
  });

  it('moves /A/K2 under /C with its dashboard, own chart and library chart, changing no stored name', async () => {
    const before = await Promise.all([
      bodyOf('dashboard', ids.onK2),
      bodyOf('chart', ids.ownOnK2),
      bodyOf('chart', ids.libraryInK2),
    ]);

    const folder = await move('folder', ids.k2, ids.c);

    expect(folder.statusCode, folder.body).toBe(200);
    expect((await bodyOf('folder', ids.k2))['folderId']).toBe(ids.c);
    expect(
      await Promise.all([
        bodyOf('dashboard', ids.onK2),
        bodyOf('chart', ids.ownOnK2),
        bodyOf('chart', ids.libraryInK2),
      ]),
    ).toEqual(before);
  });

  it('gives a dashboard moved off its library chart’s path a copy that keeps the chart’s names (AC-371)', async () => {
    const answer = await move('dashboard', ids.onF, ids.c);

    expect(answer.statusCode, answer.body).toBe(200);
    const [copy] = await docs().localTo(ids.onF);
    expect(copy).toBeDefined();
    expect((await bodyOf('chart', copy!.id))['chart'] as unknown).toEqual(definition('Orders'));
  });
});
