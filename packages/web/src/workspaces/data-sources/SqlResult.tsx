import { createContext, useContext, type ReactNode } from 'react';

import { clockOf } from '../../shell/formatTime';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';

/**
 * A SQL run's result (T535; AC-380, AC-377, AC-378, AC-379, AC-375; design
 * 15's screen 1 and states B–E), as the API answers it: a finished run's
 * grid, each column headed by its name and its type as the database names it
 * (Q5), values as they came (numbers often as text), NULL said; or why there
 * is none.
 */

export interface SqlColumn {
  readonly name: string;
  readonly type: string | null;
}

export type SqlOutcome =
  | {
      readonly outcome: 'finished';
      readonly columns: readonly SqlColumn[];
      readonly rows: readonly (readonly unknown[])[];
      readonly rowCount: number;
      readonly truncated: 'rows' | 'bytes' | null;
      readonly durationMs: number;
      readonly statement: 'select' | 'explain';
    }
  /**
   * Stopped at 30 seconds, or cancelled, with the rows read before the stop,
   * `truncated: 'stopped'` (T545; xcube `6d9673ccda`). None where nothing
   * arrived, or from an older image.
   */
  | {
      readonly outcome: 'timeout' | 'cancelled';
      readonly durationMs: number | null;
      readonly columns?: readonly SqlColumn[];
      readonly rows?: readonly (readonly unknown[])[];
      readonly rowCount?: number;
      readonly truncated?: 'stopped';
      /**
       * On Cube Store, which can't stop a query: it runs on until `endsBy` at
       * the latest (T548, AC-378; xcube `2099b13f2d`), or, with none, to its
       * end, its router's (T549; xcube `46ca0ce708`).
       */
      readonly stillRunning?: true;
      readonly endsBy?: string | null;
    }
  | {
      readonly outcome: 'refused';
      readonly error: string;
      readonly reason: string;
      readonly statement: string | null;
      /** A join Cube Store's router would run, which nothing could stop (T650, R64). */
      readonly routerJoin?: true;
    }
  | { readonly outcome: 'failed'; readonly error: string; readonly durationMs: number | null }
  /** Not run for a reason of wechart's or xcube's: busy, away, another run going. */
  | { readonly outcome: 'busy' | 'unavailable' | 'going' | 'error'; readonly error: string };

const count = (n: number) => n.toLocaleString('en');
/** A run's time, "0.41 s", as its head says it. */
export const seconds = (ms: number) =>
  ms < 10 ? 'under 0.01 s' : `${(ms / 1000).toFixed(2).replace(/0$/, '')} s`;
/** A column of numbers, by its database type: right-aligned, in tabular figures (pin 9). */
const NUMERIC =
  /^(int|smallint|bigint|tinyint|mediumint|float|double|real|numeric|decimal|number|money)/i;
const isNumeric = (type: string | null) => type !== null && NUMERIC.test(type);
/** "14:05:12", the one 24-hour clock (T477). */
const clock = (at: Date) => clockOf(at, { seconds: true });
const article = (word: string) => (/^[AEIOU]/.test(word) ? 'an' : 'a');

/**
 * The second sentence of a refusal (design 15, E2): what xcube found, in the
 * design's words where the kind says which, else xcube's own.
 */
