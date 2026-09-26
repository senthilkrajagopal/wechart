import type { AccessFolder, FolderRight } from '@wechart/core';

/**
 * What a user may see of the shared tree, with security on (T325, AC-264,
 * AC-194): each folder they may see, with its right (`folderRights`), and the
 * tree it was computed over. A folder missing from `rights` is theirs neither
 * to list nor to open.
 */
export interface Visibility {
  readonly tree: readonly AccessFolder[];
  readonly rights: ReadonlyMap<string, FolderRight>;
}

/** A folder's own dashboards and library charts (`catalog.libraryCounts`). */
export type LibraryCounts = ReadonlyMap<string, { dashboards: number; charts: number }>;

/** What the user may see of one folder's own items: its dashboards, and its library charts where every kind is theirs. */
function ownVisible(folderId: string, visibility: Visibility, counts: LibraryCounts): number {
  const right = visibility.rights.get(folderId);
  if (right === undefined) return 0;
  const own = counts.get(folderId) ?? { dashboards: 0, charts: 0 };
  return own.dashboards + (right.kinds === 'all' ? own.charts : 0);
}

/**
 * Each visible folder's count: what the user may see in it and in every
 * visible folder beneath it (AC-194). A folder they can't see adds nothing,
 * nor does anything below it that they can't see. Bad data's cycles stop the
 * walk. `only`: the folders to count, where a caller lists a few; every
 * visible folder otherwise.
 */
export function visibleCounts(
  visibility: Visibility,
  counts: LibraryCounts,
  only?: readonly string[],
): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const folder of visibility.tree) {
    if (folder.parentId === null) continue;
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    children.set(folder.parentId, siblings);
  }
  const totals = new Map<string, number>();
  for (const folderId of only ?? visibility.rights.keys()) {
    if (!visibility.rights.has(folderId)) continue;
    let total = 0;
    const seen = new Set<string>();
    const pending = [folderId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      total += ownVisible(id, visibility, counts);
      pending.push(...(children.get(id) ?? []));
    }
    totals.set(folderId, total);
  }
  return totals;
}

/** The folders whose dashboards, and whose library charts, the user may find in search. */
export function searchable(visibility: Visibility): { dashboards: string[]; charts: string[] } {
  const dashboards: string[] = [];
  const charts: string[] = [];
  for (const [id, right] of visibility.rights) {
    dashboards.push(id);
    if (right.kinds === 'all') charts.push(id);
  }
  return { dashboards, charts };
}
