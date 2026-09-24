import { useId, useRef } from 'react';

import { Status } from './StateBadge';

/**
 * The query records in the Jobs workspace (AC-016), narrowed, sorted and
 * paged (AC-230): by outcome, source and time range, by when or how long, a
 * page of rows at a time under a header that stays in view.
 *
 * The log itself is narrowed, sorted and counted by the API, over all of it
 * (T240's review): filtering the latest hundred here found no failure older
 * than those hundred, and counted the window rather than the log. This shows
 * the page it is given and says what to ask for next.
 *
 * Failed queries are listed alongside successful ones: a query that ran for
 * four seconds and then errored is what someone opens this list to find.
 */
export interface QueryRecord {
  readonly id: number;
  readonly requestId: string;
  readonly query: Record<string, unknown>;
  readonly durationMs: number;
  readonly accelerated: boolean;
  readonly preAggregation?: string | null;
  readonly error?: string | null;
  readonly createdAt: string;
}

type Outcome = 'all' | 'succeeded' | 'failed';
type Source = 'all' | 'live' | 'accelerated';
type Range = 'all' | 'hour' | 'day' | 'week';
type SortKey = 'when' | 'duration';

/** Which page of the log is shown, and how it is narrowed and sorted. */
export interface QueryLogAsk {
  readonly outcome: Outcome;
  readonly source: Source;
  readonly range: Range;
  readonly sort: SortKey;
  readonly descending: boolean;
  /** From 0. */
  readonly page: number;
}

/** The whole log, newest first, as it opens. */
export const FIRST_ASK: QueryLogAsk = {
  outcome: 'all',
  source: 'all',
  range: 'all',
  sort: 'when',
  descending: true,
  page: 0,
};

/** Rows on a page (AC-230): never more than this at once. */
export const QUERY_LOG_PAGE = 25;

/** The API's query string for an ask (`GET /api/jobs/queries/page`). */
export function queryStringOf(ask: QueryLogAsk): string {
  const params = new URLSearchParams();
  if (ask.outcome !== 'all') params.set('outcome', ask.outcome);
  if (ask.source !== 'all') params.set('source', ask.source);
  if (ask.range !== 'all') params.set('within', ask.range);
  params.set('sort', ask.sort);
  params.set('order', ask.descending ? 'desc' : 'asc');
  params.set('offset', String(ask.page * QUERY_LOG_PAGE));
  params.set('limit', String(QUERY_LOG_PAGE));
  return params.toString();
}

export interface QueryLogProps {
  /** The page asked for. */
  readonly records: readonly QueryRecord[];
  /** How many records match over the whole log; those given, where not said. */
  readonly total?: number;
  readonly ask?: QueryLogAsk;
  readonly onAsk?: (ask: QueryLogAsk) => void;
}

