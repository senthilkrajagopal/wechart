import { randomUUID } from 'node:crypto';

import { DRIVERS, type SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog, ROOT_FOLDER_ID } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { buildServer } from '../server';
import { xcubeIdOf, XCUBE_ROOT } from '../xcube/folders';

/**
 * T511 (AC-354, AC-355): exporting a dashboard.
 *
 * - AC-354: the dependencies offered are the library charts the dashboard
 *   shows, the models its charts use and the data sources those bind to, each
 *   with what uses it, of those the user may see; those in folders they may
 *   not see are counted, never named. The file is JSON, and holds the
 *   dashboard, its own charts and what was chosen, nothing else.
 * - AC-355: a data source goes with its driver, settings and description, and
 *   never a secret, its envelope or its revision.
 *
 * /Sales (`sales-rw` writes it, `sales-ro` reads it) holds the dashboard, its
 * library chart Top products, the model `sales` bound to its data source
 * `emea`. The root holds `orders`, which joins `customers`, both bound to the
 * root's `dw`. /Hidden is `managers`' alone: its library chart Margin trend
 * is on the dashboard, and its model and data source are no one else's.
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

const MARK = `export${randomUUID().slice(0, 8)}`;
/** Sized as xcube takes an envelope; its bytes are this test's own, to be looked for. */
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const names = {
  sales: `${MARK}_sales`,
  orders: `${MARK}_orders`,
  customers: `${MARK}_customers`,
  margin: `${MARK}_margin`,
  emea: `${MARK}_emea`,
  dw: `${MARK}_dw`,
  secret: `${MARK}_secret`,
};
const cube = (name: string, extra: string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    ...extra,
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');
const paths = {
  sales: `${MARK}/sales.yml`,
  orders: `${MARK}/orders.yml`,
  customers: `${MARK}/customers.yml`,
  margin: `${MARK}/margin.yml`,
  base: `${MARK}/base.yml`,
  extended: `${MARK}/extended.yml`,
};

const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const held: string[] = [];
const ids = {
  sales: '',
  hidden: '',
  board: '',
  own1: '',
  own2: '',
  top: '',
  margin: '',
  emea: '',
  dw: '',
  secret: '',
  /** A second dashboard: a cube that extends another, its own filter, a chart no one else may open. */
  board2: '',
  extended: '',
  theirs: '',
  salesDw: '',
};
let app: FastifyInstance;
const cookies: Record<string, string> = {};
let rootBefore: StoredDocument | null = null;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}
const chart = (title: string, cubeName: string, place: Record<string, unknown>) => ({
  schemaVersion: 1,
  title,
  ...place,
  chart: {
    source: { cube: cubeName },
    wells: { measures: [`${cubeName}.count`], dimensions: [], timeDimensions: [] },
    chartType: 'bar',
  },
});
async function source(folderId: string, name: string) {
  const { id } = await sources().create({
    folderId,
    name,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: `${name}.db`, port: 5432, database: 'sales', user: 'cube', ssl: true },
    sealed: { password: sealed(name) },
  });
  held.push(id);
  await sources().update(id, { description: `What ${name} is for.` });
  return id;
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: ROOT_FOLDER_ID,
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.hidden = await doc('folder', {
    title: `Hidden ${MARK}`,
    folderId: ROOT_FOLDER_ID,
    access: { readOnly: null, readWrite: ['managers'] },
  });
  await files().seed([
    {
      folderId: ids.sales,
      path: paths.sales,
      content: cube(names.sales, [`    data_source: ${names.emea}`]),
    },
    {
      folderId: ROOT_FOLDER_ID,
      path: paths.orders,
      content: cube(names.orders, [
        `    data_source: ${names.dw}`,
        '    joins:',
        `      - name: ${names.customers}`,
        '        relationship: many_to_one',
        `        sql: "{CUBE}.customer_id = {${names.customers}}.id"`,
      ]),
    },
    {
      folderId: ROOT_FOLDER_ID,
      path: paths.customers,
      content: cube(names.customers, [`    data_source: ${names.dw}`]),
    },
    {
      folderId: ids.hidden,
      path: paths.margin,
      content: cube(names.margin, [`    data_source: ${names.secret}`]),
    },
  ]);
  ids.emea = await source(ids.sales, names.emea);
  ids.dw = await source(ROOT_FOLDER_ID, names.dw);
  ids.secret = await source(ids.hidden, names.secret);
  // Sales's own `dw`: never what a cube extending the root's `base` binds to.
  ids.salesDw = await source(ids.sales, names.dw);
  await files().seed([
    {
      folderId: ROOT_FOLDER_ID,
      path: paths.base,
      content: cube(`${MARK}_base`, [`    data_source: ${names.dw}`]),
    },
    {
      folderId: ids.sales,
      path: paths.extended,
      content: [
        'cubes:',
        `  - name: ${MARK}_ext`,
        `    extends: ${MARK}_base`,
        '    measures:',
        '      - name: total',
        '        type: count',
        '',
      ].join('\n'),
    },
  ]);

  ids.board = randomUUID();
  ids.own1 = await doc('chart', chart('Revenue', names.sales, { localToDashboardId: ids.board }));
  // Bound, by its one name (AC-328, T709).
  ids.own2 = await doc('chart', chart('Orders', names.sales, { localToDashboardId: ids.board }));
  ids.top = await doc('chart', chart('Top products', names.orders, { folderId: ids.sales }));
  ids.margin = await doc('chart', chart('Margin trend', names.margin, { folderId: ids.hidden }));
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title: `Revenue overview ${MARK}`,
      folderId: ids.sales,
      pages: [
        {
          id: 'p1',
          items: [
            { id: 't1', kind: 'chart', chartId: ids.own1, w: 6, h: 40 },
            { id: 't2', kind: 'chart', chartId: ids.own2, w: 6, h: 40 },
            {
              id: 's1',
              kind: 'section',
              title: 'More',
              items: [
                { id: 't3', kind: 'chart', chartId: ids.top, w: 6, h: 40 },
                { id: 't4', kind: 'chart', chartId: ids.margin, w: 6, h: 40 },
              ],
            },
          ],
        },
      ],
      charts: [ids.own1, ids.own2],
    },
    ids.board,
  );
  ids.board2 = randomUUID();
  ids.extended = await doc(
    'chart',
    chart('Extended', `${MARK}_ext`, { localToDashboardId: ids.board2 }),
  );
  // In another's workspace: theirs alone, whatever shows it (AC-276).
  ids.theirs = await doc('chart', chart('Theirs', names.orders, { folderId: 'ws:someone-else' }));
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title: `Extended ${MARK}`,
      folderId: ids.sales,
      filters: [{ id: 'f1', member: `${names.customers}.count` }],
      pages: [
        {
          id: 'p1',
          items: [
            { id: 't1', kind: 'chart', chartId: ids.extended, w: 6, h: 40 },
            { id: 't2', kind: 'chart', chartId: ids.theirs, w: 6, h: 40 },
          ],
        },
      ],
      charts: [ids.extended],
    },
    ids.board2,
  );

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    dataSources: sources(),
    // Where each folder's cubes are published, for the full names charts store.
    folders: async () => ({
      ids: new Map([
        [ROOT_FOLDER_ID, XCUBE_ROOT],
        [ids.sales, xcubeIdOf(ids.sales)!],
        [ids.hidden, xcubeIdOf(ids.hidden)!],
      ]),
      parents: new Map([
        [ROOT_FOLDER_ID, null],
        [ids.sales, ROOT_FOLDER_ID],
        [ids.hidden, ROOT_FOLDER_ID],
      ]),
    }),
  });
  for (const who of ['writer', 'reader', 'nobody']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const id of held) await sources().remove(id);
  for (const path of Object.values(paths)) {
    for (const folderId of [ROOT_FOLDER_ID, ids.sales, ids.hidden])
      if (folderId !== '') await files().remove(folderId, path);
  }
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

