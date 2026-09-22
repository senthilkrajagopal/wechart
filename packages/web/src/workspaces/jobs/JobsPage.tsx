import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import { BuildPanel } from './BuildPanel';
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

export function JobsPage() {
  const [open, setOpen] = useState<Tab>('preaggs');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  return (
    <div className="jobs-workspace">
      <h1>Jobs</h1>
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
      <div role="tabpanel" id={`${base}-${open}-panel`} aria-labelledby={`${base}-${open}`}>
        {open === 'preaggs' ? <BuildPanel /> : <Queries />}
      </div>
    </div>
  );
}
