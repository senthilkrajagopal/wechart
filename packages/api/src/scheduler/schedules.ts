import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable } from 'kysely';
import type { PgBoss } from 'pg-boss';

import { scheduleChangeEntry, WECHART_SCHEDULER } from '../audit/record';
import type { CubeClient } from '../cube/client';
import type { Database, ScheduleTable } from '../db/schema';
import type { AuditStore } from '../repos/audit';
import type { BuildHistory } from '../repos/build-history';
import { buildablesFrom } from '../jobs/build';
import { previewOf, readCron, unknownZone, zoneNamed, type Preview } from './cron';
import { failuresOf, SUSPEND_AFTER, SUSPEND_AFTER_REFUSAL, suspendAfterOf } from './suspend';

/**
 * wechart's own schedules (T378, AC-234; design 16, screen 2, Q7, Q8, Q10).
 * Each builds every partition of one pre-aggregation at its cron's times, in
 * its zone, through Cube's jobs API (Build all), and each run is one start in
 * Run history, started by the schedule (T372). pg-boss keeps the times
 * (research scheduler.md; pg-boss-12.33.2-installed.md): one pg-boss schedule
 * per wechart schedule, keyed by its id, on one queue, so its database
 * coordination starts each due run once however many API replicas run
 * (AC-319), and its `missed` policy runs a run missed while wechart was
 * stopped once, or skips it (Q8). wechart's table is what a schedule is;
 * pg-boss's rows follow it, and are laid again from it at each start.
 */
export const RUN_QUEUE = 'wechart-schedule-run';

/** How long pg-boss keeps an occurrence due (research pg-boss-12.33.2-installed.md). */
const DUE_WINDOW_MS = 60_000;

/** A schedule as stored. */
export interface StoredSchedule {
  readonly id: string;
  readonly name: string;
  readonly preAggregation: string;
  readonly folderId: string | null;
  readonly cron: string;
  readonly timezone: string;
  readonly missed: 'once' | 'skip';
  readonly createdBy: { readonly key: string; readonly name: string };
  readonly createdAt: Date;
  readonly updatedBy: { readonly key: string; readonly name: string };
  readonly updatedAt: Date;
  /** How many failed runs in a row suspend it (T379, AC-155). */
  readonly suspendAfter: number;
  /** Its failures in a row are counted from runs started after it: Resume's. */
  readonly countedFrom: Date | null;
  /** When it was suspended, and Cube's last error then; none while it runs. */
  readonly suspendedAt: Date | null;
  readonly suspendedError: string | null;
  /** Paused by hand, when and by whom (T556, AC-396); none while it runs. */
  readonly pausedAt: Date | null;
  readonly pausedBy: { readonly key: string; readonly name: string } | null;
  /**
   * When it was last laid in pg-boss: made, changed, resumed or unpaused.
   * No occurrence before it runs (pg-boss's due window; T556). None for one
   * laid before T556.
   */
  readonly runsFrom: Date | null;
}

/** A schedule, with how many of its runs have failed in a row (T379). */
export interface Schedule extends StoredSchedule {
  readonly failuresInARow: number;
}

/** What a person sets: the rest is wechart's. */
export interface ScheduleFields {
  readonly name: string;
  readonly preAggregation: string;
  readonly folderId: string | null;
  readonly cron: string;
  readonly timezone: string;
  readonly missed?: 'once' | 'skip';
  /** A whole number of 1 or more; 3 unless set (T379, Q9). */
  readonly suspendAfter?: number;
}

/** A schedule refused, in the words the form shows (design 16, D3). */
export class ScheduleRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleRefused';
  }
}

const rowOf = (row: Selectable<ScheduleTable>): StoredSchedule => ({
  id: row.id,
  name: row.name,
  preAggregation: row.pre_aggregation,
  folderId: row.folder_id,
  cron: row.cron,
  timezone: row.timezone,
  missed: row.missed === 'skip' ? 'skip' : 'once',
  createdBy: { key: row.created_by_key, name: row.created_by_name },
  createdAt: row.created_at,
  updatedBy: { key: row.updated_by_key, name: row.updated_by_name },
  updatedAt: row.updated_at,
  suspendAfter: row.suspend_after,
  countedFrom: row.counted_from,
  suspendedAt: row.suspended_at,
  suspendedError: row.suspended_error,
  pausedAt: row.paused_at,
  pausedBy:
    row.paused_by_key === null ? null : { key: row.paused_by_key, name: row.paused_by_name ?? '' },
  runsFrom: row.runs_from,
});

