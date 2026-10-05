import { XcubeError } from './client';

/**
 * xcube's build queue and its cancel (T376, AC-151; research
 * `xcube-jobs-schedules-routes.md` §1): admin routes of one model, called
 * only by wechart's server with its service credential. Neither filters by
 * folder: wechart scopes the entries by their pre-aggregations' folders
 * (AC-297).
 *
 * - `GET …/models/{model}/pre-aggregations/queue`: the model's builds queued
 *   or running, oldest first, every data source's, every instance's.
 * - `POST …/pre-aggregations/queue/cancel` `{ keys, processing }`: a queued
 *   entry taken out; a running one refused (`processing`) unless
 *   `processing: true`. Then xcube stops its build and keeps none of it,
 *   answering, after up to 20 s, what came of it, or `finished` where its
 *   version stands (T554; research xcube-74c933bdb8.md, which corrects §1);
 *   a key no longer queued refused (`gone`).
 */
export interface QueueEntry {
  readonly key: string;
  readonly dataSource: string;
  /** Its published name, `cube.pre_aggregation`. */
  readonly preAggregation: string;
  readonly table: string;
  /** The versioned table it builds: a job's `table`. */
  readonly targetTable: string;
  /** From Cube's build range; none for a pre-aggregation that isn't partitioned. */
  readonly partition: { readonly start: string; readonly end: string } | null;
  readonly status: 'queued' | 'processing';
  /** Cube found it stalled or orphaned: it goes at the queue's next reconcile. */
  readonly stalled: boolean;
  readonly addedAt: string;
  /** The `x-request-id` of the jobs post that made it. */
  readonly requestId: string | null;
  readonly startedBy: 'scheduler' | 'jobs' | 'query';
  /** The jobs request's token; none for the refresh worker's builds. */
  readonly job: string | null;
}

/**
 * What came of a building entry's build, taken out with `processing: true`
 * (T554; research xcube-74c933bdb8.md): stopped, none of it kept; failed of
 * its own before the stop took, none of it kept either; or still stopping
 * when xcube's wait ran out, for Cube's jobs API to say later.
 */
export type StoppedBuild = 'stopped' | 'failed' | 'stopping';

export interface CancelAnswer {
  readonly cancelled: readonly string[];
  /** What came of each building one's build, by key; a queued one has none. */
  readonly builds: ReadonlyMap<string, StoppedBuild>;
  /** Not cancelled: `processing`, `gone`, or `finished`, its version standing. */
  readonly notCancelled: readonly { readonly key: string; readonly reason: string }[];
}

export interface XcubeQueue {
  list(): Promise<QueueEntry[]>;
  cancel(
    keys: readonly string[],
    options?: { readonly processing?: boolean },
  ): Promise<CancelAnswer>;
}

const STATUSES = new Set(['queued', 'processing']);
const STARTERS = new Set(['scheduler', 'jobs', 'query']);
/** Past xcube's own wait on a stop's outcome, 20 s (research xcube-74c933bdb8.md). */
const CALL_TIMEOUT_MS = 30_000;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** An entry as xcube gives it, or none for one without what it must have. */
function entryOf(value: unknown): QueueEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const each = value as Record<string, unknown>;
  const key = text(each['key']);
  const preAggregation = text(each['preAggregation']);
  const status = text(each['status']);
  if (key === null || preAggregation === null || status === null || !STATUSES.has(status))
    return undefined;
  const partition = each['partition'] as { start?: unknown; end?: unknown } | null | undefined;
  const startedBy = text(each['startedBy']);
  return {
    key,
    dataSource: text(each['dataSource']) ?? 'default',
    preAggregation,
    table: text(each['table']) ?? '',
    targetTable: text(each['targetTable']) ?? '',
    partition:
      partition !== null &&
      typeof partition === 'object' &&
      typeof partition.start === 'string' &&
      typeof partition.end === 'string'
        ? { start: partition.start, end: partition.end }
        : null,
    status: status as QueueEntry['status'],
    stalled: each['stalled'] === true,
    addedAt: text(each['addedAt']) ?? '',
    requestId: text(each['requestId']),
    startedBy:
      startedBy !== null && STARTERS.has(startedBy)
        ? (startedBy as QueueEntry['startedBy'])
        : 'query',
    job: text(each['job']),
  };
}

export function xcubeQueue({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /** The service credential's token (T420), minted for each call. */
  readonly token: () => Promise<string>;
  readonly fetch?: typeof fetch;
}): XcubeQueue {
  const base = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}/pre-aggregations/queue`;
  const call = async (path: string, init: { method: string; body?: unknown }) => {
    const response = await send(`${base}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${await token()}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = text(answer['code']) ?? undefined;
      throw new XcubeError(
        response.status,
        code,
        `xcube answered ${String(response.status)}: ${text(answer['error']) ?? code ?? 'no reason given'}`,
      );
    }
    return answer;
  };
  return {
    async list() {
      const answer = await call('', { method: 'GET' });
      return (Array.isArray(answer['queue']) ? answer['queue'] : [])
        .map(entryOf)
        .filter((each): each is QueueEntry => each !== undefined);
    },
    async cancel(keys, { processing = false } = {}) {
      const answer = await call('/cancel', { method: 'POST', body: { keys, processing } });
      const taken = Array.isArray(answer['cancelled'])
        ? (answer['cancelled'] as Record<string, unknown>[])
        : [];
      const cancelled = taken
        .map((each) => text(each['key']))
        .filter((key): key is string => key !== null);
      // A word xcube may one day add is read as still stopping, never as stopped.
      const builds = new Map<string, StoppedBuild>(
        taken.flatMap((each) => {
          const key = text(each['key']);
          const build = text(each['build']);
          if (key === null || build === null) return [];
          return [[key, build === 'stopped' || build === 'failed' ? build : 'stopping'] as const];
        }),
      );
      const notCancelled = Array.isArray(answer['notCancelled'])
        ? (answer['notCancelled'] as Record<string, unknown>[]).flatMap((each) => {
            const key = text(each['key']);
            return key === null ? [] : [{ key, reason: text(each['reason']) ?? 'gone' }];
          })
        : [];
      return { cancelled, builds, notCancelled };
    },
  };
}
