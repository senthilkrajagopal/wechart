import { randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import pg from 'pg';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../../auth/sign-in.fixture';
import { CubeClient } from '../../cube/client';
import { closeDb, databaseUrl, getDb } from '../../db/client';
import { accessTokenStore, type TokenScope } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { buildHistory, type Starter } from '../../repos/build-history';
import { catalog } from '../../repos/catalog';
import { documents, type DocumentKind } from '../../repos/documents';
import { folderAccessStore } from '../../repos/folder-access';
import { mcpPageStore } from '../../repos/mcp-pages';
import { queryLog } from '../../repos/query-log';
import { signInStore } from '../../repos/sign-ins';
import { scheduleStore, wechartScheduler, type WechartScheduler } from '../../scheduler/schedules';
import { buildServer } from '../../server';
import { xcubeQueue, type QueueEntry } from '../../xcube/queue';
import { challengesFor, mcpClient, mcpClientSeeing } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { USER_DATA } from '../result';
import { mintToken } from '../tokenText';
import { NOT_IN_QUEUE, NOT_OFFERED } from './jobs';

/**
 * T788 (AC-477, AC-469): jobs through MCP. A read-write member's token
 * lists the pre-aggregations, queue entries, builds, query records and
 * schedules that Jobs and Schedules show them (AC-297), and no other
 * folder's or user's; starts a schedule's build with Run now, and cancels or
 * stops a build, exactly where their web app offers each, and is refused
 * elsewhere with nothing started or cancelled; and no tool makes, changes,
 * pauses, resumes or deletes a schedule. Every jobs tool needs
 * proposals-and-jobs.
 *
 * `writer` (`sales-rw`) writes /A; `many` (`g01`) writes /C. On pg-boss in
 * a schema of the test's own, with its TestClock, a stub Cube and a stub
 * xcube queue, as `routes/schedules.test.ts` and `jobs/queue.test.ts` set
 * them up.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `mcpjobs${randomUUID().slice(0, 8)}`;
const SCHEMA = `pgboss_${MARK}`;
const TOKEN_NAME = `${MARK} Claude Code`;
const clock = new TestClock(new Date('2026-10-05T04:00:00Z'));
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
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
  mcpHost: HOST,
};

const docs = () => documents(getDb());
const history = () => buildHistory(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { a: '', c: '' };
const xcubeIds = { a: '', c: '' };
const tokenIds: string[] = [];
const tokens = { full: '', noJobs: '' };
let writerKey = '';
let app: FastifyInstance;
let boss: PgBoss;
let scheduler: WechartScheduler;
/** Every jobs post the stub Cube is sent, by the pre-aggregations it names. */
const posted: string[][] = [];
/** What xcube's queue holds, and each cancel it is asked. */
let queued: QueueEntry[] = [];
const cancels: { keys: string[]; processing: boolean }[] = [];

async function folder(title: string, access: { readOnly: string[]; readWrite: string[] }) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: { owner: 'admin', title, folderId: 'root', access },
  });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const preAggIn = (place: 'a' | 'c') => `${xcubeIds[place]}__orders.by_month`;

async function tokenFor(scopes: readonly TokenScope[], name: string): Promise<string> {
  const { text, digest } = mintToken();
  tokenIds.push(
    (
      await accessTokenStore(getDb()).create({
        owner: { key: writerKey, name: 'Wren Writer' },
        name,
        scopes: [...scopes],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        digest,
      })
    ).id,
  );
  return text;
}

/** A build wechart started in `place`, as Jobs records one. */
async function started(
  place: 'a' | 'c',
  starter: Starter = { kind: 'person', key: 'wren-key', name: 'Wren Writer' },
) {
  const requestId = `wechart-${MARK}-${randomUUID()}`;
  const token = `${MARK}-token-${randomUUID()}`;
  const at = new Date();
  const runId = await history().start({
    preAggregation: preAggIn(place),
    folderId: ids[place],
    partitions: ['2026-08-01T00:00:00.000'],
    granularity: 'month',
    via: 'rebuild-selected',
    starter,
    requestId,
    tokens: [token],
    startedAt: at,
    answeredAt: at,
  });
  return { requestId, token, runId };
}

