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
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, TEST_TIME_ZONE, workspaceKeyOf } from './project-folder.fixture';

/**
 * T706 (AC-423, AC-291, AC-275; `[R71]` 3, 5): a landed cube's, view's or
 * data source's name is fixed. Its rename is refused through the data
 * source's route, through an edit copy's save and its proposal, and at
 * approval, and the landed name is unchanged after each. A cube's title
 * still changes through an edit copy, and a draft's name until it lands. A
 * delete of a name a chart still uses is still refused, naming the chart.
 *
 * `writer` (`sales-rw`) works in their workspace on /Sales's models; `super`
 * approves. Against the suite's database and the stub xcube, which applies
 * what is sent.
 */
const MARK = `fn${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `fnm-${MARK}`;
const ORDERS = `${MARK}_orders`;
const VIEWED = `${MARK}_summary`;
const TITLED = `${MARK}_titled`;
const USED = `${MARK}_used`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const view = (name: string) =>
  `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${ORDERS}\n        includes: "*"\n`;
const titled = (name: string, title: string) => cube(name, `    title: ${title}\n`);
const shared = (name: string) => `cubes/${name}.yml`;

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '' };
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const fields = { host: 'fixed-db', port: 5432, database: 'fixed', user: 'cube', ssl: false };

beforeAll(async () => {
  cubeServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  ids.sales = randomUUID();
  made.push({ kind: 'folder', id: ids.sales });
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  await files().write(
    [
      [shared(ORDERS), cube(ORDERS)],
      [`views/${VIEWED}.yml`, view(VIEWED)],
      [shared(TITLED), cube(TITLED)],
      [shared(USED), cube(USED)],
    ].map(([path, content]) => ({ folderId: ids.sales, path: path!, content: content! })),
  );

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
  ]);
  stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
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
  await getDb().deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('item_versions').where('folder_id', '=', ids.sales).execute();
  await getDb().deleteFrom('data_sources').where('name', 'like', `%${MARK}%`).execute();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', '=', ids.sales).execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .where('kind', '!=', 'folder')
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/**
 * /Sales's file copied into the writer's workspace ("Edit in my workspace"),
 * or their copy already there: its project folder.
 */
async function copiedInto(path: string) {
  const copied = await as('writer', {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: { kind: 'model', folderId: ids.sales, path, timeZone: TEST_TIME_ZONE },
  });
  expect([200, 201], copied.body).toContain(copied.statusCode);
  return copied.json<{ folderId: string }>().folderId;
}
const save = (folderId: string, path: string, content: string, target?: string) =>
  as('writer', {
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId,
      files: [{ path, content }],
      ...(target === undefined ? {} : { targetFolderId: target }),
    },
  });
const workspaceFile = async (folderId: string, path: string) =>
  (await files().inFolders([folderId])).find((file) => file.path === path)!;
const salesFiles = async () =>
  Object.fromEntries(
    (await files().inFolders([ids.sales])).map((file) => [file.path, file.content]),
  );
const propose = (id: string) =>
  as('writer', { method: 'POST', url: '/api/proposals', payload: { kind: 'model', id } });
const approve = (id: string) =>
  as('super', { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });
const headNames = () =>
  (stub.head(MODEL)?.items ?? [])
    .filter((item) => item.folderId === 'fsales')
    .map((item) => item.name)
    .sort();

describe('a landed data source’s name is fixed (T706, AC-423)', () => {
  it('refuses its rename through its route, and keeps the name it landed with', async () => {
    const landed = await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });

    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${landed.id}`,
      payload: { name: `ledger_${MARK}` },
    });

    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json<{ error: string }>().error).toBe(
      `“warehouse_${MARK}” has landed, so its name is fixed. Its description can still change.`,
    );
    expect((await sources().get(landed.id))?.name).toBe(`warehouse_${MARK}`);
  });

  it('takes a workspace draft’s new name until it lands', async () => {
    const project = await copiedInto(shared(USED));
    const draft = await sources().create({
      folderId: project,
      targetFolderId: ids.sales,
      name: `draft_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });

    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${draft.id}`,
      payload: { name: `drafted_${MARK}` },
    });

    expect(renamed.statusCode, renamed.body).toBe(200);
    expect((await sources().get(draft.id))?.name).toBe(`drafted_${MARK}`);
    expect((await sources().get(draft.id))?.folderId).toBe(project);
  });
});

