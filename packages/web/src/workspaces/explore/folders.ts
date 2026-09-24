import type { FolderNode } from './FolderTree';
import { ROOT_FOLDERS, SHARED_ROOT } from './roots';

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
  const root = ROOT_FOLDERS.find((each) => each.id === above) ?? SHARED_ROOT;
  return [{ id: root.id, title: root.title }, ...out];
}

/** Explore, open on a folder: the address a breadcrumb leads back to (AC-195). */
export function exploreHref(folderId: string): string {
  return folderId === SHARED_ROOT.id
    ? '/explore'
    : `/explore?folder=${encodeURIComponent(folderId)}`;
}
