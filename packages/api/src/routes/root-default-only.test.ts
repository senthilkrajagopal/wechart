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
import { dataSourceStore, type DataSource } from '../repos/data-sources';
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
import { workspaceOverlayIdOf } from '../xcube/overlays';
import { DEFAULT_AT_ROOT } from '../xcube/refusal';
import { removeProjectFolders, TEST_TIME_ZONE, workspaceKeyOf } from './project-folder.fixture';

/**
 * T708 (AC-310, AC-426; `[R71]`): only the shared root has a data source
 * named `default`, in any case. One is refused when made new in a workspace
 * or in any folder but the root, when a workspace's draft is renamed to it,
 * and when one is proposed, or approved, to land anywhere but the root. The
 * workspace's copy of the root's `default` is the one exception: it keeps
 * the name, saves, and is in the workspace's overlay under the root's folder
 * (AC-280). A cube naming no data source, in /A/B, is listed under the
 * root's `default`. The binding itself is xcube's, which the stub gives as
 * `default` for any such cube; `root-default.spec.ts` shows it on the image.
 *
 * `writer` (`sales-rw`) writes /A and its /A/B; `super` writes everywhere.
 * Against the suite's database and the stub xcube.
 */
const MARK = `rd${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `rdm-${MARK}`;
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const fields = { host: 'root-db', port: 5432, database: 'root', user: 'cube', ssl: false };
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };
const PLAIN = `plain_${MARK}`;

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { a: '', b: '' };
/** The project folders this file made in its users' workspaces. */
const projects: string[] = [];
/** The root's `default`: the one there, or this file's own, removed after. */
let rootDefault: DataSource;
let ownRootDefault = false;
const xids = new Map<string, string>();

beforeAll(async () => {
  cubeServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  ids.a = randomUUID();
  ids.b = randomUUID();
  for (const [id, title, parent] of [
    [ids.a, `A ${MARK}`, 'root'],
    [ids.b, `B ${MARK}`, ids.a],
  ] as const) {
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title,
        folderId: parent,
        access: { readOnly: [], readWrite: ['sales-rw'] },
      },
    });
  }
  const held = (await sources().inFolder('root')).find((source) => source.name === 'default');
  ownRootDefault = held === undefined;
  rootDefault =
    held ??
    (await sources().create({
      folderId: 'root',
      name: 'default',
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: sealed },
    }));

  xids.set('root', 'froot').set(ids.a, 'fa').set(ids.b, 'fb');
  stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fb', parentId: 'fa' },
  ]);
  // A model with a revision, which an overlay is pushed over.
  stub.holdItems(MODEL, []);
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
      parents: new Map([
        ['root', null],
        [ids.a, 'root'],
        [ids.b, ids.a],
      ]),
    }),
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const proposed = await getDb()
    .selectFrom('proposals')
    .select('id')
    .where('target_folder_id', 'in', [ids.a, ids.b])
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
  await getDb().deleteFrom('proposals').where('target_folder_id', 'in', [ids.a, ids.b]).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', 'in', [ids.a, ids.b]).execute();
  // This file's drafts and copies, in the project folders it made.
  for (const source of await sources().all())
    if (projects.includes(source.folderId)) await sources().remove(source.id);
  await getDb().deleteFrom('data_sources').where('name', 'ilike', `%${MARK}%`).execute();
  if (ownRootDefault) await sources().remove(rootDefault.id);
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', [ids.a, ids.b]).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** A project folder in `who`'s workspace. */
async function project(who: string) {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Defaults ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  projects.push(id);
  return id;
}
const settings = {
  driver: 'postgres',
  authMethod: 'password',
  fields,
  sealed: { password: sealed },
};
/** Made from a passing test, in `folderId`; a workspace's going to /A. */
const madeSource = async (who: string, folderId: string, name: string, workspace = true) => {
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
      ...(workspace ? { targetFolderId: ids.a } : {}),
      name,
      testId: tested.json<{ testId: string }>().testId,
    },
  });
};
const namedDefaultIn = async (folderId: string) =>
  (await sources().inFolder(folderId)).filter((source) => source.name.toLowerCase() === 'default');
const AT_ROOT = { error: DEFAULT_AT_ROOT };

describe('a data source named `default` outside the shared root (T708, AC-310, AC-426)', () => {
  it('is refused when made new in a workspace, in any case, and nothing is made', async () => {
    const folderId = await project('writer');
    for (const name of ['default', 'Default', 'DEFAULT']) {
      const refused = await madeSource('writer', folderId, name);
      expect(refused.statusCode, refused.body).toBe(400);
      expect(refused.json()).toEqual(AT_ROOT);
    }
    expect(await namedDefaultIn(folderId)).toEqual([]);
  });

  it('is refused when made new in a shared folder other than the root, and nothing is made', async () => {
    for (const [folderId, name] of [
      [ids.a, 'Default'],
      [ids.b, 'default'],
    ] as const) {
      const refused = await madeSource('super', folderId, name, false);
      expect(refused.statusCode, refused.body).toBe(400);
      expect(refused.json()).toEqual(AT_ROOT);
      expect(await namedDefaultIn(folderId)).toEqual([]);
    }
  });

  it('is refused when a workspace’s draft is renamed to it, which keeps its name', async () => {
    const draft = await madeSource('writer', await project('writer'), `pond_${MARK}`);
    expect(draft.statusCode, draft.body).toBe(201);
    const id = draft.json<{ id: string }>().id;
    const renamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload: { name: 'DEFAULT' },
    });
    expect(renamed.statusCode, renamed.body).toBe(400);
    expect(renamed.json()).toEqual(AT_ROOT);
    expect((await sources().get(id))?.name).toBe(`pond_${MARK}`);
  });

  /**
   * A draft named `default` in a workspace, going to /A, as one made before
   * the rule was would be: neither proposed nor, proposed already, approved.
   * Made from a passing test under another name, then renamed in the store.
   */
  it('is refused when proposed to another folder, and at approval, landing nothing', async () => {
    const folderId = await project('writer');
    const tested = await madeSource('writer', folderId, `early_${MARK}`);
    expect(tested.statusCode, tested.body).toBe(201);
    const draft = await sources().update(tested.json<{ id: string }>().id, { name: 'Default' });
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'data-source', id: draft.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(400);
    expect(proposed.json()).toEqual({
      error: 'Only the shared root may have a data source named default, so it wasn’t proposed.',
    });
    expect(await proposalStore(getDb()).openFor('data-source', draft.id)).toBeNull();

    const waiting = await proposalStore(getDb()).create({
      author: { key: await workspaceKeyOf(folderId), name: 'Wren Writer' },
      targetFolderId: ids.a,
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
          landsIn: ids.a,
          replaces: null,
        },
      ],
    });
    const approved = await as('super', {
      method: 'POST',
      url: `/api/proposals/${waiting.id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(400);
    expect(approved.json()).toEqual({
      error: 'Only the shared root may have a data source named default, so nothing was approved.',
    });
    expect(await namedDefaultIn(ids.a)).toEqual([]);
    expect((await proposalStore(getDb()).get(waiting.id))?.status).toBe('open');
  });
});

