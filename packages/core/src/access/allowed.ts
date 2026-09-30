/**
 * Each folder's allowed groups (T436, AC-320): the set xcube's folder gate
 * admits a token to the folder's cubes and views by. They are the groups
 * granted on the folder, on an ancestor (a grant reaches down, AC-261) or on
 * a descendant (a grant reaches up, view-only, AC-262 and AC-263: a chart in
 * /A/B may be bound to /A's cube), and the Super-Admin group, which every
 * folder admits. A folder no group reaches carries the Super-Admin group
 * alone: an empty set admits nobody (research `xcube-slice-4.md`, Gotcha 5).
 *
 * A folder's set is always within its parent's: the parent's ancestors are
 * the folder's, and the folder and its descendants are the parent's
 * descendants. xcube requires that with security on (`400
 * invalid_permissions`).
 */
import type { AccessFolder } from './effective';

/** Each folder's allowed groups, sorted, by folder id. */
export function allowedGroups(
  folders: readonly AccessFolder[],
  superAdminGroup?: string,
): Map<string, string[]> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId === null || !byId.has(folder.parentId)) continue;
    const siblings = children.get(folder.parentId);
    if (siblings === undefined) children.set(folder.parentId, [folder.id]);
    else siblings.push(folder.id);
  }
  const grantedOn = (id: string): string[] => {
    const access = byId.get(id)?.access;
    return [...(access?.readOnly ?? []), ...(access?.readWrite ?? [])];
  };

  // Granted on the folder or above it. A cycle in bad data stops the walk.
  const above = new Map<string, ReadonlySet<string>>();
  const aboveOf = (id: string): ReadonlySet<string> => {
    const known = above.get(id);
    if (known !== undefined) return known;
    const chain: string[] = [];
    let at: string | null | undefined = id;
    while (at !== null && at !== undefined && !above.has(at) && !chain.includes(at)) {
      chain.push(at);
      at = byId.get(at)?.parentId;
    }
    let inherited: ReadonlySet<string> =
      at !== null && at !== undefined && above.has(at) ? above.get(at)! : new Set();
    for (const each of chain.reverse()) {
      const groups = new Set(inherited);
      for (const group of grantedOn(each)) groups.add(group);
      above.set(each, groups);
      inherited = groups;
    }
    return above.get(id)!;
  };

  // Granted on the folder or below it: each folder after its children.
  const below = new Map<string, ReadonlySet<string>>();
  for (const root of folders) {
    if (below.has(root.id)) continue;
    const stack: { id: string; expanded: boolean }[] = [{ id: root.id, expanded: false }];
    const onPath = new Set<string>();
    while (stack.length > 0) {
      const top = stack.pop()!;
      if (below.has(top.id)) continue;
      if (!top.expanded) {
        onPath.add(top.id);
        stack.push({ id: top.id, expanded: true });
        for (const child of children.get(top.id) ?? [])
          if (!below.has(child) && !onPath.has(child)) stack.push({ id: child, expanded: false });
        continue;
      }
      const groups = new Set(grantedOn(top.id));
      for (const child of children.get(top.id) ?? [])
        for (const group of below.get(child) ?? []) groups.add(group);
      below.set(top.id, groups);
      onPath.delete(top.id);
    }
  }

  const allowed = new Map<string, string[]>();
  for (const folder of folders) {
    const groups = new Set([...aboveOf(folder.id), ...(below.get(folder.id) ?? [])]);
    if (superAdminGroup !== undefined && superAdminGroup !== '') groups.add(superAdminGroup);
    allowed.set(folder.id, [...groups].sort());
  }
  return allowed;
}
