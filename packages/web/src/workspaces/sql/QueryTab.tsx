import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type Dispatch, type ReactNode } from 'react';

import { CUBE_STORE_ID } from '../data-sources/cubeStore';
import { csvFileName, csvOf } from '../data-sources/sqlCsv';
import { SqlEditor } from '../data-sources/SqlEditor';
import { SqlResult, type SqlOutcome } from '../data-sources/SqlResult';
import { RunLine } from './RunLine';
import { dialectFor, statementAt } from './statementAt';
import { routeOf, type SqlSource } from './sqlSource';
import { tabState, type SqlTab, type TabsAction } from './tabs';

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

export function QueryTab({
  tab,
  source,
  dispatch,
  grip,
}: {
  readonly tab: SqlTab;
  readonly source: SqlSource;
  readonly dispatch: Dispatch<TabsAction>;
  /** The split's grip, between the editor and the result. */
  readonly grip: ReactNode;
}) {
  const queryClient = useQueryClient();
  const warningId = useId();
  const limitsId = useId();
  const [selected, setSelected] = useState('');
  /** With nothing selected, the statement at the cursor, which is what runs (T803, AC-387); the first, on opening. */
  const dialect = dialectFor(source.cubeStore === true ? null : source.driver);
  const [statement, setStatement] = useState(() => statementAt(tab.sql, 0, dialect)?.text ?? '');
  const [said, setSaid] = useState('');
  const [focusing, setFocusing] = useState<object | undefined>(undefined);
  const bar = useRef<HTMLDivElement>(null);
  const running = tab.run?.kind === 'running';
  const shown = tab.run?.kind === 'done' ? tab.run : null;
  const onCubeStore = source.cubeStore === true;

  /** Set as Run is pressed, before a render: two presses send one run (T802's review). */
  const sending = useRef(false);
  const run = async (sql: string) => {
    if (running || sending.current || sql.trim() === '') return;
    sending.current = true;
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
      // Sent or not, no answer came: it may have run (T535's review).
      outcome = {
        outcome: 'unavailable',
        error: 'No answer came back, so whether it ran isn’t known. Try again.',
      };
    }
    sending.current = false;
    dispatch({ kind: 'run-done', id: tab.id, sourceId: source.id, sql, at, outcome });
    setSaid(tabState({ ...tab, run: { kind: 'done', outcome, sql, at } }).label);
    // Back to the editor, unless the user has moved on meanwhile (design 15, keyboard).
    const active = document.activeElement;
    if (active === null || active === document.body || bar.current?.contains(active) === true)
      setFocusing({});
    void queryClient.invalidateQueries({ queryKey: ['sql-runs'] });
  };

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
  return (
    <>
      <div className="sql-centre__editor sql-query" data-testid="sql-editor-area">
        <RunLine source={source} warningId={warningId} />
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
        />
        <div className="sql-runner__bar" ref={bar}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={running || toRun.trim() === ''}
            onClick={() => void run(toRun)}
          >
            {running ? 'Running…' : selected === '' ? 'Run' : 'Run selection'}
          </button>
          <span className="sql-runner__spacer" />
          <span id={limitsId} className="sql-runner__limits">
            {LIMITS}
          </span>
        </div>
      </div>
      {grip}
      <div className="sql-centre__results sql-query__results" data-testid="sql-results-area">
        {shown === null ? (
          running ? null : (
            <p className="sql-runner__empty">Run a SELECT or EXPLAIN to see its rows here.</p>
          )
        ) : (
          <SqlResult
            result={shown.outcome}
            sql={shown.sql}
            startedAt={new Date(shown.at)}
            onDownload={download}
            onCubeStore={onCubeStore}
          />
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {said}
        </p>
      </div>
    </>
  );
}
