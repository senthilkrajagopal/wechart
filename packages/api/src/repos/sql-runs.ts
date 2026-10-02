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
    run: { readonly runId: string; readonly userKey: string; readonly dataSourceId: string | null },
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
      .values({ id: run.runId, user_key: run.userKey, data_source_id: run.dataSourceId })
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
    /** Its outcome, once done: it goes no more. */
    async finish(runId: string, outcome: string): Promise<void> {
      await db
        .updateTable('sql_runs')
        .set({ finished_at: sql<Date>`now()`, outcome })
        .where('id', '=', runId)
        .where('finished_at', 'is', null)
        .execute();
    },
  };
}

export type SqlRunStore = ReturnType<typeof sqlRuns>;
