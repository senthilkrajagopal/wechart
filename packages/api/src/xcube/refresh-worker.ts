import { XcubeError } from './client';

/**
 * xcube's refresh-worker route (T553, AC-393; research
 * `xcube-jobs-schedules-routes.md` §3): an admin route of one model, called
 * only by wechart's server with its service credential. It gives the model's
 * current revision and each worker that has refreshed it: the revision that
 * worker last refreshed, when it last ran, and each module's last run, last
 * good run and last error. A stopped worker stays listed for a day; each
 * restart is another instance; a model no worker has refreshed has none.
 */
export interface RefreshModule {
  /** `all` for a model served whole. */
  readonly module: string;
  readonly revision: number;
  readonly lastTickAt: string;
  /** The run ended, rather than stopped waiting on builds still running. */
  readonly finished: boolean;
  readonly lastOkAt: string | null;
  /** Cube's "Refresh Scheduler Error": a compile, or a refresh key's query. */
  readonly lastError: { readonly message: string; readonly at: string } | null;
}

export interface RefreshWorker {
  readonly instance: string;
  /** The model's revision it last refreshed. */
  readonly revision: number;
  readonly servedKey: string;
  readonly lastTickAt: string;
  readonly modules: readonly RefreshModule[];
}

export interface RefreshWorkerReport {
  /** The model's current revision; none where xcube gives none. */
  readonly revision: number | null;
  readonly workers: readonly RefreshWorker[];
}

export interface XcubeRefreshWorker {
  read(): Promise<RefreshWorkerReport>;
}

const CALL_TIMEOUT_MS = 30_000;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/** A module as xcube gives it, or none for one without what it must have. */
function moduleOf(value: unknown): RefreshModule | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const each = value as Record<string, unknown>;
  const module = text(each['module']);
  const revision = count(each['revision']);
  const lastTickAt = text(each['lastTickAt']);
  if (module === null || revision === null || lastTickAt === null) return undefined;
  const error = each['lastError'] as { message?: unknown; at?: unknown } | null | undefined;
  return {
    module,
    revision,
    lastTickAt,
    finished: each['finished'] === true,
    lastOkAt: text(each['lastOkAt']),
    lastError:
      error !== null &&
      typeof error === 'object' &&
      typeof error.message === 'string' &&
      typeof error.at === 'string'
        ? { message: error.message, at: error.at }
        : null,
  };
}

/** A worker as xcube gives it, or none for one without what it must have. */
function workerOf(value: unknown): RefreshWorker | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const each = value as Record<string, unknown>;
  const instance = text(each['instance']);
  const revision = count(each['revision']);
  const lastTickAt = text(each['lastTickAt']);
  if (instance === null || revision === null || lastTickAt === null) return undefined;
  return {
    instance,
    revision,
    servedKey: text(each['servedKey']) ?? '',
    lastTickAt,
    modules: (Array.isArray(each['modules']) ? each['modules'] : [])
      .map(moduleOf)
      .filter((module): module is RefreshModule => module !== undefined),
  };
}

export function xcubeRefreshWorker({
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
}): XcubeRefreshWorker {
  const url = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}/refresh-worker`;
  return {
    async read() {
      const response = await send(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${await token()}` },
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
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
      return {
        revision: count(answer['revision']),
        workers: (Array.isArray(answer['workers']) ? answer['workers'] : [])
          .map(workerOf)
          .filter((worker): worker is RefreshWorker => worker !== undefined),
      };
    },
  };
}
