import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { scheduleStore, wechartScheduler, type WechartScheduler } from './schedules';

/**
 * T378 / AC-234, AC-319 (design 16, Q7 and Q8): wechart's own schedules, run
 * by pg-boss (research scheduler.md; pg-boss-12.33.2-installed.md). Each due
 * run posts one jobs request for every partition (Build all), recorded as one
 * start by the schedule (T372). A run missed while the scheduler was stopped
 * runs once when it starts again, or doesn't, as its schedule says. Two API
 * replicas start each due run once. A schedule with no zone is refused.
 *
 * On pg-boss itself, in a schema of the test's own, its clock pg-boss's
 * TestClock, which every pg-boss statement in that schema reads too.
 */
const MARK = `sched${randomUUID().slice(0, 8)}`;
const SCHEMA = `pgboss_${MARK}`;
const START = '2026-10-05T04:58:00Z';
const clock = new TestClock(new Date(START));

/**
 * Every jobs post the stub Cube is sent for this file's pre-aggregation: a
 * replica lays every stored schedule, and another test file's may be stored.
 */
const posted: { selector: Record<string, unknown>; requestId: string | null }[] = [];
/** How the stub Cube answers a jobs post: tokens, or a refusal. */
let answerJobs: () => Response = () => Response.json([`${MARK}-token-${String(posted.length)}`]);
/**
 * The deployment's model, as main.ts gives the scheduler's client (T421):
 * a run names it, or xcube builds Cube's disk model (research xcube-slice-2.md).
 */
