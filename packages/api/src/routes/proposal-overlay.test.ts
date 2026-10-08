import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { proposalOverlayIdOf } from '../xcube/overlays';
import { removeProjectFolders } from './project-folder.fixture';

/**
 * T440 (AC-323): a proposal's overlay is `p-<proposal id>`, holding what it
 * would land in the folders it lands in. Its review's queries name it in the
 * tokens of its author, the target folder's read-write members and
 * Super-Admins, and no one else's: a read-only member's and anyone else's
 * are refused before Cube is asked. Once decided it is dropped, and named
 * no more. A proposal holding nothing xcube holds has none.
 *
 * Against the suite's database, the stub xcube and a stub Cube recording each
 * token. `writer` (`sales-rw`) writes /Sales, where `reader` (`sales-ro`)
 * only reads; `many` (`g01`) reaches nothing here.
 */
const MARK = `po${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `pov-${MARK}`;
const CUBE = `${MARK}_orders`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});

const asked: { path: string; claims: Record<string, unknown> }[] = [];
let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let app: FastifyInstance;
let sales = '';
let warehouse = '';
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];

beforeAll(async () => {
  cubeServer = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}',
    ) as Record<string, unknown>;
    asked.push({ path: request.url ?? '', claims });
    const overlay = claims['wechartOverlay'];
    response.writeHead(200, {
      'content-type': 'application/json',
      ...(typeof overlay === 'string'
        ? { 'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}` }
        : {}),
    });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'managers'] },
    },
  });
  await modelFileStore(getDb()).write([
    {
      folderId: sales,
      path: `cubes/${CUBE}.yml`,
      content: `cubes:\n  - name: ${CUBE}\n    sql_table: public.${CUBE}\n`,
    },
  ]);
  warehouse = (
    await sources().create({
      folderId: sales,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('sales') },
    })
  ).id;
  const xids = new Map([
    ['root', 'froot'],
    [sales, 'fsales'],
  ]);
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
  ]);
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
    modelFiles: modelFileStore(getDb()),
    dataSources: sources(),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  });
  for (const who of ['writer', 'reader', 'super', 'many', 'manager'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', sales).execute();
  await getDb().deleteFrom('item_versions').where('folder_id', '=', sales).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', '=', sales).execute();
  await removeProjectFolders();
  await getDb().deleteFrom('data_sources').where('target_folder_id', '=', sales).execute();
  await getDb().deleteFrom('data_sources').where('folder_id', '=', sales).execute();
  await getDb().deleteFrom('model_files').where('folder_id', '=', sales).execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('targetFolderId'), '=', sales))
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const load = (who: string, id: string) =>
  as(who, {
    method: 'POST',
    url: '/api/load',
    payload: {
      // Under its own name, as in every folder (T709, AC-328).
      query: { measures: [`${CUBE}.count`] },
      for: { kind: 'proposal', id },
    },
  });

/**
 * The writer's copy of a data source of /Sales's, proposed back: the
 * proposal's id. `warehouse`, or one of its own for a test standing alone.
 */
async function proposedSource(name = 'warehouse'): Promise<string> {
  const original =
    name === 'warehouse'
      ? warehouse
      : (
          await sources().create({
            folderId: sales,
            name,
            driver: 'postgres',
            authMethod: 'password',
            fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
            sealed: { password: sealed(name) },
          })
        ).id;
  const copied = await as('writer', {
    method: 'POST',
    url: `/api/data-sources/${original}/copy`,
    payload: { timeZone: 'UTC' },
  });
  expect(copied.statusCode, copied.body).toBeLessThan(300);
  const proposed = await as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'data-source', id: copied.json<{ id: string }>().id },
  });
  expect(proposed.statusCode, proposed.body).toBe(201);
  return proposed.json<{ id: string }>().id;
}