interface Offered {
  dashboard: { id: string; title: string; version: number; path: string[] | null };
  fileName: string;
  ownCharts: { id: string; title: string }[];
  libraryCharts: { id: string; title: string; path: string[] | null; chartIds: string[] }[];
  models: {
    id: string;
    path: string;
    folderPath: string[];
    chartIds: string[];
    byDashboard: boolean;
  }[];
  dataSources: {
    id: string;
    name: string;
    driver: string;
    folderPath: string[];
    boundBy: string[];
    chartIds: string[];
  }[];
  notOffered: { models: number; dataSources: number; folders: number; usedBy: string[] };
  viewOnly: boolean;
}
const offered = async (who: string) => {
  const answer = await as(who, { method: 'GET', url: `/api/export/dashboards/${ids.board}` });
  expect(answer.statusCode, answer.body).toBe(200);
  return { body: answer.json<Offered>(), text: answer.body };
};
const exported = (who: string, chosen: Record<string, string[]>) =>
  as(who, {
    method: 'POST',
    url: `/api/export/dashboards/${ids.board}`,
    payload: chosen,
  });
const byId = <T extends { id: string }>(list: readonly T[]) =>
  new Map(list.map((each) => [each.id, each]));

describe('what a dashboard’s export offers (T511, AC-354)', () => {
  it('offers the library charts it shows, the models its charts use and the data sources those bind to, each with what uses it', async () => {
    const { body } = await offered('writer');
    expect(body.dashboard).toEqual({
      id: ids.board,
      title: `Revenue overview ${MARK}`,
      version: 1,
      path: [`Sales ${MARK}`],
    });
    expect(body.fileName).toBe(`revenue-overview-${MARK}.wechart.json`);
    expect(body.ownCharts.map((each) => each.id).sort()).toEqual([ids.own1, ids.own2].sort());

    // Both library charts: Margin trend is on the dashboard, so theirs to see,
    // but its folder isn't named.
    const library = byId(body.libraryCharts);
    expect([...library.keys()].sort()).toEqual([ids.top, ids.margin].sort());
    expect(library.get(ids.top)).toEqual({
      id: ids.top,
      title: 'Top products',
      path: [`Sales ${MARK}`],
      chartIds: [ids.top],
    });
    expect(library.get(ids.margin)).toEqual({
      id: ids.margin,
      title: 'Margin trend',
      path: null,
      chartIds: [ids.margin],
    });

    // `sales` by both own charts (one by its full name), `orders` by Top
    // products, and `customers`, which `orders` joins, with it.
    const models = new Map(body.models.map((model) => [model.path, model]));
    expect([...models.keys()].sort()).toEqual([paths.customers, paths.orders, paths.sales].sort());
    expect(models.get(paths.sales)!.folderPath).toEqual([`Sales ${MARK}`]);
    expect(models.get(paths.sales)!.chartIds.sort()).toEqual([ids.own1, ids.own2].sort());
    expect(models.get(paths.orders)!.folderPath).toEqual([]);
    expect(models.get(paths.orders)!.chartIds).toEqual([ids.top]);
    expect(models.get(paths.customers)!.chartIds).toEqual([ids.top]);

    const bound = byId(body.dataSources);
    expect([...bound.keys()].sort()).toEqual([ids.emea, ids.dw].sort());
    expect(bound.get(ids.emea)).toMatchObject({
      name: names.emea,
      driver: 'postgres',
      folderPath: [`Sales ${MARK}`],
      boundBy: [paths.sales],
    });
    expect(bound.get(ids.emea)!.chartIds.sort()).toEqual([ids.own1, ids.own2].sort());
    expect(bound.get(ids.dw)!.boundBy.sort()).toEqual([paths.customers, paths.orders].sort());
    expect(bound.get(ids.dw)!.chartIds).toEqual([ids.top]);
    expect(body.viewOnly).toBe(false);
  });

  it('counts, and never names, what is in folders the user may not see', async () => {
    const { body, text } = await offered('writer');
    expect(body.notOffered).toEqual({
      charts: 0,
      models: 1,
      dataSources: 1,
      folders: 1,
      usedBy: ['Margin trend'],
    });
    for (const hidden of [paths.margin, names.margin, names.secret, `Hidden ${MARK}`, ids.hidden])
      expect(text).not.toContain(hidden);
  });

  it('offers a reader the charts on the dashboard, and no model or data source', async () => {
    const { body, text } = await offered('reader');
    expect(body.viewOnly).toBe(true);
    expect(body.libraryCharts.map((each) => each.id).sort()).toEqual([ids.top, ids.margin].sort());
    expect(body.models).toEqual([]);
    expect(body.dataSources).toEqual([]);
    for (const hidden of [paths.sales, names.emea, names.dw, paths.orders])
      expect(text).not.toContain(hidden);
  });

  it('offers a cube’s parent’s data source for a cube that extends it, and the models the dashboard’s own filters use', async () => {
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/export/dashboards/${ids.board2}`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const body = answer.json<Offered>();
    const models = new Map(body.models.map((model) => [model.path, model]));
    expect([...models.keys()].sort()).toEqual([paths.base, paths.customers, paths.extended].sort());
    expect(models.get(paths.extended)!.chartIds).toEqual([ids.extended]);
    expect(models.get(paths.base)!.chartIds).toEqual([ids.extended]);
    // Its filter's cube, used by the dashboard itself and by no chart.
    expect(models.get(paths.customers)).toMatchObject({ chartIds: [], byDashboard: true });
    expect(models.get(paths.extended)!.byDashboard).toBe(false);
    // The root's `dw`, which `base` names and `ext` inherits: never Sales's.
    expect(body.dataSources.map((each) => each.id).sort()).toEqual([ids.dw]);
  });

  it('neither offers nor names a chart on the dashboard the user may not open, and counts it', async () => {
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/export/dashboards/${ids.board2}`,
    });
    const body = answer.json<Offered>();
    expect(body.libraryCharts).toEqual([]);
    expect(body.ownCharts.map((each) => each.id)).toEqual([ids.extended]);
    expect(body.notOffered).toMatchObject({ charts: 1 });
    expect(answer.body).not.toContain('Theirs');
    expect(answer.body).not.toContain(ids.theirs);
    const file = await as('writer', {
      method: 'POST',
      url: `/api/export/dashboards/${ids.board2}`,
      payload: { libraryCharts: [ids.theirs], models: [], dataSources: [] },
    });
    expect(file.statusCode).toBe(400);
  });

  it('is no one’s to export who may not see the dashboard', async () => {
    const answer = await as('nobody', {
      method: 'GET',
      url: `/api/export/dashboards/${ids.board}`,
    });
    expect(answer.statusCode).toBe(404);
    const file = await exported('nobody', { libraryCharts: [], models: [], dataSources: [] });
    expect(file.statusCode).toBe(404);
  });
});

