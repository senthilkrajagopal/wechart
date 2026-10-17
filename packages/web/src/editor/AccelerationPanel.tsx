import { useQuery } from '@tanstack/react-query';

import { forItem, useQueryItem, type QueryItem } from '../query/item';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine, StatusIcon } from '../shell/StatusIcon';

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
  // Design 02 state D (T690, EDI-22): padded 12, gap 10; a 12/600 status
  // line with its icon, "by" as the badge says it (chart-editor-Q5); why, at 12.
  if (matched !== null)
    return (
      <div className="acceleration-panel">
        <p className="acceleration-panel__status" data-testid="acceleration-matched">
          <StatusIcon kind="ok" />
          <span>
            Served by the pre-aggregation <code>{matched}</code>.
          </span>
        </p>
      </div>
    );
  return (
    <div className="acceleration-panel">
      <p className="acceleration-panel__miss" data-testid="acceleration-miss">
        <span className="acceleration-panel__status">
          <ClockIcon />
          <span>
            Not served by a pre-aggregation
            {miss?.rollup ? (
              <>
                ; the nearest is <code>{miss.rollup}</code>.
              </>
            ) : (
              '.'
            )}
          </span>
        </span>
        {miss === undefined ? null : (
          <>
            {' '}
            <span className="acceleration-panel__why">
              {/* By its title from the model, never its internal name (T403, AC-220). */}
              Stopped by{' '}
              <strong data-testid="acceleration-member">{miss.title ?? miss.member}</strong>:{' '}
              {miss.reason}
            </span>
          </>
        )}
      </p>
      {/* A miss is a chart rollup-only mode would refuse (T153, AC-147): said
          here as information, design 02 state D's `.info`; a warning only
          on the chart, where wechart knows the mode is on (R76, Q4). */}
      <p className="acceleration-panel__info" data-testid="rollup-only-note">
        <svg width="14" height="14" viewBox="0 0 16 16" data-icon="info" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 7v4M8 4.6v.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>
          If Cube runs in rollup-only mode (<code>CUBEJS_ROLLUP_ONLY</code>), it would refuse this
          chart.
        </span>
      </p>
    </div>
  );
}

/** Design 02 state D's clock: a chart the database answered. */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" data-icon="live" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
