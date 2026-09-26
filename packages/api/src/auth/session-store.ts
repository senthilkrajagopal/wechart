import type { SessionStore } from '@fastify/session';
import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * Sessions in wechart's metadata database (T316; research/openid-client.md,
 * "Server-side store"): shared by every API replica, and ended everywhere by
 * deleting the row. @fastify/session's store contract is callback-style, as
 * express-session's is.
 */
export interface SweepingSessionStore extends SessionStore {
  /** Deletes expired sessions: Postgres has no TTL, so main.ts runs this on a timer. */
  sweep(): Promise<number>;
}

export function pgSessionStore(db: Kysely<Database>): SweepingSessionStore {
  return {
    async sweep() {
      const result = await db
        .deleteFrom('sessions')
        .where('expires_at', '<=', new Date())
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
    set(sessionId, session, callback) {
      const json = JSON.parse(JSON.stringify(session)) as Record<string, unknown>;
      const cookie = json['cookie'] as { expires?: string | null } | undefined;
      const expires = cookie?.expires ? new Date(cookie.expires) : null;
      db.insertInto('sessions')
        .values({ id: sessionId, session: JSON.stringify(json), expires_at: expires })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({ session: JSON.stringify(json), expires_at: expires }),
        )
        .execute()
        .then(
          () => callback(),
          (error: unknown) => callback(error as Error),
        );
    },
    get(sessionId, callback) {
      db.selectFrom('sessions')
        .select(['session', 'expires_at'])
        .where('id', '=', sessionId)
        .executeTakeFirst()
        .then(
          (row) => {
            if (row === undefined || (row.expires_at !== null && row.expires_at <= new Date())) {
              callback(null, null);
              return;
            }
            callback(null, row.session as never);
          },
          (error: unknown) => callback(error as Error, null),
        );
    },
    destroy(sessionId, callback) {
      db.deleteFrom('sessions')
        .where('id', '=', sessionId)
        .execute()
        .then(
          () => callback(),
          (error: unknown) => callback(error as Error),
        );
    },
  };
}
