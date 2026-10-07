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
            {(folders?.folders ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderTextOf(folder.path)}
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
