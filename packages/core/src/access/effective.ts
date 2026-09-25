/**
 * Folder access by AD group (phase 2, F26): each folder's effective read-only
 * and read-write groups, and what a user's groups give them in a folder.
 *
 * A folder may set either list or leave it unset (`null`), each on its own
 * (AC-259, AC-260). A grant reaches every descendant, whatever groups the
 * descendant sets (AC-261), so a folder's effective groups are its own plus
 * every ancestor's: an unset list simply adds nothing, which is the same as
 * taking the parent's effective setting.
 *
 * Pure and synchronous: the API computes it from the folder list it already
 * holds. Reaching *up* the tree (AC-262, AC-263) is `visibility.ts`'s.
 */

export type GroupList = readonly string[] | null;

export interface FolderAccessSetting {
  /** Groups whose members may read here. `null`: unset, inherited. */
  readonly readOnly: GroupList;
  /** Groups whose members may write here. `null`: unset, inherited. */
  readonly readWrite: GroupList;
}

export interface AccessFolder {
  readonly id: string;
  /** `null` for the shared root. */
  readonly parentId: string | null;
  /** Absent is the same as both lists unset. */
  readonly access?: FolderAccessSetting;
}

export interface EffectiveGrant {
  readonly group: string;
  /** The folder whose setting names the group: this one, or an ancestor (AC-260). */
  readonly from: string;
  readonly setHere: boolean;
}

export interface EffectiveGroups {
  readonly readOnly: readonly EffectiveGrant[];
  readonly readWrite: readonly EffectiveGrant[];
}

/** What a user may do in a folder through grants on it or above it. */
export type FolderLevel = 'write' | 'read' | null;

/** The folder and its ancestors, nearest first. A cycle in bad data stops the walk. */
function chainOf(folders: readonly AccessFolder[], folderId: string): AccessFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: AccessFolder[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return chain;
}

function collect(
  chain: readonly AccessFolder[],
  folderId: string,
  pick: (setting: FolderAccessSetting) => GroupList,
): EffectiveGrant[] {
  const grants: EffectiveGrant[] = [];
  const named = new Set<string>();
  for (const folder of chain) {
    for (const group of (folder.access && pick(folder.access)) ?? []) {
      // The nearest folder naming a group is where it is shown as coming from.
      if (named.has(group)) continue;
      named.add(group);
      grants.push({ group, from: folder.id, setHere: folder.id === folderId });
    }
  }
  return grants;
}

/**
 * The groups that reach a folder at each level, nearest first, each with the
 * folder that sets it (AC-260, AC-261). A folder not in the tree has none.
 */
export function effectiveGroups(
  folders: readonly AccessFolder[],
  folderId: string,
): EffectiveGroups {
  const chain = chainOf(folders, folderId);
  return {
    readOnly: collect(chain, folderId, (setting) => setting.readOnly),
    readWrite: collect(chain, folderId, (setting) => setting.readWrite),
  };
}

/**
 * What a user in `groups` may do in the folder through grants on it or its
 * ancestors: the higher of their grants (AC-261, AC-255). Group names are
 * compared exactly, as the provider's token carries them.
 */
export function folderAccess(
  folders: readonly AccessFolder[],
  folderId: string,
  groups: readonly string[],
): FolderLevel {
  const mine = new Set(groups);
  const { readOnly, readWrite } = effectiveGroups(folders, folderId);
  if (readWrite.some((grant) => mine.has(grant.group))) return 'write';
  if (readOnly.some((grant) => mine.has(grant.group))) return 'read';
  return null;
}