describe('a proposal’s overlay (T440, AC-323)', () => {
  it('is named in its author’s, its folder’s read-write members’ and Super-Admins’ tokens, and no one else’s', async () => {
    const id = await proposedSource();

    // Its author, another read-write member of its folder, and a Super-Admin.
    asked.length = 0;
    for (const who of ['writer', 'manager', 'super']) {
      const answer = await load(who, id);
      expect(answer.statusCode, answer.body).toBe(200);
    }
    expect(asked.map(({ claims }) => claims['wechartOverlay'])).toEqual([
      proposalOverlayIdOf(id),
      proposalOverlayIdOf(id),
      proposalOverlayIdOf(id),
    ]);
    // It holds what the proposal would land, where it lands (AC-280's copy).
    expect(stub.overlay(MODEL, proposalOverlayIdOf(id))?.connections).toEqual([
      {
        folderId: 'fsales',
        name: 'warehouse',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealed('sales') },
      },
    ]);

    // A read-only member, and anyone else: refused before Cube is asked.
    asked.length = 0;
    for (const who of ['reader', 'many']) expect((await load(who, id)).statusCode).toBe(404);
    expect(asked).toHaveLength(0);
  });

  it('is dropped once decided, and named no more', async () => {
    const id = await proposedSource('decided');
    expect((await load('writer', id)).statusCode).toBe(200);
    expect(stub.overlay(MODEL, proposalOverlayIdOf(id))).toBeDefined();

    // Withdrawn by its author (state K): a rejection.
    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${id}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    expect(stub.overlay(MODEL, proposalOverlayIdOf(id))).toBeUndefined();

    asked.length = 0;
    const after = await load('super', id);
    expect(after.statusCode, after.body).toBe(200);
    expect(asked[0]?.claims).not.toHaveProperty('wechartOverlay');
  });

  it('is dropped once approved, landed', async () => {
    const id = await proposedSource('approved');
    expect((await load('super', id)).statusCode).toBe(200);
    expect(stub.overlay(MODEL, proposalOverlayIdOf(id))).toBeDefined();

    const approved = await as('super', {
      method: 'POST',
      url: `/api/proposals/${id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    await vi.waitFor(() => {
      expect(stub.overlay(MODEL, proposalOverlayIdOf(id))).toBeUndefined();
    });
    asked.length = 0;
    expect((await load('super', id)).statusCode).toBe(200);
    expect(asked[0]?.claims).not.toHaveProperty('wechartOverlay');
  });

  /**
   * One xcube won't take — a publish since left it no longer applying —
   * says which item, and is never named: Cube would answer only that it is
   * gone (T440's review).
   */
  it('says which item doesn’t apply when xcube won’t take it, and asks Cube nothing', async () => {
    const id = await proposedSource('broken');
    // The proposal's own push: the writer's workspace pushes its own meanwhile,
    // after the copy (T543: a race this test lost one run in three).
    stub.refuseOverlayNext(
      422,
      {
        code: 'invalid_items',
        error: 'The overlay does not apply',
        errors: [{ folderId: 'fsales', name: 'broken', kind: 'reference', message: 'Broken here' }],
        cubeMessage: null,
      },
      proposalOverlayIdOf(id),
    );
    asked.length = 0;
    const answer = await load('writer', id);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      'This proposal can’t be previewed as it is: fsales/broken: Broken here',
    );
    expect(asked).toHaveLength(0);
  });

  it('is none for a proposal holding nothing xcube holds', async () => {
    const board = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'dashboard',
        title: `Board ${MARK}`,
        folderId: 'mine',
        targetFolderId: sales,
      },
    });
    expect(board.statusCode, board.body).toBe(201);
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: board.json<{ id: string }>().id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const id = proposed.json<{ id: string }>().id;

    asked.length = 0;
    expect((await load('writer', id)).statusCode).toBe(200);
    expect(asked[0]?.claims).not.toHaveProperty('wechartOverlay');
    expect(stub.overlay(MODEL, proposalOverlayIdOf(id))).toBeUndefined();
    // Withdrawn, so its dashboard is the workspace's to change again.
    await as('writer', { method: 'POST', url: `/api/proposals/${id}/reject`, payload: {} });
    await docs().remove('dashboard', board.json<{ id: string }>().id);
  });
});
