import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
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
import { warningsOf } from './import';

/**
 * T513 (AC-356, AC-357): importing an export file into My workspace.
 *
 * - AC-356: everything it holds lands as new drafts in the importer's
 *   workspace, with the one target they chose among the folders they may
 *   write, and no saved item is replaced, renamed or removed. With sign-in
 *   off, it lands in the single user's workspace. No workspace, no import.
 * - AC-357: before importing, Review warns, without blocking, of an item of
 *   the same kind and name in the target or the workspace, of a model's cube
 *   or view the target already has, and of a data source's name the target
 *   already has; naming only what the user may see.
 *
 * /Sales (`sales-rw` writes it) holds a dashboard "Revenue overview", a
 * library chart "Top products", the data source `emea` and a model defining
 * the cube `customers`. `writer` has a draft "Top products" in their
 * workspace. /Viewed is `sales-rw`'s to read only; /Hidden is `managers`'
 * alone, and holds a chart no one else may open.
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
const open = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
/** Where an import is made, and where it is reviewed first. */
const IMPORTS = `/api/import`;
const REVIEWS = `/api/import/review`;

const MARK = `import${randomUUID().slice(0, 8)}`;
const TITLE = `Revenue overview ${MARK}`;
const SOURCE = `${MARK}_emea`;
const MODEL = `${MARK}/orders.yml`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});

const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const held: string[] = [];
const ids = {
  sales: '',
  view: '',
  hidden: '',
  board: '',
  top: '',
  draft: '',
  secret: '',
  shared: '',
  /** Sales's data source of the file's one's name, and one in /Hidden. */
  source: '',
  secretSource: '',
};
let app: FastifyInstance;
let single: FastifyInstance;
const cookies: Record<string, string> = {};
let rootBefore: StoredDocument | null = null;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}
const chartBody = (title: string, cube = 'orders') => ({
  schemaVersion: 2,
  title,
  chart: {
    source: { cube },
    wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
    chartType: 'bar',
  },
});

