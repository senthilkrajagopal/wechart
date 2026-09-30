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
  | {
      readonly kind: 'refused';
      readonly problems: readonly CubeProblem[];
      /**
       * The breaks in folders the user can't see, only counted, in the API's
       * words (T427, AC-322); none where every break is named.
       */
      readonly hidden?: { readonly count: number; readonly said: string };
    }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Why a publish was refused, in a line: wechart's own words for rollups
 * naming what the model lacks (AC-189) or whose cubes can't be joined
 * (AC-235), else Cube's refusal; and the breaks in folders the user can't
 * see, counted in the API's words (T427, AC-322).
 */
export function refusedText(
  problems: readonly CubeProblem[],
  hidden?: { readonly count: number; readonly said: string },
): string {
  if (problems.length === 0 && hidden !== undefined)
    return `Nothing was published: ${hidden.said}`;
  const why = problems.every((problem) => problem.preAggregation?.unknown !== undefined)
    ? 'A pre-aggregation names members the model doesn’t have, so nothing was published.'
    : problems.every((problem) => problem.preAggregation !== undefined)
      ? 'A pre-aggregation’s cubes can’t be joined, so nothing was published.'
      : 'Cube refused the model, so nothing was published.';
  return hidden === undefined ? why : `${why} ${hidden.said}`;
}

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
    hidden?: number;
  };
  if (response.ok && typeof body.version === 'string')
    return { kind: 'published', version: body.version };
  if (response.status === 422 && Array.isArray(body.errors))
    return {
      kind: 'refused',
      problems: body.errors,
      ...(typeof body.hidden === 'number' && body.hidden > 0
        ? { hidden: { count: body.hidden, said: body.error ?? '' } }
        : {}),
    };
  return {
    kind: 'failed',
    message: body.error ?? `The model could not be published (${String(response.status)}).`,
  };
}
