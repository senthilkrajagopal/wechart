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
 *   with how many modules. Its last error is the latest any worker had, a
 *   stopped one's too, listed for a day; its last good run only one by a
 *   worker on the model's current revision. So an error counts until a
 *   worker on the current revision has had a good run of that module after
 *   it (the coordinator's rule of 2026-10-05, until the user says otherwise);
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

/** A module across every worker that has run it. */
export interface ModuleState {
  readonly module: string;
  /** The latest run any worker made of it. */
  readonly lastRunAt: string;
  /** The latest good run of it by a worker on the model's current revision; none yet. */
  readonly lastOkAt: string | null;
  /** The latest error any worker had with it; none. */
  readonly lastError: RefreshModule['lastError'];
  /** Its last error is later than that good run, or there's been none since. */
  readonly failing: boolean;
}

const later = (a: string | null, b: string | null) => (b !== null && (a === null || b > a) ? b : a);

/** Each module across every worker, by the rule above. */
export function moduleStatesOf(report: RefreshWorkerReport): ModuleState[] {
  const states = new Map<
    string,
    { lastRunAt: string; lastOkAt: string | null; lastError: RefreshModule['lastError'] }
  >();
  for (const worker of report.workers)
    for (const module of worker.modules) {
      const was = states.get(module.module);
      // A good run counts only on the model's current revision (none known: any).
      const current = report.revision === null || worker.revision === report.revision;
      states.set(module.module, {
        lastRunAt: later(was?.lastRunAt ?? null, module.lastTickAt) ?? module.lastTickAt,
        lastOkAt: current ? later(was?.lastOkAt ?? null, module.lastOkAt) : (was?.lastOkAt ?? null),
        lastError:
          module.lastError !== null &&
          (was?.lastError == null || module.lastError.at > was.lastError.at)
            ? module.lastError
            : (was?.lastError ?? null),
      });
    }
  return [...states].map(([module, state]) => ({
    module,
    ...state,
    failing:
      state.lastError !== null && (state.lastOkAt === null || state.lastError.at > state.lastOkAt),
  }));
}

export function refreshWorkerStateOf(report: RefreshWorkerReport): RefreshWorkerState {
  if (report.workers.length === 0) return { state: 'none' };
  const lastRunAt = report.workers
    .map((worker) => worker.lastTickAt)
    .reduce((latest, at) => (at > latest ? at : latest));
  const failing = moduleStatesOf(report).filter((module) => module.failing).length;
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
