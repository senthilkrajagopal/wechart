import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { Me } from '../../shell/AccountMenu';
import { clockOf as clock, exactOf, whenOf as momentOf } from '../../shell/formatTime';
import { ME_QUERY } from '../../shell/me';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { SchemaBrowser } from './SchemaBrowser';
import { csvFileName, csvOf } from './sqlCsv';
import { SqlEditor } from './SqlEditor';
import { CUBE_STORE_ID } from './cubeStore';
import { refusalSentence, SqlResult, type SqlOutcome } from './SqlResult';
import { cancelRun, GOING_QUERY, NO_CANCEL } from '../sql/going';
import { NO_LONGER_AVAILABLE } from '../sql/HistoryList';
import { OffPanel } from '../sql/OffPanel';
import { loginFor, pageKeyOf, pathText, routeOf, type SqlSource } from '../sql/sqlSource';

/**
 * The SQL tab on a data source's page (T535, F40; design 15 of 2026-10-01,
 * approved with P1–P5 and its answers, R51).
 *
 * - **While the runner is off,** a panel says so, to Super-Admins with Turn
 *   on… and to the folder's own read-write members (P1, AC-373). The page
 *   shows the tab to nobody else.
 * - **Once on:** where the SQL runs and as whom, who turned it on, and the
 *   warning, always above the editor (AC-385, Q3); the app's CodeMirror in
 *   SQL mode, with Run and ⌘/Ctrl+Enter, the selection run alone where there
 *   is one (P2, Q1, AC-387); the limits; the result, its grid headed by each
 *   column's name and database type, with Download CSV of exactly its rows
 *   (AC-380, Q5); Run held back while a run goes, with Cancel (AC-379); the
 *   schema browser beside the editor, a name chosen there put in at the
 *   cursor (P3, AC-386); and My runs beside it all, this data source's by
 *   default (AC-381, Q2).
 * - **In My workspace,** its owner runs it with no switch (AC-383), unless a
 *   copy is pointed elsewhere, which needs one (Q8).
 * - **On Cube Store** (T536, AC-384; design 15's H): its own page's tab, its
 *   own switch and warning, no schema browser, and no Cancel, which Cube
 *   Store hasn't: xcube stops waiting at 30 seconds (research
 *   `xcube-sql-runner.md`).
 *
 * A stopped or cancelled run shows the rows that came back before the stop,
 * marked cut, and offers them as a CSV; with none, it says nothing came back
 * (T545, xcube `6d9673ccda`; design 15's Q6).
 */

// Moved to the SQL runner workspace with the off panel (T798), and kept
// importable from here for the page's own users.
export type { SqlRunnerState, SqlSource } from '../sql/sqlSource';
export { CubeStoreTurnOn } from '../sql/OffPanel';

/** Another page's SQL tab: a data source's, or Cube Store's. */
const sqlTabHref = (id: string) => `/explore/data-sources/${encodeURIComponent(id)}?tab=sql`;

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

/**
 * The editor's text, kept per data source while moving between tabs and
 * pages (screen 1, pin 5), and per user: whoever signs in next in the same
 * browser tab doesn't see it (T535's review).
 */
const draftKey = (user: string, id: string) => `wechart.sql.${user}.${id}`;
const draftOf = (user: string, id: string): string => {
  try {
    return globalThis.sessionStorage?.getItem(draftKey(user, id)) ?? '';
  } catch {
    return '';
  }
};
const keepDraft = (user: string, id: string, text: string) => {
  try {
    globalThis.sessionStorage?.setItem(draftKey(user, id), text);
  } catch {
    // Kept for this page only.
  }
};
/** Who is signed in, as the app's gate has asked before any page shows. */
function useUserKey(): string {
  const me = useQueryClient().getQueryData<Me>(ME_QUERY.queryKey);
  return me?.identity ?? me?.name ?? '';
}

/** "14:05", on the one 24-hour clock (T477). */
const clockOf = (iso: string) => clock(new Date(iso));
/**
 * A past run's time, with its day where it wasn't today, as design 15's My
 * runs says it: "Today 14:05", "Yesterday 16:40", "24 Sep 09:40" (T477, Q8).
 */
const whenOf = (iso: string) => momentOf(new Date(iso));
/** A moment with its exact time and UTC on hover (T477, Q9). */
function When({ iso, className }: { iso: string; className?: string }) {
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={exactOf(at)} {...(className === undefined ? {} : { className })}>
      {momentOf(at)}
    </time>
  );
}

