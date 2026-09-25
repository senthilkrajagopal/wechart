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
}

export interface BookmarkStore {
  /** A dashboard's bookmarks, by name. */
  list(dashboardId: string): Promise<Bookmark[]>;
  /** Kept under its name: one already of that name on the dashboard is replaced. */
  save(bookmark: Omit<Bookmark, 'id'>): Promise<Bookmark>;
  /** A dashboard's bookmarks, gone with it (T127's review). */
  removeFor(dashboardId: string): Promise<unknown>;
}

const dashboardOf = sql<string>`body ->> 'dashboardId'`;

function toBookmark(row: { id: string; body: Record<string, unknown> }): Bookmark {
  const { dashboardId, title, state } = row.body;
  return {
    id: row.id,
    dashboardId: typeof dashboardId === 'string' ? dashboardId : '',
    name: typeof title === 'string' ? title : '',
    state: typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {},
  };
}

export function bookmarkStore(db: Kysely<Database>): BookmarkStore {
  return {
    async list(dashboardId) {
      const rows = await db
        .selectFrom('documents')
        .select(['id', 'body'])
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        .orderBy('title')
        .orderBy('id')
        .execute();
      return rows.map(toBookmark);
    },

    async save({ dashboardId, name, state }) {
      // `title`, as every document's name is, so it is the generated column too.
      const body = JSON.stringify({ dashboardId, title: name, state });
      const replaced = await db
        .updateTable('documents')
        .set((update) => ({
          body,
          version: sql<number>`${update.ref('version')} + 1`,
          updated_at: new Date(),
        }))
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
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
