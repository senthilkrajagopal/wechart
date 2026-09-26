import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { buildServer } from '../server';

/**
 * T334: models are folder items.
 *
 * - AC-269, AC-131: a folder lists its model files beside its dashboards and
 *   charts, and `GET /api/model/files?folder=` gives what each file defines.
 * - AC-262, its models' half (from T327): `writer` (group `sales-rw`) has
 *   read-write on /A/B only, so /A's and the root's model files are theirs to
 *   list and open, view-only.
 * - AC-266, AC-263: `reader` (group `sales-ro`) has read-only on /A/B, and
 *   sees no model there; neither changes a model outside a folder they may
 *   write in. /C is `managers`' alone.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
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
};

const MARK = `models${randomUUID().slice(0, 8)}`;
const ORDERS = [
  'cubes:',
  `  - name: ${MARK}_orders`,
  '    sql_table: public.orders',
  '    measures:',
  '      - name: count',
  '        type: count',
  '    dimensions:',
  '      - name: status',
  '        sql: status',
  '        type: string',
  '    segments:',
  '      - name: open',
  '        sql: "{CUBE}.status = \'open\'"',
  '    hierarchies:',
  '      - name: by_status',
  '        levels: [status]',
  '    joins:',
  '      - name: customers',
  '        relationship: many_to_one',
  '        sql: "{CUBE}.customer_id = {customers.id}"',
  '    pre_aggregations:',
  '      - name: by_status',
  '        measures: [count]',
  '        dimensions: [status]',
  '',
].join('\n');

const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids = { a: '', b: '', c: '' };
const paths = {
  a: `model/${MARK}/a_orders.yml`,
  b: `model/${MARK}/b_orders.yml`,
  c: `model/${MARK}/c_orders.yml`,
  root: `model/${MARK}/root_orders.yml`,
};
let rootBefore: StoredDocument | null = null;

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.a = await make('folder', { title: `A ${MARK}`, folderId: 'root' });
  ids.b = await make('folder', {
    title: `B ${MARK}`,
    folderId: ids.a,
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.c = await make('folder', {
    title: `C ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['managers'] },
  });
  await files().seed([
    { folderId: ids.a, path: paths.a, content: ORDERS },
    { folderId: ids.b, path: paths.b, content: ORDERS },
    { folderId: ids.c, path: paths.c, content: ORDERS },
    { path: paths.root, content: ORDERS },
  ]);

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
  });
  for (const who of ['writer', 'reader', 'nobody']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  await app.close();
  await getDb().deleteFrom('model_files').where('path', 'in', Object.values(paths)).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const listed = async (who: string, folderId: string) =>
  (await as(who, { method: 'GET', url: `/api/folders/${folderId}/contents` }))
    .json<{ kind: string; id: string }[]>()
    .filter((row) => row.kind === 'model')
    .map((row) => row.id);
const opened = (who: string, folderId: string) =>
  as(who, { method: 'GET', url: `/api/model/files?folder=${encodeURIComponent(folderId)}` });
const openedPaths = async (who: string, folderId: string) =>
  (await opened(who, folderId)).json<{ files: { path: string }[] }>().files.map((f) => f.path);
const publish = (who: string, folderId: string, path: string) =>
  as(who, {
    method: 'POST',
    url: '/api/model/publish',
    payload: { folderId, files: [{ path, content: ORDERS.replace('type: count', 'type: sum') }] },
  });

describe('a folder’s models, listed and opened (T334, AC-269, AC-131)', () => {
  it('lists each model file in its folder, with the cubes and views it declares', async () => {
    const rows = (await as('writer', { method: 'GET', url: `/api/folders/${ids.b}/contents` }))
      .json<{ kind: string; id: string; title: string; declares: unknown }[]>()
      .filter((row) => row.kind === 'model');

    expect(rows.map(({ kind, id, title, declares }) => ({ kind, id, title, declares }))).toEqual([
      { kind: 'model', id: paths.b, title: 'b_orders.yml', declares: { cubes: 1, views: 0 } },
    ]);
  });

  it('gives each file in the folder with every object it defines', async () => {
    const answer = await opened('writer', ids.b);

    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({
      files: [
        {
          folderId: ids.b,
          path: paths.b,
          content: ORDERS,
          objects: [
            {
              kind: 'cube',
              name: `${MARK}_orders`,
              members: [
                { kind: 'measure', name: 'count' },
                { kind: 'dimension', name: 'status' },
                { kind: 'segment', name: 'open' },
                { kind: 'hierarchy', name: 'by_status' },
                { kind: 'join', name: 'customers' },
                { kind: 'pre-aggregation', name: 'by_status' },
              ],
            },
          ],
        },
      ],
    });
  });
});

describe('a read-write member sees the models above their folder, view-only (T334, AC-262)', () => {
  it('lists and opens /A’s and the root’s model files', async () => {
    expect(await listed('writer', ids.a)).toEqual([paths.a]);
    expect(await listed('writer', 'root')).toContain(paths.root);
    expect(await openedPaths('writer', ids.a)).toEqual([paths.a]);
    expect(await openedPaths('writer', 'root')).toContain(paths.root);
  });

  it('answers 403 to a change to any of them, and changes nothing', async () => {
    for (const [folderId, path] of [
      [ids.a, paths.a],
      ['root', paths.root],
    ] as const) {
      const answer = await publish('writer', folderId, path);
      expect(answer.statusCode, path).toBe(403);
    }
    expect((await files().list(ids.a)).map((file) => file.content)).toEqual([ORDERS]);
    expect((await files().list()).find((file) => file.path === paths.root)?.content).toBe(ORDERS);
  });
});

describe('only a folder’s read-write members change its models (T334, AC-266, AC-263)', () => {
  it('shows a read-only member no model, and answers 403 to their change', async () => {
    expect(await listed('reader', ids.b)).toEqual([]);
    expect(await openedPaths('reader', ids.b)).toEqual([]);

    const answer = await publish('reader', ids.b, paths.b);

    expect(answer.statusCode).toBe(403);
    expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
  });

  it('gives none of a folder’s files to someone who may not see it', async () => {
    for (const [who, folderId] of [
      ['writer', ids.c],
      ['nobody', ids.a],
      ['nobody', ids.b],
    ] as const) {
      const answer = await opened(who, folderId);
      expect(answer.statusCode, `${who} ${folderId}`).toBe(404);
      expect(JSON.stringify(answer.json()), `${who} ${folderId}`).not.toContain(MARK);
    }
    expect(await openedPaths('nobody', 'root')).toEqual([]);
  });

  it('answers a change in a folder they can’t see as a folder that isn’t there', async () => {
    const answer = await publish('writer', ids.c, paths.c);

    expect(answer.statusCode).toBe(404);
    expect((await files().list(ids.c)).map((file) => file.content)).toEqual([ORDERS]);
  });

  /**
   * Publishing into a folder, which names its items `<folderId>__<name>` in
   * xcube, is T341's: until then a folder's own members get to the check,
   * and are told, rather than having their file sent as the root's.
   */
  it('refuses, for now, a publish into a folder other than the root, storing nothing', async () => {
    const answer = await publish('writer', ids.b, paths.b);

    expect(answer.statusCode).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      'Models in a folder other than the root can’t be published yet: only the root’s are.',
    );
    expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
  });
});
