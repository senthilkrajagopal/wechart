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
export function modelFileStore(db: Kysely<Database>): ModelFileStore {
  return {
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
  };
}
