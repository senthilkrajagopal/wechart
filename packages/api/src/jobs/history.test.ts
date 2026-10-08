import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { buildHistory, type NewBuild } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T374 / AC-150: Run history lists the builds wechart started, newest first,
 * 50 at a time, filterable by outcome, starter, folder and time; scoped as
 * T371 scopes Jobs (AC-297): a read-write member gets only their folders'
 * records, a Super-Admin everyone's, and a reader none (403). A build's log
 * is its own record, Not found out of scope (design 16, state G6).
 *
 * `writer` (`sales-rw`) writes /A and so /A/B below it; `many` (`g01`) writes
 * /C; `reader` (`sales-ro`) reads /A.
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

const MARK = `hist${randomUUID().slice(0, 8)}`;
/** The server's clock: every "Last 7 days" is counted from it. */
const NOW = new Date('2026-10-02T15:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const docs = () => documents(getDb());
const history = () => buildHistory(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const preAggs = new Set<string>();
const cookies: Record<string, string> = {};
const ids = { a: '', b: '', c: '' };
let app: FastifyInstance;

async function folder(
  title: string,
  parent: string,
  access: { readOnly: string[]; readWrite: string[] },
) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: { owner: 'admin', title, folderId: parent, access },
  });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/**
 * A folder's cube of a name, under a name of its own, as one name is one
 * item's (T709, R71): unique to the folder, so no other test's builds share it.
 */
const cubeIn = (folderId: string, name: string) =>
  `${name}_${folderId.replaceAll('-', '').slice(0, 12)}`;

/** A build recorded in `folderId`, `minutes` before NOW, ended as `outcome`. */
async function recorded(
  folderId: string,
  minutes: number,
  {
    outcome = 'done',
    starter = { kind: 'person', key: 'writer-key', name: 'Wren Writer' },
    name = 'orders',
  }: {
    outcome?: 'done' | 'failed' | 'expired' | 'open';
    starter?: NewBuild['starter'];
    name?: string;
  } = {},
) {
  const preAggregation = `${cubeIn(folderId, name)}.main`;
  preAggs.add(preAggregation);
  const token = `${MARK}-${randomUUID()}`;
  const startedAt = minutesAgo(minutes);
  const id = await history().start({
    preAggregation,
    folderId,
    partitions: null,
    granularity: 'month',
    via: 'build-all',
    starter,
    requestId: `wechart-${randomUUID()}`,
    tokens: [token],
    startedAt,
    answeredAt: startedAt,
  });
  if (outcome === 'open') return id;
  const status = { done: 'done', failed: 'failure: timed out', expired: 'not_found' }[outcome];
  await history().seen({
    runId: id,
    token,
    previous: null,
    status,
    at: new Date(startedAt.getTime() + 41_000),
    final: true,
  });
  await history().close(id);
  return id;
}

interface Summary {
  id: string;
  name: string;
  folderId: string;
  folderPath: string[];
  outcome: string | null;
  starter: { kind: string; name: string };
}
const listed = async (who: string, query = '') => {
  const answer = await as(who, { method: 'GET', url: `/api/jobs/builds${query}` });
  return {
    status: answer.statusCode,
    body:
      answer.statusCode === 200
        ? answer.json<{ records: Summary[]; older?: string }>()
        : { records: [] as Summary[] },
  };
};
/** Only this test's records: the shared database holds others'. */
const ours = (records: readonly Summary[]) =>
  records.filter((each) => [ids.a, ids.b, ids.c].includes(each.folderId));

