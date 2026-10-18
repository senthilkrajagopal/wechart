import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { exactOf, whenOf } from '../../shell/formatTime';
import { StatusIcon } from '../../shell/StatusIcon';
import { outcomeOf, type Finishing } from './awayRun';
import type { ParamType } from './parameterNames';
import { runState, type RunState } from './runState';

/** A run in the user's History, as `GET /api/sql-runs` answers it (T534, T811, T817). */
export interface HistoryRun {
  readonly id: string;
  readonly sql: string;
  /** Its data source where the user may still run SQL on it; none for Cube Store's, or one no longer available. */
  readonly dataSource: {
    readonly id: string;
    readonly name: string;
    readonly folderPath: readonly { readonly id: string; readonly title: string }[] | null;
    readonly inWorkspace: boolean;
  } | null;
  readonly cubeStore: boolean;
  /** On a data source the user can no longer run SQL on: named nowhere (AC-381, as amended 2026-10-17). */
  readonly unavailable?: true;
  readonly startedAt: string;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly truncated: 'rows' | 'bytes' | null;
  readonly statement: string | null;
  /** Its parameters' values, which only its owner sees (T811, AC-454). */
  readonly parameters: readonly { readonly name: string; readonly type: ParamType; readonly value: string }[];
}

export const NO_LONGER_AVAILABLE = 'A data source no longer available to you';

/** Where a row ran: its source and folder, Cube Store, or no longer available, naming neither (AC-381). */
export function placeOfRun(run: HistoryRun): string {
  if (run.unavailable === true) return NO_LONGER_AVAILABLE;
  const source = run.dataSource;
  if (source === null) return 'Cube Store';
  if (source.inWorkspace) return `${source.name} · My workspace`;
  return `${source.name} · ${['Shared', ...(source.folderPath ?? []).map((step) => step.title)].join(' / ')}`;
}

const rowsOf = (n: number) => (n === 1 ? '1 row' : `${n.toLocaleString('en')} rows`);

/** The second half of a row's head: rows read, or a refusal's statement, as design 15's My runs says it. */
function countOf(run: HistoryRun, rows: string | null): string | null {
  if (run.outcome === 'refused' && run.statement !== null) return run.statement.toUpperCase();
  if (rows !== null) return rows;
  if (run.truncated !== null || run.rowCount === null) return null;
  // A stop with none read says nothing of rows (T545).
  if (run.rowCount === 0 && (run.outcome === 'timeout' || run.outcome === 'cancelled')) return null;
  return run.outcome === 'finished' || run.outcome === 'timeout' || run.outcome === 'cancelled'
    ? rowsOf(run.rowCount)
    : null;
}

type Scope = 'all' | 'source';

/**
 * History in the SQL runner workspace's right pane (T817; AC-381, as amended
 * 2026-10-17; AC-452; design 17, pins 17 and 18): the user's own runs, All
 * by default, or the open tab's data source's with "This data source";
 * newest first, 50 at a time. Each row has its state as the icon and label
 * its tab and result head use (`runState`), its rows, time, SQL, parameter
 * values, and its data source and folder, or "A data source no longer
 * available to you".
 */
