import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { ModelFile, ModelFileStore } from '../server';
import { ROOT_FOLDER_ID } from './catalog';

/**
 * The Cube model's files (T137, AC-131), in wechart's metadata database.
 *
 * Seeded from the files Cube reads from disk, a path at a time and only where
 * the path is not stored yet: a restart must never write over a file changed
 * in wechart.
 *
 * Each file sits in a folder (T334, AC-269): a file naming none is the shared
 * root's. The same path in two folders is two files, and each call reads or
 * writes one folder's.
 */
const folderOf = (file: ModelFile) => file.folderId ?? ROOT_FOLDER_ID;
const rowOf = (file: ModelFile) => ({
  folder_id: folderOf(file),
  path: file.path,
  content: file.content,
});

export function modelFileStore(db: Kysely<Database>): ModelFileStore & {
  /**
   * A file replaced by the files it was split into (T448, AC-337), in one
   * transaction: never over another file, and all or nothing. The root's
   * file, and the root's files, unless a folder is named.
   */
  replace(path: string, files: readonly ModelFile[], folderId?: string): Promise<unknown>;
  all(): Promise<readonly ModelFile[]>;
  remove(folderId: string, path: string): Promise<unknown>;
} {
  return {
    async replace(path, files, folderId = ROOT_FOLDER_ID) {
      await db.transaction().execute(async (trx) => {
        const [deleted] = await trx
          .deleteFrom('model_files')
          .where('folder_id', '=', folderId)
          .where('path', '=', path)
          .execute();
        // Already split — by another replica starting at the same moment
        // (T448's review): what it wrote stands.
        if ((deleted?.numDeletedRows ?? 0n) === 0n) return;
        if (files.length > 0)
          await trx
            .insertInto('model_files')
            .values(files.map((file) => rowOf({ ...file, folderId })))
            .execute();
      });
    },
    async list(folderId = ROOT_FOLDER_ID) {
      // By code point ("C"), not the database's collation, which can order
      // "-" and "/" differently from one server to the next.
      const rows = await db
        .selectFrom('model_files')
        .select(['folder_id', 'path', 'content'])
        .where('folder_id', '=', folderId)
        .orderBy(sql`path collate "C"`)
        .execute();
      return rows.map((row) => ({ folderId: row.folder_id, path: row.path, content: row.content }));
    },
    /** A file removed from its folder: a model item deleted (T428). */
    async remove(folderId: string, path: string) {
      await db
        .deleteFrom('model_files')
        .where('folder_id', '=', folderId)
        .where('path', '=', path)
        .execute();
    },
    /** Every folder's files, by folder then path: the whole model xcube is sent (T452). */
    async all() {
      const rows = await db
        .selectFrom('model_files')
        .select(['folder_id', 'path', 'content'])
        .orderBy(sql`folder_id collate "C"`)
        .orderBy(sql`path collate "C"`)
        .execute();
      return rows.map((row) => ({ folderId: row.folder_id, path: row.path, content: row.content }));
    },
    async seed(files: readonly ModelFile[]) {
      if (files.length === 0) return;
      await db
        .insertInto('model_files')
        .values(files.map(rowOf))
        .onConflict((conflict) => conflict.columns(['folder_id', 'path']).doNothing())
        .execute();
    },
    /** A publish (T142): each file stored, over the one at its path in its folder. */
    async write(files: readonly ModelFile[]) {
      if (files.length === 0) return;
      await db
        .insertInto('model_files')
        .values(files.map(rowOf))
        .onConflict((conflict) =>
          conflict.columns(['folder_id', 'path']).doUpdateSet((row) => ({
            content: row.ref('excluded.content'),
            updated_at: sql`now()`,
          })),
        )
        .execute();
    },
  };
}
