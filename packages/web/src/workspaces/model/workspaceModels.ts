import { parseDocument } from 'yaml';

import type { Target } from '../explore/NewItemDialog';
import { browserTimeZone } from '../explore/projectFolder';
import { objectsOf } from './objects';

interface FileText {
  readonly path: string;
  readonly content: string;
}

/**
 * What a model in My workspace joins and picks from besides its own text
 * (AC-138, AC-224): its folder's other files and drafts, and the shared
 * files on the path of the folder it goes to (T451's switch), less those
 * declaring a cube or view the workspace's files declare, which are its own.
 */
export function filesBeside<Shared extends FileText & { readonly folderId?: string }>({
  open,
  own,
  shared,
  onPath,
}: {
  /** The open file's path, read from the form instead. */
  readonly open: string | undefined;
  readonly own: readonly FileText[];
  readonly shared: readonly Shared[];
  /** The folders on the path of the folder it goes to; none while that isn't known. */
  readonly onPath: ReadonlySet<string>;
}): (FileText | Shared)[] {
  const declared = new Set(
    own.flatMap((file) => objectsOf(file.path, file.content).objects.map((each) => each.name)),
  );
  const fromPath = shared.filter(
    (file) =>
      onPath.has(file.folderId ?? 'root') &&
      !objectsOf(file.path, file.content).objects.some((each) => declared.has(each.name)),
  );
  // Only the workspace's file at the open path is the open file: a shared
  // one there declaring another cube is the model's still.
  return [...own.filter((file) => file.path !== open), ...fromPath];
}

/**
 * Models in My workspace (T347; AC-222, AC-278, AC-282): a shared model
 * copied in to be edited, and a new cube or view made there with the shared
 * folder it is to go to. Saved, each is previewed through the workspace's
 * overlay; it reaches its folder only through a proposal.
 */

/**
 * "Edit in my workspace" for a shared model (rule 71): a copy of its file in
 * a project folder of its own, or the copy already there, where it opens; or
 * the API's reason it can't be made.
 */
export async function copyModelToWorkspace(
  folderId: string,
  path: string,
): Promise<{ readonly folderId: string; readonly path: string } | { readonly error: string }> {
  let response: Response;
  try {
    response = await fetch('/api/workspace/copies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'model',
        folderId,
        path,
        timeZone: browserTimeZone(),
      }),
    });
  } catch {
    return { error: 'wechart could not be reached, so nothing was copied.' };
  }
  const body = (await response.json().catch(() => ({}))) as {
    folderId?: unknown;
    path?: unknown;
    error?: unknown;
  };
  if (response.ok && typeof body.folderId === 'string' && typeof body.path === 'string')
    return { folderId: body.folderId, path: body.path };
  return {
    error:
      typeof body.error === 'string'
        ? body.error
        : `The model could not be copied into My workspace (${String(response.status)}).`,
  };
}

/**
 * The shared folder a model saved in My workspace goes to (T347, AC-282), as
 * its folder's contents list it; none where none is stored for it. Thrown
 * where the folder couldn't be read (T546).
 */
export async function savedTargetOf(folderId: string, path: string): Promise<string | undefined> {
  const response = await fetch(`/api/folders/${encodeURIComponent(folderId)}/contents`);
  if (!response.ok)
    throw new Error(`Could not read where the model goes (${String(response.status)}).`);
  const rows = (await response.json()) as {
    kind?: unknown;
    id?: unknown;
    targetFolderId?: unknown;
  }[];
  const target = rows.find((row) => row.kind === 'model' && row.id === path)?.targetFolderId;
  return typeof target === 'string' && target !== '' ? target : undefined;
}

/**
 * The cube or view a model file declares, by name: its first cube's, else
 * its first view's (T717's review, AC-283: a use-only copy's "Request a
 * change" asks about the name its saved file holds). None where it declares
 * nothing or doesn't parse.
 */
export function declaredNameOf(content: string): string | undefined {
  let model: unknown;
  try {
    const document = parseDocument(content);
    if (document.errors.length > 0) return undefined;
    model = document.toJS();
  } catch {
    return undefined;
  }
  if (model === null || typeof model !== 'object') return undefined;
  for (const key of ['cubes', 'views'] as const) {
    const items = (model as Record<string, unknown>)[key];
    const name = Array.isArray(items)
      ? (items[0] as { name?: unknown } | undefined)?.name
      : undefined;
    if (typeof name === 'string' && name !== '') return name;
  }
  return undefined;
}

/**
 * Whether a saved workspace file is a use-only copy (T543, T717, AC-283):
 * proposed to no folder, its page offers "Request a change" instead.
 */
export async function isUseOnlyCopy(folderId: string, path: string): Promise<boolean> {
  const response = await fetch(`/api/folders/${encodeURIComponent(folderId)}/contents`);
  if (!response.ok)
    throw new Error(`Could not read what the model was copied from (${String(response.status)}).`);
  const rows = (await response.json()) as {
    kind?: unknown;
    id?: unknown;
    origin?: { useOnly?: unknown } | null;
  }[];
  return rows.find((row) => row.kind === 'model' && row.id === path)?.origin?.useOnly === true;
}

/** The shared folders a new workspace item may go to: those the user writes (T345). */
export async function targetsOf(): Promise<readonly Target[]> {
  const response = await fetch('/api/folders/targets');
  if (!response.ok)
    throw new Error(`Could not list the folders it may go to (${String(response.status)}).`);
  return (await response.json()) as Target[];
}

/**
 * Where each new file in a workspace folder is to go, until it is first saved
 * (T347, AC-282): asked for when it was made, kept for the tab beside its
 * draft. Storage may be refused; it is then kept on this page only.
 */
const TARGETS_STORAGE = 'wechart.model.targets';
const remembered = new Map<string, string>();
const keyOf = (folderId: string, path: string) => `${folderId}/${path}`;

function readTargets(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(TARGETS_STORAGE) ?? '{}');
    return kept !== null && typeof kept === 'object' ? (kept as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function keepDraftTarget(folderId: string, path: string, target: string): void {
  remembered.set(keyOf(folderId, path), target);
  try {
    sessionStorage.setItem(
      TARGETS_STORAGE,
      JSON.stringify({ ...readTargets(), [keyOf(folderId, path)]: target }),
    );
  } catch {
    // Kept on this page only.
  }
}

export function draftTargetOf(folderId: string, path: string): string | undefined {
  return remembered.get(keyOf(folderId, path)) ?? readTargets()[keyOf(folderId, path)];
}

/** A new cube or view, named as asked: its file under `cubes/` or `views/`. */
export function namedFileOf(
  kind: 'cube' | 'view',
  name: string,
): { readonly path: string; readonly content: string } {
  return {
    path: `${kind === 'cube' ? 'cubes' : 'views'}/${name}.yml`,
    // As New cube makes one elsewhere (T484, T493): no made-up table, no
    // cube chosen for a view.
    content:
      kind === 'cube'
        ? `cubes:\n  - name: ${name}\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`
        : `views:\n  - name: ${name}\n`,
  };
}