export function HistoryList({
  sourceId,
  going,
  stillFinishing = null,
  onChoose,
}: {
  /** A row chosen: its SQL and values to put back (T818, AC-465). Unset, rows are only read. */
  readonly onChoose?: (run: HistoryRun) => void;
  /** The open tab's data source, Cube Store's by its id; '' for none. */
  readonly sourceId: string;
  /**
   * The user's run going in a tab, which History keeps only once it ends
   * (T534): shown first, in the state its tab and result head show, on the
   * workspace's one clock (AC-452).
   */
  readonly going?:
    | {
        readonly sql: string;
        readonly sourceId: string;
        readonly at: number;
        readonly state: RunState;
        /** Its source and folder, as a row says them. */
        readonly place: string;
      }
    | undefined;
  /**
   * xcube says the user's last run, stopped, still goes on in Cube Store
   * (T548), as the tab hears it: that run's row says so too (AC-452).
   */
  readonly stillFinishing?: Finishing;
}) {
  const ids = useId();
  const [chosen, setChosen] = useState<Scope>('all');
  // With no source on the open tab, there is none to narrow to.
  const scope: Scope = sourceId === '' ? 'all' : chosen;
  const runs = useInfiniteQuery({
    queryKey: ['sql-runs', 'list', scope === 'source' ? sourceId : 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<{ runs: HistoryRun[]; next?: string }> => {
      const query = new URLSearchParams();
      if (scope === 'source') query.set('dataSource', sourceId);
      if (pageParam !== undefined) query.set('after', pageParam);
      const search = query.toString();
      const response = await fetch(`/api/sql-runs${search === '' ? '' : `?${search}`}`, { signal });
      if (!response.ok) throw new Error(`Your runs could not be read (${String(response.status)}).`);
      return (await response.json()) as { runs: HistoryRun[]; next?: string };
    },
    getNextPageParam: (last) => last.next,
  });
  const listed = runs.data?.pages.flatMap((page) => page.runs) ?? [];
  // The user's newest Cube Store run, where it was stopped: the one xcube may say goes on.
  const newestOnCubeStore = listed.find((run) => run.cubeStore);
  const lastStopped =
    newestOnCubeStore?.outcome === 'timeout' || newestOnCubeStore?.outcome === 'cancelled'
      ? newestOnCubeStore
      : undefined;
  const goingShown = going !== undefined && (scope === 'all' || going.sourceId === sourceId) ? going : undefined;
  return (
    <div className="sql-history">
      <div className="seg sql-history__scope" role="radiogroup" aria-label="Which runs">
        {(
          [
            ['all', 'All'],
            ['source', 'This data source'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={scope === value ? 'is-on' : undefined}>
            <input
              type="radio"
              name={`${ids}-scope`}
              checked={scope === value}
              disabled={value === 'source' && sourceId === ''}
              onChange={() => {
                setChosen(value);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="sql-history__note">Only you can see these · newest first</p>
      {runs.isError ? (
        <p className="sql-history__note" role="alert">
          {runs.error.message}
        </p>
      ) : null}
      {runs.isSuccess && listed.length === 0 && goingShown === undefined ? (
        <p className="sql-history__note">No runs yet.</p>
      ) : null}
      <ul className="sql-history__list" aria-label="History">
        {goingShown === undefined ? null : (
          <li className="sql-history__row" data-going="true">
            <span className="sql-history__top">
              <span className={`status status--${goingShown.state.kind}`}>
                <StatusIcon kind={goingShown.state.kind} />
                {goingShown.state.label}
              </span>
              <time
                className="sql-history__when"
                dateTime={new Date(goingShown.at).toISOString()}
                title={exactOf(new Date(goingShown.at))}
              >
                {whenOf(new Date(goingShown.at))}
              </time>
            </span>
            <span className="sql-history__sql">{goingShown.sql}</span>
            <span className="sql-history__source">{goingShown.place}</span>
          </li>
        )}
        {listed.map((run) => {
          const at = new Date(run.startedAt);
          // The newest stopped Cube Store run is the one xcube says goes on.
          const finishing = run === lastStopped ? stillFinishing : null;
          const { kind, label, rows } = runState(
            { kind: 'done', outcome: outcomeOf(run, finishing), sql: run.sql, at: at.getTime() },
            Date.now(),
            finishing !== null,
          );
          const count = countOf(run, rows);
          const body = (
            <>
              <span className="sql-history__top">
                <span className={`status status--${kind}`}>
                  <StatusIcon kind={kind} />
                  {label}
                </span>
                {count === null ? null : <span className="sql-history__rows">{count}</span>}
                <time className="sql-history__when" dateTime={run.startedAt} title={exactOf(at)}>
                  {whenOf(at)}
                </time>
              </span>
              <span className="sql-history__sql">{run.sql}</span>
              {run.parameters.length === 0 ? null : (
                <span className="sql-history__values">
                  {run.parameters.map((each) => `${each.name} = ${each.value}`).join(' · ')}
                </span>
              )}
              <span className="sql-history__source">{placeOfRun(run)}</span>
            </>
          );
          return (
            <li key={run.id} className="sql-history__row">
              {onChoose === undefined ? (
                body
              ) : (
                // Chosen, its SQL and values are put back, never run (T818, AC-465).
                <button
                  type="button"
                  className="sql-history__pick"
                  onClick={() => {
                    onChoose(run);
                  }}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {runs.hasNextPage ? (
        <button type="button" className="btn-link" onClick={() => void runs.fetchNextPage()}>
          Show older runs
        </button>
      ) : null}
    </div>
  );
}
