/**
 * Loading one tile's data through the wechart API (AC-010, AC-012).
 *
 * Cube answers a query that is still running with HTTP 200 and a body of
 * `{"error":"Continue wait"}` — an error-shaped body that is not an error.
 * Treating the status code as success renders an empty tile; treating the word
 * "error" as failure shows a red tile for a query that is merely slow. So the
 * sentinel is matched explicitly and the request is re-issued until Cube has a
 * result, which is what "keep the request open" means from the tile's side.
 *
 * The request id is minted once and carried across the whole poll, so Cube sees
 * one query rather than a series of them — and so cancelling it (T012) has
 * something to name.
 */

export const CONTINUE_WAIT = 'Continue wait';

const DEFAULT_RETRY_DELAY_MS = 500;
/** Enough for a slow warehouse query; short of hanging a tile forever. */
const DEFAULT_MAX_POLLS = 240;

export class TileLoadError extends Error {
  constructor(
    message: string,
    readonly query: Record<string, unknown>,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TileLoadError';
  }
}

export interface LoadTileOptions {
  readonly query: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly retryDelayMs?: number;
  readonly maxPolls?: number;
  /** Test seam: called after each "Continue wait", before the next request. */
  readonly onPoll?: (attempt: number) => void;
  readonly requestId?: string;
  /**
   * Cube's own cache policy for this query: `no-cache` "Skips refresh key
   * checks. Always returns fresh data", for a tile's "Refresh now" (T154,
   * AC-148; research/cube/refresh-jobs-caching.md). Left out, Cube's default.
   */
  readonly cache?: 'no-cache';
  /**
   * A previewed security context, whose claims the API signs this query with
   * (T172, AC-166). Left out, wechart's own.
   */
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}

export async function loadTile({
  query,
  signal,
  fetchImpl = fetch,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxPolls = DEFAULT_MAX_POLLS,
  onPoll,
  requestId = newRequestId(),
  cache,
  context,
}: LoadTileOptions): Promise<unknown> {
  let started = false;

  /**
   * AC-011: dropping the response is not cancelling. The query keeps running in
   * Cube, holding one of the two default queue slots until its orphan timeout,
   * so a user dragging a filter can starve their own dashboard. `keepalive`
   * lets the cancellation survive a page the browser is tearing down.
   */
  const cancelOnCube = () => {
    if (!started) return;
    void fetchImpl(`/api/running-query/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {
      // Best effort: the tile is already gone, and Cube drops the query at its
      // orphan timeout regardless.
    });
  };

  signal?.addEventListener('abort', cancelOnCube, { once: true });

  try {
    return await poll();
  } finally {
    signal?.removeEventListener('abort', cancelOnCube);
  }

  async function poll(): Promise<unknown> {
    for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
      signal?.throwIfAborted();
      started = true;

      let response: Response;
      try {
        response = await fetchImpl('/api/load', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': requestId },
          body: JSON.stringify({
            query,
            ...(cache === undefined ? {} : { cache }),
            ...(context === undefined ? {} : { context }),
          }),
          ...(signal ? { signal } : {}),
        });
      } catch (failure) {
        // A cancelled request stays a cancellation: the caller asked for it.
        if (signal?.aborted === true) throw failure;
        /**
         * The request never reached the server. Carried as a TileLoadError so
         * the tile can still offer the query that was being asked (AC-042's
         * "error details") — a bare TypeError("Failed to fetch") left the
         * error state with a message and nothing else to look at.
         */
        throw new TileLoadError(
          'Could not reach the server. Check the connection, then retry.',
          query,
        );
      }

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new TileLoadError(errorMessage(body, response.status), query, response.status);
      }

      if (!isContinueWait(body)) return body;

      onPoll?.(attempt);
      signal?.throwIfAborted();
      if (retryDelayMs > 0) await delay(retryDelayMs, signal);
    }

    throw new TileLoadError(
      `Cube is still running this query after ${String(maxPolls)} checks.`,
      query,
    );
  }
}

function isContinueWait(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    (body as { error: unknown }).error === CONTINUE_WAIT
  );
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return `The query failed with status ${String(status)}.`;
}

function newRequestId(): string {
  return `${crypto.randomUUID()}-span-0`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
