import { randomUUID } from 'node:crypto';

import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * The builds wechart starts through Cube's jobs API, kept in wechart (T372,
 * AC-150): one record per start (design 16's Q6), with the jobs Cube made for
 * it — one per partition — and each state Cube reported for each, with when
 * wechart saw it. Cube keeps a job's record about a day after its last change
 * (research cube/job-records.md, "Retention"); these outlast it.
 *
 * Any API replica follows any build (AC-319): a follower takes open jobs on a
 * lease, so no two ask Cube for one at once, and writes each state it sees
 * only if the job still holds the state it saw before. An `UPDATE` whose
 * `WHERE` no longer holds once a concurrent writer commits writes nothing
 * (research db-access.md §3), so every write lands once.
 */

/** Who or what started a build: a person, or a wechart schedule. */
export type Starter =
  | { readonly kind: 'person'; readonly key: string; readonly name: string }
  | { readonly kind: 'schedule'; readonly id: string; readonly name: string };

/** How it was started: Build all (Build now, when not partitioned), Rebuild selected, or a schedule's run. */
export type BuildVia = 'build-all' | 'rebuild-selected' | 'schedule';

/**
 * How a build ended: done; failed; cancelled from the queue (T376); or Cube's
 * record expired before its end was seen.
 */
export type BuildOutcome = 'done' | 'failed' | 'cancelled' | 'expired';

export interface NewBuild {
  /** Its published name, as the jobs API names it. */
  readonly preAggregation: string;
  /** Its cube's folder (T371); none for one wechart no longer knows. */
  readonly folderId: string | null;
  /** The partitions asked for, by their starts; none for every partition. */
  readonly partitions: readonly string[] | null;
  /** How its pre-aggregation is partitioned; none when it isn't. */
  readonly granularity: string | null;
  readonly via: BuildVia;
  readonly starter: Starter;
  /** The `x-request-id` its post carried. */
  readonly requestId: string;
  /** Cube's tokens, one per job, in the order Cube gave them: one at least. */
  readonly tokens: readonly string[];
  /** When wechart asked Cube. */
  readonly startedAt: Date;
  /** When Cube answered with the jobs. */
  readonly answeredAt: Date;
}

/** One state Cube reported for a job, and when wechart saw it. */
export interface LogEntry {
  readonly at: Date;
  readonly status: string;
  readonly table?: string;
}

export interface TokenRecord {
  readonly token: string;
  /** The last state Cube reported; none before the first. */
  readonly status: string | null;
  /** The Cube Store table it builds. */
  readonly table: string | null;
  readonly finished: boolean;
  readonly finishedAt: Date | null;
  readonly log: readonly LogEntry[];
}

export interface BuildRecord {
  readonly id: string;
  readonly preAggregation: string;
  readonly folderId: string | null;
  readonly partitions: readonly string[] | null;
  readonly granularity: string | null;
  readonly via: BuildVia;
  readonly starter: Starter;
  readonly requestId: string;
  readonly startedAt: Date;
  readonly answeredAt: Date;
  /** When wechart saw its last job end; none while open, or when how it ended isn't known. */
  readonly endedAt: Date | null;
  /** From its start to its end, as wechart saw them. */
  readonly durationMs: number | null;
  /** None while it is open. */
  readonly outcome: BuildOutcome | null;
  /** How many of its partitions failed. */
  readonly failedCount: number | null;
  /** Cube's error, as Cube said it. */
  readonly error: string | null;
  /** Who cancelled it from the queue, and when (T376); none otherwise. */
  readonly cancelledBy: { readonly key: string; readonly name: string } | null;
  readonly cancelledAt: Date | null;
  readonly tokens: readonly TokenRecord[];
}

/** An open job a follower holds. */
export interface OpenToken {
  readonly runId: string;
  readonly token: string;
  /** The last state wechart saw. */
  readonly status: string | null;
  /** When Cube answered the post that made it. */
  readonly answeredAt: Date;
  /** Until when this follower holds it: only that hold is handed back. */
  readonly heldUntil: Date;
}

/** A state a follower saw for a job. */
export interface StateSeen {
  readonly runId: string;
  readonly token: string;
  /** The state the job held when the follower took it: written only if it still does. */
  readonly previous: string | null;
  readonly status: string;
  readonly table?: string;
  readonly at: Date;
  /** Whether Cube will report no other: the job has ended. */
  readonly final: boolean;
}

/** The latest records of each pre-aggregation that are kept (AC-150). */
export const KEPT_PER_PRE_AGGREGATION = 100;

/** Run history's page: 50 builds at a time (AC-150). */
export const BUILDS_PAGE = 50;

/** What Run history is narrowed by (T374, AC-150). */
export interface BuildListFilters {
  /** An outcome, or `open` for a build not yet ended. */
  readonly outcome?: BuildOutcome | 'cancelled' | 'open';
  /** A person by their key, or a schedule by its id. */
  readonly starter?: { readonly kind: 'person' | 'schedule'; readonly id: string };
  readonly folderIds?: readonly string[];
  /** Started then or later. */
  readonly since?: Date;
  /** One pre-aggregation's, by its published name (T375: its pane's builds). */
  readonly preAggregation?: string;
}

/** A build as Run history lists it: its record without its jobs, with how many there are and how far they've got. */
export type BuildSummary = Omit<BuildRecord, 'tokens' | 'requestId' | 'answeredAt'> & {
  readonly jobs: number;
  /** Its jobs ended, and building. */
  readonly progress: { readonly done: number; readonly building: number };
};

type RunRow = {
  id: string;
  pre_aggregation: string;
  folder_id: string | null;
  partitions: string[] | null;
  partition_granularity: string | null;
  via: string;
  starter_kind: string;
  starter_key: string | null;
  starter_name: string | null;
  schedule_id: string | null;
  schedule_name: string | null;
  started_at: Date;
  ended_at: Date | null;
  outcome: string | null;
  failed_count: number | null;
  error: string | null;
};

/** Who cancelled a build from the queue (T376), or none. */
const cancellerOf = (row: {
  readonly cancelled_by_key: string | null;
  readonly cancelled_by_name: string | null;
}) =>
  row.cancelled_by_key === null
    ? null
    : { key: row.cancelled_by_key, name: row.cancelled_by_name ?? '' };

const starterOf = (
  row: Pick<
    RunRow,
    'starter_kind' | 'starter_key' | 'starter_name' | 'schedule_id' | 'schedule_name'
  >,
): Starter =>
  row.starter_kind === 'schedule'
    ? { kind: 'schedule', id: row.schedule_id ?? '', name: row.schedule_name ?? '' }
    : { kind: 'person', key: row.starter_key ?? '', name: row.starter_name ?? '' };

/**
 * A job's end, as its final state says it: failed — `failure: …`, its
 * partition missing, or its pre-aggregation gone from the model — expired,
 * Cube no longer knowing it; or done (research cube/job-records.md, "Status
 * values").
 */
export function endOf(status: string): BuildOutcome {
  if (status === 'done') return 'done';
  if (status === 'not_found') return 'expired';
  // wechart's own state for a job taken out of the queue (T376).
  if (status === 'cancelled') return 'cancelled';
  return 'failed';
}

/**
 * A build's outcome from its jobs' ends: failed when any partition failed;
 * otherwise cancelled when any job was cancelled (T376); otherwise Cube's
 * record expired when any job's end wasn't seen, which is neither done nor
 * failed; otherwise done.
 */
export function outcomeOf(ends: readonly BuildOutcome[]): BuildOutcome {
  if (ends.includes('failed')) return 'failed';
  if (ends.includes('cancelled')) return 'cancelled';
  if (ends.includes('expired')) return 'expired';
  return 'done';
}

/** The start a queue entry came from (T376): its run, starter, folder and jobs. */
export interface StartFound {
  readonly runId: string;
  readonly requestId: string;
  readonly folderId: string | null;
  readonly starter: Starter;
  readonly tokens: readonly {
    readonly token: string;
    readonly table: string | null;
    readonly finished: boolean;
  }[];
}

export function buildHistory(db: Kysely<Database>) {
  /** Closes a build whose jobs have all ended: its outcome, once. */
  const close = async (runId: string): Promise<BuildOutcome | undefined> => {
    const run = await db
      .selectFrom('build_runs')
      .select(['started_at', 'outcome'])
      .where('id', '=', runId)
      .executeTakeFirst();
    if (run === undefined || run.outcome !== null) return undefined;
    const tokens = await db
      .selectFrom('build_tokens')
      .select(['status', 'finished', 'finished_at'])
      .where('run_id', '=', runId)
      .orderBy('position')
      .execute();
    if (tokens.length === 0 || tokens.some((each) => !each.finished)) return undefined;
    const ends = tokens.map((each) => endOf(each.status ?? 'not_found'));
    const failed = tokens.filter((_, index) => ends[index] === 'failed');
    const outcome = outcomeOf(ends);
    // How it ended isn't known when Cube's record went first: no end, no duration.
    const lastEnd =
      outcome === 'expired'
        ? null
        : tokens.reduce<Date>(
            (latest, each) =>
              each.finished_at !== null && each.finished_at > latest ? each.finished_at : latest,
            run.started_at,
          );
    const closed = await db
      .updateTable('build_runs')
      .set({
        outcome,
        failed_count: failed.length,
        // Cube's error where one failed with one, else the first failed job's state.
        error:
          failed.find((each) => each.status?.startsWith('failure') === true)?.status ??
          failed[0]?.status ??
          null,
        ended_at: lastEnd,
      })
      .where('id', '=', runId)
      .where('outcome', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return closed === undefined ? undefined : outcome;
  };

  return {
    /**
     * Records a start, with its jobs, and answers its id. Past the latest
     * 100 of its pre-aggregation, the oldest go (AC-150): its oldest record
     * is locked first, so two starts at once trim one after the other, the
     * second seeing the first (research db-access.md §3).
     */
    async start(build: NewBuild): Promise<string> {
      if (build.tokens.length === 0) throw new Error('A start that made no job isn’t recorded.');
      const id = randomUUID();
      await db.transaction().execute(async (trx) => {
        await trx
          .selectFrom('build_runs')
          .select('id')
          .where('pre_aggregation', '=', build.preAggregation)
          .orderBy('started_at')
          .orderBy('id')
          .limit(1)
          .forUpdate()
          .execute();
        await trx
          .insertInto('build_runs')
          .values({
            id,
            pre_aggregation: build.preAggregation,
            folder_id: build.folderId,
            partitions: build.partitions === null ? null : JSON.stringify(build.partitions),
            partition_granularity: build.granularity,
            via: build.via,
            starter_kind: build.starter.kind,
            starter_key: build.starter.kind === 'person' ? build.starter.key : null,
            starter_name: build.starter.kind === 'person' ? build.starter.name : null,
            schedule_id: build.starter.kind === 'schedule' ? build.starter.id : null,
            schedule_name: build.starter.kind === 'schedule' ? build.starter.name : null,
            request_id: build.requestId,
            started_at: build.startedAt,
            answered_at: build.answeredAt,
          })
          .execute();
        await trx
          .insertInto('build_tokens')
          .values(
            build.tokens.map((token, position) => ({
              run_id: id,
              token,
              position,
              status: null,
              target_table: null,
              finished_at: null,
              lease_until: null,
            })),
          )
          .execute();
        await trx
          .deleteFrom('build_runs')
          .where('pre_aggregation', '=', build.preAggregation)
          .where(
            'id',
            'not in',
            trx
              .selectFrom('build_runs')
              .select('id')
              .where('pre_aggregation', '=', build.preAggregation)
              .orderBy('started_at', 'desc')
              .orderBy('id', 'desc')
              .limit(KEPT_PER_PRE_AGGREGATION),
          )
          .execute();
      });
      return id;
    },

    /** A build's record, with its jobs in Cube's order; none once it's gone. */
    async get(id: string): Promise<BuildRecord | undefined> {
      const run = await db
        .selectFrom('build_runs')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (run === undefined) return undefined;
      const tokens = await db
        .selectFrom('build_tokens')
        .selectAll()
        .where('run_id', '=', id)
        .orderBy('position')
        .execute();
      return {
        id: run.id,
        preAggregation: run.pre_aggregation,
        folderId: run.folder_id,
        partitions: run.partitions,
        granularity: run.partition_granularity,
        via: run.via as BuildVia,
        starter:
          run.starter_kind === 'schedule'
            ? { kind: 'schedule', id: run.schedule_id ?? '', name: run.schedule_name ?? '' }
            : { kind: 'person', key: run.starter_key ?? '', name: run.starter_name ?? '' },
        requestId: run.request_id,
        startedAt: run.started_at,
        answeredAt: run.answered_at,
        endedAt: run.ended_at,
        durationMs:
          run.ended_at === null ? null : run.ended_at.getTime() - run.started_at.getTime(),
        outcome: run.outcome as BuildOutcome | null,
        failedCount: run.failed_count,
        error: run.error,
        cancelledBy: cancellerOf(run),
        cancelledAt: run.cancelled_at,
        tokens: tokens.map((each) => ({
          token: each.token,
          status: each.status,
          table: each.target_table,
          finished: each.finished,
          finishedAt: each.finished_at,
          log: each.log.map((entry) => ({
            at: new Date(entry.at),
            status: entry.status,
            ...(entry.table === undefined ? {} : { table: entry.table }),
          })),
        })),
      };
    },

    /**
     * Takes up to `limit` open jobs no follower holds at `now`, for
     * `leaseMs` (AC-319), those asked least lately first — never asked, then
     * by when each was handed back for — so none waits behind others. A
     * concurrent taker finds each row it waited for held, and passes it by.
     * Times are the followers' own clock.
     */
    async claim({
      limit,
      leaseMs,
      now,
    }: {
      readonly limit: number;
      readonly leaseMs: number;
      readonly now: Date;
    }): Promise<OpenToken[]> {
      const until = new Date(now.getTime() + leaseMs);
      const { rows } = await sql<{
        run_id: string;
        token: string;
        status: string | null;
        answered_at: Date;
      }>`
        UPDATE build_tokens AS t
        SET lease_until = ${until}
        FROM build_runs AS r
        WHERE r.id = t.run_id
          AND NOT t.finished
          AND (t.lease_until IS NULL OR t.lease_until <= ${now})
          AND (t.run_id, t.token) IN (
            SELECT run_id, token FROM build_tokens
            WHERE NOT finished AND (lease_until IS NULL OR lease_until <= ${now})
            ORDER BY lease_until ASC NULLS FIRST, run_id, position
            LIMIT ${limit}
          )
        RETURNING t.run_id, t.token, t.status, r.answered_at
      `.execute(db);
      return rows.map((row) => ({
        runId: row.run_id,
        token: row.token,
        status: row.status,
        answeredAt: row.answered_at,
        heldUntil: until,
      }));
    },

    /**
     * Hands these jobs back, to be taken again from `until` by any follower,
     * at once given none: only those still held as they were taken, never
     * one another follower took once this hold ran out.
     */
    async release(
      held: readonly Pick<OpenToken, 'runId' | 'token' | 'heldUntil'>[],
      until: Date | null,
    ): Promise<void> {
      if (held.length === 0) return;
      await db
        .updateTable('build_tokens')
        .set({ lease_until: until })
        .where((where) =>
          where.or(
            held.map((each) =>
              where.and([
                where('run_id', '=', each.runId),
                where('token', '=', each.token),
                where('lease_until', '=', each.heldUntil),
              ]),
            ),
          ),
        )
        .execute();
    },

    /**
     * Writes a state a follower saw, with when, if the job still holds the
     * state it held when taken: says whether it was written. A job that has
     * ended takes nothing more. A state seen again, now taken as the end, is
     * no new state: the job ended when it was first seen.
     */
    async seen(change: StateSeen): Promise<boolean> {
      const again = change.previous === change.status;
      const entry = {
        at: change.at.toISOString(),
        status: change.status,
        ...(change.table === undefined ? {} : { table: change.table }),
      };
      const written = await db
        .updateTable('build_tokens')
        .set({
          status: change.status,
          ...(change.table === undefined ? {} : { target_table: change.table }),
          finished: change.final,
          finished_at: !change.final
            ? null
            : again
              ? sql<Date>`COALESCE((log -> -1 ->> 'at')::timestamptz, ${change.at})`
              : change.at,
          log: again ? sql`log` : sql`log || ${JSON.stringify([entry])}::jsonb`,
        })
        .where('run_id', '=', change.runId)
        .where('token', '=', change.token)
        .where('finished', '=', false)
        .where('status', change.previous === null ? 'is' : '=', change.previous)
        .returning('token')
        .executeTakeFirst();
      return written !== undefined;
    },

    close,

    /**
     * Closes every build still open whose jobs have all ended: one a round
     * stopped before closing — its replica gone, or a write failing — is
     * closed by the next (AC-150, AC-319). Closing again changes nothing.
     */
    async closeEnded(): Promise<void> {
      const ended = await db
        .selectFrom('build_runs')
        .select('id')
        .where('outcome', 'is', null)
        .where(({ exists, not, selectFrom }) =>
          not(
            exists(
              selectFrom('build_tokens')
                .select('token')
                .whereRef('build_tokens.run_id', '=', 'build_runs.id')
                .where('build_tokens.finished', '=', false),
            ),
          ),
        )
        .limit(500)
        .execute();
      for (const { id } of ended) await close(id);
    },

    /**
     * A job taken out of the queue (T376, AC-150, AC-151): it ends,
     * `cancelled`, at `at`, and its build names who cancelled it; the build
     * closes once its other jobs have ended. Says whether the job was still
     * open to cancel: one already ended takes nothing.
     */
    async cancelled({
      runId,
      token,
      by,
      at,
      askedAt,
    }: {
      readonly runId: string;
      readonly token: string;
      readonly by: { readonly key: string; readonly name: string };
      readonly at: Date;
      /**
       * When the cancel was asked of xcube: once taken out of the queue, Cube
       * reads the job's partition missing, or no longer knows it, and a
       * follower can end the job so before this is written (T376's review).
       * Such an end, seen after the ask, was the cancel's.
       */
      readonly askedAt?: Date;
    }): Promise<boolean> {
      const entry = JSON.stringify([{ at: at.toISOString(), status: 'cancelled' }]);
      const marked = await db
        .updateTable('build_tokens')
        .set({
          status: 'cancelled',
          finished: true,
          finished_at: at,
          log: sql`log || ${entry}::jsonb`,
        })
        .where('run_id', '=', runId)
        .where('token', '=', token)
        .where((where) =>
          askedAt === undefined
            ? where('finished', '=', false)
            : where.or([
                where('finished', '=', false),
                where.and([
                  where('status', 'in', ['missing_partition', 'not_found']),
                  where(sql<Date>`(log -> -1 ->> 'at')::timestamptz`, '>=', askedAt),
                ]),
              ]),
        )
        .returning('token')
        .executeTakeFirst();
      if (marked === undefined) return false;
      await db
        .updateTable('build_runs')
        .set({
          cancelled_by_key: by.key,
          cancelled_by_name: by.name,
          cancelled_at: at,
          // Closed again, should a round have closed it on the follower's end.
          outcome: null,
          failed_count: null,
          error: null,
          ended_at: null,
        })
        .where('id', '=', runId)
        .where('cancelled_by_key', 'is', null)
        .execute();
      await close(runId);
      return true;
    },

    /**
     * A pre-aggregation's jobs wechart started, newest start first, each with
     * the table it built (T375): a partition's failed state comes from the
     * latest of them (AC-145).
     */
    async jobsOf(preAggregation: string): Promise<
      {
        readonly runId: string;
        readonly startedAt: Date;
        readonly table: string | null;
        readonly status: string | null;
        readonly finished: boolean;
        readonly finishedAt: Date | null;
      }[]
    > {
      const rows = await db
        .selectFrom('build_tokens as t')
        .innerJoin('build_runs as r', 'r.id', 't.run_id')
        .select([
          't.run_id',
          'r.started_at',
          't.target_table',
          't.status',
          't.finished',
          't.finished_at',
        ])
        .where('r.pre_aggregation', '=', preAggregation)
        .orderBy('r.started_at', 'desc')
        .orderBy('t.position')
        .execute();
      return rows.map((row) => ({
        runId: row.run_id,
        startedAt: row.started_at,
        table: row.target_table,
        status: row.status,
        finished: row.finished,
        finishedAt: row.finished_at,
      }));
    },

    /**
     * The starts that made these queue entries (T376): by the request id a
     * post carried, or by a job's token, each with its jobs. xcube gives an
     * entry the request id of the post that made it, and the job's token.
     */
    async startsFor({
      requestIds,
      tokens,
    }: {
      readonly requestIds: readonly string[];
      readonly tokens: readonly string[];
    }): Promise<StartFound[]> {
      if (requestIds.length === 0 && tokens.length === 0) return [];
      const runs = await db
        .selectFrom('build_runs')
        .select([
          'id',
          'request_id',
          'folder_id',
          'starter_kind',
          'starter_key',
          'starter_name',
          'schedule_id',
          'schedule_name',
        ])
        .where((where) =>
          where.or([
            ...(requestIds.length === 0 ? [] : [where('request_id', 'in', requestIds)]),
            ...(tokens.length === 0
              ? []
              : [
                  where(
                    'id',
                    'in',
                    db.selectFrom('build_tokens').select('run_id').where('token', 'in', tokens),
                  ),
                ]),
          ]),
        )
        .execute();
      if (runs.length === 0) return [];
      const jobs = await db
        .selectFrom('build_tokens')
        .select(['run_id', 'token', 'target_table', 'finished'])
        .where(
          'run_id',
          'in',
          runs.map((run) => run.id),
        )
        .orderBy('position')
        .execute();
      return runs.map((run) => ({
        runId: run.id,
        requestId: run.request_id,
        folderId: run.folder_id,
        starter: starterOf(run),
        tokens: jobs
          .filter((job) => job.run_id === run.id)
          .map((job) => ({ token: job.token, table: job.target_table, finished: job.finished })),
      }));
    },

    /**
     * Run history (T374, AC-150): the builds in `within`'s folders — every
     * folder's, given none — newest first, a page at a time, narrowed by
     * `filters`; the next page starts after `before`, the last build of this
     * one, and `older` names it while there are more.
     */
    async list({
      within,
      filters = {},
      before,
      limit = BUILDS_PAGE,
    }: {
      readonly within: readonly string[] | undefined;
      readonly filters?: BuildListFilters;
      readonly before?: string;
      readonly limit?: number;
    }): Promise<{ records: BuildSummary[]; older?: string }> {
      if (within !== undefined && within.length === 0) return { records: [] };
      let query = db
        .selectFrom('build_runs as r')
        .select([
          'r.id',
          'r.pre_aggregation',
          'r.folder_id',
          'r.partitions',
          'r.partition_granularity',
          'r.via',
          'r.starter_kind',
          'r.starter_key',
          'r.starter_name',
          'r.schedule_id',
          'r.schedule_name',
          'r.started_at',
          'r.ended_at',
          'r.outcome',
          'r.failed_count',
          'r.error',
          'r.cancelled_by_key',
          'r.cancelled_by_name',
          'r.cancelled_at',
        ])
        .select((eb) => [
          eb
            .selectFrom('build_tokens as t')
            .select(eb.fn.countAll<string>().as('n'))
            .whereRef('t.run_id', '=', 'r.id')
            .as('jobs'),
          eb
            .selectFrom('build_tokens as t')
            .select(eb.fn.countAll<string>().as('n'))
            .whereRef('t.run_id', '=', 'r.id')
            .where('t.finished', '=', true)
            .as('done'),
          eb
            .selectFrom('build_tokens as t')
            .select(eb.fn.countAll<string>().as('n'))
            .whereRef('t.run_id', '=', 'r.id')
            .where('t.finished', '=', false)
            .where('t.status', '=', 'processing')
            .as('building'),
        ]);
      if (within !== undefined) query = query.where('r.folder_id', 'in', within);
      if (filters.folderIds !== undefined)
        query =
          filters.folderIds.length === 0
            ? query.where(sql<boolean>`false`)
            : query.where('r.folder_id', 'in', filters.folderIds);
      if (filters.outcome === 'open') query = query.where('r.outcome', 'is', null);
      else if (filters.outcome !== undefined)
        query = query.where('r.outcome', '=', filters.outcome);
      if (filters.starter?.kind === 'person')
        query = query
          .where('r.starter_kind', '=', 'person')
          .where('r.starter_key', '=', filters.starter.id);
      if (filters.starter?.kind === 'schedule')
        query = query.where('r.schedule_id', '=', filters.starter.id);
      if (filters.since !== undefined) query = query.where('r.started_at', '>=', filters.since);
      if (filters.preAggregation !== undefined)
        query = query.where('r.pre_aggregation', '=', filters.preAggregation);
      // Paged from a build of `within`'s folders only: from another's, nothing
      // (T374's review), so its start can't be learnt by paging.
      if (before !== undefined)
        query = query.where(
          within === undefined
            ? sql<boolean>`(r.started_at, r.id) < (SELECT started_at, id FROM build_runs WHERE id = ${before})`
            : sql<boolean>`(r.started_at, r.id) < (SELECT started_at, id FROM build_runs WHERE id = ${before} AND folder_id IN (${sql.join(within)}))`,
        );
      const rows = await query
        .orderBy('r.started_at', 'desc')
        .orderBy('r.id', 'desc')
        .limit(limit + 1)
        .execute();
      const records = rows.slice(0, limit).map((row): BuildSummary => ({
        id: row.id,
        preAggregation: row.pre_aggregation,
        folderId: row.folder_id,
        partitions: row.partitions,
        granularity: row.partition_granularity,
        via: row.via as BuildVia,
        starter: starterOf(row),
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationMs:
          row.ended_at === null ? null : row.ended_at.getTime() - row.started_at.getTime(),
        outcome: row.outcome as BuildOutcome | null,
        failedCount: row.failed_count,
        error: row.error,
        cancelledBy: cancellerOf(row),
        cancelledAt: row.cancelled_at,
        jobs: Number(row.jobs ?? 0),
        progress: { done: Number(row.done ?? 0), building: Number(row.building ?? 0) },
      }));
      return rows.length > limit ? { records, older: records.at(-1)!.id } : { records };
    },

    /** Who started builds in `within`'s folders — every folder's, given none — each once, by their latest name. */
    async starters(within: readonly string[] | undefined): Promise<Starter[]> {
      if (within !== undefined && within.length === 0) return [];
      let query = db
        .selectFrom('build_runs')
        .distinctOn(['starter_kind', sql`COALESCE(starter_key, schedule_id)`])
        .select(['starter_kind', 'starter_key', 'starter_name', 'schedule_id', 'schedule_name']);
      if (within !== undefined) query = query.where('folder_id', 'in', within);
      const rows = await query
        .orderBy('starter_kind')
        .orderBy(sql`COALESCE(starter_key, schedule_id)`)
        .orderBy('started_at', 'desc')
        .execute();
      return rows.map(starterOf).sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export type BuildHistory = ReturnType<typeof buildHistory>;
