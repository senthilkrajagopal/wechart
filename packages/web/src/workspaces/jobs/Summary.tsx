import { useQuery } from '@tanstack/react-query';
import type { MouseEvent, ReactNode } from 'react';

/**
 * How often it is read again: as Pre-aggregations' rows are, now and then,
 * since its failed count reads every rollup's partitions (T558's review).
 * A count's link reads its list and the summary again at once.
 */
const SUMMARY_EVERY_MS = 30_000;

/**
 * Jobs' header summary (T558, AC-398; design 16, P5): over the user's
 * folders, "1 building · 3 queued · 1 failed · 1 suspended schedule", from
 * the API's count of the very lists each links to. Each count is a link to
 * its tab, or to Schedules, filtered to those (the user's answer, R66). A
 * count the API couldn't read is left out; none at all, and nothing is said.
 */
export interface JobsSummary {
  readonly building: number | null;
  readonly queued: number | null;
  readonly failed: number | null;
  readonly suspended: number | null;
}

/** Where a count on Jobs itself opens: a tab, filtered. */
export type SummaryOpens =
  | { readonly tab: 'queue'; readonly state: 'building' | 'queued' }
  | { readonly tab: 'preaggs'; readonly status: 'failed' };

export const SUMMARY_QUERY_KEY = ['jobs', 'summary'] as const;

async function readSummary(signal: AbortSignal): Promise<JobsSummary> {
  const response = await fetch('/api/jobs/summary', { signal });
  if (!response.ok)
    throw new Error(`Jobs’ summary could not be read (${String(response.status)}).`);
  return (await response.json()) as JobsSummary;
}

export function Summary({ onOpen }: { onOpen: (opens: SummaryOpens) => void }) {
  const summary = useQuery({
    queryKey: SUMMARY_QUERY_KEY,
    queryFn: ({ signal }) => readSummary(signal),
    refetchInterval: SUMMARY_EVERY_MS,
  });
  if (summary.data === undefined) return null;
  const { building, queued, failed, suspended } = summary.data;
  /** On Jobs itself, its tab opened in place; its address kept for a new tab. */
  const inPlace = (opens: SummaryOpens) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(opens);
  };
  const counts: { readonly key: string; readonly link: ReactNode }[] = [
    ...(building === null
      ? []
      : [
          {
            key: 'building',
            link: (
              <a
                href="/jobs?tab=queue&state=building"
                onClick={inPlace({ tab: 'queue', state: 'building' })}
              >{`${String(building)} building`}</a>
            ),
          },
        ]),
    ...(queued === null
      ? []
      : [
          {
            key: 'queued',
            link: (
              <a
                href="/jobs?tab=queue&state=queued"
                onClick={inPlace({ tab: 'queue', state: 'queued' })}
              >{`${String(queued)} queued`}</a>
            ),
          },
        ]),
    ...(failed === null
      ? []
      : [
          {
            key: 'failed',
            link: (
              <a
                href="/jobs?status=failed"
                onClick={inPlace({ tab: 'preaggs', status: 'failed' })}
              >{`${String(failed)} failed`}</a>
            ),
          },
        ]),
    ...(suspended === null
      ? []
      : [
          {
            key: 'suspended',
            link: (
              <a href="/schedules?state=suspended">
                {`${String(suspended)} suspended ${suspended === 1 ? 'schedule' : 'schedules'}`}
              </a>
            ),
          },
        ]),
  ];
  if (counts.length === 0) return null;
  return (
    <div className="jobs-summary" role="group" aria-label="In your folders">
      {counts.map(({ key, link }, at) => (
        <span key={key}>
          {at === 0 ? null : ' · '}
          {link}
        </span>
      ))}
    </div>
  );
}
