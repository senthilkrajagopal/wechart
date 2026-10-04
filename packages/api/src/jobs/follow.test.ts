import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { buildServer } from '../server';
import { buildFollower, startFollowingBuilds } from './follow';

/**
 * T372 / AC-150: a build wechart starts is recorded once per start and
 * followed by the API to its end — with no browser open, and again after a
 * restart — and two followers on one database follow each token once
 * (AC-319; research cube/ha-topology.md, table row 5). Its outcome is done;
 * failed, with how many partitions failed and Cube's error; or Cube's record
 * expired, which is neither. Its log keeps each state Cube reported, per
 * token, with the time wechart saw it; its duration runs from its start to
 * its last token's end.
 *
 * Against a stub Cube answering the jobs API as research cube/job-records.md
 * describes it, and the real Postgres.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  port: 4100,
  modelDir: '',
};

/** Unique per test file, so a leftover from another run is never ours. */
const tag = randomUUID().slice(0, 8);
const cubeName = `fx${tag}__orders`;
const PRE_AGGREGATION = `${cubeName}.by_month`;

afterAll(async () => {
  await getDb().deleteFrom('build_runs').where('pre_aggregation', '=', PRE_AGGREGATION).execute();
  await closeDb();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A clock the test moves. */
function clock(start: string) {
  let at = new Date(start).getTime();
  return {
    now: () => new Date(at),
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/**
 * Cube's jobs API: a post answers `tokens` (after `onPost`), and each
 * token's state is what `states` holds when it is asked. A `get` naming a
 * token in `broken` fails, as one whose context no longer compiles fails its
 * whole batch (research cube/job-records.md, "`action: get`"). Every ask is
 * kept, as is each post's `x-request-id`.
 */
function stubCube(
  tokens: readonly string[],
  {
    onPost = () => undefined,
    broken = new Set<string>(),
    metaFails = false,
  }: { onPost?: () => void; broken?: ReadonlySet<string>; metaFails?: boolean } = {},
) {
  const states = new Map<string, { status: string; table?: string }>();
  const asked: string[][] = [];
  const posted: { requestId: string | undefined; body: Record<string, unknown> }[] = [];
  const cube = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: config.cubeApiSecret,
    securityContext: config.securityContext,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/v1/meta'))
        return metaFails
          ? json({ error: 'xcube didn’t answer' }, 502)
          : json({
              cubes: [
                {
                  name: cubeName,
                  preAggregations: [
                    { name: 'by_month', type: 'rollup', partitionGranularity: 'month' },
                  ],
                },
              ],
            });
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (body['action'] === 'post') {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        posted.push({ requestId: headers['x-request-id'], body });
        onPost();
        return json(tokens);
      }
      const wanted = body['tokens'] as string[];
      asked.push(wanted);
      if (wanted.some((token) => broken.has(token)))
        return json({ error: 'Error: the model doesn’t compile' }, 500);
      return json(
        wanted.map((token) => {
          const state = states.get(token) ?? { status: 'not_found' };
          return state.status === 'not_found'
            ? { token, status: 'not_found' }
            : {
                token,
                status: state.status,
                ...(state.table === undefined ? {} : { table: state.table }),
                selector: { preAggregations: [PRE_AGGREGATION] },
              };
        }),
      );
    }) as typeof fetch,
  });
  return { cube, states, asked, posted };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const newTokens = (n: number) => Array.from({ length: n }, () => `${tag}-${randomUUID()}`);

/** Starts a build through the API, as Jobs does; answers the API's answer. */
async function post(stub: ReturnType<typeof stubCube>, now: () => Date) {
  const app = buildServer({ config, cube: stub.cube, buildHistory: buildHistory(getDb()), now });
  const response = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { preAggregation: PRE_AGGREGATION },
  });
  await app.close();
  return response;
}

/** Starts a build through the API, as Jobs does, and answers its record's id. */
async function started(stub: ReturnType<typeof stubCube>, now: () => Date) {
  const response = await post(stub, now);
  expect(response.statusCode).toBe(200);
  return (response.json() as { runId: string }).runId;
}

const followerOf = (stub: ReturnType<typeof stubCube>, now: () => Date) =>
  buildFollower({ history: buildHistory(getDb()), cube: stub.cube, now });

/** The record's jobs' states, in Cube's order. */
const statesOf = async (runId: string) =>
  ((await buildHistory(getDb()).get(runId))?.tokens ?? []).map((each) =>
    each.log.map((entry) => entry.status),
  );

