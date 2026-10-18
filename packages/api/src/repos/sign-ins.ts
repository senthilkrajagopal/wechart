import { type Kysely, sql } from 'kysely';

import type { Database } from '../db/schema';

/** A user's latest web sign-in: the groups it carried, and when. */
export interface LatestSignIn {
  readonly groups: readonly string[];
  readonly at: Date;
}

/**
 * Each user's latest web sign-in (T777, AC-471), whose groups their
 * personal access tokens act with on `/mcp`. A sign-in replaces the one
 * before it, unless it is older (two finishing out of order).
 */
export function signInStore(db: Kysely<Database>) {
  return {
    async record(userKey: string, groups: readonly string[], at: Date): Promise<void> {
      await db
        .insertInto('latest_sign_ins')
        .values({ user_key: userKey, groups: [...groups], signed_in_at: at })
        .onConflict((conflict) =>
          conflict
            .column('user_key')
            .doUpdateSet({
              groups: (row) => row.ref('excluded.groups'),
              signed_in_at: (row) => row.ref('excluded.signed_in_at'),
            })
            .where('latest_sign_ins.signed_in_at', '<=', sql<Date>`excluded.signed_in_at`),
        )
        .execute();
    },

    async latest(userKey: string): Promise<LatestSignIn | undefined> {
      const row = await db
        .selectFrom('latest_sign_ins')
        .select(['groups', 'signed_in_at'])
        .where('user_key', '=', userKey)
        .executeTakeFirst();
      return row === undefined ? undefined : { groups: row.groups, at: row.signed_in_at };
    },
  };
}

export type SignInStore = ReturnType<typeof signInStore>;
