import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { TableScroll } from '../../shell/TableScroll';
import { ActionIcon } from './ActionIcon';
import { BuildLog } from './BuildLog';
import { FolderFilter, ScopeNote, useJobsFolders } from './FolderFilter';
import { ListError, ListLoading, NoFolderLeft, noFolderLeft, ReadError } from './ListStates';
import { Pill } from './Pill';
import { focusAfterClose } from './Sheet';
import {
  announced,
  BuildOutcomeStatus,
  durationOf,
  folderShownOf,
  folderTextOf,
  outcomeOf,
  partitionsOf,
  personName,
  StarterLabel,
  stepRows,
  useSingleUser,
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
  /** With the folder's, those of the folders below it (T559). */
  readonly subfolders: boolean;
  readonly within: Within;
  /** One pre-aggregation's builds, by its published name; '' for every one's (T375). */
  readonly preAggregation: string;
}
/** As design 16 opens it: everything of the last 7 days. */
const FIRST: Filters = {
  outcome: '',
  starter: '',
  folder: '',
  subfolders: false,
  within: 'week',
  preAggregation: '',
};

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

/** The columns the list drops below 1,024 px, its log's sheet giving them (design 16, G8). */
const NARROW_HIDES = new Set(['Partitions', 'Duration', 'Started by']);
/** The list's columns, as state B heads them. */
const HISTORY_COLUMNS = [
  'Started',
  'Pre-aggregation',
  'Folder',
  'Partitions',
  'Outcome',
  'Duration',
  'Started by',
];

const starterValue = (starter: Starter) =>
  starter.kind === 'person' ? `person:${starter.key}` : `schedule:${starter.id}`;

function queryOf(filters: Filters, before: string | undefined): string {
  const query = new URLSearchParams();
  if (filters.outcome !== '') query.set('outcome', filters.outcome);
  if (filters.starter !== '') query.set('starter', filters.starter);
  if (filters.folder !== '') query.set('folder', filters.folder);
  if (filters.folder !== '' && filters.subfolders) query.set('subfolders', 'true');
  if (filters.preAggregation !== '') query.set('preagg', filters.preAggregation);
  query.set('within', filters.within);
  if (before !== undefined) query.set('before', before);
  return query.toString();
}

