import type { FolderNode } from './FolderTree';
import { isMyWorkspace, MY_WORKSPACE, ROOT_FOLDERS, SHARED_ROOT } from './roots';

/**
 * Every folder, for the tree and for a breadcrumb (AC-017, AC-195): one query
 * definition under one key, so Explore and a dashboard's breadcrumb share the
 * cache entry rather than registering two functions under the same key.
 */
export const FOLDERS_QUERY = {
  queryKey: ['folders'] as const,
  queryFn: async (): Promise<FolderNode[]> => {
    const response = await fetch('/api/folders');
    if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
    return (await response.json()) as FolderNode[];
  },
};

export interface Crumb {
  readonly id: string;
  readonly title: string;
}

/**
 * The folder and each folder above it, the root it hangs from first — the
 * shared root or My workspace (AC-194). A root alone is its own chain.
 */
export function folderChain(folders: readonly FolderNode[], id: string): Crumb[] {
  const out: Crumb[] = [];
  let above: string | null = id;
  let current = folders.find((folder) => folder.id === id);
  // Bounded by the number of folders: a cycle in stored data cannot hang it.
  for (let guard = 0; current !== undefined && guard <= folders.length; guard += 1) {
    out.unshift({ id: current.id, title: current.title });
    above = current.parentId;
    const parent: string | null = above;
    current = folders.find((folder) => folder.id === parent);
  }
  // A folder in a user's own `ws:` workspace hangs from My workspace (T343).
  const root =
    above !== null && isMyWorkspace(above)
      ? MY_WORKSPACE
      : (ROOT_FOLDERS.find((each) => each.id === above) ?? SHARED_ROOT);
  return [{ id: root.id, title: root.title }, ...out];
}

/**
 * A shared folder named as where a workspace item goes (T498; design 04, pin
 * 3): its path below Shared, as the target picker names it, or "Shared" for
 * the root. Undefined for a folder the user can't see.
 */
export function targetPathOf(folders: readonly FolderNode[], id: string): string | undefined {
  if (id === SHARED_ROOT.id) return SHARED_ROOT.title;
  if (!folders.some((folder) => folder.id === id)) return undefined;
  const chain = folderChain(folders, id);
  if (chain[0]?.id !== SHARED_ROOT.id) return undefined;
  return chain
    .slice(1)
    .map((crumb) => crumb.title)
    .join(' / ');
}

/** Explore, open on a folder: the address a breadcrumb leads back to (AC-195). */
export function exploreHref(folderId: string): string {
  return folderId === SHARED_ROOT.id
    ? '/explore'
    : `/explore?folder=${encodeURIComponent(folderId)}`;
}
