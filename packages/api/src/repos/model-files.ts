import { sql, type Kysely } from 'kysely';

import type { Database, ModelOrigin } from '../db/schema';
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
/** A file to write: a workspace model's with its target, and a copy's with its origin (T347). */
export type WorkspaceModelFile = ModelFile &
  Partial<Pick<StoredModelFile, 'targetFolderId' | 'origin'>>;
const rowOf = (file: WorkspaceModelFile) => ({
  folder_id: folderOf(file),
  path: file.path,
  content: file.content,
  // A workspace model's, as it is first stored (T347): never changed by a write.
  ...(file.targetFolderId === undefined || file.targetFolderId === null
    ? {}
    : { target_folder_id: file.targetFolderId }),
  ...(file.origin === undefined || file.origin === null
    ? {}
    : { origin: JSON.stringify(file.origin) }),
});

/**
 * A model file as stored (T347): with its id and version, and, in a
 * workspace, the shared folder it is to go to and what a copy was copied
 * from. A shared folder's have neither.
 */
export interface StoredModelFile {
  readonly id: string;
  readonly folderId: string;
  readonly path: string;
  readonly content: string;
  readonly version: number;
  readonly targetFolderId: string | null;
  readonly origin: ModelOrigin | null;
}

export function modelFileStore(db: Kysely<Database>): ModelFileStore & {
  /**
   * The files in any of these folders, each as stored (T347): a workspace's
   * model, its root and every folder in it. By folder, then path.
   */
  inFolders(folderIds: readonly string[]): Promise<readonly StoredModelFile[]>;
  /** One file by its id, as stored (T347, T350). */
  byId(id: string): Promise<StoredModelFile | undefined>;
  /** A publish, a workspace model's target and origin given when it is first stored (T347). */
  write(files: readonly WorkspaceModelFile[]): Promise<unknown>;
  /**
   * A file replaced by the files it was split into (T448, AC-337), in one
   * transaction: never over another file, and all or nothing. The root's
   * file, and the root's files, unless a folder is named.
   */
  replace(path: string, files: readonly ModelFile[], folderId?: string): Promise<unknown>;
  all(): Promise<readonly ModelFile[]>;
  remove(folderId: string, path: string): Promise<unknown>;
} {
  const STORED = [
    'id',
    'folder_id',
    'path',
    'content',
    'version',
    'target_folder_id',
    'origin',
  ] as const;
  const storedOf = (row: {
    id: string;
    folder_id: string;
    path: string;
    content: string;
    version: number;
    target_folder_id: string | null;
    origin: ModelOrigin | null;
  }): StoredModelFile => ({
    id: row.id,
    folderId: row.folder_id,
    path: row.path,
    content: row.content,
    version: row.version,
    targetFolderId: row.target_folder_id,
    origin: row.origin,
  });
  return {
    async inFolders(folderIds) {
      if (folderIds.length === 0) return [];
      const rows = await db
        .selectFrom('model_files')
        .select(STORED)
        .where('folder_id', 'in', [...folderIds])
        .orderBy(sql`folder_id collate "C"`)
        .orderBy(sql`path collate "C"`)
        .execute();
      return rows.map(storedOf);
    },
    async byId(id) {
      // Not a UUID: none, rather than Postgres refusing the cast.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        return undefined;
      const row = await db
        .selectFrom('model_files')
        .select(STORED)
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : storedOf(row);
    },
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
    /**
     * A publish (T142): each file stored, over the one at its path in its
     * folder, at its next version (T347). A workspace model's target and
     * origin are taken when it is first stored, and kept as they are by every
     * write after (as a workspace dashboard's are, T345's review).
     */
    async write(files) {
      if (files.length === 0) return;
      await db
        .insertInto('model_files')
        .values(files.map(rowOf))
        .onConflict((conflict) =>
          conflict.columns(['folder_id', 'path']).doUpdateSet((row) => ({
            content: row.ref('excluded.content'),
            updated_at: sql`now()`,
            version: sql`model_files.version + 1`,
          })),
        )
        .execute();
    },
  };
}