export function refusalSentence(
  { statement, reason }: { readonly statement: string | null; readonly reason: string },
  sql: string,
  /** Cube Store's commands are commands, as design 15's H3 names them (T536). */
  onCubeStore = false,
): string {
  // On Cube Store, xcube says why where it isn't the kind alone: system.cache,
  // or where to read instead of a SHOW (T536's review; its probe).
  const own = onCubeStore && !/^Only a SELECT/.test(reason) ? reason.replace(/\.$/, '') : null;
  if (onCubeStore && statement === 'select' && own !== null) return `${own}.`;
  if (onCubeStore && statement !== null && statement !== 'select' && statement !== 'explain') {
    const kind = statement.toUpperCase();
    return `This is ${article(kind)} ${kind} command.${own === null ? '' : ` ${own}.`}`;
  }
  if (statement === 'explain')
    // Another driver's EXPLAIN is refused for its own reason: Oracle's EXPLAIN
    // PLAN writes PLAN_TABLE; SQL Server and BigQuery have none (research
    // xcube-sql-runner.md).
    return /\bANALY[SZ]E\b/i.test(sql)
      ? 'EXPLAIN ANALYZE runs the statement. Use EXPLAIN on its own.'
      : `wechart couldn’t run this EXPLAIN: ${reason.replace(/\.$/, '')}.`;
  if (statement === null && /one statement/i.test(reason))
    return 'This holds more than one statement. Run them one at a time.';
  if (statement === 'select') {
    if (/\bINTO\b/.test(reason)) return 'This SELECT creates a table (SELECT … INTO).';
    if (/\bFOR\s+(UPDATE|SHARE)\b/i.test(sql)) return 'This SELECT locks rows (FOR UPDATE).';
    const write = /\b(INSERT|UPDATE|DELETE|MERGE)\b/.exec(reason)?.[1];
    if (write !== undefined && /^\s*WITH\b/i.test(sql))
      return `Its WITH holds ${article(write)} ${write}.`;
  }
  if (statement !== null && statement !== 'select') {
    const kind = statement.toUpperCase();
    return `This is ${article(kind)} ${kind} ${onCubeStore ? 'command' : 'statement'}.`;
  }
  return `wechart couldn’t read it as a SELECT or EXPLAIN: ${reason.replace(/\.$/, '')}.`;
}

/**
 * The run's state as the SQL runner workspace names it (T804, AC-452): where
 * given, the head shows it in place of its own, so the tab, the head and
 * History say one thing.
 */
const HeadState = createContext<{ readonly kind: StateKind; readonly label: string } | undefined>(
  undefined,
);

/** A result's head: its state as an icon and a label, a detail, and its actions. */
export function ResultHead({
  kind,
  label,
  detail,
  children,
}: {
  kind: StateKind;
  label: string;
  detail?: string | undefined;
  children?: ReactNode;
}) {
  const named = useContext(HeadState);
  return (
    <div className="sql-result__head" data-testid="sql-result-head">
      <span className={`status status--${named?.kind ?? kind}`}>
        <StatusIcon kind={named?.kind ?? kind} />
        {named?.label ?? label}
      </span>
      {detail === undefined ? null : (
        <>
          {' '}
          <span className="sql-result__detail">{detail}</span>
        </>
      )}
      <span className="sql-result__spacer" />
      {children}
    </div>
  );
}
const Head = ResultHead;

/**
 * A run's rows (AC-380): headed by each column's name and its type as the
 * database names it (Q5), values as they came, NULL said, numbers
 * right-aligned by their type (pin 9). A finished run's, and a stopped one's
 * rows read before its stop (T545).
 */
