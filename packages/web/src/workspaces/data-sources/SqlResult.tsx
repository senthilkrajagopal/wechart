import type { ReactNode } from 'react';

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
  | { readonly outcome: 'timeout' | 'cancelled'; readonly durationMs: number | null }
  | {
      readonly outcome: 'refused';
      readonly error: string;
      readonly reason: string;
      readonly statement: string | null;
    }
  | { readonly outcome: 'failed'; readonly error: string; readonly durationMs: number | null }
  /** Not run for a reason of wechart's or xcube's: busy, away, another run going. */
  | { readonly outcome: 'busy' | 'unavailable' | 'going' | 'error'; readonly error: string };

const count = (n: number) => n.toLocaleString('en');
const seconds = (ms: number) =>
  ms < 10 ? 'under 0.01 s' : `${(ms / 1000).toFixed(2).replace(/0$/, '')} s`;
/** A column of numbers, by its database type: right-aligned, in tabular figures (pin 9). */
const NUMERIC =
  /^(int|smallint|bigint|tinyint|mediumint|float|double|real|numeric|decimal|number|money)/i;
const isNumeric = (type: string | null) => type !== null && NUMERIC.test(type);
const clock = (at: Date) =>
  at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const article = (word: string) => (/^[AEIOU]/.test(word) ? 'an' : 'a');

/**
 * The second sentence of a refusal (design 15, E2): what xcube found, in the
 * design's words where the kind says which, else xcube's own.
 */
export function refusalSentence(
  { statement, reason }: { readonly statement: string | null; readonly reason: string },
  sql: string,
): string {
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
    return `This is ${article(kind)} ${kind} statement.`;
  }
  return `wechart couldn’t read it as a SELECT or EXPLAIN: ${reason.replace(/\.$/, '')}.`;
}

function Head({
  kind,
  label,
  detail,
  children,
}: {
  kind: StateKind;
  label: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sql-result__head" data-testid="sql-result-head">
      <span className={`status status--${kind}`}>
        <StatusIcon kind={kind} />
        {label}
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

const Note = ({ children }: { children: ReactNode }) => (
  <p className="sql-result__note" data-testid="sql-result-note">
    {children}
  </p>
);

export function SqlResult({
  result,
  sql,
  startedAt,
  onDownload,
}: {
  result: SqlOutcome;
  /** The SQL it ran, for a refusal's words. */
  sql: string;
  startedAt: Date;
  onDownload: () => void;
}) {
  const at = `at ${clock(startedAt)}`;
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
            detail={`${result.rowCount === 0 ? '' : `${rows} · `}${seconds(result.durationMs)} · ${at}`}
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
          {/* A scrolling box the keyboard must reach, as TableScroll's (WCAG 2.1.1). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="sql-result__scroll" role="region" aria-label="Result rows" tabIndex={0}>
            <table
              className="sql-result__grid"
              aria-label={`Result: ${rows}, ${
                result.columns.length === 1 ? '1 column' : `${count(result.columns.length)} columns`
              }`}
            >
              <thead>
                <tr>
                  <th scope="col" className="sql-result__n">
                    #
                  </th>
                  {result.columns.map((column, index) => (
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
                {result.rows.map((row, at) => (
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
                            isNumeric(result.columns[index]?.type ?? null)
                              ? 'sql-result__num'
                              : undefined
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
            {result.rowCount === 0 ? (
              <p className="sql-result__empty">The query returned no rows.</p>
            ) : null}
          </div>
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
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head kind="err" label="Stopped at 30 seconds" detail={at} />
          <Note>
            The run hadn’t finished after 30 seconds, so it was stopped on the database. Nothing
            came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.
          </Note>
        </div>
      );
    case 'cancelled':
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head
            kind="idle"
            label={
              result.durationMs === null
                ? 'Cancelled'
                : `Cancelled after ${(result.durationMs / 1000).toFixed(1)} s`
            }
            detail={at}
          />
          <Note>You cancelled the run, and it was stopped on the database. Nothing came back.</Note>
        </div>
      );
    case 'refused':
      return (
        <div className="sql-result" data-testid="sql-result">
          <Head kind="err" label="Not run" detail={at} />
          <Note>
            {result.error} {refusalSentence(result, sql)} Nothing reached the database.
          </Note>
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
