import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverType, FieldValue } from '@wechart/core';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { SchemaBrowser } from './SchemaBrowser';
import { csvFileName, csvOf } from './sqlCsv';
import { SqlEditor } from './SqlEditor';
import { loginOf, readOnlyLayers } from './sqlLogin';
import { refusalSentence, SqlResult, type SqlOutcome } from './SqlResult';

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
 *
 * A stopped or cancelled run says nothing came back: xcube gives no rows
 * with either until its next image (T532's note; T545).
 */

/** What the data source's page says of its runner, for this user (`GET …/:id`). */
export interface SqlRunnerState {
  readonly on: boolean;
  readonly confirmedBy?: { readonly name: string };
  readonly confirmedAt?: string;
  /** Whether this user gets the tab at all. */
  readonly tab: boolean;
  /** Whether they may run SQL on it now. */
  readonly runs: boolean;
  /** Why not, where they may not. */
  readonly why?: string;
  /** A workspace copy pointed elsewhere, which needs a switch (Q8). */
  readonly needsSwitch?: boolean;
}

export interface SqlSource {
  readonly id: string;
  /** Its settings' version: the schema browser reads it again at another (T539's review). */
  readonly version: number;
  readonly name: string;
  readonly driver: DriverType;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly inWorkspace: boolean;
  readonly sqlRunner: SqlRunnerState;
}

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

const pathText = (path: readonly { readonly title: string }[]) =>
  path.length === 0 ? 'Shared' : path.map((folder) => folder.title).join(' / ');
const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** Three letters, as design 15 writes a month ("24 Sep"); ICU's en-GB says "Sept". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (at: Date, withYear: boolean) =>
  `${String(at.getDate())} ${MONTHS[at.getMonth()] ?? ''}${withYear ? ` ${String(at.getFullYear())}` : ''}`;
const dayAndTime = (iso: string) => `${dayOf(new Date(iso), true)}, ${clockOf(iso)}`;
/** A past run's time, with its day where it wasn't today, as design 15's My runs says it. */
function whenOf(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(at)) / 86_400_000);
  if (days === 0) return `Today ${clockOf(iso)}`;
  if (days === 1) return `Yesterday ${clockOf(iso)}`;
  return `${dayOf(at, at.getFullYear() !== now.getFullYear())} ${clockOf(iso)}`;
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

/** While off (P1; screen 2, G3): who could run SQL once on, and Turn on… for a Super-Admin. */
function OffPanel({
  source,
  superAdmin,
  turnedOff,
  onTurnedOn,
}: {
  source: SqlSource;
  superAdmin: boolean;
  /** Just turned off here: focus on Turn on…, and say so. */
  turnedOff: boolean;
  onTurnedOn: () => void;
}) {
  const heading = useId();
  const [asking, setAsking] = useState(false);
  const turnOn = useRef<HTMLButtonElement>(null);
  const login = loginOf(source.driver, source.fields);
  const canTurnOn = superAdmin && (!source.inWorkspace || source.sqlRunner.needsSwitch === true);
  useEffect(() => {
    if (turnedOff) turnOn.current?.focus();
    // On showing only: the panel is shown again after each switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="sql-off" aria-labelledby={heading}>
      <h2 id={heading}>
        <StatusIcon kind="idle" />
        The SQL runner is off for {source.name}
      </h2>
      {turnedOff ? (
        <p className="sql-off__note" role="status" data-testid="sql-turned-off">
          The SQL runner is off. Turning it on again asks for the confirmation again.
        </p>
      ) : null}
      {source.inWorkspace ? (
        <p>{source.sqlRunner.why}</p>
      ) : (
        <>
          <p>
            Once on, it runs SELECT and EXPLAIN on this database directly, as the data source’s own
            login{login.as === null ? '' : `, ${login.as}`}, past folder permissions and access
            policies. Every data source starts with it off.
          </p>
          <dl className="source-settings__rows">
            <dt>Who could run SQL</dt>
            <dd>Super-Admins, and read-write members of {pathText(source.folderPath)}</dd>
            <dt>Who couldn’t</dt>
            <dd>Members who see it from a folder below, and read-only members</dd>
          </dl>
        </>
      )}
      {canTurnOn ? (
        <div className="sql-off__act">
          <button
            ref={turnOn}
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAsking(true);
            }}
          >
            Turn on the SQL runner…
          </button>
          <span className="sql-off__note">Only Super-Admins see this button.</span>
        </div>
      ) : source.inWorkspace ? null : (
        <p>
          Only a Super-Admin can turn it on. Your own data sources in My workspace need no switch.
        </p>
      )}
      {asking ? (
        <TurnOnDialog
          source={source}
          onTurnedOn={onTurnedOn}
          onClose={() => {
            setAsking(false);
            turnOn.current?.focus();
          }}
        />
      ) : null}
    </section>
  );
}

