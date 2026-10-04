import type { RefreshModule, RefreshWorkerReport } from '../xcube/refresh-worker';

/**
 * The Cube deployment's health and the refresh worker's state (T162, AC-156),
 * from Cube's own probes: `GET /readyz` and `GET /livez`, which need no auth,
 * sit outside the API's base path, and answer `200 {"health":"HEALTH"}` or
 * `500 {"health":"DOWN"}`. The refresh worker, an instance of its own,
 * answers its own (research/cube/refresh-jobs-caching.md §F, "Observed
 * locally"). Healthy only when both probes say so: anything else — a DOWN, an
 * error, no answer in time — is down, so the indicator never stays healthy
 * while Cube reports otherwise.
 */
export type Health = 'healthy' | 'down';

export interface CubeHealth {
  readonly cube: Health;
  /** `unwatched` when wechart is not told where the worker is. */
  readonly worker: Health | 'unwatched';
}

/** Long enough for a busy Cube, short enough that a hung one reads as down. */
const PROBE_TIMEOUT_MS = 3000;

async function probe(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
  try {
    // One deadline for connecting, the answer and its body.
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = (await response.json().catch(() => null)) as { health?: unknown } | null;
    return response.ok && body?.health === 'HEALTH';
  } catch {
    return false;
  }
}

async function instance(base: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Health> {
  const [ready, live] = await Promise.all([
    probe(`${base}/readyz`, fetchImpl, timeoutMs),
    probe(`${base}/livez`, fetchImpl, timeoutMs),
  ]);
  return ready && live ? 'healthy' : 'down';
}

export async function healthOf(
  bases: { cube: string; worker?: string },
  fetchImpl: typeof fetch = fetch,
  /** How long a probe may take before it reads down; shorter in tests. */
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<CubeHealth> {
  const [cube, worker] = await Promise.all([
    instance(bases.cube, fetchImpl, timeoutMs),
    bases.worker === undefined
      ? Promise.resolve('unwatched' as const)
      : instance(bases.worker, fetchImpl, timeoutMs),
  ]);
  return { cube, worker };
}

/**
 * The refresh worker's state as xcube's refresh-worker route reports it
 * (T553, AC-393; design 16, state F; research `xcube-jobs-schedules-routes.md`
 * §3), its last run the latest any worker made:
 * - **none**, when no worker has run the model;
 * - **failing**, while a module's last error is later than its last good run,
 *   with how many modules. Each module is read by its latest run, so a
 *   stopped worker's, listed for a day, or one a restart replaced, counts no
 *   more;
 * - **behind**, while every worker refreshes an older revision than the
 *   model's, with the newest one's;
 * - **running**, otherwise.
 */
export type RefreshWorkerState =
  | { readonly state: 'none' }
  | { readonly state: 'running'; readonly lastRunAt: string }
  | {
      readonly state: 'behind';
      readonly lastRunAt: string;
      readonly revision: number;
      readonly of: number;
    }
  | { readonly state: 'failing'; readonly lastRunAt: string; readonly modules: number };

/** Whether a module's last error is later than its last good run. */
export const moduleFailing = (module: RefreshModule): boolean =>
  module.lastError !== null && (module.lastOkAt === null || module.lastError.at > module.lastOkAt);

/** Each module by its latest run, whichever worker made it. */
export function latestModules(report: RefreshWorkerReport): RefreshModule[] {
  const latest = new Map<string, RefreshModule>();
  for (const worker of report.workers)
    for (const module of worker.modules) {
      const seen = latest.get(module.module);
      if (seen === undefined || module.lastTickAt > seen.lastTickAt)
        latest.set(module.module, module);
    }
  return [...latest.values()];
}

export function refreshWorkerStateOf(report: RefreshWorkerReport): RefreshWorkerState {
  if (report.workers.length === 0) return { state: 'none' };
  const lastRunAt = report.workers
    .map((worker) => worker.lastTickAt)
    .reduce((latest, at) => (at > latest ? at : latest));
  const failing = latestModules(report).filter(moduleFailing).length;
  if (failing > 0) return { state: 'failing', lastRunAt, modules: failing };
  const newest = Math.max(...report.workers.map((worker) => worker.revision));
  if (report.revision !== null && newest < report.revision)
    return { state: 'behind', lastRunAt, revision: newest, of: report.revision };
  return { state: 'running', lastRunAt };
}

/** The Cube API's origin: its probes are not under the API's base path. */
export function originOf(url: string): string {
  return new URL(url).origin;
}
