import type { ReactNode } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';

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
  const time = error.at.toTimeString().slice(0, 8);
  return [`${String(error.status)} ${error.statusText}`.trim(), error.asked, time]
    .filter((part) => part !== '')
    .join(' · ');
}

/** An action the API refused (403): access lost while the page was open, or never there. */
export const isRefused = (error: unknown): boolean =>
  error instanceof ReadError && error.status === 403;

/** G5's toast: said when an action finds access lost (design 16, state G5). */
export const ACCESS_LOST = 'You no longer have access to do this.';

/** G1: skeleton rows under the list's place, and what is being read. */
export function ListLoading({ said }: { readonly said: string }) {
  return (
    <div className="jobs-loading">
      <div className="jobs-skeleton" aria-hidden="true" data-testid="skeleton-rows">
        {[0, 1, 2, 3, 4].map((row) => (
          <span key={row} />
        ))}
      </div>
      <StateLine kind="run" testId="reading">
        {said}
      </StateLine>
    </div>
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
  return (
    <div className="notebar notebar--err jobs-error" role="alert">
      <StatusIcon kind="err" />
      <div>
        <p>
          <b data-testid="read-error">{`Couldn’t read ${what}.`}</b> <span>{error.message}</span>
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
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}
