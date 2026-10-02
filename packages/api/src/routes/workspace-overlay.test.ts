import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

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
import { removeProjectFolders, workspaceFoldersOf } from './project-folder.fixture';

/**
 * T347 (AC-281, AC-282, AC-283, AC-323, AC-280, AC-222): a workspace's
 * models and data sources are its overlay in xcube, placed where they go —
 * a copy in its origin's folder, a new one in its target — and pushed before
 * anything of them is stored, so a change xcube refuses is refused. Its
 * owner's previews of a workspace item name it in their signed token, and no
 * one else's, nor a shared item's; their field list is the overlay's; their
 * queries may name the overlay's cubes. Emptied, it is dropped.
 *
 * Against the suite's database, the stub xcube and a stub Cube that records
 * each token. `writer` (`sales-rw`) writes /Sales and /Ops; `reader`
 * (`sales-ro`) reads /Sales and has no workspace; /Hidden is `managers'`.
 */
const MARK = `ov${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `ovl-${MARK}`;
const cubeName = (what: string) => `${MARK}_${what}`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n      - name: count\n        type: count\n${extra}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});

/** Each token Cube was sent, decoded, with the path it was sent to. */
const asked: { path: string; claims: Record<string, unknown> }[] = [];
/** The next answer Cube gives in place of its own, as xcube answers a broken overlay. */
let refusing: { status: number; error: string } | undefined;
let cubeServer: Server;
let cubeApiUrl = '';
/** /Viewing the writer only reads; /Unserved one xcube's tree doesn't hold. */
const folders = { sales: '', ops: '', hidden: '', viewing: '', unserved: '' };
const xids = new Map<string, string>();
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let warehouse = '';

beforeAll(async () => {
  cubeServer = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}',
    ) as Record<string, unknown>;
    asked.push({ path: request.url ?? '', claims });
    if (refusing !== undefined) {
      const { status, error } = refusing;
      refusing = undefined;
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error }));
      return;
    }
    const overlay = claims['wechartOverlay'];
    const own =
      typeof overlay === 'string'
        ? (stub.overlay(MODEL, overlay)?.upserts ?? []).map((item) =>
            item.folderId === 'froot' ? item.name : `${item.folderId}__${item.name}`,
          )
        : [];
    response.writeHead(200, {
      'content-type': 'application/json',
      // xcube says which overlay answered (research xcube-slice-5.md, "Answers").
      ...(typeof overlay === 'string'
        ? { 'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}` }
        : {}),
    });
    response.end(
      JSON.stringify(
        (request.url ?? '').includes('/v1/meta')
          ? {
              // An overlay's item of a published full name stands in its place.
              cubes: [
                ...new Set([
                  `fsales__${cubeName('orders')}`,
                  `fhidden__${cubeName('secret')}`,
                  ...own,
                ]),
              ].map((name) => ({ name, measures: [{ name: `${name}.count` }], dimensions: [] })),
            }
          : { data: [] },
      ),
    );
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  for (const [key, access] of [
    ['sales', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['ops', { readOnly: null, readWrite: ['sales-rw'] }],
    ['hidden', { readOnly: null, readWrite: ['managers'] }],
    ['viewing', { readOnly: ['sales-rw'], readWrite: ['managers'] }],
    ['unserved', { readOnly: null, readWrite: ['sales-rw'] }],
  ] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: { owner: 'admin', title: `${key} ${MARK}`, folderId: 'root', access },
    });
    folders[key] = id;
    if (key !== 'unserved') xids.set(id, `f${key}`);
  }
  xids.set('root', 'froot');
  await files().write([
    {
      folderId: folders.sales,
      path: `cubes/${cubeName('orders')}.yml`,
      content: cube(cubeName('orders')),
    },
    {
      folderId: folders.hidden,
      path: `cubes/${cubeName('secret')}.yml`,
      content: cube(cubeName('secret')),
    },
  ]);
  warehouse = (
    await sources().create({
      folderId: folders.sales,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('sales') },
    })
  ).id;

  stub = fakeXcube();
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
    { id: 'fhidden', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, [
    { folderId: 'fsales', name: cubeName('orders'), kind: 'cube', yaml: cube(cubeName('orders')) },
  ]);
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
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  });
  for (const who of ['writer', 'reader', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await removeProjectFolders();
  const ids = Object.values(folders).filter(Boolean);
  await getDb().deleteFrom('model_files').where('folder_id', 'in', ids).execute();
  await getDb().deleteFrom('model_files').where('target_folder_id', 'in', ids).execute();
  await getDb()
    .deleteFrom('documents')
    .where('kind', '!=', 'folder')
    .where('folder_id', 'in', ids)
    .execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('targetFolderId'), 'in', ids))
    .execute();
  await getDb().deleteFrom('data_sources').where('target_folder_id', 'in', ids).execute();
  await getDb().deleteFrom('data_sources').where('folder_id', 'in', ids).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** A workspace's id, by the folder a copy went into: its project folder's parent. */
