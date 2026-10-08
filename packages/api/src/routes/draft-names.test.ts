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
import { xcubeAdmin, type XcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T705 (AC-422, AC-424, AC-282; `[R71]` 5, 6): a draft's name is checked when
 * it is made, renamed and proposed, against every landed name in its
 * namespace and against its own workspace's other drafts, never another
 * workspace's: no name is reserved. The refusal says only that the name is in
 * use. A copy made to edit a landed item keeps its name, and so is never
 * refused it.
 *
 * `writer` (`sales-rw`) drafts in their workspace, going to /Sales; /Ops,
 * which they can't see, holds landed namesakes; `super` has a workspace of
 * their own. Against the suite's database and the stub xcube.
 */
const MARK = `dn${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `dnm-${MARK}`;
const SEED = `${MARK}_seed`;
const ORDERS = `orders_${MARK}`;
const WAREHOUSE = `warehouse_${MARK}`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const shared = (name: string) => `cubes/${name}.yml`;
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const fields = { host: 'drafts-db', port: 5432, database: 'drafts', user: 'cube', ssl: false };
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };

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
/** A project folder in `who`'s workspace. */
async function project(who: string) {
  const made = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Drafts ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(made.statusCode, made.body).toBe(201);
  return made.json<{ id: string }>().id;
}
const save = (who: string, folderId: string, path: string, content: string, target?: string) =>
  as(who, {
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId,
      files: [{ path, content }],
      ...(target === undefined ? {} : { targetFolderId: target }),
    },
  });
const inUse = (name: string) => ({
  path: expect.any(String),
  message: `The name “${name}” is already in use.`,
});
const fileIn = async (folderId: string, path: string) =>
  (await files().inFolders([folderId])).find((file) => file.path === path);
/** Nothing of where the name is held: not /Ops's id, xcube id or title, nor a workspace's. */
const sayingNoFolder = (body: string) => {
  for (const where of [ids.ops, 'fops', `Ops ${MARK}`, 'Drafts']) expect(body).not.toContain(where);
};
const madeSource = async (who: string, folderId: string, name: string) => {
  const settings = {
    driver: 'postgres',
    authMethod: 'password',
    fields,
    sealed: { password: sealed },
  };
  const tested = await as(who, {
    method: 'POST',
    url: '/api/data-sources/test',
    payload: { ...settings, folderId },
  });
  expect(tested.statusCode, tested.body).toBe(200);
  return as(who, {
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

describe('a draft model’s name, when it is made and renamed (T705, AC-422, AC-424)', () => {
  it('is refused when it has landed in any folder, in any case, and nothing is saved', async () => {
    const folderId = await project('writer');
    const path = `cubes/${MARK}_orders.yml`;

    const refused = await save('writer', folderId, path, cube(ORDERS.toUpperCase()), ids.sales);

    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json<{ errors: unknown[] }>().errors).toEqual([
      { path, message: `The name “${ORDERS.toUpperCase()}” is already in use.` },
    ]);
    sayingNoFolder(refused.body);
    expect(await fileIn(folderId, path)).toBeUndefined();
  });

  it('is refused when another draft in the workspace declares it, and when a draft is renamed to it', async () => {
    const first = await project('writer');
    const twin = `twin_${MARK}`;
    expect((await save('writer', first, shared(twin), cube(twin), ids.sales)).statusCode).toBe(200);

    const second = await project('writer');
    const again = await save('writer', second, `cubes/${twin}_2.yml`, cube(twin), ids.sales);
    expect(again.statusCode, again.body).toBe(422);
    expect(again.json<{ errors: unknown[] }>().errors).toEqual([inUse(twin)]);

    // A draft of another name, renamed to it.
    const other = `other_${MARK}`;
    expect((await save('writer', second, shared(other), cube(other), ids.sales)).statusCode).toBe(
      200,
    );
    const renamed = await save('writer', second, shared(other), cube(twin.toUpperCase()));
    expect(renamed.statusCode, renamed.body).toBe(422);
    expect(renamed.json<{ errors: unknown[] }>().errors).toEqual([inUse(twin.toUpperCase())]);
    expect((await fileIn(second, shared(other)))?.content).toBe(cube(other));
  });

  it('is not refused for a draft of that name in another workspace', async () => {
    const shared2 = `shared_${MARK}`;
    const theirs = await project('super');
    expect(
      (await save('super', theirs, shared(shared2), cube(shared2), ids.sales)).statusCode,
    ).toBe(200);
    const mine = await project('writer');
    const saved = await save('writer', mine, shared(shared2), cube(shared2), ids.sales);
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('keeps an edit copy’s name: it saves and proposes under its original’s', async () => {
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'model', folderId: ids.sales, path: shared(SEED), timeZone: TEST_TIME_ZONE },
    });
    expect([200, 201], copied.body).toContain(copied.statusCode);
    const folderId = copied.json<{ folderId: string }>().folderId;
    const changed = cube(SEED, `    title: Seed ${MARK}\n`);

    const saved = await save('writer', folderId, shared(SEED), changed);
    expect(saved.statusCode, saved.body).toBe(200);
    const file = (await fileIn(folderId, shared(SEED)))!;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    await as('writer', {
      method: 'POST',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}/reject`,
      payload: {},
    });
  });
});