describe('the workspace’s copy of the root’s `default` (T708, AC-280)', () => {
  it('keeps the name, saves, and is in the workspace’s overlay under the root', async () => {
    const copied = await as('super', {
      method: 'POST',
      url: `/api/data-sources/${rootDefault.id}/copy`,
      payload: { timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copy = copied.json<{ id: string; name: string; folderId: string }>();
    projects.push(copy.folderId);
    expect(copy.name).toBe('default');

    const saved = await as('super', {
      method: 'PUT',
      url: `/api/data-sources/${copy.id}`,
      payload: { description: `Mine ${MARK}` },
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const workspace = String((await docs().get('folder', copy.folderId))!.body['folderId']);
    await expect
      .poll(
        () =>
          (stub.overlay(MODEL, workspaceOverlayIdOf(workspace))?.connections ?? []).map(
            ({ folderId, name }) => ({ folderId, name }),
          ),
        { timeout: 3_000 },
      )
      .toEqual([{ folderId: 'froot', name: 'default' }]);
  });
});

describe('a cube naming no data source (T708, AC-310)', () => {
  it('in /A/B is bound to the shared root’s `default`', async () => {
    const path = `cubes/${PLAIN}.yml`;
    await files().write([
      { folderId: ids.b, path, content: `cubes:\n  - name: ${PLAIN}\n    sql: SELECT 1 AS n\n` },
    ]);
    stub.holdItems(
      MODEL,
      itemsOf(
        (await files().all()).filter((file) => file.folderId === ids.b),
        xids,
      ),
    );

    const listed = await as('super', { method: 'GET', url: '/api/data-sources' });
    expect(listed.statusCode, listed.body).toBe(200);
    const bound = listed
      .json<{ id: string; usedBy: { name: string; folderId: string }[] | null }[]>()
      .find((source) => source.id === rootDefault.id);
    expect(bound?.usedBy?.map(({ name, folderId }) => ({ name, folderId }))).toEqual([
      { name: PLAIN, folderId: ids.b },
    ]);
  });
});
