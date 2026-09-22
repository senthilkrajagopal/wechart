import { useQuery } from '@tanstack/react-query';

import { Status, type StateKind } from './StateBadge';

/**
 * The Cube deployment's health and the refresh worker's state, in the Jobs
 * header (T162, AC-156), as the prototype's badge there ("Refresh worker
 * running"): each an icon and words, never colour alone. Asked again while
 * the page is open, so a deployment that goes down is marked down — the API
 * reads Cube's own probes, and calls anything but their HEALTH down.
 */
interface CubeHealth {
  readonly cube: 'healthy' | 'down';
  readonly worker: 'healthy' | 'down' | 'unwatched';
}

const CUBE: Record<CubeHealth['cube'], [StateKind, string]> = {
  healthy: ['ok', 'Cube healthy'],
  down: ['err', 'Cube down'],
};

const WORKER: Record<CubeHealth['worker'], [StateKind, string]> = {
  healthy: ['ok', 'Refresh worker running'],
  down: ['err', 'Refresh worker down'],
  unwatched: ['warn', 'Refresh worker not watched'],
};

export function Health({ pollMs = 10_000 }: { pollMs?: number }) {
  const health = useQuery({
    queryKey: ['cube-health'],
    queryFn: async ({ signal }): Promise<CubeHealth> => {
      const response = await fetch('/api/cube-health', { signal });
      if (!response.ok)
        throw new Error(`Cube's health could not be read (${String(response.status)}).`);
      return (await response.json()) as CubeHealth;
    },
    refetchInterval: pollMs,
    refetchOnMount: 'always',
  });

  // Not read — asked and not yet answered, or unanswerable — is not healthy;
  // nor is a last answer kept after a later ask failed.
  const known = health.isError ? undefined : health.data;
  const [cubeKind, cubeLabel] =
    known === undefined
      ? (['warn', health.isError ? 'Cube health unknown' : 'Asking Cube…'] as const)
      : CUBE[known.cube];
  const [workerKind, workerLabel] =
    known === undefined ? (['warn', 'Refresh worker unknown'] as const) : WORKER[known.worker];
  return (
    <div className="jobs-health" role="status" aria-label="Cube">
      <Status kind={cubeKind} label={cubeLabel} testId="cube-health" />
      <Status kind={workerKind} label={workerLabel} testId="worker-health" />
    </div>
  );
}
