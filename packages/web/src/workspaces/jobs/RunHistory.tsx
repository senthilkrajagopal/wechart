import { useQuery } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { BuildLog } from './BuildLog';
import {
  BuildOutcomeStatus,
  durationOf,
  folderTextOf,
  partitionsOf,
  StarterLabel,
  whenOf,
  type BuildSummary,
  type Starter,
} from './builds';

export type { BuildSummary };

/**
 * Run history (T374, AC-150; design 16, state B): every build wechart started
 * — from Jobs, or by a wechart schedule — in the user's folders, newest first,
 * 50 at a time with Newer and Older, narrowed by outcome, starter, folder and
 * time; one row per start (Q6). Selecting one opens its log in the pane.
 * Cube's refresh worker's own builds aren't listed: their history comes in
 * the next phase (R41).
 */
const OUTCOMES = [
  ['', 'Any'],
  ['done', 'Done'],
  ['failed', 'Failed'],
  ['cancelled', 'Cancelled'],
  ['expired', 'Cube’s record expired'],
  ['open', 'Queued or building'],
] as const;
const TIMES = [
  ['day', 'Last 24 hours', 'in the last 24 hours'],
  ['week', 'Last 7 days', 'in the last 7 days'],
  ['month', 'Last 30 days', 'in the last 30 days'],
  ['all', 'All time', 'yet'],
] as const;
type Within = (typeof TIMES)[number][0];

interface Filters {
  readonly outcome: string;
  readonly starter: string;
  readonly folder: string;
  readonly within: Within;
}
/** As design 16 opens it: everything of the last 7 days. */
const FIRST: Filters = { outcome: '', starter: '', folder: '', within: 'week' };

interface Page {
  readonly records: readonly BuildSummary[];
  /** Where the next, older page begins; none at the end. */
  readonly older?: string;
  /** Who started builds in the user's folders, for Started by. */
  readonly starters?: readonly Starter[];
  /** The user's folders, for Folder. */
  readonly folders?: readonly { readonly id: string; readonly path: readonly string[] }[];
  /** Whether they see every folder (a Super-Admin) or theirs. */
  readonly everyFolder?: boolean;
}

const starterValue = (starter: Starter) =>
  starter.kind === 'person' ? `person:${starter.key}` : `schedule:${starter.id}`;

function queryOf(filters: Filters, before: string | undefined): string {
  const query = new URLSearchParams();
  if (filters.outcome !== '') query.set('outcome', filters.outcome);
  if (filters.starter !== '') query.set('starter', filters.starter);
  if (filters.folder !== '') query.set('folder', filters.folder);
  query.set('within', filters.within);
  if (before !== undefined) query.set('before', before);
  return query.toString();
}

/** A filter pill: its name and a native select, as the audit trail's (design 08). */
function Pill({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <span className="select-pill">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </span>
  );
}

