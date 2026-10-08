import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { PROPOSAL_BINDINGS, proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, workspaceKeyOf } from './project-folder.fixture';

/**
 * T726 (AC-424; `[R71]` 6): every name-in-use refusal the API answers says
 * only that the name is in use. Each is read for where the name is held: the
 * holder's folder id, its xcube id, its title, its file's path, the workspace,
 * the owner and the holding item's title. None is there. It covers a model
 * save, a data source made and renamed, a proposal, an approval and a
 * generated cube. The case of a file brought in from an export is T720's, and
 * a version restored is in `history.test.ts`.
 *
 * `writer` (`sales-rw`) drafts in their workspace, going to /Sales; /Ops,
 * which they can't see, holds the landed namesakes, a cube in a file of a
 * telling path and a data source. `super` approves. Against the suite's
 * database and the stub xcube.
 */
const MARK = `nr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `nrm-${MARK}`;
const ORDERS = `orders_${MARK}`;
const WAREHOUSE = `warehouse_${MARK}`;
const HOLDER_PATH = `cubes/secret_ledger_${MARK}.yml`;
const cube = (name: string, table = name) =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${table}\n    title: Holder ${MARK}\n`;
const shared = (name: string) => `cubes/${name}.yml`;
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const fields = { host: 'refusals-db', port: 5432, database: 'r', user: 'cube', ssl: false };
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };

let cubeServer: Server;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', ops: '' };
/** The project folders this file made in the writer's workspace. */
const projects: string[] = [];

