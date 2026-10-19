import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useQueryItem } from '../../../query/item';
import { loadTile } from '../../../query/loadTile';
import { useElementPhase } from '../ElementState';

/**
 * An element's answer from Cube, asked as a tile's query is (AC-116): keyed
 * by what it asks, so two elements asking the same are one request, and the
 * last answer stays while the next is asked, rather than blinking.
 */
export function useElementAnswer(
  query: Readonly<Record<string, unknown>> | undefined,
  context: Readonly<Record<string, unknown>> | undefined,
) {
  // The dashboard it is on (T340, AC-268).
  const item = useQueryItem();
  const answer = useQuery({
    queryKey: ['text-element', query ?? null, context ?? null, item ?? null],
    enabled: query !== undefined,
    queryFn: ({ signal }) =>
      loadTile({
        query: { ...query },
        signal,
        ...(context === undefined ? {} : { context }),
        item,
      }),
    placeholderData: keepPreviousData,
  });
  const rows = (answer.data as { data?: readonly Record<string, unknown>[] } | undefined)?.data;
  const pending = query !== undefined && answer.isPending;
  // Told to its tile: aria-busy while any loads, Retry while any failed (AC-525).
  useElementPhase(
    pending || answer.isPlaceholderData ? 'loading' : answer.isError ? 'error' : 'ready',
  );
  return {
    /** Cube's whole answer: its refresh time and what answered it, beside the rows. */
    result: answer.data,
    rows: rows ?? [],
    pending,
    error: answer.isError ? answer.error : undefined,
    busy: answer.isPlaceholderData,
  };
}
