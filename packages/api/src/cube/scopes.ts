/**
 * The Cube API scopes wechart's own security context has (T176, AC-170).
 * Cube lists no scopes, so each is probed with wechart's token by the
 * cheapest request that proves it without running a query or starting a
 * build. Cube asserts a scope first, before reading the request, so:
 *
 * - `missing`: 403 with Cube's own words, "API scope is missing: <scope>";
 * - `granted`: the answer the probe gets past that assertion;
 * - `unknown`: anything else — another 403 (a bad token), an error, no
 *   answer — which proves neither.
 *
 * (research/cube/api-scope-probes.md, and "Observed locally".)
 */
export const SCOPES = ['meta', 'data', 'sql', 'graphql', 'jobs'] as const;
export type Scope = (typeof SCOPES)[number];
export type ScopeState = 'granted' | 'missing' | 'unknown';

/** One request to Cube, signed as wechart; its status and parsed body. */
export type Ask = (
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> },
) => Promise<{ status: number; body: unknown }>;

interface Probe {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly body?: unknown;
  /** What Cube answers once past the scope's assertion — in its own shape. */
  readonly granted: (status: number, error: string | undefined, body: unknown) => boolean;
}

const requiredParam = (status: number, error: string | undefined) =>
  status === 400 && error === 'Query param is required';

const PROBES: Record<Scope, Probe> = {
  // Cube's metadata, not any 200: a proxy's fallback page is not a grant.
  meta: {
    path: '/v1/meta',
    method: 'GET',
    granted: (status, _error, body) =>
      status === 200 && Array.isArray((body as { cubes?: unknown } | null)?.cubes),
  },
  data: { path: '/v1/load', method: 'GET', granted: requiredParam },
  sql: { path: '/v1/sql', method: 'GET', granted: requiredParam },
  graphql: {
    path: '/graphql',
    method: 'POST',
    body: { query: '{ __typename }' },
    granted: (status, _error, body) =>
      status === 200 &&
      (body as { data?: { __typename?: unknown } } | null)?.data?.__typename === 'Query',
  },
  jobs: {
    path: '/v1/pre-aggregations/jobs',
    method: 'POST',
    body: {},
    granted: (status, error) => status === 400 && error === 'No job description provided',
  },
};

async function stateOf(scope: Scope, ask: Ask): Promise<ScopeState> {
  const probe = PROBES[scope];
  try {
    const { status, body } = await ask(probe.path, {
      method: probe.method,
      ...(probe.body === undefined
        ? {}
        : {
            body: JSON.stringify(probe.body),
            // JSON back from `/graphql`, not GraphiQL's page (research, Gotchas).
            headers: { 'content-type': 'application/json', accept: 'application/json' },
          }),
    });
    const error = (body as { error?: unknown } | null)?.error;
    const said = typeof error === 'string' ? error : undefined;
    if (status === 403 && said === `API scope is missing: ${scope}`) return 'missing';
    return probe.granted(status, said, body) ? 'granted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function scopesOf(ask: Ask): Promise<Record<Scope, ScopeState>> {
  // One at a time: the order they are listed in, and no burst at Cube.
  const states: Partial<Record<Scope, ScopeState>> = {};
  for (const scope of SCOPES) states[scope] = await stateOf(scope, ask);
  return states as Record<Scope, ScopeState>;
}
