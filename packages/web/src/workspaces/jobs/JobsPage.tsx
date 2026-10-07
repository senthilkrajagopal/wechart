import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState } from 'react';

import { titlesOf } from '../../editor/fields';
import { META_QUERY } from '../../query/meta';
import { StateLine } from '../../shell/StatusIcon';
import { BuildPanel, ROW_STATUSES, type StatusChoice } from './BuildPanel';
import {
  BuildQueue,
  QUEUE_EVERY_MS,
  QUEUE_QUERY_KEY,
  QUEUE_STATES,
  readQueue,
  type QueueState,
} from './BuildQueue';
import { EVERY_FOLDER, type FolderChoice } from './FolderFilter';
import { Health } from './Health';
import { FIRST_ASK, QueryLog, queryStringOf, type QueryLogAsk, type QueryRecord } from './QueryLog';
import { RunHistory } from './RunHistory';
import { Summary, SUMMARY_QUERY_KEY } from './Summary';

/**
 * The Jobs workspace, in the prototype's tabs: the pre-aggregations, each
 * built on request and followed to its end (T155, AC-149); Run history, the
 * builds wechart started (T374, AC-150; design 16, pin 1); the queue, its
 * count on its tab (T376, AC-151); and the queries wechart has issued,
 * newest first (AC-016).
 */
const TABS = [
  ['preaggs', 'Pre-aggregations'],
  ['history', 'Run history'],
  ['queue', 'Queue'],
  ['queries', 'Queries'],
] as const;
type Tab = (typeof TABS)[number][0];

