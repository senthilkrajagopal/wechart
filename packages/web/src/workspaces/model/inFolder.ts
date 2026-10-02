import type { Me } from '../../shell/AccountMenu';
import type { FolderNode } from '../explore/FolderTree';
import { folderChain } from '../explore/folders';
import { SHARED_ROOT } from '../explore/roots';

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
 * Who may change a model, and how (rules 70 and 71, AC-222, AC-278):
 * - with sign-in off, its one user, in place, as phase 1 had it;
 * - with sign-in on, nobody in place: a model outside the workspace is
 *   shared, changed only in a copy in My workspace. "Edit in my workspace"
 *   is for those who could propose it back — a Super-Admin or read-write
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
  if (me?.security === 'off') return { readOnly: false, ...none };
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
 * A member as the model page says it (AC-329): named as charts are bound to
 * it — a folder's `<xcubeId>__<cube>.<member>` (AC-328) — it is said by its
 * short name, the one its file gives it, with its folder's path where that
 * folder isn't the one open. Never by its prefixed name.
 */
export function shownMemberOf(
  member: string,
  openFolderId: string,
  folders: readonly FolderNode[],
): string {
  const owner = folders.find(
    (folder) =>
      typeof folder.xcubeId === 'string' &&
      folder.xcubeId !== '' &&
      member.startsWith(`${folder.xcubeId}__`),
  );
  const folderId = owner?.id ?? SHARED_ROOT.id;
  const short = owner === undefined ? member : member.slice(`${String(owner.xcubeId)}__`.length);
  return folderId === openFolderId
    ? short
    : `${short} (${folderWordsOf(folderId, folders) ?? SHARED_ROOT.title})`;
}
