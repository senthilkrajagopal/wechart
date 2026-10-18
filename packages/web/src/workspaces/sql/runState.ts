import type { StateKind } from '../../shell/StatusIcon';
import type { TabRun } from './tabs';

/**
 * A run's state as one icon and one label (T804, AC-452; design 17, G and
 * "Every state as an icon and a label"), the same on its tab, in its result
 * head and in its History row, which all ask this.
 */
export interface RunState {
  readonly kind: StateKind;
  readonly label: string;
  /** A finished run's rows, "1,284 rows", which the tab adds to its label (AC-450). */
  readonly rows: string | null;
}

/** R50's time limit, in seconds. */
const LIMIT_S = 30;

const rowsOf = (n: number) => (n === 1 ? '1 row' : `${n.toLocaleString('en')} rows`);
const state = (kind: StateKind, label: string, rows: string | null = null): RunState => ({
  kind,
  label,
  rows,
});

export function runState(
  run: TabRun | null,
  /** Now, in ms since the epoch: a run going counts its seconds to it. */
  now: number = Date.now(),
  /**
   * Whether xcube says the user's last run, stopped, still goes on in Cube
   * Store, which can't stop a query (T548, AC-378): it holds their next.
   */
  stillFinishing = false,
): RunState {
  if (run === null) return state('idle', 'Not run yet');
  if (run.kind === 'running') {
    const seconds = Math.min(LIMIT_S, Math.max(0, Math.floor((now - run.at) / 1000)));
    return state('run', `Running · ${String(seconds)} s of ${String(LIMIT_S)}`);
  }
  const done = run.outcome;
  switch (done.outcome) {
    case 'finished':
      return done.truncated === 'rows'
        ? state('warn', 'Limited to 10,000 rows')
        : done.truncated === 'bytes'
          ? state('warn', 'Limited to 10 MB')
          : state('ok', 'Finished', rowsOf(done.rowCount));
    case 'timeout':
    case 'cancelled':
      if (done.stillRunning === true && stillFinishing) return state('run', 'Cube Store still finishing');
      return done.outcome === 'timeout'
        ? state('err', 'Stopped at 30 seconds')
        : state('cancel', 'Cancelled');
    case 'failed':
      return state('err', 'Database error');
    case 'busy':
      return state('warn', 'Busy');
    case 'unavailable':
      // No answer came, so whether it ran isn't known (lane SQL's call).
      return state('err', 'No answer');
    default:
      // Refused, another run going, or wechart's own refusal: nothing ran.
      return state('err', 'Not run');
  }
}
