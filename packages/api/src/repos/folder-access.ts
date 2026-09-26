import type { AccessFolder, FolderAccessSetting, GroupList } from '@wechart/core';
import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';
import { ROOT_FOLDER_ID } from './catalog';
import { documents } from './documents';

/**
 * Each folder's read-only and read-write AD groups (T314, AC-259, AC-260), as
 * tasks.md's Phase 2 decisions place them: on the folder document's body as
 * `access: { readOnly, readWrite }`, `null` for unset, and the shared root's,
 * which is no document, in the `setting` document `root-access`.
 */
export const ROOT_ACCESS_ID = 'root-access';

export interface FolderAccessStore {
  /**
   * The shared tree the effective groups are computed from: the root, as
   * `{ id: 'root', parentId: null }`, and every folder beneath it, each with
   * its setting. A workspace's folders aren't in it: no group reaches them
   * (AC-276).
   */
  tree(): Promise<AccessFolder[]>;
  /** Sets a folder's groups, or the root's. False when there is no such folder in the tree. */
  set(folderId: string, setting: FolderAccessSetting): Promise<boolean>;
}

const UNSET: FolderAccessSetting = Object.freeze({ readOnly: null, readWrite: null });

/** A stored list of group names, or unset: anything else reads as unset, never as a grant. */
function listOf(value: unknown): GroupList {
  return Array.isArray(value) && value.every((group) => typeof group === 'string')
    ? (value as string[])
    : null;
}

function settingOf(value: unknown): FolderAccessSetting {
  if (typeof value !== 'object' || value === null) return UNSET;
  const { readOnly, readWrite } = value as Record<string, unknown>;
  return { readOnly: listOf(readOnly), readWrite: listOf(readWrite) };
}

export function folderAccessStore(db: Kysely<Database>): FolderAccessStore {
  const docs = documents(db);

  const tree = async (): Promise<AccessFolder[]> => {
    const rows = await db
      .selectFrom('documents')
      .select(['id', 'folder_id'])
      .select(sql<unknown>`body -> 'access'`.as('access'))
      .where('kind', '=', 'folder')
      .execute();
    const root = await docs.get('setting', ROOT_ACCESS_ID);

    // Only the folders whose parents lead to the root: a workspace's, or one
    // whose parent is gone, are nobody's to grant.
    const parentOf = new Map(rows.map((row) => [row.id, row.folder_id]));
    const reaches = new Map<string, boolean>([[ROOT_FOLDER_ID, true]]);
    const reachesRoot = (id: string): boolean => {
      const path: string[] = [];
      let current: string | null | undefined = id;
      while (current !== null && current !== undefined && !reaches.has(current)) {
        // A cycle in bad data: seen on this path already, so it never gets there.
        if (path.includes(current)) break;
        path.push(current);
        current = parentOf.get(current);
      }
      // Stopped at a folder already answered, or at none: no parent, or a cycle.
      const answer = (current !== null && current !== undefined && reaches.get(current)) || false;
      for (const each of path) reaches.set(each, answer);
      return answer;
    };

    return [
      { id: ROOT_FOLDER_ID, parentId: null, access: settingOf(root?.body['access']) },
      ...rows
        .filter((row) => reachesRoot(row.id))
        .map((row) => ({ id: row.id, parentId: row.folder_id, access: settingOf(row.access) })),
    ];
  };

  return {
    tree,

    async set(folderId, setting) {
      const access = { readOnly: setting.readOnly, readWrite: setting.readWrite };
      if (folderId === ROOT_FOLDER_ID) {
        const stored = await docs.get('setting', ROOT_ACCESS_ID);
        if (stored === null) {
          await docs.create({ kind: 'setting', id: ROOT_ACCESS_ID, body: { access } });
        } else {
          await docs.update({
            kind: 'setting',
            id: ROOT_ACCESS_ID,
            body: { ...stored.body, access },
            expectedVersion: stored.version,
          });
        }
        return true;
      }

      if (!(await tree()).some((folder) => folder.id === folderId)) return false;
      const stored = await docs.get('folder', folderId);
      if (stored === null) return false;
      await docs.update({
        kind: 'folder',
        id: folderId,
        body: { ...stored.body, access },
        expectedVersion: stored.version,
      });
      return true;
    },
  };
}
