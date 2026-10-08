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
import { PROPOSAL_BINDINGS, proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders } from './project-folder.fixture';

/**
 * T713 (AC-425, AC-321, AC-322): a model whose join, `extends` or view names
 * a cube kept off its folder's path, or whose cube runs on a data source kept
 * off it, is refused when it is saved and proposed, and again at approval,
 * changing nothing. xcube refuses it (`reference_range`,
 * `data_source_range`; research `xcube-256d632371.md`, "R72" and "The
 * data-source rule"), on the referring item, naming what it refers to and
 * never that item's folder. Here the stub holds the rule as the image does.
 *
 * /A (`fa`, `sales-rw` writes it) holds the cube `<run>_base`, the data
 * source `<run>_wh` and, until a test moves it, the cube `<run>_moving`;
 * /A/B (`fab`) beneath it, where `writer`'s models go; /A/C (`fac`), /A/B's
 * sibling, holds the cube `<run>_side`. `super` approves.
 */
const MARK = `rfp${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `rfp-${MARK}`;
const BASE = `${MARK}_base`;
const SIDE = `${MARK}_side`;
const MOVING = `${MARK}_moving`;
const WH = `${MARK}_wh`;
const cube = (name: string, lines: readonly string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    `    sql_table: public.${name}`,
    ...lines,
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');
const joining = (name: string, other: string) =>
  cube(name, [
    '    joins:',
    `      - name: ${other}`,
    `        sql: "{CUBE}.id = {${other}}.id"`,
    '        relationship: many_to_one',
  ]);
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});

let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { a: '', ab: '', ac: '', project: '' };

async function folder(title: string, parent: string, access?: Record<string, unknown>) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: {
      owner: 'admin',
      title: `${title} ${MARK}`,
      folderId: parent,
      ...(access ? { access } : {}),
    },
  });
  return id;
}

beforeAll(async () => {
  ids.a = await folder('A', 'root', { readOnly: null, readWrite: ['sales-rw'] });
  ids.ab = await folder('B', ids.a);
  ids.ac = await folder('AC', ids.a);
  await sources().create({
    folderId: ids.a,
    name: WH,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
    sealed: { password: sealed(WH) },
  });
  await files().write([
    { folderId: ids.a, path: `cubes/${BASE}.yml`, content: cube(BASE) },
    { folderId: ids.a, path: `cubes/${MOVING}.yml`, content: cube(MOVING) },
    { folderId: ids.ac, path: `cubes/${SIDE}.yml`, content: cube(SIDE) },
  ]);

  const xids = new Map([
    ['root', 'froot'],
    [ids.a, 'fa'],
    [ids.ab, 'fab'],
    [ids.ac, 'fac'],
  ]);
  const parents = new Map<string, string | null>([
    ['root', null],
    [ids.a, 'root'],
    [ids.ab, ids.a],
    [ids.ac, ids.a],
  ]);
  stub = fakeXcube();
  admin = xcubeAdmin({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fab', parentId: 'fa' },
    { id: 'fac', parentId: 'fa' },
  ]);
  stub.holdConnections(MODEL, [{ folderId: 'fa', name: WH }]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
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
    proposals: proposalStore(getDb()),
    // What each model ran on when proposed (T713's data-source hold).
    proposalBindings: proposalBindingStore(getDb()),
    versions: versionStore(getDb()),
    xcube: admin,
    folders: async () => ({ ids: xids, parents }),
    // What a publish sends, applied as the sync applies it (T426).
    afterPublish: async (changeset) => {
      if (changeset === undefined) return;
      await admin.applyChangeset({
        baseRevision: (await admin.revision()).current?.revision ?? null,
        upserts: changeset.upserts,
        deletes: changeset.deletes,
      });
    },
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
  const project = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'folder', title: `project-${MARK}`, folderId: 'mine' },
  });
  expect(project.statusCode, project.body).toBe(201);
  ids.project = project.json<{ id: string }>().id;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const folders = [ids.a, ids.ab, ids.ac];
  const proposed = await getDb()
    .selectFrom('proposals')
    .select('id')
    .where('target_folder_id', 'in', folders)
    .execute();
  if (proposed.length > 0)
    await getDb()
      .deleteFrom('documents')
      .where('kind', '=', PROPOSAL_BINDINGS)
      .where(
        'id',
        'in',
        proposed.map((each) => String(each.id)),
      )
      .execute();
  await getDb().deleteFrom('proposals').where('target_folder_id', 'in', folders).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
  await getDb().deleteFrom('item_versions').where('folder_id', 'in', folders).execute();
  await getDb().deleteFrom('data_sources').where('folder_id', 'in', folders).execute();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await removeProjectFolders();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const path = (name: string, kind = 'cubes') => `${kind}/${name}.yml`;
/** A model saved in the writer's workspace, going to /A/B. */
const save = (file: string, content: string) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId: ids.project,
      files: [{ path: file, content }],
      targetFolderId: ids.ab,
    },
  });
const propose = async (file: string) => {
  const stored = (await files().inFolders([ids.project])).find((each) => each.path === file)!;
  return as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'model', id: stored.id },
  });
};
const approve = (id: string) =>
  as('super', { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });
const statusOf = async (id: string) =>
  (await as('super', { method: 'GET', url: `/api/proposals/${id}` })).json<{ status: string }>()
    .status;
const offPath = (name: string) =>
  `It refers to "${name}", which isn't in its folder or one of its ancestors`;

