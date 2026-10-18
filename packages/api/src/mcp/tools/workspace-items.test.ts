import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Client } from '@modelcontextprotocol/client';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../../auth/sign-in.fixture';
import { closeDb, getDb } from '../../db/client';
import { accessTokenStore } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { catalog } from '../../repos/catalog';
import { documents, type DocumentKind } from '../../repos/documents';
import { folderAccessStore } from '../../repos/folder-access';
import { mcpPageStore } from '../../repos/mcp-pages';
import { modelFileStore } from '../../repos/model-files';
import { proposalStore } from '../../repos/proposals';
import { signInStore } from '../../repos/sign-ins';
import { versionStore } from '../../repos/versions';
import { buildServer } from '../../server';
import { xcubeAdmin, type XcubeAdmin } from '../../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../../xcube/fake';
import { itemsOf } from '../../xcube/items';
import { mcpClient } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { USER_DATA } from '../result';
import { mintToken } from '../tokenText';
import { NOT_IN_MY_WORKSPACE } from './workspace';

/**
 * T786 (AC-438): dashboards, charts, draft cubes and draft views created,
 * changed and deleted in the token owner's My workspace through MCP, by the
 * web app's own routes and so with their checks (a draft's name held to
 * AC-422 included); and a change or delete aimed at a shared folder's item,
 * or at another user's workspace, refused, changing nothing; nothing ever
 * made outside the owner's workspace.
 *
 * `writer` (`sales-rw`) works in their workspace, its drafts going to
 * /Sales; /Ops, which they can't see, holds a landed cube; `super` has a
 * workspace of their own. Against the suite's database and the stub xcube,
 * as `routes/draft-names.test.ts` sets them up.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `wi${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `wim-${MARK}`;
const SEED = `${MARK}_seed`;
const LANDED = `orders_${MARK}`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const view = (name: string, over: string) =>
  `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${over}\n        includes: "*"\n`;
const shared = (name: string) => `cubes/${name}.yml`;

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', ops: '', sharedBoard: '', mine: '', theirs: '', theirBoard: '' };
let token = '';
let tokenId = '';

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A project folder in `who`'s workspace, made in the web app. */
async function project(who: string): Promise<string> {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Work ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind: 'folder', id });
  return id;
}

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
  ids.sharedBoard = randomUUID();
  made.push({ kind: 'dashboard', id: ids.sharedBoard });
  await docs().create({
    kind: 'dashboard',
    id: ids.sharedBoard,
    body: { owner: 'admin', title: `Shared ${MARK}`, folderId: ids.sales },
  });
  await files().write([
    { folderId: ids.sales, path: shared(SEED), content: cube(SEED) },
    { folderId: ids.ops, path: shared(LANDED), content: cube(LANDED) },
  ]);

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
      mcpHost: HOST,
    },
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
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
  const writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  const { text, digest } = mintToken();
  tokenId = (
    await accessTokenStore(getDb()).create({
      owner: { key: writerKey, name: 'Wren Writer' },
      name: `${MARK} token`,
      scopes: ['read', 'workspace-edit'],
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      digest,
    })
  ).id;
  token = text;

  ids.mine = await project('writer');
  ids.theirs = await project('super');
  const theirBoard = await as('super', {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'dashboard',
      title: `Theirs ${MARK}`,
      folderId: ids.theirs,
      targetFolderId: ids.sales,
    },
  });
  expect(theirBoard.statusCode, theirBoard.body).toBe(201);
  ids.theirBoard = theirBoard.json<{ id: string }>().id;
  made.push({ kind: 'dashboard', id: ids.theirBoard });
}, 60_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  if (tokenId !== '') {
    await db
      .deleteFrom('audit_records')
      .where(sql<boolean>`details::text like ${`%${tokenId}%`}`)
      .execute();
    await db.deleteFrom('personal_access_tokens').where('id', '=', tokenId).execute();
  }
  const folders = [ids.sales, ids.ops, ids.mine, ids.theirs].filter((id) => id !== '');
  await db.deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('item_versions').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await db
    .deleteFrom('documents')
    .where('kind', 'in', ['dashboard', 'chart'])
    .where('folder_id', 'in', folders)
    .execute();
  for (const { kind, id } of made.reverse()) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  await forgetTestCounts();
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await mcpClient(app, HOST, token);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

