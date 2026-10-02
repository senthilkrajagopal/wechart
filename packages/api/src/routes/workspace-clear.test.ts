import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { buildServer } from '../server';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T522 (AC-367; design 14, state F): Clear My workspace. Asked first, the
 * server says what it would remove, every item and folder at any depth by
 * kind, and each open proposal it would withdraw; cleared, the workspace
 * holds nothing, those proposals are withdrawn, and nothing outside it
 * changes: another's workspace, a shared folder's items, their versions.
 *
 * `writer` (`sales-rw`) writes /Sales; `manager` (`managers`) writes /Ops and
 * has a workspace of their own; `reader` (`sales-ro`) has none.
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

const MARK = `clr${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const proposals = () => proposalStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '', ops: '', gone: '', board: '', library: '', local: '', source: '' };
let app: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.ops = await doc('folder', {
    title: `Ops ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['managers'] },
  });
  ids.library = await doc('chart', {
    schemaVersion: 1,
    title: `Margin ${MARK}`,
    folderId: ids.sales,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  ids.board = randomUUID();
  ids.local = await doc('chart', {
    schemaVersion: 1,
    title: `Own ${MARK}`,
    localToDashboardId: ids.board,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.total'] } },
  });
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title: `Revenue ${MARK}`,
      folderId: ids.sales,
      pages: [
        {
          id: 'p1',
          items: [
            { id: 't1', kind: 'chart', chartId: ids.library },
            { id: 't2', kind: 'chart', chartId: ids.local },
          ],
        },
      ],
      charts: [ids.local],
    },
    ids.board,
  );
  ids.source = (
    await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: {
        password: {
          v: 1,
          kid: 'kid-1',
          enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
          ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
        },
      },
    })
  ).id;
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
    dataSources: sources(),
    audit: auditStore(getDb()),
    proposals: proposals(),
  });
  for (const who of ['writer', 'reader', 'manager']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  const folders = [ids.sales, ids.ops, ids.gone].filter((id) => id !== '');
  await db.deleteFrom('proposals').where('target_folder_id', 'in', folders).execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('audit_records').where('item_title', 'like', `%${MARK}%`).execute();
  // What a test left in a workspace, should one stop short of clearing it.
  const left = await db
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where('title', 'like', `%${MARK}%`)
    .execute();
  for (const { kind, id } of left) await docs().remove(kind as DocumentKind, id);
  await db.deleteFrom('data_sources').where('name', 'like', `%${MARK}%`).execute();
  await removeProjectFolders();
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const contentsOf = async (who: string, folderId: string) =>
  (await as(who, { method: 'GET', url: `/api/folders/${folderId}/contents` })).json<
    { kind: string; id: string; title: string }[]
  >();

describe('clearing My workspace (T522, AC-367)', () => {
  /** What writer's workspace holds before it is cleared. */
  const held = {
    copy: '',
    drafts: '',
    draft: '',
    mine: '',
    sourceCopy: '',
    proposal: '',
    lost: '',
    lostProposal: '',
  };
  let managers = '';

  beforeAll(async () => {
    // Anything an earlier run left in writer's workspace goes first, so the
    // counts are this file's own (T522's review).
    expect((await as('writer', { method: 'POST', url: '/api/workspace/clear' })).statusCode).toBe(
      200,
    );
    // A copy of /Sales's dashboard, with its library chart's, in its project folder.
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: ids.board, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const { id: copy, folderId: project } = copied.json<{ id: string; folderId: string }>();
    held.copy = copy;
    // Its data source, copied beside it.
    const source = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${ids.source}/copy`,
      payload: { into: project },
    });
    expect(source.statusCode, source.body).toBe(201);
    held.sourceCopy = source.json<{ id: string }>().id;
    // A chart made new, and a folder of their own holding a dashboard.
    const post = async (payload: Record<string, unknown>) => {
      const answer = await as('writer', { method: 'POST', url: '/api/documents', payload });
      expect(answer.statusCode, answer.body).toBe(201);
      return answer.json<{ id: string }>().id;
    };
    held.mine = await post({
      kind: 'chart',
      title: `New chart ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.sales,
    });
    held.drafts = await post({ kind: 'folder', title: `Drafts ${MARK}`, folderId: 'mine' });
    held.draft = await post({
      kind: 'dashboard',
      title: `Draft board ${MARK}`,
      folderId: held.drafts,
      targetFolderId: ids.sales,
    });
    // The copy waits for review.
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: copy },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    held.proposal = proposed.json<{ id: string }>().id;
    // A new dashboard proposed to a folder deleted since (T521 lets an empty one go).
    const gone = await doc('folder', {
      title: `Gone ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    ids.gone = gone;
    held.lost = await post({
      kind: 'dashboard',
      title: `Lost board ${MARK}`,
      folderId: 'mine',
      targetFolderId: gone,
    });
    const lost = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: held.lost },
    });
    expect(lost.statusCode, lost.body).toBe(201);
    held.lostProposal = lost.json<{ id: string }>().id;
    await docs().remove('folder', gone);
    // Another's workspace: manager's own chart.
    const theirs = await as('manager', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Manager's chart ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.ops,
      },
    });
    expect(theirs.statusCode, theirs.body).toBe(201);
    managers = theirs.json<{ id: string }>().id;
  });

  it('says first what it would remove, by kind, and each open proposal it would withdraw, changing nothing', async () => {
    const proposedAt = async (id: string) => (await proposals().get(id))!.proposedAt.toISOString();
    const asked = await as('writer', { method: 'GET', url: '/api/workspace/clear' });
    expect(asked.statusCode, asked.body).toBe(200);
    expect(asked.json()).toEqual({
      // The copy and its library chart's copy, the new chart, the draft and
      // the lost dashboards and the data source's copy; the project folder
      // and Drafts.
      items: 6,
      folders: 2,
      dashboards: 3,
      charts: 2,
      models: 0,
      dataSources: 1,
      proposals: [
        {
          id: held.proposal,
          kind: 'dashboard',
          title: `Revenue ${MARK}`,
          targetFolderId: ids.sales,
          targetPath: `Sales ${MARK}`,
          proposedAt: await proposedAt(held.proposal),
        },
        // Named as deleted, never taken for Shared (T522's review).
        {
          id: held.lostProposal,
          kind: 'dashboard',
          title: `Lost board ${MARK}`,
          targetFolderId: ids.gone,
          targetPath: 'A deleted folder',
          proposedAt: await proposedAt(held.lostProposal),
        },
      ],
    });
    expect((await proposals().get(held.proposal))?.status).toBe('open');
    expect(await docs().get('dashboard', held.copy)).not.toBeNull();
  });

  it('removes every item and folder in it and withdraws those proposals, changing nothing outside it', async () => {
    const versions = {
      board: (await docs().get('dashboard', ids.board))!.version,
      library: (await docs().get('chart', ids.library))!.version,
      source: (await sources().get(ids.source))!.version,
    };
    const copiedLocal = (await docs().localTo(held.copy)).map((chart) => chart.id);
    expect(copiedLocal).toHaveLength(1);

    const cleared = await as('writer', { method: 'POST', url: '/api/workspace/clear' });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json()).toEqual({
      items: 6,
      folders: 2,
      dashboards: 3,
      charts: 2,
      models: 0,
      dataSources: 1,
      withdrawn: 2,
    });

    // Nothing left in it, at any depth.
    expect(await contentsOf('writer', 'mine')).toEqual([]);
    const roots = await as('writer', { method: 'GET', url: '/api/folder-roots' });
    expect(roots.json<{ mine: number }>().mine).toBe(0);
    for (const [kind, id] of [
      ['dashboard', held.copy],
      ['dashboard', held.draft],
      ['chart', held.mine],
      ['folder', held.drafts],
      ...copiedLocal.map((id) => ['chart', id] as const),
    ] as const)
      expect(await docs().get(kind, id)).toBeNull();
    expect(await sources().get(held.sourceCopy)).toBeUndefined();
    // The data source's removal recorded, as its own delete records it (T522's review).
    const removed = await getDb()
      .selectFrom('audit_records')
      .select(['event', 'summary'])
      .where('item_id', '=', held.sourceCopy)
      .orderBy('at', 'desc')
      .executeTakeFirst();
    expect(removed).toEqual({ event: 'data-source-change', summary: 'Removed' });

    // Its proposal withdrawn, the trail saying why.
    const proposal = (await proposals().get(held.proposal))!;
    expect(proposal.status).toBe('withdrawn');
    const records = await getDb()
      .selectFrom('audit_records')
      .select('summary')
      .where('folder_id', '=', ids.sales)
      .execute();
    expect(records.map((record) => record.summary)).toContain(
      `Withdrew “Revenue ${MARK}”: My workspace was cleared`,
    );

    // Nothing outside it changed: another's workspace, /Sales and its versions.
    expect((await docs().get('chart', managers))?.id).toBe(managers);
    expect((await contentsOf('manager', 'mine')).map((row) => row.id)).toContain(managers);
    expect((await docs().get('dashboard', ids.board))!.version).toBe(versions.board);
    expect((await docs().get('chart', ids.library))!.version).toBe(versions.library);
    expect((await docs().get('chart', ids.local))?.id).toBe(ids.local);
    expect((await sources().get(ids.source))!.version).toBe(versions.source);
  });

  it('says an empty workspace holds nothing, and clears it to no effect', async () => {
    const asked = await as('writer', { method: 'GET', url: '/api/workspace/clear' });
    expect(asked.json()).toEqual({
      items: 0,
      folders: 0,
      dashboards: 0,
      charts: 0,
      models: 0,
      dataSources: 0,
      proposals: [],
    });
    const cleared = await as('writer', { method: 'POST', url: '/api/workspace/clear' });
    expect(cleared.json()).toEqual({
      items: 0,
      folders: 0,
      dashboards: 0,
      charts: 0,
      models: 0,
      dataSources: 0,
      withdrawn: 0,
    });
  });

  it('is no one’s to clear who has no workspace', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const refused = await as('reader', { method, url: '/api/workspace/clear' });
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toEqual({
        error: 'You have no workspace: only read-write members and Super-Admins have one.',
      });
    }
  });
});

describe('clearing My workspace with sign-in off (T522, AC-367; design 14, F)', () => {
  it('clears the one user’s workspace, and nothing in Shared', async () => {
    const open = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      bookmarks: bookmarkStore(getDb()),
      dataSources: sources(),
    });
    try {
      // Anything an earlier run left there goes first, so the counts are this test's own.
      expect((await open.inject({ method: 'POST', url: '/api/workspace/clear' })).statusCode).toBe(
        200,
      );
      const folder = await doc('folder', { title: `Single ${MARK}`, folderId: 'mine' });
      const inside = await doc('dashboard', {
        schemaVersion: 1,
        title: `Single board ${MARK}`,
        folderId: folder,
        pages: [],
      });
      const shared = await doc('dashboard', {
        schemaVersion: 1,
        title: `Shared board ${MARK}`,
        folderId: 'root',
        pages: [],
      });
      const asked = await open.inject({ method: 'GET', url: '/api/workspace/clear' });
      expect(asked.statusCode, asked.body).toBe(200);
      expect(asked.json()).toEqual({
        items: 1,
        folders: 1,
        dashboards: 1,
        charts: 0,
        models: 0,
        dataSources: 0,
        proposals: [],
      });
      const cleared = await open.inject({ method: 'POST', url: '/api/workspace/clear' });
      expect(cleared.statusCode, cleared.body).toBe(200);
      expect(await docs().get('folder', folder)).toBeNull();
      expect(await docs().get('dashboard', inside)).toBeNull();
      expect((await docs().get('dashboard', shared))?.id).toBe(shared);
    } finally {
      await open.close();
    }
  });

  it('never clears the single user’s workspace for one signed in (T522’s review)', async () => {
    // Sign-in on, with no folder grants read: a Super-Admin's own workspace, never `mine`.
    const bare = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
    });
    try {
      const single = await doc('dashboard', {
        schemaVersion: 1,
        title: `Single user's ${MARK}`,
        folderId: 'mine',
        pages: [],
      });
      const cookie = await signIn(bare, USERS['super']!);
      const cleared = await bare.inject({
        method: 'POST',
        url: '/api/workspace/clear',
        headers: { cookie },
      });
      expect(cleared.statusCode, cleared.body).toBe(200);
      expect((await docs().get('dashboard', single))?.id).toBe(single);
    } finally {
      await bare.close();
    }
  });
});