const cube = new CubeClient({
  apiUrl: 'http://cube.invalid/cubejs-api',
  apiSecret: 'secret',
  securityContext: {},
  service: async () => 'service-token',
  model: { id: 'dev', revision: async () => 7 },
  fetchImpl: (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    // xcube's admin meta: the rollup, partitioned by month.
    if (path.endsWith('/models/dev/meta'))
      return Response.json({
        cubes: [
          {
            name: `${MARK}_orders`,
            preAggregations: [{ name: 'main', type: 'rollup', partitionGranularity: 'month' }],
          },
        ],
      });
    if (path.endsWith('/v1/pre-aggregations/jobs')) {
      const body = JSON.parse(String(init?.body)) as { selector: Record<string, unknown> };
      const named = body.selector['preAggregations'];
      if (Array.isArray(named) && named.some((each) => String(each).startsWith(`${MARK}_`)))
        posted.push({
          selector: body.selector,
          requestId: new Headers(init?.headers).get('x-request-id'),
        });
      return answerJobs();
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch,
});

const bosses: PgBoss[] = [];
/** What the scheduler said went wrong. */
const failures: unknown[] = [];
const replica = async (): Promise<WechartScheduler> => {
  const boss = new PgBoss({
    connectionString: databaseUrl(),
    schema: SCHEMA,
    clock,
    cronMonitorIntervalSeconds: 1,
    cronWorkerIntervalSeconds: 1,
    supervise: false,
  });
  bosses.push(boss);
  const scheduler = wechartScheduler({
    boss,
    // This file's schedules alone: another file's, in the same database, aren't its to run.
    store: scheduleStore(getDb(), { named: MARK }),
    history: buildHistory(getDb()),
    cube,
    now: () => new Date(clock.now()),
    pollingIntervalSeconds: 0.5,
    onError: (error) => {
      failures.push(error);
    },
  });
  await scheduler.start();
  return scheduler;
};
/** pg-boss's own schedules in the test's schema, by wechart's ids. */
const laidIn = async (boss: PgBoss) =>
  new Map((await boss.getSchedules('wechart-schedule-run')).map((each) => [each.key, each]));
const stopAll = async () => {
  for (const boss of bosses.splice(0)) await boss.stop({ graceful: false, close: true });
};

/**
 * Brings the test clock to `due`, 2 s before it, and holds it near there, a
 * second at a time, never past the run's minute, until `until` holds or 30 s
 * of real time pass. pg-boss's passes are timed in real time: under load
 * they come late, and a clock run on past the minute would leave them no run
 * to find. With no `due`, from where the clock is.
 */
async function runAt(due: string | null, until: () => boolean): Promise<void> {
  if (due !== null) await clock.setTime(new Date(new Date(due).getTime() - 2000));
  const deadline = Date.now() + 30_000;
  for (let ticks = 0; !until() && Date.now() < deadline; ticks += 1) {
    if (ticks < 40) await clock.tick(1000);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // Let a worker that just fetched a job finish it.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/** Moves the test clock on, a second at a time: for times when nothing should run. */
async function runFor(seconds: number, until: () => boolean = () => false): Promise<void> {
  for (let at = 0; at < seconds && !until(); at += 1) {
    await clock.tick(1000);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  // Let a worker that just fetched a job finish it.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const runsOf = async (scheduleId: string) =>
  (
    await buildHistory(getDb()).list({
      within: undefined,
      filters: { starter: { kind: 'schedule', id: scheduleId } },
    })
  ).records;
/** A schedule's runs once `count` are recorded, or as they are after 10 s of real time. */
async function runsWhen(scheduleId: string, count: number) {
  const deadline = Date.now() + 10_000;
  let runs = await runsOf(scheduleId);
  while (runs.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    runs = await runsOf(scheduleId);
  }
  return runs;
}

const PRE_AGGREGATION = `${MARK}_orders.main`;
const made: string[] = [];
const by = { key: 'wren', name: 'Wren Writer' };
const newSchedule = (over: Record<string, unknown> = {}) => ({
  name: `Morning ${MARK}`,
  preAggregation: PRE_AGGREGATION,
  folderId: 'root',
  cron: '0 5 * * *',
  timezone: 'UTC',
  missed: 'once' as const,
  ...over,
});

afterEach(async () => {
  await stopAll();
  posted.length = 0;
  failures.length = 0;
  answerJobs = () => Response.json([`${MARK}-token-${String(posted.length)}`]);
  // Each test's schedules are its own: a replica started later lays every stored one.
  if (made.length > 0) await getDb().deleteFrom('schedules').where('id', 'in', made).execute();
});

afterAll(async () => {
  await stopAll();
  const db = getDb();
  if (made.length > 0) await db.deleteFrom('schedules').where('id', 'in', made).execute();
  await db.deleteFrom('build_runs').where('pre_aggregation', '=', PRE_AGGREGATION).execute();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.end();
  await closeDb();
});

// Each test walks pg-boss's clock on a second at a time, minutes of it.
describe('wechart’s schedules (T378, AC-234)', { timeout: 120_000 }, () => {
  it('posts one jobs request for every partition at a due time, recorded as one start by the schedule', async () => {
    await clock.setTime(new Date(START));
    const scheduler = await replica();
    const schedule = await scheduler.create(newSchedule(), by);
    made.push(schedule.id);

    await runAt('2026-10-05T05:00:00Z', () => posted.length > 0);

    expect(posted).toHaveLength(1);
    // Build all: no dateRange, so every partition (Q7).
    expect(posted[0]?.selector['preAggregations']).toEqual([PRE_AGGREGATION]);
    expect(posted[0]?.selector).not.toHaveProperty('dateRange');
    // In the model xcube serves, at the revision recorded (T421), not Cube's disk model.
    const [context] = posted[0]?.selector['contexts'] as {
      securityContext: { wechartModel?: unknown; wechartRevision?: unknown };
    }[];
    expect([
      context?.securityContext.wechartModel,
      context?.securityContext.wechartRevision,
    ]).toEqual(['dev', 7]);
    const runs = await runsWhen(schedule.id, 1);
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect({
      preAggregation: run?.preAggregation,
      via: run?.via,
      partitions: run?.partitions,
      granularity: run?.granularity,
      starter: run?.starter,
    }).toEqual({
      preAggregation: PRE_AGGREGATION,
      via: 'schedule',
      partitions: null,
      // Every partition of a rollup partitioned by month, as Build all records it.
      granularity: 'month',
      starter: { kind: 'schedule', id: schedule.id, name: `Morning ${MARK}` },
    });
    // Its request id names the run, so a run pg-boss hands out again isn't started twice.
    expect(posted[0]?.requestId).toMatch(/^wechart-schedule-/);
  });

  it('runs a missed run once when it starts again, or skips it, as each schedule says (Q8)', async () => {
    await clock.setTime(new Date('2026-10-06T04:00:00Z'));
    const first = await replica();
    const once = await first.create(newSchedule({ name: `Once ${MARK}`, cron: '0 5 * * *' }), by);
    const skip = await first.create(
      newSchedule({ name: `Skip ${MARK}`, cron: '0 5 * * *', missed: 'skip' }),
      by,
    );
    made.push(once.id, skip.id);
    // A pass, so pg-boss has a time it last looked.
    await runFor(3);
    await stopAll();

    // wechart is down across 05:00, and back at 06:30.
    await clock.setTime(new Date('2026-10-06T06:30:00Z'));
    await replica();
    await runAt(null, () => posted.length > 0);
    await runFor(5);

    expect((await runsWhen(once.id, 1)).length).toBe(1);
    expect((await runsOf(skip.id)).length).toBe(0);
  });

  it('starts each due run once with two API replicas (AC-319)', async () => {
    await clock.setTime(new Date('2026-10-07T04:59:30Z'));
    const one = await replica();
    await replica();
    const schedule = await one.create(newSchedule({ name: `Twice ${MARK}` }), by);
    made.push(schedule.id);

    await runAt('2026-10-07T05:00:00Z', () => posted.length > 0);
    await runFor(10);

    expect(posted).toHaveLength(1);
    expect((await runsWhen(schedule.id, 1)).length).toBe(1);
  });

  it('starts a run pg-boss hands out again once, by its request id', async () => {
    await clock.setTime(new Date(START));
    const scheduler = await replica();
    const schedule = await scheduler.create(newSchedule({ name: `Again ${MARK}` }), by);
    made.push(schedule.id);
    // This run's own job id: Run history is shared with every other run of the suite.
    const job = `job-${MARK}`;

    await scheduler.run(schedule.id, job);
    await scheduler.run(schedule.id, job);

    expect(posted.map((each) => each.requestId)).toEqual([`wechart-schedule-${job}`]);
    expect((await runsOf(schedule.id)).length).toBe(1);
  });

  it('says a run Cube refuses, and fails it, recording nothing', async () => {
    await clock.setTime(new Date(START));
    const scheduler = await replica();
    const schedule = await scheduler.create(newSchedule({ name: `Refused ${MARK}` }), by);
    made.push(schedule.id);
    answerJobs = () => Response.json({ error: 'Pre-aggregation not found' }, { status: 400 });

    await expect(scheduler.run(schedule.id, `job-refused-${MARK}`)).rejects.toThrow(
      'Pre-aggregation not found',
    );
    expect(failures).toHaveLength(1);
    expect(failures.map((each) => (each instanceof Error ? each.message : String(each)))).toEqual([
      `“Refused ${MARK}” could not start its run: Pre-aggregation not found`,
    ]);
    expect((await runsOf(schedule.id)).length).toBe(0);
  });

  it('lays at a start only what pg-boss lacks or holds otherwise, and drops what wechart no longer has', async () => {
    await clock.setTime(new Date(START));
    const first = await replica();
    const kept = await first.create(newSchedule({ name: `Kept ${MARK}` }), by);
    const changed = await first.create(newSchedule({ name: `Changed ${MARK}` }), by);
    const gone = await first.create(newSchedule({ name: `Gone ${MARK}` }), by);
    made.push(kept.id, changed.id, gone.id);
    const boss = bosses[0]!;
    const before = await laidIn(boss);
    // Changed and removed in the table alone, as a lay that failed would leave them.
    await getDb()
      .updateTable('schedules')
      .set({ cron: '0 7 * * *' })
      .where('id', '=', changed.id)
      .execute();
    await getDb().deleteFrom('schedules').where('id', '=', gone.id).execute();
    // A second on, so a schedule laid again reads a later `updatedOn`.
    await clock.tick(1000);

    await replica();
    const after = await laidIn(boss);

    // Left as it was laid: never laid again from a list read before another replica's change.
    expect(after.get(kept.id)?.updatedOn).toEqual(before.get(kept.id)?.updatedOn);
    expect(after.get(changed.id)?.cron).toBe('0 7 * * *');
    expect(after.has(gone.id)).toBe(false);
  });

  it('refuses a schedule with no zone, or a cron it can’t read, saving nothing', async () => {
    await clock.setTime(new Date(START));
    const scheduler = await replica();
    await expect(scheduler.create(newSchedule({ timezone: '' }), by)).rejects.toThrow(
      'Choose the time zone its times are in.',
    );
    await expect(scheduler.create(newSchedule({ timezone: 'Mars/Olympus' }), by)).rejects.toThrow(
      '“Mars/Olympus” isn’t a time zone wechart knows.',
    );
    await expect(scheduler.create(newSchedule({ cron: '0 25 * * *' }), by)).rejects.toThrow(
      'The hour is 25; it must be 0 to 23.',
    );
    // None of the three: earlier tests' schedules are deleted after each.
    expect(
      await getDb()
        .selectFrom('schedules')
        .select('id')
        .where('pre_aggregation', '=', PRE_AGGREGATION)
        .execute(),
    ).toEqual([]);
  });

  it('keeps a zone by its own name, and a missed-run choice a change leaves out', async () => {
    await clock.setTime(new Date(START));
    const scheduler = await replica();
    const schedule = await scheduler.create(
      newSchedule({ name: `Zoned ${MARK}`, timezone: 'europe/london', missed: 'skip' }),
      by,
    );
    made.push(schedule.id);
    expect(schedule.timezone).toBe('Europe/London');

    // No `missed`: a change that leaves it out.
    const changed = await scheduler.change(
      schedule.id,
      {
        name: `Zoned ${MARK}`,
        preAggregation: PRE_AGGREGATION,
        folderId: 'root',
        cron: '0 6 * * *',
        timezone: 'Europe/London',
      },
      by,
    );
    expect([changed?.cron, changed?.missed]).toEqual(['0 6 * * *', 'skip']);
  });

  it('applies a change and a delete at once: the old time no longer runs', async () => {
    await clock.setTime(new Date('2026-10-08T04:58:00Z'));
    const scheduler = await replica();
    const schedule = await scheduler.create(newSchedule({ name: `Moved ${MARK}` }), by);
    made.push(schedule.id);
    // Moved to 06:00, then 05:00 passes with no run.
    await scheduler.change(
      schedule.id,
      { ...newSchedule({ name: `Moved ${MARK}` }), cron: '0 6 * * *' },
      by,
    );
    await runFor(240);
    expect(posted).toHaveLength(0);
    // Deleted before 06:00: nothing at 06:00 either.
    await scheduler.remove(schedule.id);
    await clock.setTime(new Date('2026-10-08T05:59:00Z'));
    await runFor(120);
    expect(posted).toHaveLength(0);
    expect(await scheduler.get(schedule.id)).toBeUndefined();
  });
});