type Answer = Awaited<ReturnType<Client['callTool']>>;
/** What a tool answered, under its marked field; it must have succeeded. */
function answered(result: Answer, what: string): Record<string, unknown> {
  expect(result.isError ?? false, `${what}: ${JSON.stringify(result.content)}`).toBe(false);
  return (result.structuredContent as Record<string, Record<string, unknown>>)[USER_DATA]!;
}
/** A refusal: an error result, holding no data. */
function refused(result: Answer, what: string): string {
  expect(result.isError, what).toBe(true);
  expect(result.structuredContent, what).toBeUndefined();
  return JSON.stringify(result.content);
}

const fileIn = async (folderId: string, path: string) =>
  (await files().inFolders([folderId])).find((file) => file.path === path);

/** Every document and model file outside every workspace, to see none is made there. */
async function outsideWorkspaces(): Promise<string[]> {
  const { rows } = await sql<{ what: string }>`
    WITH RECURSIVE inside(id) AS (
      SELECT id FROM documents WHERE kind = 'folder' AND folder_id LIKE 'ws:%'
      UNION SELECT d.id FROM documents d JOIN inside i ON d.folder_id = i.id WHERE d.kind = 'folder'
    )
    SELECT kind || ':' || id AS what FROM documents
      WHERE kind IN ('folder', 'dashboard', 'chart')
        AND (folder_id IS NULL OR (folder_id NOT LIKE 'ws:%' AND folder_id NOT IN (SELECT id FROM inside)))
    UNION ALL
    SELECT 'model:' || folder_id || '/' || path FROM model_files
      WHERE folder_id IS NULL OR (folder_id NOT LIKE 'ws:%' AND folder_id NOT IN (SELECT id FROM inside))
    ORDER BY 1
  `.execute(getDb());
  return rows.map((row) => row.what);
}

