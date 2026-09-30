import { useQuery } from '@tanstack/react-query';

import { forItem, useQueryItem, type QueryItem } from '../query/item';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine } from '../shell/StatusIcon';
import { RollupOnlyWarning } from './RollupOnlyWarning';

/**
 * A chart's acceleration panel (T150, AC-144): whether Cube serves the chart's
 * query from a pre-aggregation, and when it does not, the member that stops
 * the nearest one.
 *
 * What it says is the API's answer (`/api/acceleration`): the match is Cube's
 * own word, from the plan it would run, so the panel never reports a rollup
 * Cube does not use; a miss names its rollup and member, worked out from
 * what Cube matches on.
 */
interface Answer {
  readonly matched: string | null;
  /** The member by its name, and by its title, which is what a person reads (T403, AC-220). */
  readonly miss?: { rollup: string | null; member: string; title?: string; reason: string };
}

async function askAcceleration(
  query: Record<string, unknown>,
  signal: AbortSignal,
  item: QueryItem | undefined,
) {
  const response = await fetch('/api/acceleration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, ...forItem(item) }),
    signal,
  });
  const body = (await response.json().catch(() => null)) as (Answer & { error?: string }) | null;
  if (!response.ok || body === null)
    throw new Error(body?.error ?? `Cube could not say (status ${String(response.status)}).`);
  return body;
}

export function AccelerationPanel({ query }: { query: Record<string, unknown> }) {
  // For the chart edited, or the dashboard it is edited on (T340, AC-268).
  const item = useQueryItem();
  const answer = useQuery({
    queryKey: ['acceleration', query, item ?? null],
    queryFn: ({ signal }) => askAcceleration(query, signal, item),
  });

  if (answer.isPending)
    return (
      <StateLine kind="run" className="acceleration-panel">
        Asking Cube…
      </StateLine>
    );
  // A scope wechart's context lacks, said as that (T176, AC-170).
  const lacking = answer.isError ? missingScopeOf(answer.error) : undefined;
  if (lacking !== undefined)
    return <ScopeUnavailable scope={lacking} what="Whether a rollup serves this chart" />;
  if (answer.isError)
    return (
      <StateLine kind="err" className="acceleration-panel">
        {answer.error.message}
      </StateLine>
    );

  const { matched, miss } = answer.data;
  if (matched !== null)
    return (
      <p className="acceleration-panel" data-testid="acceleration-matched">
        Served from the pre-aggregation <code>{matched}</code>.
      </p>
    );
  return (
    <>
      <p className="acceleration-panel" data-testid="acceleration-miss">
        Not served from a pre-aggregation
        {miss?.rollup ? (
          <>
            ; the nearest is <code>{miss.rollup}</code>.
          </>
        ) : (
          '.'
        )}
        {miss === undefined ? null : (
          <>
            {' '}
            {/* By its title from the model, never its internal name (T403, AC-220). */}
            Stopped by{' '}
            <strong data-testid="acceleration-member">{miss.title ?? miss.member}</strong>:{' '}
            {miss.reason}
          </>
        )}
      </p>
      {/* A miss is a chart rollup-only mode would refuse (T153, AC-147). */}
      <RollupOnlyWarning />
    </>
  );
}