function Grid({
  columns,
  rows,
  rowCount,
}: {
  columns: readonly SqlColumn[];
  rows: readonly (readonly unknown[])[];
  rowCount: number;
}) {
  const counted = rowCount === 1 ? '1 row' : `${count(rowCount)} rows`;
  return (
    // A scrolling box the keyboard must reach, as TableScroll's (WCAG 2.1.1).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="sql-result__scroll" role="region" aria-label="Result rows" tabIndex={0}>
      <table
        className="sql-result__grid"
        aria-label={`Result: ${counted}, ${
          columns.length === 1 ? '1 column' : `${count(columns.length)} columns`
        }`}
      >
        <thead>
          <tr>
            <th scope="col" className="sql-result__n">
              #
            </th>
            {columns.map((column, index) => (
              // Positions: duplicate names are kept, as rows are arrays.
              <th
                key={String(index)}
                scope="col"
                className={isNumeric(column.type) ? 'sql-result__num' : undefined}
              >
                <span className="sql-result__name">{column.name}</span>
                {column.type === null ? null : (
                  <span className="sql-result__type">{column.type}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, at) => (
            <tr key={String(at)}>
              <td className="sql-result__n">{count(at + 1)}</td>
              {row.map((value, index) =>
                value === null || value === undefined ? (
                  <td key={String(index)} className="sql-result__null">
                    NULL
                  </td>
                ) : (
                  <td
                    key={String(index)}
                    className={
                      isNumeric(columns[index]?.type ?? null) ? 'sql-result__num' : undefined
                    }
                  >
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rowCount === 0 ? <p className="sql-result__empty">The query returned no rows.</p> : null}
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => (
  <p className="sql-result__note" data-testid="sql-result-note">
    {children}
  </p>
);

export function SqlResult({
  state,
  ...shown
}: Parameters<typeof Result>[0] & {
  /** The run's state as the workspace names it, for the head (T804, AC-452). */
  state?: { readonly kind: StateKind; readonly label: string } | undefined;
}) {
  return (
    <HeadState.Provider value={state}>
      <Result {...shown} />
    </HeadState.Provider>
  );
}

function Result({
  result,
  sql,
  startedAt,
  onDownload,
  onCubeStore = false,
  ended = false,
}: {
  result: SqlOutcome;
  /** The SQL it ran, for a refusal's words. */
  sql: string;
  startedAt: Date;
  onDownload: () => void;
  /** Run on Cube Store (T536): no cancel, and commands, not statements. */
  onCubeStore?: boolean;
  /** Stopped but run on in Cube Store, it has since ended, as xcube says (T548). */
  ended?: boolean;
}) {
  const at = `at ${clock(startedAt)}`;
  const named = useContext(HeadState);
  switch (result.outcome) {
    case 'finished': {
      const cut = result.truncated;
      const label =
        cut === 'rows'
          ? 'Limited to 10,000 rows'
          : cut === 'bytes'
            ? 'Limited to 10 MB'
            : result.rowCount === 0
              ? 'Finished · no rows'
              : 'Finished';
      const rows = result.rowCount === 1 ? '1 row' : `${count(result.rowCount)} rows`;
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head
            kind={cut === null ? 'ok' : 'warn'}
            label={label}
            // Named from outside, "Finished" says no rows in its detail (T804).
            detail={`${result.rowCount === 0 ? (named === undefined ? '' : 'no rows · ') : `${rows} · `}${seconds(result.durationMs)} · ${at}`}
          >
            <button type="button" className="btn btn-sm" onClick={onDownload}>
              {cut === null ? 'Download CSV' : `Download CSV · ${rows}`}
            </button>
          </Head>
          {cut === 'rows' ? (
            <Note>
              The query returned more than 10,000 rows. These are the first {count(result.rowCount)}
              , in the order the database sent them.
            </Note>
          ) : cut === 'bytes' ? (
            <Note>
              The query returned more than 10 MB. These are the first {rows}, as many as fit in 10
              MB.
            </Note>
          ) : null}
          <Grid columns={result.columns} rows={result.rows} rowCount={result.rowCount} />
          {cut === 'rows' ? (
            <p className="sql-result__cut" data-testid="sql-result-cut">
              Limited to 10,000 rows. Narrow the query with WHERE, or group it, to see the rest.
            </p>
          ) : cut === 'bytes' ? (
            <p className="sql-result__cut" data-testid="sql-result-cut">
              Limited to 10 MB. Choose fewer or smaller columns to see more rows.
            </p>
          ) : null}
        </div>
      );
    }
    case 'timeout':
    case 'cancelled': {
      const timedOut = result.outcome === 'timeout';
      const label = timedOut
        ? 'Stopped at 30 seconds'
        : result.durationMs === null
          ? 'Cancelled'
          : `Cancelled after ${(result.durationMs / 1000).toFixed(1)} s`;
      // Cube Store can't stop a query: it runs on until its end at the latest,
      // which is said, until it has ended (T548, AC-378; R62).
      // With no end, its router's, it runs to its end (T549).
      const endsBy = result.endsBy ?? null;
      const stillRunning = `${
        endsBy === null
          ? 'Cube Store runs this query to its end; it can’t be stopped.'
          : `Cube Store can’t stop a query, so it is still finishing this one, until ${clock(new Date(endsBy))} at the latest.`
      } Your next run waits until it has ended.`;
      const why =
        result.stillRunning === true
          ? `${timedOut ? 'The run hadn’t finished after 30 seconds' : 'You cancelled the run'}, so wechart stopped waiting for it. ${
              ended
                ? 'Cube Store can’t stop a query, so it finished this one on its own: it has since ended.'
                : stillRunning
            }`
          : onCubeStore
            ? // An xcube that says nothing of its run on (T548's review).
              `${timedOut ? 'The run hadn’t finished after 30 seconds' : 'You cancelled the run'}, so wechart stopped waiting for it. Cube Store can’t stop a query, so it may still be finishing this one.`
            : timedOut
              ? 'The run hadn’t finished after 30 seconds, so it was stopped on the database.'
              : 'You cancelled the run, and it was stopped on the database.';
      const got = result.rows ?? [];
      if (got.length === 0)
        return (
          <div className="sql-result" data-testid="sql-result">
            <Head kind={timedOut ? 'err' : 'idle'} label={label} detail={at} />
            <Note>
              {why} Nothing came back.
              {timedOut ? ' Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.' : ''}
            </Note>
          </div>
        );
      // The rows that came back before the stop, marked cut as the row
      // limit's are (T545, AC-378, AC-379; design 15's Q6, answered R51).
      const rowCount = result.rowCount ?? got.length;
      const rows = rowCount === 1 ? '1 row' : `${count(rowCount)} rows`;
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head kind={timedOut ? 'err' : 'idle'} label={label} detail={`${rows} · ${at}`}>
            <button type="button" className="btn btn-sm" onClick={onDownload}>
              Download CSV · {rows}
            </button>
          </Head>
          <Note>
            {why} These are the {rows} that came back before it was stopped.
          </Note>
          <Grid columns={result.columns ?? []} rows={got} rowCount={rowCount} />
          <p className="sql-result__cut" data-testid="sql-result-cut">
            {timedOut
              ? 'Stopped at 30 seconds. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.'
              : // The limit, and what to do, as the row limit's line says them (T545's review).
                'Cancelled before it finished. Run it again to see every row.'}
          </p>
        </div>
      );
    }
    case 'refused':
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head kind="err" label="Not run" detail={at} />
          {result.routerJoin === true ? (
            // Refused before it ran, which nothing could have stopped (T650, R64).
            <Note>
              {result.error} Join Cube Store’s tables, whose joins its workers run, or read one
              catalog or system table without a join.
            </Note>
          ) : (
            <Note>
              {result.error} {refusalSentence(result, sql, onCubeStore)} Nothing reached{' '}
              {onCubeStore ? 'Cube Store' : 'the database'}.
            </Note>
          )}
        </div>
      );
    case 'failed':
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head
            kind="err"
            label="Database error"
            detail={`${result.durationMs === null ? '' : `${seconds(result.durationMs)} · `}${at}`}
          />
          <pre className="sql-result__error" data-testid="sql-result-error">
            {result.error}
          </pre>
        </div>
      );
    default:
      return (
        <div className="sql-result" data-testid="sql-result">
          {/* xcube away or late, or the answer lost: it may have run (T535's review). */}
          <Head
            kind="err"
            label={result.outcome === 'unavailable' ? 'No answer' : 'Not run'}
            detail={at}
          />
          <Note>{result.error}</Note>
        </div>
      );
  }
}