describe('the export file (T511, AC-354, AC-355)', () => {
  interface Item {
    kind: string;
    id?: string;
    title?: string;
    path?: string;
    name?: string;
    body?: Record<string, unknown>;
    [key: string]: unknown;
  }
  const fileOf = (text: string) =>
    JSON.parse(text) as { format: string; version: number; exportedAt: string; items: Item[] };

  it('is JSON holding the dashboard, its own charts and every dependency chosen', async () => {
    const { body } = await offered('writer');
    const answer = await exported('writer', {
      libraryCharts: body.libraryCharts.map((each) => each.id),
      models: body.models.map((each) => each.id),
      dataSources: body.dataSources.map((each) => each.id),
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^application\/json/);
    const file = fileOf(answer.body);
    expect(file.format).toBe('wechart-export');
    expect(file.version).toBe(1);
    const kinds = file.items.map((item) => item.kind);
    expect(kinds.filter((kind) => kind === 'dashboard')).toHaveLength(1);
    const dashboard = file.items.find((item) => item.kind === 'dashboard')!;
    expect(dashboard.id).toBe(ids.board);
    expect(dashboard.title).toBe(`Revenue overview ${MARK}`);
    // As saved, without where it was or whose.
    expect(dashboard.body!['pages']).toEqual(
      ((await docs().get('dashboard', ids.board))!.body as { pages: unknown }).pages,
    );
    for (const place of ['folderId', 'owner', 'targetFolderId', 'origin'])
      expect(Object.keys(dashboard.body!)).not.toContain(place);

    const charts = file.items.filter((item) => item.kind === 'chart');
    expect(charts.map((item) => item.id).sort()).toEqual(
      [ids.own1, ids.own2, ids.top, ids.margin].sort(),
    );
    expect(charts.find((item) => item.id === ids.own1)!['dashboardId']).toBe(ids.board);
    expect(Object.keys(charts.find((item) => item.id === ids.top)!)).not.toContain('dashboardId');
    const models = file.items.filter((item) => item.kind === 'model');
    expect(models.map((item) => item.path).sort()).toEqual(
      [paths.customers, paths.orders, paths.sales].sort(),
    );
    expect(models.find((item) => item.path === paths.sales)!['content']).toBe(
      cube(names.sales, [`    data_source: ${names.emea}`]),
    );
    expect(
      file.items
        .filter((item) => item.kind === 'data-source')
        .map((item) => item.name)
        .sort(),
    ).toEqual([names.dw, names.emea].sort());
  });

  it('holds a data source’s driver, settings and description, and never a secret, envelope or revision', async () => {
    const answer = await exported('writer', {
      libraryCharts: [],
      models: [],
      dataSources: [ids.emea],
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const chosen = fileOf(answer.body).items.filter((each) => each.kind === 'data-source');
    // The one chosen, and not `dw`, which wasn't.
    expect(chosen).toHaveLength(1);
    const item = chosen[0]!;
    const stored = (await sources().get(ids.emea))!;
    expect(item).toEqual({
      kind: 'data-source',
      name: names.emea,
      driver: 'postgres',
      authMethod: 'password',
      fields: stored.fields,
      description: `What ${names.emea} is for.`,
    });
    // Every setting it has, and none of its driver's secrets.
    const secrets = [
      ...DRIVERS.postgres.connection,
      ...DRIVERS.postgres.auth.flatMap((m) => m.fields),
    ]
      .filter((field) => field.secret === true)
      .map((field) => field.key);
    for (const key of secrets) expect(Object.keys(item['fields'] as object)).not.toContain(key);
    // Not the envelope's bytes, anywhere, nor its revision.
    const envelope = sealed(names.emea);
    expect(answer.body).not.toContain(envelope.ct);
    expect(answer.body).not.toContain(envelope.enc);
    const { sealed: kept } = await sources().sealedOf(ids.emea);
    expect(Object.keys(kept)).toEqual(['password']);
    const revisions = (await sources().withSealed(ids.emea))!.landed.revisions;
    for (const revision of Object.values(revisions)) expect(answer.body).not.toContain(revision);
  });

  it('holds only the dashboard and its own charts when nothing else is chosen', async () => {
    const answer = await exported('writer', { libraryCharts: [], models: [], dataSources: [] });
    expect(answer.statusCode, answer.body).toBe(200);
    const items = fileOf(answer.body).items;
    expect(items.map((item) => item.kind).sort()).toEqual(['chart', 'chart', 'dashboard']);
    expect(
      items
        .filter((item) => item.kind === 'chart')
        .map((item) => item.id)
        .sort(),
    ).toEqual([ids.own1, ids.own2].sort());
  });

  it('refuses a dependency it didn’t offer, and gives no file', async () => {
    for (const chosen of [
      { libraryCharts: [], models: [`${ids.hidden}::${paths.margin}`], dataSources: [] },
      { libraryCharts: [], models: [], dataSources: [ids.secret] },
      { libraryCharts: [randomUUID()], models: [], dataSources: [] },
    ]) {
      const answer = await exported('writer', chosen);
      expect(answer.statusCode, JSON.stringify(chosen)).toBe(400);
      expect(answer.body).not.toContain(names.secret);
    }
    // A reader chooses no model or data source: none is theirs to see.
    const reader = await exported('reader', {
      libraryCharts: [],
      models: [`${ids.sales}::${paths.sales}`],
      dataSources: [],
    });
    expect(reader.statusCode).toBe(400);
  });
});
