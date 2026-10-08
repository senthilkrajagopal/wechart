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
const folders = { sales: '', ops: '', hidden: '', unserved: '' };
let sourceId = '';
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
/** The next write of the import's documents fails. */
let failCreate = false;
const cookies: Record<string, string> = {};

/** A file as an export elsewhere makes it, its models as given; its chart on `on`, `<mark>_orders` unless said. */
const exportFile = (
  models: readonly { path: string; content: string }[],
  title = MARK,
  on = name('orders'),
) => {
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
            source: { cube: on },
            wells: { measures: [`${on}.count`], dimensions: [], timeDimensions: [] },
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
  for (const [key, title, groups] of [
    ['sales', 'Sales', ['sales-rw']],
    ['ops', 'Ops', ['sales-rw']],
    // One the writer can't see (T720's review).
    ['hidden', 'Hidden', [`${MARK}-nobody`]],
    // One xcube doesn't serve: its files have not landed (T720's second follow-up).
    ['unserved', 'Unserved', ['sales-rw']],
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
        access: { readOnly: [], readWrite: [...groups] },
      },
    });
    folders[key] = id;
  }
  await files().write([
    { folderId: folders.sales, path: pathOf('orders'), content: cube(name('orders')) },
    { folderId: folders.ops, path: pathOf('ops'), content: cube(name('ops')) },
    { folderId: folders.hidden, path: pathOf('secret'), content: cube(name('secret')) },
    { folderId: folders.unserved, path: pathOf('unserved'), content: cube(name('unserved')) },
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
    { id: 'fhidden', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fsales', name: name('orders'), kind: 'cube', yaml: cube(name('orders')) },
    { folderId: 'fops', name: name('ops'), kind: 'cube', yaml: cube(name('ops')) },
    { folderId: 'fhidden', name: name('secret'), kind: 'cube', yaml: cube(name('secret')) },
  ]);
  const xids = new Map([
    ['root', 'froot'],
    [folders.sales, 'fsales'],
    [folders.ops, 'fops'],
    [folders.hidden, 'fhidden'],
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
    // The documents as stored, but for one write made to fail (T720's review).
    documents: {
      ...docs(),
      createTogether: async (creates: Parameters<ReturnType<typeof docs>['createTogether']>[0]) => {
        if (failCreate) {
          failCreate = false;
          throw new Error('The documents could not be written.');
        }
        return docs().createTogether(creates);
      },
    },
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
    .where('folder_id', 'in', [folders.sales, folders.ops, folders.hidden, folders.unserved])
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

  // T720's review: all together or none (AC-356), the models taken back if the documents fail.
  it('takes its models back out of My workspace when its documents can’t be written', async () => {
    const lone = [{ path: pathOf('lone'), content: cube(name('lone')) }];
    const before = await everything();
    failCreate = true;
    const failed = await land(exportFile(lone, `${MARK} lone`));
    expect(failed.statusCode, failed.body).toBe(500);
    expect(await everything()).toEqual(before);
    expect(
      (stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts ?? []).map(
        (item) => item.name,
      ),
    ).not.toContain(name('lone'));
    // So it lands as new when tried again.
    const again = await land(exportFile(lone, `${MARK} lone`));
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json<{ created: Record<string, number> }>().created.models).toBe(1);
  });

  // T720's review (AC-357, AC-424): one in a folder the importer can't see is mapped, its folder unsaid.
  it('maps one whose name is held in a folder the importer can’t see, naming no folder of it', async () => {
    const unseen = [{ path: pathOf('secret_copy'), content: cube(name('secret')) }];
    // Its chart uses it, so it blocks (T736).
    const file = exportFile(unseen, `${MARK} unseen`, name('secret'));
    const reviewed = await review(file);
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      expect.objectContaining({
        lands: 'not-imported',
        mappedTo: { name: name('secret'), path: null },
        held: true,
        warnings: [
          {
            kind: 'off-path',
            charts: [
              {
                key: (file.items[1] as { id: string }).id,
                title: `Orders ${MARK} unseen`,
                leftOut: false,
              },
            ],
          },
        ],
      }),
    ]);
    const answer = await land(file);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.body).not.toContain(`Hidden ${MARK}`);
  });

  // T720's review: every name a model declares is asked, not the first one found held.
  it('blocks one of several names, one landed on the target’s path and one off it, naming the one off it', async () => {
    const both = [
      {
        path: pathOf('both'),
        content: `${cube(name('orders'))}  - name: ${name('ops')}\n    sql_table: public.${name('ops')}\n`,
      },
    ];
    // Its chart uses the one off the path, so it blocks (T736).
    const file = exportFile(both, `${MARK} both`, name('ops'));
    const reviewed = await review(file);
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      expect.objectContaining({
        lands: 'not-imported',
        mappedTo: { name: name('ops'), path: [`Ops ${MARK}`] },
        held: true,
        warnings: [
          {
            kind: 'off-path',
            charts: [
              {
                key: (file.items[1] as { id: string }).id,
                title: `Orders ${MARK} both`,
                leftOut: false,
              },
            ],
          },
        ],
      }),
    ]);
    const before = await everything();
    const answer = await land(file);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `“${name('ops')}” is the name of a cube or view that isn’t in Sales ${MARK} or a folder above it, so the imported charts there couldn’t use it. Choose a target on its path, or leave out the charts that use it.`,
    );
    expect(await everything()).toEqual(before);
  });

  // T736 (AC-357): it blocks while a chart in the file uses it; this file's one does.
  it('blocks it while a landed one of its name is off the target’s path', async () => {
    const off = [{ path: pathOf('ops_copy'), content: cube(name('ops')) }];
    const file = exportFile(off, `${MARK} off`, name('ops'));
    const reviewed = await review(file);
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      expect.objectContaining({
        lands: 'not-imported',
        mappedTo: { name: name('ops'), path: [`Ops ${MARK}`] },
        held: true,
        warnings: [
          {
            kind: 'off-path',
            charts: [
              {
                key: (file.items[1] as { id: string }).id,
                title: `Orders ${MARK} off`,
                leftOut: false,
              },
            ],
          },
        ],
      }),
    ]);
    const before = await everything();
    const answer = await land(file);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `“${name('ops')}” is the name of a cube or view that isn’t in Sales ${MARK} or a folder above it, so the imported charts there couldn’t use it. Choose a target on its path, or leave out the charts that use it.`,
    );
    expect(await everything()).toEqual(before);
    // On its path it lands, mapped: without the file's data source, which is Sales's.
    const forOps = exportFile(off, `${MARK} off`, name('ops'));
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

