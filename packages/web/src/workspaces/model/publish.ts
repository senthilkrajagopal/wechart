import type { CubeProblem } from './ProblemsPanel';
import type { MemberReferences } from './ReferencesWarning';

/**
 * The charts and dashboards using the members a save edits (T147, AC-141);
 * nothing, if they couldn't be asked about — and then nothing is saved.
 */
export async function referencesTo(
  members: readonly string[],
): Promise<MemberReferences | undefined> {
  try {
    // In the body: a wide cube's names would outgrow a URL.
    const response = await fetch('/api/model/references', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ members }),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as MemberReferences;
  } catch {
    return undefined;
  }
}

/**
 * Publishing model changes (T142, AC-136): the API has Cube compile them as
 * a draft first, and makes them live only if Cube does; its reasons for
 * refusing come back on the files they are about.
 */
export type PublishOutcome =
  | { readonly kind: 'published'; readonly version: string }
  | { readonly kind: 'refused'; readonly problems: readonly CubeProblem[] }
  | { readonly kind: 'failed'; readonly message: string };

export async function publishModel(
  files: readonly { path: string; content: string }[],
  {
    created = [],
    folderId,
  }: {
    /**
     * The new files among them (drafts, T488): the API refuses any over a file
     * or a name it has (T276, AC-249).
     */
    created?: readonly string[];
    /** The folder whose files they are (T452, T342): the shared root's unless named. */
    folderId?: string | undefined;
  } = {},
): Promise<PublishOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/model/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(folderId === undefined ? {} : { folderId }),
        files,
        ...(created.length > 0 ? { create: created } : {}),
      }),
    });
  } catch {
    return { kind: 'failed', message: 'wechart could not be reached, so nothing was published.' };
  }
  const body = (await response.json().catch(() => ({}))) as {
    version?: string;
    errors?: CubeProblem[];
    error?: string;
  };
  if (response.ok && typeof body.version === 'string')
    return { kind: 'published', version: body.version };
  if (response.status === 422 && Array.isArray(body.errors))
    return { kind: 'refused', problems: body.errors };
  return {
    kind: 'failed',
    message: body.error ?? `The model could not be published (${String(response.status)}).`,
  };
}
