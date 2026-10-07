import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { clockOf, folderTextOf, periodOf, shortToken, StarterLabel, type Starter } from './builds';
import {
  EVERY_FOLDER,
  FolderFilter,
  inFolder,
  ScopeNote,
  useJobsFolders,
  type FolderChoice,
} from './FolderFilter';
import { ACCESS_LOST, isRefused, ListError, ListLoading, ReadError } from './ListStates';
import { ChoicePill } from './Pill';
import { Status } from './StateBadge';

/**
 * The build queue (T376, AC-151; design 16, state C): every build waiting or
 * running in the user's folders, whoever started it, in the queue's order,
 * oldest first, read again while it is open. A queued build wechart started
 * can be cancelled; Cube's refresh worker would queue its own again at its
 * next run, and a query's build is Cube's own, so neither has Cancel (Q1),
 * and neither has a token (Q5).
 */
export interface QueueRow {
  readonly key: string;
  readonly preAggregation: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly folderPath: readonly string[];
  readonly partition: { readonly start: string; readonly end: string } | null;
  readonly granularity: string | null;
  readonly state: 'queued' | 'building' | 'stalled';
  readonly addedAt: string;
  readonly starter:
    | Starter
    | { readonly kind: 'refresh-worker' }
    | { readonly kind: 'query' }
    /** A jobs post wechart has no record of. */
    | { readonly kind: 'jobs' };
  /** The token Cube's jobs API gave wechart; none for a build wechart didn't start. */
  readonly token: string | null;
  readonly runId: string | null;
  readonly cancellable: boolean;
  /** Building, and wechart started it: Stop ends it (T554, AC-394; design 16, P1). */
  readonly stoppable: boolean;
}

export const QUEUE_QUERY_KEY = ['jobs', 'queue'] as const;

/** An entry's state, as its State filter chooses it (T558). */
export type QueueState = QueueRow['state'];
/**
 * The queue's State filter, Any or one state (T558; the user's answer, R66):
 * Jobs' summary opens it on Building or Queued.
 */
export const QUEUE_STATES: readonly (readonly [QueueState, string])[] = [
  ['building', 'Building'],
  ['queued', 'Queued'],
  ['stalled', 'Stalled'],
];

/** The columns the list drops below 1,024 px (design 16, G8). */
// The queue has no sheet: its partition stays, so two entries of one rollup are told apart (T560's review).
const QUEUE_NARROW_HIDES = new Set(['Added', 'Started by', 'Token']);

/** The queue, as Jobs reads it for this tab and its count (design 16, pin 1). */
export async function readQueue(signal?: AbortSignal): Promise<{ entries: QueueRow[] }> {
  const response = await fetch('/api/jobs/queue', signal === undefined ? undefined : { signal });
  const body = (await response.json().catch(() => null)) as {
    entries?: QueueRow[];
    error?: unknown;
  } | null;
  // With its status: a refusal is said in the API's words (design 16, G4; T560).
  if (!response.ok || body === null || !Array.isArray(body.entries))
    throw new ReadError(
      typeof body?.error === 'string'
        ? body.error
        : `The queue could not be read (${String(response.status)}).`,
      response.status,
      response.statusText,
      'GET /api/jobs/queue',
    );
  return { entries: body.entries };
}

/** How often an open Jobs page reads the queue again. */
export const QUEUE_EVERY_MS = 5_000;

/** A partition by its period, or the whole pre-aggregation. */
const partitionOf = (row: QueueRow) =>
  row.partition === null ? 'Whole' : periodOf(row.partition.start, row.granularity);

/** "the Aug 2026 build of orders_emea.by_month", "the build of pipeline.by_stage". */
const buildOf = (row: QueueRow) =>
  `the ${row.partition === null ? '' : `${partitionOf(row)} `}build of ${row.name}`;

function StartedBy({ starter }: { starter: QueueRow['starter'] }) {
  if (starter.kind === 'person' || starter.kind === 'schedule')
    return <StarterLabel starter={starter} />;
  return (
    <span className="owner" data-testid="starter">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-icon={starter.kind}>
        {starter.kind === 'refresh-worker' ? (
          <path
            d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z M2.5 4.8L8 7.8l5.5-3M8 7.8v6.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.6" />
          </>
        )}
      </svg>
      {starter.kind === 'refresh-worker'
        ? 'Cube’s refresh worker'
        : starter.kind === 'query'
          ? 'A query'
          : 'Cube’s jobs API'}
    </span>
  );
}

function StateOf({ row }: { row: QueueRow }) {
  if (row.state === 'stalled')
    return (
      <>
        <Status kind="warn" label="Stalled" testId="queue-state" state="stalled" />
        <span className="build-queue__sub">Cube takes it out at its next check</span>
      </>
    );
  return row.state === 'building' ? (
    <Status kind="run" label="Building" testId="queue-state" state="building" />
  ) : (
    <Status kind="idle" label="Queued" testId="queue-state" state="queued" />
  );
}