const entry = (over: Partial<QueueEntry>): QueueEntry => ({
  key: `${MARK}-key-${randomUUID()}`,
  dataSource: 'default',
  preAggregation: preAggIn('a'),
  table: 'prod_pre_aggregations.orders_by_month20260801',
  targetTable: `prod_pre_aggregations.orders_by_month20260801_aaaa_${randomUUID().slice(0, 6)}`,
  partition: { start: '2026-08-01T00:00:00.000', end: '2026-08-31T23:59:59.999' },
  status: 'queued',
  stalled: false,
  addedAt: '2026-10-02T14:38:41.000Z',
  requestId: null,
  startedBy: 'scheduler',
  job: null,
  ...over,
});

/** A schedule of `place`'s rollup, made in the web app by `who`. */
async function scheduleBy(who: string, place: 'a' | 'c', name: string) {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/wechart-schedules',
    payload: {
      name: `${name} ${MARK}`,
      preAggregation: preAggIn(place),
      cron: '0 5 * * *',
      timezone: 'Europe/London',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
}

beforeAll(async () => {
  ids.a = await folder(`A ${MARK}`, { readOnly: ['sales-ro'], readWrite: ['sales-rw'] });
  ids.c = await folder(`C ${MARK}`, { readOnly: [], readWrite: ['g01'] });
  xcubeIds.a = `f${ids.a.replaceAll('-', '')}`;
  xcubeIds.c = `f${ids.c.replaceAll('-', '')}`;
  const cube = (name: string, folderId: string) => ({
    name,
    meta: { xcube: { folderId, shortName: 'orders' } },
    preAggregations: [{ name: 'by_month', type: 'rollup', partitionGranularity: 'month' }],
  });
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    service: async () => 'service-token',
    model: { id: 'dev', revision: async () => undefined },
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const asked = new URL(url);
      if (asked.pathname.endsWith('/models/dev/meta'))
        return Response.json({
          cubes: [
            cube(`${xcubeIds.a}__orders`, xcubeIds.a),
            cube(`${xcubeIds.c}__orders`, xcubeIds.c),
          ],
        });
      if (asked.pathname.endsWith('/v1/pre-aggregations/jobs')) {
        const body = JSON.parse(String(init?.body)) as { selector: { preAggregations: string[] } };
        posted.push(body.selector.preAggregations);
        return Response.json([`${MARK}-token-${String(posted.length)}`]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch,
  });
  boss = new PgBoss({
    connectionString: databaseUrl(),
    schema: SCHEMA,
    clock,
    cronMonitorIntervalSeconds: 1,
    cronWorkerIntervalSeconds: 1,
    supervise: false,
  });
  scheduler = wechartScheduler({
    boss,
    // This file's schedules alone: another file's, in the same database, aren't its to run.
    store: scheduleStore(getDb(), { named: MARK }),
    history: history(),
    cube: client,
    now: () => new Date(clock.now()),
    pollingIntervalSeconds: 0.5,
  });
  await scheduler.start();
  app = buildServer({
    config: secured,
    cube: client,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [ids.a, xcubeIds.a],
        [ids.c, xcubeIds.c],
      ]),
      parents: new Map([
        ['root', null],
        [ids.a, 'root'],
        [ids.c, 'root'],
      ]),
    }),
    buildHistory: history(),
    schedules: scheduler,
    queryLog: queryLog(getDb()),
    audit: auditStore(getDb()),
    now: () => new Date(clock.now()),
    buildQueue: xcubeQueue({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 'service-token',
      fetch: (async (url: string, init?: RequestInit) => {
        if (new URL(url).pathname.endsWith('/queue/cancel')) {
          const body = JSON.parse(String(init?.body)) as { keys: string[]; processing: boolean };
          cancels.push(body);
          return Response.json({
            model: 'dev',
            cancelled: body.keys.map((key) => ({
              key,
              preAggregation: 'x',
              status: body.processing ? 'processing' : 'queued',
            })),
            notCancelled: [],
          });
        }
        return Response.json({ model: 'dev', queue: queued });
      }) as typeof fetch,
    }),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
  });
  for (const who of ['writer', 'many', 'super']) cookies[who] = await signIn(app, USERS[who]!);
  writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  tokens.full = await tokenFor(['read', 'proposals-and-jobs'], TOKEN_NAME);
  tokens.noJobs = await tokenFor(['read', 'workspace-edit'], `${MARK} no jobs`);
}, 60_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (boss !== undefined) await boss.stop({ graceful: false, close: true });
  const db = getDb();
  if (tokenIds.length > 0) {
    await db
      .deleteFrom('audit_records')
      .where(sql<boolean>`details::text similar to ${`%(${tokenIds.join('|')})%`}`)
      .execute();
    await db.deleteFrom('personal_access_tokens').where('id', 'in', tokenIds).execute();
  }
  await db.deleteFrom('schedules').where('name', 'like', `%${MARK}%`).execute();
  await db
    .deleteFrom('build_runs')
    .where('pre_aggregation', 'in', [preAggIn('a'), preAggIn('c')])
    .execute();
  await db.deleteFrom('query_log').where('request_id', 'like', `${MARK}%`).execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', [ids.a, ids.c]).execute();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.end();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await forgetTestCounts();
  await closeDb();
});

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await mcpClient(app, HOST, tokens.full);
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
  expect(result.isError, `${what}: ${JSON.stringify(result.content)}`).toBe(true);
  expect(result.structuredContent, what).toBeUndefined();
  return JSON.stringify(result.content);
}