/** An answer of the run route, as a result to show. */
function outcomeOf(status: number, body: unknown): SqlOutcome {
  const said = (body ?? {}) as { outcome?: unknown; error?: unknown };
  if (typeof said.outcome === 'string' && OUTCOMES.has(said.outcome)) return body as SqlOutcome;
  return {
    outcome: 'error',
    error: typeof said.error === 'string' ? said.error : `The run failed (${String(status)}).`,
  };
}

export function SqlTab({ source, superAdmin }: { source: SqlSource; superAdmin: boolean }) {
  /**
   * What the switch just did here: after Turn on, focus goes to the editor;
   * after Turn off, to "Turn on the SQL runner…", with a note (design 15,
   * keyboard). The tab shows again once the page has read the switch.
   */
  const [switched, setSwitched] = useState<'on' | 'off' | null>(null);
  return source.sqlRunner.runs ? (
    <Runner
      source={source}
      superAdmin={superAdmin}
      turnedOn={switched === 'on'}
      onTurnedOff={() => {
        setSwitched('off');
      }}
    />
  ) : (
    <OffPanel
      source={source}
      superAdmin={superAdmin}
      turnedOff={switched === 'off'}
      onTurnedOn={() => {
        setSwitched('on');
      }}
    />
  );
}

interface Shown {
  readonly result: SqlOutcome;
  readonly sql: string;
  readonly startedAt: Date;
  /** When its answer came: what the page hears of its run after it is news (T548). */
  readonly answeredAt: number;
}

const clockWithSeconds = (iso: string) => clock(new Date(iso), { seconds: true });

