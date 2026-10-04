import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable } from 'kysely';
import type { PgBoss } from 'pg-boss';

import type { CubeClient } from '../cube/client';
import type { Database, ScheduleTable } from '../db/schema';
import type { BuildHistory } from '../repos/build-history';
import { buildablesFrom } from '../jobs/build';
import { previewOf, readCron, unknownZone, zoneNamed, type Preview } from './cron';

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

export interface Schedule {
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
}

/** What a person sets: the rest is wechart's. */
export interface ScheduleFields {
  readonly name: string;
  readonly preAggregation: string;
  readonly folderId: string | null;
  readonly cron: string;
  readonly timezone: string;
  readonly missed?: 'once' | 'skip';
}

/** A schedule refused, in the words the form shows (design 16, D3). */
export class ScheduleRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleRefused';
  }
}

const rowOf = (row: Selectable<ScheduleTable>): Schedule => ({
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
});

/** wechart's schedules, as stored. */
export function scheduleStore(db: Kysely<Database>) {
  return {
    async get(id: string): Promise<Schedule | undefined> {
      const row = await db
        .selectFrom('schedules')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : rowOf(row);
    },
    async list(): Promise<Schedule[]> {
      const rows = await db
        .selectFrom('schedules')
        .selectAll()
        .orderBy('name')
        .orderBy('id')
        .execute();
      return rows.map(rowOf);
    },
    async insert(schedule: Schedule): Promise<void> {
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
          created_by_key: schedule.createdBy.key,
          created_by_name: schedule.createdBy.name,
          created_at: schedule.createdAt,
          updated_by_key: schedule.updatedBy.key,
          updated_by_name: schedule.updatedBy.name,
          updated_at: schedule.updatedAt,
        })
        .execute();
    },
    async update(schedule: Schedule): Promise<boolean> {
      const result = await db
        .updateTable('schedules')
        .set({
          name: schedule.name,
          pre_aggregation: schedule.preAggregation,
          folder_id: schedule.folderId,
          cron: schedule.cron,
          timezone: schedule.timezone,
          missed: schedule.missed,
          updated_by_key: schedule.updatedBy.key,
          updated_by_name: schedule.updatedBy.name,
          updated_at: schedule.updatedAt,
        })
        .where('id', '=', schedule.id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
    async remove(id: string): Promise<boolean> {
      const result = await db.deleteFrom('schedules').where('id', '=', id).executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
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
  return {
    name,
    preAggregation: fields.preAggregation,
    folderId: fields.folderId,
    cron,
    timezone,
    missed,
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
  /** One run of a schedule, as pg-boss hands it out: exported for its tests. */
  run(scheduleId: string, runId: string): Promise<void>;
}

export function wechartScheduler({
  boss,
  store,
  history,
  cube,
  now = () => new Date(),
  pollingIntervalSeconds = 2,
  onError = () => undefined,
}: {
  readonly boss: PgBoss;
  readonly store: ScheduleStore;
  /** Where each run is recorded (T372); none, and runs aren't recorded. */
  readonly history?: BuildHistory;
  /** With the service credential, as Jobs builds (T420). */
  readonly cube: CubeClient;
  readonly now?: () => Date;
  readonly pollingIntervalSeconds?: number;
  readonly onError?: (error: unknown) => void;
}): WechartScheduler {
  /** pg-boss's schedule for one of wechart's: its times, its zone, its missed-run policy. */
  const lay = (schedule: Schedule) =>
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

  const run = async (scheduleId: string, runId: string) => {
    // Deleted since pg-boss sent it: nothing to run.
    const schedule = await store.get(scheduleId);
    if (schedule === undefined) return;
    // pg-boss hands a run out at least once (research scheduler.md): its id
    // names the post, so one handed out again isn't started twice.
    const requestId = `wechart-schedule-${runId}`;
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
      // Said, and the run failed: pg-boss records it so (T379 counts it).
      const said = error instanceof Error ? error.message : String(error);
      onError(new Error(`“${schedule.name}” could not start its run: ${said}`, { cause: error }));
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
      const schedules = await store.list();
      for (const schedule of schedules) {
        const held = laid.get(schedule.id);
        if (
          held === undefined ||
          held.cron !== schedule.cron ||
          held.timezone !== schedule.timezone ||
          held.options?.missed !== schedule.missed
        )
          await lay(schedule);
      }
      const kept = new Set(schedules.map((schedule) => schedule.id));
      for (const key of laid.keys())
        if (!kept.has(key) && (await store.get(key)) === undefined)
          await boss.unschedule(RUN_QUEUE, key);
    },
    async stop() {
      await boss.stop({ graceful: true });
    },
    get: (id) => store.get(id),
    list: () => store.list(),
    async create(fields, by) {
      const checked = checkedFields(fields);
      const at = now();
      const schedule: Schedule = {
        id: randomUUID(),
        ...checked,
        createdBy: by,
        createdAt: at,
        updatedBy: by,
        updatedAt: at,
      };
      await store.insert(schedule);
      try {
        await lay(schedule);
      } catch (error) {
        await store.remove(schedule.id);
        throw error;
      }
      return schedule;
    },
    async change(id, fields, by) {
      const was = await store.get(id);
      if (was === undefined) return undefined;
      const schedule: Schedule = {
        ...was,
        // A missed-run choice left out stays as it was.
        ...checkedFields({ ...fields, missed: fields.missed ?? was.missed }),
        updatedBy: by,
        updatedAt: now(),
      };
      // Deleted meanwhile: nothing to lay again.
      if (!(await store.update(schedule))) return undefined;
      // At once, with no proposal (AC-234): pg-boss's schedule replaced.
      await lay(schedule);
      return schedule;
    },
    async remove(id) {
      const removed = await store.remove(id);
      await boss.unschedule(RUN_QUEUE, id);
      return removed;
    },
    run,
  };
}
