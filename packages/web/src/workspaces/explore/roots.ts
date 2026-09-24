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

/** A root's name, or undefined for an id that is not a root. */
export function rootTitleOf(id: string): string | undefined {
  return ROOT_FOLDERS.find((root) => root.id === id)?.title;
}
