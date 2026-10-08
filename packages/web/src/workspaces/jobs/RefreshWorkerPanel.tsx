import { useEffect, useRef, type RefObject } from 'react';

import { clockOrWhenOf, exactOf } from '../../shell/formatTime';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
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

/**
 * F3's first line: the workers' state, "Running · last run 14:39:52, on the
 * current revision", or behind it. While a module fails, xcube's status is
 * the failure's, so the workers' state is read from the workers themselves
 * against the model's revision (J1; T614).
 */
function workerLineOf(report: RefreshWorkerReport): { kind: StateKind; words: string } {
  const { status } = report;
  const behind = (revision: number, of: number, at: string) => ({
    kind: 'warn' as const,
    words: `Behind · on revision ${String(revision)} of ${String(of)}, last run ${lastRunOf(at)}`,
  });
  const running = (at: string) => ({
    kind: 'ok' as const,
    words: `Running · last run ${lastRunOf(at)}, on the current revision`,
  });
  switch (status.state) {
    case 'running':
      return running(status.lastRunAt);
    case 'behind':
      return behind(status.revision, status.of, status.lastRunAt);
    case 'failing': {
      const oldest = Math.min(...report.workers.map((worker) => worker.revision));
      return report.modelRevision !== null &&
        report.workers.length > 0 &&
        oldest < report.modelRevision
        ? behind(oldest, report.modelRevision, status.lastRunAt)
        : running(status.lastRunAt);
    }
    default:
      return { kind: 'idle', words: 'No refresh worker has run this model' };
  }
}

/** F3's second line, while a module fails: "1 module's last run failed · 14:39". */
function failingLineOf(status: RefreshWorkerStatus): string | undefined {
  if (status.state !== 'failing') return undefined;
  return `${status.modules === 1 ? '1 module’s last run' : `${String(status.modules)} modules’ last runs`} failed · ${minuteOf(status.lastRunAt)}`;
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
  opener,
  onClose,
}: {
  readonly id: string;
  readonly report: RefreshWorkerReport;
  /** The badge that opened it: a click there toggles it, not a click elsewhere. */
  readonly opener?: RefObject<HTMLElement | null>;
  /** Closed: by Esc, focus back to the badge; by a click elsewhere, focus where it went (T611). */
  readonly onClose: (back: boolean) => void;
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
      closing.current(true);
    };
    // A popover: a press outside it, and outside its badge, closes it (T611).
    const onPress = (event: PointerEvent | MouseEvent) => {
      const at = event.target;
      if (!(at instanceof Node)) return;
      if (section.current?.contains(at) === true || opener?.current?.contains(at) === true) return;
      closing.current(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPress);
    };
  }, [opener]);
  const failing = report.modules.filter((module) => module.failing);
  const workerLine = workerLineOf(report);
  const failingLine = failingLineOf(report.status);
  return (
    <section
      ref={section}
      id={id}
      className="refresh-worker-panel popover"
      aria-label="Refresh worker"
    >
      <header className="refresh-worker-panel__head">
        <h2 ref={heading} tabIndex={-1}>
          Refresh worker
        </h2>
        {/* A Super-Admin's, as F2 heads it; F3 draws a member's without it (J1). */}
        {!report.errorsShown || report.modelRevision === null ? null : (
          <span className="refresh-worker-panel__revision" data-testid="model-revision">
            Model revision {String(report.modelRevision)}
          </span>
        )}
      </header>
      {/*
        A member's panel is F3's status lines, the help under a failure, and
        no tables; a Super-Admin's is F2's tables with no summary over them,
        save where there is nothing to list (J1, the user's call R76; T614).
      */}
      {!report.errorsShown || (report.workers.length === 0 && report.modules.length === 0) ? (
        <p className="refresh-worker-panel__line" data-testid="refresh-summary">
          <StatusIcon kind={workerLine.kind} />
          <span>{workerLine.words}</span>
        </p>
      ) : null}
      {report.errorsShown || failingLine === undefined ? null : (
        <>
          <p className="refresh-worker-panel__line" data-testid="refresh-failing">
            <StatusIcon kind="err" />
            <span>{failingLine}</span>
          </p>
          <p className="help">
            A module can hold cubes from several folders, so its error can name some you can’t see.
            A Super-Admin can see it.
          </p>
        </>
      )}
      {!report.errorsShown || report.workers.length === 0 ? null : (
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
      {!report.errorsShown || report.modules.length === 0 ? null : (
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
      {!report.errorsShown
        ? null
        : failing.map((module) =>
            module.error === undefined ? null : (
              <pre
                key={module.module}
                className="refresh-worker-panel__error"
                data-testid={`module-error-${module.module}`}
              >
                {module.error}
              </pre>
            ),
          )}
    </section>
  );
}
