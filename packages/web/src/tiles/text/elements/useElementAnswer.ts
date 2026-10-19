import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useQueryItem } from '../../../query/item';
import { loadTile } from '../../../query/loadTile';
import { failureOf, useElementPhase, type ElementPhase } from '../ElementState';

/**
 * What an element tells its tile (AC-525): loading while asked; failed on an
 * error Retry can help with; answered otherwise — a member the viewer may
 * not query (a 403, a hidden member) included, since asking again can't
 * help it, so the tile's ⋯ isn't offered for it (the coordinator,
 * checkpoint 3).
 */
export function phaseOf({
  pending,
  placeholder,
  error,
}: {
  readonly pending: boolean;
  readonly placeholder: boolean;
  readonly error: unknown;
}): ElementPhase {
  if (pending || placeholder) return 'loading';
  if (error === undefined) return 'ready';
  return failureOf(error) === 'forbidden' ? 'ready' : 'error';
}

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
    phaseOf({
      pending,
      placeholder: answer.isPlaceholderData,
      error: answer.isError ? answer.error : undefined,
    }),
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