export function QueryLog({
  records,
  total = records.length,
  ask = FIRST_ASK,
  onAsk = () => undefined,
}: QueryLogProps) {
  const base = useId();
  const view = useRef<HTMLDivElement | null>(null);
  const narrowed = ask.outcome !== 'all' || ask.source !== 'all' || ask.range !== 'all';

  if (total === 0 && !narrowed) {
    return (
      <p className="query-log__empty">No queries yet. Open a dashboard and they appear here.</p>
    );
  }

  const pages = Math.max(1, Math.ceil(total / QUERY_LOG_PAGE));
  const at = Math.min(ask.page, pages - 1);
  /** A filter or the order changed: back to the first page. */
  const narrow = (change: Partial<QueryLogAsk>) => onAsk({ ...ask, ...change, page: 0 });
  const sortBy = (key: SortKey) =>
    narrow(ask.sort === key ? { descending: !ask.descending } : { sort: key, descending: true });
  const ariaSort = (key: SortKey) =>
    ask.sort === key ? (ask.descending ? 'descending' : 'ascending') : 'none';
  /**
   * Another page, from its first row: the window is scrolled back to the top
   * of the log rather than left at the foot of the new page. The buttons stay
   * focusable at either end, so focus is not dropped to the page.
   */
  const turn = (to: number) => {
    if (to < 0 || to > pages - 1) return;
    onAsk({ ...ask, page: to });
    view.current?.scrollIntoView?.({ block: 'start' });
  };

  return (
    <div className="query-log-view" ref={view}>
      {/* The prototype's filter row: three small selects (AC-230). */}
      <div className="query-log__filters">
        <label htmlFor={`${base}-outcome`}>Outcome</label>
        <select
          id={`${base}-outcome`}
          className="select-sm"
          value={ask.outcome}
          onChange={(event) => narrow({ outcome: event.target.value as Outcome })}
        >
          <option value="all">Any outcome</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
        <label htmlFor={`${base}-source`}>Source</label>
        <select
          id={`${base}-source`}
          className="select-sm"
          value={ask.source}
          onChange={(event) => narrow({ source: event.target.value as Source })}
        >
          <option value="all">Any source</option>
          <option value="live">Live</option>
          <option value="accelerated">Accelerated</option>
        </select>
        <label htmlFor={`${base}-range`}>Time range</label>
        <select
          id={`${base}-range`}
          className="select-sm"
          value={ask.range}
          onChange={(event) => narrow({ range: event.target.value as Range })}
        >
          <option value="all">Any time</option>
          <option value="hour">Last hour</option>
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
        </select>
      </div>

      {records.length === 0 ? (
        <p className="query-log__empty">No query matches these filters.</p>
      ) : (
        <table className="query-log query-log--sticky">
          {/* Saying the order it is in, which the headers change. */}
          <caption>Queries wechart has issued, {orderOf(ask)}</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort('when')}>
                <button type="button" className="sort-button" onClick={() => sortBy('when')}>
                  When
                  <span aria-hidden="true">{arrowOf(ask, 'when')}</span>
                </button>
              </th>
              <th scope="col">Query</th>
              <th scope="col" aria-sort={ariaSort('duration')}>
                <button type="button" className="sort-button" onClick={() => sortBy('duration')}>
                  Duration
                  <span aria-hidden="true">{arrowOf(ask, 'duration')}</span>
                </button>
              </th>
              <th scope="col">Source</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  <time dateTime={record.createdAt}>
                    {new Date(record.createdAt).toLocaleString()}
                  </time>
                </td>
                <td>
                  <details>
                    <summary>{summarise(record.query)}</summary>
                    <pre>{JSON.stringify(record.query, null, 2)}</pre>
                  </details>
                </td>
                <td data-testid={`duration-${String(record.id)}`}>
                  {formatDuration(record.durationMs)}
                </td>
                <td>
                  {/* Icon plus label, never colour alone (direction.md rule 3). */}
                  <span data-icon={record.accelerated ? 'accelerated' : 'live'} aria-hidden="true">
                    {record.accelerated ? '⚡' : '●'}
                  </span>{' '}
                  {record.accelerated ? (record.preAggregation ?? 'Accelerated') : 'Live'}
                </td>
                <td className="query-log__outcome">
                  {/* An icon and words either way (T158, AC-152). */}
                  {record.error ? (
                    <Status
                      kind="err"
                      label={`Failed: ${record.error}`}
                      testId={`query-outcome-${String(record.id)}`}
                    />
                  ) : (
                    <Status
                      kind="ok"
                      label="Succeeded"
                      testId={`query-outcome-${String(record.id)}`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {total === 0 ? null : (
        <div className="query-log__pager">
          {/* Heard as it changes, with a page or a filter (T240's review). */}
          <span data-testid="query-log-range" aria-live="polite">
            {at * QUERY_LOG_PAGE + 1}–{at * QUERY_LOG_PAGE + records.length} of {total}
          </span>
          <button
            type="button"
            className="btn-sm"
            aria-label="Previous page"
            aria-disabled={at === 0}
            onClick={() => turn(at - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn-sm"
            aria-label="Next page"
            aria-disabled={at >= pages - 1}
            onClick={() => turn(at + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function orderOf(ask: QueryLogAsk): string {
  if (ask.sort === 'when') return ask.descending ? 'newest first' : 'oldest first';
  return ask.descending ? 'longest first' : 'shortest first';
}

function arrowOf(ask: QueryLogAsk, key: SortKey): string {
  if (ask.sort !== key) return '';
  return ask.descending ? ' ↓' : ' ↑';
}

function summarise(query: Record<string, unknown>): string {
  const measures = asNames(query['measures']);
  const dimensions = asNames(query['dimensions']);
  const parts = [...measures, ...dimensions];
  return parts.length > 0 ? parts.join(', ') : 'Query';
}

function asNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${String(Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}
