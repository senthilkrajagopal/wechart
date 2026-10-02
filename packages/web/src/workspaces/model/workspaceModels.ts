import type { Target } from '../explore/NewItemDialog';
import { browserTimeZone } from '../explore/projectFolder';

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
  /** A use-only copy's: the folder the user writes it goes to, as a new model (T543, AC-283). */
  targetFolderId?: string,
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
        ...(targetFolderId === undefined ? {} : { targetFolderId }),
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
