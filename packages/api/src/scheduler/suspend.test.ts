import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { RUN_QUEUE, scheduleStore, wechartScheduler, type WechartScheduler } from './schedules';

/**
 * T379 / AC-155 (design 16, state E and Q9; R59): a wechart schedule is
 * suspended when its runs fail as many times in a row as it sets. A run
 * fails when Cube refuses its start, or when any of its partitions ends
 * failed or missing; "Cube's record expired" counts neither way; a run that
 * ends done starts the count again. At its number it starts no more runs,
 * until Resume, which starts it again from its next time with the count at
 * 0. The number is a whole number from 1 up, 3 unless set, with no "never".
 *
 * On pg-boss in a schema of the test's own, with its TestClock, and a stub Cube.
 */
const MARK = `susp${randomUUID().slice(0, 8)}`;
const SCHEMA = `pgboss_${MARK}`;
const clock = new TestClock(new Date('2026-10-05T04:00:00Z'));
const PRE_AGGREGATION = `${MARK}_orders.main`;

/** This file's jobs posts, and how the stub Cube answers the next. */
const posted: string[] = [];
let answer: () => Response = () => Response.json([`${MARK}-${randomUUID()}`]);
const REMOVED =
  "A user's selector doesn't match any of the pre-aggregations defined in the data model.";
