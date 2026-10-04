import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildHistory, type NewBuild } from './build-history';

/**
 * T372 / AC-150: each build wechart starts is kept in wechart's own history,
 * one record per start (design 16's Q6), with its pre-aggregation, its
 * folder, the partitions it asked for, who or what started it, its request
 * id and each partition's token; the latest 100 records of each
 * pre-aggregation are kept. Against the real Postgres.
 */
const history = () => buildHistory(getDb());
const tag = randomUUID().slice(0, 8);
const preAggs: string[] = [];
const preAggOf = (name: string) => {
  const id = `f${tag}__${name}.main`;
  preAggs.push(id);
  return id;
};

afterAll(async () => {
  await getDb().deleteFrom('build_runs').where('pre_aggregation', 'in', preAggs).execute();
  await closeDb();
});

const wren = { kind: 'person', key: `wren-${tag}`, name: 'Wren Writer' } as const;
const STARTED = new Date('2026-10-02T14:05:12.204Z');
const build = (preAggregation: string, over: Partial<NewBuild> = {}): NewBuild => ({
  preAggregation,
  folderId: 'emea',
  partitions: null,
  granularity: 'month',
  via: 'build-all',
  starter: wren,
  requestId: `wechart-${randomUUID()}`,
  tokens: [`t-${randomUUID()}`, `t-${randomUUID()}`],
  startedAt: STARTED,
  answeredAt: new Date(STARTED.getTime() + 187),
  ...over,
});
const countOf = async (preAggregation: string) =>
  (
    await getDb()
      .selectFrom('build_runs')
      .select('id')
      .where('pre_aggregation', '=', preAggregation)
      .execute()
  ).length;