export function RunHistory({ enabled = true }: { enabled?: boolean }) {
  const [filters, setFilters] = useState<Filters>(FIRST);
  /** Where each page seen began, the first's none: Newer is one step back. */
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [openId, setOpenId] = useState<string | null>(null);
  const before = cursors.at(-1);
  const page = useQuery({
    queryKey: ['jobs', 'builds', filters, before],
    queryFn: async ({ signal }): Promise<Page> => {
      const response = await fetch(`/api/jobs/builds?${queryOf(filters, before)}`, { signal });
      const body = (await response.json().catch(() => null)) as (Page & { error?: unknown }) | null;
      if (!response.ok || body === null)
        // The API's own words where it gives them (T371's review).
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `Run history could not be read (${String(response.status)}).`,
        );
      return body;
    },
    // Builds go on while it is open: read again now and then.
    refetchInterval: 5_000,
    // The page before stays in view while the next is read, but never another
    // filter's rows (as the audit trail's).
    placeholderData: (previous, previousQuery) =>
      JSON.stringify(previousQuery?.queryKey[2]) === JSON.stringify(filters) ? previous : undefined,
    enabled,
  });

  const narrow = (change: Partial<Filters>) => {
    setFilters((was) => ({ ...was, ...change }));
    setCursors([undefined]);
    setOpenId(null);
  };
  const records = page.data?.records ?? [];
  const opened = records.find((record) => record.id === openId);
  const time = TIMES.find(([value]) => value === filters.within) ?? TIMES[1];
  const narrowed = filters.outcome !== '' || filters.starter !== '' || filters.folder !== '';

  return (
    <div className="build-panel run-history">
      <div className="build-panel__list">
        <div className="sources-filters run-history__filters">
          <Pill label="Outcome">
            {(id) => (
              <select
                id={id}
                value={filters.outcome}
                onChange={(event) => narrow({ outcome: event.target.value })}
              >
                {OUTCOMES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          <Pill label="Started by">
            {(id) => (
              <select
                id={id}
                value={filters.starter}
                onChange={(event) => narrow({ starter: event.target.value })}
              >
                <option value="">Anyone</option>
                {(page.data?.starters ?? []).map((starter) => (
                  <option key={starterValue(starter)} value={starterValue(starter)}>
                    {starter.name}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          <Pill label="Folder">
            {(id) => (
              <select
                id={id}
                value={filters.folder}
                onChange={(event) => narrow({ folder: event.target.value })}
              >
                <option value="">
                  {page.data?.everyFolder === true ? 'All folders' : 'All of mine'}
                </option>
                {(page.data?.folders ?? []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folderTextOf(folder.path)}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          <Pill label="Time">
            {(id) => (
              <select
                id={id}
                value={filters.within}
                onChange={(event) => narrow({ within: event.target.value as Within })}
              >
                {TIMES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          <span className="run-history__count" role="status">
            {page.data === undefined
              ? ''
              : `${String(records.length)} ${records.length === 1 ? 'build' : 'builds'} · newest first`}
          </span>
        </div>

        {page.isPending ? <StateLine kind="run">Reading Run history…</StateLine> : null}
        {page.isError ? <StateLine kind="err">{page.error.message}</StateLine> : null}

        {page.data !== undefined && records.length === 0 ? (
          // Nothing to list (state B4): naming no folder.
          <div className="empty-state run-history__empty">
            <b>{narrowed ? 'No builds match these filters' : `No builds ${time[2]}`}</b>
            <span>
              Builds you or others start from Jobs, and builds wechart’s schedules start, in your
              folders, are listed here. Cube’s refresh worker’s own builds aren’t listed yet: their
              history comes in the next phase.
            </span>
            {filters.within === 'all' ? null : (
              <button
                type="button"
                className="link-button"
                onClick={() => narrow({ within: 'all' })}
              >
                Show all time
              </button>
            )}
          </div>
        ) : null}

        {records.length === 0 ? null : (
          <TableScroll label="Run history">
            <table className="query-log run-history__table" aria-label="Run history">
              <thead>
                <tr>
                  {[
                    'Started',
                    'Pre-aggregation',
                    'Folder',
                    'Partitions',
                    'Outcome',
                    'Duration',
                    'Started by',
                  ].map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const when = whenOf(record.startedAt);
                  return (
                    <tr
                      key={record.id}
                      data-testid={`build-row-${record.id}`}
                      aria-selected={record.id === openId}
                      className="build-panel__row"
                      onClick={() => setOpenId(record.id)}
                    >
                      <td>
                        <time dateTime={record.startedAt} title={when.utc}>
                          {when.shown}
                        </time>
                      </td>
                      <td>
                        {/* The row's name, a button, so it is reached and read as one (design 16, keyboard). */}
                        <button
                          type="button"
                          className="link-button run-history__name"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenId(record.id);
                          }}
                        >
                          {record.name}
                        </button>
                      </td>
                      <td>{folderTextOf(record.folderPath)}</td>
                      <td>{partitionsOf(record)}</td>
                      <td>
                        <BuildOutcomeStatus build={record} />
                      </td>
                      <td className="num">
                        {record.durationMs === null ? '—' : durationOf(record.durationMs)}
                      </td>
                      <td>
                        <StarterLabel starter={record.starter} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}

        <div className="audit-trail__pager">
          <button
            type="button"
            className="btn btn-sm"
            disabled={cursors.length <= 1 || page.isFetching}
            onClick={() => {
              setCursors((was) => was.slice(0, -1));
              setOpenId(null);
            }}
          >
            Newer
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page.data?.older === undefined || page.isFetching}
            onClick={() => {
              const older = page.data?.older;
              if (older === undefined) return;
              setCursors((was) => [...was, older]);
              setOpenId(null);
            }}
          >
            Older
          </button>
          <span className="run-history__note">
            50 at a time. Each pre-aggregation keeps its latest 100 builds. Builds Cube’s refresh
            worker starts on its own aren’t listed until their history comes, in the next phase.
          </span>
        </div>
      </div>
      {opened === undefined ? (
        // The docked pane, as Pre-aggregations has it (T469): empty until a build is chosen.
        <aside className="admin-pane" aria-label="Build log">
          <p className="admin-pane__empty">Select a build to see its log.</p>
        </aside>
      ) : (
        <BuildLog id={opened.id} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
