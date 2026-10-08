import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { folderXcubeIds } from '../repos/folder-xcube-ids';
import { modelFileStore } from '../repos/model-files';
import { buildServer, type ModelFile } from '../server';
import { auditStore } from '../repos/audit';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';

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
/**
 * /A's, /C's and the root's, each of a name of its own: a name is one item's
 * across the model (R71, T709). /A/B's is `ORDERS`.
 */
const ORDERS_A = ORDERS.replace(`${MARK}_orders`, `${MARK}_a_orders`);
const ORDERS_C = ORDERS.replace(`${MARK}_orders`, `${MARK}_c_orders`);
const ORDERS_ROOT = ORDERS.replace(`${MARK}_orders`, `${MARK}_root_orders`);

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
  // /A/B's second, which only T520's test uses.
  stock: `model/${MARK}/b_stock.yml`,
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
    { folderId: ids.a, path: paths.a, content: ORDERS_A },
    { folderId: ids.b, path: paths.b, content: ORDERS },
    { folderId: ids.c, path: paths.c, content: ORDERS_C },
    { path: paths.root, content: ORDERS_ROOT },
  ]);

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    // Where each folder's models are published (T452).
    folders: () => folderXcubeIds(getDb()).published(),
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
    expect((await files().list(ids.a)).map((file) => file.content)).toEqual([ORDERS_A]);
    expect((await files().list()).find((file) => file.path === paths.root)?.content).toBe(
      ORDERS_ROOT,
    );
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

  /**
   * T342, AC-141: a save's edited members are looked for across every
   * folder's files the user may see — a view or extending cube in another
   * folder exposes a member by that folder's name — each with its folder.
   * Never a file of a folder they can't see, or see only dashboards of.
   */
  it('gives every folder’s files they may see at once, each with its folder, and none of the rest', async () => {
    const every = async (who: string) =>
      (await as(who, { method: 'GET', url: '/api/model/files?all=true' }))
        .json<{ files: { folderId: string; path: string }[] }>()
        .files.filter((file) => file.path.includes(MARK))
        .map(({ folderId, path }) => ({ folderId, path }));

    expect(await every('writer')).toEqual(
      expect.arrayContaining([
        { folderId: 'root', path: paths.root },
        { folderId: ids.a, path: paths.a },
        { folderId: ids.b, path: paths.b },
      ]),
    );
    expect((await every('writer')).map((file) => file.path)).not.toContain(paths.c);
    expect(await every('reader')).toEqual([]);
    expect(await every('nobody')).toEqual([]);
  });

  it('answers a change in a folder they can’t see as a folder that isn’t there', async () => {
    const answer = await publish('writer', ids.c, paths.c);

    expect(answer.statusCode).toBe(404);
    expect((await files().list(ids.c)).map((file) => file.content)).toEqual([ORDERS_C]);
  });

  /**
   * A folder's own read-write members publish into it (T452): past every
   * folder check, to xcube's, which isn't configured here.
   */
  it('lets a folder’s read-write member publish into it, as far as xcube’s check', async () => {
    const answer = await publish('writer', ids.b, paths.b);

    expect(answer.statusCode).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      'xcube isn’t configured here (WECHART_XCUBE_MODEL and WECHART_SERVICE_KEY), so a change could not be checked or served.',
    );
    expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
  });
});

/**
 * T428's review: the model delete, with security on (AC-266, AC-275) — only
 * a folder's read-write members delete its models, and a refusal names only
 * what they may see, counting the rest (AC-322).
 */
