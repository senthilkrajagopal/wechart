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

/** How a build ended: done; failed; or Cube's record expired before its end was seen. */
export type BuildOutcome = 'done' | 'failed' | 'expired';

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

/**
 * A job's end, as its final state says it: failed — `failure: …`, its
 * partition missing, or its pre-aggregation gone from the model — expired,
 * Cube no longer knowing it; or done (research cube/job-records.md, "Status
 * values").
 */
export function endOf(status: string): BuildOutcome {
  if (status === 'done') return 'done';
  if (status === 'not_found') return 'expired';
  return 'failed';
}

/**
 * A build's outcome from its jobs' ends: failed when any partition failed;
 * otherwise Cube's record expired when any job's end wasn't seen, which is
 * neither done nor failed; otherwise done.
 */
export function outcomeOf(ends: readonly BuildOutcome[]): BuildOutcome {
  if (ends.includes('failed')) return 'failed';
  if (ends.includes('expired')) return 'expired';
  return 'done';
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
  };
}

export type BuildHistory = ReturnType<typeof buildHistory>;
