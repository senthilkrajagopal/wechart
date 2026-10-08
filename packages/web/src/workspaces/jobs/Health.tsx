import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import { exactOf } from '../../shell/formatTime';
import { minuteOf, RefreshWorkerPanel, type RefreshWorkerReport } from './RefreshWorkerPanel';
import { Status, type StateKind } from './StateBadge';

/**
 * The Cube deployment's health and the refresh worker's state, in the Jobs
 * header (T162, AC-156), as the prototype's badge there ("Refresh worker
 * running"): each an icon and words, never colour alone. Asked again while
 * the page is open, so a deployment that goes down is marked down — the API
 * reads Cube's own probes, and calls anything but their HEALTH down.
 *
 * Where xcube reports the refresh worker (T553, AC-393; design 16, state F),
 * its badge says what xcube says: running with its last run, behind, failing
 * or none; the worker's own probes still say when it is down. The badge
 * opens a panel of each worker and module. A server with no xcube offers no
 * report, and the badge is the probes' alone, as built.
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

/** The badge for what xcube reports (F1); none for a state this page doesn't know. */
function reported(report: RefreshWorkerReport): [StateKind, string] | undefined {
  const status = report.status;
  switch (status.state) {
    case 'running':
      return ['ok', `Refresh worker running · last run ${minuteOf(status.lastRunAt)}`];
    case 'behind':
      return [
        'warn',
        `Refresh worker behind · on revision ${String(status.revision)} of ${String(status.of)}`,
      ];
    case 'failing':
      return [
        'err',
        `Refresh runs failing · ${String(status.modules)} ${status.modules === 1 ? 'module' : 'modules'}`,
      ];
    case 'none':
      return ['off', 'No refresh worker has run this model'];
    default:
      return undefined;
  }
}

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
  // xcube's report, where the server has it; none where it doesn't (404).
  const worker = useQuery({
    queryKey: ['refresh-worker'],
    queryFn: async ({ signal }): Promise<RefreshWorkerReport | null> => {
      const response = await fetch('/api/jobs/refresh-worker', { signal });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(
          `The refresh worker's state could not be read (${String(response.status)}).`,
        );
      return (await response.json()) as RefreshWorkerReport;
    },
    refetchInterval: pollMs,
    refetchOnMount: 'always',
  });
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Not read — asked and not yet answered, or unanswerable — is not healthy;
  // nor is a last answer kept after a later ask failed, nor one naming a
  // state this page does not know (T162's review).
  const known = health.isError ? undefined : health.data;
  const cubeSaid = known === undefined ? undefined : CUBE[known.cube];
  const probesSaid = known === undefined ? undefined : WORKER[known.worker];
  // Asking is under way, drawn so (T183's review); not knowing is a warning.
  const asking = known === undefined && !health.isError;
  const [cubeKind, cubeLabel] =
    cubeSaid ??
    (asking ? (['run', 'Asking Cube…'] as const) : (['warn', 'Cube health unknown'] as const));
  // xcube's report, unless the worker's own probes say it is down (F1). The
  // probes alone only where the server has no report (no xcube): never while
  // the report is asked, or can't be read, which would read running while
  // xcube may say failing (T553's review).
  const report = worker.isError ? undefined : (worker.data ?? undefined);
  const unreported = !worker.isError && worker.data === null;
  const xcubeSaid: readonly [StateKind, string] | undefined =
    known?.worker === 'down'
      ? undefined
      : report !== undefined
        ? reported(report)
        : unreported
          ? undefined
          : worker.isError
            ? ['warn', 'Refresh worker unknown']
            : ['run', 'Asking xcube…'];
  const [workerKind, workerLabel] =
    xcubeSaid ?? probesSaid ?? (['warn', 'Refresh worker unknown'] as const);
  // Its last run's exact time and UTC on hover, where the badge names it (T477, Q9).
  const lastRun =
    xcubeSaid !== undefined && report !== undefined && 'lastRunAt' in report.status
      ? report.status.lastRunAt
      : undefined;
  const badge = (
    <Status
      kind={workerKind}
      label={workerLabel}
      testId="worker-health"
      {...(lastRun === undefined ? {} : { title: `Last run ${exactOf(new Date(lastRun))}` })}
    />
  );
  return (
    <>
      <div className="jobs-health" role="status" aria-label="Cube">
        <Status kind={cubeKind} label={cubeLabel} testId="cube-health" />
        {report === undefined ? (
          badge
        ) : (
          // It opens the panel of each worker and module (F2).
          <button
            ref={opener}
            type="button"
            className="jobs-health__worker"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((was) => !was)}
          >
            {badge}
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
      </div>
      {open && report !== undefined ? (
        <RefreshWorkerPanel
          id={panelId}
          report={report}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