describe('a build started from Jobs (T372, AC-150)', () => {
  it('is recorded once, with its pre-aggregation, folder, partitions, starter, request id and tokens', async () => {
    const tokens = newTokens(2);
    const time = clock('2026-10-02T14:05:12.204Z');
    // Cube takes a moment to answer the post.
    const stub = stubCube(tokens, { onPost: () => time.advance(187) });

    const runId = await started(stub, time.now);

    const record = await buildHistory(getDb()).get(runId);
    expect(stub.posted).toHaveLength(1);
    const requestId = stub.posted[0]!.requestId;
    expect(requestId).toMatch(/^wechart-/);
    expect(record).toMatchObject({
      preAggregation: PRE_AGGREGATION,
      // No `meta.xcube`: the root's (T371).
      folderId: 'root',
      // Every partition: the whole pre-aggregation was asked for.
      partitions: null,
      granularity: 'month',
      via: 'build-all',
      // With sign-in off, the one user (AC-254).
      starter: { kind: 'person', key: 'admin', name: 'admin' },
      requestId,
      startedAt: new Date('2026-10-02T14:05:12.204Z'),
      answeredAt: new Date('2026-10-02T14:05:12.391Z'),
      outcome: null,
    });
    expect(record?.tokens.map((each) => each.token)).toEqual(tokens);
    const rows = await getDb()
      .selectFrom('build_runs')
      .select('id')
      .where('request_id', '=', requestId!)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('finds its folder before asking Cube, so a failure there starts no build unrecorded', async () => {
    const stub = stubCube(newTokens(1), { metaFails: true });

    const response = await post(stub, () => new Date());

    expect(response.statusCode).toBe(502);
    expect(stub.posted).toEqual([]);
  });

  it('records nothing for a start that made no job', async () => {
    const stub = stubCube([]);

    const response = await post(stub, () => new Date());

    expect(response.json()).toEqual({ tokens: [] });
    const rows = await getDb()
      .selectFrom('build_runs')
      .select('id')
      .where('request_id', '=', stub.posted[0]!.requestId!)
      .execute();
    expect(rows).toEqual([]);
  });
});

describe('following a build on the server (T372, AC-150, AC-319)', () => {
  it('follows every token to its end with no browser asking, keeping each state with when it was seen', async () => {
    const tokens = newTokens(2);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T14:05:12.000Z');
    const runId = await started(stub, time.now);
    const follower = followerOf(stub, time.now);
    const table = (n: number) => `prod_pre_aggregations.orders_by_month2026080${String(n)}_a_b_c`;

    for (const token of tokens) stub.states.set(token, { status: 'scheduled' });
    time.advance(1_000);
    await follower.once();
    stub.states.set(tokens[0]!, { status: 'processing', table: table(1) });
    stub.states.set(tokens[1]!, { status: 'processing', table: table(2) });
    time.advance(2_000);
    await follower.once();
    stub.states.set(tokens[0]!, { status: 'done', table: table(1) });
    time.advance(2_000);
    await follower.once();
    stub.states.set(tokens[1]!, { status: 'done', table: table(2) });
    time.advance(7_000);
    await follower.once();

    const record = await buildHistory(getDb()).get(runId);
    expect(record).toMatchObject({
      outcome: 'done',
      failedCount: 0,
      error: null,
      // From the start to the last token's end, as wechart saw it.
      endedAt: new Date('2026-10-02T14:05:24.000Z'),
      durationMs: 12_000,
    });
    expect(record?.tokens[0]?.log).toEqual([
      { at: new Date('2026-10-02T14:05:13.000Z'), status: 'scheduled' },
      { at: new Date('2026-10-02T14:05:15.000Z'), status: 'processing', table: table(1) },
      { at: new Date('2026-10-02T14:05:17.000Z'), status: 'done', table: table(1) },
    ]);
    // Finished, its tokens are asked no more, once their hold is past too.
    const asks = stub.asked.length;
    time.advance(5_000);
    await follower.once();
    expect(
      stub.asked
        .slice(asks)
        .flat()
        .filter((token) => tokens.includes(token)),
    ).toEqual([]);
  });

  it('carries on after the API restarts', async () => {
    const tokens = newTokens(1);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T15:00:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[0]!, { status: 'processing' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();

    // A restart: the pool goes, and a new follower starts from the database.
    await closeDb();
    stub.states.set(tokens[0]!, { status: 'done' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();

    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: 'done' });
    // Followed before the restart and after it.
    expect(await statesOf(runId)).toEqual([['processing', 'done']]);
  });

  it('is followed once by two followers on one database, each token asked by one of them', async () => {
    const tokens = newTokens(4);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T16:00:00.000Z');
    const runId = await started(stub, time.now);
    for (const token of tokens) stub.states.set(token, { status: 'processing' });
    time.advance(2_000);

    await Promise.all([followerOf(stub, time.now).once(), followerOf(stub, time.now).once()]);

    const askedOfMine = stub.asked.flat().filter((token) => tokens.includes(token));
    expect(askedOfMine.sort()).toEqual([...tokens].sort());
    const record = await buildHistory(getDb()).get(runId);
    for (const each of record?.tokens ?? []) expect(each.log).toHaveLength(1);
  });

  it('asks each job alone when Cube fails a batch, so one broken job holds up no other', async () => {
    const tokens = newTokens(2);
    const stub = stubCube(tokens, { broken: new Set([tokens[0]!]) });
    const time = clock('2026-10-02T16:30:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[1]!, { status: 'done' });
    time.advance(2_000);

    await followerOf(stub, time.now).once();

    expect(await statesOf(runId)).toEqual([[], ['done']]);
  });
});

describe('how a build ended (T372, AC-150)', () => {
  it('is handed on once it’s closed, with how it ended: a schedule’s failure counted (T379)', async () => {
    const tokens = newTokens(1);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T16:00:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[0]!, { status: 'failure: timed out' });
    time.advance(60_000);
    const handed: { runId: string; outcome: string }[][] = [];

    const follower = buildFollower({
      history: buildHistory(getDb()),
      cube: stub.cube,
      now: time.now,
      onEnded: (closed) => {
        handed.push([...closed]);
      },
    });
    await follower.once();
    await follower.once();

    expect(handed.flat().filter((each) => each.runId === runId)).toEqual([
      { runId, outcome: 'failed' },
    ]);
  });

  it('failed, saying how many partitions failed and Cube’s error', async () => {
    const tokens = newTokens(3);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T17:00:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[0]!, { status: 'missing_partition' });
    stub.states.set(tokens[1]!, {
      status: 'failure: canceling statement due to statement timeout',
    });
    stub.states.set(tokens[2]!, { status: 'done' });
    // Past the first moments, when Cube may not yet hold a job's record.
    time.advance(60_000);

    await followerOf(stub, time.now).once();

    expect(await buildHistory(getDb()).get(runId)).toMatchObject({
      outcome: 'failed',
      failedCount: 2,
      error: 'failure: canceling statement due to statement timeout',
    });
  });

  it('Cube’s record expired, neither done nor failed, for a token Cube no longer knows before its end was seen', async () => {
    const tokens = newTokens(2);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T18:00:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[0]!, { status: 'done' });
    stub.states.set(tokens[1]!, { status: 'processing' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();

    // wechart stopped; a day later Cube no longer knows the job.
    stub.states.delete(tokens[1]!);
    time.advance(25 * 3_600_000);
    await followerOf(stub, time.now).once();

    const record = await buildHistory(getDb()).get(runId);
    expect(record).toMatchObject({ outcome: 'expired', failedCount: 0 });
    expect(record?.tokens[1]?.log.map((each) => each.status)).toEqual(['processing', 'not_found']);
  });

  it('isn’t ended by Cube not yet knowing a job just posted', async () => {
    const tokens = newTokens(1);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T19:00:00.000Z');
    const runId = await started(stub, time.now);
    // Cube writes a job's record without waiting, so a first ask can miss
    // it (research cube/job-records.md, "Statuses that can flip").
    time.advance(500);
    await followerOf(stub, time.now).once();
    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: null });

    stub.states.set(tokens[0]!, { status: 'done' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();
    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: 'done' });
  });

  it('isn’t ended by a partition reading missing before its build is queued', async () => {
    const tokens = newTokens(1);
    const stub = stubCube(tokens);
    const time = clock('2026-10-02T19:30:00.000Z');
    const runId = await started(stub, time.now);
    stub.states.set(tokens[0]!, { status: 'missing_partition' });
    time.advance(500);
    await followerOf(stub, time.now).once();
    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: null });

    stub.states.set(tokens[0]!, { status: 'processing' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();
    stub.states.set(tokens[0]!, { status: 'done' });
    time.advance(2_000);
    await followerOf(stub, time.now).once();
    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: 'done' });
  });

  it('counts the first moments from Cube’s answer, however long the post took', async () => {
    const tokens = newTokens(1);
    const time = clock('2026-10-02T20:00:00.000Z');
    // The post waits out an instance catching up (research xcube-slice-2.md).
    const stub = stubCube(tokens, { onPost: () => time.advance(40_000) });
    const runId = await started(stub, time.now);

    time.advance(1_000);
    await followerOf(stub, time.now).once();

    expect(await buildHistory(getDb()).get(runId)).toMatchObject({ outcome: null });
  });
});

describe('following on an interval (T372)', () => {
  it('runs a round each interval, never two at once, and says a failed round', async () => {
    vi.useFakeTimers();
    let rounds = 0;
    let finish: () => void = () => undefined;
    const errors: unknown[] = [];
    const stop = startFollowingBuilds(
      {
        once: () => {
          rounds += 1;
          if (rounds === 3) return Promise.reject(new Error('Cube away'));
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      },
      { every: 2_000, onError: (error) => errors.push(error) },
    );

    await vi.advanceTimersByTimeAsync(2_000);
    expect(rounds).toBe(1);
    // Still going: the next interval starts no second round.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(rounds).toBe(1);
    finish();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(rounds).toBe(2);
    finish();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(rounds).toBe(3);
    expect(errors).toEqual([new Error('Cube away')]);

    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rounds).toBe(3);
  });
});
