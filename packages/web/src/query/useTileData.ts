import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { loadTile } from './loadTile';

/**
 * A tile's data, with the loading state AC-010 asks for.
 *
 * `loadTile` keeps one request open across Cube's "Continue wait" replies, so
 * the query stays pending for the whole poll and the tile stays in its loading
 * state rather than flickering between loading and empty.
 *
 * The `signal` TanStack Query supplies is passed through, which is what makes
 * a superseded tile actually stop polling (AC-011, wired at T012).
 */
export interface UseTileDataOptions {
  readonly tileId: string;
  readonly query: Record<string, unknown>;
  readonly enabled?: boolean;
}

export function useTileData({
  tileId,
  query,
  enabled = true,
}: UseTileDataOptions): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ['tile', tileId, query],
    queryFn: ({ signal }) => loadTile({ query, signal }),
    enabled,
    // A failed query is a Cube error the tile shows (AC-012); retrying hides it
    // behind seconds of backoff and blows AC-175's budget.
    retry: false,
  });
}