describe('a draft’s name when it is proposed (T705, AC-422, AC-424)', () => {
  it('is refused once that name has landed since the draft took it', async () => {
    const late = `late_${MARK}`;
    const folderId = await project('writer');
    expect((await save('writer', folderId, shared(late), cube(late), ids.sales)).statusCode).toBe(
      200,
    );
    // Landed meanwhile, in a folder the writer can't see.
    await files().write([{ folderId: ids.ops, path: shared(late), content: cube(late) }]);

    const file = (await fileIn(folderId, shared(late)))!;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file.id },
    });

    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string }>().error).toBe(
      `The name “${late}” is already in use, so it wasn’t proposed.`,
    );
    sayingNoFolder(proposed.body);
    expect(await proposalStore(getDb()).openFor('model', file.id)).toBeNull();
  });

  // T705's review: even where the namesake lands in the draft's own target,
  // the draft never lands over it, as only a copy of it would.
  it('is refused when that name has landed since in the draft’s own target folder', async () => {
    const near = `near_${MARK}`;
    const folderId = await project('writer');
    expect((await save('writer', folderId, shared(near), cube(near), ids.sales)).statusCode).toBe(
      200,
    );
    await files().write([
      { folderId: ids.sales, path: `cubes/${near}_theirs.yml`, content: cube(near) },
    ]);

    const file = (await fileIn(folderId, shared(near)))!;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'model', id: file.id },
    });

    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string }>().error).toBe(
      `The name “${near}” is already in use, so it wasn’t proposed.`,
    );
    expect(await proposalStore(getDb()).openFor('model', file.id)).toBeNull();
  });

  it('is refused for a data source whose name has landed since, in its own target folder too', async () => {
    const spring = `spring_${MARK}`;
    const made = await madeSource('writer', await project('writer'), spring);
    expect(made.statusCode, made.body).toBe(201);
    await sources().create({
      folderId: ids.sales,
      name: spring,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });

    const id = made.json<{ id: string }>().id;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'data-source', id },
    });

    expect(proposed.statusCode, proposed.body).toBe(409);
    expect(proposed.json<{ error: string }>().error).toBe(
      `The name “${spring}” is already in use, so it wasn’t proposed.`,
    );
    expect(await proposalStore(getDb()).openFor('data-source', id)).toBeNull();
  });
});

describe('a copy for use only (T705’s review, AC-422)', () => {
  it('keeps its original’s name, and is refused another name held elsewhere', async () => {
    const folderId = await project('writer');
    // A landed cube of its own, so no other copy of it is in the workspace.
    const used = `used_${MARK}`;
    await files().write([{ folderId: ids.sales, path: shared(used), content: cube(used) }]);
    const original = (await files().inFolders([ids.sales])).find(
      (file) => file.path === shared(used),
    )!;
    await files().write([
      {
        folderId,
        path: shared(used),
        content: cube(used),
        targetFolderId: ids.sales,
        origin: {
          id: original.id,
          folderId: ids.sales,
          path: original.path,
          version: original.version,
          useOnly: true,
        },
      },
    ]);
    // Under its original's name, it saves.
    const kept = await save(
      'writer',
      folderId,
      shared(used),
      cube(used, '    description: Mine\n'),
    );
    expect(kept.statusCode, kept.body).toBe(200);
    // Under one held elsewhere, it doesn't.
    const renamed = await save('writer', folderId, shared(used), cube(ORDERS));
    expect(renamed.statusCode, renamed.body).toBe(422);
    expect(renamed.json<{ errors: unknown[] }>().errors).toEqual([inUse(ORDERS)]);
  });
});

