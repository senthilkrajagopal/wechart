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
import { PROPOSAL_BINDINGS, proposalBindingStore } from '../repos/proposal-bindings';
import { proposalStore, type ProposedItem } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, TEST_TIME_ZONE, workspaceKeyOf } from './project-folder.fixture';

/**
 * T704 (AC-421, AC-422, AC-424, AC-321; `[R71]` 1, 5, 6): a name lands only
 * once in its namespace. An approval holding a cube's, view's, split view's
 * or data source's name that has already landed, in any folder and in any
 * case, is refused before anything of it lands, its data sources included,
 * saying only that the name is in use. A clash only xcube sees, as in a race,
 * is refused the same way (research `xcube-256d632371.md`, "The error kinds").
 *
 * `writer` (`sales-rw`) proposes to /Sales from their workspace; /Ops, which
 * they can't see, holds the landed namesakes; `super` approves. Against the
 * suite's database and the stub xcube, which applies what is sent.
 */
const MARK = `ln${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `lnm-${MARK}`;
const SEED = `${MARK}_seed`;
const ORDERS = `orders_${MARK}`;
const REV = `rev_${MARK}`;
const WAREHOUSE = `warehouse_${MARK}`;
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const splitView = (name: string, alias: string) =>
  `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${SEED}\n        alias: ${alias}\n        includes: "*"\n        split: true\n`;
const view = (name: string) =>
  `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${SEED}\n        includes: "*"\n`;
const shared = (name: string) => `cubes/${name}.yml`;
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const fields = { host: 'names-db', port: 5432, database: 'names', user: 'cube', ssl: false };

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
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
    { folderId: ids.sales, path: shared(SEED), content: cube(SEED) },
    { folderId: ids.ops, path: shared(ORDERS), content: cube(ORDERS) },
    { folderId: ids.ops, path: shared(`${REV}_lines`), content: cube(`${REV}_lines`) },
  ]);
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
  stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fops', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
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
    proposals: proposalStore(getDb()),
    proposalBindings: proposalBindingStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
    afterPublish: async (changeset) => {
      if (changeset === undefined) return;
      const base = (await admin.revision()).current?.revision ?? null;
      await admin.applyChangeset({
        baseRevision: base,
        upserts: changeset.upserts,
        deletes: changeset.deletes,
      });
    },
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
  await getDb()
    .deleteFrom('item_versions')
    .where('folder_id', 'in', [ids.sales, ids.ops])
    .execute();
  await getDb().deleteFrom('data_sources').where('name', 'ilike', `%${MARK}%`).execute();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', [ids.sales, ids.ops]).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** The writer's workspace project folder, made by copying /Sales's seed cube there. */
async function project() {
  const copied = await as('writer', {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: { kind: 'model', folderId: ids.sales, path: shared(SEED), timeZone: TEST_TIME_ZONE },
  });
  expect([200, 201], copied.body).toContain(copied.statusCode);
  return copied.json<{ folderId: string }>().folderId;
}
/** A draft model in the writer's workspace, proposed to /Sales as it is (as a proposal made earlier). */
async function proposedModel(path: string, content: string) {
  const folderId = await project();
  await files().write([{ folderId, path, content }]);
  const draft = (await files().inFolders([folderId])).find((file) => file.path === path)!;
  return proposalStore(getDb()).create({
    author: { key: await workspaceKeyOf(folderId), name: 'Wren Writer' },
    targetFolderId: ids.sales,
    description: null,
    items: [
      {
        kind: 'model',
        id: draft.id,
        title: draft.path,
        version: draft.version,
        snapshot: { path: draft.path, content: draft.content, origin: null },
        landsIn: ids.sales,
        replaces: null,
      } satisfies ProposedItem,
    ],
  });
}
const approve = (id: string) =>
  as('super', { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });
const salesFiles = async () =>
  Object.fromEntries(
    (await files().inFolders([ids.sales])).map((file) => [file.path, file.content]),
  );
const headNames = () => (stub.head(MODEL)?.items ?? []).map((item) => item.name).sort();
/** Nothing of where the name is held: not /Ops's id, xcube id or title. */
const sayingNoFolder = (body: string) => {
  for (const where of [ids.ops, 'fops', `Ops ${MARK}`]) expect(body).not.toContain(where);
};

describe('an approval holding a name already landed (T704, AC-421, AC-422, AC-424, AC-321)', () => {
  it('is refused for a cube whose name a landed cube holds in another folder, in another case', async () => {
    const proposal = await proposedModel(`cubes/${MARK}_orders.yml`, cube(ORDERS.toUpperCase()));
    const before = [await salesFiles(), headNames()];

    const refused = await approve(proposal.id);

    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json<{ error: string }>().error).toBe(
      `The name “${ORDERS.toUpperCase()}” is already in use, so nothing was approved.`,
    );
    sayingNoFolder(refused.body);
    expect([await salesFiles(), headNames()]).toEqual(before);
  });

  it('is refused for a view of that name, and for a view whose split view takes it', async () => {
    for (const [path, content, name] of [
      [`views/${MARK}_v.yml`, view(ORDERS), ORDERS],
      [`views/${MARK}_split.yml`, splitView(REV, 'lines'), `${REV}_lines`],
    ] as const) {
      const proposal = await proposedModel(path, content);
      const before = [await salesFiles(), headNames()];

      const refused = await approve(proposal.id);

      expect(refused.statusCode, refused.body).toBe(409);
      expect(refused.json<{ error: string }>().error).toBe(
        `The name “${name}” is already in use, so nothing was approved.`,
      );
      sayingNoFolder(refused.body);
      expect([await salesFiles(), headNames()]).toEqual(before);
    }
  });

  it('is refused for a data source whose name a landed one holds, and lands no data source', async () => {
    const folderId = await project();
    const name = WAREHOUSE.replace('warehouse', 'Warehouse');
    const drafted = await sources().create({
      folderId,
      targetFolderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });
    const proposal = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(folderId), name: 'Wren Writer' },
      targetFolderId: ids.sales,
      description: null,
      items: [
        {
          kind: 'data-source',
          id: drafted.id,
          title: name,
          version: drafted.version,
          snapshot: {
            name,
            driver: 'postgres',
            authMethod: 'password',
            fields,
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

    const refused = await approve(proposal.id);

    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json<{ error: string }>().error).toBe(
      `The name “${name}” is already in use, so nothing was approved.`,
    );
    sayingNoFolder(refused.body);
    expect((await sources().inFolder(ids.sales)).map((each) => each.name)).toEqual([]);
  });

  it('is refused the same way when only xcube sees the clash, as in a race', async () => {
    const fresh = `fresh_${MARK}`;
    const proposal = await proposedModel(shared(fresh), cube(fresh));
    const before = [await salesFiles(), headNames()];
    // Landed meanwhile somewhere wechart hasn't read: xcube's own refusal (T701).
    stub.refuse([
      {
        folderId: 'fsales',
        name: fresh,
        kind: 'name_in_use',
        message: `The name "${fresh}" is already in use`,
      },
    ]);
    try {
      const refused = await approve(proposal.id);
      expect(refused.statusCode, refused.body).toBe(422);
      expect(
        refused.json<{ errors: { message: string }[] }>().errors.map((each) => each.message),
      ).toEqual([`The name “${fresh}” is already in use.`]);
      sayingNoFolder(refused.body);
    } finally {
      stub.refuse(undefined);
    }
    expect([await salesFiles(), headNames()]).toEqual(before);
  });

  it('lands the first of two drafts of one new name, and refuses the second as in use, even in the same folder', async () => {
    const twin = `twin_${MARK}`;
    const first = await proposedModel(shared(twin), cube(twin));
    const second = await proposedModel(`cubes/${twin}_b.yml`, cube(twin));

    expect((await approve(first.id)).statusCode).toBe(200);
    const before = [await salesFiles(), headNames()];
    const refused = await approve(second.id);

    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json<{ error: string }>().error).toBe(
      `The name “${twin}” is already in use, so nothing was approved.`,
    );
    expect([await salesFiles(), headNames()]).toEqual(before);
  });

  it('lands a name nothing holds', async () => {
    const free = `free_${MARK}`;
    const proposal = await proposedModel(shared(free), cube(free));

    const approved = await approve(proposal.id);

    expect(approved.statusCode, approved.body).toBe(200);
    expect((await salesFiles())[shared(free)]).toBe(cube(free));
  });
});