/** Once on (screen 1): where it runs, the warning, the editor, the result, and My runs. */
function Runner({
  source,
  superAdmin,
  turnedOn,
  onTurnedOff,
}: {
  source: SqlSource;
  superAdmin: boolean;
  /** Just turned on here: the editor takes focus (design 15, keyboard). */
  turnedOn: boolean;
  onTurnedOff: () => void;
}) {
  const queryClient = useQueryClient();
  const user = useUserKey();
  const [text, setText] = useState(() => draftOf(user, source.id));
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState<Shown | null>(null);
  const [said, setSaid] = useState('');
  const [undo, setUndo] = useState<{ readonly text: string; readonly when: string } | null>(null);
  const [cancelFailed, setCancelFailed] = useState<string | null>(null);
  /** Focus asked of the editor: on showing after Turn on, at a run's end, on a run picked. */
  const [focusing, setFocusing] = useState<object | undefined>(() => (turnedOn ? {} : undefined));
  /** A name chosen in the schema browser, for the editor's cursor (T539). */
  const [insertion, setInsertion] = useState<{ readonly text: string } | undefined>(undefined);
  const bar = useRef<HTMLDivElement>(null);
  const warningId = useId();
  const limitsId = useId();
  const login = loginFor(source);
  const runner = source.sqlRunner;
  const onCubeStore = source.cubeStore === true;

  const going = useQuery(GOING_QUERY);
  const elsewhere = running === null ? (going.data ?? null) : null;

  useEffect(() => {
    if (running === null) return undefined;
    const ticking = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(ticking);
    };
  }, [running]);

  const edit = useCallback(
    (next: string) => {
      setText(next);
      keepDraft(user, source.id, next);
    },
    [user, source.id],
  );

  const run = useCallback(
    async (sql: string) => {
      if (running !== null || elsewhere !== null || sql.trim() === '') return;
      const startedAt = new Date();
      setRunning(startedAt);
      setNow(startedAt.getTime());
      setShown(null);
      setCancelFailed(null);
      setSaid('Running');
      let result: SqlOutcome;
      try {
        const response = await fetch(routeOf(source, 'sql'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sql }),
        });
        result = outcomeOf(response.status, await response.json().catch(() => null));
      } catch {
        // Sent or not, no answer came: it may have run (T535's review).
        result = {
          outcome: 'unavailable',
          error: 'No answer came back, so whether it ran isn’t known. Try again.',
        };
      }
      setShown({ result, sql, startedAt, answeredAt: Date.now() });
      setRunning(null);
      setCancelFailed(null);
      setSaid(spokenOf(result, sql, source.cubeStore === true));
      // Back to the editor, unless the user has moved on elsewhere meanwhile
      // (design 15, keyboard): Run and Cancel are held back or gone.
      const active = document.activeElement;
      if (active === null || active === document.body || bar.current?.contains(active) === true)
        setFocusing({});
      void queryClient.invalidateQueries({ queryKey: ['sql-runs'] });
    },
    [running, elsewhere, source, queryClient],
  );

  const cancel = async () => {
    setCancelFailed(null);
    setCancelFailed(await cancelRun());
    void queryClient.invalidateQueries({ queryKey: GOING_QUERY.queryKey });
  };

  const download = () => {
    if (shown === null) return;
    const { result } = shown;
    // A finished run's rows, or a stopped one's read before its stop (T545).
    const got =
      result.outcome === 'finished'
        ? { columns: result.columns, rows: result.rows, rowCount: result.rowCount }
        : (result.outcome === 'timeout' || result.outcome === 'cancelled') &&
            (result.rows?.length ?? 0) > 0
          ? {
              columns: result.columns ?? [],
              rows: result.rows ?? [],
              rowCount: result.rowCount ?? result.rows?.length ?? 0,
            }
          : null;
    if (got === null) return;
    const blob = new Blob([csvOf(got.columns, got.rows)], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName(onCubeStore ? CUBE_STORE_ID : source.name, shown.startedAt);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
    const rows = got.rowCount;
    setSaid(
      `Downloaded ${rows === 1 ? '1 row' : `${rows.toLocaleString('en')} rows`} as a CSV file.`,
    );
  };

  const toRun = selected === '' ? text : selected;
  const switchedBy = runner.confirmedBy?.name;
  return (
    <div className="sql-runner">
      <div className="sql-runner__main">
        <div className="sql-runner__line">
          {onCubeStore ? (
            <span data-testid="sql-runline">
              Runs on <span className="is-code">Cube Store</span>, which holds every folder’s
              rollups
            </span>
          ) : (
            <span data-testid="sql-runline">
              Runs on{' '}
              {login.database === null ? null : (
                <>
                  <b className="is-code">{login.database}</b> at{' '}
                </>
              )}
              <span className="is-code">{login.where}</span>
              {login.as === null ? null : (
                <>
                  , as <span className="is-code">{login.as}</span>
                </>
              )}
            </span>
          )}
          <span className="sql-runner__spacer" />
          {source.inWorkspace && runner.needsSwitch !== true ? (
            <span className="status status--ok" data-testid="sql-yours">
              <StatusIcon kind="ok" />
              Yours: you may run SQL on your own data sources in My workspace, with no switch.
              Nobody else can.
            </span>
          ) : runner.on ? (
            <span className="status status--ok" data-testid="sql-switch">
              <StatusIcon kind="ok" />
              SQL runner on · turned on by {switchedBy ?? 'a Super-Admin'}, who confirmed{' '}
              {onCubeStore
                ? 'everyone allowed may read every folder’s rollups'
                : 'the login can only read'}
              {runner.confirmedAt === undefined ? null : (
                <>
                  {' · '}
                  <When iso={runner.confirmedAt} />
                </>
              )}
              {superAdmin ? <TurnOff source={source} onTurnedOff={onTurnedOff} /> : null}
            </span>
          ) : null}
        </div>
        <p
          id={warningId}
          className="notebar notebar--warn sql-runner__warning"
          data-testid="sql-warning"
        >
          <StatusIcon kind="warn" />
          {onCubeStore ? (
            // Design 15's H2.
            <span>
              <b>This SQL runs on Cube Store directly.</b> It holds every folder’s rollups, and
              folder permissions and access policies don’t apply.
            </span>
          ) : (
            <span>
              <b>
                This SQL runs on the database directly
                {login.as === null ? '' : `, as ${login.as}`}.
              </b>{' '}
              Folder permissions and access policies don’t apply here: you can read whatever that
              login can read.
            </span>
          )}
        </p>
        {elsewhere === null ? null : elsewhere.stopping === true ? (
          // Nothing to cancel, nor to go to: Cube Store can't stop it (T548).
          <p className="notebar sql-runner__elsewhere" data-testid="sql-going-elsewhere">
            {elsewhere.unconfirmed === true
              ? 'xcube can’t say whether Cube Store has finished your last query.'
              : elsewhere.endsBy == null
                ? // Its router's, run to its end (T549).
                  'Cube Store is running your last query to its end; it can’t be stopped.'
                : `Cube Store is still finishing your last query, until ${clockWithSeconds(elsewhere.endsBy)} at the latest.`}{' '}
            One run at a time: your next one runs once it has ended.
          </p>
        ) : (
          <p className="notebar sql-runner__elsewhere" data-testid="sql-going-elsewhere">
            You have a run going on{' '}
            {elsewhere.dataSource?.name ??
              (elsewhere.cubeStore === true ? 'Cube Store' : 'a data source')}
            , started at {clockOf(elsewhere.startedAt)}. One run at a time.{' '}
            {elsewhere.dataSource !== null && elsewhere.dataSource.id !== source.id ? (
              <a href={sqlTabHref(elsewhere.dataSource.id)}>Go to it</a>
            ) : elsewhere.cubeStore === true && !onCubeStore ? (
              <a href={sqlTabHref(CUBE_STORE_ID)}>Go to it</a>
            ) : null}{' '}
            {/* Cube Store's has no cancel, and says so: it can't stop a query (AC-379, R64). */}
            {elsewhere.cubeStore === true ? (
              <span data-testid="sql-no-cancel">{NO_CANCEL}</span>
            ) : (
              <button type="button" className="btn-link" onClick={() => void cancel()}>
                Cancel that run
              </button>
            )}
          </p>
        )}
        {/* The editor, and the schema browser beside it, after it in the tab order (T539). */}
        <div
          className={onCubeStore ? 'sql-runner__work sql-runner__work--alone' : 'sql-runner__work'}
        >
          <div className="sql-runner__editor">
            <SqlEditor
              value={text}
              onChange={edit}
              onRun={(sql) => void run(sql)}
              onSelection={setSelected}
              label={`SQL for ${source.name}`}
              describedBy={`${warningId} ${limitsId}`}
              insertion={insertion}
              focusing={focusing}
            />
            <div className="sql-runner__bar" ref={bar}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={running !== null || elsewhere !== null || toRun.trim() === ''}
                onClick={() => void run(toRun)}
              >
                {running !== null ? 'Running…' : selected === '' ? 'Run' : 'Run selection'}
              </button>
              {/* ⌘↵ on a Mac, Ctrl+Enter elsewhere, as CodeMirror's Mod reads it (pin 6). */}
              <span className="sql-runner__keys" aria-hidden="true">
                <kbd>
                  {/Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘' : 'Ctrl'}
                </kbd>
                <kbd>↵</kbd>
              </span>
              {running === null ? null : (
                <>
                  {/* Cube Store can't stop a query: no Cancel, said so (AC-379, R64); xcube stops waiting at 30 s. */}
                  {onCubeStore ? null : (
                    <button type="button" className="btn" onClick={() => void cancel()}>
                      Cancel
                    </button>
                  )}
                  <span className="status status--run">
                    <StatusIcon kind="run" />
                    Running {String(Math.floor((now - running.getTime()) / 1000))} s · stops at 30 s
                  </span>
                  {onCubeStore ? (
                    <span className="sql-runner__note" data-testid="sql-no-cancel">
                      {NO_CANCEL}
                    </span>
                  ) : null}
                </>
              )}
              <span className="sql-runner__spacer" />
              <span id={limitsId} className="sql-runner__limits">
                {LIMITS}
              </span>
            </div>
          </div>
          {/* Cube Store has no catalog to introspect: its tables are in information_schema. */}
          {onCubeStore ? null : (
            <SchemaBrowser
              sourceId={source.id}
              sourceVersion={source.version}
              sourceName={source.name}
              onChoose={(name) => {
                setInsertion({ text: name });
              }}
            />
          )}
        </div>
        {cancelFailed === null ? null : (
          <p className="sql-runner__failed" role="alert" data-testid="sql-cancel-failed">
            {cancelFailed}
          </p>
        )}
        {shown === null ? (
          running === null ? (
            <p className="sql-runner__empty">Run a SELECT or EXPLAIN to see its rows here.</p>
          ) : null
        ) : (
          <SqlResult
            result={shown.result}
            sql={shown.sql}
            startedAt={shown.startedAt}
            onDownload={download}
            onCubeStore={onCubeStore}
            // Heard since its answer: Cube Store's run on has ended (T548).
            ended={going.dataUpdatedAt > shown.answeredAt && going.data?.stopping !== true}
          />
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {said}
        </p>
      </div>
      <MyRuns
        source={source}
        user={user}
        onPick={(run) => {
          setUndo({ text, when: whenOf(run.startedAt) });
          edit(run.sql);
          setFocusing({});
        }}
      />
      {undo === null ? null : (
        <div className="sql-runner__toast" role="status">
          The SQL from {undo.when} is in the editor.{' '}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              edit(undo.text);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/** What a screen reader hears once a run ends (design 15, keyboard). */
function spokenOf(result: SqlOutcome, sql: string, onCubeStore: boolean): string {
  switch (result.outcome) {
    case 'refused':
      // Whole, as the note says it (T535's review).
      return `Not run. ${result.error} ${refusalSentence(result, sql, onCubeStore)} Nothing reached ${onCubeStore ? 'Cube Store' : 'the database'}.`;
    case 'finished':
      return result.truncated === 'rows'
        ? 'Limited to 10,000 rows'
        : result.truncated === 'bytes'
          ? 'Limited to 10 MB'
          : `Finished: ${result.rowCount.toLocaleString('en')} rows in ${(result.durationMs / 1000).toFixed(2)} seconds`;
    case 'timeout':
    case 'cancelled': {
      const head = result.outcome === 'timeout' ? 'Stopped at 30 seconds' : 'Cancelled';
      const got = result.rowCount ?? result.rows?.length ?? 0;
      // With the rows that came back before the stop (T545).
      const said =
        got === 0
          ? head
          : `${head}: ${got === 1 ? '1 row' : `${got.toLocaleString('en')} rows`} came back before it was stopped`;
      // And that Cube Store runs it on, until when at the latest (T548), or to its end (T549).
      if (result.stillRunning !== true) return said;
      return result.endsBy == null
        ? `${said}. Cube Store runs it to its end; it can’t be stopped.`
        : `${said}. Cube Store is still finishing it, until ${clockWithSeconds(result.endsBy)} at the latest.`;
    }
    default:
      return 'error' in result ? result.error : 'Not run';
  }
}

/**
 * Turn off, for a Super-Admin (G2): no confirmation, since nothing is lost.
 * Once off, the tab says so and focus goes to "Turn on the SQL runner…"; one
 * refused says why (T535's review).
 */
function TurnOff({ source, onTurnedOff }: { source: SqlSource; onTurnedOff: () => void }) {
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState<string | null>(null);
  const turnOff = async () => {
    setFailed(null);
    const response = await fetch(routeOf(source, 'sql-runner'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on: false }),
    }).catch(() => null);
    if (response === null || !response.ok) {
      const said = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      setFailed(`It couldn’t be turned off: ${said?.error ?? 'no answer came back.'}`);
      return;
    }
    onTurnedOff();
    await queryClient.invalidateQueries({ queryKey: pageKeyOf(source) });
    // Off, Cube Store is listed nowhere (AC-384).
    if (source.cubeStore === true)
      await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
  };
  return (
    <>
      <button
        type="button"
        className="btn-link sql-runner__turn-off"
        onClick={() => void turnOff()}
      >
        Turn off
      </button>
      {failed === null ? null : (
        <span className="sql-runner__failed" role="alert" data-testid="sql-turn-off-failed">
          {failed}
        </span>
      )}
    </>
  );
}

interface PastRun {
  readonly id: string;
  readonly sql: string;
  readonly dataSource: {
    readonly id: string;
    readonly name: string;
    readonly folderPath: readonly { readonly title: string }[] | null;
    readonly inWorkspace: boolean;
  } | null;
  /** On a data source the user can no longer run SQL on: named nowhere (T817, AC-381). */
  readonly unavailable?: true;
  readonly startedAt: string;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly truncated: 'rows' | 'bytes' | null;
  readonly statement: string | null;
}

const RUN_LABELS: Readonly<Record<string, readonly [StateKind, string]>> = {
  finished: ['ok', 'Finished'],
  refused: ['err', 'Not run'],
  timeout: ['err', 'Stopped at 30 seconds'],
  cancelled: ['idle', 'Cancelled'],
  failed: ['err', 'Database error'],
};

/** A past run's label, as the result head says it (pin 12). */
const runLabel = (run: PastRun): readonly [StateKind, string] =>
  run.truncated === 'rows'
    ? ['warn', 'Limited to 10,000 rows']
    : run.truncated === 'bytes'
      ? ['warn', 'Limited to 10 MB']
      : (RUN_LABELS[run.outcome] ?? ['err', 'Not run']);

/** My runs (pins 11, 12; F; Q2): only the user's, this data source's by default, 50 at a time. */
function MyRuns({
  source,
  user,
  onPick,
}: {
  source: SqlSource;
  /** Whose drafts a run on another data source is put in. */
  user: string;
  onPick: (run: PastRun) => void;
}) {
  const heading = useId();
  const [scope, setScope] = useState<'source' | 'all'>('source');
  const runs = useInfiniteQuery({
    queryKey: ['sql-runs', 'list', scope === 'source' ? source.id : 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<{ runs: PastRun[]; next?: string }> => {
      const query = new URLSearchParams();
      if (scope === 'source') query.set('dataSource', source.id);
      if (pageParam !== undefined) query.set('after', pageParam);
      const search = query.toString();
      const response = await fetch(`/api/sql-runs${search === '' ? '' : `?${search}`}`);
      if (!response.ok)
        throw new Error(`Your runs could not be read (${String(response.status)}).`);
      return (await response.json()) as { runs: PastRun[]; next?: string };
    },
    getNextPageParam: (last) => last.next,
  });
  const listed = runs.data?.pages.flatMap((page) => page.runs) ?? [];
  return (
    <section className="sql-runs" aria-labelledby={heading}>
      <header className="sql-runs__head">
        <h2 id={heading}>My runs</h2>
        <div className="seg" role="radiogroup" aria-label="Which runs">
          {(
            [
              ['source', 'This data source'],
              ['all', 'All'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={scope === value ? 'is-on' : undefined}>
              <input
                type="radio"
                name={`${heading}-scope`}
                checked={scope === value}
                onChange={() => {
                  setScope(value);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </header>
      <p className="sql-runs__sub">Only you can see these · newest first</p>
      {runs.isError ? <p className="sql-runs__none">{runs.error.message}</p> : null}
      {runs.isSuccess && listed.length === 0 ? (
        <p className="sql-runs__none">
          Your runs on {scope === 'source' ? source.name : 'any data source'} will be listed here.
          Only you can see them.
        </p>
      ) : null}
      {/* ↑ and ↓ move between runs (design 15, keyboard); each is a button or a link. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ul
        className="sql-runs__list"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          // Those that open something: a run no longer available is passed over (T817's review).
          const runs = [
            ...event.currentTarget.querySelectorAll<HTMLElement>('a.sql-runs__run, button.sql-runs__run'),
          ];
          const at = runs.indexOf(event.target as HTMLElement);
          if (at < 0) return;
          event.preventDefault();
          runs[
            Math.min(runs.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))
          ]?.focus();
        }}
      >
        {listed.map((run) => {
          const [kind, label] = runLabel(run);
          const there = run.dataSource;
          // Cube Store's runs have no data source (T536).
          const here = source.cubeStore === true ? there === null : there?.id === source.id;
          const body = (
            <>
              <span className="sql-runs__top">
                <span className={`status status--${kind}`}>
                  <StatusIcon kind={kind} />
                  {label}
                </span>
                {run.outcome === 'refused' && run.statement !== null ? (
                  <span className="sql-runs__rows">{run.statement.toUpperCase()}</span>
                ) : run.rowCount === null ||
                  // A stop with none read says nothing of rows (T545).
                  (run.rowCount === 0 &&
                    (run.outcome === 'timeout' || run.outcome === 'cancelled')) ? null : (
                  <span className="sql-runs__rows">
                    {run.rowCount === 1 ? '1 row' : `${run.rowCount.toLocaleString('en')} rows`}
                  </span>
                )}
                <When iso={run.startedAt} className="sql-runs__when" />
              </span>
              {scope === 'all' ? (
                <span className="sql-runs__source">
                  {run.unavailable === true
                    ? NO_LONGER_AVAILABLE
                    : there === null
                    ? 'Cube Store'
                    : `${there.name} · ${
                        there.inWorkspace
                          ? 'your copy, in My workspace'
                          : there.folderPath === null
                            ? 'no longer yours to see'
                            : pathText(there.folderPath)
                      }`}
                </span>
              ) : null}
              <span className="sql-runs__sql">{run.sql}</span>
            </>
          );
          // Another page's run, a data source's or Cube Store's, opens there (T535's review).
          const elsewhereId = there === null ? CUBE_STORE_ID : there.id;
          return (
            <li key={run.id}>
              {run.unavailable === true ? (
                // Nowhere to open it: its source is no longer the user's to run SQL on (T817).
                <div className="sql-runs__run">{body}</div>
              ) : here ? (
                <button
                  type="button"
                  className="sql-runs__run"
                  onClick={() => {
                    onPick(run);
                  }}
                >
                  {body}
                </button>
              ) : (
                // It opens its own SQL tab, its SQL in the editor (F).
                <a
                  className="sql-runs__run"
                  href={sqlTabHref(elsewhereId)}
                  onClick={() => {
                    keepDraft(user, elsewhereId, run.sql);
                  }}
                >
                  {body}
                </a>
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
    </section>
  );
}
