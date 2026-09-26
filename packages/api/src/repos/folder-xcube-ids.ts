import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';
import { publishedTree, xcubeIdOf, type PublishedFolders, type TreeFolder } from '../xcube/folders';
import { ROOT_FOLDER_ID } from './catalog';

/**
 * Each folder's id in xcube (T425, AC-328; R30), stored in
 * `folder_xcube_ids` and never reused: a row outlives its folder, and a new
 * one never takes an id another has had. A folder is given its id the first
 * time one is asked of it — as the tree is built, which is before anything
 * in it can be published — from its own id where that is a UUID, else at
 * random.
 */
/** Folder ids asked of Postgres in one statement. */
const CHUNK = 10_000;

export function folderXcubeIds(db: Kysely<Database>) {
  /**
   * The stored ids of these folders, asked a chunk at a time: Postgres takes
   * at most 65,535 parameters to a statement, and xcube up to 100,000 folders
   * (T425's review).
   */
  const stored = async (folderIds: readonly string[]) => {
    const rows: { folder_id: string; xcube_id: string }[] = [];
    for (let at = 0; at < folderIds.length; at += CHUNK)
      rows.push(
        ...(await db
          .selectFrom('folder_xcube_ids')
          .select(['folder_id', 'xcube_id'])
          .where('folder_id', 'in', folderIds.slice(at, at + CHUNK))
          .execute()),
      );
    return rows;
  };

  const random = () => `f${randomUUID().replaceAll('-', '')}`;

  /** A folder given its id: its own where it has one, else — or where that is taken — a random one. */
  const give = async (folderId: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = (attempt === 0 ? xcubeIdOf(folderId) : undefined) ?? random();
      try {
        await db
          .insertInto('folder_xcube_ids')
          .values({ folder_id: folderId, xcube_id: candidate })
          .onConflict((conflict) => conflict.column('folder_id').doNothing())
          .execute();
        return;
      } catch (error) {
        // Another folder has that id (a unique violation): try another.
        if ((error as { code?: string }).code !== '23505') throw error;
      }
    }
    throw new Error(`Could not give folder ${folderId} an xcube id.`);
  };

  const of = async (folderIds: readonly string[]): Promise<Map<string, string>> => {
    const wanted = [...new Set(folderIds)];
    const known = new Set((await stored(wanted)).map((row) => row.folder_id));
    for (const folderId of wanted) if (!known.has(folderId)) await give(folderId);
    return new Map((await stored(wanted)).map((row) => [row.folder_id, row.xcube_id]));
  };

  return {
    /** Each folder's xcube id, given it now if it has none yet. */
    of,
    /** The tree wechart publishes: the root and every folder reaching it, by xcube id. */
    async tree(): Promise<TreeFolder[]> {
      return (await publishedNow()).tree;
    },

    /**
     * Each folder the published tree holds, by wechart's id, with its xcube
     * id and the folder holding it (T452): where its model files are
     * published, and the path its names are looked for along.
     */
    async published(): Promise<PublishedFolders> {
      const { tree, ids, parents } = await publishedNow();
      const inTree = new Set(tree.map((folder) => folder.id));
      return {
        ids: new Map([...ids].filter(([, xcubeId]) => inTree.has(xcubeId))),
        parents,
      };
    },
  };

  /**
   * The published tree, every stored id and each folder's parent. A folder
   * with no id yet is found by a join and given one; then every id is read
   * whole, with no list of folders in the statement.
   */
  async function publishedNow() {
    const missing = await db
      .selectFrom('documents')
      .leftJoin('folder_xcube_ids', 'folder_xcube_ids.folder_id', 'documents.id')
      .select('documents.id')
      .where('documents.kind', '=', 'folder')
      .where('folder_xcube_ids.folder_id', 'is', null)
      .execute();
    for (const folderId of [ROOT_FOLDER_ID, ...missing.map((row) => row.id)])
      if ((await stored([folderId])).length === 0) await give(folderId);
    const [folders, all] = await Promise.all([
      db.selectFrom('documents').select(['id', 'folder_id']).where('kind', '=', 'folder').execute(),
      db.selectFrom('folder_xcube_ids').select(['folder_id', 'xcube_id']).execute(),
    ]);
    const ids = new Map(all.map((row) => [row.folder_id, row.xcube_id]));
    return {
      tree: publishedTree(
        folders.map((folder) => ({ id: folder.id, parentId: folder.folder_id })),
        ids,
      ),
      ids,
      parents: new Map<string, string | null>([
        [ROOT_FOLDER_ID, null],
        ...folders.map((folder) => [folder.id, folder.folder_id] as const),
      ]),
    };
  }
}