const cube = new CubeClient({
  apiUrl: 'http://cube.invalid/cubejs-api',
  apiSecret: 'secret',
  securityContext: {},
  fetchImpl: (async (url: string, init?: RequestInit) => {
    if (new URL(url).pathname.endsWith('/v1/pre-aggregations/jobs')) {
      const body = JSON.parse(String(init?.body)) as { selector: { preAggregations: string[] } };
      if (body.selector.preAggregations.includes(PRE_AGGREGATION)) {
        posted.push(new Headers(init?.headers).get('x-request-id') ?? '');
        return answer();
      }
      return Response.json([`other-${randomUUID()}`]);
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch,
});

const history = () => buildHistory(getDb());
let boss: PgBoss | undefined;
let scheduler: WechartScheduler;
const made: string[] = [];
const by = { key: 'wren', name: 'Wren Writer' };

async function started(): Promise<WechartScheduler> {
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
    cube,
    now: () => new Date(clock.now()),
    pollingIntervalSeconds: 0.5,
  });
  await scheduler.start();
  return scheduler;
}

const newSchedule = (over: Record<string, unknown> = {}) => ({
  name: `Trading hours ${MARK}`,
  preAggregation: PRE_AGGREGATION,
  folderId: 'root',
  cron: '0 5 * * *',
  timezone: 'UTC',
  ...over,
});

/** A run of the schedule, as pg-boss would hand it out. */
/** A run of the schedule, as pg-boss would hand it out, a minute after the one before. */
async function runOf(id: string) {
  await clock.tick(60_000);
  await scheduler.run(id, randomUUID()).catch(() => undefined);
}

/** A run that started, its every job ended as `statuses`, closed and counted. */
async function ended(id: string, ...statuses: string[]) {
  answer = () => Response.json(statuses.map(() => `${MARK}-${randomUUID()}`));
  await runOf(id);
  const [run] = (
    await history().list({
      within: undefined,
      filters: { starter: { kind: 'schedule', id } },
      limit: 1,
    })
  ).records;
  const record = await history().get(run!.id);
  for (const token of record!.tokens)
    await history().seen({
      runId: record!.id,
      token: token.token,
      previous: null,
      status: statuses[record!.tokens.indexOf(token)]!,
      at: new Date(clock.now()),
      final: true,
    });
  await scheduler.ended(await history().closeEnded());
}

afterEach(async () => {
  if (boss !== undefined) await boss.stop({ graceful: false, close: true });
  boss = undefined;
  posted.length = 0;
  answer = () => Response.json([`${MARK}-${randomUUID()}`]);
  if (made.length > 0) await getDb().deleteFrom('schedules').where('id', 'in', made).execute();
});

afterAll(async () => {
  await getDb().deleteFrom('build_runs').where('pre_aggregation', '=', PRE_AGGREGATION).execute();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.end();
  await closeDb();
});

describe(
  'Suspending a wechart schedule after its failed runs in a row (T379, AC-155)',
  { timeout: 120_000 },
  () => {
    it('counts a run Cube refused, or one a partition of which ended failed or missing; not an expired one; and starts again at a done one', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const schedule = await scheduler.create(newSchedule({ suspendAfter: 9 }), by);
      made.push(schedule.id);
      const count = async () => (await scheduler.get(schedule.id))?.failuresInARow;

      // Refused: recorded in Run history as failed, with Cube's words and no jobs.
      answer = () => Response.json({ error: REMOVED }, { status: 400 });
      await runOf(schedule.id);
      expect(await count()).toBe(1);
      const [refused] = (
        await history().list({
          within: undefined,
          filters: { starter: { kind: 'schedule', id: schedule.id } },
        })
      ).records;
      expect([refused?.outcome, refused?.error, refused?.jobs]).toEqual(['failed', REMOVED, 0]);

      await ended(schedule.id, 'done', 'failure: canceling statement due to statement timeout');
      expect(await count()).toBe(2);
      await ended(schedule.id, 'missing_partition');
      expect(await count()).toBe(3);
      // Cube's record expired: neither way.
      await ended(schedule.id, 'not_found');
      expect(await count()).toBe(3);
      await ended(schedule.id, 'done', 'done');
      expect(await count()).toBe(0);
    });

    it('starts no more runs at its number in a row, saying when and Cube’s last error', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const schedule = await scheduler.create(newSchedule({ suspendAfter: 2 }), by);
      made.push(schedule.id);
      answer = () => Response.json({ error: REMOVED }, { status: 400 });

      await runOf(schedule.id);
      expect((await scheduler.get(schedule.id))?.suspendedAt).toBeNull();
      await runOf(schedule.id);

      const suspended = await scheduler.get(schedule.id);
      expect([
        suspended?.suspendedAt,
        suspended?.suspendedError,
        suspended?.failuresInARow,
        // Its second run's time: a minute after the first's.
      ]).toEqual([new Date('2026-10-05T04:02:00Z'), REMOVED, 2]);
      // pg-boss holds it no more, and a run handed out anyway posts nothing.
      expect((await boss!.getSchedules(RUN_QUEUE)).map((each) => each.key)).not.toContain(
        schedule.id,
      );
      posted.length = 0;
      await runOf(schedule.id);
      expect(posted).toEqual([]);
    });

    it('starts it again on Resume from its next time, a run missed while suspended not run, with the count at 0', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const schedule = await scheduler.create(newSchedule({ suspendAfter: 1 }), by);
      made.push(schedule.id);
      answer = () => Response.json({ error: REMOVED }, { status: 400 });
      await runOf(schedule.id);
      expect((await scheduler.get(schedule.id))?.suspendedAt).not.toBeNull();

      // Suspended across 05:00, resumed at 05:30: nothing then, and its next run at 05:00 tomorrow.
      await clock.setTime(new Date('2026-10-05T05:30:00Z'));
      answer = () => Response.json([`${MARK}-${randomUUID()}`]);
      posted.length = 0;
      const resumed = await scheduler.resume(schedule.id, by);
      expect([resumed?.suspendedAt, resumed?.failuresInARow]).toEqual([null, 0]);
      // Long enough, in real time, for pg-boss's passes (each second) to send
      // a missed run if it would: none comes.
      for (let at = 0; at < 16; at += 1) {
        await clock.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(posted).toEqual([]);
      // Its next time, the clock held inside its minute: pg-boss's passes,
      // timed in real time, come late under load.
      await clock.setTime(new Date('2026-10-06T04:59:58Z'));
      const deadline = Date.now() + 30_000;
      for (let ticks = 0; posted.length === 0 && Date.now() < deadline; ticks += 1) {
        if (ticks < 40) await clock.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(posted).toHaveLength(1);
    });

    it('at a number lowered to its count, starts no more runs: its next is suspended unposted (T379’s review)', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const schedule = await scheduler.create(newSchedule({ suspendAfter: 3 }), by);
      made.push(schedule.id);
      answer = () => Response.json({ error: REMOVED }, { status: 400 });
      await runOf(schedule.id);
      await runOf(schedule.id);
      expect((await scheduler.get(schedule.id))?.suspendedAt).toBeNull();

      await scheduler.change(schedule.id, newSchedule({ suspendAfter: 2 }), by);
      posted.length = 0;
      await runOf(schedule.id);

      expect(posted).toEqual([]);
      const now = await scheduler.get(schedule.id);
      expect([now?.suspendedError, now?.failuresInARow]).toEqual([REMOVED, 2]);
      expect((await boss!.getSchedules(RUN_QUEUE)).map((each) => each.key)).not.toContain(
        schedule.id,
      );
    });

    it('after Resume, suspends it again only once that many more runs have failed', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const schedule = await scheduler.create(newSchedule({ suspendAfter: 2 }), by);
      made.push(schedule.id);
      answer = () => Response.json({ error: REMOVED }, { status: 400 });
      await runOf(schedule.id);
      await runOf(schedule.id);
      expect((await scheduler.get(schedule.id))?.suspendedAt).not.toBeNull();

      await clock.tick(60_000);
      await scheduler.resume(schedule.id, by);
      await runOf(schedule.id);
      const once = await scheduler.get(schedule.id);
      expect([once?.suspendedAt, once?.failuresInARow]).toEqual([null, 1]);
      await runOf(schedule.id);
      expect((await scheduler.get(schedule.id))?.failuresInARow).toBe(2);
      expect((await scheduler.get(schedule.id))?.suspendedAt).toEqual(new Date(clock.now()));
    });

    it('takes a whole number of 1 or more, 3 unless set, with no “never”', async () => {
      await clock.setTime(new Date('2026-10-05T04:00:00Z'));
      await started();
      const plain = await scheduler.create(newSchedule(), by);
      made.push(plain.id);
      expect(plain.suspendAfter).toBe(3);

      // Past what the table holds too (T379's review).
      for (const suspendAfter of [0, -1, 1.5, 'never', null, 2_147_483_648])
        await expect(
          scheduler.create(newSchedule({ suspendAfter }), by),
          String(suspendAfter),
        ).rejects.toThrow('Suspend it after a whole number of failed runs in a row, 1 or more.');
      expect(
        await getDb()
          .selectFrom('schedules')
          .select('id')
          .where('pre_aggregation', '=', PRE_AGGREGATION)
          .execute(),
      ).toEqual([{ id: plain.id }]);
    });
  },
);