beforeAll(async () => {
  ids.a = await folder(`A ${MARK}`, 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] });
  ids.b = await folder(`B ${MARK}`, ids.a, { readOnly: [], readWrite: [] });
  ids.c = await folder(`C ${MARK}`, 'root', { readOnly: [], readWrite: ['g01'] });
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async () => new Response('{}', { status: 404 })) as typeof fetch,
  });
  app = buildServer({
    config: secured,
    cube: client,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    buildHistory: history(),
    now: () => NOW,
  });
  for (const who of ['writer', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb()
    .deleteFrom('build_runs')
    .where('pre_aggregation', 'in', [...preAggs])
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

describe('Run history, scoped as Jobs is (T374, AC-150, AC-297)', () => {
  it('gives a read-write member only their folders’ builds, a Super-Admin everyone’s, and a reader none', async () => {
    const inA = await recorded(ids.a, 10);
    const inB = await recorded(ids.b, 9);
    const inC = await recorded(ids.c, 8);

    const writer = await listed('writer');
    expect(writer.status).toBe(200);
    expect(ours(writer.body.records).map((each) => each.id)).toEqual([inB, inA]);
    expect(ours((await listed('many')).body.records).map((each) => each.id)).toEqual([inC]);
    expect(ours((await listed('super')).body.records).map((each) => each.id)).toEqual([
      inC,
      inB,
      inA,
    ]);
    expect((await listed('reader')).status).toBe(403);

    // Each by its name, with its folder (T371).
    const row = writer.body.records.find((each) => each.id === inB);
    expect(row).toMatchObject({
      name: `${cubeIn(ids.b, 'orders')}.main`,
      folderId: ids.b,
      folderPath: ['Shared', `A ${MARK}`, `B ${MARK}`],
    });
  });

  it('opens a build’s record in scope, and answers Not found out of it', async () => {
    const inC = await recorded(ids.c, 7, { outcome: 'failed' });

    const own = await as('many', { method: 'GET', url: `/api/jobs/builds/${inC}` });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({
      id: inC,
      name: `${cubeIn(ids.c, 'orders')}.main`,
      folderPath: ['Shared', `C ${MARK}`],
      outcome: 'failed',
      failedCount: 1,
      error: 'failure: timed out',
      durationMs: 41_000,
    });
    expect((own.json() as { tokens: { log: unknown[] }[] }).tokens[0]?.log).toHaveLength(1);

    // Another folder's reads as one that doesn't exist (state G6).
    const other = await as('writer', { method: 'GET', url: `/api/jobs/builds/${inC}` });
    const missing = await as('writer', { method: 'GET', url: `/api/jobs/builds/${randomUUID()}` });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(missing.json());
    expect((await as('reader', { method: 'GET', url: `/api/jobs/builds/${inC}` })).statusCode).toBe(
      403,
    );
  });
});

describe('Run history’s order, pages and filters (T374, AC-150)', () => {
  it('lists newest first, 50 at a time, with the next page older', async () => {
    const folderId = await folder(`Paged ${MARK}`, 'root', { readOnly: [], readWrite: ['g01'] });
    const started: string[] = [];
    for (let each = 0; each < 55; each += 1)
      started.push(await recorded(folderId, 2_000 + each, { name: 'paged' }));

    const first = await listed('many', `?folder=${folderId}&within=all`);
    expect(first.body.records.map((each) => each.id)).toEqual(started.slice(0, 50));
    expect(first.body.older).toBeDefined();
    const second = await listed(
      'many',
      `?folder=${folderId}&within=all&before=${first.body.older!}`,
    );
    expect(second.body.records.map((each) => each.id)).toEqual(started.slice(50));
    expect(second.body.older).toBeUndefined();
  });

  it('narrows by outcome, starter, folder and time', async () => {
    const schedule = { kind: 'schedule', id: `s-${MARK}`, name: 'Month-end close' } as const;
    const done = await recorded(ids.a, 60);
    const failed = await recorded(ids.a, 61, { outcome: 'failed' });
    const expired = await recorded(ids.a, 62, { outcome: 'expired' });
    const open = await recorded(ids.a, 63, { outcome: 'open' });
    const bySchedule = await recorded(ids.b, 64, { starter: schedule });
    const twoDaysAgo = await recorded(ids.b, 2 * 24 * 60);

    const idsOf = async (query: string) =>
      new Set(ours((await listed('writer', query)).body.records).map((each) => each.id));

    expect(await idsOf('?outcome=failed')).toContain(failed);
    expect(await idsOf('?outcome=failed')).not.toContain(done);
    expect(await idsOf('?outcome=expired')).toEqual(new Set([expired]));
    expect(await idsOf('?outcome=open')).toEqual(new Set([open]));
    expect(await idsOf(`?starter=schedule:${schedule.id}`)).toEqual(new Set([bySchedule]));
    expect(await idsOf('?starter=person:writer-key')).not.toContain(bySchedule);
    const inB = await idsOf(`?folder=${ids.b}&within=all`);
    expect(inB).toContain(bySchedule);
    expect(inB).toContain(twoDaysAgo);
    expect(inB).not.toContain(done);
    // Last 24 hours, Last 7 days, or all of it.
    expect(await idsOf('?within=day')).not.toContain(twoDaysAgo);
    expect(await idsOf('?within=week')).toContain(twoDaysAgo);
    // One pre-aggregation's, for its pane's "Builds started from wechart" (T375).
    const other = await recorded(ids.a, 65, { name: 'returns' });
    const ofOrders = await idsOf(
      `?within=all&preagg=${encodeURIComponent(`${cubeIn(ids.a, 'orders')}.main`)}`,
    );
    expect(ofOrders).toContain(done);
    expect(ofOrders).not.toContain(other);
  });

  it('says how far an open build has got, and offers the starters and folders in scope', async () => {
    const preAggregation = `${cubeIn(ids.c, 'progress')}.main`;
    preAggs.add(preAggregation);
    const tokens = [
      `${MARK}-${randomUUID()}`,
      `${MARK}-${randomUUID()}`,
      `${MARK}-${randomUUID()}`,
    ];
    const id = await history().start({
      preAggregation,
      folderId: ids.c,
      partitions: null,
      granularity: 'month',
      via: 'build-all',
      starter: { kind: 'person', key: 'many-key', name: 'Manny Many' },
      requestId: `wechart-${randomUUID()}`,
      tokens,
      startedAt: minutesAgo(1),
      answeredAt: minutesAgo(1),
    });
    const at = minutesAgo(0);
    await history().seen({
      runId: id,
      token: tokens[0]!,
      previous: null,
      status: 'done',
      at,
      final: true,
    });
    await history().seen({
      runId: id,
      token: tokens[1]!,
      previous: null,
      status: 'processing',
      at,
      final: false,
    });

    const answer = await as('many', { method: 'GET', url: '/api/jobs/builds' });
    const page = answer.json<{
      records: (Summary & { jobs: number; granularity: string; progress: unknown })[];
      starters: { kind: string; key?: string; name: string }[];
      folders: { id: string; path: string[] }[];
      everyFolder: boolean;
    }>();
    expect(page.records.find((each) => each.id === id)).toMatchObject({
      outcome: null,
      jobs: 3,
      granularity: 'month',
      progress: { done: 1, building: 1 },
    });
    expect(page.starters).toContainEqual({ kind: 'person', key: 'many-key', name: 'Manny Many' });
    // Their own folder, never another's.
    expect(page.folders).toContainEqual({ id: ids.c, path: ['Shared', `C ${MARK}`] });
    expect(page.folders.map((folder) => folder.id)).not.toContain(ids.a);
    expect(page.everyFolder).toBe(false);
    const all = (await as('super', { method: 'GET', url: '/api/jobs/builds' })).json<{
      everyFolder: boolean;
    }>();
    expect(all.everyFolder).toBe(true);
  });

  it('offers no folder of anyone’s workspace, a Super-Admin’s choices included (AC-276)', async () => {
    const own = randomUUID();
    made.push({ kind: 'folder', id: own });
    await docs().create({
      kind: 'folder',
      id: own,
      body: { owner: 'admin', title: `Private ${MARK}`, folderId: 'ws:someone-else' },
    });

    for (const who of ['super', 'writer']) {
      const answer = await as(who, { method: 'GET', url: '/api/jobs/builds' });
      expect(answer.body, who).not.toContain(own);
      expect(answer.body, who).not.toContain(`Private ${MARK}`);
    }
  });

  it('never gives a member another folder’s builds, by its folder or by paging from one of its builds', async () => {
    const theirs = await recorded(ids.c, 30);
    await recorded(ids.a, 40);

    const byFolder = await listed('writer', `?folder=${ids.c}&within=all`);
    expect(byFolder.body.records).toEqual([]);
    // Paging from another folder's build learns nothing of when it started.
    const paged = await listed('writer', `?within=all&before=${theirs}`);
    expect(paged.body.records).toEqual([]);
  });
});

/**
 * T559 (AC-297; design 16, pin 4 and state H2): every Jobs tab and Schedules
 * has the Folder filter: "All of mine", a member's read-write folders, or
 * "All folders", a Super-Admin's every one, the root's included, each by its
 * path, with Include subfolders, as the audit trail's filter has it.
 */
describe('the Folder filter on every tab (T559, AC-297)', () => {
  interface Folders {
    folders: { id: string; path: string[]; parentId: string | null }[];
    everyFolder: boolean;
  }
  const foldersFor = async (who: string) => {
    const answer = await as(who, { method: 'GET', url: '/api/jobs/folders' });
    return { status: answer.statusCode, body: answer.json<Folders>() };
  };

  it('offers a member their folders and those below, each with its parent, and a Super-Admin every folder', async () => {
    const writer = await foldersFor('writer');
    expect(writer.status).toBe(200);
    expect(writer.body.everyFolder).toBe(false);
    expect(writer.body.folders).toContainEqual({
      id: ids.a,
      path: ['Shared', `A ${MARK}`],
      parentId: 'root',
    });
    expect(writer.body.folders).toContainEqual({
      id: ids.b,
      path: ['Shared', `A ${MARK}`, `B ${MARK}`],
      parentId: ids.a,
    });
    // Neither another's folder nor the root, which they don't write.
    expect(writer.body.folders.map((folder) => folder.id)).not.toContain(ids.c);
    expect(writer.body.folders.map((folder) => folder.id)).not.toContain('root');

    const all = await foldersFor('super');
    expect(all.body.everyFolder).toBe(true);
    expect(all.body.folders).toContainEqual({ id: 'root', path: ['Shared'], parentId: null });
    expect(all.body.folders.map((folder) => folder.id)).toEqual(
      expect.arrayContaining([ids.a, ids.b, ids.c]),
    );

    expect((await foldersFor('reader')).status).toBe(403);
  });

  it('lists a folder’s builds, and with Include subfolders those of the folders below it too', async () => {
    const inA = await recorded(ids.a, 20);
    const inB = await recorded(ids.b, 21);
    const idsOf = async (query: string) =>
      new Set(ours((await listed('writer', query)).body.records).map((each) => each.id));

    const alone = await idsOf(`?folder=${ids.a}&within=all`);
    expect([alone.has(inA), alone.has(inB)]).toEqual([true, false]);
    const below = await idsOf(`?folder=${ids.a}&subfolders=true&within=all`);
    expect([below.has(inA), below.has(inB)]).toEqual([true, true]);
    // Never a folder below that they don't write: B is theirs by A's grant.
    const theirs = await idsOf(`?folder=${ids.c}&subfolders=true&within=all`);
    expect(theirs).toEqual(new Set());
  });
});