describe('a workspace data source’s name (T705, AC-422, AC-424, AC-282)', () => {
  it('is refused when made under a landed name, in any case, or another draft’s, and when renamed to one', async () => {
    const folderId = await project('writer');
    const name = WAREHOUSE.replace('warehouse', 'Warehouse');

    const refused = await madeSource('writer', folderId, name);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json<{ error: string }>().error).toBe(`The name “${name}” is already in use.`);
    sayingNoFolder(refused.body);

    const lake = `lake_${MARK}`;
    expect((await madeSource('writer', folderId, lake)).statusCode).toBe(201);
    const twice = await madeSource('writer', await project('writer'), lake.toUpperCase());
    expect(twice.statusCode, twice.body).toBe(409);
    expect(twice.json<{ error: string }>().error).toBe(
      `The name “${lake.toUpperCase()}” is already in use.`,
    );

    const pond = await madeSource('writer', folderId, `pond_${MARK}`);
    expect(pond.statusCode).toBe(201);
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${pond.json<{ id: string }>().id}`,
      payload: { name: WAREHOUSE },
    });
    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json<{ error: string }>().error).toBe(
      `The name “${WAREHOUSE}” is already in use.`,
    );
    sayingNoFolder(renamed.body);
  });

  it('is not refused for a draft of that name in another workspace', async () => {
    const creek = `creek_${MARK}`;
    expect((await madeSource('super', await project('super'), creek)).statusCode).toBe(201);
    expect((await madeSource('writer', await project('writer'), creek)).statusCode).toBe(201);
  });
});

/**
 * T707 (AC-427; `[R71]` 4): a deleted cube's, view's or data source's name is
 * free again. A delete is already refused while anything uses the item. By
 * xcube's reasoning, what it serves a new item of a deleted name is its own,
 * never the old one's cache or rollups (research `xcube-256d632371.md`, 5.2;
 * "never" is UNVERIFIED by wechart beyond xcube's test), so wechart does
 * nothing more for it.
 */
describe('a deleted item’s name (T707, AC-427)', () => {
  const approve = (id: string) =>
    as('super', { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });
  const propose = (kind: string, id: string) =>
    as('writer', { method: 'POST', url: '/api/proposals', payload: { kind, id } });

  it('is taken again by a draft cube: made, renamed to, proposed and approved, and it lands', async () => {
    const margin = `margin_${MARK}`;
    await files().write([{ folderId: ids.sales, path: shared(margin), content: cube(margin) }]);
    const folderId = await project('writer');
    // Held while it is landed.
    const early = await save(
      'writer',
      folderId,
      `cubes/${margin}_new.yml`,
      cube(margin),
      ids.sales,
    );
    expect(early.statusCode, early.body).toBe(422);

    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/model/files?folder=${encodeURIComponent(ids.sales)}&path=${encodeURIComponent(shared(margin))}`,
    });
    expect(deleted.statusCode, deleted.body).toBe(200);

    // Made under it, in another project folder of the workspace.
    const other = await project('writer');
    const direct = await save('writer', other, shared(margin), cube(margin), ids.sales);
    expect(direct.statusCode, direct.body).toBe(200);
    expect(
      (
        await as('writer', {
          method: 'DELETE',
          url: `/api/model/files?folder=${encodeURIComponent(other)}&path=${encodeURIComponent(shared(margin))}`,
        })
      ).statusCode,
    ).toBe(200);

    const path = `cubes/${margin}_new.yml`;
    const made = await save('writer', folderId, path, cube(`${margin}_draft`), ids.sales);
    expect(made.statusCode, made.body).toBe(200);
    const renamed = await save('writer', folderId, path, cube(margin.toUpperCase()));
    expect(renamed.statusCode, renamed.body).toBe(200);
    const proposed = await propose('model', (await fileIn(folderId, path))!.id);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await fileIn(ids.sales, path))?.content).toBe(cube(margin.toUpperCase()));
  });

  // T708's review: a view's, as a cube's (AC-427 names all three).
  it('is taken again by a draft view: made, proposed and approved, and it lands', async () => {
    const lens = `lens_${MARK}`;
    const view = (name: string) =>
      `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${SEED}\n        includes: "*"\n`;
    const path = `views/${lens}.yml`;
    await files().write([{ folderId: ids.sales, path, content: view(lens) }]);
    const folderId = await project('writer');
    const early = await save('writer', folderId, `views/${lens}_new.yml`, view(lens), ids.sales);
    expect(early.statusCode, early.body).toBe(422);

    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/model/files?folder=${encodeURIComponent(ids.sales)}&path=${encodeURIComponent(path)}`,
    });
    expect(deleted.statusCode, deleted.body).toBe(200);

    const again = `views/${lens}_new.yml`;
    const made = await save('writer', folderId, again, view(lens.toUpperCase()), ids.sales);
    expect(made.statusCode, made.body).toBe(200);
    const proposed = await propose('model', (await fileIn(folderId, again))!.id);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await fileIn(ids.sales, again))?.content).toBe(view(lens.toUpperCase()));
  });

  it('is taken again by a draft data source: made, renamed to, proposed and approved, and it lands', async () => {
    const staging = `staging_${MARK}`;
    const landed = await sources().create({
      folderId: ids.sales,
      name: staging,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    });
    const folderId = await project('writer');
    expect((await madeSource('writer', folderId, staging)).statusCode).toBe(409);

    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/data-sources/${landed.id}`,
    });
    expect(deleted.statusCode, deleted.body).toBe(204);

    // Renamed to it: a draft of another name takes it.
    const other = await madeSource('writer', await project('writer'), `${staging}_other`);
    expect(other.statusCode, other.body).toBe(201);
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${other.json<{ id: string }>().id}`,
      payload: { name: staging },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    // Removed again, so the one made below is the only draft of the name.
    expect(
      (
        await as('writer', {
          method: 'DELETE',
          url: `/api/data-sources/${other.json<{ id: string }>().id}`,
        })
      ).statusCode,
    ).toBe(204);

    const made = await madeSource('writer', folderId, staging);
    expect(made.statusCode, made.body).toBe(201);
    const proposed = await propose('data-source', made.json<{ id: string }>().id);
    expect(proposed.statusCode, proposed.body).toBe(201);
    const approved = await approve(proposed.json<{ id: string }>().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await sources().inFolder(ids.sales)).map((each) => each.name)).toContain(staging);
  });
});