describe('deleting a model (T428)', () => {
  const del = (who: string, folderId: string, path: string) =>
    as(who, {
      method: 'DELETE',
      url: `/api/model/files?folder=${folderId}&path=${encodeURIComponent(path)}`,
    });

  it('answers 403 to one who may not change the folder, and 404 where they can’t see it', async () => {
    expect((await del('reader', ids.b, paths.b)).statusCode).toBe(403);
    expect((await del('writer', ids.a, paths.a)).statusCode).toBe(403);
    expect((await del('nobody', ids.a, paths.a)).statusCode).toBe(404);
    expect((await del('writer', ids.c, paths.c)).statusCode).toBe(404);
    expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
    expect((await files().list(ids.a)).map((file) => file.content)).toEqual([ORDERS_A]);
  });

  it('counts, and never names, what uses it in folders they can’t see', async () => {
    // Under its own name, as in every folder (T709, AC-328).
    const cube = `${MARK}_orders`;
    // A chart in /C, which `writer` can't see, on /A/B's cube.
    await make('chart', {
      title: `Hidden ${MARK}`,
      folderId: ids.c,
      chart: {
        source: { cube },
        wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
      },
    });

    const answer = await del('writer', ids.b, paths.b);

    expect(answer.statusCode).toBe(409);
    expect(answer.json()).toEqual({
      error: `“${MARK}_orders” is still used by 1 item in folders you can’t see.`,
      views: [],
      cubes: [],
      charts: [],
      dashboards: [],
      hidden: 1,
    });
    expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
  });

  it('names a view in a folder they see, and counts a cube in one they can’t, from xcube’s bindings (T520, AC-365)', async () => {
    const xids = await folderXcubeIds(getDb()).of([ids.b, ids.c]);
    const [xcubeB, xcubeC] = [xids.get(ids.b)!, xids.get(ids.c)!];
    // A cube of its own, which no chart names: only the model's items use it.
    const STOCK = ORDERS.replace(`${MARK}_orders`, `${MARK}_stock`);
    await files().seed([{ folderId: ids.b, path: paths.stock, content: STOCK }]);
    const cube = `${MARK}_stock`;
    // Only the refusal is asked of xcube here: what is bound to the cube.
    const withXcube = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      modelFiles: files(),
      folders: () => folderXcubeIds(getDb()).published(),
      xcube: {
        items: async () => [
          {
            folderId: xcubeB,
            name: `${MARK}_view`,
            kind: 'view',
            fullName: `${MARK}_view`,
            bindings: { [`${MARK}_stock`]: cube },
          },
          {
            folderId: xcubeC,
            name: `${MARK}_lines`,
            kind: 'cube',
            fullName: `${MARK}_lines`,
            bindings: { [`${MARK}_stock`]: cube },
          },
        ],
      } as never,
    });
    try {
      const cookie = await signIn(withXcube, USERS['writer']!);
      const answer = await withXcube.inject({
        method: 'DELETE',
        url: `/api/model/files?folder=${ids.b}&path=${encodeURIComponent(paths.stock)}`,
        headers: { cookie },
      });
      expect(answer.statusCode, answer.body).toBe(409);
      // /C's cube: counted, never named.
      expect(answer.json()).toEqual({
        error: `“${MARK}_stock” is still used by the view “${MARK}_view” and 1 item in folders you can’t see.`,
        views: [{ name: `${MARK}_view`, folderId: ids.b }],
        cubes: [],
        charts: [],
        dashboards: [],
        hidden: 1,
      });
      expect((await files().list(ids.b)).map((file) => file.content).sort()).toEqual(
        [ORDERS, STOCK].sort(),
      );
    } finally {
      await withXcube.close();
      // Its own cube out of /A/B again: T427's tests find /A/B's files as they were.
      await files().remove(ids.b, paths.stock);
    }
  });
});

/**
 * T427 (AC-322): WHEN the publish check refuses a change, THE SYSTEM SHALL
 * name each break in the folders the user may see, with its error and its
 * item, and give only a count of the rest; a Super-Admin sees every break
 * named, and the audit trail records every one. `writer` (read-write on
 * /A/B) publishes there; xcube's check breaks /A/B's item and /C's, which
 * `writer` can't see (`managers`' alone).
 */