const workspaceOf = async (projectId: string) =>
  String((await docs().get('folder', projectId))!.body['folderId']);
const copyModel = (who: string, folderId: string, path: string) =>
  as(who, {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: { kind: 'model', folderId, path, timeZone: 'UTC' },
  });
const save = (who: string, folderId: string, path: string, content: string, extra = {}) =>
  as(who, {
    method: 'POST',
    url: '/api/model/publish',
    payload: { folderId, files: [{ path, content }], ...extra },
  });

/** The workspace's copy of /Sales's orders: made once, by the first test that needs it. */
let copy: { folderId: string; path: string; workspace: string } | undefined;
const copied = async () => {
  if (copy !== undefined) return copy;
  const path = `cubes/${cubeName('orders')}.yml`;
  const answer = await copyModel('writer', folders.sales, path);
  expect(answer.statusCode, answer.body).toBe(201);
  const { folderId } = answer.json<{ folderId: string }>();
  copy = { folderId, path, workspace: await workspaceOf(folderId) };
  return copy;
};

describe('a shared model copied into My workspace (T347, AC-278, AC-281)', () => {
  it('goes back to its folder and names what it was copied from, and its overlay places it there', async () => {
    const { folderId, path, workspace } = await copied();

    const [file] = await files().inFolders([folderId]);
    expect(file).toEqual(
      expect.objectContaining({
        path,
        content: cube(cubeName('orders')),
        targetFolderId: folders.sales,
        origin: expect.objectContaining({ folderId: folders.sales, path, version: 1 }),
      }),
    );
    // In /Sales, under its own name: previews use it over /Sales's (AC-281).
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts).toEqual([
      {
        folderId: 'fsales',
        name: cubeName('orders'),
        kind: 'cube',
        yaml: cube(cubeName('orders')),
      },
    ]);

    // A second opens the first.
    const again = await copyModel('writer', folders.sales, path);
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json()).toEqual({ kind: 'model', created: false, folderId, path });
  });

  it('is only for a read-write member of its folder with a workspace, and never of one they can’t see', async () => {
    const path = `cubes/${cubeName('orders')}.yml`;
    expect((await copyModel('reader', folders.sales, path)).statusCode).toBe(403);
    expect(
      (await copyModel('writer', folders.hidden, `cubes/${cubeName('secret')}.yml`)).statusCode,
    ).toBe(404);
    expect((await copyModel('writer', folders.sales, 'cubes/none.yml')).statusCode).toBe(404);
  });
});

describe('a model saved in My workspace (T347, AC-282, AC-323)', () => {
  it('is stored only as its overlay takes it, keeping where it goes', async () => {
    const { folderId, path, workspace } = await copied();
    const changed = cube(cubeName('orders'), '    description: Changed in my workspace\n');

    const answer = await save('writer', folderId, path, changed, { targetFolderId: folders.ops });
    expect(answer.statusCode, answer.body).toBe(200);
    // Where it goes is as stored, whatever a save says.
    expect((await files().inFolders([folderId]))[0]).toEqual(
      expect.objectContaining({ content: changed, targetFolderId: folders.sales, version: 2 }),
    );
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts[0]?.yaml).toBe(changed);

    // xcube refuses the next: refused here, on its file, with nothing stored.
    stub.refuseOverlayNext(422, {
      code: 'invalid_items',
      error: 'The overlay does not apply',
      errors: [
        { folderId: 'fsales', name: cubeName('orders'), kind: 'compile', message: 'Broken here' },
      ],
      cubeMessage: null,
    });
    const refused = await save('writer', folderId, path, cube(cubeName('orders'), '    bad: 1\n'));
    expect(refused.statusCode, refused.body).toBe(422);
    expect(refused.json()).toEqual({ errors: [{ path, folderId, message: 'Broken here' }] });
    expect((await files().inFolders([folderId]))[0]?.content).toBe(changed);
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts[0]?.yaml).toBe(changed);
  });

  it('is made new only with a target its author may write, its overlay placing it there (AC-282)', async () => {
    const { folderId, workspace } = await copied();
    // Its own name, made by no other test, so it is new here whatever ran before.
    const path = `cubes/${cubeName('fresh')}.yml`;
    const content = cube(cubeName('fresh'));

    expect((await save('writer', folderId, path, content)).statusCode).toBe(400);
    expect(
      (await save('writer', folderId, path, content, { targetFolderId: folders.hidden }))
        .statusCode,
    ).toBe(404);
    expect(
      (await save('writer', folderId, path, content, { targetFolderId: folders.viewing }))
        .statusCode,
    ).toBe(403);
    expect(
      (await save('writer', folderId, path, content, { targetFolderId: 'mine' })).statusCode,
    ).toBe(400);
    // A folder xcube's tree doesn't hold: nowhere for its overlay to put it,
    // so refused rather than stored and left out of the previews.
    const unserved = await save('writer', folderId, path, content, {
      targetFolderId: folders.unserved,
    });
    expect(unserved.statusCode, unserved.body).toBe(409);
    expect((await files().inFolders([folderId])).map((file) => file.path)).not.toContain(path);
    const made = await save('writer', folderId, path, content, { targetFolderId: folders.ops });
    expect(made.statusCode, made.body).toBe(200);

    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts).toEqual(
      expect.arrayContaining([
        { folderId: 'fops', name: cubeName('fresh'), kind: 'cube', yaml: content },
      ]),
    );
    // Explore says where it goes (design 04, pin 3).
    const listed = await as('writer', {
      method: 'GET',
      url: `/api/folders/${folderId}/contents`,
    });
    expect(listed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'model', id: path, targetFolderId: folders.ops }),
      ]),
    );
  });
});