describe('a model referring off its folder’s path (T713, AC-425)', () => {
  it('is refused when saved, if its join, `extends` or view names a cube a sibling keeps, naming it and no folder', async () => {
    const view = `${MARK}_over_side`;
    for (const [file, content, name] of [
      [path(`${MARK}_joins_side`), joining(`${MARK}_joins_side`, SIDE), `${MARK}_joins_side`],
      [
        path(`${MARK}_extends_side`),
        ['cubes:', `  - name: ${MARK}_extends_side`, `    extends: ${SIDE}`, ''].join('\n'),
        `${MARK}_extends_side`,
      ],
      [
        path(view, 'views'),
        [
          'views:',
          `  - name: ${view}`,
          '    cubes:',
          `      - join_path: ${SIDE}`,
          '        includes: "*"',
          '',
        ].join('\n'),
        view,
      ],
    ] as const) {
      const saved = await save(file, content);

      expect(saved.statusCode, `${name}: ${saved.body}`).toBe(422);
      expect(saved.json()).toEqual({
        errors: [{ path: file, folderId: ids.project, message: offPath(SIDE) }],
      });
      expect((await files().inFolders([ids.project])).map((each) => each.path)).not.toContain(file);
    }
  });

  it('lands one whose references are its folder’s parent’s', async () => {
    const name = `${MARK}_joins_base`;
    expect((await save(path(name), joining(name, BASE))).statusCode).toBe(200);
    const proposed = await propose(path(name));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(
      (await admin.items()).find((item) => item.folderId === 'fab' && item.name === name),
    ).toMatchObject({ bindings: { [name]: name, [BASE]: BASE } });
  });

  it('is refused at approval, changing nothing, when the cube it joins has moved off its path since it was proposed', async () => {
    const name = `${MARK}_joins_moving`;
    expect((await save(path(name), joining(name, MOVING))).statusCode).toBe(200);
    const proposed = await propose(path(name));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;

    // Moved from /A to /A/C meanwhile, in the store and in xcube, in one
    // changeset: a move (research 2.7).
    await files().remove(ids.a, path(MOVING));
    await files().write([{ folderId: ids.ac, path: path(MOVING), content: cube(MOVING) }]);
    expect(
      await admin.applyChangeset({
        baseRevision: (await admin.revision()).current?.revision ?? null,
        upserts: [{ folderId: 'fac', name: MOVING, kind: 'cube', yaml: cube(MOVING) }],
        deletes: [{ folderId: 'fa', name: MOVING }],
      }),
    ).toMatchObject({ kind: 'stored' });
    const head = stub.head(MODEL)?.revision;

    const refused = await approve(proposalId);
    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json()).toEqual({
      error: '1 item would break, so nothing was approved.',
      errors: [
        {
          path: path(name),
          folderId: ids.ab,
          folderPath: ['Shared', `A ${MARK}`, `B ${MARK}`],
          message: offPath(MOVING),
        },
      ],
      hidden: 0,
    });
    expect(stub.head(MODEL)?.revision).toBe(head);
    expect((await files().inFolders([ids.ab])).map((each) => each.path)).not.toContain(path(name));
    expect(await statusOf(proposalId)).toBe('open');

    // Off its path now, the draft refuses the workspace's every push, as the
    // image checks an overlay's own items: withdrawn and set aside here.
    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${proposalId}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    await files().remove(ids.project, path(name));
  });

  it('is refused at approval, changing nothing, when its data source has moved off its path since it was proposed', async () => {
    const name = `${MARK}_on_wh`;
    expect((await save(path(name), cube(name, [`    data_source: ${WH}`]))).statusCode).toBe(200);
    const proposed = await propose(path(name));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;

    // xcube's connection moved to /A/C meanwhile.
    stub.holdConnections(MODEL, [{ folderId: 'fac', name: WH }]);
    try {
      const head = stub.head(MODEL)?.revision;
      const refused = await approve(proposalId);
      expect(refused.statusCode, refused.body).toBe(422);
      expect(refused.json()).toEqual({
        error: '1 item would break, so nothing was approved.',
        errors: [
          {
            path: path(name),
            folderId: ids.ab,
            folderPath: ['Shared', `A ${MARK}`, `B ${MARK}`],
            message: `It uses the data source "${WH}", which isn't in its folder or one of its ancestors`,
          },
        ],
        hidden: 0,
      });
      expect(stub.head(MODEL)?.revision).toBe(head);
      expect(await statusOf(proposalId)).toBe('open');
    } finally {
      stub.holdConnections(MODEL, [{ folderId: 'fa', name: WH }]);
    }
  });
});