describe('a refused publish, said as its user may see it (T427, AC-322)', () => {
  /** A server whose xcube holds the folder tree and the model's items, as after a publish. */
  async function refusingServer() {
    const stub = fakeXcube();
    const published = await folderXcubeIds(getDb()).published();
    await xcubeAdmin({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }).folders(await folderXcubeIds(getDb()).tree());
    stub.holdItems('dev', itemsOf(await files().all(), published.ids));
    const audit = auditStore(getDb());
    const server = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      modelFiles: files(),
      folders: () => folderXcubeIds(getDb()).published(),
      xcube: xcubeAdmin({
        cubeApiUrl: secured.cubeApiUrl,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: stub.fetch,
      }),
      audit,
    });
    const signedIn = new Map<string, string>();
    const as_ = async (who: string, options: InjectOptions) => {
      if (!signedIn.has(who)) signedIn.set(who, await signIn(server, USERS[who]!));
      return server.inject({ ...options, headers: { cookie: signedIn.get(who)! } });
    };
    return {
      stub,
      audit,
      as: as_,
      xcubeOf: (id: string) => published.ids.get(id)!,
      publishAs: (who: string) =>
        as_(who, {
          method: 'POST',
          url: '/api/model/publish',
          payload: {
            folderId: ids.b,
            files: [{ path: paths.b, content: ORDERS.replace('type: count', 'type: sum') }],
          },
        }),
      /** The records of refusals in /A/B and /C, newest first; removed as the test ends. */
      records: async () =>
        (await audit.list({ events: ['publish-refused'], folderIds: [ids.b, ids.c] })).records,
      close: async () => {
        await server.close();
        await getDb()
          .deleteFrom('audit_records')
          .where('event', '=', 'publish-refused')
          .where('folder_id', 'in', [ids.b, ids.c])
          .execute();
      },
    };
  }

  it('names the breaks in folders its user may see, counts the rest, and records them all', async () => {
    const { stub, xcubeOf, publishAs, records: recorded, close } = await refusingServer();
    const broke = () =>
      stub.refuse([
        {
          folderId: xcubeOf(ids.b),
          name: `${MARK}_orders`,
          kind: 'yaml',
          line: 4,
          column: 7,
          message: 'B broke',
        },
        { folderId: xcubeOf(ids.c), name: `${MARK}_c_orders`, kind: 'compile', message: 'C broke' },
      ]);
    try {
      broke();
      const asWriter = await publishAs('writer');
      expect(asWriter.statusCode, asWriter.body).toBe(422);
      expect(asWriter.json()).toEqual({
        errors: [{ path: paths.b, folderId: ids.b, line: 4, column: 7, message: 'B broke' }],
        hidden: 1,
        error: '1 item in folders you can’t see would break.',
      });
      expect(asWriter.body).not.toContain('C broke');
      expect(asWriter.body).not.toContain(ids.c);

      broke();
      const asSuper = await publishAs('super');
      expect(asSuper.statusCode).toBe(422);
      expect(asSuper.json()).toEqual({
        errors: [
          { path: paths.b, folderId: ids.b, line: 4, column: 7, message: 'B broke' },
          { path: paths.c, folderId: ids.c, message: 'C broke' },
        ],
      });
      // Nothing hidden: no count, the body as before T427.
      expect(Object.keys(asSuper.json<object>())).toEqual(['errors']);

      const records = await recorded();
      expect(records).toHaveLength(2);
      const every = [
        { path: paths.b, folderId: ids.b, line: 4, column: 7, message: 'B broke' },
        { path: paths.c, folderId: ids.c, message: 'C broke' },
      ];
      const writers = records.find((record) => record.actor?.name.includes('Writer'));
      expect(writers?.summary).toBe('2 breaks: 1 named to its user, 1 counted');
      expect(writers?.folderId).toBe(ids.b);
      expect(writers?.item).toEqual({ kind: 'model', id: paths.b, title: paths.b });
      expect(writers?.details).toEqual({
        breaks: every,
        shown: { named: 1, counted: 1 },
        files: [paths.b],
      });
      const supers = records.find((record) => record !== writers);
      expect(supers?.summary).toBe('2 breaks: 2 named to its user, 0 counted');
      expect(supers?.details).toEqual({
        breaks: every,
        shown: { named: 2, counted: 0 },
        files: [paths.b],
      });
      // Nothing published.
      expect((await files().list(ids.b)).map((file) => file.content)).toEqual([ORDERS]);
    } finally {
      await close();
    }
  });

  /**
   * T427's review: wechart's own check of every folder's rollups (T207, R29)
   * refuses a publish for a rollup broken in a folder its user can't see:
   * only counted, every break recorded.
   */
  it('counts a rollup broken in a folder its user can’t see, and records it', async () => {
    const broken = {
      folderId: ids.c,
      path: `model/${MARK}/c_broken.yml`,
      content: [
        'cubes:',
        `  - name: ${MARK}_broken`,
        '    sql_table: public.broken',
        '    measures:',
        '      - name: count',
        '        type: count',
        '    pre_aggregations:',
        '      - name: hidden_rollup',
        '        measures: [count, no_such_measure]',
        '',
      ].join('\n'),
    };
    await files().seed([broken]);
    const { publishAs, records, close } = await refusingServer();
    try {
      const asWriter = await publishAs('writer');
      expect(asWriter.statusCode, asWriter.body).toBe(422);
      expect(asWriter.json()).toEqual({
        errors: [],
        hidden: 1,
        error: '1 item in folders you can’t see would break.',
      });
      expect(asWriter.body).not.toContain('hidden_rollup');
      const [record] = await records();
      expect(record?.details).toMatchObject({
        breaks: [
          expect.objectContaining({
            path: broken.path,
            folderId: ids.c,
            message: expect.stringContaining('hidden_rollup'),
          }),
        ],
        shown: { named: 0, counted: 1 },
      });
    } finally {
      await close();
      await getDb().deleteFrom('model_files').where('path', '=', broken.path).execute();
    }
  });

  /** T427's review: a delete the check refuses is said and recorded as a publish's is, as a delete. */
  it('says and records a refused delete as it does a publish, saying it was a delete', async () => {
    const extra = {
      folderId: ids.b,
      path: `model/${MARK}/b_extra.yml`,
      content: `cubes:\n  - name: ${MARK}_extra\n    sql_table: public.extra\n`,
    };
    await files().seed([extra]);
    const { stub, xcubeOf, as: asUser, records, close } = await refusingServer();
    stub.refuse([
      { folderId: xcubeOf(ids.c), name: `${MARK}_c_orders`, kind: 'compile', message: 'C broke' },
    ]);
    try {
      const answer = await asUser('writer', {
        method: 'DELETE',
        url: `/api/model/files?folder=${ids.b}&path=${encodeURIComponent(extra.path)}`,
      });
      expect(answer.statusCode, answer.body).toBe(422);
      expect(answer.json()).toEqual({
        errors: [],
        hidden: 1,
        error: '1 item in folders you can’t see would break.',
      });
      const [record] = await records();
      expect(record).toMatchObject({
        folderId: ids.b,
        item: { kind: 'model', id: extra.path },
        summary: `Deleting ${extra.path}: 1 break: 0 named to its user, 1 counted`,
        details: {
          change: 'delete',
          breaks: [{ path: paths.c, folderId: ids.c, message: 'C broke' }],
          shown: { named: 0, counted: 1 },
          files: [extra.path],
        },
      });
      // Nothing deleted.
      expect((await files().list(ids.b)).map((file) => file.path)).toContain(extra.path);
    } finally {
      await close();
      await getDb().deleteFrom('model_files').where('path', '=', extra.path).execute();
    }
  });
});