describe('a landed cube’s or view’s name is fixed (T706, AC-423)', () => {
  it('refuses to save an edit copy whose cube declares another name, leaving the copy as it was', async () => {
    const project = await copiedInto(shared(ORDERS));
    const before = (await workspaceFile(project, shared(ORDERS))).content;

    const saved = await save(project, shared(ORDERS), cube(`${MARK}_purchases`));

    expect(saved.statusCode, saved.body).toBe(409);
    expect(saved.json<{ error: string }>().error).toBe(
      `“${ORDERS}” has landed, so its name is fixed: a copy of it keeps that name. Its title can still change.`,
    );
    expect((await workspaceFile(project, shared(ORDERS))).content).toBe(before);
  });

  it('refuses to save an edit copy whose view declares another name', async () => {
    const path = `views/${VIEWED}.yml`;
    const project = await copiedInto(path);

    const saved = await save(project, path, view(`${MARK}_overview`));

    expect(saved.statusCode, saved.body).toBe(409);
    expect(saved.json<{ error: string }>().error).toBe(
      `“${VIEWED}” has landed, so its name is fixed: a copy of it keeps that name. Its title can still change.`,
    );
    expect((await workspaceFile(project, path)).content).toBe(view(VIEWED));
  });

  it('refuses to propose such a copy, and an approval of one lands nothing of it', async () => {
    const project = await copiedInto(shared(ORDERS));
    const copy = await workspaceFile(project, shared(ORDERS));
    // Renamed past the save's check, as a copy stored before it was.
    await files().write([
      { folderId: project, path: shared(ORDERS), content: cube(`${MARK}_purchases`) },
    ]);
    const before = await salesFiles();
    const landedNames = headNames();

    const proposed = await propose(copy.id);
    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string }>().error).toBe(
      `“${ORDERS}” has landed, so its name is fixed: a copy of it keeps that name. Its title can still change.`,
    );

    // One made before the rule, approved now: refused, and nothing lands.
    const renamedCopy = await workspaceFile(project, shared(ORDERS));
    const proposal = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(project), name: 'Wren Writer' },
      targetFolderId: ids.sales,
      description: null,
      items: [
        {
          kind: 'model',
          id: renamedCopy.id,
          title: renamedCopy.path,
          version: renamedCopy.version,
          snapshot: {
            path: renamedCopy.path,
            content: renamedCopy.content,
            origin: renamedCopy.origin,
          },
          landsIn: ids.sales,
          // As a proposal named it: no file of /Sales declares its new name.
          replaces: null,
        },
      ],
    });
    const approved = await approve(proposal.id);
    expect(approved.statusCode, approved.body).toBe(409);
    expect(approved.json<{ error: string }>().error).toBe(
      `“${shared(ORDERS)}” can’t land: “${ORDERS}” has landed, so its name is fixed: a copy of it keeps that name.`,
    );
    expect(await salesFiles()).toEqual(before);
    expect(headNames()).toEqual(landedNames);
    expect(headNames()).toContain(ORDERS);
  });

  it('saves, proposes and lands an edit copy that changes only its cube’s title', async () => {
    const project = await copiedInto(shared(TITLED));
    const changed = titled(TITLED, `Titled ${MARK}`);

    const saved = await save(project, shared(TITLED), changed);
    expect(saved.statusCode, saved.body).toBe(200);
    const proposed = await propose((await workspaceFile(project, shared(TITLED))).id);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);

    expect((await salesFiles())[shared(TITLED)]).toBe(changed);
    expect(
      stub.head(MODEL)?.items.find((item) => item.folderId === 'fsales' && item.name === TITLED)
        ?.yaml,
    ).toBe(changed);
  });

  it('takes a draft’s new name until it lands', async () => {
    const project = await copiedInto(shared(USED));
    const path = `cubes/${MARK}_new.yml`;

    const first = await save(project, path, cube(`${MARK}_draft`), ids.sales);
    expect(first.statusCode, first.body).toBe(200);
    const renamed = await save(project, path, cube(`${MARK}_drafted`));

    expect(renamed.statusCode, renamed.body).toBe(200);
    expect((await workspaceFile(project, path)).content).toBe(cube(`${MARK}_drafted`));
  });
});

/**
 * T703 (AC-426): a model saved in My workspace is held to R72's grammar
 * before anything of it is stored or reaches its overlay, as a published one
 * is (`routes/names.test.ts`).
 */
describe('a workspace model named outside the grammar (T703, AC-426)', () => {
  it('is refused, saying the grammar or the reserved word, and nothing of it is saved', async () => {
    const project = await copiedInto(shared(USED));
    for (const [name, message] of [
      [
        `${MARK}__bad`,
        `“${MARK}__bad” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.`,
      ],
      ['Class', '“Class” is a reserved word, so a cube or view can’t take it.'],
    ] as const) {
      const path = `cubes/${MARK}_misnamed.yml`;
      const saved = await save(project, path, cube(name), ids.sales);
      expect(saved.statusCode, name).toBe(422);
      expect(saved.json<{ errors: unknown[] }>().errors, name).toEqual([{ path, message }]);
      expect((await files().inFolders([project])).map((file) => file.path)).not.toContain(path);
    }
    // Upper case is a name.
    const upper = await save(project, `cubes/${MARK}_upper.yml`, cube(`Upper_${MARK}`), ids.sales);
    expect(upper.statusCode, upper.body).toBe(200);
  });
});

describe('a delete of a name in use (T706, AC-275)', () => {
  it('is still refused, naming the chart that uses it', async () => {
    const chart = randomUUID();
    made.push({ kind: 'chart', id: chart });
    await docs().create({
      kind: 'chart',
      id: chart,
      body: {
        schemaVersion: 1,
        owner: 'admin',
        title: `Used chart ${MARK}`,
        folderId: ids.sales,
        chart: {
          source: { cube: `fsales__${USED}` },
          wells: { measures: [`fsales__${USED}.count`] },
        },
      },
    });

    const removed = await as('writer', {
      method: 'DELETE',
      url: `/api/model/files?folder=${encodeURIComponent(ids.sales)}&path=${encodeURIComponent(shared(USED))}`,
    });

    expect(removed.statusCode, removed.body).toBe(409);
    expect(removed.json<{ error: string }>().error).toBe(
      `“${USED}” is still used by the chart “Used chart ${MARK}”.`,
    );
    expect((await salesFiles())[shared(USED)]).toBe(cube(USED));
  });
});