/** The ids, keys or request ids of rows, as JSON gives them, sorted. */
const keysOf = (rows: readonly Record<string, unknown>[], key: string) =>
  rows.map((row) => String(row[key])).sort();

describe('listing jobs through MCP (T788, AC-477, AC-297)', () => {
  it('lists the pre-aggregations, queue, builds, query records and schedules Jobs and Schedules show the owner, and nothing else', async () => {
    const ownSchedule = await scheduleBy('writer', 'a', 'Morning');
    const otherSchedule = await scheduleBy('many', 'c', 'Theirs');
    const ownRun = await started('a');
    const otherRun = await started('c');
    queued = [
      entry({ requestId: ownRun.requestId, startedBy: 'jobs' }),
      entry({ preAggregation: preAggIn('c'), requestId: otherRun.requestId, startedBy: 'jobs' }),
    ];
    const log = queryLog(getDb());
    const ownQuery = await log.record({
      requestId: `${MARK}-own`,
      query: { measures: ['orders.count'] },
      durationMs: 12,
      accelerated: false,
      userKey: writerKey,
    });
    const otherQuery = await log.record({
      requestId: `${MARK}-other`,
      query: { measures: ['orders.count'] },
      durationMs: 12,
      accelerated: false,
      userKey: `${MARK}-someone-else`,
    });

    await withClient(async (client) => {
      const tab = async (name: string) =>
        answered(await client.callTool({ name: 'list_jobs', arguments: { tab: name } }), name)[
          'rows'
        ] as Record<string, unknown>[];
      const web = async (url: string) => {
        const answer = await as('writer', { method: 'GET', url });
        expect(answer.statusCode, `${url}: ${answer.body}`).toBe(200);
        return answer.json<unknown>();
      };

      // Each tab's rows are the web app's for the owner, here this file's folders' alone.
      const preAggs = await tab('pre-aggregations');
      expect(keysOf(preAggs, 'id')).toEqual(
        keysOf(await (web('/api/preaggregations') as Promise<Record<string, unknown>[]>), 'id'),
      );
      expect(keysOf(preAggs, 'id')).toContain(preAggIn('a'));
      expect(keysOf(preAggs, 'id')).not.toContain(preAggIn('c'));

      const queue = await tab('queue');
      const webQueue = (await web('/api/jobs/queue')) as { entries: Record<string, unknown>[] };
      expect(queue).toEqual(webQueue.entries);
      expect(keysOf(queue, 'key')).toEqual([queued[0]!.key]);

      const builds = await tab('builds');
      const webBuilds = (await web('/api/jobs/builds')) as { records: Record<string, unknown>[] };
      expect(keysOf(builds, 'id')).toEqual(keysOf(webBuilds.records, 'id'));
      expect(keysOf(builds, 'id')).toContain(ownRun.runId);
      expect(keysOf(builds, 'id')).not.toContain(otherRun.runId);

      const queries = await tab('queries');
      // A page of 100, the route's most, as the tool asks.
      const webQueries = (await web('/api/jobs/queries/page?limit=100')) as {
        records: Record<string, unknown>[];
      };
      expect(keysOf(queries, 'id')).toEqual(keysOf(webQueries.records, 'id'));
      expect(keysOf(queries, 'requestId')).toContain(ownQuery.requestId);
      expect(keysOf(queries, 'requestId')).not.toContain(otherQuery.requestId);

      const schedules = answered(
        await client.callTool({ name: 'list_schedules', arguments: {} }),
        'schedules',
      )['schedules'] as Record<string, unknown>[];
      const webWechart = (await web('/api/wechart-schedules')) as Record<string, unknown>[];
      const webCube = (await web('/api/schedules')) as Record<string, unknown>[];
      expect(keysOf(schedules, 'id')).toEqual(
        [...keysOf(webWechart, 'id'), ...keysOf(webCube, 'id')].sort(),
      );
      expect(keysOf(schedules, 'id')).toContain(ownSchedule);
      expect(keysOf(schedules, 'id')).not.toContain(otherSchedule);
      expect(schedules.find((each) => each['id'] === ownSchedule)?.['owner']).toBe('wechart');
    });
  });
});