export function RunHistory({
  enabled = true,
  active = true,
  preAggregation,
  openFirst = null,
}: {
  enabled?: boolean;
  /** Whether its tab is the one shown: a log's sheet is one only then (T640). */
  active?: boolean;
  /**
   * Opened on one pre-aggregation's builds, of all time: its pane's "All its
   * builds in Run history" (T375; design 16, pin 14).
   */
  preAggregation?: { readonly id: string; readonly name: string } | undefined;
  /** A build's log opened at its address, `/jobs/builds/…` (T610; design 16, G6). */
  openFirst?: string | null;
}) {
  // With sign-in off, the one user is "You" (G7; T610).
  const single = useSingleUser();
  const [filters, setFilters] = useState<Filters>(() =>
    preAggregation === undefined
      ? FIRST
      : { ...FIRST, preAggregation: preAggregation.id, within: 'all' },
  );
  /** The folders the user builds in, for the Folder filter and the note (T559). */
  const folders = useJobsFolders();
  /** Where each page seen began, the first's none: Newer is one step back. */
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [openId, setOpenId] = useState<string | null>(openFirst);
  const before = cursors.at(-1);
  const page = useQuery({
    queryKey: ['jobs', 'builds', filters, before],
    queryFn: async ({ signal }): Promise<Page> => {
      const response = await fetch(`/api/jobs/builds?${queryOf(filters, before)}`, { signal });
      const body = (await response.json().catch(() => null)) as (Page & { error?: unknown }) | null;
      if (!response.ok || body === null)
        // The API's own words where it gives them (T371's review), with its status (T560).
        throw new ReadError(
          typeof body?.error === 'string'
            ? body.error
            : `Run history could not be read (${String(response.status)}).`,
          response.status,
          response.statusText,
          'GET /api/jobs/builds',
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
  const time = TIMES.find(([value]) => value === filters.within) ?? TIMES[1];
  const narrowed =
    filters.outcome !== '' ||
    filters.starter !== '' ||
    filters.folder !== '' ||
    filters.preAggregation !== '';

  // The last read-write folder gone while open (G5b; T610).
  if (noFolderLeft(page))
    return (
      <div className="build-panel run-history">
        <div className="build-panel__list">
          <NoFolderLeft page="Jobs" />
        </div>
      </div>
    );

  return (
    <div className="build-panel run-history">
      <div className="build-panel__list">
        {/* For a read-write member: their folders only (design 16, pin 3). */}
        <ScopeNote folders={folders.data}>
          Showing builds of pre-aggregations in the folders where you have read-write access.
        </ScopeNote>
        <div className="sources-filters run-history__filters">
          {filters.preAggregation === '' || preAggregation === undefined ? null : (
            <span className="select-pill run-history__only">
              Only {preAggregation.name}
              <button
                type="button"
                className="link-button"
                aria-label="Show every pre-aggregation’s builds"
                onClick={() => narrow({ preAggregation: '' })}
              >
                ×
              </button>
            </span>
          )}
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
                    {/* With sign-in off, the one user is "You" (G7; T610). */}
                    {starter.kind === 'person' ? personName(starter, single) : starter.name}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          {/* Every tab's Folder filter, with Include subfolders (T559). */}
          <FolderFilter
            folders={folders.data}
            choice={{ folder: filters.folder, subfolders: filters.subfolders }}
            onChange={(choice) => {
              narrow(choice);
            }}
          />
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
          {/* A count, read as it changes, not a state (T611: status-labels' sweep). */}
          <span className="run-history__count" aria-live="polite">
            {page.data === undefined
              ? ''
              : `${String(records.length)} ${records.length === 1 ? 'build' : 'builds'} · newest first`}
          </span>
        </div>

        {/* Skeleton rows while it's read (design 16, G1); couldn't read it, with
            Retry and Details (G2), or a refusal in the API's words (G4; T560). */}
        {page.isPending ? (
          <ListLoading
            said="Reading Run history…"
            label="Run history"
            columns={HISTORY_COLUMNS}
            narrow={[...NARROW_HIDES]}
          />
        ) : null}
        {page.isError ? (
          <ListError
            what="Run history"
            error={page.error}
            carryOn="Your builds carry on; this list will show them once it’s read."
            onRetry={() => void page.refetch()}
          />
        ) : null}

        {page.data !== undefined && records.length === 0 ? (
          // Nothing to list (state B4): naming no folder.
          <div className="empty-state run-history__empty">
            {/* With history's clock, as B4 draws it (T613). */}
            <ActionIcon name="hist" size={16} />
            <b>{narrowed ? 'No builds match these filters' : `No builds ${time[2]}`}</b>
            <span>
              Builds you or others start from Jobs, and builds wechart’s schedules start, in your
              folders, are listed here. Cube’s refresh worker’s own builds aren’t listed yet: their
              history isn’t recorded.
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
                    // Below 1,024 px, the log's sheet has these (design 16, G8).
                    <th
                      key={column}
                      scope="col"
                      className={NARROW_HIDES.has(column) ? 'jobs-wide' : undefined}
                    >
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
                          className="link-button run-history__name list-name"
                          // Read as the row is, and ↑ ↓ go row to row (design 16's keyboard table; T611).
                          aria-label={announced(
                            record.name,
                            folderTextOf(record.folderPath),
                            outcomeOf(record, single).label,
                            partitionsOf(record),
                          )}
                          onKeyDown={stepRows}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenId(record.id);
                          }}
                        >
                          {record.name}
                        </button>
                      </td>
                      {/* Three deep or more by its last two, whole on hover (state B; T612). */}
                      <td title={folderTextOf(record.folderPath)}>
                        {folderShownOf(record.folderPath)}
                      </td>
                      <td className="jobs-wide">{partitionsOf(record)}</td>
                      <td>
                        <BuildOutcomeStatus build={record} />
                      </td>
                      <td className="num jobs-wide">
                        {record.durationMs === null ? '—' : durationOf(record.durationMs)}
                      </td>
                      <td className="jobs-wide">
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
            worker starts on its own aren’t listed until their history is recorded.
          </span>
        </div>
      </div>
      {openId === null ? (
        // The docked pane, as Pre-aggregations has it (T469): empty until a build is chosen.
        <aside className="admin-pane" aria-label="Build log">
          <p className="admin-pane__empty">Select a build to see its log.</p>
        </aside>
      ) : (
        // Read by its id: one opened at its address need not be on this page (T610).
        // Closed, focus goes back to its row's name, which opened it (T640; rule 85).
        <BuildLog
          // Each build's log its own: one's "…N more" opened isn't another's (T611).
          key={openId}
          id={openId}
          active={active}
          onClose={() => {
            setOpenId(null);
            focusAfterClose(
              `[data-testid=${JSON.stringify(`build-row-${openId}`)}] .run-history__name`,
              '.build-panel [role="region"][aria-label="Run history"]',
            );
          }}
        />
      )}
    </div>
  );
}
