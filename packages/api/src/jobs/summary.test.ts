import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { scheduleStore, wechartScheduler, type StoredSchedule } from '../scheduler/schedules';
import { buildServer } from '../server';
import { xcubePartitions } from '../xcube/partitions';
import { xcubeQueue, type QueueEntry } from '../xcube/queue';

/**
 * T558 / AC-398 (design 16, P5): Jobs' header summary, over the user's
 * folders: how many builds are building and how many are queued (the queue,
 * T376), how many pre-aggregations read failed by AC-391's rule (T550), and
 * how many wechart schedules are suspended (T379). Each count is of the rows
 * the list it links to holds for the same user: the queue's, the
 * Pre-aggregations tab's and Schedules'. Against a stub xcube.
 *
 * `writer` (`sales-rw`) writes /A; `many` (`g01`) writes /C; `reader`
 * (`sales-ro`) only reads /A; `super` is a Super-Admin.
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

const MARK = `summary${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const history = () => buildHistory(getDb());
const store = () => scheduleStore(getDb(), { named: MARK });
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { a: '', c: '' };
const xcubeIds = { a: '', c: '' };
let app: FastifyInstance;

/** What xcube's queue and partitions routes answer; the partitions route, down. */
let queued: QueueEntry[] = [];
let items: unknown[] = [];
let partitionsDown = false;

type Place = 'a' | 'c';
const byMonth = (place: Place) => `${xcubeIds[place]}__orders.by_month`;
const table = (place: Place, month: string) =>
  `prod_pre_aggregations.orders_${place}_by_month2026${month}01`;
const at = (iso: string) => new Date(iso).getTime();
const BUILT = '2026-10-02T14:01:00Z';

/** A quarter's partitions, each built at 14:01. */
const quarter = (place: Place) => ({
  errors: [],
  timezones: ['UTC'],
  preAggregation: {
    id: byMonth(place),
    preAggregation: { type: 'rollup', partitionGranularity: 'month' },
  },
  partitions: ['12', '11', '10'].map((month) => ({
    tableName: table(place, month),
    timezone: 'UTC',
    buildRangeStart: `2026-${month}-01T00:00:00.000`,
    buildRangeEnd: `2026-${month}-28T23:59:59.999`,
    versionEntries: [{ table_name: table(place, month), last_updated_at: at(BUILT) }],
  })),
});

const entry = (
  place: Place,
  month: string,
  status: 'queued' | 'processing',
  stalled = false,
): QueueEntry => ({
  key: `${MARK}-${place}-${month}-${randomUUID()}`,
  dataSource: 'default',
  preAggregation: byMonth(place),
  table: table(place, month),
  targetTable: `${table(place, month)}_a_b_c`,
  partition: { start: `2026-${month}-01T00:00:00.000`, end: `2026-${month}-28T23:59:59.999` },
  status,
  stalled,
  addedAt: '2026-10-02T14:31:00.000Z',
  requestId: null,
  startedBy: 'scheduler',
  job: null,
});

/** November rebuilt from Jobs at 14:20, failed: its version is still 14:01's. */
const failedIn = async (place: Place) => {
  const startedAt = '2026-10-02T14:20:00Z';
  const token = `${MARK}-ran-${place}`;
  const runId = await history().start({
    preAggregation: byMonth(place),
    folderId: ids[place],
    partitions: ['2026-11-01T00:00:00.000'],
    granularity: 'month',
    via: 'rebuild-selected',
    starter: { kind: 'person', key: 'wren', name: 'Wren Writer' },
    requestId: `wechart-${token}`,
    tokens: [token],
    startedAt: new Date(startedAt),
    answeredAt: new Date(startedAt),
  });
  await history().seen({
    runId,
    token,
    previous: null,
    status: 'failure: canceling statement due to statement timeout',
    table: `${table(place, '11')}_x_y_${String(at(startedAt))}`,
    at: new Date(at(startedAt) + 40_000),
    final: true,
  });
};

/** A wechart schedule on `place`'s rollup, as it is stored; suspended, or paused, or neither. */
const scheduleIn = async (place: Place, state: 'running' | 'suspended' | 'paused') => {
  const when = new Date('2026-10-02T12:00:00Z');
  const by = { key: 'wren', name: 'Wren Writer' };
  const schedule: StoredSchedule = {
    id: randomUUID(),
    name: `${state} ${place} ${MARK}`,
    preAggregation: byMonth(place),
    folderId: ids[place],
    cron: '0 5 * * *',
    timezone: 'UTC',
    missed: 'once',
    createdBy: by,
    createdAt: when,
    updatedBy: by,
    updatedAt: when,
    suspendAfter: 3,
    countedFrom: null,
    suspendedAt: null,
    suspendedError: null,
    pausedAt: null,
    pausedBy: null,
    runsFrom: when,
  };
  await store().insert(schedule);
  if (state === 'suspended') await store().suspend(schedule.id, when, 'Pre-aggregation not found');
  if (state === 'paused') await store().pause(schedule.id, when, by);
};

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

