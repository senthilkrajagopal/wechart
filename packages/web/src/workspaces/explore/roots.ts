/**
 * The folder tree's two roots (AC-194, R9): a shared one, and the personal
 * "My workspace" — in phase 1, with one user, simply a place for personal and
 * draft work. Neither is a document: a document sits in one by carrying its
 * id as its folder, as `packages/api/src/repos/catalog.ts` says.
 *
 * One list, imported by every place that names a root — Explore, the move
 * and folder pickers, the dashboard's breadcrumb, the shared-chart notice —
 * so they cannot call the same place by different names.
 */
export interface RootFolder {
  readonly id: string;
  readonly title: string;
}

export const SHARED_ROOT: RootFolder = { id: 'root', title: 'Shared' };
export const MY_WORKSPACE: RootFolder = { id: 'mine', title: 'My workspace' };
export const ROOT_FOLDERS: readonly RootFolder[] = [SHARED_ROOT, MY_WORKSPACE];

/**
 * My workspace, however the API names it (T343, AC-276): `mine` to the
 * client, and with sign-in on the user's own `ws:<key>`, which items in it
 * carry as their folder.
 */
export function isMyWorkspace(id: string): boolean {
  return id === MY_WORKSPACE.id || id.startsWith('ws:');
}

/** A root's name, or undefined for an id that is not a root. */
export function rootTitleOf(id: string): string | undefined {
  return isMyWorkspace(id)
    ? MY_WORKSPACE.title
    : ROOT_FOLDERS.find((root) => root.id === id)?.title;
}

/**
 * The roots the tree shows (T343, AC-277): the shared root, and My workspace
 * where the API counts one — none for a user with read-only access
 * everywhere, nor before the counts come. Each with its count, where known.
 *
 * With sign-in on My workspace comes first, above the shared tree (design 04
 * of 2026-09-27, pin 1); with one user, phase 1's order stays.
 */
export function visibleRoots(
  counts: Readonly<Record<string, number>> | undefined,
  { workspaceFirst = false }: { readonly workspaceFirst?: boolean } = {},
): (RootFolder & { readonly itemCount?: number })[] {
  const shown = ROOT_FOLDERS.filter(
    (root) => root.id !== MY_WORKSPACE.id || counts?.[MY_WORKSPACE.id] !== undefined,
  ).map((root) => {
    const itemCount = counts?.[root.id];
    return itemCount === undefined ? root : { ...root, itemCount };
  });
  // Built in order, not sorted: a comparator that says only "mine first" is
  // one engines may apply either way round (T498's review; Firefox did).
  return workspaceFirst
    ? [
        ...shown.filter((root) => root.id === MY_WORKSPACE.id),
        ...shown.filter((root) => root.id !== MY_WORKSPACE.id),
      ]
    : shown;
}
