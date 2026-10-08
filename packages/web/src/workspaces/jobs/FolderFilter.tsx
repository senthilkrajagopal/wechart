import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { InfoBar } from '../../shell/InfoBar';
import { ME_QUERY } from '../../shell/me';
import { folderTextOf, personName, useSingleUser } from './builds';
import { isRefused, readErrorOf } from './ListStates';
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
      // With its status: refused, they write no folder (T610, G6).
      if (!response.ok)
        throw await readErrorOf(response, 'The folders could not be read', 'GET /api/jobs/folders');
      return (await response.json()) as JobsFolders;
    },
  });
}

/**
 * Whether the user may not use Jobs or Schedules at all (T610; design 16,
 * G6 and rule 67): their folders refused before they were ever read, so the
 * page reads as the app's Not found. One who loses access while the page is
 * open is told so by its lists instead (G5b).
 */
export const neverTheirs = (folders: ReturnType<typeof useJobsFolders>): boolean =>
  folders.isError && isRefused(folders.error) && folders.data === undefined;

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

/** One step of a choice's indent: a native option takes no padding, so spaces that don't collapse. */
const STEP = '   ';

/**
 * A choice's words, as state H2 draws them, each a step in under All and a
 * step further for each of its folders above it that is listed too (T610):
 * a member's folders each by its path, "Sales / EMEA"; a Super-Admin's
 * every folder as a tree of short names under "Shared · the root" (T560).
 */
export function choiceOf(
  folder: JobsFolder,
  everyFolder: boolean,
  folders: readonly JobsFolder[] = [],
): string {
  const parentOf = new Map(folders.map((each) => [each.id, each.parentId]));
  let depth = 0;
  const seen = new Set<string>();
  for (let at = folder.parentId; at !== null && parentOf.has(at) && !seen.has(at);) {
    seen.add(at);
    depth += 1;
    at = parentOf.get(at) ?? null;
  }
  const words = !everyFolder
    ? folderTextOf(folder.path)
    : folder.parentId === null
      ? 'Shared · the root'
      : (folder.path.at(-1) ?? '');
  return `${STEP.repeat(depth + 1)}${words}`;
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
  // Headed by whose folders they are, "Wren · read-write", as H2's menu is (T611).
  const me = useQuery({ ...ME_QUERY, retry: false, staleTime: Infinity });
  const single = useSingleUser();
  const choices = (
    <>
      <option value="">{folders?.everyFolder === true ? 'All folders' : 'All of mine'}</option>
      {inTreeOrder(folders?.folders ?? []).map((folder) => (
        <option key={folder.id} value={folder.id}>
          {choiceOf(folder, folders?.everyFolder === true, folders?.folders)}
        </option>
      ))}
    </>
  );
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
            {me.data === undefined ? (
              choices
            ) : (
              <optgroup
                // By first name, "Wren · read-write", as H2's menu heads it (T612).
                label={`${personName(me.data, single).split(' ')[0] ?? ''} · ${folders?.everyFolder === true ? 'Super-Admin' : 'read-write'}`}
              >
                {choices}
              </optgroup>
            )}
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
