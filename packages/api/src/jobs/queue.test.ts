import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { buildHistory, type Starter } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';
import { xcubeQueue, type QueueEntry } from '../xcube/queue';

/**
 * T376 / AC-151: the build queue, oldest first, each entry with its
 * pre-aggregation by short name, its folder, partition, state (queued,
 * building or stalled), who started it and its token — the person or wechart
 * schedule wechart's history names by the entry's request id or job token,
 * else Cube's refresh worker or a query, with no token (Q5) — in the user's
 * folders only (AC-297). A queued entry wechart started is cancelled by its
 * key and recorded as cancelled, by whom (AC-150); one wechart didn't start
 * is refused before xcube is asked (Q1); a cancel xcube refuses because the
 * entry had started or gone says so (AC-151). Against a stub xcube.
 *
 * `writer` (`sales-rw`) writes /A; `many` (`g01`) writes /C; `reader`
 * (`sales-ro`) reads /A.
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

const MARK = `queue${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const history = () => buildHistory(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { a: '', c: '' };
const xcubeIds = { a: '', c: '' };
let app: FastifyInstance;
/** What xcube's queue holds, and what each cancel is answered. */
let queued: QueueEntry[] = [];
let cancelAnswer: (keys: string[]) => Record<string, unknown> = (keys) => ({
  cancelled: keys.map((key) => ({ key, preAggregation: 'x', status: 'queued' })),
  notCancelled: [],
});
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
const entry = (over: Partial<QueueEntry>): QueueEntry => ({
  key: `${MARK}-key-${randomUUID()}`,
  dataSource: 'default',
  preAggregation: preAggIn('a'),
  table: 'prod_pre_aggregations.orders_by_month20260801',
  targetTable: `prod_pre_aggregations.orders_by_month20260801_aaaa_bbbb_${randomUUID().slice(0, 6)}`,
  partition: { start: '2026-08-01T00:00:00.000', end: '2026-08-31T23:59:59.999' },
  status: 'queued',
  stalled: false,
  addedAt: '2026-10-02T14:38:41.000Z',
  requestId: null,
  startedBy: 'scheduler',
  job: null,
  ...over,
});

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
  // The whole model's field list from xcube's admin meta (T436), hidden cubes
  // only with `hidden=true` (research xcube-jobs-schedules-routes.md §2).
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    service: async () => 'service-token',
    model: { id: 'dev', revision: async () => undefined },
    fetchImpl: (async (url: string) => {
      const asked = new URL(url);
      return asked.pathname.endsWith('/models/dev/meta')
        ? Response.json({
            cubes: [
              cube(`${xcubeIds.a}__orders`, xcubeIds.a),
              cube(`${xcubeIds.c}__orders`, xcubeIds.c),
              ...(asked.searchParams.get('hidden') === 'true'
                ? [{ ...cube(`${xcubeIds.a}__secret`, xcubeIds.a), public: false }]
                : []),
            ],
          })
        : Response.json({}, { status: 404 });
    }) as typeof fetch,
  });
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
    // Each cancel and stop in the trail (T505, T554).
    audit: auditStore(getDb()),
    buildQueue: xcubeQueue({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 'service-token',
      fetch: (async (url: string, init?: RequestInit) => {
        if (new URL(url).pathname.endsWith('/queue/cancel')) {
          const body = JSON.parse(String(init?.body)) as { keys: string[]; processing: boolean };
          cancels.push(body);
          return Response.json({ model: 'dev', ...cancelAnswer(body.keys) });
        }
        return Response.json({ model: 'dev', queue: queued });
      }) as typeof fetch,
    }),
  });
  for (const who of ['writer', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('build_runs').where('request_id', 'like', `wechart-${MARK}%`).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', 'in', [ids.a, ids.c]).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

interface Row {
  key: string;
  name: string;
  folderId: string | null;
  folderPath: string[];
  partition: { start: string } | null;
  state: string;
  starter: { kind: string; name?: string };
  token: string | null;
  cancellable: boolean;
}
const listed = async (who: string) => {
  const answer = await as(who, { method: 'GET', url: '/api/jobs/queue' });
  return {
    status: answer.statusCode,
    rows: answer.statusCode === 200 ? answer.json<{ entries: Row[] }>().entries : [],
  };
};
const cancel = (who: string, key: string) =>
  as(who, { method: 'POST', url: '/api/jobs/queue/cancel', payload: { key } });
/** Stop, on a building entry (T554). */
const stop = (who: string, key: string) =>
  as(who, { method: 'POST', url: '/api/jobs/queue/cancel', payload: { key, stop: true } });

describe('the build queue (T376, AC-151, AC-297)', () => {
  it('lists the entries of the user’s folders, oldest first, each with who started it and its token', async () => {
    const mine = await started('a');
    const bySchedule = await started('a', {
      kind: 'schedule',
      id: `s-${MARK}`,
      name: 'Month-end close',
    });
    queued = [
      entry({
        key: 'k-later',
        addedAt: '2026-10-02T14:38:41.000Z',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
      entry({ key: 'k-worker', addedAt: '2026-10-02T14:31:02.000Z', status: 'processing' }),
      entry({ key: 'k-stalled', addedAt: '2026-10-02T14:12:30.000Z', stalled: true }),
      entry({
        key: 'k-query',
        addedAt: '2026-10-02T14:36:10.000Z',
        startedBy: 'query',
        partition: null,
      }),
      // Found by its job's token alone: xcube may know no request id.
      entry({
        key: 'k-schedule',
        addedAt: '2026-10-02T14:39:00.000Z',
        startedBy: 'jobs',
        job: bySchedule.token,
      }),
      // Another folder's: never the writer's to see.
      entry({ key: 'k-other', preAggregation: preAggIn('c') }),
    ];

    const { status, rows } = await listed('writer');

    expect(status).toBe(200);
    expect(
      rows.map((row) => [row.key, row.state, row.starter, row.token, row.cancellable]),
    ).toEqual([
      ['k-stalled', 'stalled', { kind: 'refresh-worker' }, null, false],
      ['k-worker', 'building', { kind: 'refresh-worker' }, null, false],
      ['k-query', 'queued', { kind: 'query' }, null, false],
      [
        'k-later',
        'queued',
        { kind: 'person', key: 'wren-key', name: 'Wren Writer' },
        mine.token,
        true,
      ],
      [
        'k-schedule',
        'queued',
        { kind: 'schedule', id: `s-${MARK}`, name: 'Month-end close' },
        bySchedule.token,
        true,
      ],
    ]);
    expect(rows[0]).toMatchObject({
      name: 'orders.by_month',
      folderId: ids.a,
      folderPath: ['Shared', `A ${MARK}`],
      partition: { start: '2026-08-01T00:00:00.000' },
    });
    // The other member's own folder; a reader has no queue.
    expect((await listed('many')).rows.map((row) => row.key)).toEqual(['k-other']);
    expect((await listed('reader')).status).toBe(403);
  });

  it('lists a cube marked public: false in its own folder, and a start found by its request id alone with its token', async () => {
    const mine = await started('a');
    queued = [
      // The refresh worker's build of a cube the model doesn't make public.
      entry({ key: 'k-hidden', preAggregation: `${xcubeIds.a}__secret.by_month` }),
      // xcube knows its request id, not yet its job.
      entry({ key: 'k-request', startedBy: 'jobs', requestId: mine.requestId, job: null }),
    ];

    const { rows } = await listed('writer');

    expect(rows.find((row) => row.key === 'k-hidden')).toMatchObject({
      folderId: ids.a,
      folderPath: ['Shared', `A ${MARK}`],
      name: 'orders.by_month',
    });
    expect(rows.find((row) => row.key === 'k-request')).toMatchObject({
      token: mine.token,
      cancellable: true,
    });
  });

  it('cancels a queued entry wechart started, by its key, and records the build cancelled, by whom', async () => {
    const mine = await started('a');
    queued = [
      entry({ key: 'k-mine', startedBy: 'jobs', requestId: mine.requestId, job: mine.token }),
    ];
    cancels.length = 0;

    const answer = await cancel('writer', 'k-mine');

    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json()).toEqual({ cancelled: true });
    expect(cancels).toEqual([{ keys: ['k-mine'], processing: false }]);
    const me = (await as('writer', { method: 'GET', url: '/api/me' })).json<{ name: string }>();
    expect(await history().get(mine.runId)).toMatchObject({
      outcome: 'cancelled',
      cancelledBy: { key: expect.any(String), name: me.name },
    });
    const record = await history().get(mine.runId);
    expect(record?.tokens[0]).toMatchObject({ status: 'cancelled', finished: true });
  });

  it('records the cancel though the follower ends the job, missing its partition, as xcube takes it out', async () => {
    const mine = await started('a');
    queued = [
      entry({ key: 'k-raced', startedBy: 'jobs', requestId: mine.requestId, job: mine.token }),
    ];
    // As xcube cancels, the follower asks Cube, which no longer has the job
    // queued and reads its partition missing; the round closes the build.
    await history().seen({
      runId: mine.runId,
      token: mine.token,
      previous: null,
      status: 'missing_partition',
      at: new Date(Date.now() + 1_000),
      final: true,
    });
    await history().close(mine.runId);
    expect((await history().get(mine.runId))?.outcome).toBe('failed');

    const answer = await cancel('writer', 'k-raced');

    expect(answer.json()).toEqual({ cancelled: true });
    expect(await history().get(mine.runId)).toMatchObject({
      outcome: 'cancelled',
      failedCount: 0,
      error: null,
    });
  });

  it('refuses to cancel what wechart didn’t start, or another folder’s, before xcube is asked', async () => {
    const theirs = await started('c');
    queued = [
      entry({ key: 'k-worker' }),
      entry({ key: 'k-query', startedBy: 'query' }),
      entry({
        key: 'k-theirs',
        preAggregation: preAggIn('c'),
        startedBy: 'jobs',
        requestId: theirs.requestId,
        job: theirs.token,
      }),
    ];
    cancels.length = 0;

    for (const key of ['k-worker', 'k-query', 'k-theirs'])
      expect((await cancel('writer', key)).statusCode).toBe(403);
    expect((await cancel('reader', 'k-theirs')).statusCode).toBe(403);
    expect(cancels).toEqual([]);
  });

  it('says a cancel didn’t happen when the entry had started building, or had left the queue', async () => {
    const building = await started('a');
    const gone = await started('a');
    queued = [
      entry({
        key: 'k-building',
        startedBy: 'jobs',
        requestId: building.requestId,
        job: building.token,
      }),
      entry({ key: 'k-gone', startedBy: 'jobs', requestId: gone.requestId, job: gone.token }),
    ];
    cancelAnswer = (keys) => ({
      cancelled: [],
      notCancelled: keys.map((key) => ({
        key,
        reason: key === 'k-building' ? 'processing' : 'gone',
      })),
    });

    expect((await cancel('writer', 'k-building')).json()).toEqual({
      cancelled: false,
      reason: 'processing',
      message: 'Not cancelled: it had started building.',
    });
    expect((await cancel('writer', 'k-gone')).json()).toEqual({
      cancelled: false,
      reason: 'gone',
      message: 'Not cancelled: it had already left the queue.',
    });
    // Nothing recorded as cancelled for either.
    expect((await history().get(building.runId))?.outcome).toBe(null);
    // One no longer in the queue at all is said gone without asking xcube.
    cancels.length = 0;
    expect((await cancel('writer', 'k-nowhere')).json()).toMatchObject({
      cancelled: false,
      reason: 'gone',
    });
    expect(cancels).toEqual([]);
  });
});

/**
 * T554 (AC-394; design 16, P1): Stop, on a building entry wechart started,
 * has xcube take it out with `processing: true`. xcube stops the build, keeps
 * none of it, and answers what came of it: stopped, failed of its own, still
 * stopping, or `finished`, its version standing (research
 * `xcube-74c933bdb8.md`). Run history records a stopped one cancelled while
 * building, by whom, and the trail a Build cancelled (AC-294). An entry the
 * refresh worker or a query started has no Stop, and is refused before xcube
 * is asked.
 */
/** xcube's failure for a job it stopped, as Cube's jobs API reports it (research xcube-74c933bdb8.md). */
const STOPPED =
  'failure: xcube stopped this build: it was cancelled while building, and none of it is kept';
const answeredStop = (build: string) => (keys: string[]) => ({
  cancelled: keys.map((key) => ({ key, preAggregation: 'x', status: 'processing', build })),
  notCancelled: [],
});
describe('stopping a building build wechart started (T554, AC-394)', () => {
  it('offers Stop on a building entry wechart started, and on no other', async () => {
    const mine = await started('a');
    const waiting = await started('a');
    queued = [
      entry({
        key: 'k-building',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
      entry({
        key: 'k-waiting',
        startedBy: 'jobs',
        requestId: waiting.requestId,
        job: waiting.token,
      }),
      entry({ key: 'k-worker-building', status: 'processing' }),
      entry({ key: 'k-query-building', status: 'processing', startedBy: 'query' }),
    ];

    const { rows } = await listed('writer');

    expect(
      rows.map((row) => [
        row.key,
        row.state,
        row.cancellable,
        (row as { stoppable?: boolean }).stoppable,
      ]),
    ).toEqual([
      ['k-building', 'building', false, true],
      ['k-waiting', 'queued', true, false],
      ['k-worker-building', 'building', false, false],
      ['k-query-building', 'building', false, false],
    ]);
  });

  it('stops it through xcube’s cancel of a processing entry, recorded cancelled while building, by whom, and in the trail', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-stop',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancels.length = 0;
    cancelAnswer = answeredStop('stopped');

    const answer = await stop('writer', 'k-stop');

    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json()).toEqual({ cancelled: true, build: 'stopped' });
    expect(cancels).toEqual([{ keys: ['k-stop'], processing: true }]);
    const me = (await as('writer', { method: 'GET', url: '/api/me' })).json<{ name: string }>();
    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledBy?.name, record?.cancelledWhileBuilding]).toEqual([
      'cancelled',
      me.name,
      true,
    ]);
    // And in Run history's list, as its row reads it.
    const listedBuild = (
      await history().list({ within: undefined, filters: { preAggregation: preAggIn('a') } })
    ).records.find((each) => each.id === mine.runId);
    expect(listedBuild?.cancelledWhileBuilding).toBe(true);
    // The trail's Build cancelled, with the partition and its state then (AC-294).
    const [kept] = (
      await auditStore(getDb()).list({ events: ['build-cancelled'], folderIds: [ids.a] })
    ).records.filter((each) => each.details?.['runId'] === mine.runId);
    expect([kept?.summary, kept?.details?.['state'], kept?.details?.['build']]).toEqual([
      'Building · Aug 2026',
      'building',
      'stopped',
    ]);
  });

  it('records the stop though the follower first ends the job with xcube’s failure for it', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-raced-stop',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancelAnswer = answeredStop('stopped');
    // While xcube's answer waits on the stop, the follower sees the job end
    // with xcube's failure, and the round closes the build.
    await history().seen({
      runId: mine.runId,
      token: mine.token,
      previous: null,
      status: STOPPED,
      at: new Date(Date.now() + 1_000),
      final: true,
    });
    await history().close(mine.runId);

    expect((await stop('writer', 'k-raced-stop')).json()).toEqual({
      cancelled: true,
      build: 'stopped',
    });
    const record = await history().get(mine.runId);
    expect([
      record?.outcome,
      record?.cancelledWhileBuilding,
      record?.cancelledBy === null,
      record?.error,
    ]).toEqual(['cancelled', true, false, null]);
  });

  it('reads xcube’s failure for a build it stopped as cancelled while building, whoever stopped it', async () => {
    const mine = await started('a');
    await history().seen({
      runId: mine.runId,
      token: mine.token,
      previous: null,
      status: STOPPED,
      at: new Date(),
      final: true,
    });
    await history().close(mine.runId);

    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledWhileBuilding, record?.failedCount]).toEqual([
      'cancelled',
      true,
      0,
    ]);
  });

  it('says a stop still under way, and records who asked once the build reads stopped', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-stopping',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancelAnswer = answeredStop('stopping');

    expect((await stop('writer', 'k-stopping')).json()).toEqual({
      cancelled: true,
      build: 'stopping',
    });
    // Still open: how it ends is Cube's to say.
    expect((await history().get(mine.runId))?.outcome).toBe(null);
    // Then Cube's jobs API says xcube stopped it.
    await history().seen({
      runId: mine.runId,
      token: mine.token,
      previous: null,
      status: STOPPED,
      at: new Date(),
      final: true,
    });
    await history().close(mine.runId);
    const me = (await as('writer', { method: 'GET', url: '/api/me' })).json<{ name: string }>();
    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledWhileBuilding, record?.cancelledBy?.name]).toEqual([
      'cancelled',
      true,
      me.name,
    ]);
  });

  it('names no stopper where a stop still under way ended with the build’s own end', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-stopping-done',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancelAnswer = answeredStop('stopping');
    await stop('writer', 'k-stopping-done');
    await history().seen({
      runId: mine.runId,
      token: mine.token,
      previous: null,
      status: 'done',
      at: new Date(),
      final: true,
    });
    await history().close(mine.runId);

    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledBy, record?.cancelledWhileBuilding]).toEqual([
      'done',
      null,
      false,
    ]);
  });

  it('leaves a build that had failed of its own to its failure, said so', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-failed',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancelAnswer = answeredStop('failed');

    expect((await stop('writer', 'k-failed')).json()).toEqual({ cancelled: true, build: 'failed' });
    // Not recorded as a stop: the follower records Cube's own failure.
    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledBy]).toEqual([null, null]);
  });

  it('says a build had finished before the stop reached it, its version standing, and records no stop', async () => {
    const mine = await started('a');
    queued = [
      entry({
        key: 'k-finished',
        status: 'processing',
        startedBy: 'jobs',
        requestId: mine.requestId,
        job: mine.token,
      }),
    ];
    cancelAnswer = (keys) => ({
      cancelled: [],
      notCancelled: keys.map((key) => ({ key, reason: 'finished' })),
    });

    expect((await stop('writer', 'k-finished')).json()).toEqual({
      cancelled: false,
      reason: 'finished',
      message: 'Not stopped: it had finished building, and its version stands.',
    });
    const record = await history().get(mine.runId);
    expect([record?.outcome, record?.cancelledBy]).toEqual([null, null]);
    const trail = (
      await auditStore(getDb()).list({ events: ['build-cancelled'], folderIds: [ids.a] })
    ).records.filter((each) => each.details?.['runId'] === mine.runId);
    expect(trail).toEqual([]);
  });

  it('keeps a cancel of a queued entry not while building', async () => {
    const mine = await started('a');
    queued = [
      entry({ key: 'k-queued', startedBy: 'jobs', requestId: mine.requestId, job: mine.token }),
    ];
    cancelAnswer = (keys) => ({
      cancelled: keys.map((key) => ({ key, preAggregation: 'x', status: 'queued' })),
      notCancelled: [],
    });

    expect((await cancel('writer', 'k-queued')).json()).toEqual({ cancelled: true });
    expect((await history().get(mine.runId))?.cancelledWhileBuilding).toBe(false);
  });

  it('refuses Stop on what the refresh worker or a query started, or another folder’s, before xcube is asked', async () => {
    const theirs = await started('c');
    queued = [
      entry({ key: 'k-worker-building', status: 'processing' }),
      entry({ key: 'k-query-building', status: 'processing', startedBy: 'query' }),
      entry({
        key: 'k-theirs-building',
        status: 'processing',
        preAggregation: preAggIn('c'),
        startedBy: 'jobs',
        requestId: theirs.requestId,
        job: theirs.token,
      }),
    ];
    cancels.length = 0;

    for (const key of ['k-worker-building', 'k-query-building', 'k-theirs-building'])
      expect((await stop('writer', key)).statusCode, key).toBe(403);
    // Said as a stop, not a cancel (T554's review).
    expect((await stop('writer', 'k-worker-building')).json()).toEqual({
      error: 'Only builds wechart started, from Jobs or a schedule, can be stopped here.',
    });
    expect(cancels).toEqual([]);
  });
});