describe('a build’s record (T372, AC-150)', () => {
  it('is one record for one start, with what it asked for, who started it, its request id and every token', async () => {
    const started = build(preAggOf('orders'), {
      partitions: ['2026-08-01T00:00:00.000', '2026-09-01T00:00:00.000'],
      via: 'rebuild-selected',
    });

    const id = await history().start(started);

    expect(await history().get(id)).toEqual({
      id,
      preAggregation: started.preAggregation,
      folderId: 'emea',
      partitions: ['2026-08-01T00:00:00.000', '2026-09-01T00:00:00.000'],
      granularity: 'month',
      via: 'rebuild-selected',
      starter: wren,
      requestId: started.requestId,
      startedAt: started.startedAt,
      answeredAt: started.answeredAt,
      endedAt: null,
      durationMs: null,
      outcome: null,
      failedCount: null,
      error: null,
      cancelledBy: null,
      cancelledAt: null,
      tokens: started.tokens.map((token) => ({
        token,
        status: null,
        table: null,
        finished: false,
        finishedAt: null,
        log: [],
      })),
    });
    const rows = await getDb()
      .selectFrom('build_runs')
      .select('id')
      .where('request_id', '=', started.requestId)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('names a wechart schedule as its starter', async () => {
    const schedule = { kind: 'schedule', id: `s-${tag}`, name: 'Month-end close' } as const;
    const id = await history().start(
      build(preAggOf('returns'), { starter: schedule, via: 'schedule' }),
    );

    expect((await history().get(id))?.starter).toEqual(schedule);
  });

  it('records no start that made no job', async () => {
    await expect(history().start(build(preAggOf('nothing'), { tokens: [] }))).rejects.toThrow(
      /no job/,
    );
  });

  it('keeps the latest 100 records of each pre-aggregation, by when they started', async () => {
    const capped = preAggOf('capped');
    const other = preAggOf('other');
    const otherId = await history().start(
      build(other, { startedAt: new Date('2026-01-01T00:00:00Z') }),
    );
    // Recorded in another order than they started: the oldest started goes.
    const minutes = Array.from({ length: 101 }, (_, at) => (at * 37) % 101);
    const byMinute = new Map<number, string>();
    for (const minute of minutes)
      byMinute.set(
        minute,
        await history().start(
          build(capped, { startedAt: new Date(Date.UTC(2026, 8, 1, 0, minute)) }),
        ),
      );

    expect(await countOf(capped)).toBe(100);
    expect(await history().get(byMinute.get(0)!)).toBeUndefined();
    expect(await history().get(byMinute.get(1)!)).toMatchObject({ id: byMinute.get(1) });
    // Another pre-aggregation's records are its own.
    expect(await history().get(otherId)).toMatchObject({ id: otherId });
  });

  it('keeps 100 when two starts of one pre-aggregation come at once', async () => {
    const capped = preAggOf('together');
    for (let minute = 0; minute < 100; minute += 1)
      await history().start(
        build(capped, { startedAt: new Date(Date.UTC(2026, 8, 1, 0, minute)) }),
      );

    await Promise.all([
      history().start(build(capped, { startedAt: new Date(Date.UTC(2026, 8, 2)) })),
      history().start(build(capped, { startedAt: new Date(Date.UTC(2026, 8, 3)) })),
    ]);

    expect(await countOf(capped)).toBe(100);
  });
});

describe('following a build’s tokens (T372, AC-150, AC-319)', () => {
  it('writes a state Cube reported once, however many followers saw it', async () => {
    const started = build(preAggOf('once'), { tokens: [`t-${randomUUID()}`] });
    const id = await history().start(started);
    const token = started.tokens[0]!;
    const at = new Date('2026-10-02T14:05:13.902Z');
    const change = { runId: id, token, previous: null, status: 'scheduled', at, final: false };

    const [first, second] = await Promise.all([history().seen(change), history().seen(change)]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((await history().get(id))?.tokens[0]).toEqual({
      token,
      status: 'scheduled',
      table: null,
      finished: false,
      finishedAt: null,
      log: [{ at, status: 'scheduled' }],
    });
  });

  it('keeps each state with its table and the time wechart saw it, and its end', async () => {
    const started = build(preAggOf('log'), { tokens: [`t-${randomUUID()}`] });
    const id = await history().start(started);
    const token = started.tokens[0]!;
    const table = 'prod_pre_aggregations.orders_main20260801_abc_def_1d4k';
    const times = ['2026-10-02T14:05:13Z', '2026-10-02T14:05:16Z', '2026-10-02T14:05:53Z'].map(
      (iso) => new Date(iso),
    );

    await history().seen({
      runId: id,
      token,
      previous: null,
      status: 'scheduled',
      at: times[0]!,
      final: false,
    });
    await history().seen({
      runId: id,
      token,
      previous: 'scheduled',
      status: 'processing',
      table,
      at: times[1]!,
      final: false,
    });
    await history().seen({
      runId: id,
      token,
      previous: 'processing',
      status: 'done',
      table,
      at: times[2]!,
      final: true,
    });
    // Once finished, nothing more is written to it.
    const after = await history().seen({
      runId: id,
      token,
      previous: 'done',
      status: 'not_found',
      at: new Date('2026-10-03T14:06:00Z'),
      final: true,
    });

    expect(after).toBe(false);
    expect((await history().get(id))?.tokens[0]).toEqual({
      token,
      status: 'done',
      table,
      finished: true,
      finishedAt: times[2],
      log: [
        { at: times[0], status: 'scheduled' },
        { at: times[1], status: 'processing', table },
        { at: times[2], status: 'done', table },
      ],
    });
  });

  it('ends a job at the time its last state was first seen, when that state is taken as its end later', async () => {
    const started = build(preAggOf('later'), { tokens: [`t-${randomUUID()}`] });
    const id = await history().start(started);
    const token = started.tokens[0]!;
    const first = new Date('2026-10-02T14:05:13Z');

    await history().seen({
      runId: id,
      token,
      previous: null,
      status: 'missing_partition',
      at: first,
      final: false,
    });
    await history().seen({
      runId: id,
      token,
      previous: 'missing_partition',
      status: 'missing_partition',
      at: new Date('2026-10-02T14:06:00Z'),
      final: true,
    });

    expect((await history().get(id))?.tokens[0]).toMatchObject({
      finished: true,
      finishedAt: first,
      log: [{ at: first, status: 'missing_partition' }],
    });
  });

  it('gives each open token to one follower at a time, until its hold ends', async () => {
    const started = build(preAggOf('claimed'), {
      tokens: Array.from({ length: 6 }, () => `t-${randomUUID()}`),
    });
    await history().start(started);
    const mine = new Set(started.tokens);
    const now = new Date('2026-10-02T14:06:00Z');
    const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

    const [one, two] = await Promise.all([
      history().claim({ limit: 500, leaseMs: 30_000, now }),
      history().claim({ limit: 500, leaseMs: 30_000, now }),
    ]);
    const oneOfMine = one.filter((each) => mine.has(each.token)).map((each) => each.token);
    const twoOfMine = two.filter((each) => mine.has(each.token)).map((each) => each.token);

    expect([...oneOfMine, ...twoOfMine].sort()).toEqual([...started.tokens].sort());
    expect(oneOfMine.filter((token) => twoOfMine.includes(token))).toEqual([]);
    // Held: no third follower takes them meanwhile.
    const third = await history().claim({ limit: 500, leaseMs: 30_000, now: later(10) });
    expect(third.filter((each) => mine.has(each.token))).toEqual([]);

    // Handed back, to be asked again two seconds on: not before.
    await history().release([...one, ...two], later(12));
    expect(
      (await history().claim({ limit: 500, leaseMs: 30_000, now: later(11) })).filter((each) =>
        mine.has(each.token),
      ),
    ).toEqual([]);
    const again = await history().claim({ limit: 500, leaseMs: 30_000, now: later(12) });
    expect(again.filter((each) => mine.has(each.token))).toHaveLength(6);
    await history().release(again, null);
  });

  it('never hands back a hold another follower took once its own ran out', async () => {
    const started = build(preAggOf('overtaken'), { tokens: [`t-${randomUUID()}`] });
    await history().start(started);
    const token = started.tokens[0]!;
    const now = new Date('2026-10-02T15:00:00Z');
    const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
    const mineOf = <T extends { token: string }>(held: T[]) =>
      held.filter((each) => each.token === token);

    const slow = mineOf(await history().claim({ limit: 500, leaseMs: 30_000, now }));
    // The slow follower's hold runs out; another takes the job.
    const quick = mineOf(await history().claim({ limit: 500, leaseMs: 30_000, now: later(31) }));
    expect(quick).toHaveLength(1);
    // The slow one, finishing late, hands back only what it still held: nothing.
    await history().release(slow, null);

    expect(mineOf(await history().claim({ limit: 500, leaseMs: 30_000, now: later(32) }))).toEqual(
      [],
    );
    await history().release(quick, null);
  });

  it('asks the jobs it asked least lately first, so none waits behind others', async () => {
    const started = build(preAggOf('turns'), {
      tokens: Array.from({ length: 5 }, () => `t-${randomUUID()}`),
    });
    await history().start(started);
    const mine = new Set(started.tokens);
    const now = new Date('2026-10-02T16:00:00Z');

    // Every other open job in the database asked just now, and held a second;
    // ours asked longest ago.
    const before = await history().claim({ limit: 10_000, leaseMs: 30_000, now });
    await history().release(
      before.filter((each) => !mine.has(each.token)),
      new Date(now.getTime() + 1000),
    );
    await history().release(
      before.filter((each) => mine.has(each.token)),
      new Date(now.getTime() - 60_000),
    );
    // The next round, of three, takes three of ours first.
    const next = await history().claim({
      limit: 3,
      leaseMs: 30_000,
      now: new Date(now.getTime() + 1500),
    });

    expect(next.filter((each) => mine.has(each.token))).toHaveLength(3);
    await history().release(next, null);
  });
});

describe('a build’s end (T372, AC-150)', () => {
  /** A build whose jobs ended as `statuses`, `secondsIn` after it started. */
  async function ended(name: string, statuses: string[], secondsIn = 41) {
    const started = build(preAggOf(name), {
      tokens: statuses.map(() => `t-${randomUUID()}`),
    });
    const id = await history().start(started);
    for (const [at, status] of statuses.entries())
      await history().seen({
        runId: id,
        token: started.tokens[at]!,
        previous: null,
        status,
        at: new Date(STARTED.getTime() + secondsIn * 1000),
        final: true,
      });
    return id;
  }

  it('says Cube’s failure, not a partition’s status, when one failed with an error', async () => {
    const id = await ended('error', ['missing_partition', 'failure: canceling statement', 'done']);

    expect(await history().close(id)).toBe('failed');
    expect(await history().get(id)).toMatchObject({
      outcome: 'failed',
      failedCount: 2,
      error: 'failure: canceling statement',
      durationMs: 41_000,
    });
  });

  it('has no end or duration when Cube’s record expired, since how it ended isn’t known', async () => {
    const id = await ended('expired', ['done', 'not_found'], 25 * 3600);

    await history().close(id);
    expect(await history().get(id)).toMatchObject({
      outcome: 'expired',
      endedAt: null,
      durationMs: null,
    });
  });

  it('is cancelled when a job was cancelled and none failed, saying who cancelled it (T376)', async () => {
    const started = build(preAggOf('cancelled'));
    const id = await history().start(started);
    const at = new Date('2026-10-02T14:39:02Z');
    await history().seen({
      runId: id,
      token: started.tokens[0]!,
      previous: null,
      status: 'done',
      at,
      final: true,
    });

    expect(await history().cancelled({ runId: id, token: started.tokens[1]!, by: wren, at })).toBe(
      true,
    );
    // Once ended, a job can't be cancelled again.
    expect(await history().cancelled({ runId: id, token: started.tokens[1]!, by: wren, at })).toBe(
      false,
    );

    const record = await history().get(id);
    expect(record).toMatchObject({
      outcome: 'cancelled',
      cancelledBy: { key: wren.key, name: wren.name },
      cancelledAt: at,
    });
    expect(record?.tokens[1]).toMatchObject({
      status: 'cancelled',
      finished: true,
      log: [{ at, status: 'cancelled' }],
    });
  });

  it('is failed, not cancelled, when another job failed', async () => {
    const started = build(preAggOf('cancelled-failed'));
    const id = await history().start(started);
    const at = new Date('2026-10-02T14:39:02Z');
    await history().seen({
      runId: id,
      token: started.tokens[0]!,
      previous: null,
      status: 'failure: boom',
      at,
      final: true,
    });
    await history().cancelled({ runId: id, token: started.tokens[1]!, by: wren, at });

    expect((await history().get(id))?.outcome).toBe('failed');
  });

  it('finds the starts a queue’s entries came from, by request id or job token', async () => {
    const one = build(preAggOf('found'));
    const two = build(preAggOf('found-too'));
    const first = await history().start(one);
    const second = await history().start(two);

    const found = await history().startsFor({
      requestIds: [one.requestId, 'wechart-unknown'],
      tokens: [two.tokens[1]!, 'unknown-token'],
    });

    expect(found.map((each) => each.runId).sort()).toEqual([first, second].sort());
    expect(found.find((each) => each.runId === first)).toMatchObject({
      requestId: one.requestId,
      folderId: 'emea',
      starter: wren,
      tokens: one.tokens.map((token) => ({ token, table: null, finished: false })),
    });
  });

  it('closes every build whose jobs have all ended, though no round closed it', async () => {
    const id = await ended('orphan', ['done', 'done']);

    await history().closeEnded();

    expect(await history().get(id)).toMatchObject({ outcome: 'done' });
  });
});

describe('a wechart schedule’s last run (T552, AC-154)', () => {
  it('gives each schedule’s latest run, how it ended and when, and none for one that hasn’t run', async () => {
    const schedule = (id: string) => ({ kind: 'schedule', id, name: `Morning ${tag}` }) as const;
    const ids = { ran: `s-${randomUUID()}`, open: `s-${randomUUID()}`, never: `s-${randomUUID()}` };
    const earlier = await history().start(
      build(preAggOf('scheduled'), { via: 'schedule', starter: schedule(ids.ran) }),
    );
    const later = build(preAggOf('scheduled'), {
      via: 'schedule',
      starter: schedule(ids.ran),
      tokens: [`t-${randomUUID()}`],
      startedAt: new Date(STARTED.getTime() + 3_600_000),
    });
    const latest = await history().start(later);
    const endedAt = new Date(STARTED.getTime() + 3_641_000);
    await history().seen({
      runId: latest,
      token: later.tokens[0]!,
      previous: null,
      status: 'failure: timed out',
      at: endedAt,
      final: true,
    });
    await history().close(latest);
    const open = await history().start(
      build(preAggOf('scheduled'), { via: 'schedule', starter: schedule(ids.open) }),
    );

    const last = await history().lastRunsOf([ids.ran, ids.open, ids.never]);

    expect(last).toEqual(
      new Map([
        [
          ids.ran,
          {
            id: latest,
            outcome: 'failed',
            startedAt: later.startedAt,
            endedAt,
            error: 'failure: timed out',
          },
        ],
        [ids.open, { id: open, outcome: null, startedAt: STARTED, endedAt: null, error: null }],
      ]),
    );
    expect(last.get(ids.ran)?.id).not.toBe(earlier);
    expect(await history().lastRunsOf([])).toEqual(new Map());
  });
});

describe('a wechart schedule’s runs, as its suspension counts them (T379, AC-155)', () => {
  const scheduleOf = (id: string) => ({ kind: 'schedule', id, name: `Hourly ${tag}` }) as const;

  /** A scheduled run whose one job ended as `status`, `minutes` after STARTED. */
  async function ran(id: string, status: string, minutes: number) {
    const started = build(preAggOf('counted'), {
      via: 'schedule',
      starter: scheduleOf(id),
      tokens: [`t-${randomUUID()}`],
      startedAt: new Date(STARTED.getTime() + minutes * 60_000),
    });
    const runId = await history().start(started);
    await history().seen({
      runId,
      token: started.tokens[0]!,
      previous: null,
      status,
      at: new Date(started.startedAt.getTime() + 41_000),
      final: true,
    });
    return runId;
  }

  it('answers each build it closes with how it ended, once', async () => {
    const id = `s-${randomUUID()}`;
    const failed = await ran(id, 'failure: timed out', 0);

    const closed = await history().closeEnded();

    expect(closed.filter((each) => each.runId === failed)).toEqual([
      { runId: failed, outcome: 'failed' },
    ]);
    expect((await history().closeEnded()).filter((each) => each.runId === failed)).toEqual([]);
  });

  it('records a start Cube refused as failed, with Cube’s words and no jobs, ended as it started', async () => {
    const id = `s-${randomUUID()}`;
    const at = new Date(STARTED.getTime() + 5 * 60_000);
    const error =
      "A user's selector doesn't match any of the pre-aggregations defined in the data model.";

    const runId = await history().refused({
      preAggregation: preAggOf('refused'),
      folderId: 'emea',
      granularity: null,
      via: 'schedule',
      starter: scheduleOf(id),
      requestId: `wechart-schedule-${randomUUID()}`,
      startedAt: at,
      error,
    });

    const record = await history().get(runId);
    expect([
      record?.outcome,
      record?.error,
      record?.failedCount,
      record?.tokens,
      record?.endedAt,
      record?.starter,
    ]).toEqual(['failed', error, 0, [], at, scheduleOf(id)]);
  });

  it('gives a schedule’s ended runs by its times, newest first, from a time on, none still open', async () => {
    const id = `s-${randomUUID()}`;
    await ran(id, 'done', 10);
    const older = await ran(id, 'failure: one', 20);
    const newer = await ran(id, 'missing_partition', 30);
    await history().closeEnded();
    // Still open: not counted.
    await history().start(
      build(preAggOf('counted'), {
        via: 'schedule',
        starter: scheduleOf(id),
        startedAt: new Date(STARTED.getTime() + 40 * 60_000),
      }),
    );

    expect(await history().scheduledEnds(id, null, 10)).toEqual([
      { runId: newer, outcome: 'failed', error: 'missing_partition' },
      { runId: older, outcome: 'failed', error: 'failure: one' },
      expect.objectContaining({ outcome: 'done', error: null }),
    ]);
    // From a time on: Resume's.
    expect(
      (await history().scheduledEnds(id, new Date(STARTED.getTime() + 15 * 60_000), 10)).map(
        (each) => each.runId,
      ),
    ).toEqual([newer, older]);
    expect((await history().scheduledEnds(id, null, 1)).map((each) => each.runId)).toEqual([newer]);
  });
});
