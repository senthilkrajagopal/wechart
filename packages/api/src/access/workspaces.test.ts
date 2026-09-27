import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T343 (AC-276, AC-277): every Super-Admin and read-write member has a
 * private workspace, "My workspace" (`mine` to the client; `ws:<their key>`
 * as stored), which no one else can list, open or search — Super-Admins
 * included. A user with read-only access everywhere has none, and creates
 * nothing there.
 *
 * `writer` (group `sales-rw`) is a read-write member of a folder made here;
 * `reader` (`sales-ro`) reads it; `super` is a Super-Admin.
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
const MARK = `ws${randomUUID().slice(0, 8)}`;
/** xcube's answer to a test that passes, as the stub runner gives it (T363). */
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;
let sales = '';

beforeAll(async () => {
  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    // A data source is made only from its passing test (T363).
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () => PASSING as never,
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const mine = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where('title', 'like', `%${MARK}%`)
    .execute();
  for (const { kind, id } of [...mine, ...made].reverse())
    await docs().remove(kind as DocumentKind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** Made as the web makes it: a dashboard or chart names its target folder, the sales folder (T345). */
const create = (who: string, kind: DocumentKind, title: string, folderId: string) =>
  as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: { kind, title, folderId, ...(kind === 'folder' ? {} : { targetFolderId: sales }) },
  });
const contents = async (who: string, folderId: string) =>
  as(who, { method: 'GET', url: `/api/folders/${encodeURIComponent(folderId)}/contents` });
const titlesIn = async (who: string, folderId: string) =>
  ((await (await contents(who, folderId)).json()) as { title: string }[]).map((row) => row.title);
const found = async (who: string, q: string) =>
  (
    (await (await as(who, { method: 'GET', url: `/api/search?q=${q}` })).json()) as {
      title: string;
    }[]
  ).map((row) => row.title);

describe('each author’s private workspace (T343, AC-276)', () => {
  const ids: Record<string, { dashboard: string; folder: string; inner: string; stored: string }> =
    {};

  beforeAll(async () => {
    for (const who of ['writer', 'super']) {
      const dashboard = await create(who, 'dashboard', `${who} draft ${MARK}`, 'mine');
      expect(dashboard.statusCode, await dashboard.body).toBe(201);
      const folder = await create(who, 'folder', `${who} drafts ${MARK}`, 'mine');
      expect(folder.statusCode).toBe(201);
      const folderId = (folder.json() as { id: string }).id;
      const inner = await create(who, 'dashboard', `${who} inner ${MARK}`, folderId);
      expect(inner.statusCode).toBe(201);
      const dashboardId = (dashboard.json() as { id: string }).id;
      const stored = await docs().get('dashboard', dashboardId);
      ids[who] = {
        dashboard: dashboardId,
        folder: folderId,
        inner: (inner.json() as { id: string }).id,
        stored: String(stored?.body['folderId']),
      };
    }
  });

  it('keeps each one’s items in a workspace of their own, never the shared `mine`', () => {
    expect(ids['writer']?.stored).toMatch(/^ws:/);
    expect(ids['super']?.stored).toMatch(/^ws:/);
    expect(ids['writer']?.stored).not.toBe(ids['super']?.stored);
  });

  it('lists, opens and searches its owner’s own', async () => {
    for (const who of ['writer', 'super']) {
      expect(await titlesIn(who, 'mine')).toEqual(
        expect.arrayContaining([`${who} draft ${MARK}`, `${who} drafts ${MARK}`]),
      );
      expect(await titlesIn(who, ids[who]!.folder)).toEqual([`${who} inner ${MARK}`]);
      const opened = await as(who, {
        method: 'GET',
        url: `/api/documents/dashboard/${ids[who]!.inner}`,
      });
      expect(opened.statusCode).toBe(200);
      expect(await found(who, `draft%20${MARK}`)).toEqual([`${who} draft ${MARK}`]);
      const roots = (await as(who, { method: 'GET', url: '/api/folder-roots' })).json() as Record<
        string,
        number
      >;
      expect(roots['mine']).toBeGreaterThanOrEqual(2);
    }
  });

  it('shows no one else anything of it, Super-Admins included', async () => {
    for (const [who, other] of [
      ['writer', 'super'],
      ['super', 'writer'],
    ] as const) {
      const theirs = ids[other]!;
      expect(await titlesIn(who, 'mine')).not.toContain(`${other} draft ${MARK}`);
      expect((await contents(who, theirs.stored)).statusCode).toBe(404);
      expect((await contents(who, theirs.folder)).statusCode).toBe(404);
      for (const id of [theirs.dashboard, theirs.inner])
        expect(
          (await as(who, { method: 'GET', url: `/api/documents/dashboard/${id}` })).statusCode,
        ).toBe(404);
      expect(await found(who, `${other}%20draft%20${MARK}`)).toEqual([]);
      // Nor made in theirs by naming it.
      expect((await create(who, 'dashboard', `into ${MARK}`, theirs.stored)).statusCode).toBe(404);
    }
  });
});

/**
 * From T343's review: the client never sees the stored `ws:` id; a chart in a
 * workspace never reaches a dashboard outside it; nothing moves across a
 * workspace's edge, shared work being changed in a copy and reaching a shared
 * folder through a proposal (AC-278, F30).
 */
describe('a workspace’s edges (T343’s review)', () => {
  let chart = '';
  let board = '';
  let shared = '';

  beforeAll(async () => {
    chart = (
      (await create('writer', 'chart', `writer chart ${MARK}`, 'mine')).json() as { id: string }
    ).id;
    board = (
      (await create('writer', 'dashboard', `writer board ${MARK}`, 'mine')).json() as {
        id: string;
      }
    ).id;
    shared = (
      (await create('writer', 'dashboard', `shared board ${MARK}`, sales)).json() as { id: string }
    ).id;
  });

  it('names My workspace `mine` to its owner, never the stored id', async () => {
    const opened = await as('writer', { method: 'GET', url: `/api/documents/dashboard/${board}` });
    expect(opened.json()).toMatchObject({ body: { folderId: 'mine' } });
    expect(opened.body).not.toContain('ws:');
    const folders = (await as('writer', { method: 'GET', url: '/api/folders' })).json() as {
      title: string;
      parentId: string | null;
    }[];
    expect(folders.find((folder) => folder.title === `writer drafts ${MARK}`)?.parentId).toBe(
      'mine',
    );
    // And no one else's in the tree, a Super-Admin's included.
    const theirs = (await as('super', { method: 'GET', url: '/api/folders' })).json() as {
      title: string;
    }[];
    expect(theirs.map((folder) => folder.title)).not.toContain(`writer drafts ${MARK}`);
  });

  it('takes `mine` for the owner’s own wherever a body names a folder', async () => {
    const stored = (await docs().get('dashboard', board))!;
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${board}`,
      payload: {
        version: stored.version,
        body: { ...stored.body, folderId: 'mine', title: `writer board ${MARK}` },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('dashboard', board))?.body['folderId']).toMatch(/^ws:/);
  });

  it('never puts a chart in a workspace on a dashboard outside it', async () => {
    const attached = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${shared}/charts`,
      payload: { chartId: chart },
    });
    expect(attached.statusCode).toBe(409);
    // Nor does anyone open it by way of one.
    expect(
      (await as('reader', { method: 'GET', url: `/api/documents/chart/${chart}` })).statusCode,
    ).toBe(404);
  });

  it('moves nothing across its edge, either way, by either route', async () => {
    const patch = (id: string, folderId: string) =>
      as('writer', {
        method: 'PATCH',
        url: `/api/documents/dashboard/${id}`,
        payload: { folderId },
      });
    expect((await patch(board, sales)).statusCode).toBe(409);
    expect((await patch(shared, 'mine')).statusCode).toBe(409);
    const stored = (await docs().get('dashboard', shared))!;
    const put = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${shared}`,
      payload: { version: stored.version, body: { ...stored.body, folderId: 'mine' } },
    });
    expect(put.statusCode).toBe(409);
    expect((await docs().get('dashboard', shared))?.body['folderId']).toBe(sales);
  });
});

/**
 * T345 (AC-282): a dashboard, chart or data source made in the workspace
 * names its target folder, one of the shared folders where its author has
 * read-write access; it goes there by a proposal (T349). A new data source
 * never takes a name its target folder holds: only a copy replaces one
 * (AC-280; the user's answer to question 30).
 */
describe('items made in the workspace name their target folder (T345, AC-282)', () => {
  const sealed = {
    v: 1 as const,
    kid: 'kid-1',
    enc: Buffer.alloc(32, 'e').toString('base64url'),
    ct: Buffer.alloc(272, 'c').toString('base64url'),
  };
  const source = (name: string, extra: Record<string, unknown>) => ({
    folderId: 'mine',
    name,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
    sealed: { password: sealed },
    ...extra,
  });
  /** A create's body with its passing test, which a data source is made only from (T363). */
  const tested = async (
    send: (url: string, payload: Record<string, unknown>) => Promise<LightMyRequestResponse>,
    payload: ReturnType<typeof source>,
  ) => {
    const {
      name: _name,
      targetFolderId: _target,
      ...settings
    } = payload as Record<string, unknown>;
    void _name;
    void _target;
    const run = await send('/api/data-sources/test', settings);
    expect(run.statusCode, run.body).toBe(200);
    return { ...payload, testId: (run.json() as { testId: string }).testId };
  };
  /** `managers`' alone; one writer only reads; writer's own drafts; super's. */
  const folders = { hidden: '', readOnly: '', own: '', others: '' };
  const idOf = (answer: { json: () => unknown }) => (answer.json() as { id: string }).id;
  beforeAll(async () => {
    for (const [key, access] of [
      ['hidden', { readOnly: null, readWrite: ['managers'] }],
      ['readOnly', { readOnly: ['sales-rw'], readWrite: ['managers'] }],
    ] as const) {
      const id = randomUUID();
      made.push({ kind: 'folder', id });
      await docs().create({
        kind: 'folder',
        id,
        body: { owner: 'admin', title: `${key} ${MARK}`, folderId: 'root', access },
      });
      folders[key] = id;
    }
    folders.own = idOf(await create('writer', 'folder', `own targets ${MARK}`, 'mine'));
    folders.others = idOf(await create('super', 'folder', `super’s targets ${MARK}`, 'mine'));
  });

  it('offers as targets the shared folders its author writes, with their paths, and none of a workspace', async () => {
    const targets = async (who: string) =>
      (await as(who, { method: 'GET', url: '/api/folders/targets' })).json() as {
        id: string;
        path: string[];
      }[];
    const writers = await targets('writer');
    expect(writers.find((target) => target.id === sales)).toEqual({
      id: sales,
      path: [`Sales ${MARK}`],
    });
    const ids = writers.map((target) => target.id);
    // Not one they only read, nor the root, nor a folder in their workspace,
    // which they write in but which is no shared folder (T345's review).
    for (const refused of [folders.hidden, folders.readOnly, 'root', folders.own, 'mine'])
      expect(ids).not.toContain(refused);
    expect(await targets('reader')).toEqual([]);
    // A Super-Admin writes the root too, which is the shared one.
    expect((await targets('super')).find((target) => target.id === 'root')).toEqual({
      id: 'root',
      path: [],
    });
  });

  it('keeps a dashboard or chart’s target: a folder its author writes, never none', async () => {
    const made = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'dashboard',
        title: `targeted ${MARK}`,
        folderId: 'mine',
        targetFolderId: sales,
      },
    });
    expect(made.statusCode, made.body).toBe(201);
    const id = (made.json() as { id: string }).id;
    expect((await docs().get('dashboard', id))?.body['targetFolderId']).toBe(sales);

    const without = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'chart', title: `untargeted ${MARK}`, folderId: 'mine' },
    });
    expect(without.statusCode).toBe(400);
    // Their workspace, or a folder in it: no shared folder. One they only
    // read: 403. One they can't see, or in another's workspace: not there.
    for (const [targetFolderId, status] of [
      ['mine', 400],
      [folders.own, 400],
      [folders.readOnly, 403],
      [folders.hidden, 404],
      [folders.others, 404],
    ] as const) {
      const refused = await as('writer', {
        method: 'POST',
        url: '/api/documents',
        payload: { kind: 'chart', title: `mistargeted ${MARK}`, folderId: 'mine', targetFolderId },
      });
      expect(refused.statusCode, targetFolderId).toBe(status);
    }
    expect(await titlesIn('writer', 'mine')).not.toContain(`mistargeted ${MARK}`);
    // A folder in the workspace needs none: it goes nowhere.
    expect((await create('writer', 'folder', `untargeted folder ${MARK}`, 'mine')).statusCode).toBe(
      201,
    );
  });

  it('keeps the target as stored through every save, and gives a chart made on a workspace dashboard its dashboard’s (T345’s review)', async () => {
    const board = idOf(await create('writer', 'dashboard', `kept ${MARK}`, 'mine'));
    const read = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;
    const stored = await read('dashboard', board);

    // A document save that drops it, or points it at a folder they can't write.
    for (const targetFolderId of [undefined, folders.hidden]) {
      const { body, version } = await read('dashboard', board);
      const { targetFolderId: _kept, ...rest } = body;
      void _kept;
      const saved = await as('writer', {
        method: 'PUT',
        url: `/api/documents/dashboard/${board}`,
        payload: {
          body: {
            ...rest,
            folderId: 'mine',
            ...(targetFolderId === undefined ? {} : { targetFolderId }),
          },
          version,
        },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect((await read('dashboard', board)).body['targetFolderId']).toBe(sales);
    }

    // A dashboard save that makes a library chart in the workspace (T133).
    const chart = randomUUID();
    const current = await read('dashboard', board);
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/dashboards/${board}`,
      payload: {
        dashboard: {
          body: { ...current.body, folderId: 'mine', targetFolderId: folders.hidden },
          version: current.version,
        },
        charts: [
          {
            id: chart,
            body: {
              schemaVersion: 1,
              title: `library ${MARK}`,
              folderId: 'mine',
              targetFolderId: folders.hidden,
              chart: {
                source: { cube: 'orders' },
                wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
              },
            },
            version: 0,
          },
        ],
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    made.push({ kind: 'chart', id: chart });
    expect((await read('chart', chart)).body['targetFolderId']).toBe(sales);
    expect((await read('dashboard', board)).body['targetFolderId']).toBe(sales);
    expect(stored.body['targetFolderId']).toBe(sales);
  });

  it('makes a data source in the workspace with its target, and never under a name the target holds', async () => {
    const store = dataSourceStore(getDb());
    const held = await store.create({ ...source(`held_${MARK}`, {}), folderId: sales });
    const kept: string[] = [held.id];
    const post = (payload: Record<string, unknown>) =>
      as('writer', { method: 'POST', url: '/api/data-sources', payload });
    try {
      // Never without a passing test, in the workspace too (T363, AC-158).
      const untested = await post(source(`draft_${MARK}`, { targetFolderId: sales }));
      expect(untested.statusCode).toBe(422);
      const made = await post(
        await tested(
          (url, payload) => as('writer', { method: 'POST', url, payload }),
          source(`draft_${MARK}`, { targetFolderId: sales }),
        ),
      );
      expect(made.statusCode, made.body).toBe(201);
      kept.push(idOf(made));
      const stored = await store.get(idOf(made));
      expect(stored).toMatchObject({ targetFolderId: sales });
      expect(stored?.folderId).toMatch(/^ws:/);

      for (const [targetFolderId, status] of [
        [undefined, 400],
        ['mine', 400],
        [folders.own, 400],
        [folders.readOnly, 403],
        [folders.hidden, 404],
        [folders.others, 404],
      ] as const)
        expect(
          (await post(source(`y_${MARK}`, targetFolderId === undefined ? {} : { targetFolderId })))
            .statusCode,
          String(targetFolderId),
        ).toBe(status);
      expect((await store.inFolder(stored!.folderId)).map((each) => each.name)).not.toContain(
        `y_${MARK}`,
      );

      const clash = await post(source(`held_${MARK}`, { targetFolderId: sales }));
      expect(clash.statusCode).toBe(409);
      expect(clash.json()).toEqual({
        error: `Its target folder already holds a data source named “held_${MARK}”: only a copy of it replaces it. Give this one another name.`,
      });
      // Nor renamed to it (T345's review).
      const renamed = await as('writer', {
        method: 'PUT',
        url: `/api/data-sources/${stored!.id}`,
        payload: { name: `held_${MARK}` },
      });
      expect(renamed.statusCode).toBe(409);
      expect((await store.get(stored!.id))?.name).toBe(`draft_${MARK}`);
    } finally {
      for (const id of kept) await store.remove(id).catch(() => undefined);
    }
  });

  it('changes and removes a workspace’s data source in wechart alone, never landing it in xcube (T345’s review)', async () => {
    const calls: string[] = [];
    const landing = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      dataSources: dataSourceStore(getDb()),
      connectionTests: connectionTestStore(getDb()),
      connectionTest: async () => PASSING as never,
      dataSourceLanding: {
        prepare: async (folderId) => {
          calls.push(`prepare ${folderId}`);
          return { land: async () => undefined, unland: async () => undefined };
        },
        unland: async (source) => {
          calls.push(`unland ${source.name}`);
        },
      },
    });
    try {
      const cookie = await signIn(landing, USERS['writer']!);
      const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
        landing.inject({
          method,
          url,
          headers: { cookie },
          ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
        });
      const made = await send(
        'POST',
        '/api/data-sources',
        await tested(
          (url, payload) => send('POST', url, payload),
          source(`landless_${MARK}`, { targetFolderId: sales }),
        ),
      );
      expect(made.statusCode, made.body).toBe(201);
      const id = idOf(made);
      const changed = await send('PUT', `/api/data-sources/${id}`, { name: `landless2_${MARK}` });
      expect(changed.statusCode, changed.body).toBe(200);
      expect((await send('DELETE', `/api/data-sources/${id}`)).statusCode).toBe(204);
      expect(calls).toEqual([]);
    } finally {
      await landing.close();
    }
  });
});

describe('no workspace for a read-only user (T343, AC-277)', () => {
  it('makes no data source in My workspace either: 403', async () => {
    const refused = await as('reader', {
      method: 'POST',
      url: '/api/data-sources',
      payload: { folderId: 'mine', name: 'warehouse', driver: 'postgres', authMethod: 'password' },
    });
    expect(refused.statusCode).toBe(403);
  });

  it('lists nothing in My workspace, and creates nothing there', async () => {
    expect((await contents('reader', 'mine')).statusCode).toBe(404);
    const refused = await create('reader', 'dashboard', `reader draft ${MARK}`, 'mine');
    expect(refused.statusCode).toBe(403);
    const roots = (
      await as('reader', { method: 'GET', url: '/api/folder-roots' })
    ).json() as Record<string, number>;
    expect(roots).not.toHaveProperty('mine');
  });
});
