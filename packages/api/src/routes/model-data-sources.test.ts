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
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders } from './project-folder.fixture';

/**
 * T712 (AC-273): WHEN a model is published, THE SYSTEM SHALL bind each data
 * source it names to the one data source of that name, kept in the model's
 * own folder or one of its ancestors, and store that name. A cube that
 * extends another uses its parent's data source. A name held by no data
 * source on that path is refused at publish, naming it.
 *
 * xcube refuses a cube whose data source is off its folder's path at an
 * overlay push, a changeset and an approval (`data_source_range`; research
 * `xcube-256d632371.md`, "The data-source rule" 4.1–4.4), on the caller's
 * item, naming the data source and never its folder. Here the stub holds the
 * model's connections as the image does.
 *
 * /A (`fa`, `sales-rw` writes it) holds the data source `<run>_wh_a`;
 * /A/B (`fab`) beneath it; /A/B/C (`fabc`) beneath that holds `<run>_wh_abc`;
 * /A/C (`fac`), /A/B's sibling, holds `<run>_wh_ac`. /A holds the cube
 * `<run>_parent` on `<run>_wh_a`. `writer` saves models in their workspace
 * going to /A/B; `super` approves them.
 */
const MARK = `mds${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `mds-${MARK}`;
const WH_A = `${MARK}_wh_a`;
const WH_ABC = `${MARK}_wh_abc`;
const WH_AC = `${MARK}_wh_ac`;
const PARENT = `${MARK}_parent`;
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
const ids = { a: '', ab: '', abc: '', ac: '', project: '', whA: '' };

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
  ids.abc = await folder('C', ids.ab);
  ids.ac = await folder('AC', ids.a);
  const source = (folderId: string, name: string) =>
    sources().create({
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed(name) },
    });
  ids.whA = (await source(ids.a, WH_A)).id;
  await source(ids.abc, WH_ABC);
  await source(ids.ac, WH_AC);
  await files().write([
    {
      folderId: ids.a,
      path: `cubes/${PARENT}.yml`,
      content: cube(PARENT, [`    data_source: ${WH_A}`]),
    },
  ]);

  const xids = new Map([
    ['root', 'froot'],
    [ids.a, 'fa'],
    [ids.ab, 'fab'],
    [ids.abc, 'fabc'],
    [ids.ac, 'fac'],
  ]);
  const parents = new Map<string, string | null>([
    ['root', null],
    [ids.a, 'root'],
    [ids.ab, ids.a],
    [ids.abc, ids.ab],
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
    { id: 'fabc', parentId: 'fab' },
    { id: 'fac', parentId: 'fa' },
  ]);
  // xcube holds the model's connections and its items, as once synced.
  stub.holdConnections(MODEL, [
    { folderId: 'fa', name: WH_A },
    { folderId: 'fabc', name: WH_ABC },
    { folderId: 'fac', name: WH_AC },
  ]);
  // Every served folder's, the suite's root files too: what the store holds.
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
  const folders = [ids.a, ids.ab, ids.abc, ids.ac];
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
/** A model saved in the writer's workspace, going to /A/B. */
const save = (name: string, content: string) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId: ids.project,
      files: [{ path: `cubes/${name}.yml`, content }],
      targetFolderId: ids.ab,
    },
  });
/** Proposed and approved: landed in /A/B. */
async function landed(name: string) {
  const file = (await files().inFolders([ids.project])).find(
    (each) => each.path === `cubes/${name}.yml`,
  )!;
  const proposed = await as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'model', id: file.id },
  });
  expect(proposed.statusCode, proposed.body).toBe(201);
  return as('super', {
    method: 'POST',
    url: `/api/proposals/${proposed.json<{ id: string }>().id}/approve`,
    payload: {},
  });
}
const heldIn = async (name: string) =>
  (await admin.items()).find((item) => item.folderId === 'fab' && item.name === name);

describe('a model’s data sources, bound by name on its path (T712, AC-273)', () => {
  it('saves and lands a model naming a data source its folder’s parent keeps, bound to it by name', async () => {
    const name = `${MARK}_on_a`;
    const content = cube(name, [`    data_source: ${WH_A}`]);

    const saved = await save(name, content);
    expect(saved.statusCode, saved.body).toBe(200);
    const approved = await landed(name);
    expect(approved.statusCode, approved.body).toBe(200);

    expect(await heldIn(name)).toMatchObject({ kind: 'cube', dataSource: WH_A });
  });

  it('refuses at save a model naming a data source only a folder beneath or a sibling keeps, naming it, storing nothing', async () => {
    for (const [name, source] of [
      [`${MARK}_on_abc`, WH_ABC],
      [`${MARK}_on_ac`, WH_AC],
    ] as const) {
      const saved = await save(name, cube(name, [`    data_source: ${source}`]));

      expect(saved.statusCode, saved.body).toBe(422);
      expect(saved.json()).toEqual({
        errors: [
          {
            path: `cubes/${name}.yml`,
            folderId: ids.project,
            message: `It uses the data source "${source}", which isn't in its folder or one of its ancestors`,
          },
        ],
      });
      // Never the folder that keeps it.
      // As an id of its own, not inside a random UUID that happens to spell it.
      expect(saved.body).not.toMatch(/\bfabc\b/);
      expect(saved.body).not.toMatch(/\bfac\b/);
      const stored = await files().inFolders([ids.project]);
      expect(stored.map((each) => each.path)).not.toContain(`cubes/${name}.yml`);
    }
  });

  it('refuses at save a model naming a data source no folder holds, naming it', async () => {
    const name = `${MARK}_on_none`;
    const saved = await save(name, cube(name, [`    data_source: ${MARK}_nowhere`]));

    expect(saved.statusCode, saved.body).toBe(422);
    expect(saved.json<{ errors: { message: string }[] }>().errors).toEqual([
      expect.objectContaining({
        message: `It uses the data source "${MARK}_nowhere", which the model doesn't hold`,
      }),
    ]);
  });

  it('runs a cube that extends one in /A on that cube’s data source', async () => {
    const name = `${MARK}_child`;
    const saved = await save(
      name,
      ['cubes:', `  - name: ${name}`, `    extends: ${PARENT}`, ''].join('\n'),
    );
    expect(saved.statusCode, saved.body).toBe(200);
    const approved = await landed(name);
    expect(approved.statusCode, approved.body).toBe(200);

    // None of its own: its parent's (research `xcube-256d632371.md`, 4.2).
    expect(await heldIn(name)).toMatchObject({ kind: 'cube', dataSource: null });
    // Listed among the cubes on /A's data source, beside its parent.
    const listed = await as('super', { method: 'GET', url: '/api/data-sources' });
    expect(listed.statusCode, listed.body).toBe(200);
    const row = listed
      .json<{ id: string; usedBy: { name: string }[] | null }[]>()
      .find((each) => each.id === ids.whA);
    // The first test's cube, if it landed, is there too: this test needs only these two.
    expect(
      row?.usedBy
        ?.map((each) => each.name)
        .filter((each) => each !== `${MARK}_on_a`)
        .sort(),
    ).toEqual([name, PARENT].sort());
  });
});