/** A file an export made elsewhere: its ids that wechart's, not this one's. */
const FILE_IDS = {
  board: randomUUID(),
  own: randomUUID(),
  top: randomUUID(),
  margin: randomUUID(),
};
const exportFile = (extra: unknown[] = [], tiles: unknown[] = []) => ({
  format: 'wechart-export',
  version: 1,
  exportedAt: '2026-09-28T14:00:00.000Z',
  items: [
    {
      kind: 'dashboard',
      id: FILE_IDS.board,
      title: TITLE,
      body: {
        schemaVersion: 1,
        title: TITLE,
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'p1',
            title: 'Overview',
            items: [
              { id: 't1', kind: 'chart', chartId: FILE_IDS.own, w: 6, h: 30 },
              { id: 't2', kind: 'chart', chartId: FILE_IDS.top, w: 6, h: 30 },
              { id: 't3', kind: 'chart', chartId: FILE_IDS.margin, w: 6, h: 30 },
              ...tiles,
            ],
          },
        ],
        charts: [FILE_IDS.own],
      },
    },
    {
      kind: 'chart',
      id: FILE_IDS.own,
      title: 'Revenue',
      dashboardId: FILE_IDS.board,
      body: chartBody('Revenue'),
    },
    {
      kind: 'chart',
      id: FILE_IDS.top,
      title: `Top products ${MARK}`,
      body: chartBody(`Top products ${MARK}`),
    },
    {
      kind: 'chart',
      id: FILE_IDS.margin,
      title: `Margin trend ${MARK}`,
      body: chartBody(`Margin trend ${MARK}`),
    },
    {
      kind: 'model',
      path: MODEL,
      content: `cubes:\n  - name: ${MARK}_customers\n    sql_table: public.customers\n`,
    },
    {
      kind: 'data-source',
      name: SOURCE,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      description: 'Read replica.',
    },
    ...extra,
  ],
});

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: ROOT_FOLDER_ID,
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.view = await doc('folder', {
    title: `Viewed ${MARK}`,
    folderId: ROOT_FOLDER_ID,
    access: { readOnly: ['sales-rw'], readWrite: ['managers'] },
  });
  ids.hidden = await doc('folder', {
    title: `Hidden ${MARK}`,
    folderId: ROOT_FOLDER_ID,
    access: { readOnly: null, readWrite: ['managers'] },
  });
  ids.board = await doc('dashboard', {
    schemaVersion: 1,
    title: TITLE,
    folderId: ids.sales,
    pages: [],
  });
  ids.top = await doc('chart', { ...chartBody(`Top products ${MARK}`), folderId: ids.sales });
  ids.secret = await doc('chart', { ...chartBody(`Secret ${MARK}`), folderId: ids.hidden });
  ids.shared = await doc('chart', { ...chartBody(`Shared ${MARK}`), folderId: ids.sales });
  const { id } = await sources().create({
    folderId: ids.sales,
    name: SOURCE,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
    sealed: { password: sealed(SOURCE) },
  });
  held.push(id);
  ids.source = id;
  ids.secretSource = (
    await sources().create({
      folderId: ids.hidden,
      name: `${MARK}_hidden`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      sealed: { password: sealed(`${MARK}_hidden`) },
    })
  ).id;
  held.push(ids.secretSource);
  await files().seed([
    {
      folderId: ids.sales,
      path: `${MARK}/customers.yml`,
      content: `cubes:\n  - name: ${MARK}_customers\n    sql_table: public.customers\n`,
    },
  ]);

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    dataSources: sources(),
  });
  single = buildServer({
    config: open,
    documents: docs(),
    catalog: catalog(getDb()),
    modelFiles: files(),
    dataSources: sources(),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
  // writer's own draft of a library chart by the same name, going to Sales.
  const draft = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'chart',
      title: `Top products ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.sales,
    },
  });
  expect(draft.statusCode, draft.body).toBe(201);
  ids.draft = draft.json<{ id: string }>().id;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (single !== undefined) await single.close();
  // What the imports made, found by this run's mark, and the dashboards' own charts.
  const imported = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .execute();
  const boards = imported.filter((row) => row.kind === 'dashboard').map((row) => row.id);
  const local =
    boards.length === 0
      ? []
      : await getDb()
          .selectFrom('documents')
          .select(['kind', 'id'])
          .where('local_to_dashboard_id', 'in', boards)
          .execute();
  for (const { kind, id } of [...local, ...imported]) await docs().remove(kind as DocumentKind, id);
  for (const id of held) await sources().remove(id);
  await files().remove(ids.sales, `${MARK}/customers.yml`);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const review = (
  who: string,
  file: unknown,
  targetFolderId: unknown = ids.sales,
  dataSources?: unknown,
) =>
  as(who, {
    method: 'POST',
    url: REVIEWS,
    payload: { file, targetFolderId, ...(dataSources === undefined ? {} : { dataSources }) },
  });
/** An import, its data source mapped to Sales's of its name unless said otherwise (T514). */
const importing = (
  who: string,
  file: unknown,
  targetFolderId: unknown = ids.sales,
  dataSources: unknown = [{ name: SOURCE, to: ids.source }],
) => as(who, { method: 'POST', url: IMPORTS, payload: { file, targetFolderId, dataSources } });

/** Every document's kind, id and version, to show nothing saved changed. */
// By id and then kind: a chart and a dashboard may share an id, and with no
// tie-break Postgres may give them in either order (seen in full runs).
const everything = async () =>
  (
    await getDb()
      .selectFrom('documents')
      .select(['kind', 'id', 'version'])
      .orderBy('id')
      .orderBy('kind')
      .execute()
  ).map((row) => `${row.kind}:${row.id}:${String(row.version)}`);

interface Reviewed {
  target: { id: string; path: string[] };
  items: {
    kind: string;
    key: string;
    title: string;
    lands: string;
    warnings: Record<string, unknown>[];
  }[];
}

describe('Review: what an import would land, and what it may affect (T513, AC-357)', () => {
  it('warns of a same-named item in the target or the workspace, and a data source’s name the target has, and writes nothing', async () => {
    const before = await everything();
    const answer = await review('writer', exportFile());
    expect(answer.statusCode, answer.body).toBe(200);
    const body = answer.json<Reviewed>();
    expect(body.target).toEqual({ id: ids.sales, path: [`Sales ${MARK}`] });
    const byTitle = new Map(body.items.map((item) => [item.title, item]));
    expect(byTitle.get(TITLE)).toEqual({
      kind: 'dashboard',
      key: FILE_IDS.board,
      title: TITLE,
      ownCharts: 1,
      lands: 'draft',
      warnings: [{ kind: 'in-target', version: 1 }],
    });
    expect(byTitle.get(`Top products ${MARK}`)!.warnings).toEqual([
      { kind: 'in-target', version: 1 },
      { kind: 'in-workspace', targetPath: [`Sales ${MARK}`] },
    ]);
    expect(byTitle.get(`Margin trend ${MARK}`)!.warnings).toEqual([]);
    // Models wait for workspace models (design 13, state V): listed, not imported, no warning.
    expect(byTitle.get(MODEL)).toEqual({
      kind: 'model',
      key: MODEL,
      title: MODEL,
      lands: 'not-imported-yet',
      warnings: [],
    });
    expect(byTitle.get(SOURCE)).toEqual({
      kind: 'data-source',
      key: SOURCE,
      title: SOURCE,
      driver: 'postgres',
      lands: 'not-imported',
      warnings: [{ kind: 'source-name-in-target' }],
    });
    // The own chart goes with its dashboard: not an item of its own.
    expect(byTitle.has('Revenue')).toBe(false);
    expect(await everything()).toEqual(before);
  });

  it('warns of a model’s cube or view the target already has, where models import (AC-270)', () => {
    expect(
      warningsOf({
        kind: 'model',
        name: MODEL,
        declares: [`${MARK}_customers`, `${MARK}_fresh`],
        target: {
          named: () => undefined,
          models: [{ path: `${MARK}/customers.yml`, declares: [`${MARK}_customers`] }],
          sourceNames: [],
        },
        workspace: [],
      }),
    ).toEqual([
      { kind: 'cube-in-target', cube: `${MARK}_customers`, file: `${MARK}/customers.yml` },
    ]);
    // And a model of its path, as a same-named item.
    expect(
      warningsOf({
        kind: 'model',
        name: `${MARK}/customers.yml`,
        declares: [],
        target: {
          named: () => undefined,
          models: [{ path: `${MARK}/customers.yml`, declares: [`${MARK}_customers`] }],
          sourceNames: [],
        },
        workspace: [],
      }),
    ).toEqual([{ kind: 'in-target', version: null }]);
  });
});

describe('importing into My workspace (T513, AC-356)', () => {
  it('lands everything as new drafts in the importer’s workspace, with the target chosen, and changes no saved item', async () => {
    const before = await everything();
    const answer = await importing('writer', exportFile());
    expect(answer.statusCode, answer.body).toBe(201);
    const { dashboard, created } = answer.json<{
      dashboard: { id: string; title: string };
      created: Record<string, number>;
    }>();
    expect(created).toEqual({ dashboards: 1, charts: 3, models: 0, dataSources: 0 });
    expect(dashboard.title).toBe(TITLE);

    // Every saved document as it was: only new ones added.
    const after = await everything();
    expect(after.filter((each) => before.includes(each))).toEqual(before);
    expect(after).toHaveLength(before.length + 4);

    const board = (await docs().get('dashboard', dashboard.id))!;
    expect(String(board.body['folderId'])).toMatch(/^ws:/);
    expect(board.body['targetFolderId']).toBe(ids.sales);
    expect(board.body['title']).toBe(TITLE);
    expect(Object.keys(board.body)).not.toContain('origin');
    expect(board.version).toBe(1);

    // Its tiles show the new charts, each new too.
    const shown = JSON.stringify(board.body['pages']);
    for (const old of Object.values(FILE_IDS)) expect(shown).not.toContain(old);
    const own = await docs().localTo(dashboard.id);
    expect(own.map((each) => each.body['title'])).toEqual(['Revenue']);
    expect(shown).toContain(own[0]!.id);
    const listed = (await as('writer', { method: 'GET', url: '/api/folders/mine/contents' })).json<
      { kind: string; title: string; targetFolderId: string | null; id: string }[]
    >();
    const drafts = listed.filter((item) => item.title.includes(MARK));
    expect(drafts.map((item) => [item.kind, item.title, item.targetFolderId]).sort()).toEqual(
      [
        ['chart', `Margin trend ${MARK}`, ids.sales],
        ['chart', `Top products ${MARK}`, ids.sales],
        // writer's earlier draft of the name, kept beside it.
        ['chart', `Top products ${MARK}`, ids.sales],
        ['dashboard', TITLE, ids.sales],
      ].sort(),
    );
    expect(drafts.some((item) => item.id === ids.draft)).toBe(true);
    // Sales as it was: its dashboard, its chart, at their versions.
    expect((await docs().get('dashboard', ids.board))!.version).toBe(1);
    expect((await docs().get('chart', ids.top))!.version).toBe(1);
  });

  it('keeps a tile on a chart not in the file that the importer may open, and not one they may not', async () => {
    const tiles = [
      { id: 't4', kind: 'chart', chartId: ids.shared, w: 6, h: 30 },
      { id: 't5', kind: 'chart', chartId: ids.secret, w: 6, h: 30 },
    ];
    const answer = await importing('writer', exportFile([], tiles));
    expect(answer.statusCode, answer.body).toBe(201);
    const board = (await docs().get(
      'dashboard',
      answer.json<{ dashboard: { id: string } }>().dashboard.id,
    ))!;
    const shown = JSON.stringify(board.body['pages']);
    expect(shown).toContain(ids.shared);
    expect(shown).not.toContain(ids.secret);
    // Still theirs to open through no dashboard of the importer's.
    const opened = await as('writer', { method: 'GET', url: `/api/documents/chart/${ids.secret}` });
    expect(opened.statusCode).toBe(404);
  });

  it('names no chart the importer may not open, however the file puts it (T513’s review)', async () => {
    const file = exportFile() as { items: { kind: string; body?: Record<string, unknown> }[] };
    const board = file.items[0]!;
    board.body = {
      ...board.body,
      charts: [FILE_IDS.own, { chartId: ids.secret }, [ids.secret]],
      filters: [{ id: 'f', chartId: ids.secret }],
    };
    const answer = await importing('writer', file);
    expect(answer.statusCode, answer.body).toBe(201);
    const stored = (await docs().get(
      'dashboard',
      answer.json<{ dashboard: { id: string } }>().dashboard.id,
    ))!;
    expect(JSON.stringify(stored.body['charts'])).not.toContain(`"chartId":"${ids.secret}"`);
    expect(JSON.stringify(stored.body['filters'])).not.toContain(ids.secret);
    const opened = await as('writer', { method: 'GET', url: `/api/documents/chart/${ids.secret}` });
    expect(opened.statusCode).toBe(404);
  });

  it('lands in the single user’s workspace with sign-in off (AC-254)', async () => {
    const answer = await single.inject({
      method: 'POST',
      url: IMPORTS,
      payload: {
        file: exportFile(),
        targetFolderId: ids.sales,
        dataSources: [{ name: SOURCE, to: ids.source }],
      },
    });
    expect(answer.statusCode, answer.body).toBe(201);
    const board = (await docs().get(
      'dashboard',
      answer.json<{ dashboard: { id: string } }>().dashboard.id,
    ))!;
    expect(board.body['folderId']).toBe('mine');
    expect(board.body['targetFolderId']).toBe(ids.sales);
  });

  it('refuses a file it can’t take, naming the part, and writes nothing (AC-359)', async () => {
    const before = await everything();
    const answer = await importing('writer', exportFile([{ kind: 'alert', title: 'Late orders' }]));
    expect(answer.statusCode).toBe(422);
    expect(answer.json()).toEqual({
      error: 'Refused: nothing was imported.',
      parts: [
        {
          part: 'Item 7, “Late orders”',
          why: 'Kind alert: this wechart imports dashboards, charts, models and data sources.',
        },
      ],
    });
    const unreadable = await review('writer', 'not an export');
    expect(unreadable.statusCode).toBe(422);
    expect(unreadable.json()).toEqual({
      error: 'Refused: nothing was imported.',
      unreadable: 'It isn’t a wechart export: it doesn’t say it is one.',
    });
    expect(await everything()).toEqual(before);
  });

  it('names no folder the importer may not see in a warning (AC-357)', async () => {
    // writer's own draft of a name in the file, going to a folder they can't see (since lost).
    const own = String((await docs().get('chart', ids.draft))!.body['folderId']);
    const title = `Hidden target ${MARK}`;
    await doc('chart', { ...chartBody(title), folderId: own, targetFolderId: ids.hidden });
    const answer = await review(
      'writer',
      exportFile([{ kind: 'chart', id: randomUUID(), title, body: chartBody(title) }]),
    );
    expect(answer.statusCode, answer.body).toBe(200);
    const margin = answer.json<Reviewed>().items.find((item) => item.title === title)!;
    expect(margin.warnings).toEqual([{ kind: 'in-workspace', targetPath: null }]);
    expect(answer.body).not.toContain(`Hidden ${MARK}`);
  });

  it('is no one’s without a workspace, and goes only to a shared folder they may write', async () => {
    const before = await everything();
    expect((await importing('reader', exportFile())).statusCode).toBe(403);
    expect((await review('reader', exportFile())).statusCode).toBe(403);
    // None named (undefined would take the helper's default).
    expect((await importing('writer', exportFile(), '')).statusCode).toBe(400);
    expect((await importing('writer', exportFile(), null)).statusCode).toBe(400);
    expect((await importing('writer', exportFile(), 'mine')).statusCode).toBe(400);
    expect((await importing('writer', exportFile(), ids.view)).statusCode).toBe(403);
    expect((await importing('writer', exportFile(), ids.hidden)).statusCode).toBe(404);
    expect(await everything()).toEqual(before);
  });
});

describe('an import’s data sources (T514, AC-358)', () => {
  it('reviews each as it was decided: mapped, not imported; created, a new draft under its name', async () => {
    const mapped = await review('writer', exportFile(), ids.sales, [
      { name: SOURCE, map: ids.source },
    ]);
    expect(mapped.statusCode, mapped.body).toBe(200);
    expect(mapped.json<Reviewed>().items.find((item) => item.kind === 'data-source')).toEqual({
      kind: 'data-source',
      key: SOURCE,
      title: SOURCE,
      driver: 'postgres',
      lands: 'not-imported',
      mappedTo: { name: SOURCE, path: [`Sales ${MARK}`] },
      warnings: [],
    });
    const created = await review('writer', exportFile(), ids.sales, [
      { name: SOURCE, create: `${MARK}_emea_2` },
    ]);
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json<Reviewed>().items.find((item) => item.kind === 'data-source')).toEqual({
      kind: 'data-source',
      key: SOURCE,
      title: `${MARK}_emea_2`,
      driver: 'postgres',
      lands: 'draft',
      warnings: [],
    });
  });

  it('maps only to one a model in the target can bind to that the importer may use, naming no other', async () => {
    for (const to of [ids.secretSource, randomUUID()]) {
      const answer = await importing('writer', exportFile(), ids.sales, [{ name: SOURCE, to }]);
      expect(answer.statusCode, answer.body).toBe(404);
      expect(answer.body).not.toContain(`${MARK}_hidden`);
    }
    const unmapped = await importing('writer', exportFile(), ids.sales, []);
    expect(unmapped.statusCode).toBe(400);
    expect(unmapped.json<{ error: string }>().error).toBe(
      `Map each data source to one a model in Sales ${MARK} can bind to, or create it: ${SOURCE}.`,
    );
    const reviewed = await review('writer', exportFile(), ids.sales, [
      { name: SOURCE, map: ids.secretSource },
    ]);
    expect(reviewed.statusCode).toBe(404);
  });

  it('maps to one in the target or above it, not one beside or below it, nor a draft going elsewhere (T514’s review)', async () => {
    const emea = await doc('folder', { title: `EMEA ${MARK}`, folderId: ids.sales });
    const settings = {
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
    } as const;
    const beside = await sources().create({
      ...settings,
      folderId: ids.view,
      name: `${MARK}_beside`,
      sealed: { password: sealed(`${MARK}_beside`) },
    });
    const below = await sources().create({
      ...settings,
      folderId: emea,
      name: `${MARK}_below`,
      sealed: { password: sealed(`${MARK}_below`) },
    });
    const own = String((await docs().get('chart', ids.draft))!.body['folderId']);
    const elsewhere = await sources().create({
      ...settings,
      folderId: own,
      name: `${MARK}_elsewhere`,
      sealed: { password: sealed(`${MARK}_elsewhere`) },
      targetFolderId: ids.view,
    });
    held.push(beside.id, below.id, elsewhere.id);
    const before = await everything();
    for (const to of [beside.id, below.id, elsewhere.id]) {
      const answer = await importing('writer', exportFile(), ids.sales, [{ name: SOURCE, to }]);
      expect(answer.statusCode, `${to}: ${answer.body}`).toBe(404);
      const reviewed = await review('writer', exportFile(), ids.sales, [{ name: SOURCE, map: to }]);
      expect(reviewed.statusCode, `${to}: ${reviewed.body}`).toBe(404);
    }
    expect(await everything()).toEqual(before);
    // Sales's own binds a model in EMEA, below it.
    const reviewed = await review('writer', exportFile(), emea, [
      { name: SOURCE, map: ids.source },
    ]);
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json<Reviewed>().items.find((item) => item.kind === 'data-source')).toEqual({
      kind: 'data-source',
      key: SOURCE,
      title: SOURCE,
      driver: 'postgres',
      lands: 'not-imported',
      mappedTo: { name: SOURCE, path: [`Sales ${MARK}`] },
      warnings: [],
    });
    const answer = await importing('writer', exportFile(), emea, [
      { name: SOURCE, to: ids.source },
    ]);
    expect(answer.statusCode, answer.body).toBe(201);
  });

  it('takes one created in the importer’s workspace, going to the target, as the one chosen', async () => {
    const own = String((await docs().get('chart', ids.draft))!.body['folderId']);
    const made = await sources().create({
      folderId: own,
      name: `${MARK}_made`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      sealed: { password: sealed(`${MARK}_made`) },
      targetFolderId: ids.sales,
    });
    held.push(made.id);
    const answer = await importing('writer', exportFile(), ids.sales, [
      { name: SOURCE, to: made.id },
    ]);
    expect(answer.statusCode, answer.body).toBe(201);
    expect(answer.json<{ created: Record<string, number> }>().created).toEqual({
      dashboards: 1,
      charts: 3,
      models: 0,
      dataSources: 1,
    });
  });
});
