import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { InfoBar } from '../../shell/InfoBar';
import { folderTextOf } from './builds';
import { Pill } from './Pill';

/**
 * Every Jobs tab's and Schedules' Folder filter, and the scope note (T559,
 * AC-297; design 16, pins 3 and 4, state H2): "All of mine", a read-write
 * member's folders, or "All folders", a Super-Admin's every one, the root's
 * as Shared, each by its path; and Include subfolders, as the audit trail's
 * filter has it. The choices are the API's, over the folders the user
 * builds in.
 */
export interface JobsFolder {
  readonly id: string;
  /** From Shared down: `['Shared', 'Sales', 'EMEA']`. */
  readonly path: readonly string[];
  /** Its parent's id; none for the root. */
  readonly parentId: string | null;
}

export interface JobsFolders {
  readonly folders: readonly JobsFolder[];
  /** A Super-Admin's, or sign-in off: every folder, and no scope note. */
  readonly everyFolder: boolean;
}

/** A folder chosen, '' for every one of theirs, and whether those below it count. */
export interface FolderChoice {
  readonly folder: string;
  readonly subfolders: boolean;
}

export const EVERY_FOLDER: FolderChoice = { folder: '', subfolders: false };

export const JOBS_FOLDERS_KEY = ['jobs', 'folders'] as const;

/** The folders the user builds in, read once for every tab. */
export function useJobsFolders() {
  return useQuery({
    queryKey: JOBS_FOLDERS_KEY,
    queryFn: async ({ signal }): Promise<JobsFolders> => {
      const response = await fetch('/api/jobs/folders', { signal });
      if (!response.ok)
        throw new Error(`The folders could not be read (${String(response.status)}).`);
      return (await response.json()) as JobsFolders;
    },
  });
}

/** Whether a row in `folderId` is listed under `choice`: its folder, or one below it with Include subfolders. */
export function inFolder(
  folderId: string | null | undefined,
  choice: FolderChoice,
  folders: readonly JobsFolder[],
): boolean {
  if (choice.folder === '') return true;
  if (folderId === choice.folder) return true;
  if (!choice.subfolders || folderId == null) return false;
  const parentOf = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const seen = new Set<string>();
  for (let at = parentOf.get(folderId); at != null && !seen.has(at); at = parentOf.get(at)) {
    if (at === choice.folder) return true;
    seen.add(at);
  }
  return false;
}

/**
 * A choice's words, as state H2 draws them: a member's folders each by its
 * path, "Sales / EMEA"; a Super-Admin's every folder as a tree of short
 * names under "Shared · the root", each indented by its depth (T560).
 */
export function choiceOf(folder: JobsFolder, everyFolder: boolean): string {
  if (!everyFolder) return folderTextOf(folder.path);
  if (folder.parentId === null) return 'Shared · the root';
  return `${'   '.repeat(folder.path.length - 1)}${folder.path.at(-1) ?? ''}`;
}

/**
 * Folders in their tree's order: each followed by those below it, before
 * its next sibling, by comparing their paths a folder at a time ("Sales",
 * "Sales / EMEA", then "Sales Ops"), so H2's indented tree reads true
 * (T560's review).
 */
export function inTreeOrder(folders: readonly JobsFolder[]): JobsFolder[] {
  return [...folders].sort((a, b) => {
    for (let at = 0; at < Math.min(a.path.length, b.path.length); at += 1) {
      const order = (a.path[at] ?? '').localeCompare(b.path[at] ?? '');
      if (order !== 0) return order;
    }
    return a.path.length - b.path.length;
  });
}

export function FolderFilter({
  folders,
  choice,
  onChange,
}: {
  readonly folders: JobsFolders | undefined;
  readonly choice: FolderChoice;
  readonly onChange: (choice: FolderChoice) => void;
}) {
  return (
    <>
      <Pill label="Folder">
        {(id) => (
          <select
            id={id}
            value={choice.folder}
            onChange={(event) => {
              const folder = event.target.value;
              onChange(folder === '' ? EVERY_FOLDER : { ...choice, folder });
            }}
          >
            <option value="">
              {folders?.everyFolder === true ? 'All folders' : 'All of mine'}
            </option>
            {inTreeOrder(folders?.folders ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {choiceOf(folder, folders?.everyFolder === true)}
              </option>
            ))}
          </select>
        )}
      </Pill>
      <label className="audit-trail__subfolders">
        <input
          type="checkbox"
          checked={choice.subfolders}
          disabled={choice.folder === ''}
          onChange={(event) => {
            onChange({ ...choice, subfolders: event.target.checked });
          }}
        />
        Include subfolders
      </label>
    </>
  );
}

/**
 * The scope note (design 16, pin 3; surface 10's words): for a read-write
 * member, never a Super-Admin. It names no other folder.
 */
export function ScopeNote({
  folders,
  children,
}: {
  readonly folders: JobsFolders | undefined;
  readonly children: ReactNode;
}) {
  if (folders === undefined || folders.everyFolder) return null;
  return (
    <InfoBar label="Scope">
      <p>{children}</p>
    </InfoBar>
  );
}