/**
 * T456's data-source half, kept under R71 (R31; the coordinator's call,
 * 2026-10-07): an approval is refused when a model would run on a data source
 * other than the one it ran on when it was proposed, naming both, so what
 * lands is what was submitted. Here a child extends /A's `<run>_parent`, which
 * is published again onto /A's other data source meanwhile: both on the
 * child's path, so nothing else refuses it.
 */
describe('a model whose data source changed since it was proposed (T713, AC-321)', () => {
  it('is refused at approval, naming both data sources, and lands nothing', async () => {
    const parent = `${MARK}_parent`;
    const other = `${MARK}_wh2`;
    stub.holdConnections(MODEL, [
      { folderId: 'fa', name: WH },
      { folderId: 'fa', name: other },
    ]);
    const head = () => admin.revision().then((answer) => answer.current?.revision ?? null);
    expect(
      await admin.applyChangeset({
        baseRevision: await head(),
        upserts: [
          {
            folderId: 'fa',
            name: parent,
            kind: 'cube',
            yaml: cube(parent, [`    data_source: ${WH}`]),
          },
        ],
        deletes: [],
      }),
    ).toMatchObject({ kind: 'stored' });
    const child = `${MARK}_child`;
    const content = ['cubes:', `  - name: ${child}`, `    extends: ${parent}`, ''].join('\n');
    expect((await save(path(child), content)).statusCode).toBe(200);
    const proposed = await propose(path(child));
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;
    const title = proposed.json<{ title: string }>().title;

    // The parent published again onto /A's other data source meanwhile.
    expect(
      await admin.applyChangeset({
        baseRevision: await head(),
        upserts: [
          {
            folderId: 'fa',
            name: parent,
            kind: 'cube',
            yaml: cube(parent, [`    data_source: ${other}`]),
          },
        ],
        deletes: [],
      }),
    ).toMatchObject({ kind: 'stored' });
    const before = await head();

    const refused = await approve(proposalId);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toEqual({
      error: `“${title}” would bind otherwise than when it was proposed: its data source would be “${other}”, not “${WH}”. Nothing was approved; its author can withdraw it and propose it again.`,
      rebound: [
        {
          kind: 'model',
          id: proposed.json<{ itemId: string }>().itemId,
          title,
          dataSource: { was: WH, now: other },
        },
      ],
    });
    expect(await head()).toBe(before);
    expect(await statusOf(proposalId)).toBe('open');

    // Withdrawn and proposed again, it is held to what it binds to now, and lands.
    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${proposalId}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    const again = await propose(path(child));
    expect(again.statusCode, again.body).toBe(201);
    const approved = await approve(again.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
  });
});