describe('Run now and Cancel through MCP (T788, AC-477)', () => {
  it('starts a schedule’s build with Run now where the web app offers it, through MCP in the trail, and nowhere else', async () => {
    const own = await scheduleBy('writer', 'a', 'Run now');
    const other = await scheduleBy('many', 'c', 'Not theirs');
    const before = await scheduleStore(getDb(), { named: MARK }).get(own);
    posted.length = 0;

    await withClient(async (client) => {
      const ran = answered(
        await client.callTool({ name: 'run_schedule_now', arguments: { scheduleId: own } }),
        'run now',
      )['run'] as { runId: string; tokens: string[] };
      expect(posted).toEqual([[preAggIn('a')]]);
      expect((await history().get(ran.runId))?.via).toBe('run-now');
      const [kept] = (
        await auditStore(getDb()).list({ events: ['build-started'], folderIds: [ids.a] })
      ).records.filter((record) => record.details?.['runId'] === ran.runId);
      expect(kept?.details?.['viaMcp']).toEqual({ token: { id: tokenIds[0], name: TOKEN_NAME } });
      // Its times as they were: Run now changes no schedule.
      expect(await scheduleStore(getDb(), { named: MARK }).get(own)).toEqual(before);

      posted.length = 0;
      // Each refused for its own reason, in the route's words (T788's review).
      expect(
        refused(
          await client.callTool({ name: 'run_schedule_now', arguments: { scheduleId: other } }),
          'another folder’s',
        ),
      ).toContain('You can schedule only the pre-aggregations of folders you have read-write');
      expect(
        refused(
          await client.callTool({
            name: 'run_schedule_now',
            arguments: { scheduleId: randomUUID() },
          }),
          'none',
        ),
      ).toContain('There is no such schedule.');
      expect(posted).toEqual([]);
    });
  });

  it('cancels a queued build and stops a building one exactly where the web app offers each, and refuses the rest, asking xcube nothing', async () => {
    const own = await started('a');
    const building = await started('a');
    const other = await started('c');
    const queuedOwn = entry({ requestId: own.requestId, startedBy: 'jobs' });
    const buildingOwn = entry({
      requestId: building.requestId,
      startedBy: 'jobs',
      status: 'processing',
    });
    const byWorker = entry({ startedBy: 'scheduler' });
    const buildingByWorker = entry({ startedBy: 'scheduler', status: 'processing' });
    const stalledOwn = entry({
      requestId: building.requestId,
      startedBy: 'jobs',
      status: 'processing',
      stalled: true,
    });
    const otherFolder = entry({
      preAggregation: preAggIn('c'),
      requestId: other.requestId,
      startedBy: 'jobs',
    });
    // Waiting, but stalled or orphaned (T788's review): the route still flags it
    // cancellable, and Jobs offers no Cancel on it.
    const stalledWaiting = entry({ requestId: own.requestId, startedBy: 'jobs', stalled: true });
    queued = [
      queuedOwn,
      buildingOwn,
      byWorker,
      buildingByWorker,
      stalledOwn,
      stalledWaiting,
      otherFolder,
    ];
    cancels.length = 0;

    await withClient(async (client) => {
      const cancel = (key: string) => client.callTool({ name: 'cancel_build', arguments: { key } });
      // What the web app's queue offers the owner, row by row: its flags and
      // state, Cancel shown only on a queued one and Stop on a building one
      // (`BuildQueue.tsx`).
      const offered = (await as('writer', { method: 'GET', url: '/api/jobs/queue' }))
        .json<{
          entries: { key: string; cancellable: boolean; stoppable: boolean; state: string }[];
        }>()
        .entries.map((row) => [row.key, row.cancellable, row.stoppable, row.state]);
      expect(offered).toEqual([
        [queuedOwn.key, true, false, 'queued'],
        [buildingOwn.key, false, true, 'building'],
        [byWorker.key, false, false, 'queued'],
        [buildingByWorker.key, false, false, 'building'],
        [stalledOwn.key, false, false, 'stalled'],
        [stalledWaiting.key, true, false, 'stalled'],
      ]);

      // Not offered: refused, each for its reason, xcube never asked.
      for (const key of [byWorker.key, buildingByWorker.key, stalledOwn.key, stalledWaiting.key])
        expect(refused(await cancel(key), key)).toContain(JSON.stringify(NOT_OFFERED).slice(1, -1));
      for (const key of [otherFolder.key, 'gone'])
        expect(refused(await cancel(key), key)).toContain(
          JSON.stringify(NOT_IN_QUEUE).slice(1, -1),
        );
      expect(cancels).toEqual([]);

      // Cancel, on the queued one; Stop, on the building one.
      expect(answered(await cancel(queuedOwn.key), 'cancel')['cancel']).toMatchObject({
        cancelled: true,
      });
      expect(answered(await cancel(buildingOwn.key), 'stop')['cancel']).toMatchObject({
        cancelled: true,
      });
      expect(cancels).toEqual([
        { keys: [queuedOwn.key], processing: false },
        { keys: [buildingOwn.key], processing: true },
      ]);
    });
  });
});

