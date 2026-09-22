import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import { BuildPanel } from './BuildPanel';
import { Health } from './Health';
import { QueryLog, type QueryRecord } from './QueryLog';

/**
 * The Jobs workspace, in the prototype's tabs: the pre-aggregations, each
 * built on request and followed to its end (T155, AC-149), and the queries
 * wechart has issued, newest first (AC-016).
 */
const TABS = [
  ['preaggs', 'Pre-aggregations'],
  ['queries', 'Queries'],
] as const;
type Tab = (typeof TABS)[number][0];

function Queries() {
  // Refetched when opened again, so the queries a dashboard just issued are there.
  const records = useQuery({
    queryKey: ['jobs', 'queries'],
    queryFn: async ({ signal }): Promise<QueryRecord[]> => {
      const response = await fetch('/api/jobs/queries', { signal });
      if (!response.ok)
        throw new Error(`The query log could not be read (${String(response.status)}).`);
      return (await response.json()) as QueryRecord[];
    },
    refetchOnMount: 'always',
  });
  if (records.isPending) return <p>Reading the query log…</p>;
  if (records.isError) return <p role="alert">{records.error.message}</p>;
  return <QueryLog records={records.data} />;
}

/** `?tab=queries` opens the log: a link to it, and the accessibility sweep's. */
function tabOfUrl(): Tab {
  const asked = new URLSearchParams(window.location.search).get('tab');
  return TABS.some(([key]) => key === asked) ? (asked as Tab) : 'preaggs';
}

export function JobsPage({ pollMs }: { pollMs?: number }) {
  const [open, setOpen] = useState<Tab>(tabOfUrl);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  return (
    <div className="jobs-workspace">
      <div className="jobs-workspace__head">
        <h1>Jobs</h1>
        {/* Cube's health and the refresh worker's state (T162, AC-156). */}
        <Health />
      </div>
      <div role="tablist" aria-label="Jobs" className="edit-sidebar__tabs jobs-workspace__tabs">
        {TABS.map(([key, label], index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${base}-${key}`}
            ref={(node) => {
              refs.current[index] = node;
            }}
            aria-selected={open === key}
            aria-controls={`${base}-${key}-panel`}
            tabIndex={open === key ? 0 : -1}
            onClick={() => {
              setOpen(key);
            }}
            onKeyDown={(event) => {
              // The APG tabs pattern, as the model form's.
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = (index + step + TABS.length) % TABS.length;
              setOpen(TABS[next]?.[0] ?? 'preaggs');
              refs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/*
        Both kept mounted, the one not shown hidden: a build being followed
        is not dropped by a look at the queries (T155's review), and each
        tab's `aria-controls` names a panel that is there.
      */}
      <div
        role="tabpanel"
        id={`${base}-preaggs-panel`}
        aria-labelledby={`${base}-preaggs`}
        hidden={open !== 'preaggs'}
      >
        <BuildPanel {...(pollMs === undefined ? {} : { pollMs })} />
      </div>
      <div
        role="tabpanel"
        id={`${base}-queries-panel`}
        aria-labelledby={`${base}-queries`}
        hidden={open !== 'queries'}
      >
        <Queries />
      </div>
    </div>
  );
}
