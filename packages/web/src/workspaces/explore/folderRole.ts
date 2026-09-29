import type { CreatableKind } from './CreateMenu';

/** The user's access in a shared folder, as its header's chip says it (rule 69). */
export type FolderAccess = 'super-admin' | 'read-write' | 'view-only';

/** What the open folder offers its user (T331). */
export interface FolderRole {
  /** The header's chip; none in the workspace, with sign-in off, or while unknown. */
  readonly access: FolderAccess | undefined;
  /** What New makes here, in its order; none, and there is no New. */
  readonly creates: readonly CreatableKind[];
  /** Rename beside the heading (AC-192). */
  readonly mayRename: boolean;
  /** "+ Folder" in the tree's head (AC-194). */
  readonly mayAddFolder: boolean;
  /**
   * The open folder is the user's own workspace, or in it: New there also
   * adds a data source and imports a dashboard (T363, T513).
   */
  readonly inOwnWorkspace: boolean;
}

export interface FolderRoleOf {
  /** Whether sign-in is on; undefined until who is signed in is known. */
  readonly signedIn: boolean | undefined;
  readonly superAdmin: boolean;
  /** The open folder is My workspace's address, or in it. */
  readonly inMyWorkspace: boolean;
  /**
   * The user has a workspace, as the API counts one (T343): a reader at My
   * workspace's address, typed or from an old link, has none (AC-277).
   */
  readonly hasWorkspace: boolean;
  /**
   * Their right in the shared folder: `write` where its access answers them
   * (a Super-Admin or a read-write member, rule 68), `read` where it refuses
   * them, and `unknown` until it has said.
   */
  readonly right: 'write' | 'read' | 'unknown';
}

const EVERY_KIND: readonly CreatableKind[] = ['dashboard', 'chart', 'folder'];

/**
 * The user's right in a shared folder, from how its access answered them
 * (`GET /api/folders/:id/access`, T330): it answers a Super-Admin or a
 * read-write member of the folder, refuses one who only sees it with 403,
 * and one who can't see it with 404. Anything else, or no answer yet, says
 * nothing: nothing is offered on it.
 */
export function rightFrom({
  answered,
  refusedWith,
}: {
  readonly answered: boolean;
  readonly refusedWith?: number | undefined;
}): FolderRoleOf['right'] {
  if (answered) return 'write';
  return refusedWith === 403 ? 'read' : 'unknown';
}

/**
 * What Explore offers in the open folder, by the user's role there (T331):
 *
 * - AC-192: a shared folder's New offers Folder alone to its read-write
 *   members, Super-Admins among them, and nothing to anyone else: work
 *   reaches a shared folder from the workspace, by a proposal (AC-284). The
 *   workspace's offers every kind. Rename is for those who may change the
 *   folder.
 * - AC-194: "+ Folder" for those who may make one in the open folder.
 * - Rule 69: a shared folder's header says the user's access there.
 *
 * With sign-in off, phase 1's Explore: its one user makes anything anywhere
 * and has no chip, as T330 left the Access button out. Working through the
 * workspace with sign-in off is T359's (AC-254). Until who is signed in is
 * known, nothing: never an offer the user may not take.
 */
export function folderRoleOf({
  signedIn,
  superAdmin,
  inMyWorkspace,
  hasWorkspace,
  right,
}: FolderRoleOf): FolderRole {
  if (signedIn === false)
    return {
      access: undefined,
      creates: EVERY_KIND,
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: inMyWorkspace,
    };
  if (signedIn === true && inMyWorkspace && hasWorkspace)
    return {
      access: undefined,
      creates: EVERY_KIND,
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: true,
    };
  if (signedIn === true && !inMyWorkspace && right === 'write')
    return {
      access: superAdmin ? 'super-admin' : 'read-write',
      creates: ['folder'],
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: false,
    };
  return {
    access: signedIn === true && !inMyWorkspace && right === 'read' ? 'view-only' : undefined,
    creates: [],
    mayRename: false,
    mayAddFolder: false,
    inOwnWorkspace: false,
  };
}
