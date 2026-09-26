import { createHash } from 'node:crypto';

import { ROOT_FOLDER_ID } from '../repos/catalog';

/**
 * wechart's folders as xcube knows them (T425, AC-328).
 *
 * A folder's name in xcube is an id of `f` and 1–40 lower-case letters and
 * digits, the root `froot` (research `xcube-slice-3a.md`, "Names"). It names
 * every item in the folder (`<folderId>__<shortName>`), so it is stored and
 * never reused, and never changed by a rename or a move (R30). A folder named
 * by a UUID — every folder made in the app — takes `f` and the UUID's 32 hex
 * digits; any other (a seed's) is given one of the same form, stored
 * (`repos/folder-xcube-ids.ts`).
 */

export const XCUBE_ROOT = 'froot';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id a folder takes from its own id, where it has one: the root's, or a UUID's. */
export function xcubeIdOf(folderId: string): string | undefined {
  if (folderId === ROOT_FOLDER_ID) return XCUBE_ROOT;
  return UUID.test(folderId) ? `f${folderId.replaceAll('-', '').toLowerCase()}` : undefined;
}

export interface TreeFolder {
  readonly id: string;
  readonly parentId: string | null;
}

/**
 * The tree wechart publishes (xcube's `PUT …/folders`): the root and each
 * folder whose parents lead to it, by xcube id, with its parent's. A
 * workspace's folder (under My workspace) and one cut off from the root are
 * left out: everything in the tree and published is served, and workspaces
 * wait for slice 5's overlays (R30).
 */
export function publishedTree(
  folders: readonly { id: string; parentId: string | null }[],
  ids: ReadonlyMap<string, string>,
): TreeFolder[] {
  const parentOf = new Map(folders.map((folder) => [folder.id, folder.parentId]));
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
    const answer = (current !== null && current !== undefined && reaches.get(current)) || false;
    for (const each of path) reaches.set(each, answer);
    return answer;
  };

  /**
   * A folder's id where it is published: it reaches the root, and it and
   * every folder above it has an id. A folder with no id yet waits, and so
   * does everything under it, however deep (T425's review): xcube refuses a
   * folder whose parent isn't in the tree.
   */
  const published = new Map<string, string | undefined>([[ROOT_FOLDER_ID, XCUBE_ROOT]]);
  const publishedId = (folderId: string): string | undefined => {
    if (published.has(folderId)) return published.get(folderId);
    const parent = parentOf.get(folderId);
    // Only a folder reaching the root is asked of its parent, so this ends.
    const answer =
      reachesRoot(folderId) &&
      parent !== null &&
      parent !== undefined &&
      publishedId(parent) !== undefined
        ? ids.get(folderId)
        : undefined;
    published.set(folderId, answer);
    return answer;
  };

  const tree: TreeFolder[] = [{ id: XCUBE_ROOT, parentId: null }];
  for (const folder of folders) {
    const id = publishedId(folder.id);
    const parentId = folder.parentId === null ? undefined : publishedId(folder.parentId);
    if (id !== undefined && parentId !== undefined) tree.push({ id, parentId });
  }
  return tree;
}

/**
 * The tree's hash as xcube answers it: SHA-256 of the folders sorted by id,
 * each as `{ id, parentId }` (`xcube-slice-3a.md`, "Folder-tree hash").
 */
export function treeHashOf(tree: readonly TreeFolder[]): string {
  const sorted = [...tree]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, parentId }) => ({ id, parentId }));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}
