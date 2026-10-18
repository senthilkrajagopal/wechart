import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type Dispatch, type ReactNode } from 'react';

import { clockOf } from '../../shell/formatTime';
import { StatusIcon } from '../../shell/StatusIcon';
import { CUBE_STORE_ID } from '../data-sources/cubeStore';
import { csvFileName, csvOf } from '../data-sources/sqlCsv';
import { SqlEditor } from '../data-sources/SqlEditor';
import { ResultHead, seconds, SqlResult, type SqlOutcome } from '../data-sources/SqlResult';
import { catalogRead, schemaCompletion } from './completion';
import { cancelRun, GOING_QUERY, NO_CANCEL, type Going } from './going';
import { RunLine } from './RunLine';
import { runState, type RunState } from './runState';
import { dialectFor, statementAt } from './statementAt';
import { routeOf, type SqlSource } from './sqlSource';
import type { SqlTab, TabsAction } from './tabs';

/**
 * One tab's editor and result in the workspace (T802, AC-373, AC-385,
 * AC-380; design 17, screen 1): the run line and the warning naming the
 * tab's own source, its editor over its text, Run, and below the split its
 * result, kept in the tab so it is there again on coming back to it. The
 * run goes to the tab's source, as it was when Run was pressed. The editor
 * and the result are the data source page's (design 15), shared.
 */
const LIMITS =
  'SELECT or EXPLAIN, one statement · up to 10,000 rows, 10 MB, 30 seconds · one run at a time';
const OUTCOMES = new Set([
  'finished',
  'timeout',
  'cancelled',
  'refused',
  'failed',
  'busy',
  'unavailable',
  'going',
]);

/** An answer of the run route, as a result to show. */
function outcomeOf(status: number, body: unknown): SqlOutcome {
  const said = (body ?? {}) as { outcome?: unknown; error?: unknown };
  if (typeof said.outcome === 'string' && OUTCOMES.has(said.outcome)) return body as SqlOutcome;
  return {
    outcome: 'error',
    error: typeof said.error === 'string' ? said.error : `The run failed (${String(status)}).`,
  };
}

/** A finished run's rows, or a stopped one's read before its stop (T545); none otherwise. */
function rowsOf(result: SqlOutcome) {
  if (result.outcome === 'finished')
    return { columns: result.columns, rows: result.rows, rowCount: result.rowCount };
  if ((result.outcome === 'timeout' || result.outcome === 'cancelled') && (result.rows?.length ?? 0) > 0)
    return {
      columns: result.columns ?? [],
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    };
  return null;
}

/**
 * What holds this tab's Run (T804, AC-452, AC-379; design 17, G2 and G8):
 * another tab's run going, one going outside the tabs (the data source
 * page's, or one from before a reload), or the last one, stopped, that Cube
 * Store is still finishing. One run per person, across every tab.
 */
export type RunHold =
  | {
      readonly kind: 'tab';
      readonly tabId: string;
      readonly sourceName: string;
      readonly startedAt: number;
      readonly cubeStore: boolean;
    }
  | { readonly kind: 'elsewhere'; readonly going: Going };

const clockWithSeconds = (at: Date) => clockOf(at, { seconds: true });

/** A name chosen in the schema browser, for one tab's editor (T805, AC-386). */
export interface Insertion {
  readonly text: string;
  readonly tabId: string;
}
/** Those put in already: a tab opened again doesn't put its last one in twice. */
const inserted = new WeakSet<Insertion>();

/** A tab to run as it opens: Preview 100 rows' (T807, AC-449). */
export interface RunOnOpen {
  readonly tabId: string;
}
/** Those run already: a tab opened again doesn't run twice. */
const ranOnOpen = new WeakSet<RunOnOpen>();

/**
 * Whether this page is being left: the workspace switcher's links load
 * another page, which drops a run's request while the run goes on.
 */
