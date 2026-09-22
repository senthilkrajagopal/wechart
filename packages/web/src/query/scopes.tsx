import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { SecurityPreview } from './securityPreview';

/**
 * Cube's API scopes, as wechart's own security context has them (T176,
 * AC-170): probed by the API (`/api/cube-scopes`, research/cube/
 * api-scope-probes.md), and read from Cube's refusal when a request lacks
 * one — "API scope is missing: <scope>".
 */
export const SCOPES = ['meta', 'data', 'sql', 'graphql', 'jobs'] as const;
export type Scope = (typeof SCOPES)[number];
export type ScopeState = 'granted' | 'missing' | 'unknown';

/** What in wechart needs each scope (research's probe table, by endpoint). */
export const NEEDED_BY: Record<Scope, string> = {
  meta: 'The fields of charts and filters, formats, and listing pre-aggregations',
  data: 'Dashboards, charts, filter values and underlying rows',
  sql: 'Whether a rollup serves a chart',
  graphql: 'Nothing in wechart',
  jobs: 'Building pre-aggregations and following their builds',
};

export const SCOPES_QUERY = {
  queryKey: ['cube-scopes'],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Record<Scope, ScopeState>> => {
    const response = await fetch('/api/cube-scopes', { signal });
    if (!response.ok)
      throw new Error(`Cube's API scopes could not be read (${String(response.status)}).`);
    return (await response.json()) as Record<Scope, ScopeState>;
  },
};

export function useScopes() {
  return useQuery(SCOPES_QUERY);
}

/** The scope Cube said a request lacks; undefined for any other failure. */
export function missingScopeOf(error: unknown): Scope | undefined {
  const message = error instanceof Error ? error.message : undefined;
  const found =
    message === undefined ? undefined : /API scope is missing: (\w+)/.exec(message)?.[1];
  return SCOPES.find((scope) => scope === found);
}

/**
 * A screen that cannot work without a scope its context lacks: said as that,
 * and where to look, rather than as the request's failure. Scopes are per
 * token (research/cube/api-scope-probes.md, Gotchas), so under a previewed
 * security context (T172) it is that context's scope, not wechart's.
 */
export function ScopeUnavailable({ scope, what }: { scope: Scope; what: string }) {
  const previewed = useContext(SecurityPreview) !== undefined;
  return (
    <div className="scope-unavailable" data-testid="scope-unavailable">
      <p>
        <span aria-hidden="true">⊘</span> {what} is unavailable:{' '}
        {previewed ? 'this security context lacks' : 'wechart’s security context lacks'}{' '}
        Cube&rsquo;s <code>{scope}</code> API scope.
      </p>
      <p>
        Cube grants scopes by <code>contextToApiScopes</code>, or without one by{' '}
        <code>CUBEJS_DEFAULT_API_SCOPES</code>, which leaves out <code>jobs</code> unless it is
        named.
        {previewed ? null : ' The Security workspace lists the ones wechart has.'}
      </p>
    </div>
  );
}