describe('dashboards and charts in My workspace through MCP (T786, AC-438)', () => {
  it('creates, changes and deletes a dashboard and a chart in the owner’s workspace', async () => {
    const outside = await outsideWorkspaces();
    await withClient(async (client) => {
      for (const kind of ['dashboard', 'chart'] as const) {
        const title = `${MARK} ${kind}`;
        const created = answered(
          await client.callTool({
            name: 'create_item',
            arguments: { kind, title, folderId: ids.mine, targetFolderId: ids.sales },
          }),
          `create ${kind}`,
        )['item'] as { id: string; kind: string; folderId: string };
        expect(created).toMatchObject({ kind, title, folderId: ids.mine });
        const stored = await docs().get(kind, created.id);
        expect(stored?.body['folderId']).toBe(ids.mine);
        expect(stored?.body['targetFolderId']).toBe(ids.sales);

        // Changed as the web app saves it: the whole body, at its version.
        const body = { ...stored!.body, title: `${title} changed` };
        answered(
          await client.callTool({
            name: 'change_item',
            arguments: { kind, id: created.id, body, version: stored!.version },
          }),
          `change ${kind}`,
        );
        expect((await docs().get(kind, created.id))?.body['title']).toBe(`${title} changed`);

        answered(
          await client.callTool({ name: 'delete_item', arguments: { kind, id: created.id } }),
          `delete ${kind}`,
        );
        expect(await docs().get(kind, created.id)).toBeNull();
      }
    });
    expect(await outsideWorkspaces()).toEqual(outside);
  });

  it('refuses a change or delete aimed at a shared folder’s item or another user’s workspace, changing nothing', async () => {
    const before = {
      shared: await docs().get('dashboard', ids.sharedBoard),
      theirs: await docs().get('dashboard', ids.theirBoard),
    };
    await withClient(async (client) => {
      for (const [where, id] of [
        ['shared', ids.sharedBoard],
        ['theirs', ids.theirBoard],
      ] as const) {
        const stored = before[where]!;
        const saidToChange = refused(
          await client.callTool({
            name: 'change_item',
            arguments: {
              kind: 'dashboard',
              id,
              body: { ...stored.body, title: `${MARK} taken over` },
              version: stored.version,
            },
          }),
          `change ${where}`,
        );
        const saidToDelete = refused(
          await client.callTool({ name: 'delete_item', arguments: { kind: 'dashboard', id } }),
          `delete ${where}`,
        );
        // A shared one is refused as outside the workspace, which the route
        // alone would let its writer rename or delete; another's workspace's
        // reads as not there, as the web app reads it (T786's review).
        const expected = where === 'shared' ? NOT_IN_MY_WORKSPACE : 'isn’t yours to see';
        expect(saidToChange, `change ${where}`).toContain(expected);
        expect(saidToDelete, `delete ${where}`).toContain(expected);
      }
      // Moving one of the owner's own out of their workspace, too.
      const mine = answered(
        await client.callTool({
          name: 'create_item',
          arguments: {
            kind: 'dashboard',
            title: `${MARK} stays`,
            folderId: ids.mine,
            targetFolderId: ids.sales,
          },
        }),
        'create',
      )['item'] as { id: string };
      const stored = (await docs().get('dashboard', mine.id))!;
      const moved = refused(
        await client.callTool({
          name: 'change_item',
          arguments: {
            kind: 'dashboard',
            id: mine.id,
            body: { ...stored.body, folderId: ids.sales },
            version: stored.version,
          },
        }),
        'move out',
      );
      expect(moved).toContain(NOT_IN_MY_WORKSPACE);
      expect((await docs().get('dashboard', mine.id))?.body['folderId']).toBe(ids.mine);
    });
    expect(await docs().get('dashboard', ids.sharedBoard)).toEqual(before.shared);
    expect(await docs().get('dashboard', ids.theirBoard)).toEqual(before.theirs);
  });

  it('follows a dashboard’s own chart to its dashboard: one of a shared dashboard, or one put on it, is refused (T786’s review)', async () => {
    const local = randomUUID();
    made.push({ kind: 'chart', id: local });
    await docs().create({
      kind: 'chart',
      id: local,
      body: {
        owner: 'admin',
        title: `${MARK} local`,
        folderId: ids.sales,
        localToDashboardId: ids.sharedBoard,
      },
    });
    const before = await docs().get('chart', local);
    await withClient(async (client) => {
      const said = refused(
        await client.callTool({
          name: 'change_item',
          arguments: {
            kind: 'chart',
            id: local,
            body: { ...before!.body, title: `${MARK} taken over` },
            version: before!.version,
          },
        }),
        'shared dashboard’s own chart',
      );
      expect(said).toContain(NOT_IN_MY_WORKSPACE);

      // One of theirs, at the workspace's root, put on the shared dashboard.
      const theirs = answered(
        await client.callTool({
          name: 'create_item',
          arguments: {
            kind: 'chart',
            title: `${MARK} at the root`,
            folderId: 'mine',
            targetFolderId: ids.sales,
          },
        }),
        'create at the root',
      )['item'] as { id: string };
      const stored = (await docs().get('chart', theirs.id))!;
      const moved = refused(
        await client.callTool({
          name: 'change_item',
          arguments: {
            kind: 'chart',
            id: theirs.id,
            body: { ...stored.body, localToDashboardId: ids.sharedBoard },
            version: stored.version,
          },
        }),
        'onto a shared dashboard',
      );
      expect(moved).toContain(NOT_IN_MY_WORKSPACE);
      expect(await docs().get('chart', theirs.id)).toEqual(stored);
      answered(
        await client.callTool({ name: 'delete_item', arguments: { kind: 'chart', id: theirs.id } }),
        'delete at the root',
      );
    });
    expect(await docs().get('chart', local)).toEqual(before);
  });

  it('never creates outside the owner’s workspace: in a shared folder, or in another’s workspace', async () => {
    const outside = await outsideWorkspaces();
    await withClient(async (client) => {
      for (const folderId of [ids.sales, 'root', ids.theirs]) {
        const said = refused(
          await client.callTool({
            name: 'create_item',
            arguments: {
              kind: 'dashboard',
              title: `${MARK} astray`,
              folderId,
              targetFolderId: ids.sales,
            },
          }),
          folderId,
        );
        expect(said).toContain(NOT_IN_MY_WORKSPACE);
      }
    });
    expect(await outsideWorkspaces()).toEqual(outside);
    const astray = await sql<{ id: string }>`
      SELECT id FROM documents WHERE kind = 'dashboard' AND body ->> 'title' = ${`${MARK} astray`}
    `.execute(getDb());
    expect(astray.rows).toEqual([]);
  });
});

