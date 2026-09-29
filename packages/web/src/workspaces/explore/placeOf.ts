import type { FolderNode } from './FolderTree';
import { targetPathOf } from './folders';

/**
 * What a dashboard's or library chart's header says of where it lives and
 * how it is changed (T348, AC-278; design 04, states E and F; rules 71–73),
 * from the API's `workspace` answer:
 * - shared: its folder, version and last approval, changed only in a copy —
 *   "Edit in my workspace", or "Open my copy" once there is one — and only
 *   by those who may copy it;
 * - in the workspace: where it came from and where it goes, with
 *   "Propose to *target*…".
 * Nothing with sign-in off, where there are no workspaces. Until the folders
 * are known, no line and no target, but still no edit of a shared one
 * (T348's review): a path read from no folders would be wrong.
 */
export interface ItemWorkspace {
  readonly inWorkspace: boolean;
  readonly mayCopy: boolean;
  readonly copyId: string | null;
}

export type Place =
  | {
      readonly kind: 'shared';
      readonly line: string | undefined;
      readonly copy:
        | {
            readonly label: 'Edit in my workspace' | 'Open my copy';
            readonly copyId: string | null;
          }
        | undefined;
    }
  | {
      readonly kind: 'workspace';
      readonly line: string | undefined;
      readonly proposeTo:
        { readonly label: string; readonly targetPath: readonly string[] } | undefined;
    };

export function placeOf({
  title,
  folderId,
  version,
  origin,
  targetFolderId,
  workspace,
  folders,
  approved,
}: {
  readonly title: string;
  readonly folderId: string | undefined;
  readonly version: number;
  readonly origin?: { readonly id: string; readonly version: number; readonly folderId?: string };
  readonly targetFolderId?: string | undefined;
  readonly workspace: ItemWorkspace | undefined;
  /** Undefined until they are read. */
  readonly folders: readonly FolderNode[] | undefined;
  /** "approved 22 Sep by Ada Admin", from its history, where the user may read it. */
  readonly approved?: string | undefined;
}): Place | undefined {
  if (workspace === undefined) return undefined;
  const pathOf = (id: string | undefined) =>
    id === undefined || folders === undefined ? undefined : targetPathOf(folders, id);
  if (!workspace.inWorkspace) {
    const here = pathOf(folderId) ?? 'Shared';
    return {
      kind: 'shared',
      line:
        folders === undefined
          ? undefined
          : [
              `In ${here}`,
              `version ${String(version)}`,
              ...(approved === undefined ? [] : [approved]),
            ].join(' · '),
      copy: workspace.mayCopy
        ? workspace.copyId === null
          ? { label: 'Edit in my workspace', copyId: null }
          : { label: 'Open my copy', copyId: workspace.copyId }
        : undefined,
    };
  }
  const target = pathOf(targetFolderId);
  const from = origin === undefined ? undefined : pathOf(origin.folderId);
  const line =
    folders === undefined
      ? undefined
      : origin !== undefined
        ? `Copied from ${from ?? 'a folder you can no longer see'} › ${title} · version ${String(origin.version)}${target === undefined ? '' : ` · Target: ${target}`}`
        : target === undefined
          ? 'In My workspace · no target yet'
          : `New in My workspace · Target: ${target}`;
  return {
    kind: 'workspace',
    line,
    proposeTo:
      target === undefined
        ? undefined
        : {
            label: `Propose to ${target}…`,
            targetPath: target === 'Shared' ? ['Shared'] : ['Shared', ...target.split(' / ')],
          },
  };
}