/**
 * T720's second follow-up (AC-357, AC-356; the coordinator's rulings,
 * 2026-10-08): a model declaring a held name beside a new one is refused,
 * naming it, neither mapped whole nor split; two new models of one name in a
 * file are refused at Review, naming each, before xcube is asked; and a name
 * has landed only where xcube serves its folder, as the name checks hold.
 */
describe('a file’s models refused before xcube is asked, and what has landed (T720, AC-357)', () => {
  const refused = (parts: { part: string; why: string }[]) => ({
    error: 'Refused: nothing was imported.',
    parts,
  });

  it('refuses a model declaring a name in use beside a new one, naming it, at Review and Import', async () => {
    const mixed = [
      {
        path: pathOf('mixed'),
        content: `${cube(name('orders'))}  - name: ${name('mixed_new')}\n    sql_table: public.${name('mixed_new')}\n`,
      },
    ];
    const why = `“${name('orders')}” is in use and “${name('mixed_new')}” is new: a model file is either mapped to items in use or imported as new, not both. Split it, then import again.`;
    const reviewed = await review(exportFile(mixed, `${MARK} mixed`));
    expect(reviewed.statusCode, reviewed.body).toBe(409);
    expect(reviewed.json()).toEqual(refused([{ part: `Model ${pathOf('mixed')}`, why }]));
    const before = await everything();
    const answer = await land(exportFile(mixed, `${MARK} mixed`));
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(refused([{ part: `Model ${pathOf('mixed')}`, why }]));
    expect(await everything()).toEqual(before);
  });

  it('refuses two new models of one name, naming each, before xcube is asked', async () => {
    const twins = [
      { path: pathOf('twin_a'), content: cube(name('twin')) },
      { path: pathOf('twin_b'), content: cube(name('TWIN')) },
    ];
    const parts = [
      {
        part: `Model ${pathOf('twin_a')}`,
        why: `Another model in the file declares “${name('twin')}” too: each name is declared once.`,
      },
      {
        part: `Model ${pathOf('twin_b')}`,
        why: `Another model in the file declares “${name('TWIN')}” too: each name is declared once.`,
      },
    ];
    const overlay = stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.version;
    const reviewed = await review(exportFile(twins, `${MARK} twins`));
    expect(reviewed.statusCode, reviewed.body).toBe(409);
    expect(reviewed.json()).toEqual(refused(parts));
    const before = await everything();
    const answer = await land(exportFile(twins, `${MARK} twins`));
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(refused(parts));
    expect(await everything()).toEqual(before);
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.version).toBe(overlay);
  });

  it('holds a name landed only where xcube serves its folder, as the name checks do', async () => {
    const elsewhere = [{ path: pathOf('unserved_copy'), content: cube(name('unserved')) }];
    const reviewed = await review(exportFile(elsewhere, `${MARK} unserved`));
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(modelsIn(reviewed.json<Reviewed>())).toEqual([
      {
        kind: 'model',
        key: pathOf('unserved_copy'),
        title: pathOf('unserved_copy'),
        lands: 'draft',
        warnings: [],
      },
    ]);
    const answer = await land(exportFile(elsewhere, `${MARK} unserved`));
    expect(answer.statusCode, answer.body).toBe(201);
    expect(answer.json<{ created: Record<string, number> }>().created.models).toBe(1);
  });
});

