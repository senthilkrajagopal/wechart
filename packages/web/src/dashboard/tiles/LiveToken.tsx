import { formatValue, type MemberFormats } from '@wechart/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';

import { loadTile } from '../../query/loadTile';

/**
 * A text tile's live values, drawn in place of their tokens (T389, AC-116).
 * Each is a span of its own, so a screen reader reads it inline with the
 * sentence around it.
 *
 * A value is set apart as the prototype's are, in its weight and with
 * tabular figures (T389's review): written here, beside what draws it, so a
 * token looks the same wherever a text tile is.
 */
const VALUE: CSSProperties = { fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
/** What stands where no value can be: in the muted text, never passing for one. */
const NONE: CSSProperties = { color: 'var(--wc-text-muted)' };

/** A marking's count or summary, worked out by the dashboard. */
export function MarkingToken({ text }: { readonly text: string }) {
  return (
    <span className="text-token" data-testid="text-token" style={VALUE}>
      {text}
    </span>
  );
}

/** A token naming a marking the dashboard doesn't have: said, not left as braces. */
export function UnknownMarkingToken({ name }: { readonly name: string }) {
  return (
    <span className="text-token" data-testid="text-token" style={NONE}>
      (no marking “{name}”)
    </span>
  );
}

/**
 * A measure's value, asked of Cube as a tile's query is. Its query is keyed
 * by what it asks, so the same marking marked again, or the same measure in
 * two tokens, is one request (AC-105). The value it had stays while the next
 * is asked, rather than blinking to "…" at every mark (T389's review).
 */
export function MeasureToken({
  query,
  member,
  formats,
  context,
}: {
  readonly query: Readonly<Record<string, unknown>>;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  /** A previewed security context (T172), as the dashboard's tiles take one. */
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useQuery({
    queryKey: ['text-token', query, context ?? null],
    queryFn: ({ signal }) =>
      loadTile({ query: { ...query }, signal, ...(context === undefined ? {} : { context }) }),
    placeholderData: keepPreviousData,
  });
  if (answer.isPending)
    return (
      <span className="text-token" data-testid="text-token" aria-busy="true" style={NONE}>
        …
      </span>
    );
  if (answer.isError)
    return (
      // Why, in words a screen reader reaches: not only in a tooltip.
      <span className="text-token" data-testid="text-token" style={NONE}>
        (no value: {answer.error.message})
      </span>
    );
  const rows = (answer.data as { data?: readonly Record<string, unknown>[] }).data ?? [];
  return (
    <span
      className="text-token"
      data-testid="text-token"
      style={VALUE}
      aria-busy={answer.isPlaceholderData ? true : undefined}
    >
      {formatValue(rows[0]?.[member], member, formats)}
    </span>
  );
}
