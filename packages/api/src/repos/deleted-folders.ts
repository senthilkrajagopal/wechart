import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * A record of each shared folder wechart deletes (T540, AC-389): its body as
 * it was, which holds its name, its parent, its description and its groups,
 * so that an approval into it can make it again with its id.
 *
 * A document of its own kind beside the folders, as the root's groups are a
 * `setting` (T314): no table of its own. The body is held under `folder`, so
 * the columns generated from a document's top level (`folder_id`, `title`,
 * `owner`) are empty for a record, and no listing by folder or title finds
 * one, whatever kinds it asks for (T540's review).
 */
export const DELETED_FOLDER = 'deleted-folder';

export interface DeletedFolder {
  readonly id: string;
  readonly body: Record<string, unknown>;
}

export interface DeletedFolderStore {
  /** Kept as it was when deleted: deleted again, as it was then. */
  keep(folder: DeletedFolder): Promise<void>;
  get(id: string): Promise<DeletedFolder | null>;
  /** Every record: the tree a deleted folder's groups are read in. */
  all(): Promise<DeletedFolder[]>;
  /** Made again, or not deleted after all: its record goes. */
  forget(id: string): Promise<void>;
}

export function deletedFolderStore(db: Kysely<Database>): DeletedFolderStore {
  const toRecord = (row: { id: string; body: unknown }): DeletedFolder => ({
    id: row.id,
    body: ((row.body as { folder?: unknown }).folder ?? {}) as Record<string, unknown>,
  });

  return {
    async keep({ id, body }) {
      const written = JSON.stringify({ folder: body });
      await db
        .insertInto('documents')
        .values({ kind: DELETED_FOLDER, id, body: written })
        .onConflict((conflict) =>
          conflict.columns(['kind', 'id']).doUpdateSet({
            body: written,
            version: sql<number>`documents.version + 1`,
            updated_at: sql<Date>`now()`,
          }),
        )
        .execute();
    },

    async get(id) {
      const row = await db
        .selectFrom('documents')
        .select(['id', 'body'])
        .where('kind', '=', DELETED_FOLDER)
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? null : toRecord(row);
    },

    async all() {
      const rows = await db
        .selectFrom('documents')
        .select(['id', 'body'])
        .where('kind', '=', DELETED_FOLDER)
        .execute();
      return rows.map(toRecord);
    },

    async forget(id) {
      await db
        .deleteFrom('documents')
        .where('kind', '=', DELETED_FOLDER)
        .where('id', '=', id)
        .execute();
    },
  };
}