/**
 * T736 (AC-357; R73): an import whose model is mapped to a landed cube off
 * the target's path is made once the charts that use it are left out, with
 * their tiles; until then it blocks. One that no chart uses blocks nothing.
 *
 * The file: own charts A (on `<mark>_orders`) and B (on `<mark>_ops`), and a
 * library chart C (on `<mark>_ops`) on the dashboard's second page; its model
 * maps `<mark>_ops`, which /Ops publishes, off /Sales's path.
 */
describe('leaving out the charts that use an item off the target’s path (T736, AC-357)', () => {
  const OFF = [{ path: pathOf('ops_again'), content: cube(name('ops')) }];
  const chartOn = (title: string, on: string) => ({
    schemaVersion: 2,
    title,
    chart: {
      source: { cube: on },
      wells: { measures: [`${on}.count`], dimensions: [], timeDimensions: [] },
      chartType: 'bar',
    },
  });
  const usingFile = () => {
    const [board, a, b, c] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    return {
      ids: { board, a, b, c },
      file: {
        format: 'wechart-export',
        version: 1,
        exportedAt: '2026-10-08T09:00:00.000Z',
        items: [
          {
            kind: 'dashboard',
            id: board,
            title: `Leaving ${MARK}`,
            body: {
              schemaVersion: 1,
              title: `Leaving ${MARK}`,
              pages: [
                {
                  id: 'p1',
                  title: 'One',
                  items: [
                    { id: 't1', kind: 'chart', chartId: a, w: 6, h: 30 },
                    { id: 't2', kind: 'chart', chartId: b, w: 6, h: 30 },
                  ],
                },
                {
                  id: 'p2',
                  title: 'Two',
                  items: [{ id: 't3', kind: 'chart', chartId: c, w: 6, h: 30 }],
                },
              ],
              charts: [a, b],
            },
          },
          {
            kind: 'chart',
            id: a,
            title: `A ${MARK}`,
            dashboardId: board,
            body: chartOn(`A ${MARK}`, name('orders')),
          },
          {
            kind: 'chart',
            id: b,
            title: `B ${MARK}`,
            dashboardId: board,
            body: chartOn(`B ${MARK}`, name('ops')),
          },
          { kind: 'chart', id: c, title: `C ${MARK}`, body: chartOn(`C ${MARK}`, name('ops')) },
          ...OFF.map((model) => ({ kind: 'model', ...model })),
        ],
      },
    };
  };
  const reviewLeaving = (file: unknown, leaveOut: readonly string[]) =>
    as('writer', {
      method: 'POST',
      url: REVIEWS,
      payload: { file, targetFolderId: folders.sales, leaveOut },
    });
  const landLeaving = (file: unknown, leaveOut: readonly string[]) =>
    as('writer', {
      method: 'POST',
      url: IMPORTS,
      payload: { file, targetFolderId: folders.sales, leaveOut },
    });
  const offPathOf = (body: Reviewed) =>
    modelsIn(body)[0]!.warnings.find((warning) => warning.kind === 'off-path');

  it('names the charts that use it, and makes nothing while one of them stays in', async () => {
    const { ids, file } = usingFile();
    const reviewed = await review(file);
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(offPathOf(reviewed.json<Reviewed>())).toEqual({
      kind: 'off-path',
      charts: [
        { key: ids.b, title: `B ${MARK}`, leftOut: false },
        { key: ids.c, title: `C ${MARK}`, leftOut: false },
      ],
    });
    const before = await everything();
    const answer = await landLeaving(file, [ids.b]);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `“${name('ops')}” is the name of a cube or view that isn’t in Sales ${MARK} or a folder above it, so the imported charts there couldn’t use it. Choose a target on its path, or leave out the charts that use it.`,
    );
    expect(await everything()).toEqual(before);
  });

  it('lands without the charts left out and their tiles, Review saying so first', async () => {
    const { ids, file } = usingFile();
    const reviewed = await reviewLeaving(file, [ids.b, ids.c]);
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    const body = reviewed.json<Reviewed & { items: { ownCharts?: number }[] }>();
    expect(offPathOf(body)).toEqual({
      kind: 'off-path',
      charts: [
        { key: ids.b, title: `B ${MARK}`, leftOut: true },
        { key: ids.c, title: `C ${MARK}`, leftOut: true },
      ],
    });
    expect(body.items.find((item) => item.key === ids.board)).toEqual({
      kind: 'dashboard',
      key: ids.board,
      title: `Leaving ${MARK}`,
      ownCharts: 1,
      lands: 'draft',
      warnings: [],
    });
    expect(body.items.find((item) => item.key === ids.c)).toEqual({
      kind: 'chart',
      key: ids.c,
      title: `C ${MARK}`,
      lands: 'left-out',
      warnings: [],
    });

    const before = await everything();
    const answer = await landLeaving(file, [ids.b, ids.c]);
    expect(answer.statusCode, answer.body).toBe(201);
    const { dashboard, created } = answer.json<{
      dashboard: { id: string };
      created: Record<string, number>;
    }>();
    expect(created).toEqual({ dashboards: 1, charts: 1, models: 0, dataSources: 0 });
    // The dashboard and A alone: no B, no C.
    const after = await everything();
    expect(after.filter((each) => before.includes(each))).toEqual(before);
    expect(after).toHaveLength(before.length + 2);
    const own = await docs().localTo(dashboard.id);
    expect(own.map((chart) => chart.body['title'])).toEqual([`A ${MARK}`]);
    const board = (await docs().get('dashboard', dashboard.id))!.body as {
      pages: { id: string; items: { id: string; chartId?: string }[] }[];
      charts: string[];
    };
    expect(board.pages.map((page) => [page.id, page.items.map((tile) => tile.id)])).toEqual([
      ['p1', ['t1']],
      ['p2', []],
    ]);
    expect(board.pages[0]!.items[0]!.chartId).toBe(own[0]!.id);
    expect(board.charts).toEqual([own[0]!.id]);
  });

  it('refuses leaving out a chart that uses nothing off the target’s path, making nothing', async () => {
    const { ids, file } = usingFile();
    const before = await everything();
    const answer = await landLeaving(file, [ids.a, ids.b, ids.c]);
    expect(answer.statusCode, answer.body).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'Only a chart that uses a cube or view off the target’s path can be left out.',
    );
    expect(await everything()).toEqual(before);
  });

  // T736's follow-up (AC-357, R72; the coordinator, 2026-10-08): the dashboard's own references block too.
  it('blocks while the dashboard’s own filter or text uses it, naming each, whatever is left out', async () => {
    const { ids, file } = usingFile();
    const board = (file.items[0] as { body: Record<string, unknown> }).body;
    board['filters'] = [{ id: 'f1', widget: 'list', member: `${name('ops')}.count` }];
    (board['pages'] as { items: unknown[] }[])[1]!.items.push({
      id: 'm1',
      kind: 'markdown',
      text: `Ops: {{measure:${name('ops')}.count}}`,
      w: 6,
      h: 10,
    });
    const reviewed = await reviewLeaving(file, [ids.b, ids.c]);
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(offPathOf(reviewed.json<Reviewed>())).toEqual({
      kind: 'off-path',
      charts: [
        { key: ids.b, title: `B ${MARK}`, leftOut: true },
        { key: ids.c, title: `C ${MARK}`, leftOut: true },
      ],
      dashboard: [
        { kind: 'filter', member: `${name('ops')}.count` },
        { kind: 'text', member: `${name('ops')}.count` },
      ],
    });
    const before = await everything();
    const answer = await landLeaving(file, [ids.b, ids.c]);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `“${name('ops')}” is the name of a cube or view that isn’t in Sales ${MARK} or a folder above it, so the imported dashboard there couldn’t use it in its filter on ${name('ops')}.count and its text’s ${name('ops')}.count. Choose a target on its path.`,
    );
    expect(await everything()).toEqual(before);
  });

  // T736's review: a list to leave out is checked at Review as at Import.
  it('refuses at Review a list to leave out that isn’t one, or names a chart that uses nothing off the path', async () => {
    const { ids, file } = usingFile();
    const malformed = await as('writer', {
      method: 'POST',
      url: REVIEWS,
      payload: { file, targetFolderId: folders.sales, leaveOut: ids.b },
    });
    expect(malformed.statusCode, malformed.body).toBe(400);
    expect(malformed.json<{ error: string }>().error).toBe(
      'Send the charts to leave out as a list of their ids.',
    );
    const notLeavable = await reviewLeaving(file, [ids.a]);
    expect(notLeavable.statusCode, notLeavable.body).toBe(400);
    expect(notLeavable.json<{ error: string }>().error).toBe(
      'Only a chart that uses a cube or view off the target’s path can be left out.',
    );
  });

  it('blocks nothing for one that no chart in the file uses', async () => {
    const file = exportFile(OFF, `${MARK} unused`);
    const reviewed = await review(file);
    expect(offPathOf(reviewed.json<Reviewed>())).toEqual({ kind: 'off-path', charts: [] });
    const answer = await land(file);
    expect(answer.statusCode, answer.body).toBe(201);
    expect(answer.json<{ created: Record<string, number> }>().created).toEqual({
      dashboards: 1,
      charts: 1,
      models: 0,
      dataSources: 0,
    });
  });
});