/**
 * wechart's schedules, as stored. A test's store sees only the schedules
 * whose names hold its mark (`named`): its scheduler lays and runs those
 * alone, never another test file's in the same database.
 */
export function scheduleStore(db: Kysely<Database>, { named }: { readonly named?: string } = {}) {
  const scoped = () => {
    const query = db.selectFrom('schedules').selectAll();
    return named === undefined ? query : query.where('name', 'like', `%${named}%`);
  };
  return {
    async get(id: string): Promise<StoredSchedule | undefined> {
      const row = await scoped().where('id', '=', id).executeTakeFirst();
      return row === undefined ? undefined : rowOf(row);
    },
    async list(): Promise<StoredSchedule[]> {
      const rows = await scoped().orderBy('name').orderBy('id').execute();
      return rows.map(rowOf);
    },
    async insert(schedule: StoredSchedule): Promise<void> {
      await db
        .insertInto('schedules')
        .values({
          id: schedule.id,
          name: schedule.name,
          pre_aggregation: schedule.preAggregation,
          folder_id: schedule.folderId,
          cron: schedule.cron,
          timezone: schedule.timezone,
          missed: schedule.missed,
          suspend_after: schedule.suspendAfter,
          created_by_key: schedule.createdBy.key,
          created_by_name: schedule.createdBy.name,
          created_at: schedule.createdAt,
          updated_by_key: schedule.updatedBy.key,
          updated_by_name: schedule.updatedBy.name,
          updated_at: schedule.updatedAt,
          runs_from: schedule.runsFrom,
        })
        .execute();
    },
    async update(schedule: StoredSchedule): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({
          name: schedule.name,
          pre_aggregation: schedule.preAggregation,
          folder_id: schedule.folderId,
          cron: schedule.cron,
          timezone: schedule.timezone,
          missed: schedule.missed,
          suspend_after: schedule.suspendAfter,
          updated_by_key: schedule.updatedBy.key,
          updated_by_name: schedule.updatedBy.name,
          updated_at: schedule.updatedAt,
          runs_from: schedule.runsFrom,
        })
        .where('id', '=', schedule.id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
    async remove(id: string): Promise<boolean> {
      const result = await db.deleteFrom('schedules').where('id', '=', id).executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
    /** Suspended now, with Cube's last error, unless it already is: whether this suspended it. */
    async suspend(id: string, at: Date, error: string | null): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({ suspended_at: at, suspended_error: error })
        .where('id', '=', id)
        .where('suspended_at', 'is', null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
    /**
     * Resumed by `by` at `at` (T379): running again, its failures in a row
     * counted from then on. Whether it was suspended to resume.
     */
    async resume(id: string, at: Date, by: { key: string; name: string }): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({
          suspended_at: null,
          suspended_error: null,
          counted_from: at,
          // Laid again now: no time before this runs (pg-boss's due window; T556).
          runs_from: at,
          updated_by_key: by.key,
          updated_by_name: by.name,
          updated_at: at,
        })
        .where('id', '=', id)
        .where('suspended_at', 'is not', null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
    /** Paused by `by` at `at` (T556), unless it already is: whether this paused it. */
    async pause(id: string, at: Date, by: { key: string; name: string }): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({ paused_at: at, paused_by_key: by.key, paused_by_name: by.name })
        .where('id', '=', id)
        .where('paused_at', 'is', null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
    /**
     * Running again (T556), its count of failures in a row as it was (R59):
     * `counted_from` is left alone. As a pause, it changes none of its
     * fields, so when it was last changed stays (T556's review). Whether it
     * was paused to unpause.
     */
    async unpause(id: string, at: Date): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({
          paused_at: null,
          paused_by_key: null,
          paused_by_name: null,
          // Laid again now: no time that fell while paused runs (pg-boss's due window).
          runs_from: at,
        })
        .where('id', '=', id)
        .where('paused_at', 'is not', null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
  };
}
export type ScheduleStore = ReturnType<typeof scheduleStore>;

/** A schedule's fields, checked as AC-234 says, or refused with the reason. */
export function checkedFields(
  fields: ScheduleFields,
  preview: Preview = previewOf,
): Required<ScheduleFields> {
  const name = fields.name.trim();
  if (name === '') throw new ScheduleRefused('Name it: its name names its runs in Run history.');
  const typed = fields.timezone.trim();
  // Required, and starts empty (AC-234).
  if (typed === '') throw new ScheduleRefused('Choose the time zone its times are in.');
  const unknown = new ScheduleRefused(unknownZone(typed));
  const timezone = zoneNamed(typed);
  if (timezone === undefined) throw unknown;
  const read = readCron(fields.cron, preview);
  if (!read.ok) throw new ScheduleRefused(read.problem);
  const cron = fields.cron.trim().split(/\s+/).join(' ');
  // And one pg-boss takes in that zone, as `schedule()` will (research
  // pg-boss-12.33.2-installed.md): the cron already reads, so a refusal is the zone's.
  try {
    preview(cron, timezone, new Date(0), 1);
  } catch {
    throw unknown;
  }
  const missed = fields.missed ?? 'once';
  if (missed !== 'once' && missed !== 'skip')
    throw new ScheduleRefused('A missed run is run once, or skipped.');
  // A whole number from 1 up, 3 unless set, with no "never" (T379, Q9).
  const suspendAfter = suspendAfterOf(
    'suspendAfter' in fields ? fields.suspendAfter : SUSPEND_AFTER,
  );
  if (suspendAfter === undefined) throw new ScheduleRefused(SUSPEND_AFTER_REFUSAL);
  return {
    name,
    preAggregation: fields.preAggregation,
    folderId: fields.folderId,
    cron,
    timezone,
    missed,
    suspendAfter,
  };
}

export interface WechartScheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
  get(id: string): Promise<Schedule | undefined>;
  list(): Promise<Schedule[]>;
  create(fields: ScheduleFields, by: { key: string; name: string }): Promise<Schedule>;
  change(
    id: string,
    fields: ScheduleFields,
    by: { key: string; name: string },
  ): Promise<Schedule | undefined>;
  remove(id: string): Promise<boolean>;
  /**
   * Resumes a suspended schedule (T379, AC-155): from its next time, with
   * its count of failures at 0. None where there's no such schedule; one
   * not suspended is answered as it is.
   */
  resume(id: string, by: { key: string; name: string }): Promise<Schedule | undefined>;
  /** Builds that ended, as the follower closed them: a schedule's failed one counted (T379). */
  ended(closed: readonly { runId: string; outcome: string }[]): Promise<void>;
  /**
   * Pauses it by hand (T556, AC-396; design 16, P3): it starts none of its
   * runs until unpaused, and names who paused it. None where there's no such
   * schedule; one already paused is answered as it is.
   */
  pause(id: string, by: { key: string; name: string }): Promise<Schedule | undefined>;
  /**
   * Resumes one paused by hand (T556): from its first time after now, none
   * that fell while it was paused, its count of failures kept (R59). One
   * suspended too stays suspended until its own Resume. As a pause, it
   * changes none of its fields: who resumed it is in the audit trail.
   */
  unpause(id: string): Promise<Schedule | undefined>;
  /**
   * Run now (T555, AC-395; design 16, P2): the schedule's build at once,
   * every partition as its runs build, outside its times, which it leaves
   * alone; offered on a suspended schedule too (R59). Recorded in Run history
   * as Run now on the schedule, by `by`. It isn't one of its runs: neither a
   * failure nor a success of it moves the count that suspends it (R59). None
   * where there's no such schedule; Cube's refusal, recorded, is thrown.
   */
  runNow(
    id: string,
    by: { key: string; name: string },
  ): Promise<
    | {
        readonly schedule: Schedule;
        readonly runId: string | null;
        readonly tokens: readonly string[];
        readonly granularity: string | null;
      }
    | undefined
  >;
  /** One run of a schedule, as pg-boss hands it out: exported for its tests. */
  run(scheduleId: string, runId: string): Promise<void>;
}

export function wechartScheduler({
  boss,
  store,
  history,
  cube,
  audit,
  now = () => new Date(),
  pollingIntervalSeconds = 2,
  onError = () => undefined,
}: {
  readonly boss: PgBoss;
  readonly store: ScheduleStore;
  /** Where each run is recorded (T372); none, and runs aren't recorded. */
  readonly history?: BuildHistory;
  /**
   * Where a suspension is recorded, by wechart's scheduler (T505, Q12); none,
   * and it isn't. The runs it starts aren't: Run history has them.
   */
  readonly audit?: Pick<AuditStore, 'record'>;
  /** With the service credential, as Jobs builds (T420). */
  readonly cube: CubeClient;
  readonly now?: () => Date;
  readonly pollingIntervalSeconds?: number;
  readonly onError?: (error: unknown) => void;
}): WechartScheduler {
  /** Whether it runs at its times: neither suspended (T379) nor paused by hand (T556). */
  const runs = (schedule: StoredSchedule) =>
    schedule.suspendedAt === null && schedule.pausedAt === null;

  /**
   * The time the run pg-boss hands out now is for, as far as it can be read
   * (T556): a run names none, so its latest time in the due window, the last
   * 60 s, read with a margin for a run handed out late (research
   * pg-boss-12.33.2-installed.md, "The job names no occurrence"). None for a
   * run caught up after wechart was stopped, older than the window.
   */
  const dueTimeOf = (schedule: StoredSchedule): Date | undefined => {
    const at = now();
    return previewOf(
      schedule.cron,
      schedule.timezone,
      new Date(at.getTime() - 2 * DUE_WINDOW_MS),
      120,
    )
      .filter((time) => time.getTime() <= at.getTime())
      .at(-1);
  };

  /** pg-boss's schedule for one of wechart's: its times, its zone, its missed-run policy. */
  const lay = (schedule: StoredSchedule) =>
    boss.schedule(
      RUN_QUEUE,
      schedule.cron,
      { scheduleId: schedule.id },
      { tz: schedule.timezone, key: schedule.id, missed: schedule.missed },
    );

  /**
   * How its rollup is partitioned, from the model xcube serves, as Build all
   * records it (T372): Run history says "every partition" by it. None where
   * the model can't be read or no longer has it, which the run then finds.
   */
  const granularityOf = async (preAggregation: string): Promise<string | null> => {
    try {
      const row = buildablesFrom(await cube.modelMeta()).find((each) => each.id === preAggregation);
      return row?.partitionGranularity ?? null;
    } catch {
      return null;
    }
  };

  /** With its count of failures in a row, from Run history (T379). */
  const counted = async (schedule: StoredSchedule): Promise<Schedule> => ({
    ...schedule,
    failuresInARow: history === undefined ? 0 : (await failuresOf(history, schedule)).count,
  });

  /**
   * After one of its runs failed (T379, AC-155): at its number in a row, it
   * is suspended, with Cube's last error, and pg-boss starts no more of its
   * runs. Once, however many replicas ask.
   */
  /** Whether it is suspended, now or already. */
  const counting = async (scheduleId: string): Promise<boolean> => {
    if (history === undefined) return false;
    const schedule = await store.get(scheduleId);
    if (schedule === undefined) return false;
    if (schedule.suspendedAt !== null) return true;
    const { count, lastError } = await failuresOf(history, schedule);
    if (count < schedule.suspendAfter) return false;
    if (await store.suspend(schedule.id, now(), lastError)) {
      await boss.unschedule(RUN_QUEUE, schedule.id);
      // In the audit trail, by wechart's scheduler, after how many failures (T505, Q12).
      await audit
        ?.record(
          scheduleChangeEntry(WECHART_SCHEDULER, schedule, {
            change: 'suspended',
            failures: count,
            error: lastError,
          }),
        )
        // Suspended either way: the miss said.
        .catch(onError);
    }
    return true;
  };

  const run = async (scheduleId: string, runId: string) => {
    // Deleted since pg-boss sent it, suspended (T379) or paused (T556): nothing to run.
    const schedule = await store.get(scheduleId);
    if (schedule === undefined || !runs(schedule)) return;
    // A time from before it was last laid, which pg-boss sends when a
    // schedule is laid within a minute after it (research
    // pg-boss-12.33.2-installed.md, "The due window"): not one of its runs (T556).
    const due = dueTimeOf(schedule);
    if (due !== undefined && schedule.runsFrom !== null && due < schedule.runsFrom) return;
    // At its number already, however the count got there — a lowered number,
    // or a failure whose count a replica didn't finish: suspended, not run
    // (T379's review).
    if (await counting(schedule.id)) return;
    // pg-boss hands a run out at least once (research scheduler.md): its id
    // names the post, so one handed out again isn't started twice. A time in
    // the due window names it instead, so two runs read as one time start
    // once: a late one folds into the next (T556's review, the coordinator's
    // call). One caught up, older, is named by its run.
    const requestId =
      due === undefined
        ? `wechart-schedule-${runId}`
        : `wechart-schedule-${schedule.id}-${due.toISOString()}`;
    if (history !== undefined) {
      const already = await history.startsFor({ requestIds: [requestId], tokens: [] });
      if (already.length > 0) return;
    }
    // Read before the post, so nothing after it can leave a build unrecorded (T372's review).
    const granularity = history === undefined ? null : await granularityOf(schedule.preAggregation);
    const startedAt = now();
    // Every partition, as Build all does (Q7), in the model xcube serves (T421).
    let answered: unknown;
    try {
      answered = await cube.buildPreAggregations([schedule.preAggregation], { requestId });
    } catch (error) {
      // Said, and the run failed: pg-boss records it so. Recorded in Run
      // history, Cube's words and all, and counted (T379; design 16, E4).
      const said = error instanceof Error ? error.message : String(error);
      onError(new Error(`“${schedule.name}” could not start its run: ${said}`, { cause: error }));
      if (history !== undefined) {
        await history.refused({
          preAggregation: schedule.preAggregation,
          folderId: schedule.folderId,
          granularity,
          via: 'schedule',
          starter: { kind: 'schedule', id: schedule.id, name: schedule.name },
          requestId,
          startedAt,
          error: said,
        });
        await counting(schedule.id);
      }
      throw error;
    }
    const tokens = Array.isArray(answered)
      ? answered.filter((each): each is string => typeof each === 'string')
      : [];
    // A start that made no job built nothing, and isn't recorded (T372).
    if (history === undefined || tokens.length === 0) return;
    await history.start({
      preAggregation: schedule.preAggregation,
      folderId: schedule.folderId,
      partitions: null,
      granularity,
      via: 'schedule',
      starter: { kind: 'schedule', id: schedule.id, name: schedule.name },
      requestId,
      tokens,
      startedAt,
      answeredAt: now(),
    });
  };

  return {
    async start() {
      boss.on('error', onError);
      await boss.start();
      // A run Cube refused is a failed run, which T379 counts, not one to try
      // again: its request id guards only a start that was recorded.
      await boss.createQueue(RUN_QUEUE, { retryLimit: 0 });
      await boss.work<{ scheduleId?: unknown }>(
        RUN_QUEUE,
        { pollingIntervalSeconds },
        async (jobs) => {
          for (const job of jobs)
            if (typeof job.data?.scheduleId === 'string') await run(job.data.scheduleId, job.id);
        },
      );
      /**
       * pg-boss's schedules follow wechart's rows (T378's review): what
       * pg-boss holds is read first, then the rows, so one another replica
       * made or changed meanwhile is in the rows if it is laid. Only a row
       * pg-boss lacks, or holds otherwise, is laid; one pg-boss holds for a
       * row that is gone, read again to be sure, is dropped.
       */
      const laid = new Map((await boss.getSchedules(RUN_QUEUE)).map((each) => [each.key, each]));
      // A suspended (T379) or paused (T556) one is laid only when resumed.
      const running = (await store.list()).filter(runs);
      for (const schedule of running) {
        const held = laid.get(schedule.id);
        if (
          held === undefined ||
          held.cron !== schedule.cron ||
          held.timezone !== schedule.timezone ||
          held.options?.missed !== schedule.missed
        )
          await lay(schedule);
      }
      const kept = new Set(running.map((schedule) => schedule.id));
      for (const key of laid.keys()) {
        if (kept.has(key)) continue;
        const stored = await store.get(key);
        if (stored === undefined || !runs(stored)) await boss.unschedule(RUN_QUEUE, key);
      }
    },
    async stop() {
      await boss.stop({ graceful: true });
    },
    async get(id) {
      const schedule = await store.get(id);
      return schedule === undefined ? undefined : counted(schedule);
    },
    async list() {
      return Promise.all((await store.list()).map(counted));
    },
    async create(fields, by) {
      const checked = checkedFields(fields);
      const at = now();
      const schedule: StoredSchedule = {
        id: randomUUID(),
        ...checked,
        createdBy: by,
        createdAt: at,
        updatedBy: by,
        updatedAt: at,
        countedFrom: null,
        suspendedAt: null,
        suspendedError: null,
        pausedAt: null,
        pausedBy: null,
        runsFrom: at,
      };
      await store.insert(schedule);
      try {
        await lay(schedule);
      } catch (error) {
        await store.remove(schedule.id);
        throw error;
      }
      return { ...schedule, failuresInARow: 0 };
    },
    async change(id, fields, by) {
      const was = await store.get(id);
      if (was === undefined) return undefined;
      // A missed-run choice, or a number to suspend after, left out stays as it was.
      const checked = checkedFields({
        ...fields,
        missed: fields.missed ?? was.missed,
        suspendAfter: 'suspendAfter' in fields ? fields.suspendAfter : was.suspendAfter,
      });
      const at = now();
      const schedule: StoredSchedule = {
        ...was,
        ...checked,
        updatedBy: by,
        updatedAt: at,
        // New times run from the change: none of them before it (pg-boss's
        // due window; T556). Times kept are as they were, so one just due
        // still runs (T556's review, AC-234).
        runsFrom:
          checked.cron === was.cron && checked.timezone === was.timezone ? was.runsFrom : at,
      };
      // Deleted meanwhile: nothing to lay again.
      if (!(await store.update(schedule))) return undefined;
      // At once, with no proposal (AC-234): pg-boss's schedule replaced; a
      // suspended (T379) or paused (T556) one's stays off until it's resumed.
      if (runs(schedule)) await lay(schedule);
      return counted(schedule);
    },
    async remove(id) {
      const removed = await store.remove(id);
      await boss.unschedule(RUN_QUEUE, id);
      return removed;
    },
    async resume(id, by) {
      const at = now();
      if (await store.resume(id, at, by)) {
        const resumed = await store.get(id);
        // Laid again, new: its next time after now, none missed while it was
        // off; still off while paused by hand (T556).
        if (resumed !== undefined && runs(resumed)) await lay(resumed);
      }
      const schedule = await store.get(id);
      return schedule === undefined ? undefined : counted(schedule);
    },
    async pause(id, by) {
      if (await store.pause(id, now(), by)) await boss.unschedule(RUN_QUEUE, id);
      const schedule = await store.get(id);
      return schedule === undefined ? undefined : counted(schedule);
    },
    async unpause(id) {
      // Its count as it was (R59): only a suspension's Resume starts it again.
      // Who resumed it is in the audit trail (AC-294).
      if (await store.unpause(id, now())) {
        const unpaused = await store.get(id);
        // Laid again, new: its first time after now, none that fell while paused.
        if (unpaused !== undefined && runs(unpaused)) await lay(unpaused);
      }
      const schedule = await store.get(id);
      return schedule === undefined ? undefined : counted(schedule);
    },
    async ended(closed) {
      if (history === undefined) return;
      for (const { runId, outcome } of closed) {
        // Only a failure can suspend; a done one starts the count again by itself.
        if (outcome !== 'failed') continue;
        try {
          const build = await history.get(runId);
          if (build?.via === 'schedule' && build.starter.kind === 'schedule')
            await counting(build.starter.id);
        } catch (error) {
          // Said, and the rest counted: the next run's start counts it again.
          onError(error);
        }
      }
    },
    async runNow(id, by) {
      const stored = await store.get(id);
      if (stored === undefined) return undefined;
      const schedule = await counted(stored);
      const requestId = `wechart-run-now-${randomUUID()}`;
      const starter = { kind: 'schedule' as const, id: schedule.id, name: schedule.name, by };
      // Read before the post, as a run's is (T372's review).
      const granularity = await granularityOf(schedule.preAggregation);
      const startedAt = now();
      let answered: unknown;
      try {
        answered = await cube.buildPreAggregations([schedule.preAggregation], { requestId });
      } catch (error) {
        // Recorded failed, Cube's words and all, and not counted: it isn't a run (R59).
        await history?.refused({
          preAggregation: schedule.preAggregation,
          folderId: schedule.folderId,
          granularity,
          via: 'run-now',
          starter,
          requestId,
          startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const tokens = Array.isArray(answered)
        ? answered.filter((each): each is string => typeof each === 'string')
        : [];
      // A start that made no job built nothing, and isn't recorded (T372).
      const runId =
        history === undefined || tokens.length === 0
          ? null
          : await history.start({
              preAggregation: schedule.preAggregation,
              folderId: schedule.folderId,
              partitions: null,
              granularity,
              via: 'run-now',
              starter,
              requestId,
              tokens,
              startedAt,
              answeredAt: now(),
            });
      return { schedule, runId, tokens, granularity };
    },
    run,
  };
}