let leaving = false;
if (typeof window !== 'undefined') {
  const left = () => {
    leaving = true;
  };
  window.addEventListener('beforeunload', left);
  window.addEventListener('pagehide', left);
  window.addEventListener('pageshow', () => {
    leaving = false;
  });
}

/** A run ended while away: its rows counted, its time and its start, as History has them. */
function awayDetail(run: Extract<NonNullable<SqlTab['run']>, { kind: 'done' }>, state: RunState): string {
  const took = 'durationMs' in run.outcome ? run.outcome.durationMs : null;
  return [state.rows, took === null ? null : seconds(took), `at ${clockWithSeconds(new Date(run.at))}`]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** The note over a held tab's editor: whose run, and Go to it and Cancel that run where they can be. */
function HeldNote({
  hold,
  onGoTo,
  onCancel,
}: {
  readonly hold: RunHold;
  readonly onGoTo: (tabId: string) => void;
  readonly onCancel: () => void;
}) {
  if (hold.kind === 'elsewhere' && hold.going.stopping === true) {
    const going = hold.going;
    return (
      <p className="notebar sql-runner__elsewhere" data-testid="sql-run-held">
        <StatusIcon kind="run" />
        <span>
          {going.unconfirmed === true
            ? 'xcube can’t say whether Cube Store has finished your last query.'
            : going.endsBy == null
              ? 'Cube Store is running your last query to its end; it can’t be stopped.'
              : `Cube Store is still finishing your last query, until ${clockWithSeconds(new Date(going.endsBy))} at the latest.`}{' '}
          One run at a time: your next one runs once it has ended.
        </span>
      </p>
    );
  }
  const cubeStore = hold.kind === 'tab' ? hold.cubeStore : hold.going.cubeStore === true;
  const name =
    hold.kind === 'tab'
      ? hold.sourceName
      : (hold.going.dataSource?.name ?? (cubeStore ? 'Cube Store' : 'a data source'));
  const startedAt = new Date(hold.kind === 'tab' ? hold.startedAt : hold.going.startedAt);
  // Go to it only where a tab holds it: a run from elsewhere has none (lane SQL's call).
  const goTo = hold.kind === 'tab' ? hold.tabId : null;
  return (
    <p className="notebar sql-runner__elsewhere" data-testid="sql-run-held">
      <StatusIcon kind="run" />
      <span>
        You have a run going on <b>{name}</b>, started at {clockWithSeconds(startedAt)}. One run at a
        time.
        {goTo === null ? null : (
          <>
            {' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                onGoTo(goTo);
              }}
            >
              Go to it
            </button>
          </>
        )}
        {goTo !== null ? ' · ' : ' '}
        {/* Cube Store's has no cancel, and says so: it can't stop a query (AC-379, R64). */}
        {cubeStore ? (
          <span data-testid="sql-no-cancel">{NO_CANCEL}</span>
        ) : (
          <button type="button" className="btn-link" onClick={onCancel}>
            Cancel that run
          </button>
        )}
      </span>
    </p>
  );
}

