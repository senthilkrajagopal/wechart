import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { ModelFile, ModelFileStore } from '../server';

/**
 * The Cube model's files (T137, AC-131), in wechart's metadata database.
 *
 * Seeded from the files Cube reads from disk, a path at a time and only where
 * the path is not stored yet: a restart must never write over a file changed
 * in wechart.
 */
export function modelFileStore(db: Kysely<Database>): ModelFileStore & {
  /**
   * A file replaced by the files it was split into (T448, AC-337), in one
   * transaction: never over another file, and all or nothing.
   */
  replace(path: string, files: readonly ModelFile[]): Promise<unknown>;
} {
  return {
    async replace(path, files) {
      await db.transaction().execute(async (trx) => {
        const [deleted] = await trx.deleteFrom('model_files').where('path', '=', path).execute();
        // Already split — by another replica starting at the same moment
        // (T448's review): what it wrote stands.
        if ((deleted?.numDeletedRows ?? 0n) === 0n) return;
        if (files.length > 0)
          await trx
            .insertInto('model_files')
            .values(files.map((file) => ({ path: file.path, content: file.content })))
            .execute();
      });
    },
    async list() {
      // By code point ("C"), not the database's collation, which can order
      // "-" and "/" differently from one server to the next.
      return db
        .selectFrom('model_files')
        .select(['path', 'content'])
        .orderBy(sql`path collate "C"`)
        .execute();
    },
    async seed(files: readonly ModelFile[]) {
      if (files.length === 0) return;
      await db
        .insertInto('model_files')
        .values(files.map(({ path, content }) => ({ path, content })))
        .onConflict((conflict) => conflict.column('path').doNothing())
        .execute();
    },
    /** A publish (T142): each file stored, over the one at its path. */
    async write(files: readonly ModelFile[]) {
      if (files.length === 0) return;
      await db
        .insertInto('model_files')
        .values(files.map(({ path, content }) => ({ path, content })))
        .onConflict((conflict) =>
          conflict.column('path').doUpdateSet((row) => ({
            content: row.ref('excluded.content'),
            updated_at: sql`now()`,
          })),
        )
        .execute();
    },
  };
}
