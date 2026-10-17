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
   * them alone unless they share it. Phase 1's bookmarks were its one user's,
   * `admin`.
   */
  readonly owner: string;
  /**
   * Its owner's name as they last saved or changed it, for "Shared by" (T367,
   * AC-293). Empty on one saved before T367 and not since.
   */
  readonly ownerName: string;
  /**
   * Listed for everyone who may see the dashboard (T367, AC-293). A new one
   * isn't: "Only me" (rule 81).
   */
  readonly shared: boolean;
  /**
   * When it was first saved, as an ISO date (T742; design-10-Q2): the date
   * the list is ordered by (R61), which a save under its name keeps.
   */
  readonly savedAt: string;
}

/** What its owner may change of a bookmark (T367): any of them at once. */
export interface BookmarkChange {
  readonly name?: string;
  readonly state?: Record<string, unknown>;
  readonly shared?: boolean;
  /** Who its owner is called now, kept with each change they make. */
  readonly ownerName?: string;
}

export interface BookmarkStore {
  /**
   * A dashboard's bookmarks for `viewer`: their own, newest first, then those
   * others share, newest first (T367, rule 81). Whether `viewer` may see the
   * dashboard at all is the caller's to ask first.
   */
  list(dashboardId: string, viewer: string): Promise<Bookmark[]>;
  /**
   * Kept under its name, unshared when new: one its owner already has of that
   * name on the dashboard is replaced, and stays as shared as it was.
   */
  save(
    bookmark: Omit<Bookmark, 'id' | 'ownerName' | 'shared' | 'savedAt'> & {
      readonly ownerName?: string;
    },
  ): Promise<Bookmark>;
  /** One of a dashboard's bookmarks, whoever's; none when it isn't of that dashboard. */
  get(dashboardId: string, id: string): Promise<Bookmark | undefined>;
  /** Its owner's change (T367, AC-293); none when it isn't `owner`'s, on that dashboard. */
  change(
    dashboardId: string,
    id: string,
    owner: string,
    changes: BookmarkChange,
  ): Promise<Bookmark | undefined>;
  /** Its owner's delete (T367, AC-293); false when it isn't `owner`'s, on that dashboard. */
  remove(dashboardId: string, id: string, owner: string): Promise<boolean>;
  /**
   * A Super-Admin's delete of a shared one, whoever's (T580; AC-293 as
   * amended by R61); false when it isn't shared, on that dashboard.
   */
  removeShared(dashboardId: string, id: string): Promise<boolean>;
  /** A dashboard's bookmarks, everyone's, gone with it (T127's review). */
  removeFor(dashboardId: string): Promise<unknown>;
}

const dashboardOf = sql<string>`body ->> 'dashboardId'`;
const sharedOf = sql<boolean>`coalesce((body ->> 'shared')::boolean, false)`;

function toBookmark(row: {
  id: string;
  body: Record<string, unknown>;
  created_at: Date;
}): Bookmark {
  const { dashboardId, title, state, owner, ownerName, shared } = row.body;
  return {
    id: row.id,
    dashboardId: typeof dashboardId === 'string' ? dashboardId : '',
    name: typeof title === 'string' ? title : '',
    state: typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {},
    owner: typeof owner === 'string' ? owner : '',
    ownerName: typeof ownerName === 'string' ? ownerName : '',
    shared: shared === true,
    savedAt: row.created_at.toISOString(),
  };
}

export function bookmarkStore(db: Kysely<Database>): BookmarkStore {
  /** A row's body, merged with `fields`: what isn't named is kept as it was. */
  const merged = (fields: Record<string, unknown>) =>
    sql<string>`body || ${JSON.stringify(fields)}::jsonb`;

  return {
    async list(dashboardId, viewer) {
      const rows = await db
        .selectFrom('documents')
        .select(['id', 'body', 'created_at'])
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        // The generated column, from `body.owner`.
        .where((where) => where.or([where('owner', '=', viewer), where(sharedOf, '=', true)]))
        // Their own first, then those shared; each newest first (rule 81).
        .orderBy(sql`owner = ${viewer}`, 'desc')
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .execute();
      return rows.map(toBookmark);
    },

    async save({ dashboardId, name, state, owner, ownerName }) {
      // `title` and `owner`, as every document names them, so they are the
      // generated columns too.
      const fields = {
        dashboardId,
        title: name,
        state,
        owner,
        ...(ownerName === undefined ? {} : { ownerName }),
      };
      const replaced = await db
        .updateTable('documents')
        .set((update) => ({
          // Merged, so one shared stays shared (T367).
          body: merged(fields),
          version: sql<number>`${update.ref('version')} + 1`,
          updated_at: new Date(),
        }))
        .where('kind', '=', 'bookmark')
        .where(dashboardOf, '=', dashboardId)
        .where('owner', '=', owner)
        .where('title', '=', name)
        .returning(['id', 'body', 'created_at'])
        .executeTakeFirst();
      if (replaced !== undefined) return toBookmark(replaced);
      const created = await db
        .insertInto('documents')
        .values({ kind: 'bookmark', id: randomUUID(), body: JSON.stringify(fields) })
        .returning(['id', 'body', 'created_at'])
        .executeTakeFirstOrThrow();
      return toBookmark(created);
    },

    async get(dashboardId, id) {
      const row = await db
        .selectFrom('documents')
        .select(['id', 'body', 'created_at'])
        .where('kind', '=', 'bookmark')
        .where('id', '=', id)
        .where(dashboardOf, '=', dashboardId)
        .executeTakeFirst();
      return row === undefined ? undefined : toBookmark(row);
    },

    async change(dashboardId, id, owner, { name, state, shared, ownerName }) {
      const fields = {
        ...(name === undefined ? {} : { title: name }),
        ...(state === undefined ? {} : { state }),
        ...(shared === undefined ? {} : { shared }),
        ...(ownerName === undefined ? {} : { ownerName }),
      };
      const row = await db
        .updateTable('documents')
        .set((update) => ({
          body: merged(fields),
          version: sql<number>`${update.ref('version')} + 1`,
          updated_at: new Date(),
        }))
        .where('kind', '=', 'bookmark')
        .where('id', '=', id)
        .where(dashboardOf, '=', dashboardId)
        .where('owner', '=', owner)
        .returning(['id', 'body', 'created_at'])
        .executeTakeFirst();
      return row === undefined ? undefined : toBookmark(row);
    },

    async remove(dashboardId, id, owner) {
      const gone = await db
        .deleteFrom('documents')
        .where('kind', '=', 'bookmark')
        .where('id', '=', id)
        .where(dashboardOf, '=', dashboardId)
        .where('owner', '=', owner)
        .executeTakeFirst();
      return Number(gone.numDeletedRows) > 0;
    },

    async removeShared(dashboardId, id) {
      const gone = await db
        .deleteFrom('documents')
        .where('kind', '=', 'bookmark')
        .where('id', '=', id)
        .where(dashboardOf, '=', dashboardId)
        .where(sharedOf, '=', true)
        .executeTakeFirst();
      return Number(gone.numDeletedRows) > 0;
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
