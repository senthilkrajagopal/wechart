import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

import { clockOf } from '../../shell/formatTime';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { OwnerIcon } from '../schedules/OwnerLabel';

/**
 * Design 16's states of a list on Jobs' tabs and Schedules (T560, AC-399;
 * state G): loading as skeleton rows (G1); an error with Retry and Details
 * (G2, rule 18); a refusal in the API's words (G4); empty in the user's
 * folders (G3); and the words said when access is lost while the page is
 * open (G5). Each tab says them in its own words.
 */

/**
 * A list's read that failed, with its status: a refusal (403) is said in the
 * API's words. What Details shows comes with it, as G2 draws it — the status
 * and its text, the ask, and when it failed (T560's review).
 */
export class ReadError extends Error {
  /** When it failed. */
  readonly at = new Date();
  constructor(
    message: string,
    readonly status: number,
    readonly statusText = '',
    /** What was asked: "GET /api/preaggregations". */
    readonly asked = '',
  ) {
    super(message);
  }
}

/** The error of a list's answer: the API's words where it gives some, else `fallback`. */
export async function readErrorOf(
  response: Response,
  fallback: string,
  /** What was asked, for Details: "GET /api/preaggregations"; else the answer's own address. */
  asked = response.url === '' ? '' : `GET ${new URL(response.url).pathname}`,
): Promise<ReadError> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return new ReadError(
    typeof said === 'string' ? said : `${fallback} (${String(response.status)}).`,
    response.status,
    response.statusText,
    asked,
  );
}

/** G2's Details: "502 Bad Gateway · GET /api/preaggregations · 14:40:02". */
export function detailsOf(error: Error): string {
  if (!(error instanceof ReadError)) return error.message;
  const time = clockOf(error.at, { seconds: true });
  return [`${String(error.status)} ${error.statusText}`.trim(), error.asked, time]
    .filter((part) => part !== '')
    .join(' · ');
}

/** An action the API refused (403): access lost while the page was open, or never there. */
export const isRefused = (error: unknown): boolean =>
  error instanceof ReadError && error.status === 403;

/** G5's toast: said when an action finds access lost (design 16, state G5). */
export const ACCESS_LOST = 'You no longer have access to do this.';

/**
 * G1: skeleton rows under the list's own column heads (T610), and what is
 * being read. The heads that the list drops below 1,024 px are dropped here
 * too (`narrow`, G8).
 */
export function ListLoading({
  said,
  label,
  columns,
  narrow = [],
}: {
  readonly said: string;
  /** The list's name: "Pre-aggregations". */
  readonly label: string;
  readonly columns: readonly string[];
  /** Those of the columns the list hides below 1,024 px. */
  readonly narrow?: readonly string[];
}) {
  const wide = (column: string) => (narrow.includes(column) ? 'jobs-wide' : undefined);
  return (
    <div className="jobs-loading">
      <table
        className="query-log jobs-skeleton"
        aria-label={`${label}, being read`}
        aria-busy="true"
        data-testid="skeleton-table"
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className={wide(column)}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-hidden="true" data-testid="skeleton-rows">
          {[0, 1, 2, 3, 4].map((row) => (
            <tr key={row}>
              {columns.map((column) => (
                <td key={column} className={wide(column)}>
                  <span className="jobs-skeleton__bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <StateLine kind="run" testId="reading">
        {said}
      </StateLine>
    </div>
  );
}

/**
 * G5b: one whose last read-write folder went while the page was open,
 * found when a list is read again (T610; design 16, state G5b): the page is
 * for read-write members, and their dashboards are in Explore.
 */
export function NoFolderLeft({ page }: { readonly page: 'Jobs' | 'Schedules' }) {
  return (
    <div className="run-history__empty jobs-no-folder" data-testid="no-folder-left">
      <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" data-icon="lock">
        <rect x="3" y="7" width="10" height="7" rx="1.2" fill="none" stroke="currentColor" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" />
      </svg>
      <b>{`${page} is for read-write members of a folder`}</b>
      <span>
        You no longer have read-write access to any folder, so there’s nothing here for you. Your
        dashboards are in Explore.
      </span>
      <a className="btn btn-sm" href="/explore">
        Open Explore
      </a>
    </div>
  );
}

/**
 * Whether a list's read was refused after it had been read (T610, G5b):
 * the API refuses every Jobs list to one who writes no folder (T371), so a
 * refusal of a list once read is the last read-write folder gone.
 */
export const noFolderLeft = (query: {
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: unknown;
}): boolean => query.isError && isRefused(query.error) && query.data !== undefined;

/**
 * Whether any of a page's lists, those `isList` names by key, was refused
 * after it had been read: G5b said for the page, as design 16 draws it,
 * over every tab, a tab never opened included (T610's review). Each list's
 * read is watched in the query cache (docs/research/tanstack-query-cache.md);
 * only a refusal since the page opened counts, so one kept from an earlier
 * visit doesn't say it again once access is back.
 */
export function useNoFolderLeft(isList: (key: QueryKey) => boolean): boolean {
  const cache = useQueryClient().getQueryCache();
  const [opened] = useState(() => Date.now());
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache]);
  return useSyncExternalStore(subscribe, () =>
    cache
      .getAll()
      .some(
        ({ queryKey, state }) =>
          isList(queryKey) &&
          state.errorUpdatedAt >= opened &&
          noFolderLeft({ isError: state.status === 'error', error: state.error, data: state.data }),
      ),
  );
}

/**
 * G2: the list couldn't be read, with Retry and Details (rule 18); G4: a
 * refusal, in the API's words, with no Retry, since asking again changes
 * nothing.
 */
export function ListError({
  what,
  error,
  carryOn,
  onRetry,
}: {
  /** "the pre-aggregations": what couldn't be read. */
  readonly what: string;
  readonly error: Error;
  /** What still goes on meanwhile, in the tab's words. */
  readonly carryOn?: string;
  readonly onRetry: () => void;
}) {
  if (isRefused(error)) return <StateLine kind="err">{error.message}</StateLine>;
  // Three lines, as G2 draws them: the error, what it means, then Retry and Details (T612).
  return (
    <div className="jobs-error" role="alert">
      <p className="state-line">
        <StatusIcon kind="err" />
        <span data-testid="read-error">{`Couldn’t read ${what}.`}</span>
      </p>
      <p className="help">
        {error.message}
        {carryOn === undefined ? null : ` ${carryOn}`}
      </p>
      <div className="jobs-error__actions">
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
        <details>
          <summary>Details</summary>
          <code data-testid="read-details">{detailsOf(error)}</code>
        </details>
      </div>
    </div>
  );
}

/** G3: nothing in the user's folders, in the tab's words. */
export function ListEmpty({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="run-history__empty" data-testid="list-empty">
      {/* Every message an icon and a label (G intro): the pre-aggregation's cube (G3). */}
      <OwnerIcon owner="cube" />
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}
