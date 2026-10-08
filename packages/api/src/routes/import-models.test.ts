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
import { workspaceOverlayIdOf } from '../xcube/overlays';

/**
 * T720 (AC-357, AC-356; R71, R72, R73; from T670's WIP): an imported file's
 * models. One whose cube or view name has landed, in any case, is mapped to
 * the landed item and left out: the imported charts query that item, under
 * the name they hold. One whose name a draft in the importer's workspace
 * holds is mapped to that draft. Any other lands in My workspace as a draft
 * going to the target, through its overlay, stored only as xcube takes it
 * (T347). Review lists each model mapped. A landed one off the target's path
 * blocks the import until a target on its path is chosen; a model whose path
 * My workspace's root already holds can't land beside it (the coordinator's
 * call on T670, 2026-10-07).
 *
 * Against the suite's database and the stub xcube. `writer` (`sales-rw`)
 * writes /Sales, which publishes `<mark>_orders` and holds the data source
 * `<mark>_emea`; /Ops, beside it, publishes `<mark>_ops`.
 */
const MARK = `im${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `imp-${MARK}`;
const IMPORTS = `/api/import`;
const REVIEWS = `/api/import/review`;
const name = (what: string) => `${MARK}_${what}`;
const pathOf = (what: string) => `cubes/${name(what)}.yml`;
const cube = (cubeName: string, extra = '') =>
  `cubes:\n  - name: ${cubeName}\n    sql_table: public.${cubeName}\n    measures:\n      - name: count\n        type: count\n${extra}`;
const SOURCE = name('emea');
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
const folders = { sales: '', ops: '' };
let sourceId = '';
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
const cookies: Record<string, string> = {};

/** A file as an export elsewhere makes it, its models as given; its chart on `<mark>_orders`. */
const exportFile = (models: readonly { path: string; content: string }[], title = MARK) => {
  const [board, own] = [randomUUID(), randomUUID()];
  return {
    format: 'wechart-export',
    version: 1,
    exportedAt: '2026-10-07T09:00:00.000Z',
    items: [
      {
        kind: 'dashboard',
        id: board,
        title: `Board ${title}`,
        body: {
          schemaVersion: 1,
          title: `Board ${title}`,
          pages: [
            {
              id: 'p1',
              title: 'Overview',
              items: [{ id: 't1', kind: 'chart', chartId: own, w: 6, h: 30 }],
            },
          ],
          charts: [own],
        },
      },
      {
        kind: 'chart',
        id: own,
        title: `Orders ${title}`,
        dashboardId: board,
        body: {
          schemaVersion: 2,
          title: `Orders ${title}`,
          chart: {
            source: { cube: name('orders') },
            wells: { measures: [`${name('orders')}.count`], dimensions: [], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
      ...models.map((model) => ({ kind: 'model', ...model })),
      {
        kind: 'data-source',
        name: SOURCE,
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
        description: null,
      },
    ],
  };
};
/** The first file: Sales's `orders`, in another case, and a model of a new name. */
const FIRST = [
  { path: pathOf('orders'), content: cube(name('orders').toUpperCase()) },
  { path: pathOf('lines'), content: cube(name('lines')) },
];

beforeAll(async () => {
  for (const [key, title] of [
    ['sales', 'Sales'],
    ['ops', 'Ops'],
  ] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${title} ${MARK}`,
        folderId: 'root',
        access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
      },
    });
    folders[key] = id;
  }
  await files().write([
    { folderId: folders.sales, path: pathOf('orders'), content: cube(name('orders')) },
    { folderId: folders.ops, path: pathOf('ops'), content: cube(name('ops')) },
  ]);
  sourceId = (
    await sources().create({
      folderId: folders.sales,
      name: SOURCE,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('emea') },
    })
  ).id;

  stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fsales', name: name('orders'), kind: 'cube', yaml: cube(name('orders')) },
    { folderId: 'fops', name: name('ops'), kind: 'cube', yaml: cube(name('ops')) },
  ]);
  const xids = new Map([
    ['root', 'froot'],
    [folders.sales, 'fsales'],
    [folders.ops, 'fops'],
  ]);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
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
    dataSources: sources(),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((each) => [each, each === 'root' ? null : 'root'])),
    }),
  });
  cookies['writer'] = await signIn(app, USERS['writer']!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db
    .deleteFrom('model_files')
    .where('target_folder_id', 'in', [folders.sales, folders.ops])
    .execute();
  await db
    .deleteFrom('model_files')
    .where('folder_id', 'in', [folders.sales, folders.ops])
    .execute();
  const boards = (
    await db
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'dashboard')
      .where(({ eb, ref }) =>
        eb(ref('body', '->>').key('targetFolderId'), 'in', [folders.sales, folders.ops]),
      )
      .execute()
  ).map((row) => row.id);
  if (boards.length > 0)
    await db.deleteFrom('documents').where('local_to_dashboard_id', 'in', boards).execute();
  await db
    .deleteFrom('documents')
    .where(({ eb, ref }) =>
      eb(ref('body', '->>').key('targetFolderId'), 'in', [folders.sales, folders.ops]),
    )
    .execute();
  await sources().remove(sourceId);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
