import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * Explore's folder tree and contents (AC-017), and the search behind AC-019.
 *
 * Reads the generated columns on `documents`, so a listing cannot disagree with
 * the object it lists.
 */
export interface CatalogItem {
  readonly kind: 'folder' | 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
  readonly owner: string | null;
  readonly updatedAt: Date;
  /** Set on a chart that belongs to one dashboard rather than to a folder. */
  readonly localToDashboardId: string | null;
}

export interface FolderNode {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
}

/** The folder a document sits in when it sits at the top. */
export const ROOT_FOLDER_ID = 'root';

export function catalog(db: Kysely<Database>) {
  const selectItems = () =>
    db
      .selectFrom('documents')
      .select(['kind', 'id', 'title', 'owner', 'updated_at', 'folder_id', 'local_to_dashboard_id']);

  return {
    /** Every folder, for the tree. */
    async folders(): Promise<FolderNode[]> {
      const rows = await db
        .selectFrom('documents')
        .select(['id', 'title', 'folder_id'])
        .where('kind', '=', 'folder')
        .orderBy('title', 'asc')
        .execute();

      return rows.map((row) => ({
        id: row.id,
        title: row.title ?? '(untitled)',
        parentId: row.folder_id,
      }));
    },

    /**
     * What a folder contains: sub-folders, dashboards and library charts.
     *
     * A chart local to a dashboard is excluded even if it carries a folder id,
     * because it is not a catalog object (AC-126) — it belongs to its dashboard
     * and appears in no folder listing.
     */
    async contents(folderId: string = ROOT_FOLDER_ID): Promise<CatalogItem[]> {
      const rows = await selectItems()
        .where('folder_id', '=', folderId)
        .where('local_to_dashboard_id', 'is', null)
        .orderBy('kind', 'asc')
        .orderBy('title', 'asc')
        .execute();

      return rows.map(toItem);
    },

    /**
     * Search by title (AC-019). Dashboards and library charts only: folders are
     * not what someone is looking for here, and a chart local to a dashboard is
     * not a catalog object at all — it belongs to its dashboard and must never
     * surface in search (AC-126).
     */
    async search(text: string, limit = 50): Promise<CatalogItem[]> {
      const needle = text.trim();
      if (needle === '') return [];

      const rows = await selectItems()
        .where('kind', 'in', ['dashboard', 'chart'])
        .where('local_to_dashboard_id', 'is', null)
        .where((eb) =>
          eb(eb.fn('lower', ['title']), 'like', `%${escapeLike(needle.toLowerCase())}%`),
        )
        .orderBy('title', 'asc')
        .limit(limit)
        .execute();

      return rows.map(toItem);
    },
  };
}

/**
 * `%` and `_` are LIKE wildcards, so a title search for "50%" would otherwise
 * match everything containing "50". Postgres' default LIKE escape is a
 * backslash, which must therefore be escaped first.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

interface Row {
  kind: string;
  id: string;
  title: string | null;
  owner: string | null;
  updated_at: Date;
  local_to_dashboard_id: string | null;
}

function toItem(row: Row): CatalogItem {
  return {
    kind: row.kind as CatalogItem['kind'],
    id: row.id,
    title: row.title ?? '(untitled)',
    owner: row.owner,
    updatedAt: row.updated_at,
    localToDashboardId: row.local_to_dashboard_id,
  };
}
