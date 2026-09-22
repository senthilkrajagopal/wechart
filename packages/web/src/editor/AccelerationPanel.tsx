import { useQuery } from '@tanstack/react-query';

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
  readonly miss?: { rollup: string | null; member: string; reason: string };
}

async function askAcceleration(query: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('/api/acceleration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  const body = (await response.json().catch(() => null)) as (Answer & { error?: string }) | null;
  if (!response.ok || body === null)
    throw new Error(body?.error ?? `Cube could not say (status ${String(response.status)}).`);
  return body;
}

export function AccelerationPanel({ query }: { query: Record<string, unknown> }) {
  const answer = useQuery({
    queryKey: ['acceleration', query],
    queryFn: ({ signal }) => askAcceleration(query, signal),
  });

  if (answer.isPending) return <p className="acceleration-panel">Asking Cube…</p>;
  if (answer.isError)
    return (
      <p className="acceleration-panel" role="alert">
        {answer.error.message}
      </p>
    );

  const { matched, miss } = answer.data;
  if (matched !== null)
    return (
      <p className="acceleration-panel" data-testid="acceleration-matched">
        Served from the pre-aggregation <code>{matched}</code>.
      </p>
    );
  return (
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
          Stopped by <code data-testid="acceleration-member">{miss.member}</code>: {miss.reason}
        </>
      )}
    </p>
  );
}