export function QueryTab({
  tab,
  source,
  dispatch,
  grip,
  state = runState(tab.run, tab.run?.at ?? 0),
  hold = null,
  onGoTo = () => undefined,
  insertion,
  runOnOpen,
}: {
  readonly tab: SqlTab;
  readonly source: SqlSource;
  readonly dispatch: Dispatch<TabsAction>;
  /** The split's grip, between the editor and the result. */
  readonly grip: ReactNode;
  /** Its run's state, as its tab names it, on the workspace's one clock (AC-452). */
  readonly state?: RunState;
  /** What holds its Run, where something does. */
  readonly hold?: RunHold | null;
  /** Selects the tab whose run is going. */
  readonly onGoTo?: (tabId: string) => void;
  /** A name chosen in the schema browser: put in at the cursor, if it is this tab's and new. */
  readonly insertion?: Insertion | undefined;
  /** Run its text as it opens, if this is that tab and it hasn't (Preview 100 rows, T807). */
  readonly runOnOpen?: RunOnOpen | undefined;
}) {
  const toInsert =
    insertion !== undefined && insertion.tabId === tab.id && !inserted.has(insertion) ? insertion : undefined;
  useEffect(() => {
    if (toInsert !== undefined) inserted.add(toInsert);
  }, [toInsert]);
  const queryClient = useQueryClient();
  const warningId = useId();
  const limitsId = useId();
  const [selected, setSelected] = useState('');
  /** With nothing selected, the statement at the cursor, which is what runs (T803, AC-387); the first, on opening. */
  const dialect = dialectFor(source.cubeStore === true ? null : source.driver);
  const [statement, setStatement] = useState(() => statementAt(tab.sql, 0, dialect)?.text ?? '');
  // Autocomplete from the names the schema browser has read (T808, AC-456); Cube Store has no catalog.
  const [completion] = useState(() =>
    source.cubeStore === true ? undefined : schemaCompletion(() => catalogRead(queryClient, source.id), dialect),
  );
  const [said, setSaid] = useState('');
  const [focusing, setFocusing] = useState<object | undefined>(undefined);
  const bar = useRef<HTMLDivElement>(null);
  const running = tab.run?.kind === 'running';
  const shown = tab.run?.kind === 'done' ? tab.run : null;
  const onCubeStore = source.cubeStore === true;

  /** Set as Run is pressed, before a render: two presses send one run (T802's review). */
  const sending = useRef(false);
  const [cancelFailed, setCancelFailed] = useState<string | null>(null);
  const cancel = async () => {
    setCancelFailed(null);
    setCancelFailed(await cancelRun());
    void queryClient.invalidateQueries({ queryKey: GOING_QUERY.queryKey });
  };

  const run = async (sql: string) => {
    // One run per person, across every tab: held while another goes (AC-452, AC-379).
    if (running || hold !== null || sending.current || sql.trim() === '') return;
    sending.current = true;
    setCancelFailed(null);
    const at = Date.now();
    dispatch({ kind: 'run-start', id: tab.id, sql, at });
    setSaid('Running');
    let outcome: SqlOutcome;
    try {
      const response = await fetch(routeOf(source, 'sql'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      outcome = outcomeOf(response.status, await response.json().catch(() => null));
    } catch {
      // The page is being left, which drops its request, not the run: the
      // tab keeps it going, for the next page to follow (T804, AC-452).
      if (leaving) {
        sending.current = false;
        return;
      }
      // Sent or not, no answer came: it may have run (T535's review).
      outcome = {
        outcome: 'unavailable',
        error: 'No answer came back, so whether it ran isn’t known. Try again.',
      };
    }
    sending.current = false;
    const answeredAt = Date.now();
    // Into the workspace's tabs, which outlive this view: it may have closed meanwhile (AC-452).
    dispatch({ kind: 'run-done', id: tab.id, sourceId: source.id, sql, at, outcome, answeredAt });
    const ended = runState({ kind: 'done', outcome, sql, at }, answeredAt, true);
    setSaid(ended.rows === null ? ended.label : `${ended.label}, ${ended.rows}`);
    // Back to the editor, unless the user has moved on meanwhile (design 15, keyboard).
    const active = document.activeElement;
    if (active === null || active === document.body || bar.current?.contains(active) === true)
      setFocusing({});
    void queryClient.invalidateQueries({ queryKey: ['sql-runs'] });
  };

  // Preview 100 rows: its SELECT runs as the tab opens, an ordinary run (T807, AC-449).
  const toRunOnOpen = runOnOpen?.tabId === tab.id && !ranOnOpen.has(runOnOpen) ? runOnOpen : undefined;
  useEffect(() => {
    if (toRunOnOpen === undefined) return undefined;
    // Once the tab has drawn, once per Preview.
    const opened = setTimeout(() => {
      if (ranOnOpen.has(toRunOnOpen)) return;
      ranOnOpen.add(toRunOnOpen);
      void run(tab.sql);
    }, 0);
    return () => {
      clearTimeout(opened);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRunOnOpen]);

  const download = () => {
    if (shown === null) return;
    const got = rowsOf(shown.outcome);
    if (got === null) return;
    const url = URL.createObjectURL(new Blob([csvOf(got.columns, got.rows)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName(onCubeStore ? CUBE_STORE_ID : source.name, new Date(shown.at));
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
    const rows = got.rowCount;
    setSaid(`Downloaded ${rows === 1 ? '1 row' : `${rows.toLocaleString('en')} rows`} as a CSV file.`);
  };

  const toRun = selected === '' ? statement : selected;
  const held = !running && hold !== null;
  return (
    <>
      <div className="sql-centre__editor sql-query" data-testid="sql-editor-area">
        <RunLine source={source} warningId={warningId} />
        {hold !== null && held ? (
          <HeldNote hold={hold} onGoTo={onGoTo} onCancel={() => void cancel()} />
        ) : null}
        <SqlEditor
          value={tab.sql}
          onChange={(sql) => {
            dispatch({ kind: 'sql', id: tab.id, sql });
          }}
          onRun={(sql) => void run(sql)}
          onSelection={setSelected}
          atCursor
          dialect={dialect}
          onStatement={setStatement}
          label={`SQL for ${source.name}`}
          describedBy={`${warningId} ${limitsId}`}
          focusing={focusing}
          insertion={toInsert}
          completion={completion}
        />
        <div className="sql-runner__bar" ref={bar}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={running || held || toRun.trim() === ''}
            onClick={() => void run(toRun)}
          >
            {running ? 'Running…' : selected === '' ? 'Run' : 'Run selection'}
          </button>
          {held ? <span className="sql-runner__note">held while your other run goes</span> : null}
          {running ? (
            // Cube Store can't stop a query: no Cancel, said so (AC-379, R64).
            onCubeStore ? (
              <span className="sql-runner__note" data-testid="sql-no-cancel">
                {NO_CANCEL}
              </span>
            ) : (
              <button type="button" className="btn" onClick={() => void cancel()}>
                Cancel
              </button>
            )
          ) : null}
          <span className="sql-runner__spacer" />
          <span id={limitsId} className="sql-runner__limits">
            {LIMITS}
          </span>
        </div>
      </div>
      {grip}
      <div className="sql-centre__results sql-query__results" data-testid="sql-results-area">
        {cancelFailed === null ? null : (
          <p className="sql-runner__failed" role="alert" data-testid="sql-cancel-failed">
            {cancelFailed}
          </p>
        )}
        {running ? (
          // Design 17, G1: its state as its tab names it, counting its seconds.
          <div className="sql-result" data-testid="sql-result">
            <ResultHead kind={state.kind} label={state.label} />
          </div>
        ) : shown === null ? (
          <p className="sql-runner__empty">Run a SELECT or EXPLAIN to see its rows here.</p>
        ) : shown.away === true ? (
          // Ended while the user was away: how, from History, its rows not kept (T804, lane SQL's call).
          <div className="sql-result" data-testid="sql-result">
            <ResultHead kind={state.kind} label={state.label} detail={awayDetail(shown, state)} />
            <p className="sql-result__note" data-testid="sql-result-note">
              {shown.outcome.outcome === 'unavailable' && shown.outcome.error !== ''
                ? shown.outcome.error
                : 'You were away when it ended, so its rows weren’t kept. Run it again to see them.'}
            </p>
          </div>
        ) : (
          <SqlResult
            result={shown.outcome}
            sql={shown.sql}
            startedAt={new Date(shown.at)}
            onDownload={download}
            onCubeStore={onCubeStore}
            state={state}
            // Cube Store's run on has ended, as xcube says since its answer (T548).
            ended={state.label !== 'Cube Store still finishing'}
          />
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {said}
        </p>
      </div>
    </>
  );
}