describe('a workspace item’s previews (T347, AC-323, AC-281, AC-283)', () => {
  const dashboardIn = async (who: string, folderId: string, target?: string) => {
    const answer = await as(who, {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'dashboard',
        title: `Board ${randomUUID().slice(0, 6)} ${MARK}`,
        folderId,
        ...(target === undefined ? {} : { targetFolderId: target }),
      },
    });
    expect(answer.statusCode, answer.body).toBe(201);
    return answer.json<{ id: string }>().id;
  };
  const load = (who: string, id: string, member: string) =>
    as(who, {
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: [member] }, for: { kind: 'dashboard', id } },
    });

  it('name the workspace’s overlay in its owner’s token, and a shared item’s none', async () => {
    const { folderId, workspace } = await copied();
    const board = await dashboardIn('writer', folderId, folders.sales);
    const shared = await dashboardIn('writer', folders.sales);

    asked.length = 0;
    const own = await load('writer', board, `fsales__${cubeName('orders')}.count`);
    expect(own.statusCode, own.body).toBe(200);
    const sharedLoad = await load('writer', shared, `fsales__${cubeName('orders')}.count`);
    expect(sharedLoad.statusCode, sharedLoad.body).toBe(200);

    expect(asked.map(({ claims }) => claims['wechartOverlay'])).toEqual([
      workspaceOverlayIdOf(workspace),
      undefined,
    ]);
    // No one else may open it, so no one else's token names it (AC-276, AC-323).
    expect((await load('super', board, `fsales__${cubeName('orders')}.count`)).statusCode).toBe(
      404,
    );
  });

  it('may name the overlay’s cubes, wherever it places them, and still none the user can’t see', async () => {
    const { folderId } = await copied();
    // Made new in the workspace for /Ops: on no path of /Sales's.
    await save('writer', folderId, `cubes/${cubeName('widgets')}.yml`, cube(cubeName('widgets')), {
      targetFolderId: folders.ops,
    });
    const board = await dashboardIn('writer', folderId, folders.sales);

    const widgets = await load('writer', board, `fops__${cubeName('widgets')}.count`);
    expect(widgets.statusCode, widgets.body).toBe(200);
    const secret = await load('writer', board, `fhidden__${cubeName('secret')}.count`);
    expect(secret.statusCode, secret.body).toBe(403);
  });

  it('read the field list from the overlay, with the workspace’s cubes in it', async () => {
    const { folderId, workspace } = await copied();
    await save('writer', folderId, `cubes/${cubeName('widgets')}.yml`, cube(cubeName('widgets')), {
      targetFolderId: folders.ops,
    });
    const board = await dashboardIn('writer', folderId, folders.sales);

    asked.length = 0;
    const meta = await as('writer', { method: 'GET', url: `/api/meta?for=dashboard:${board}` });
    expect(meta.statusCode, meta.body).toBe(200);
    expect(asked.at(-1)?.claims['wechartOverlay']).toBe(workspaceOverlayIdOf(workspace));
    const names = meta.json<{ cubes: { name: string }[] }>().cubes.map((each) => each.name);
    expect(names).toEqual(
      expect.arrayContaining([`fsales__${cubeName('orders')}`, `fops__${cubeName('widgets')}`]),
    );
    // Not the hidden folder's, which the item doesn't reach.
    expect(names).not.toContain(`fhidden__${cubeName('secret')}`);
    // The workspace's own are marked, for its picker to offer first (AC-329).
    const marked = meta
      .json<{ cubes: { name: string; meta?: { wechart?: { workspace?: boolean } } }[] }>()
      .cubes.filter((each) => each.meta?.wechart?.workspace === true)
      .map((each) => each.name);
    // Exactly the overlay's own, whatever else the workspace holds by now.
    const own = (stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.upserts ?? []).map(
      (item) => `${item.folderId}__${item.name}`,
    );
    expect(own).toEqual(
      expect.arrayContaining([`fops__${cubeName('widgets')}`, `fsales__${cubeName('orders')}`]),
    );
    expect(marked.sort()).toEqual(own.sort());
  });

  /**
   * A publish since that leaves the overlay no longer applying: xcube answers
   * `409`, naming the item (research `xcube-slice-5.md`, "Answers"), which
   * the preview says, never the published model's answer.
   */
  it('say which item no longer applies, rather than answer from the published model', async () => {
    const { folderId } = await copied();
    const board = await dashboardIn('writer', folderId, folders.sales);
    const said = `Overlay "x" of model "${MODEL}" doesn't apply to what is published now: fsales/${cubeName('orders')}: Cube ${cubeName('customers')} doesn't exist`;
    refusing = { status: 409, error: said };
    const answer = await load('writer', board, `fsales__${cubeName('orders')}.count`);
    // Taken by this one's request, or never left for the next test's.
    const unused = refusing as { status: number; error: string } | undefined;
    refusing = undefined;
    expect(unused).toBeUndefined();
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual({ error: said, source: 'cube' });
  });

  it('bring a copied data source under its original’s folder and name, its envelopes as stored (AC-280)', async () => {
    const { folderId, workspace } = await copied();
    const answer = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${warehouse}/copy`,
      payload: { timeZone: 'UTC' },
    });
    expect(answer.statusCode, answer.body).toBeLessThan(300);
    const board = await dashboardIn('writer', folderId, folders.sales);

    // Before a preview names it, the overlay holds the workspace as it is.
    expect((await load('writer', board, `fsales__${cubeName('orders')}.count`)).statusCode).toBe(
      200,
    );
    expect(stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.connections).toEqual([
      {
        folderId: 'fsales',
        name: 'warehouse',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealed('sales') },
      },
    ]);
  });
});

describe('a workspace model’s delete (T347)', () => {
  /**
   * Its dialog asks first what depends on it (T526): nothing published can,
   * since nothing is published from a workspace. What in the workspace uses
   * it is xcube's to refuse as the overlay is pushed without it.
   */
  it('is asked about as any model’s delete is, with nothing published depending on it', async () => {
    const { folderId, path } = await copied();
    const asked = await as('writer', {
      method: 'GET',
      url: `/api/model/files/dependents?folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}`,
    });
    expect(asked.statusCode, asked.body).toBe(200);
    expect(asked.json()).toEqual({
      declares: [{ kind: 'cube', name: cubeName('orders') }],
      views: [],
      cubes: [],
      charts: [],
      dashboards: [],
      hidden: 0,
    });
    const none = await as('writer', {
      method: 'GET',
      url: `/api/model/files/dependents?folder=${encodeURIComponent(folderId)}&path=cubes%2Fnone.yml`,
    });
    expect(none.statusCode).toBe(404);
  });
});

describe('an emptied workspace (T347, AC-323)', () => {
  it('drops its overlay once nothing is left to overlay, and its previews name none', async () => {
    const { folderId, workspace } = await copied();
    const id = workspaceOverlayIdOf(workspace);
    expect(stub.overlay(MODEL, id)).toBeDefined();

    // Everything in it: the copies went into project folders of their own (T523).
    const inside = await workspaceFoldersOf(workspace.slice('ws:'.length));
    for (const file of await files().inFolders(inside)) {
      const removed = await as('writer', {
        method: 'DELETE',
        url: `/api/model/files?folder=${encodeURIComponent(file.folderId)}&path=${encodeURIComponent(file.path)}`,
      });
      expect(removed.statusCode, removed.body).toBe(200);
    }
    for (const source of (await Promise.all(inside.map((id) => sources().inFolder(id)))).flat()) {
      const removed = await as('writer', {
        method: 'DELETE',
        url: `/api/data-sources/${source.id}`,
      });
      expect(removed.statusCode, removed.body).toBeLessThan(300);
    }
    const board = (
      await as('writer', {
        method: 'POST',
        url: '/api/documents',
        payload: {
          kind: 'dashboard',
          title: `Emptied ${MARK}`,
          folderId,
          targetFolderId: folders.sales,
        },
      })
    ).json<{ id: string }>().id;
    asked.length = 0;
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/load',
      payload: {
        query: { measures: [`fsales__${cubeName('orders')}.count`] },
        for: { kind: 'dashboard', id: board },
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(asked[0]?.claims).not.toHaveProperty('wechartOverlay');
    expect(stub.overlay(MODEL, id)).toBeUndefined();
  });
});
