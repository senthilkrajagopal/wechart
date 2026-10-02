import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { buildServer } from '../server';
import { xcubePartitions } from '../xcube/partitions';
import { xcubeQueue, type QueueEntry } from '../xcube/queue';

/**
 * T375 / AC-145: a rollup's partitions in Jobs — every one Cube derives from
 * its build range, in UTC, newest first, each with its period, its state and
 * when Cube last built it. Built and not built come from xcube's partitions
 * route, building, queued and stalled from its queue (T376), and failed only
 * from a build wechart started, while no newer version has replaced it,
 * naming the build it still serves. A rollup that isn't partitioned is one
 * row, the whole pre-aggregation; a lambda or a rollup join names the
 * rollups it is built from. Rebuild selected posts one jobs request per
 * partition, its `dateRange` at the partition's start as a UTC wall-clock
 * string (research cube/system-partitions.md, "Jobs-API rebuild of one
 * partition"); Build all posts one for the whole; either is one start (T372).
 *
 * `writer` (`sales-rw`) writes /A; `reader` (`sales-ro`) reads it; `many`
 * (`g01`) writes /C.
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

const MARK = `parts${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const history = () => buildHistory(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let folderA = '';
let xcubeA = '';
let app: FastifyInstance;

/** What xcube's partitions route and queue answer, and each jobs post. */
let items: unknown[] = [];
let queued: QueueEntry[] = [];
const posted: { selector: Record<string, unknown>; requestId: string | null }[] = [];
/** Starts Cube's jobs API refuses: no partition meets them any more. */
let refusedStarts: string[] = [];

const byMonth = () => `${xcubeA}__orders.by_month`;
const whole = () => `${xcubeA}__orders.whole`;
const recent = () => `${xcubeA}__orders.recent`;
const table = (month: string) => `prod_pre_aggregations.orders_by_month2026${month}01`;
const at = (iso: string) => new Date(iso).getTime();

