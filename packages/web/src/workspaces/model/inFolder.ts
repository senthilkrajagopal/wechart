import type { Me } from '../../shell/AccountMenu';
import type { FolderNode } from '../explore/FolderTree';
import { folderChain } from '../explore/folders';
import { SHARED_ROOT } from '../explore/roots';
import { objectsOf } from './objects';

/**
 * A model in its folder (T342; AC-222, rules 70 and 71): where its files
 * are, who may change them, and how the page names what they define.
 *
 * Opened from Explore, a model is under its folder, its folder and file in
 * the address. The Model workspace keeps its own addresses, the root's.
 */

/** A folder's model, none open: its files and what each defines (AC-131). */
export function modelHref(folderId?: string): string {
  return folderId === undefined
    ? '/model'
    : `/explore/folders/${encodeURIComponent(folderId)}/models`;
}

/** A model file, opened in its folder; with none named, the Model workspace's, the root's. */
export function fileHref(path: string, folderId?: string): string {
  return folderId === undefined
    ? `/model/files/${encodeURIComponent(path)}`
    : `${modelHref(folderId)}/${encodeURIComponent(path)}`;
}

/**
 * A pre-aggregation's file, opened on its cube's Pre-aggregations tab, and on
 * the member where one is named (T160, T469): a folder's in its folder, by
 * the name its file declares; the root's in the Model workspace (T530,
 * AC-222). None where no file is known.
 */
export function rollupHref({
  fileName,
  fileFolderId,
  cube,
  member,
}: {
  readonly fileName?: string | undefined;
  readonly fileFolderId?: string | undefined;
  readonly cube: string;
  readonly member?: string | undefined;
}): string | undefined {
  if (fileName === undefined) return undefined;
  const search = new URLSearchParams({
    cube,
    tab: 'pre_aggregations',
    ...(member === undefined ? {} : { member }),
  });
  return `${fileHref(fileName, fileFolderId)}?${search.toString()}`;
}

/**
 * Whether a shared model changes only through My workspace and a proposal:
 * signed in (T347), and with sign-in off too since a model lands through an
 * approval (T451's switch; AC-254, R52). So where Generate cubes and New
 * cube add, and how a shared model is offered, follow this, never whether
 * anyone is signed in. Unknown until who is asking is.
 */
export function modelsAreWorkspaceOnly(me: Me | undefined): boolean {
  return me !== undefined;
}

/**
 * Who may change a model, and how (rules 70 and 71, AC-222, AC-278):
 * - nobody in place: a model outside the workspace is shared, changed only
 *   in a copy in My workspace (`modelsAreWorkspaceOnly`). With sign-in off,
 *   its one user is offered "Edit in my workspace", as a Super-Admin is
 *   (T451's switch; AC-254, R52). With sign-in on, "Edit in my workspace" is
 *   for those who could propose it back — a Super-Admin or read-write
 *   member, with write on the model's folder; "Use in my workspace" for one
 *   with a workspace who may only read it (T543, AC-283).
 * - in My workspace, its owner, there: its models are changed in place and
 *   previewed through the workspace's overlay (T347, AC-222).
 *   Until who is signed in is known, nothing is changed in place.
 */
export function modelAccessOf({
  me,
  right,
  inWorkspace = false,
}: {
  readonly me: Me | undefined;
  /** Their right in the model's folder, as its access answered them (`rightFrom`). */
  readonly right: 'write' | 'read' | 'unknown';
  /** Whether the model's folder is My workspace, or one in it. */
  readonly inWorkspace?: boolean;
}): {
  readonly readOnly: boolean;
  readonly editInWorkspace: boolean;
  /**
   * "Use in my workspace" (T543, AC-283; R53): one with a workspace who may
   * only read the model's folder copies it in to use, going to a folder they
   * write as a new model, never proposed back.
   */
  readonly useInWorkspace: boolean;
} {
  const none = { editInWorkspace: false, useInWorkspace: false };
  // The one user of sign-in off holds every right, as a Super-Admin does.
  if (me?.security === 'off')
    return { readOnly: !inWorkspace, editInWorkspace: !inWorkspace, useInWorkspace: false };
  if (inWorkspace) return { readOnly: me?.security !== 'oidc', ...none };
  const hasWorkspace = me?.security === 'oidc' && (me.superAdmin || me.readWrite === true);
  return {
    readOnly: true,
    editInWorkspace: hasWorkspace && right === 'write',
    useInWorkspace: hasWorkspace && right === 'read',
  };
}

/**
 * A folder by its path below Shared, as Explore says it ("Sales / EMEA");
 * "Shared" for the root; nothing for a folder not (yet) among those listed.
 */
export function folderWordsOf(
  folderId: string,
  folders: readonly FolderNode[],
): string | undefined {
  if (folderId === SHARED_ROOT.id) return SHARED_ROOT.title;
  if (!folders.some((folder) => folder.id === folderId)) return undefined;
  return folderChain(folders, folderId)
    .slice(1)
    .map((crumb) => crumb.title)
    .join(' / ');
}

/**
 * A member as the model page says it (AC-329): by its one name, the same in
 * every folder (T710, AC-328), with the path of the folder keeping its cube
 * where that folder isn't the one open. The folder is the model's files'
 * (`homeOf`), never read from the name; one whose cube no file keeps is
 * said by its name alone.
 */
export function shownMemberOf(
  member: string,
  openFolderId: string,
  folders: readonly FolderNode[],
  /** The folder whose model declares a cube of this name; none where no file does. */
  homeOf: (cube: string) => string | undefined,
): string {
  const dot = member.indexOf('.');
  const folderId = homeOf(dot > 0 ? member.slice(0, dot) : member);
  if (folderId === undefined || folderId === openFolderId) return member;
  return `${member} (${folderWordsOf(folderId, folders) ?? SHARED_ROOT.title})`;
}

/**
 * Each cube's and view's folder, by its name, from the model's files: a
 * name is one item's across the model (R71). The root's for a file naming
 * none. Only a published folder's files count: a workspace copy keeps its
 * original's name (T710's review).
 */
export function homesOf(
  files: readonly { readonly path: string; readonly content: string; readonly folderId?: string }[],
  /** Whether a folder is published: a shared one xcube serves, not a workspace's. */
  published: (folderId: string) => boolean,
): (cube: string) => string | undefined {
  const homes = new Map<string, string>();
  for (const file of files) {
    const folderId = file.folderId ?? SHARED_ROOT.id;
    if (!published(folderId)) continue;
    for (const object of objectsOf(file.path, file.content).objects)
      if (!homes.has(object.name)) homes.set(object.name, folderId);
  }
  return (cube) => homes.get(cube);
}
