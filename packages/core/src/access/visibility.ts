/**
 * What a user may see and change in each folder (phase 2, F26), built on the
 * grant levels of `effective.ts`.
 *
 * - A grant reaches down: its level applies in the folder and every
 *   descendant (AC-261).
 * - A grant also reaches up, view-only: a read-write member sees every kind of
 *   item in each ancestor (AC-262), a read-only member the dashboards there
 *   (AC-263).
 * - A folder no grant reaches, down or up, is not in the result: the user
 *   neither lists nor opens it (AC-264).
 * - Super-Admins write everywhere (AC-265).
 */
import type { AccessFolder, FolderLevel } from './effective';

export interface Viewer {
  readonly groups: readonly string[];
  readonly superAdmin: boolean;
}

export interface FolderRight {
  readonly see: true;
  /** May change the folder's items (still through proposals for content, AC-278). */
  readonly write: boolean;
  /**
   * `all`: every kind of item. `dashboards`: dashboards, and the charts on
   * them, only — no models, data sources or library charts (AC-263).
   */
  readonly kinds: 'all' | 'dashboards';
}

const WRITE: FolderRight = Object.freeze({ see: true, write: true, kinds: 'all' });
const VIEW_ALL: FolderRight = Object.freeze({ see: true, write: false, kinds: 'all' });
const DASHBOARDS: FolderRight = Object.freeze({ see: true, write: false, kinds: 'dashboards' });

const RANK = new Map<FolderRight, number>([
  [DASHBOARDS, 1],
  [VIEW_ALL, 2],
  [WRITE, 3],
]);

function wider(a: FolderRight | undefined, b: FolderRight): FolderRight {
  return a === undefined || (RANK.get(b) ?? 0) > (RANK.get(a) ?? 0) ? b : a;
}

/** Whether the groups include the Super-Admin group the deployment names (AC-256). */
export function isSuperAdmin(
  groups: readonly string[],
  superAdminGroup: string | undefined,
): boolean {
  return (
    superAdminGroup !== undefined && superAdminGroup !== '' && groups.includes(superAdminGroup)
  );
}

/** A user's private workspace is a folder id of this form, reachable by its owner alone (AC-276). */
const WORKSPACE = /^ws:/;

/**
 * Every folder of the shared tree the viewer may see, with what they may do
 * there. Folders missing from the map are invisible to them.
 *
 * The input is the shared tree, the root included as `{ id: 'root', parentId:
 * null }` with its own access: without the root, "up to the root" stops short.
 * Workspaces are never granted here, to anyone, Super-Admins included: whose
 * workspace it is decides, not a group.
 */
export function folderRights(
  folders: readonly AccessFolder[],
  viewer: Viewer,
): Map<string, FolderRight> {
  const rights = new Map<string, FolderRight>();
  const shared = folders.filter((folder) => !WORKSPACE.test(folder.id));
  if (viewer.superAdmin) {
    for (const folder of shared) rights.set(folder.id, WRITE);
    return rights;
  }

  const byId = new Map(shared.map((folder) => [folder.id, folder]));
  const mine = new Set(viewer.groups);
  const ownLevel = (folder: AccessFolder): FolderLevel =>
    (folder.access?.readWrite ?? []).some((group) => mine.has(group))
      ? 'write'
      : (folder.access?.readOnly ?? []).some((group) => mine.has(group))
        ? 'read'
        : null;

  /** The folder and its ancestors, nearest first; bad data's cycles stop the walk. */
  const chainOf = (folder: AccessFolder): AccessFolder[] => {
    const chain: AccessFolder[] = [];
    const seen = new Set<string>();
    let current: AccessFolder | undefined = folder;
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return chain;
  };

  for (const folder of shared) {
    const chain = chainOf(folder);
    // Its grant level: the highest of its own and every ancestor's (effective.ts,
    // folderAccess), walked iteratively so no tree's depth or cycle can change it.
    const levels = chain.map(ownLevel);
    const level: FolderLevel = levels.includes('write')
      ? 'write'
      : levels.includes('read')
        ? 'read'
        : null;
    if (level === null) continue;
    rights.set(folder.id, wider(rights.get(folder.id), level === 'write' ? WRITE : DASHBOARDS));

    // Up, view-only, to the root (AC-262, AC-263).
    const upward = level === 'write' ? VIEW_ALL : DASHBOARDS;
    for (const ancestor of chain.slice(1)) {
      rights.set(ancestor.id, wider(rights.get(ancestor.id), upward));
    }
  }
  return rights;
}
