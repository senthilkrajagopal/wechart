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

async function probe(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const body = (await response.json().catch(() => null)) as { health?: unknown } | null;
    return response.ok && body?.health === 'HEALTH';
  } catch {
    return false;
  }
}

async function instance(base: string, fetchImpl: typeof fetch): Promise<Health> {
  const [ready, live] = await Promise.all([
    probe(`${base}/readyz`, fetchImpl),
    probe(`${base}/livez`, fetchImpl),
  ]);
  return ready && live ? 'healthy' : 'down';
}

export async function healthOf(
  bases: { cube: string; worker?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CubeHealth> {
  const [cube, worker] = await Promise.all([
    instance(bases.cube, fetchImpl),
    bases.worker === undefined
      ? Promise.resolve('unwatched' as const)
      : instance(bases.worker, fetchImpl),
  ]);
  return { cube, worker };
}

/** The Cube API's origin: its probes are not under the API's base path. */
export function originOf(url: string): string {
  return new URL(url).origin;
}