describe('draft cubes and views in My workspace through MCP (T786, AC-438, AC-422)', () => {
  it('creates, changes and deletes a draft cube and a draft view in the owner’s workspace', async () => {
    const outside = await outsideWorkspaces();
    const name = `draft_${MARK}`;
    const viewName = `draft_view_${MARK}`;
    await withClient(async (client) => {
      answered(
        await client.callTool({
          name: 'save_model_file',
          arguments: {
            folderId: ids.mine,
            path: shared(name),
            content: cube(name),
            targetFolderId: ids.sales,
          },
        }),
        'create cube',
      );
      expect((await fileIn(ids.mine, shared(name)))?.content).toBe(cube(name));
      answered(
        await client.callTool({
          name: 'save_model_file',
          arguments: {
            folderId: ids.mine,
            path: `views/${viewName}.yml`,
            content: view(viewName, name),
            targetFolderId: ids.sales,
          },
        }),
        'create view',
      );
      expect((await fileIn(ids.mine, `views/${viewName}.yml`))?.content).toBe(view(viewName, name));

      const changed = cube(name, `    title: Draft ${MARK}\n`);
      answered(
        await client.callTool({
          name: 'save_model_file',
          arguments: { folderId: ids.mine, path: shared(name), content: changed },
        }),
        'change cube',
      );
      expect((await fileIn(ids.mine, shared(name)))?.content).toBe(changed);

      for (const path of [`views/${viewName}.yml`, shared(name)]) {
        answered(
          await client.callTool({
            name: 'delete_model_file',
            arguments: { folderId: ids.mine, path },
          }),
          `delete ${path}`,
        );
        expect(await fileIn(ids.mine, path)).toBeUndefined();
      }
    });
    expect(await outsideWorkspaces()).toEqual(outside);
  });

  it('holds a draft’s name to AC-422, as the web app does: one landed anywhere is refused, nothing saved', async () => {
    await withClient(async (client) => {
      const said = refused(
        await client.callTool({
          name: 'save_model_file',
          arguments: {
            folderId: ids.mine,
            path: shared(`${MARK}_again`),
            content: cube(LANDED.toUpperCase()),
            targetFolderId: ids.sales,
          },
        }),
        'landed name',
      );
      expect(said).toContain(`The name “${LANDED.toUpperCase()}” is already in use.`);
    });
    expect(await fileIn(ids.mine, shared(`${MARK}_again`))).toBeUndefined();
  });

  it('never saves or deletes a shared folder’s model file, or another’s workspace’s', async () => {
    const outside = await outsideWorkspaces();
    await withClient(async (client) => {
      for (const folderId of [ids.sales, ids.theirs]) {
        expect(
          refused(
            await client.callTool({
              name: 'save_model_file',
              arguments: {
                folderId,
                path: shared(SEED),
                content: cube(SEED, '    title: Taken\n'),
              },
            }),
            `save ${folderId}`,
          ),
        ).toContain(NOT_IN_MY_WORKSPACE);
        expect(
          refused(
            await client.callTool({
              name: 'delete_model_file',
              arguments: { folderId, path: shared(SEED) },
            }),
            `delete ${folderId}`,
          ),
        ).toContain(NOT_IN_MY_WORKSPACE);
      }
    });
    expect((await fileIn(ids.sales, shared(SEED)))?.content).toBe(cube(SEED));
    expect(await outsideWorkspaces()).toEqual(outside);
  });
});
