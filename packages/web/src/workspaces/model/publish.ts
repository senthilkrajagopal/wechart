import type { CubeProblem } from './ProblemsPanel';

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
): Promise<PublishOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/model/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
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
