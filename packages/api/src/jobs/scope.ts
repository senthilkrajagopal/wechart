import type { FastifyRequest } from 'fastify';

import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { PublishedFolders } from '../xcube/folders';

/**
 * Who may use Jobs and Schedules, and over which folders (T371, AC-297; R40):
 * a Super-Admin, or anyone with sign-in off, over every folder; a read-write
 * member over the folders they write; no one else. A dashboard's Data as of
 * reads the schedules of the folders its viewer may see, whoever they are.
 */
export type JobsScope =
  | { readonly all: true }
  | {
      readonly all: false;
      /** Whether they may build this folder's pre-aggregations, and see its schedules in Schedules. */
      readonly writes: (folderId: string) => boolean;
      /** Whether they may see this folder at all: Data as of's schedules. */
      readonly sees: (folderId: string) => boolean;
      /** Whether they write any folder: without one, there are no Jobs or Schedules for them. */
      readonly writesAny: boolean;
    };

export interface JobsAccess {
  readonly scope: (request: FastifyRequest) => Promise<JobsScope>;
  /** Where each folder is published: its xcube id, by wechart's (T452). */
  readonly folders?: () => Promise<PublishedFolders>;
  /** The shared folders, for a folder's path from Shared. */
  readonly tree?: () => Promise<
    readonly { readonly id: string; readonly title: string; readonly parentId: string | null }[]
  >;
}

export const EVERYTHING: JobsScope = { all: true };

/** Said to one who may use neither Jobs nor Schedules. */
export const NO_JOBS = {
  error: 'Jobs and Schedules are for Super-Admins and read-write members of a folder.',
};

/** Where a cube is published, by wechart's folder id, and its short name there. */
export interface Placement {
  /** Null for a folder wechart no longer knows: only a Super-Admin sees it. */
  readonly folderId: string | null;
  readonly shortName: string;
  /** From Shared down: `['Shared', 'Sales', 'EMEA']`. */
  readonly folderPath: readonly string[];
}

/**
 * Each cube's folder, from its `meta.xcube = { folderId, shortName }`, xcube's
 * id for the folder (`[X3A]`); the root for a cube with none. People see a
 * folder's cube by its short name, with its folder (§P2.6 D).
 */
export async function placements(
  access: JobsAccess | undefined,
): Promise<(cube: Record<string, unknown>) => Placement> {
  const published = access?.folders === undefined ? undefined : await access.folders();
  const byXcubeId = new Map([...(published?.ids ?? [])].map(([id, xcubeId]) => [xcubeId, id]));
  const tree = (await access?.tree?.()) ?? [];
  const byId = new Map(tree.map((folder) => [folder.id, folder]));
  const pathOf = (folderId: string) => {
    const path: string[] = [];
    const seen = new Set<string>();
    for (let at = byId.get(folderId); at !== undefined && !seen.has(at.id);) {
      seen.add(at.id);
      if (at.id !== ROOT_FOLDER_ID) path.unshift(at.title);
      at = at.parentId === null ? undefined : byId.get(at.parentId);
    }
    return ['Shared', ...path];
  };
  return (cube) => {
    const name = typeof cube['name'] === 'string' ? cube['name'] : '';
    const xcube = (cube['meta'] as { xcube?: { folderId?: unknown; shortName?: unknown } } | null)
      ?.xcube;
    const xcubeId = typeof xcube?.folderId === 'string' ? xcube.folderId : undefined;
    const folderId =
      xcubeId === undefined
        ? ROOT_FOLDER_ID
        : (byXcubeId.get(xcubeId) ?? (xcubeId === 'froot' ? ROOT_FOLDER_ID : null));
    return {
      folderId,
      shortName: typeof xcube?.shortName === 'string' ? xcube.shortName : name,
      folderPath: folderId === null ? ['Shared', 'A folder no longer there'] : pathOf(folderId),
    };
  };
}

/** Whether a row's folder is one the scope reaches, for building (`writes`) or for Data as of (`sees`). */
export const reaches = (
  scope: JobsScope,
  folderId: string | null,
  how: 'writes' | 'sees' = 'writes',
): boolean => scope.all || (folderId !== null && scope[how](folderId));
