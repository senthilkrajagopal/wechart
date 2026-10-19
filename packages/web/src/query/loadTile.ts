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

import { calculatedAnswer, joinAnswers, splitCalculations } from './calculations';
import { forItem, type QueryItem } from './item';

export const CONTINUE_WAIT = 'Continue wait';

const DEFAULT_RETRY_DELAY_MS = 500;
/** Enough for a slow warehouse query; short of hanging a tile forever. */
const DEFAULT_MAX_POLLS = 240;

/**
 * An API replica or a Cube instance going away (T422, AC-319): a lost socket,
 * or 502, 503 or 504 from the API. The same query is asked again until one
 * answers or the outage outlasts its budget; Cube's queue joins it to the one
 * already running, by the query's own key (research/cube/ha-topology.md §1).
 * While a stalled query waits to be released, the surviving instance answers
 * "Continue wait", which the poll limit bounds, so the budget only covers the
 * spell when nothing answers at all: a replica's endpoints moving, a pod
 * restarting.
 */
const OUTAGE_STATUSES = new Set([502, 503, 504]);
const DEFAULT_OUTAGE_DELAY_MS = 1_000;
const DEFAULT_OUTAGE_BUDGET_MS = 90_000;

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
  /** Between asks while the API or Cube is away (T422). */
  readonly outageDelayMs?: number;
  /** How long an outage is waited out before the tile reports it (T422). */
  readonly outageBudgetMs?: number;
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
  /** The item the query serves, which the API checks before Cube is asked (T340, AC-268). */
  readonly item?: QueryItem | undefined;
}

/**
 * How long each answer took, from the first ask to the answer, its polls
 * included (T681; design 04 note 4's "· 42 ms ·"). Kept beside the answer,
 * not in it, so Cube's answer reaches everything that reads it unchanged.
 */
const elapsed = new WeakMap<object, number>();

/** How long `loadTile` took to get this answer, in whole ms; unknown for any other. */
export function elapsedOf(result: unknown): number | undefined {
  return typeof result === 'object' && result !== null ? elapsed.get(result) : undefined;
}

export async function loadTile(options: LoadTileOptions): Promise<unknown> {
  const began = performance.now();
  const answer = await loadAnswer(options);
  if (typeof answer === 'object' && answer !== null)
    elapsed.set(answer, Math.round(performance.now() - began));
  return answer;
}

async function loadAnswer(options: LoadTileOptions): Promise<unknown> {
  /**
   * Quick calculations (AC-048): a running total over a range and another
   * calculation over time can't share a query in xcube, so they are asked
   * apart, each as any query is, and their rows joined (`calculations.ts`).
   * Each part is its own request, with its own id to cancel by.
   */
  const parts = splitCalculations(options.query);
  if (parts.length > 1) {
    const { requestId: _one, ...each } = options;
    void _one;
    const answers = await Promise.all(parts.map((query) => loadOne({ ...each, query })));
    return joinAnswers(answers, options.query);
  }
  return loadOne(options);
}

/**
 * One query asked through the API, and its answer, each quick calculation's
 * column read under its measure's name (AC-048).
 */
async function loadOne({
  query,
  signal,
  fetchImpl = fetch,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxPolls = DEFAULT_MAX_POLLS,
  outageDelayMs = DEFAULT_OUTAGE_DELAY_MS,
  outageBudgetMs = DEFAULT_OUTAGE_BUDGET_MS,
  onPoll,
  requestId = newRequestId(),
  cache,
  context,
  item,
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
    return calculatedAnswer(oneAnswer(await poll()), query);
  } finally {
    signal?.removeEventListener('abort', cancelOnCube);
  }

  async function poll(): Promise<unknown> {
    let polls = 0;
    /** When the current outage began, if one is under way. */
    let outageSince: number | undefined;
    for (;;) {
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
            ...forItem(item),
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
        await waitOutOutage(
          new TileLoadError('Could not reach the server. Check the connection, then retry.', query),
        );
        continue;
      }

      const body: unknown = await response.json().catch(() => null);

      if (OUTAGE_STATUSES.has(response.status)) {
        await waitOutOutage(
          new TileLoadError(errorMessage(body, response.status), query, response.status),
        );
        continue;
      }
      outageSince = undefined;

      if (!response.ok) {
        throw new TileLoadError(errorMessage(body, response.status), query, response.status);
      }

      if (!isContinueWait(body)) return body;

      polls += 1;
      onPoll?.(polls);
      signal?.throwIfAborted();
      if (polls >= maxPolls) {
        throw new TileLoadError(
          `Cube is still running this query after ${String(maxPolls)} checks.`,
          query,
        );
      }
      if (retryDelayMs > 0) await delay(retryDelayMs, signal);
    }

    /** Waits to ask again, or throws what the outage left once it outlasts its budget. */
    async function waitOutOutage(failure: TileLoadError): Promise<void> {
      outageSince ??= Date.now();
      if (Date.now() - outageSince >= outageBudgetMs) throw failure;
      signal?.throwIfAborted();
      if (outageDelayMs > 0) await delay(outageDelayMs, signal);
    }
  }
}

/**
 * A `compareDateRange` answer — one result per period, in order (a KPI's
 * comparison, T937; research/cube/data-apis.md, "compareDateRange, end to
 * end") — as one answer: every result's rows in order, each tagged by Cube
 * with its period, under the first result's facts. Any other answer as it is.
 */
function oneAnswer(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('results' in body)) return body;
  const results = (body as { results: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return body;
  const each = results as readonly { readonly data?: unknown }[];
  const first = each[0] as Record<string, unknown>;
  return {
    ...first,
    data: each.flatMap((result) => (Array.isArray(result.data) ? (result.data as unknown[]) : [])),
  };
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