function Queries() {
  const [ask, setAsk] = useState<QueryLogAsk>(FIRST_ASK);
  // Members by their titles (T469, UX-082; AC-220).
  const meta = useQuery(META_QUERY);
  const titles = useMemo(() => titlesOf(meta.data), [meta.data]);
  // Refetched when opened again, so the queries a dashboard just issued are
  // there. A page, narrowed and sorted by the API over the whole log (AC-230);
  // the one before stays in view while the next is read.
  const found = useQuery({
    queryKey: ['jobs', 'queries', ask],
    queryFn: async ({ signal }): Promise<{ records: QueryRecord[]; total: number }> => {
      const response = await fetch(`/api/jobs/queries/page?${queryStringOf(ask)}`, { signal });
      if (!response.ok) {
        // The API's own words where it gives them (T371's review).
        const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)
          ?.error;
        throw new Error(
          typeof said === 'string'
            ? said
            : `The query log could not be read (${String(response.status)}).`,
        );
      }
      return (await response.json()) as { records: QueryRecord[]; total: number };
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
  if (found.isPending) return <StateLine kind="run">Reading the query log…</StateLine>;
  if (found.isError) return <StateLine kind="err">{found.error.message}</StateLine>;
  return (
    <QueryLog
      records={found.data.records}
      total={found.data.total}
      ask={ask}
      onAsk={setAsk}
      titleOf={(member) => (Object.hasOwn(titles, member) ? titles[member] : undefined)}
    />
  );
}

/** `?tab=queries` opens the log, and `?tab=history` Run history: a link to either, and the accessibility sweep's. */
function tabOfUrl(): Tab {
  const asked = new URLSearchParams(window.location.search).get('tab');
  return TABS.some(([key]) => key === asked) ? (asked as Tab) : 'preaggs';
}

/**
 * `?status=` opens Pre-aggregations on its rows in that state, and `?state=`
 * the queue on its entries in that state: the links of Jobs' summary (T558;
 * the user's answer, R66). Any for one it doesn't know.
 */
function statusOfUrl(): StatusChoice | '' {
  const asked = new URLSearchParams(window.location.search).get('status');
  return ROW_STATUSES.some(([status]) => status === asked) ? (asked as StatusChoice) : '';
}
function queueStateOfUrl(): QueueState | '' {
  const asked = new URLSearchParams(window.location.search).get('state');
  return QUEUE_STATES.some(([state]) => state === asked) ? (asked as QueueState) : '';
}

/**
 * `?tab=history&preagg=` opens Run history on one pre-aggregation's builds
 * (T375): its name as people see it, without a folder's prefix (T371).
 */
function historyForUrl(): { id: string; name: string; opened: number } | undefined {
  const asked = new URLSearchParams(window.location.search);
  const id = asked.get('preagg');
  if (asked.get('tab') !== 'history' || id === null || id === '') return undefined;
  return { id, name: id.replace(/^f[0-9a-z]+__/, ''), opened: 0 };
}

export function JobsPage({ pollMs }: { pollMs?: number }) {
  const [open, setOpen] = useState<Tab>(tabOfUrl);
  /** The pre-aggregation Run history was opened on, from its pane (T375; design 16, pin 14). */
  const [historyFor, setHistoryFor] = useState(historyForUrl);
  /** The tabs opened so far: Run history is read once its tab first opens, then kept. */
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(() => new Set([tabOfUrl()]));
  if (!opened.has(open)) setOpened(new Set([...opened, open]));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const client = useQueryClient();
  /** Pre-aggregations' Status and the queue's State, which the summary's links set (T558). */
  const [status, setStatus] = useState(statusOfUrl);
  const [queueState, setQueueState] = useState(queueStateOfUrl);
  /** Their Folder filters (T559), which a summary's link sets back to every folder. */
  const [preaggsFolder, setPreaggsFolder] = useState<FolderChoice>(EVERY_FOLDER);
  const [queueFolder, setQueueFolder] = useState<FolderChoice>(EVERY_FOLDER);
  // How many entries the queue holds in the user's folders, on its tab (design
  // 16, pin 1): the queue's own read, shared with its panel.
  const queue = useQuery({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: ({ signal }) => readQueue(signal),
    refetchInterval: QUEUE_EVERY_MS,
  });
  const queued = queue.data?.entries.length ?? 0;
  return (
    <div className="jobs-workspace">
      <div className="jobs-workspace__head">
        <h1 className="workspace-title">Jobs</h1>
        {/* What needs attention in the user's folders, each a link to it (T558; P5). */}
        <Summary
          onOpen={(opens) => {
            // Over every folder of theirs, as the count is (T559's review).
            if (opens.tab === 'queue') {
              setQueueState(opens.state);
              setQueueFolder(EVERY_FOLDER);
            } else {
              setStatus(opens.status);
              setPreaggsFolder(EVERY_FOLDER);
            }
            setOpen(opens.tab);
            // The list read again, and the summary with it, so the two say the
            // same of about the same moment (T558's review).
            void client.invalidateQueries({
              queryKey: opens.tab === 'queue' ? QUEUE_QUERY_KEY : ['preaggregations'],
            });
            void client.invalidateQueries({ queryKey: SUMMARY_QUERY_KEY });
          }}
        />
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
            {key === 'queue' && queued > 0 ? (
              <>
                {' '}
                <span className="jobs-workspace__count">{queued}</span>
              </>
            ) : null}
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
        <BuildPanel
          {...(pollMs === undefined ? {} : { pollMs })}
          status={status}
          onStatus={setStatus}
          folderChoice={preaggsFolder}
          onFolderChoice={setPreaggsFolder}
          // `?preagg=`, from a tile's Data as of › Open in Jobs (T273, AC-245).
          selectedFirst={new URLSearchParams(window.location.search).get('preagg')}
          // Its pane's ways on: to its builds in Run history, and to the queue (T375).
          onOpenHistory={(preAggregation) => {
            // Opened anew each time, so a cleared narrowing comes back (T375's review).
            setHistoryFor((was) => ({ ...preAggregation, opened: (was?.opened ?? 0) + 1 }));
            setOpen('history');
          }}
          onOpenQueue={() => {
            setOpen('queue');
          }}
        />
      </div>
      <div
        role="tabpanel"
        id={`${base}-history-panel`}
        aria-labelledby={`${base}-history`}
        hidden={open !== 'history'}
      >
        {/* Opened anew on each pre-aggregation it's asked for, its filters with it. */}
        <RunHistory
          key={historyFor === undefined ? '' : `${historyFor.id}-${String(historyFor.opened)}`}
          enabled={opened.has('history')}
          preAggregation={historyFor}
        />
      </div>
      <div
        role="tabpanel"
        id={`${base}-queue-panel`}
        aria-labelledby={`${base}-queue`}
        hidden={open !== 'queue'}
      >
        <BuildQueue
          state={queueState}
          onState={setQueueState}
          folderChoice={queueFolder}
          onFolderChoice={setQueueFolder}
        />
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
