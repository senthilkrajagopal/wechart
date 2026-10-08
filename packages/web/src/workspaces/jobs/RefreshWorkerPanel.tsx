import { useEffect, useRef } from 'react';

import { clockOrWhenOf, exactOf } from '../../shell/formatTime';
import { Status } from './StateBadge';

/**
 * The refresh worker's state as xcube reports it (T553, AC-393; design 16,
 * state F and Q4), as `GET /api/jobs/refresh-worker` gives it.
 */
export type RefreshWorkerStatus =
  | { readonly state: 'none' }
  | { readonly state: 'running'; readonly lastRunAt: string }
  | {
      readonly state: 'behind';
      readonly lastRunAt: string;
      readonly revision: number;
      readonly of: number;
    }
  | { readonly state: 'failing'; readonly lastRunAt: string; readonly modules: number };

export interface RefreshWorkerReport {
  readonly status: RefreshWorkerStatus;
  readonly modelRevision: number | null;
  readonly workers: readonly {
    readonly instance: string;
    readonly revision: number;
    readonly lastRunAt: string;
    readonly finished: boolean;
  }[];
  readonly modules: readonly {
    readonly module: string;
    readonly lastRunAt: string;
    readonly lastOkAt: string | null;
    readonly failing: boolean;
    /** A Super-Admin's alone (Q4). */
    readonly error?: string;
  }[];
  /** Whether module errors are given: a Super-Admin's answer. */
  readonly errorsShown: boolean;
}

/**
 * "14:39": a time of day in the badge and the modules' table, with its day
 * where it isn't today's ("Yesterday 14:39"), so an old run isn't read as
 * today's (T477, Q8).
 */
export const minuteOf = (iso: string) => clockOrWhenOf(new Date(iso));
/** "14:39:52", to the second, as the summary and the workers' table say it. */
const lastRunOf = (iso: string) => clockOrWhenOf(new Date(iso), new Date(), { seconds: true });

/** The panel's first line, as F3 says it. */
function summaryOf(status: RefreshWorkerStatus): string {
  switch (status.state) {
    case 'running':
      return `Running · last run ${lastRunOf(status.lastRunAt)}, on the current revision`;
    case 'behind':
      return `Behind · on revision ${String(status.revision)} of ${String(status.of)}, last run ${lastRunOf(status.lastRunAt)}`;
    case 'failing':
      return `${status.modules === 1 ? '1 module’s last run' : `${String(status.modules)} modules’ last runs`} failed · ${minuteOf(status.lastRunAt)}`;
    default:
      return 'No refresh worker has run this model';
  }
}

/**
 * Each worker with its revision and last run, and each module with its last
 * run and state (F2). A module's error to a Super-Admin; a member is told why
 * they can't see it (F3, Q4): a module can hold cubes of several folders.
 * Escape closes it, back to the badge (rule 85).
 */
export function RefreshWorkerPanel({
  id,
  report,
  onClose,
}: {
  readonly id: string;
  readonly report: RefreshWorkerReport;
  readonly onClose: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  // Focus to it as it opens (rule 85), from where Escape closes it.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!(event.target instanceof Node) || section.current?.contains(event.target) !== true)
        return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const failing = report.modules.filter((module) => module.failing);
  return (
    <section ref={section} id={id} className="refresh-worker-panel" aria-label="Refresh worker">
      <header className="refresh-worker-panel__head">
        <h2 ref={heading} tabIndex={-1}>
          Refresh worker
        </h2>
        {report.modelRevision === null ? null : (
          <span className="refresh-worker-panel__revision" data-testid="model-revision">
            Model revision {String(report.modelRevision)}
          </span>
        )}
      </header>
      <p className="refresh-worker-panel__summary" data-testid="refresh-summary">
        {summaryOf(report.status)}
      </p>
      {report.workers.length === 0 ? null : (
        <>
          <h3>Workers</h3>
          <table className="query-log" aria-label="Workers">
            <tbody>
              {report.workers.map((worker) => (
                <tr key={worker.instance}>
                  <td>
                    <code>{worker.instance}</code>
                  </td>
                  <td>revision {String(worker.revision)}</td>
                  <td>
                    last run{' '}
                    <time dateTime={worker.lastRunAt} title={exactOf(new Date(worker.lastRunAt))}>
                      {lastRunOf(worker.lastRunAt)}
                    </time>
                  </td>
                  <td>
                    {/* Its run ended, or stopped waiting on builds still running. */}
                    {worker.finished ? (
                      <Status kind="ok" label="Finished" testId="worker-finished" />
                    ) : (
                      <Status kind="run" label="Waiting on builds" testId="worker-finished" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {report.modules.length === 0 ? null : (
        <>
          <h3>Modules</h3>
          <table className="query-log" aria-label="Modules">
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col">Last run</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {report.modules.map((module) => (
                <tr key={module.module}>
                  <td>
                    <code>{module.module}</code>
                  </td>
                  <td>
                    <time dateTime={module.lastRunAt} title={exactOf(new Date(module.lastRunAt))}>
                      {minuteOf(module.lastRunAt)}
                    </time>
                  </td>
                  <td>
                    {module.failing ? (
                      <Status
                        kind="err"
                        label={`Failing · ${module.lastOkAt === null ? 'never OK' : `OK at ${minuteOf(module.lastOkAt)}`}`}
                        testId="module-state"
                      />
                    ) : (
                      <Status kind="ok" label="OK" testId="module-state" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {failing.length === 0 ? null : report.errorsShown ? (
        failing.map((module) =>
          module.error === undefined ? null : (
            <pre
              key={module.module}
              className="refresh-worker-panel__error"
              data-testid={`module-error-${module.module}`}
            >
              {module.error}
            </pre>
          ),
        )
      ) : (
        <p className="help">
          A module can hold cubes from several folders, so its error can name some you can’t see. A
          Super-Admin can see it.
        </p>
      )}
    </section>
  );
}
