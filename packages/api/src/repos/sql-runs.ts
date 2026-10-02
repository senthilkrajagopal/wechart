import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * A user's SQL runs (T533, AC-379; R50-9): one going at a time per user,
 * across every API instance, as a row from its start until it finishes. The
 * database takes one unfinished row per user (`sql_runs_one_going`), so two
 * starts at once make one run.
 */

/**
 * Past this a run never finished is counted lost: no run lasts longer than
 * its 30 seconds, connecting and xcube's clock. An API instance stopped mid-run
 * leaves such a row, which then holds its user up no more.
 */
const LOST_AFTER = sql<Date>`now() - interval '2 minutes'`;

/** A run going: its id, as xcube knows it, its data source (none for Cube Store) and its start. */
export interface GoingRun {
  readonly runId: string;
  readonly dataSourceId: string | null;
  readonly startedAt: Date;
}

export type StartAnswer =
  { readonly started: true } | { readonly started: false; readonly going: GoingRun };

export function sqlRuns(db: Kysely<Database>) {
  const going = async (userKey: string): Promise<GoingRun | undefined> => {
    const row = await db
      .selectFrom('sql_runs')
      .select(['id', 'data_source_id', 'started_at'])
      .where('user_key', '=', userKey)
      .where('finished_at', 'is', null)
      .where('started_at', '>=', LOST_AFTER)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : { runId: row.id, dataSourceId: row.data_source_id, startedAt: row.started_at };
  };

  const start = async (
    run: {
      readonly runId: string;
      readonly userKey: string;
      readonly dataSourceId: string | null;
      /** As its user wrote it, for their history alone (T534). */
      readonly sql?: string;
      /** Its data source's name now, kept should it go (T534). */
      readonly dataSourceName?: string | null;
    },
    tries = 2,
  ): Promise<StartAnswer> => {
    // A run its instance never finished holds no one up.
    await db
      .updateTable('sql_runs')
      .set({ finished_at: sql<Date>`now()`, outcome: 'lost' })
      .where('user_key', '=', run.userKey)
      .where('finished_at', 'is', null)
      .where('started_at', '<', LOST_AFTER)
      .execute();
    const taken = await db
      .insertInto('sql_runs')
      .values({
        id: run.runId,
        user_key: run.userKey,
        data_source_id: run.dataSourceId,
        sql: run.sql ?? '',
        data_source_name: run.dataSourceName ?? null,
      })
      .onConflict((conflict) =>
        conflict.column('user_key').where('finished_at', 'is', null).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (taken !== undefined) return { started: true };
    const first = await going(run.userKey);
    // Finished between the two: asked again, once.
    if (first === undefined && tries > 1) return start(run, tries - 1);
    return first === undefined
      ? { started: false, going: { runId: '', dataSourceId: null, startedAt: new Date() } }
      : { started: false, going: first };
  };

  return {
    start,
    /** The user's run going, if any. */
    going,
    /**
     * The user's runs left going past any run's time, counted lost now, once,
     * and said, so each can be recorded (T534's review): an API instance
     * stopped mid-run never recorded it.
     */
    async markLost(userKey: string): Promise<LostRun[]> {
      const rows = await db
        .updateTable('sql_runs')
        .set({ finished_at: sql<Date>`now()`, outcome: 'lost' })
        .where('user_key', '=', userKey)
        .where('finished_at', 'is', null)
        .where('started_at', '<', LOST_AFTER)
        .returning(['id', 'data_source_id', 'data_source_name', 'started_at'])
        .execute();
      return rows.map((row) => ({
        runId: row.id,
        dataSourceId: row.data_source_id,
        dataSourceName: row.data_source_name,
        startedAt: row.started_at,
      }));
    },
    /** Its outcome, and its rows and time where it ran, once done: it goes no more. */
    async finish(runId: string, done: FinishedRun): Promise<void> {
      await db
        .updateTable('sql_runs')
        .set({
          finished_at: sql<Date>`now()`,
          outcome: done.outcome,
          row_count: done.rowCount ?? null,
          duration_ms: done.durationMs ?? null,
          truncated: done.truncated ?? null,
          statement: done.statement ?? null,
        })
        .where('id', '=', runId)
        .where('finished_at', 'is', null)
        .execute();
    },

    /**
     * A user's own past runs, newest first, a page at a time (T534, AC-381;
     * design 15's Q2): a data source's alone, or all of them. One still going
     * isn't past.
     */
    async list({
      userKey,
      dataSourceId,
      limit = PAGE,
      after,
    }: {
      readonly userKey: string;
      /** One data source's runs; null for Cube Store's (T536). */
      readonly dataSourceId?: string | null;
      readonly limit?: number;
      /** The page after the one that gave this; none for the first. */
      readonly after?: string | undefined;
    }): Promise<{ runs: PastRun[]; next?: string }> {
      let query = db
        .selectFrom('sql_runs')
        .selectAll()
        .where('user_key', '=', userKey)
        .where('finished_at', 'is not', null);
      if (dataSourceId === null) query = query.where('data_source_id', 'is', null);
      else if (dataSourceId !== undefined) query = query.where('data_source_id', '=', dataSourceId);
      if (after !== undefined)
        query = query.where(
          sql<boolean>`(started_at, id) < (SELECT started_at, id FROM sql_runs WHERE id = ${after} AND user_key = ${userKey})`,
        );
      const rows = await query
        .orderBy('started_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit + 1)
        .execute();
      const page = rows.slice(0, limit).map((row): PastRun => ({
        id: row.id,
        sql: row.sql,
        dataSourceId: row.data_source_id,
        dataSourceName: row.data_source_name,
        startedAt: row.started_at,
        outcome: row.outcome ?? 'lost',
        rowCount: row.row_count,
        durationMs: row.duration_ms,
        truncated: row.truncated === 'rows' || row.truncated === 'bytes' ? row.truncated : null,
        statement: row.statement,
      }));
      return rows.length > limit ? { runs: page, next: page.at(-1)!.id } : { runs: page };
    },

    /**
     * Runs from before `cutoff` forgotten, as audit records are (AC-296): says
     * how many. One left unfinished that long goes too, its SQL with it
     * (T534's review); the retention is a day at least, so none still going.
     */
    async removeBefore(cutoff: Date): Promise<number> {
      const removed = await db
        .deleteFrom('sql_runs')
        .where('started_at', '<', cutoff)
        .where((where) =>
          where.or([where('finished_at', 'is not', null), where('started_at', '<', LOST_AFTER)]),
        )
        .executeTakeFirst();
      return Number(removed.numDeletedRows);
    },
  };
}

/** A user's runs, a page at a time (design 15's Q2). */
const PAGE = 50;

/** How a run ended: its outcome, and where it ran, its rows and time. */
export interface FinishedRun {
  readonly outcome: string;
  readonly rowCount?: number | null;
  readonly durationMs?: number | null;
  readonly truncated?: 'rows' | 'bytes' | null;
  readonly statement?: string | null;
}

/** A run counted lost: its instance never finished it. */
export interface LostRun {
  readonly runId: string;
  readonly dataSourceId: string | null;
  readonly dataSourceName: string | null;
  readonly startedAt: Date;
}

/** A past run, as its user's history keeps it (T534, AC-381). */
export interface PastRun {
  readonly id: string;
  readonly sql: string;
  readonly dataSourceId: string | null;
  readonly dataSourceName: string | null;
  readonly startedAt: Date;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly truncated: 'rows' | 'bytes' | null;
  readonly statement: string | null;
}

export type SqlRunStore = ReturnType<typeof sqlRuns>;