// The file's data source has landed in /Sales: mapped to it with nothing asked (T719).
const review = (file: unknown, target = folders.sales) =>
  as('writer', { method: 'POST', url: REVIEWS, payload: { file, targetFolderId: target } });
const land = (file: unknown, target = folders.sales) =>
  as('writer', { method: 'POST', url: IMPORTS, payload: { file, targetFolderId: target } });

/** Every document's kind, id and version, and every model file's, to show what changed. */
const everything = async () =>
  [
    ...(await getDb().selectFrom('documents').select(['kind', 'id', 'version']).execute()).map(
      (row) => `${row.kind}:${row.id}:${String(row.version)}`,
    ),
    ...(
      await getDb().selectFrom('model_files').select(['folder_id', 'path', 'version']).execute()
    ).map((row) => `model:${row.folder_id}:${row.path}:${String(row.version)}`),
  ].sort();

interface Reviewed {
  items: {
    kind: string;
    key: string;
    lands: string;
    mappedTo?: unknown;
    held?: boolean;
    warnings: Record<string, unknown>[];
  }[];
}
const modelsIn = (body: Reviewed) => body.items.filter((item) => item.kind === 'model');

/** The writer's workspace: where the first file's dashboard went. */
let workspace = '';

describe('the models of an imported file (T720, AC-357, AC-356)', () => {
  it('reviews one whose name has landed as mapped to it, and one of a new name as a draft, writing nothing', async () => {
    const before = await everything();
    const answer = await review(exportFile(FIRST));
    expect(answer.statusCode, answer.body).toBe(200);
    expect(modelsIn(answer.json<Reviewed>())).toEqual([
      {
        kind: 'model',
        key: pathOf('orders'),
        title: pathOf('orders'),
        lands: 'not-imported',
        mappedTo: { name: name('orders'), path: [`Sales ${MARK}`] },
        held: true,
        warnings: [],
      },
      {
        kind: 'model',
        key: pathOf('lines'),
        title: pathOf('lines'),
        lands: 'draft',
        warnings: [],
      },
    ]);
    expect(await everything()).toEqual(before);
  });

  it('lands the new one in My workspace going to the target, through its overlay, and leaves the landed one as it is', async () => {
    const before = await everything();
    const answer = await land(exportFile(FIRST));
    expect(answer.statusCode, answer.body).toBe(201);
    const { dashboard, created } = answer.json<{
      dashboard: { id: string };
      created: Record<string, number>;
    }>();
    expect(created).toEqual({ dashboards: 1, charts: 1, models: 1, dataSources: 0 });
    workspace = String((await docs().get('dashboard', dashboard.id))!.body['folderId']);
    expect(workspace).toMatch(/^ws:/);

    const landed = await files().inFolders([workspace]);
    expect(
      landed.map((file) => [file.path, file.content, file.targetFolderId, file.origin]),
    ).toEqual([[pathOf('lines'), FIRST[1]!.content, folders.sales, null]]);
    expect(
      (stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts ?? []).map(
        (item) => `${item.folderId}/${item.name}`,
      ),
    ).toEqual([`fsales/${name('lines')}`]);
    // Sales's own as it was; the imported chart queries it under the name it holds.
    expect(
      (await files().inFolders([folders.sales])).map((file) => [file.path, file.version]),
    ).toEqual([[pathOf('orders'), 1]]);
    const [own] = await docs().localTo(dashboard.id);
    expect((own!.body['chart'] as { source: { cube: string } }).source.cube).toBe(name('orders'));
    const after = await everything();
    expect(after.filter((each) => before.includes(each))).toEqual(before);
    expect(after).toHaveLength(before.length + 3);
  });

  it('maps one whose name a draft in My workspace holds to it, and refuses one of a path its root holds, writing nothing', async () => {
    const overlay = stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.version;
    const again = [
      // The name of the first file's lines, a draft now.
      { path: pathOf('lines_again'), content: cube(name('lines')) },
      // The path of the first file's lines.yml, another name.
      { path: pathOf('lines'), content: cube(name('fresh')) },
    ];
    const reviewed = await review(exportFile(again, `${MARK} again`));
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      expect.objectContaining({
        key: pathOf('lines_again'),
        lands: 'not-imported',
        mappedTo: { name: name('lines'), path: ['My workspace'] },
        held: true,
        warnings: [],
      }),
      expect.objectContaining({
        key: pathOf('lines'),
        lands: 'draft',
        warnings: [{ kind: 'path-in-workspace' }],
      }),
    ]);

    const before = await everything();
    const answer = await land(exportFile(again, `${MARK} again`));
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({
      error: 'Refused: nothing was imported.',
      parts: [
        {
          part: `Model ${pathOf('lines')}`,
          why: 'My workspace already has a model file at this path. Rename or remove one of them, then import again.',
        },
      ],
    });
    expect(await everything()).toEqual(before);
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.version).toBe(overlay);
  });

  it('blocks it while a landed one of its name is off the target’s path', async () => {
    const off = [{ path: pathOf('ops_copy'), content: cube(name('ops')) }];
    const reviewed = await review(exportFile(off, `${MARK} off`));
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      expect.objectContaining({
        lands: 'not-imported',
        mappedTo: { name: name('ops'), path: [`Ops ${MARK}`] },
        held: true,
        warnings: [{ kind: 'off-path' }],
      }),
    ]);
    const before = await everything();
    const answer = await land(exportFile(off, `${MARK} off`));
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `“${name('ops')}” is the name of a cube or view that isn’t in Sales ${MARK} or a folder above it, so the imported charts there couldn’t use it. Choose a target on its path.`,
    );
    expect(await everything()).toEqual(before);
    // On its path it lands, mapped: without the file's data source, which is Sales's.
    const forOps = exportFile(off, `${MARK} off`);
    const there = await land(
      { ...forOps, items: forOps.items.filter((item) => item.kind !== 'data-source') },
      folders.ops,
    );
    expect(there.statusCode, there.body).toBe(201);
    expect(there.json<{ created: Record<string, number> }>().created.models).toBe(0);
  });

  it('is refused as xcube refuses its models, naming each file, writing nothing', async () => {
    const broken = [{ path: pathOf('broken'), content: cube(name('broken'), '    bad: 1\n') }];
    stub.refuseOverlayNext(422, {
      code: 'invalid_items',
      error: 'The overlay does not apply',
      errors: [
        { folderId: 'fsales', name: name('broken'), kind: 'compile', message: 'Broken here' },
      ],
      cubeMessage: null,
    });
    const before = await everything();
    const answer = await land(exportFile(broken, `${MARK} broken`));
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      error: 'Refused: nothing was imported.',
      parts: [{ part: `Model ${pathOf('broken')}`, why: 'Broken here' }],
    });
    expect(await everything()).toEqual(before);
  });
});
