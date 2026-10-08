import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
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
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { publishedTree, xcubeIdOf } from '../xcube/folders';
import { itemsOf } from '../xcube/items';
import { publicationStore } from '../xcube/publications';
import { modelSync } from '../xcube/snapshot';

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

/**
 * T715 (AC-425, AC-291, AC-275, AC-322): a folder's move that would leave a
 * cube on a data source, or a join, `extends` or view to a cube, off its
 * folder's path is refused as xcube refuses its tree (`409
 * data_source_range` / `reference_range`; research `xcube-256d632371.md`,
 * "On `PUT …/folders`"), naming the cubes the mover may see, and nothing
 * moves, in wechart or in xcube's tree. A move keeping every reference
 * applies and rebinds nothing.
 *
 *   /MA <run>        writer read-write; the data source `<run>_wh` and the cube `<run>_base`
 *   /MA <run>/MB     `<run>_joiner`, joining `<run>_base`, and `<run>_on_wh`, on `<run>_wh`
 *   /MA <run>/MK     `<run>_alone`, referring to nothing
 *   /MA <run>/ME     nothing of a model's
 *   /MC <run>        writer read-write, beside /MA
 */
describe('a folder’s move that would leave a model referring off its path (T715, AC-425)', () => {
  const RUN = MARK.toLowerCase();
  const names = {
    wh: `${RUN}_wh`,
    base: `${RUN}_base`,
    joiner: `${RUN}_joiner`,
    onWh: `${RUN}_on_wh`,
    alone: `${RUN}_alone`,
    joinsToo: `${RUN}_joins_too`,
  };
  const at = { ma: '', mb: '', mk: '', me: '', mj: '', mc: '' };
  const files = () => modelFileStore(getDb());
  const sources = () => dataSourceStore(getDb());
  const stub = fakeXcube();
  let models: FastifyInstance;
  let writer = '';
  const asWriter = (options: InjectOptions) =>
    models.inject({ ...options, headers: { ...options.headers, cookie: writer } });
  const sealed = (tag: string): SealedV1 => ({
    v: 1,
    kid: 'kid-1',
    enc: Buffer.alloc(32, `enc-${tag}`).toString('base64url'),
    ct: Buffer.alloc(272, `ct-${tag}`).toString('base64url'),
  });
  const cubeYaml = (name: string, lines: readonly string[] = []) =>
    ['cubes:', `  - name: ${name}`, `    sql_table: public.${name}`, ...lines, ''].join('\n');
  /** Ours, as wechart's store has them now. */
  const ourFolders = async () =>
    Promise.all(
      Object.values(at).map(async (id) => ({
        id,
        parentId: ((await docs().get('folder', id))?.body['folderId'] as string) ?? null,
      })),
    );
  const xids = () => new Map(['root', ...Object.values(at)].map((id) => [id, xcubeIdOf(id)!]));
  const tree = async (moving?: { folder: string; to: string }) =>
    publishedTree(
      (await ourFolders()).map((folder) =>
        folder.id === moving?.folder ? { ...folder, parentId: moving.to } : folder,
      ),
      xids(),
    );
  const parentOf = async (folderId: string) =>
    stub.tree('dev')?.find((folder) => folder.id === xcubeIdOf(folderId))?.parentId;

  beforeAll(async () => {
    const rw = { readOnly: null, readWrite: ['sales-rw'] };
    at.ma = await doc('folder', { title: `MA ${MARK}`, folderId: 'root', access: rw });
    at.mb = await doc('folder', { title: `MB ${MARK}`, folderId: at.ma });
    at.mk = await doc('folder', { title: `MK ${MARK}`, folderId: at.ma });
    at.me = await doc('folder', { title: `ME ${MARK}`, folderId: at.ma });
    at.mj = await doc('folder', { title: `MJ ${MARK}`, folderId: at.ma });
    at.mc = await doc('folder', { title: `MC ${MARK}`, folderId: 'root', access: rw });
    await sources().create({
      folderId: at.ma,
      name: names.wh,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed(names.wh) },
    });
    await files().write([
      { folderId: at.ma, path: `cubes/${names.base}.yml`, content: cubeYaml(names.base) },
      {
        folderId: at.mb,
        path: `cubes/${names.joiner}.yml`,
        content: cubeYaml(names.joiner, [
          '    joins:',
          `      - name: ${names.base}`,
          `        sql: "{CUBE}.id = {${names.base}}.id"`,
          '        relationship: many_to_one',
        ]),
      },
      {
        folderId: at.mb,
        path: `cubes/${names.onWh}.yml`,
        content: cubeYaml(names.onWh, [`    data_source: ${names.wh}`]),
      },
      { folderId: at.mk, path: `cubes/${names.alone}.yml`, content: cubeYaml(names.alone) },
      {
        folderId: at.mj,
        path: `cubes/${names.joinsToo}.yml`,
        content: cubeYaml(names.joinsToo, [
          '    joins:',
          `      - name: ${names.base}`,
          `        sql: "{CUBE}.id = {${names.base}}.id"`,
          '        relationship: many_to_one',
        ]),
      },
    ]);

    const admin = xcubeAdmin({
      cubeApiUrl: config.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    });
    await admin.folders(await tree());
    stub.holdConnections('dev', [{ folderId: xcubeIdOf(at.ma)!, name: names.wh }]);
    stub.holdItems('dev', itemsOf(await files().inFolders(Object.values(at)), xids()));
    const sync = modelSync({
      model: 'dev',
      admin,
      files: () => files().inFolders(Object.values(at)),
      tree,
      publications: publicationStore(getDb()),
      log: { warn: () => undefined, info: () => undefined },
    });
    models = buildServer({
      config,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      modelFiles: files(),
      dataSources: sources(),
      xcube: admin,
      folders: async () => ({
        ids: xids(),
        parents: new Map<string, string | null>([
          ['root', null],
          ...(await ourFolders()).map((folder) => [folder.id, folder.parentId] as const),
        ]),
      }),
      checkFolderMove: (move) => sync.checkMove(move),
      afterFolderChange: () => sync.pushTree('folder'),
    });
    writer = await signIn(models, USERS['writer']!);
  });

  afterAll(async () => {
    if (models !== undefined) await models.close();
    const ours = Object.values(at).filter((id) => id !== '');
    await getDb().deleteFrom('model_files').where('folder_id', 'in', ours).execute();
    await getDb().deleteFrom('data_sources').where('folder_id', 'in', ours).execute();
  });

  const moveFolder = (id: string, to: string) =>
    asWriter({ method: 'PATCH', url: `/api/documents/folder/${id}`, payload: { folderId: to } });

  it('refuses moving /MA/MB under /MC, naming its cubes cut off from their data source and their join, and moves nothing', async () => {
    const answer = await moveFolder(at.mb, at.mc);

    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      error: `Moved, “${names.onWh}” would use a data source that isn’t in its folder or one above it; “${names.joiner}” would refer to a cube that isn’t in its folder or one above it. Nothing was moved.`,
      stranded: [
        { kind: 'cube', name: names.onWh, uses: 'data source' },
        { kind: 'cube', name: names.joiner, uses: 'cube' },
      ],
    });
    // Neither what it uses nor where that is.
    expect(answer.body).not.toContain(names.wh);
    expect(answer.body).not.toContain(xcubeIdOf(at.ma)!);
    expect((await bodyOf('folder', at.mb))['folderId']).toBe(at.ma);
    expect(await parentOf(at.mb)).toBe(xcubeIdOf(at.ma));
  });

  it('moves /MA/MK under /MC, in wechart and in xcube’s tree, its model as it was (AC-275)', async () => {
    const before = await files().inFolders([at.mk]);

    const answer = await moveFolder(at.mk, at.mc);

    expect(answer.statusCode, answer.body).toBe(200);
    expect((await bodyOf('folder', at.mk))['folderId']).toBe(at.mc);
    expect(await parentOf(at.mk)).toBe(xcubeIdOf(at.mc));
    expect(await files().inFolders([at.mk])).toEqual(before);
    expect(stub.head('dev')?.items.find((item) => item.name === names.alone)?.folderId).toBe(
      xcubeIdOf(at.mk),
    );
  });

  it('moves /MA/MJ under /MA/MB, its join still on its path, rebinding nothing (AC-275)', async () => {
    const before = await files().inFolders([at.mj]);
    const held = () => stub.head('dev')?.items.find((item) => item.name === names.joinsToo);
    const was = held();
    expect(was).toBeDefined();

    const answer = await moveFolder(at.mj, at.mb);

    expect(answer.statusCode, answer.body).toBe(200);
    expect((await bodyOf('folder', at.mj))['folderId']).toBe(at.mb);
    expect(await parentOf(at.mj)).toBe(xcubeIdOf(at.mb));
    expect(await files().inFolders([at.mj])).toEqual(before);
    expect(held()).toEqual(was);
  });

  it('refuses a move of a folder holding a model while xcube can’t be asked, and moves nothing', async () => {
    stub.down(true);
    try {
      const answer = await moveFolder(at.mb, at.mc);
      expect(answer.statusCode, answer.body).toBe(502);
      expect(answer.json()).toEqual({
        error:
          'xcube could not be asked whether this move leaves a model referring off its folder’s path, so nothing was moved.',
      });
      expect((await bodyOf('folder', at.mb))['folderId']).toBe(at.ma);

      // One holding no model or data source isn't asked.
      const plain = await moveFolder(at.me, at.mc);
      expect(plain.statusCode, plain.body).toBe(200);
      expect((await bodyOf('folder', at.me))['folderId']).toBe(at.mc);
    } finally {
      stub.down(false);
    }
  });
});