const partition = (month: string, versions: string[]) => ({
  tableName: table(month),
  timezone: 'UTC',
  buildRangeStart: `2026-${month}-01T00:00:00.000`,
  buildRangeEnd: `2026-${month}-28T23:59:59.999`,
  versionEntries: versions.map((iso) => ({ table_name: table(month), last_updated_at: at(iso) })),
});
const itemOf = (id: string, type: string, partitions: unknown[], granularity?: string) => ({
  errors: [],
  timezones: ['UTC'],
  preAggregation: {
    id,
    preAggregation: {
      type,
      ...(granularity === undefined ? {} : { partitionGranularity: granularity }),
    },
  },
  partitions,
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

beforeAll(async () => {
  folderA = randomUUID();
  made.push({ kind: 'folder', id: folderA });
  await docs().create({
    kind: 'folder',
    id: folderA,
    body: {
      owner: 'admin',
      title: `A ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  xcubeA = `f${folderA.replaceAll('-', '')}`;
  // `many`'s own folder, so it uses Jobs, elsewhere.
  const folderC = randomUUID();
  made.push({ kind: 'folder', id: folderC });
  await docs().create({
    kind: 'folder',
    id: folderC,
    body: {
      owner: 'admin',
      title: `C ${MARK}`,
      folderId: 'root',
      access: { readOnly: [], readWrite: ['g01'] },
    },
  });
  // The folder's model, as wechart keeps it: the lambda names the rollups it combines.
  await modelFileStore(getDb()).write([
    {
      folderId: folderA,
      path: `cubes/orders_${MARK}.yml`,
      content: [
        'cubes:',
        '  - name: orders',
        '    sql_table: public.orders',
        '    pre_aggregations:',
        '      - name: by_month',
        '        type: rollup',
        '      - name: whole',
        '        type: rollup',
        '      - name: recent',
        '        type: rollup_lambda',
        '        rollups: [CUBE.by_month, orders.whole]',
        '',
      ].join('\n'),
    },
  ]);
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/v1/meta'))
        return Response.json({
          cubes: [
            {
              name: `${xcubeA}__orders`,
              meta: { xcube: { folderId: xcubeA, shortName: 'orders' } },
              preAggregations: [
                { name: 'by_month', type: 'rollup', partitionGranularity: 'month' },
                { name: 'whole', type: 'rollup' },
                { name: 'recent', type: 'rollupLambda' },
              ],
            },
          ],
        });
      if (path.endsWith('/v1/pre-aggregations/jobs')) {
        const body = JSON.parse(String(init?.body)) as {
          action: string;
          selector: Record<string, unknown>;
        };
        // A start no partition meets any more, as Cube refuses one
        // (research cube/system-partitions.md, "What comes back").
        const range = body.selector['dateRange'] as string[] | undefined;
        if (range !== undefined && refusedStarts.includes(range[0] ?? ''))
          return Response.json(
            {
              error:
                "A user's selector doesn't match any of the pre-aggregations defined in the data model.",
            },
            { status: 400 },
          );
        posted.push({
          selector: body.selector,
          requestId: new Headers(init?.headers).get('x-request-id'),
        });
        return Response.json([`${MARK}-token-${String(posted.length)}`]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch,
  });
  const stub = (async (url: string) =>
    new URL(url).pathname.endsWith('/partitions')
      ? Response.json({ preAggregationPartitions: items })
      : Response.json({ model: 'dev', queue: queued })) as typeof fetch;
  app = buildServer({
    config: secured,
    cube: client,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [folderA, xcubeA],
      ]),
      parents: new Map([
        ['root', null],
        [folderA, 'root'],
      ]),
    }),
    buildHistory: history(),
    buildQueue: xcubeQueue({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 't',
      fetch: stub,
    }),
    buildPartitions: xcubePartitions({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 't',
      fetch: stub,
      askAgainAfterMs: 0,
    }),
  });
  for (const who of ['writer', 'many', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('build_runs').where('pre_aggregation', 'like', `${xcubeA}__%`).execute();
  await getDb().deleteFrom('model_files').where('path', '=', `cubes/orders_${MARK}.yml`).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

interface Partition {
  start: string | null;
  state: string;
  lastBuiltAt: string | null;
  failed?: { at: string; serving: string | null };
}
const partitionsOf = async (who: string, id: string) => {
  const answer = await as(who, {
    method: 'GET',
    url: `/api/jobs/partitions?preagg=${encodeURIComponent(id)}`,
  });
  return { status: answer.statusCode, body: answer.json<Record<string, unknown>>() };
};

describe('a rollup’s partitions (T375, AC-145)', () => {
  it('lists every partition, newest first, each with its state and when Cube last built it', async () => {
    items = [
      itemOf(
        byMonth(),
        'rollup',
        [
          partition('01', ['2026-10-02T14:01:00Z', '2026-10-01T14:01:00Z']),
          partition('02', []),
          partition('03', ['2026-10-02T14:01:00Z']),
          partition('04', []),
          partition('05', ['2026-10-02T13:00:00Z']),
        ],
        'month',
      ),
    ];
    queued = [
      {
        key: 'k-building',
        dataSource: 'default',
        preAggregation: byMonth(),
        table: table('03'),
        targetTable: `${table('03')}_a_b_c`,
        partition: { start: '2026-03-01T00:00:00.000', end: '2026-03-28T23:59:59.999' },
        status: 'processing',
        stalled: false,
        addedAt: '2026-10-02T14:31:00.000Z',
        requestId: null,
        startedBy: 'scheduler',
        job: null,
      },
      {
        key: 'k-queued',
        dataSource: 'default',
        preAggregation: byMonth(),
        table: table('02'),
        targetTable: `${table('02')}_a_b_c`,
        partition: { start: '2026-02-01T00:00:00.000', end: '2026-02-28T23:59:59.999' },
        status: 'queued',
        stalled: false,
        addedAt: '2026-10-02T14:38:00.000Z',
        requestId: null,
        startedBy: 'scheduler',
        job: null,
      },
      {
        key: 'k-stalled',
        dataSource: 'default',
        preAggregation: byMonth(),
        table: table('04'),
        targetTable: `${table('04')}_a_b_c`,
        partition: { start: '2026-04-01T00:00:00.000', end: '2026-04-28T23:59:59.999' },
        status: 'queued',
        stalled: true,
        addedAt: '2026-10-02T14:12:00.000Z',
        requestId: null,
        startedBy: 'scheduler',
        job: null,
      },
    ];

    const { status, body } = await partitionsOf('writer', byMonth());

    expect(status).toBe(200);
    expect(body).toMatchObject({ id: byMonth(), name: 'orders.by_month', kind: 'partitioned' });
    expect(
      (body['partitions'] as Partition[]).map((each) => [each.start, each.state, each.lastBuiltAt]),
    ).toEqual([
      ['2026-05-01T00:00:00.000', 'built', '2026-10-02T13:00:00.000Z'],
      ['2026-04-01T00:00:00.000', 'stalled', null],
      ['2026-03-01T00:00:00.000', 'building', '2026-10-02T14:01:00.000Z'],
      ['2026-02-01T00:00:00.000', 'queued', null],
      ['2026-01-01T00:00:00.000', 'built', '2026-10-02T14:01:00.000Z'],
    ]);
  });

  it('reads failed only after a build wechart started failed and nothing has built it since, naming what it serves', async () => {
    items = [
      itemOf(
        byMonth(),
        'rollup',
        [partition('06', ['2026-10-02T14:01:00Z']), partition('07', ['2026-10-02T16:00:00Z'])],
        'month',
      ),
    ];
    queued = [];
    // Both rebuilt from Jobs at 14:05 and failed; July's built again since, by anyone.
    for (const month of ['06', '07']) {
      const token = `${MARK}-failed-${month}`;
      const runId = await history().start({
        preAggregation: byMonth(),
        folderId: folderA,
        partitions: [`2026-${month}-01T00:00:00.000`],
        granularity: 'month',
        via: 'rebuild-selected',
        starter: { kind: 'person', key: 'wren', name: 'Wren Writer' },
        requestId: `wechart-${MARK}-${month}`,
        tokens: [token],
        startedAt: new Date('2026-10-02T14:05:12Z'),
        answeredAt: new Date('2026-10-02T14:05:12Z'),
      });
      await history().seen({
        runId,
        token,
        previous: null,
        status: 'failure: canceling statement due to statement timeout',
        table: `${table(month)}_x_y_1d4k`,
        at: new Date('2026-10-02T14:05:53Z'),
        final: true,
      });
    }

    const { body } = await partitionsOf('writer', byMonth());

    const [july, june] = body['partitions'] as Partition[];
    expect(july).toMatchObject({ state: 'built' });
    expect(june).toMatchObject({
      state: 'failed',
      failed: { at: '2026-10-02T14:05:53.000Z', serving: '2026-10-02T14:01:00.000Z' },
    });
  });

  /** A start of one partition from Jobs, seen by the follower at `endedAt` in `status`. */
  const ran = async (month: string, startedAt: string, status: string, final = true) => {
    const token = `${MARK}-ran-${month}-${startedAt}`;
    const runId = await history().start({
      preAggregation: byMonth(),
      folderId: folderA,
      partitions: [`2026-${month}-01T00:00:00.000`],
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
      status,
      table: `${table(month)}_x_y_${String(at(startedAt))}`,
      at: new Date(new Date(startedAt).getTime() + 40_000),
      final,
    });
    return { runId, token };
  };

  it('reads neither a build Cube merged into another, nor one a later build of wechart’s followed, as failed', async () => {
    items = [
      itemOf(
        byMonth(),
        'rollup',
        [partition('08', ['2026-10-02T14:01:00Z']), partition('09', ['2026-10-02T14:01:00Z'])],
        'month',
      ),
    ];
    queued = [];
    // September, rebuilt at 14:20 while Cube's queue held a build of it: its
    // job, merged into that one, reads missing_partition, and the version that
    // build made is stamped before wechart's start (research
    // cube/job-records.md, "Queue de-duplication makes a job report
    // `missing_partition`"; cube/system-partitions.md, "Build state and versions").
    await ran('09', '2026-10-02T14:20:00Z', 'missing_partition');
    // August failed at 14:05; rebuilt at 14:20, that build was cancelled: its
    // latest build didn't fail.
    await ran(
      '08',
      '2026-10-02T14:05:00Z',
      'failure: canceling statement due to statement timeout',
    );
    const later = await ran('08', '2026-10-02T14:20:00Z', 'scheduled', false);
    await history().cancelled({
      ...later,
      by: { key: 'wren', name: 'Wren Writer' },
      at: new Date('2026-10-02T14:21:00Z'),
      askedAt: new Date('2026-10-02T14:21:00Z'),
    });

    const { body } = await partitionsOf('writer', byMonth());

    expect((body['partitions'] as Partition[]).map((each) => [each.start, each.state])).toEqual([
      ['2026-09-01T00:00:00.000', 'built'],
      ['2026-08-01T00:00:00.000', 'built'],
    ]);
  });

  it('answers that Cube is still working the partitions out, never that there are none (A4)', async () => {
    // Its item missing from every answer: Cube's "Continue wait" (xcube-slice-6.md, Gotcha 11).
    items = [];
    queued = [];

    const { status, body } = await partitionsOf('writer', byMonth());

    expect(status).toBe(503);
    expect(body).toMatchObject({ pending: true });
    expect(body['partitions']).toBeUndefined();
  });

  it('shows a rollup that isn’t partitioned as one row, the whole pre-aggregation', async () => {
    items = [
      itemOf(whole(), 'rollup', [
        {
          tableName: 'prod_pre_aggregations.orders_whole',
          timezone: 'UTC',
          versionEntries: [{ last_updated_at: at('2026-10-01T16:20:00Z') }],
        },
      ]),
    ];
    queued = [];

    const { body } = await partitionsOf('writer', whole());

    expect(body).toMatchObject({
      kind: 'whole',
      partitions: [{ start: null, state: 'built', lastBuiltAt: '2026-10-01T16:20:00.000Z' }],
    });
  });

  it('names the rollups a lambda is built from, with no partitions of its own', async () => {
    items = [itemOf(recent(), 'rollupLambda', [])];

    const { body } = await partitionsOf('writer', recent());

    expect(body).toMatchObject({
      kind: 'combined',
      partitions: [],
      builtFrom: [
        { id: byMonth(), name: 'orders.by_month' },
        { id: whole(), name: 'orders.whole' },
      ],
    });
  });

  it('answers another folder’s, or one that doesn’t exist, as Not found, and a reader with no Jobs', async () => {
    expect((await partitionsOf('many', byMonth())).status).toBe(404);
    expect((await partitionsOf('writer', `${xcubeA}__orders.nothing`)).status).toBe(404);
    expect((await partitionsOf('reader', byMonth())).status).toBe(403);
  });
});

describe('rebuilding a rollup’s partitions (T375, AC-145)', () => {
  it('posts one jobs request per selected partition, at its start, and records one start', async () => {
    posted.length = 0;
    const starts = ['2026-08-01T00:00:00.000', '2026-09-01T00:00:00.000'];

    const answer = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: byMonth(), partitions: starts },
    });

    expect(answer.statusCode, answer.body).toBe(200);
    expect(posted.map((each) => each.selector['dateRange'])).toEqual(
      starts.map((start) => [start, start]),
    );
    expect(posted.map((each) => each.selector['preAggregations'])).toEqual([
      [byMonth()],
      [byMonth()],
    ]);
    // One request id across the start, so the queue's entries name it (T376).
    expect(new Set(posted.map((each) => each.requestId)).size).toBe(1);
    const record = await history().get((answer.json() as { runId: string }).runId);
    expect(record).toMatchObject({
      via: 'rebuild-selected',
      partitions: starts,
      granularity: 'month',
    });
    expect(record?.tokens).toHaveLength(2);
  });

  it('records what Cube started when it refuses some of the partitions, and says which', async () => {
    posted.length = 0;
    const starts = [
      '2026-09-01T00:00:00.000',
      '2026-08-01T00:00:00.000',
      '2026-07-01T00:00:00.000',
    ];
    refusedStarts = ['2026-08-01T00:00:00.000'];
    try {
      const answer = await as('writer', {
        method: 'POST',
        url: '/api/builds',
        payload: { preAggregation: byMonth(), partitions: starts },
      });

      // The others still asked for, and what started recorded: never left running unrecorded.
      expect(answer.statusCode, answer.body).toBe(200);
      const body = answer.json<{
        runId: string;
        tokens: string[];
        notStarted: { start: string; error: string }[];
      }>();
      expect(posted.map((each) => (each.selector['dateRange'] as string[])[0])).toEqual([
        '2026-09-01T00:00:00.000',
        '2026-07-01T00:00:00.000',
      ]);
      expect(body.tokens).toHaveLength(2);
      expect(body.notStarted).toEqual([
        {
          start: '2026-08-01T00:00:00.000',
          error:
            "A user's selector doesn't match any of the pre-aggregations defined in the data model.",
        },
      ]);
      expect(await history().get(body.runId)).toMatchObject({
        partitions: ['2026-09-01T00:00:00.000', '2026-07-01T00:00:00.000'],
        via: 'rebuild-selected',
      });

      // Every one refused: nothing started, and Cube's refusal is the answer.
      posted.length = 0;
      refusedStarts = [...starts];
      const none = await as('writer', {
        method: 'POST',
        url: '/api/builds',
        payload: { preAggregation: byMonth(), partitions: starts },
      });
      expect(none.statusCode).toBe(400);
      expect(posted).toEqual([]);
    } finally {
      refusedStarts = [];
    }
  });

  it('asks for each partition once, however many times it’s named, with no cap of its own', async () => {
    posted.length = 0;
    // A day-partitioned rollup's select-all over two years and more.
    const days = Array.from({ length: 800 }, (_, n) =>
      new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().replace('Z', ''),
    );

    const answer = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: byMonth(), partitions: [...days, days[0], days[1]] },
    });

    expect(answer.statusCode, answer.body).toBe(200);
    expect(posted).toHaveLength(800);
    const record = await history().get((answer.json() as { runId: string }).runId);
    expect(record?.partitions).toEqual(days);
  });

  it('builds every partition in one request, with Build all', async () => {
    posted.length = 0;

    const answer = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: byMonth() },
    });

    expect(answer.statusCode).toBe(200);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.selector['dateRange']).toBeUndefined();
  });

  it('refuses to build a lambda itself, before asking Cube: its rollups are what’s built', async () => {
    posted.length = 0;

    const answer = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: recent() },
    });

    expect(answer.statusCode).toBe(400);
    expect(posted).toEqual([]);
  });

  it('refuses a partition that isn’t a start Cube gives, before asking Cube', async () => {
    posted.length = 0;
    for (const partitions of [['2026-08-01'], ['not a date'], [], ['2026-08-01T00:00:00.000Z']]) {
      const answer = await as('writer', {
        method: 'POST',
        url: '/api/builds',
        payload: { preAggregation: byMonth(), partitions },
      });
      expect(answer.statusCode).toBe(400);
    }
    expect(posted).toEqual([]);
  });
});