/**
 * T436 (AC-321): with security on, the publish check's probes run as a
 * token every probed folder admits, the Super-Admin group's; a probe the
 * folder gate refused would pass without checking anything (research
 * `xcube-slice-4.md`, Gotcha 10).
 */
describe('a publish’s check, with security on (T436, AC-321)', () => {
  it('runs its probes as the Super-Admin group, which every folder admits', async () => {
    const stub = fakeXcube();
    const held: ModelFile[] = [{ path: `${MARK}/probe.yml`, content: ORDERS }];
    const checked = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      modelFiles: {
        list: async (folderId) => (folderId === undefined || folderId === 'root' ? held : []),
        seed: async () => undefined,
        write: async () => undefined,
      },
      folders: () => folderXcubeIds(getDb()).published(),
      xcube: xcubeAdmin({
        cubeApiUrl: secured.cubeApiUrl,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: stub.fetch,
      }),
    });
    try {
      const cookie = await signIn(checked, USERS['super']!);
      await checked.inject({
        method: 'POST',
        url: '/api/model/publish',
        headers: { cookie },
        payload: {
          files: [
            { path: `${MARK}/probe.yml`, content: ORDERS.replace('type: count', 'type: sum') },
          ],
        },
      });

      const dryRuns = stub.calls.filter((call) => call.path.includes('dryRun=true'));
      expect(dryRuns.length).toBeGreaterThan(0);
      for (const call of dryRuns)
        expect((call.body as { securityContext: unknown }).securityContext).toEqual({
          groups: ['wechart-super-admins'],
        });
    } finally {
      await checked.close();
    }
  });
});
