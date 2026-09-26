import { randomUUID } from 'node:crypto';

import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * A dashboard's bookmarks (T127, AC-121): the page tab shown, the filters'
 * values and the current marks, under a name the user gives.
 *
 * Kept as `bookmark` documents — a kind AC-014 names — beside the dashboard
 * they are of and never inside it: a bookmark is a reader's state, and
 * applying one must not change the dashboard for anyone else (AC-122). What
 * the state holds is the browser's to read, checked as it is applied, as a URL
 * is; stored here as it was sent.
 */
export interface Bookmark {
  readonly id: string;
  readonly dashboardId: string;
  readonly name: string;
  readonly state: Record<string, unknown>;
  /**
   * The key of the user who saved it (T366, AC-292): it is theirs, listed for
   * them alone. Phase 1's bookmarks were its one user's, `admin`.
   */
  readonly owner: string;
}

export interface BookmarkStore {
  /** A dashboard's bookmarks that `owner` saved, by name. */
  list(dashboardId: string, owner: string): Promise<Bookmark[]>;
  /** Kept under its name: one its owner already has of that name on the dashboard is replaced. */
  save(bookmark: Omit<Bookmark, 'id'>): Promise<Bookmark>;
  /** A dashboard's bookmarks, everyone's, gone with it (T127's review). */
  removeFor(dashboardId: string): Promise<unknown>;
}

const dashboardOf = sql<string>`body ->> 'dashboardId'`;

function toBookmark(row: { id: string; body: Record<string, unknown> }): Bookmark {
  const { dashboardId, title, state, owner } = row.body;
  return {
    id: row.id,
    dashboardId: typeof dashboardId === 'string' ? dashboardId : '',
    name: typeof title === 'string' ? title : '',
    state: typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {},
    owner: typeof owner === 'string' ? owner : '',
  };
}

export function bookmarkStore(db: Kysely<Database>): BookmarkStore {
  return {
    async list(dashboardId, owner) {
      const rows = await db
        .selectFrom('documents')
        .select(['id', 'body'])
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        // The generated column, from `body.owner`.
        .where('owner', '=', owner)
        .orderBy('title')
        .orderBy('id')
        .execute();
      return rows.map(toBookmark);
    },

    async save({ dashboardId, name, state, owner }) {
      // `title` and `owner`, as every document names them, so they are the
      // generated columns too.
      const body = JSON.stringify({ dashboardId, title: name, state, owner });
      const replaced = await db
        .updateTable('documents')
        .set((update) => ({
          body,
          version: sql<number>`${update.ref('version')} + 1`,
          updated_at: new Date(),
        }))
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        .where('owner', '=', owner)
        .where('title', '=', name)
        .returning(['id', 'body'])
        .executeTakeFirst();
      if (replaced !== undefined) return toBookmark(replaced);
      const created = await db
        .insertInto('documents')
        .values({ kind: 'bookmark', id: randomUUID(), body })
        .returning(['id', 'body'])
        .executeTakeFirstOrThrow();
      return toBookmark(created);
    },

    async removeFor(dashboardId) {
      await db
        .deleteFrom('documents')
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        .execute();
    },
  };
}