/** Turning it on (screen 2, G1): what it runs as, what wechart does on the driver, and the confirmation. */
function TurnOnDialog({
  source,
  onTurnedOn,
  onClose,
}: {
  source: SqlSource;
  onTurnedOn: () => void;
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  /** Asked once: a second press while the first is answered would switch, and audit, twice. */
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const login = loginOf(source.driver, source.fields);
  const as = login.as ?? 'its login';
  useFocusTrap(box);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    cancel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const turnOn = async () => {
    if (pending) return;
    setPending(true);
    setFailed(null);
    const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}/sql-runner`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on: true, readOnlyConfirmed: true }),
    }).catch(() => null);
    if (response === null || !response.ok) {
      const said = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      setFailed(
        said?.error ??
          `It could not be turned on (${response === null ? 'no answer' : String(response.status)}).`,
      );
      setPending(false);
      return;
    }
    onTurnedOn();
    await queryClient.invalidateQueries({ queryKey: ['data-source', source.id] });
    onClose();
  };
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog sql-turn-on"
      >
        <h2 id={heading}>Turn on the SQL runner for {source.name}?</h2>
        <p>
          Those allowed will run SQL on this database directly, as its own login, past folder
          permissions and access policies.
        </p>
        <dl className="source-settings__rows sql-turn-on__as">
          <dt>Runs as</dt>
          <dd className="is-code">{as}</dd>
          <dt>Database</dt>
          <dd>
            {login.database === null ? null : (
              <>
                <span className="is-code">{login.database}</span> at{' '}
              </>
            )}
            <span className="is-code">{login.where}</span>
          </dd>
          <dt>Password</dt>
          <dd>Stored · encrypted</dd>
        </dl>
        <h3 className="sql-turn-on__sub">What wechart does on this driver</h3>
        <ul className="sql-turn-on__layers">
          {readOnlyLayers(source.driver).map((layer) => (
            <li key={layer}>{layer}</li>
          ))}
        </ul>
        <p>
          What <b>{as}</b> may change is set by its grants in the database, which wechart can’t
          check. Confirm that it can only read.
        </p>
        <label className="sql-turn-on__attest">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
            }}
          />
          <span>
            I confirm that {as} can only read: it has no grant to insert, update, delete, create,
            alter or drop.
          </span>
        </label>
        <p>
          {source.inWorkspace
            ? 'Then you may run SQL here, as its owner: nobody else sees your workspace.'
            : `Then Super-Admins and read-write members of ${pathText(source.folderPath)} may run SQL here.`}{' '}
          Your name and the time are kept with the switch, and shown on the SQL tab.
        </p>
        {failed === null ? null : <p className="sql-turn-on__failed">{failed}</p>}
        <div className="dialog__actions">
          <button ref={cancel} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!confirmed || pending}
            onClick={() => void turnOn()}
          >
            {pending ? 'Turning on…' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Shown {
  readonly result: SqlOutcome;
  readonly sql: string;
  readonly startedAt: Date;
}

interface Going {
  readonly dataSource: { readonly id: string; readonly name: string } | null;
  readonly startedAt: string;
}

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
  const login = loginOf(source.driver, source.fields);
  const runner = source.sqlRunner;

  const going = useQuery({
    queryKey: ['sql-runs', 'going'],
    queryFn: async (): Promise<Going | null> => {
      const response = await fetch('/api/sql-runs/going');
      if (!response.ok) return null;
      return ((await response.json()) as { going: Going | null }).going;
    },
    refetchInterval: (query) => (query.state.data == null ? false : 3_000),
  });
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
        const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}/sql`, {
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
      setShown({ result, sql, startedAt });
      setRunning(null);
      setCancelFailed(null);
      setSaid(spokenOf(result, sql));
      // Back to the editor, unless the user has moved on elsewhere meanwhile
      // (design 15, keyboard): Run and Cancel are held back or gone.
      const active = document.activeElement;
      if (active === null || active === document.body || bar.current?.contains(active) === true)
        setFocusing({});
      void queryClient.invalidateQueries({ queryKey: ['sql-runs'] });
    },
    [running, elsewhere, source.id, queryClient],
  );

  const cancel = async () => {
    setCancelFailed(null);
    const response = await fetch('/api/sql-runs/cancel', { method: 'POST' }).catch(() => null);
    // A 404 is a run that ended meanwhile: nothing to say.
    if (response === null || (!response.ok && response.status !== 404)) {
      const said = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      setCancelFailed(`It couldn’t be cancelled: ${said?.error ?? 'no answer came back.'}`);
    }
    void queryClient.invalidateQueries({ queryKey: ['sql-runs', 'going'] });
  };

  const download = () => {
    if (shown?.result.outcome !== 'finished') return;
    const blob = new Blob([csvOf(shown.result.columns, shown.result.rows)], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName(source.name, shown.startedAt);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
    const rows = shown.result.rowCount;
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
              SQL runner on · turned on by {switchedBy ?? 'a Super-Admin'}, who confirmed the login
              can only read
              {runner.confirmedAt === undefined ? '' : ` · ${dayAndTime(runner.confirmedAt)}`}
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
          <span>
            <b>
              This SQL runs on the database directly
              {login.as === null ? '' : `, as ${login.as}`}.
            </b>{' '}
            Folder permissions and access policies don’t apply here: you can read whatever that
            login can read.
          </span>
        </p>
        {elsewhere === null ? null : (
          <p className="notebar sql-runner__elsewhere" data-testid="sql-going-elsewhere">
            You have a run going on {elsewhere.dataSource?.name ?? 'a data source'}, started at{' '}
            {clockOf(elsewhere.startedAt)}. One run at a time.{' '}
            {elsewhere.dataSource === null || elsewhere.dataSource.id === source.id ? null : (
              <a
                href={`/explore/data-sources/${encodeURIComponent(elsewhere.dataSource.id)}?tab=sql`}
              >
                Go to it
              </a>
            )}{' '}
            <button type="button" className="btn-link" onClick={() => void cancel()}>
              Cancel that run
            </button>
          </p>
        )}
        {/* The editor, and the schema browser beside it, after it in the tab order (T539). */}
        <div className="sql-runner__work">
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
                  <button type="button" className="btn" onClick={() => void cancel()}>
                    Cancel
                  </button>
                  <span className="status status--run">
                    <StatusIcon kind="run" />
                    Running {String(Math.floor((now - running.getTime()) / 1000))} s · stops at 30 s
                  </span>
                </>
              )}
              <span className="sql-runner__spacer" />
              <span id={limitsId} className="sql-runner__limits">
                {LIMITS}
              </span>
            </div>
          </div>
          <SchemaBrowser
            sourceId={source.id}
            sourceVersion={source.version}
            sourceName={source.name}
            onChoose={(name) => {
              setInsertion({ text: name });
            }}
          />
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
function spokenOf(result: SqlOutcome, sql: string): string {
  switch (result.outcome) {
    case 'refused':
      // Whole, as the note says it (T535's review).
      return `Not run. ${result.error} ${refusalSentence(result, sql)} Nothing reached the database.`;
    case 'finished':
      return result.truncated === 'rows'
        ? 'Limited to 10,000 rows'
        : result.truncated === 'bytes'
          ? 'Limited to 10 MB'
          : `Finished: ${result.rowCount.toLocaleString('en')} rows in ${(result.durationMs / 1000).toFixed(2)} seconds`;
    case 'timeout':
      return 'Stopped at 30 seconds';
    case 'cancelled':
      return 'Cancelled';
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
    const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}/sql-runner`, {
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
    await queryClient.invalidateQueries({ queryKey: ['data-source', source.id] });
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
          const runs = [...event.currentTarget.querySelectorAll<HTMLElement>('.sql-runs__run')];
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
          const here = there?.id === source.id;
          const body = (
            <>
              <span className="sql-runs__top">
                <span className={`status status--${kind}`}>
                  <StatusIcon kind={kind} />
                  {label}
                </span>
                {run.outcome === 'refused' && run.statement !== null ? (
                  <span className="sql-runs__rows">{run.statement.toUpperCase()}</span>
                ) : run.rowCount === null ? null : (
                  <span className="sql-runs__rows">
                    {run.rowCount === 1 ? '1 row' : `${run.rowCount.toLocaleString('en')} rows`}
                  </span>
                )}
                <span className="sql-runs__when">{whenOf(run.startedAt)}</span>
              </span>
              {scope === 'all' ? (
                <span className="sql-runs__source">
                  {there === null
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
          return (
            <li key={run.id}>
              {here || there === null ? (
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
                // Another data source's opens its own SQL tab, its SQL in the editor (F).
                <a
                  className="sql-runs__run"
                  href={`/explore/data-sources/${encodeURIComponent(there.id)}?tab=sql`}
                  onClick={() => {
                    keepDraft(user, there.id, run.sql);
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