beforeAll(async () => {
  ids.a = await folder(`A ${MARK}`, { readOnly: ['sales-ro'], readWrite: ['sales-rw'] });
  ids.c = await folder(`C ${MARK}`, { readOnly: [], readWrite: ['g01'] });
  xcubeIds.a = `f${ids.a.replaceAll('-', '')}`;
  xcubeIds.c = `f${ids.c.replaceAll('-', '')}`;
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async (url: string) =>
      new URL(url).pathname.endsWith('/v1/meta')
        ? Response.json({
            cubes: (['a', 'c'] as const).map((place) => ({
              name: `${xcubeIds[place]}__orders`,
              meta: { xcube: { folderId: xcubeIds[place], shortName: 'orders' } },
              preAggregations: [
                { name: 'by_month', type: 'rollup', partitionGranularity: 'month' },
              ],
            })),
          })
        : Response.json({}, { status: 404 })) as typeof fetch,
  });
  const xcube = (async (url: string) =>
    new URL(url).pathname.endsWith('/partitions')
      ? partitionsDown
        ? Response.json({ error: 'xcube is restarting' }, { status: 503 })
        : Response.json({ preAggregationPartitions: items })
      : Response.json({ model: 'dev', queue: queued })) as typeof fetch;
  // Never started: Schedules lists the stored schedules, which this test stores by hand.
  const boss = new PgBoss({ connectionString: databaseUrl(), schema: `pgboss_${MARK}` });
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
    buildQueue: xcubeQueue({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 't',
      fetch: xcube,
    }),
    buildPartitions: xcubePartitions({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 't',
      fetch: xcube,
      askAgainAfterMs: 0,
    }),
    schedules: wechartScheduler({ boss, store: store(), history: history(), cube: client }),
  });
  for (const who of ['writer', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('schedules').where('name', 'like', `%${MARK}%`).execute();
  await getDb().deleteFrom('build_runs').where('request_id', 'like', `wechart-${MARK}%`).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

interface Summary {
  building: number | null;
  queued: number | null;
  failed: number | null;
  suspended: number | null;
}
const summaryOf = async (who: string) => {
  const answer = await as(who, { method: 'GET', url: '/api/jobs/summary' });
  return { status: answer.statusCode, body: answer.json<Summary>() };
};
/** The same counts, from the lists the summary's links open, as the same user reads them. */
const listedFor = async (who: string): Promise<Summary> => {
  const entries = (await as(who, { method: 'GET', url: '/api/jobs/queue' })).json<{
    entries: { state: string }[];
  }>().entries;
  const rows = (await as(who, { method: 'GET', url: '/api/preaggregations' })).json<
    { state?: string | null }[]
  >();
  const schedules = (await as(who, { method: 'GET', url: '/api/wechart-schedules' })).json<
    { suspendedAt: string | null }[]
  >();
  return {
    building: entries.filter((each) => each.state === 'building').length,
    queued: entries.filter((each) => each.state === 'queued').length,
    failed: rows.filter((row) => row.state === 'failed').length,
    suspended: schedules.filter((schedule) => schedule.suspendedAt !== null).length,
  };
};

describe('Jobs’ header summary (T558, AC-398)', () => {
  it('counts, over each user’s folders only, what the lists its counts link to hold', async () => {
    // A: one building, two queued, one stalled; C: one building, one queued.
    // None of November's, whose build failed: queued again, it would read queued.
    queued = [
      entry('a', '10', 'processing'),
      entry('a', '12', 'queued'),
      entry('a', '12', 'queued'),
      entry('a', '12', 'queued', true),
      entry('c', '10', 'processing'),
      entry('c', '12', 'queued'),
    ];
    items = [quarter('a'), quarter('c')];
    await failedIn('a');
    await failedIn('c');
    // A: one suspended, one paused, one running; C: one suspended.
    await scheduleIn('a', 'suspended');
    await scheduleIn('a', 'paused');
    await scheduleIn('a', 'running');
    await scheduleIn('c', 'suspended');

    const writer = await summaryOf('writer');
    expect(writer).toEqual({
      status: 200,
      body: { building: 1, queued: 2, failed: 1, suspended: 1 },
    });
    expect(writer.body).toEqual(await listedFor('writer'));

    const many = await summaryOf('many');
    expect(many.body).toEqual({ building: 1, queued: 1, failed: 1, suspended: 1 });
    expect(many.body).toEqual(await listedFor('many'));

    // A Super-Admin's, over every folder.
    const all = await summaryOf('super');
    expect(all.body).toEqual({ building: 2, queued: 3, failed: 2, suspended: 2 });
    expect(all.body).toEqual(await listedFor('super'));
  });

  /** T558's review: a count it can't read is none, not 0, and the header leaves it out. */
  it('gives no failed count while xcube can’t say the rows’ states', async () => {
    queued = [entry('a', '10', 'processing')];
    items = [quarter('a'), quarter('c')];
    partitionsDown = true;
    try {
      const writer = await summaryOf('writer');

      expect([writer.body.failed, writer.body.building]).toEqual([null, 1]);
    } finally {
      partitionsDown = false;
    }
  });

  it('is refused, as Jobs is, to one who writes no folder', async () => {
    const reader = await summaryOf('reader');

    expect(reader.status).toBe(403);
  });
});