describe('no schedule edits through MCP (T788, AC-477)', () => {
  it('offers no tool that makes, changes, pauses, resumes or deletes a schedule', async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      const touching = tools
        .filter((tool) => /schedul/i.test(`${tool.name} ${tool.description ?? ''}`))
        .map((tool) => tool.name)
        .sort();
      expect(touching).toEqual(['list_schedules', 'run_schedule_now']);
      for (const name of tools.map((tool) => tool.name))
        expect(name).not.toMatch(
          /(create|make|change|update|edit|pause|resume|unpause|delete).*schedul/i,
        );
    });
  });
});

describe('the proposals-and-jobs scope (T788, AC-469, AC-433)', () => {
  it('answers a token without it 403 insufficient_scope for every jobs tool, starting and cancelling nothing', async () => {
    const own = await scheduleBy('writer', 'a', 'Unscoped');
    const run = await started('a');
    queued = [entry({ requestId: run.requestId, startedBy: 'jobs' })];
    posted.length = 0;
    cancels.length = 0;
    for (const [name, args] of [
      ['list_jobs', { tab: 'queue' }],
      ['list_schedules', {}],
      ['run_schedule_now', { scheduleId: own }],
      ['cancel_build', { key: queued[0]!.key }],
    ] as const) {
      const { client, answers } = await mcpClientSeeing(app, HOST, tokens.noJobs);
      try {
        await expect(client.callTool({ name, arguments: args }), name).rejects.toThrow();
      } finally {
        await client.close();
      }
      expect(challengesFor(answers.at(-1), 'proposals-and-jobs'), name).toBe(true);
    }
    expect(posted).toEqual([]);
    expect(cancels).toEqual([]);
  });
});