/** Why a cancel didn't happen, in design 16's words (state C3). */
const REFUSED: Record<
  string,
  { readonly bold: string; readonly rest: string; readonly err: boolean }
> = {
  processing: {
    bold: 'Not cancelled: it had started building.',
    rest: 'Only a queued build can be cancelled. It’s now Building, and the list shows it.',
    err: true,
  },
  gone: {
    bold: 'It had already left the queue.',
    rest: 'It finished or was taken out before the cancel reached Cube. Run history says how it ended.',
    err: false,
  },
  // A stop that came as the build ended (T554; research xcube-74c933bdb8.md).
  finished: {
    bold: 'Not stopped: it had finished building.',
    rest: 'Its version stands, and Run history has it.',
    err: false,
  },
  // Taken out, but its build had failed of its own first: none of it kept either.
  failed: {
    bold: 'It had already failed.',
    rest: 'It failed before the stop reached it, and none of it is kept. Run history has Cube’s error.',
    err: false,
  },
};

export function BuildQueue({
  enabled = true,
  state = '',
  onState,
  folderChoice: folderChosen,
  onFolderChoice,
}: {
  enabled?: boolean;
  /** The folder listed (T559), where Jobs holds it; none, and the queue does. */
  folderChoice?: FolderChoice;
  onFolderChoice?: (choice: FolderChoice) => void;
  /** The entries listed: those in this state, or every one (T558). */
  state?: QueueState | '';
  /** State chosen; none, and the filter isn't offered. */
  onState?: (state: QueueState | '') => void;
}) {
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: ({ signal }) => readQueue(signal),
    refetchInterval: QUEUE_EVERY_MS,
    enabled,
  });
  const [said, setSaid] = useState('');
  const [refused, setRefused] = useState<{ reason: string; message: string } | null>(null);
  /**
   * The folder listed, Jobs' own where it holds it, so a summary's link can
   * list every folder again (T559's review); and the folders the user builds
   * in, for the filter and the note (T559).
   */
  const [ownChoice, setOwnChoice] = useState<FolderChoice>(EVERY_FOLDER);
  const folderChoice = folderChosen ?? ownChoice;
  const setFolderChoice = onFolderChoice ?? setOwnChoice;
  const folders = useJobsFolders();
  const cancel = useMutation({
    // Stop (T554): a building one, whose build xcube stops, answering what came of it.
    mutationFn: async ({ row, stop }: { row: QueueRow; stop: boolean }) => {
      const response = await fetch('/api/jobs/queue/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(stop ? { key: row.key, stop: true } : { key: row.key }),
      });
      const body = (await response.json().catch(() => null)) as {
        cancelled?: boolean;
        /** What came of a stopped build (T554): stopped, failed of its own, or still stopping. */
        build?: 'stopped' | 'failed' | 'stopping';
        reason?: string;
        message?: string;
        error?: string;
      } | null;
      if (!response.ok || body === null)
        throw new ReadError(
          body?.error ?? `The cancel failed (status ${String(response.status)}).`,
          response.status,
        );
      return { row, stop, body };
    },
    onSuccess: ({ row, stop, body }) => {
      if (body.cancelled === true && body.build === 'failed') {
        // Its own failure came first (T554): said as such, not as a stop.
        setSaid('');
        setRefused({ reason: 'failed', message: '' });
      } else if (body.cancelled === true) {
        setRefused(null);
        setSaid(
          !stop
            ? `Cancelled ${buildOf(row)}. Build it again from Pre-aggregations.`
            : body.build === 'stopping'
              ? `Stopping ${buildOf(row)}. Run history says how it ends.`
              : `Stopped ${buildOf(row)}. None of it is kept. Build it again from Pre-aggregations.`,
        );
      } else {
        setSaid('');
        setRefused({ reason: body.reason ?? 'gone', message: body.message ?? '' });
      }
      void client.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
    },
    // Refused: the queue read again, and where the entry went with it, access
    // was lost while the page was open, and it is said (design 16, G5; T560).
    onError: async (error, { row }) => {
      if (!isRefused(error)) return;
      await client.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      const now = client.getQueryData<{ entries: QueueRow[] }>(QUEUE_QUERY_KEY);
      if (now?.entries.some((entry) => entry.key === row.key) !== true) setSaid(ACCESS_LOST);
    },
  });

  // Skeleton rows while it's read (design 16, G1; T560).
  if (queue.isPending) return <ListLoading said="Reading the queue…" />;
  // Couldn't read it, with Retry and Details (G2); a refusal in the API's words (G4).
  if (queue.isError)
    return (
      <ListError
        what="the queue"
        error={queue.error}
        carryOn="Your builds carry on; this list will show them once it’s read."
        onRetry={() => void queue.refetch()}
      />
    );
  // Those of the chosen folder (T559) in the chosen state, as Jobs' summary counts them (T558).
  const rows = queue.data.entries.filter(
    (entry) =>
      (state === '' || entry.state === state) &&
      inFolder(entry.folderId, folderChoice, folders.data?.folders ?? []),
  );
  // A reason design 16 doesn't word: the API's own words (T376's review).
  const why =
    refused === null
      ? undefined
      : (REFUSED[refused.reason] ?? { bold: refused.message, rest: '', err: true });

  return (
    <div className="build-queue">
      {/* For a read-write member: their folders only (design 16, pin 3). */}
      <ScopeNote folders={folders.data}>
        Showing queued and building builds in the folders where you have read-write access.
      </ScopeNote>
      <div className="sources-filters run-history__filters">
        <FolderFilter folders={folders.data} choice={folderChoice} onChange={setFolderChoice} />
        {onState === undefined ? null : (
          <ChoicePill
            label="State"
            choices={[['', 'Any'], ...QUEUE_STATES]}
            value={state}
            onChange={onState}
          />
        )}
        <p className="run-history__count" role="status">
          {`${String(rows.length)} ${rows.length === 1 ? 'entry' : 'entries'} · in queue order, oldest first`}
        </p>
      </div>
      {why === undefined ? null : (
        <div className={`notebar${why.err ? ' notebar--err' : ''}`} role="alert">
          <StatusIcon kind={why.err ? 'err' : 'info'} />
          <span>
            <b>{why.bold}</b> {why.rest}
          </span>
        </div>
      )}
      {cancel.isError ? <StateLine kind="err">{cancel.error.message}</StateLine> : null}
      {queue.data.entries.length === 0 ? (
        // Nothing queued or building (state C4); a state chosen with none in it lists none.
        <div className="run-history__empty">
          <b>Nothing is queued or building</b>
          <span>
            Builds of pre-aggregations in your folders show here while they wait and while they run,
            whoever started them.
          </span>
        </div>
      ) : (
        <TableScroll label="Build queue">
          <table className="query-log build-queue__table" aria-label="Build queue">
            <thead>
              <tr>
                {[
                  'Added',
                  'Pre-aggregation',
                  'Folder',
                  'Partition',
                  'State',
                  'Started by',
                  'Token',
                ].map((column) => (
                  // Below 1,024 px the list keeps its name, folder, state and
                  // Cancel (design 16, G8): nothing is taken away.
                  <th
                    key={column}
                    scope="col"
                    className={QUEUE_NARROW_HIDES.has(column) ? 'jobs-wide' : undefined}
                  >
                    {column}
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">Cancel</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-key={row.key}>
                  <td className="jobs-wide">
                    <time dateTime={row.addedAt}>{clockOf(row.addedAt)}</time>
                  </td>
                  <td className="run-history__name">{row.name}</td>
                  <td>{folderTextOf(row.folderPath)}</td>
                  <td>{partitionOf(row)}</td>
                  <td className="build-queue__state">
                    <StateOf row={row} />
                  </td>
                  <td className="jobs-wide">
                    <StartedBy starter={row.starter} />
                  </td>
                  <td className="jobs-wide" data-testid="queue-token">
                    {row.token === null ? (
                      '—'
                    ) : (
                      <code title={row.token}>{shortToken(row.token)}</code>
                    )}
                  </td>
                  <td>
                    {row.cancellable && row.state === 'queued' ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`Cancel ${buildOf(row)}`}
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ row, stop: false })}
                      >
                        Cancel
                      </button>
                    ) : row.stoppable && row.state === 'building' ? (
                      // A building one wechart started (T554, AC-394; design 16, P1).
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`Stop ${buildOf(row)}`}
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ row, stop: true })}
                      >
                        {/* xcube answers once the build has stopped, up to 20 s (T554). */}
                        {cancel.isPending && cancel.variables.row.key === row.key
                          ? 'Stopping…'
                          : 'Stop'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      <p className="run-history__note" data-testid="queue-foot">
        Only queued builds wechart started, from Jobs or a schedule, can be cancelled here. Cube’s
        refresh worker would queue its own again within 30 seconds, until its refresh key turns
        over, and a query’s build is one Cube started to answer a query. A token is the one Cube’s
        jobs API gave wechart; the worker’s and queries’ builds have none. A building one wechart
        started can be stopped, and none of it is kept.
      </p>
      <ExportedToast
        message={said}
        // Access lost is an error, with its icon (design 16, G5).
        kind={said === ACCESS_LOST ? 'err' : 'ok'}
        onDismiss={() => setSaid('')}
      />
    </div>
  );
}
