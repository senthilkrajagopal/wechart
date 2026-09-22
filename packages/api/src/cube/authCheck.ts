/**
 * Whether Cube lets in requests nobody signed (T175, AC-169), asked the way
 * anyone could ask it: `GET /v1/load` with no query, with no token and with
 * one that is not a token.
 *
 * Cube authenticates first, then asserts the `data` scope, then reads the
 * query (research/cube/api-scope-probes.md). So its words say how far the
 * request got:
 * - refused at the door: 403 "Authorization header isn't set" or "Invalid
 *   token" — what a Cube enforcing auth answers (research/cube/
 *   access-control.md, "HTTP authentication", and "Observed locally");
 * - let in: 403 "API scope is missing: …" or 400 "Query param is required",
 *   either past authentication — what a Cube not enforcing it answers, as
 *   the empty security context (Gotchas, "Auth is not enforced outside
 *   `NODE_ENV=production`").
 *
 * - `enforced`: both refused at the door.
 * - `open`: at least one let in; `accepted` says which.
 * - `unknown`: anything else — another 403, a redirect, an error, no answer
 *   in time — which proves neither, so is said as neither.
 */
export type AuthCheck =
  | { readonly auth: 'enforced' }
  | { readonly auth: 'open'; readonly accepted: readonly ('no token' | 'an invalid token')[] }
  | { readonly auth: 'unknown' };

/** Long enough for a busy Cube, short enough that a hung one reads as unknown. */
const PROBE_TIMEOUT_MS = 3000;

const REFUSALS = new Set(["Authorization header isn't set", 'Invalid token']);

type Probe = 'refused' | 'let in' | 'unknown';

async function probe(
  url: string,
  authorization: string | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Probe> {
  try {
    const response = await fetchImpl(url, {
      ...(authorization === undefined ? {} : { headers: { authorization } }),
      // A redirect is not Cube answering: a proxy's login page is not "let in".
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
    if (typeof said !== 'string') return 'unknown';
    if (response.status === 403 && REFUSALS.has(said)) return 'refused';
    if (response.status === 403 && said.startsWith('API scope is missing: ')) return 'let in';
    if (response.status === 400 && said === 'Query param is required') return 'let in';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function authCheckOf(
  /** Cube's API base, `…/cubejs-api`. */
  base: string,
  fetchImpl: typeof fetch = fetch,
  /** How long a probe may take before it reads unknown; shorter in tests. */
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<AuthCheck> {
  const url = `${base}/v1/load`;
  const [noToken, badToken] = await Promise.all([
    probe(url, undefined, fetchImpl, timeoutMs),
    probe(url, 'not-a-token', fetchImpl, timeoutMs),
  ]);
  const accepted = [
    ...(noToken === 'let in' ? (['no token'] as const) : []),
    ...(badToken === 'let in' ? (['an invalid token'] as const) : []),
  ];
  if (accepted.length > 0) return { auth: 'open', accepted };
  return noToken === 'refused' && badToken === 'refused'
    ? { auth: 'enforced' }
    : { auth: 'unknown' };
}
