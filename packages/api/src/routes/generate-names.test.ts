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
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders } from './project-folder.fixture';

/**
 * T724 (AC-249, AC-424; `[R71]`): a cube generated from a data source is
 * refused when a landed cube or view holds its name in any folder, or
 * another draft in the workspace does, in any case, saying only that the
 * name is in use; and when the folder it goes to holds a file of its file
 * name, naming that file. The existing file is unchanged.
 *
 * `writer` (`sales-rw`) generates in their workspace, to go to /Sales; /Ops,
 * which they can't see, holds the landed `orders_<mark>`; /Sales holds
 * `cubes/stock_<mark>.yml`. Against the suite's database and the stub xcube.
 */
const MARK = `gn${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `gnm-${MARK}`;
const ORDERS = `orders_${MARK}`;
const STOCK = `stock_${MARK}`;
const cube = (name: string, table = name) =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${table}\n`;
const shared = (name: string) => `cubes/${name}.yml`;

let cubeServer: Server;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', ops: '' };

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
  await files().write([
    { folderId: ids.sales, path: shared(STOCK), content: cube(STOCK) },
    { folderId: ids.ops, path: shared(ORDERS), content: cube(ORDERS) },
  ]);

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
    dataSources: dataSourceStore(getDb()),
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
  cookies['writer'] = await signIn(app, USERS['writer']!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb()
    .deleteFrom('audit_records')
    .where('folder_id', 'in', [ids.sales, ids.ops])
    .execute();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', [ids.sales, ids.ops]).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies['writer']! } });
/** A project folder in the writer's workspace. */
async function project() {
  const answer = await as({
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Generated ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
}
/** Generated files saved as Generate cubes saves them: new, going to /Sales. */
const generated = (folderId: string, generatedFiles: { path: string; content: string }[]) =>
  as({
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId,
      targetFolderId: ids.sales,
      files: generatedFiles,
      create: generatedFiles.map((file) => file.path),
    },
  });
const fileIn = async (folderId: string, path: string) =>
  (await files().inFolders([folderId])).find((file) => file.path === path);
/** Nothing of where a name is held: not /Ops's or /Sales's id, xcube id or title, nor a path. */
const sayingNoWhere = (body: string, ...paths: string[]) => {
  for (const where of [
    ids.ops,
    'fops',
    `Ops ${MARK}`,
    ids.sales,
    'fsales',
    `Sales ${MARK}`,
    ...paths,
  ])
    expect(body).not.toContain(where);
};

describe('a generated cube’s name (T724, AC-249, AC-424)', () => {
  it('is refused when a landed cube in a folder the user can’t see holds it, in any case, saying only that it is in use', async () => {
    const folderId = await project();
    const path = `cubes/${MARK}_generated_orders.yml`;
    const name = ORDERS.toUpperCase();

    const refused = await generated(folderId, [{ path, content: cube(name, ORDERS) }]);

    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${name}” is already in use.` },
    ]);
    sayingNoWhere(refused.body, shared(ORDERS));
    expect(await fileIn(folderId, path)).toBeUndefined();
    expect((await fileIn(ids.ops, shared(ORDERS)))?.content).toBe(cube(ORDERS));
  });

  it('is refused when the folder it goes to holds it, in any case, saying only that it is in use', async () => {
    const folderId = await project();
    const path = `cubes/${MARK}_generated_stock.yml`;
    // As the folder's file writes it, and in another case.
    for (const name of [STOCK, STOCK.replace('stock', 'Stock')]) {
      const refused = await generated(folderId, [{ path, content: cube(name, STOCK) }]);

      expect(refused.statusCode, refused.body).toBe(422);
      expect(refused.json<{ errors: unknown[] }>().errors).toEqual([
        { path, message: `The name “${name}” is already in use.` },
      ]);
      sayingNoWhere(refused.body, shared(STOCK));
    }
    expect((await fileIn(ids.sales, shared(STOCK)))?.content).toBe(cube(STOCK));
  });

  it('is refused when another draft in the workspace holds it, in any case', async () => {
    const draft = `draft_${MARK}`;
    const first = await project();
    const saved = await as({
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: first,
        targetFolderId: ids.sales,
        files: [{ path: shared(draft), content: cube(draft) }],
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const second = await project();
    const path = `cubes/${MARK}_generated_draft.yml`;
    const refused = await generated(second, [{ path, content: cube(draft.toUpperCase(), draft) }]);

    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${draft.toUpperCase()}” is already in use.` },
    ]);
    sayingNoWhere(refused.body, shared(draft));
    expect((await fileIn(first, shared(draft)))?.content).toBe(cube(draft));
  });

  it('is refused for a file name the folder it goes to holds, naming that file, which is unchanged', async () => {
    const folderId = await project();
    const refused = await generated(folderId, [
      { path: shared(STOCK), content: cube(`other_${MARK}`, STOCK) },
    ]);

    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json<{ errors: unknown[] }>().errors).toEqual([
      { path: shared(STOCK), message: `${shared(STOCK)} is already in the model store.` },
    ]);
    expect((await fileIn(ids.sales, shared(STOCK)))?.content).toBe(cube(STOCK));
    expect(await fileIn(folderId, shared(STOCK))).toBeUndefined();
  });
});
