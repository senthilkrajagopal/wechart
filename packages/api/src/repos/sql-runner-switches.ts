import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/** Cube Store's switch, beside the data sources' (T536, AC-384). */
export const CUBE_STORE_TARGET = 'cubestore';

/** A target's switch, on: who confirmed its credential read-only, and when (AC-374). */
export interface SqlRunnerSwitch {
  readonly confirmedBy: { readonly key: string; readonly name: string };
  readonly confirmedAt: Date;
}

const switchOf = (row: {
  confirmed_by_key: string;
  confirmed_by_name: string;
  confirmed_at: Date;
}): SqlRunnerSwitch => ({
  confirmedBy: { key: row.confirmed_by_key, name: row.confirmed_by_name },
  confirmedAt: row.confirmed_at,
});

/**
 * The SQL runner's switch per target (T531, AC-374; R50-1, R50-2): a row
 * is the switch on, none is off, as every target starts.
 */
export function sqlRunnerSwitches(db: Kysely<Database>) {
  return {
    async of(target: string): Promise<SqlRunnerSwitch | undefined> {
      const row = await db
        .selectFrom('sql_runner_switches')
        .selectAll()
        .where('target', '=', target)
        .executeTakeFirst();
      return row === undefined ? undefined : switchOf(row);
    },

    /** Those of these targets switched on, for a listing. */
    async among(targets: readonly string[]): Promise<Map<string, SqlRunnerSwitch>> {
      if (targets.length === 0) return new Map();
      const rows = await db
        .selectFrom('sql_runner_switches')
        .selectAll()
        .where('target', 'in', targets)
        .execute();
      return new Map(rows.map((row) => [row.target, switchOf(row)]));
    },

    /** Switched on, as confirmed by `by` now: a later confirmation replaces an earlier one. */
    async on(target: string, by: { key: string; name: string }): Promise<SqlRunnerSwitch> {
      const row = await db
        .insertInto('sql_runner_switches')
        .values({ target, confirmed_by_key: by.key, confirmed_by_name: by.name })
        .onConflict((conflict) =>
          conflict.column('target').doUpdateSet({
            confirmed_by_key: by.key,
            confirmed_by_name: by.name,
            confirmed_at: new Date(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      return switchOf(row);
    },

    async off(target: string): Promise<void> {
      await db.deleteFrom('sql_runner_switches').where('target', '=', target).execute();
    },
  };
}

export type SqlRunnerSwitchStore = ReturnType<typeof sqlRunnerSwitches>;