beforeAll(async () => {
  cubeServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  for (const [key, title, access] of [
    ['sales', 'Sales', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['ops', 'Ops', { readOnly: [], readWrite: ['managers'] }],
  ] as const) {
    ids[key] = randomUUID();
    made.push({ kind: 'folder', id: ids[key] });
    await docs().create({
      kind: 'folder',
      id: ids[key],
      body: { owner: 'admin', title: `${title} ${MARK}`, folderId: 'root', access },
    });
  }
  await files().write([{ folderId: ids.ops, path: HOLDER_PATH, content: cube(ORDERS) }]);
  await sources().create({
    folderId: ids.ops,
    name: WAREHOUSE,
    driver: 'postgres',
    authMethod: 'password',
    fields,
    sealed: { password: sealed },
  });

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
    [ids.ops, 'fops'],
  ]);
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl,
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
  ]);
  stub.holdItems(
    MODEL,
    itemsOf(
      (await files().all()).filter((file) => [ids.sales, ids.ops].includes(file.folderId ?? '')),
      xids,
    ),
  );
  app = buildServer({
    config: {
      cubeApiUrl,
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
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () => PASSING as never,
    proposals: proposalStore(getDb()),
    proposalBindings: proposalBindingStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const proposed = await getDb()
    .selectFrom('proposals')
    .select('id')
    .where('target_folder_id', '=', ids.sales)
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
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await getDb()
    .deleteFrom('audit_records')
    .where('folder_id', 'in', [ids.sales, ids.ops])
    .execute();
  await getDb().deleteFrom('data_sources').where('name', 'ilike', `%${MARK}%`).execute();
  // This file's project folders and what it saved in them (T726's review).
  if (projects.length > 0) {
    await getDb().deleteFrom('model_files').where('folder_id', 'in', projects).execute();
    await getDb().deleteFrom('data_sources').where('folder_id', 'in', projects).execute();
    for (const id of projects) await docs().remove('folder', id);
  }
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', [ids.sales, ids.ops]).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** A project folder in the writer's workspace. */
async function project() {
  const answer = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Refusals ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  projects.push(id);
  return id;
}
const save = (folderId: string, path: string, content: string, extra = {}) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: { folderId, targetFolderId: ids.sales, files: [{ path, content }], ...extra },
  });
const madeSource = async (folderId: string, name: string) => {
  const settings = {
    driver: 'postgres',
    authMethod: 'password',
    fields,
    sealed: { password: sealed },
  };
  const tested = await as('writer', {
    method: 'POST',
    url: '/api/data-sources/test',
    payload: { ...settings, folderId },
  });
  expect(tested.statusCode, tested.body).toBe(200);
  return as('writer', {
    method: 'POST',
    url: '/api/data-sources',
    payload: {
      ...settings,
      folderId,
      targetFolderId: ids.sales,
      name,
      testId: tested.json<{ testId: string }>().testId,
    },
  });
};
/**
 * Nothing of where a name is held: the holder's folder (id, xcube id,
 * title), its file's path, the owner, the holding item's title, or a
 * workspace.
 */
const sayingNoWhere = (body: string, ...more: string[]) => {
  for (const where of [
    ids.ops,
    'fops',
    `Ops ${MARK}`,
    HOLDER_PATH,
    'secret_ledger',
    'admin',
    `Holder ${MARK}`,
    'ws:',
    'workspace',
    'folder',
    ...more,
  ])
    expect(body.toLowerCase(), where).not.toContain(where.toLowerCase());
};

describe('a name-in-use refusal says nothing of where (T726, AC-424)', () => {
  it('on a model save: a name landed in a folder the user can’t see', async () => {
    const folderId = await project();
    const path = shared(`${MARK}_mine`);
    const answer = await save(folderId, path, cube(ORDERS.toUpperCase(), ORDERS));
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${ORDERS.toUpperCase()}” is already in use.` },
    ]);
    sayingNoWhere(answer.body);
  });

  it('on a model save: a name another file of the same project folder declares, in any case', async () => {
    const folderId = await project();
    const twin = `twin_${MARK}`;
    const first = `cubes/${MARK}_first_twin.yml`;
    expect((await save(folderId, first, cube(twin))).statusCode).toBe(200);

    const second = `cubes/${MARK}_second.yml`;
    // As the first writes it, and in another case.
    for (const name of [twin, twin.toUpperCase()]) {
      const answer = await save(folderId, second, cube(name, twin));
      expect(answer.statusCode, answer.body).toBe(422);
      expect(answer.json<{ errors: unknown[] }>().errors).toEqual([
        { path: second, message: `The name “${name}” is already in use.` },
      ]);
      sayingNoWhere(answer.body, first, 'first_twin');
    }
  });

  it('on a generated cube: a name landed in a folder the user can’t see', async () => {
    const folderId = await project();
    const path = `cubes/${MARK}_generated.yml`;
    const answer = await save(folderId, path, cube(ORDERS), { create: [path] });
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${ORDERS}” is already in use.` },
    ]);
    sayingNoWhere(answer.body);
  });

  it('on a data source made, and one renamed', async () => {
    const folderId = await project();
    const refused = await madeSource(folderId, WAREHOUSE.toUpperCase());
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toEqual({
      error: `The name “${WAREHOUSE.toUpperCase()}” is already in use.`,
    });
    sayingNoWhere(refused.body);

    const pond = await madeSource(folderId, `pond_${MARK}`);
    expect(pond.statusCode, pond.body).toBe(201);
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${pond.json<{ id: string }>().id}`,
      payload: { name: WAREHOUSE },
    });
    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json()).toEqual({ error: `The name “${WAREHOUSE}” is already in use.` });
    sayingNoWhere(renamed.body);
  });

  it('on a data source the store refuses for a name its folder holds', async () => {
    const name = `lake_${MARK}`;
    const settings = {
      folderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    };
    await sources().create(settings);
    // The whole message, nothing after it (T726's review).
    await expect(sources().create(settings)).rejects.toThrow(
      new RegExp(`^The name “${name}” is already in use\\.$`),
    );
  });

  it('on a proposal: a name landed since the draft took it', async () => {
    const late = `late_${MARK}`;
    const folderId = await project();
    expect((await save(folderId, shared(late), cube(late))).statusCode).toBe(200);
    await files().write([
      { folderId: ids.ops, path: `cubes/secret_ledger_${late}.yml`, content: cube(late) },
    ]);
    const file = (await files().inFolders([folderId])).find((each) => each.path === shared(late))!;

    const answer = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file.id },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({
      error: `The name “${late}” is already in use, so it wasn’t proposed.`,
      names: [late],
    });
    sayingNoWhere(answer.body);
  });

  it('on an approval: a name landed in another folder, in another case', async () => {
    const folderId = await project();
    const name = WAREHOUSE.replace('warehouse', 'Warehouse');
    const draft = await sources().create({
      folderId,
      targetFolderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });
    const waiting = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(folderId), name: 'Wren Writer' },
      targetFolderId: ids.sales,
      description: null,
      items: [
        {
          kind: 'data-source',
          id: draft.id,
          title: draft.name,
          version: draft.version,
          snapshot: {
            name: draft.name,
            driver: draft.driver,
            authMethod: draft.authMethod,
            fields: draft.fields,
            description: null,
            origin: null,
            sealed: { password: sealed },
            revisions: {},
          },
          landsIn: ids.sales,
          replaces: null,
        },
      ],
    });

    const answer = await as('super', {
      method: 'POST',
      url: `/api/proposals/${waiting.id}/approve`,
      payload: {},
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({
      error: `The name “${name}” is already in use, so nothing was approved.`,
      names: [name],
    });
    sayingNoWhere(answer.body);
  });
});
