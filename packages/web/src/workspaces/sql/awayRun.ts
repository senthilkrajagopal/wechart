import type { SqlOutcome } from '../data-sources/SqlResult';
import type { SqlTab } from './tabs';

/**
 * A run that ended while the user was away from the workspace (T804,
 * AC-452). Leaving loads another page, so its answer came to none: how it
 * ended is read from the user's History (`GET /api/sql-runs`), which keeps
 * its outcome, rows counted and time, but not its rows.
 */
interface PastRun {
  readonly sql: string;
  readonly startedAt: string;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly truncated: 'rows' | 'bytes' | null;
  readonly statement: string | null;
}

/** How far this browser's clock may be from wechart's server's, to know the run again. */
const SKEW_MS = 5 * 60_000;

/** What xcube says of the user's last run, stopped, which Cube Store runs on (T548). */
export type Finishing = { readonly endsBy: string | null } | null;

/** A History row's ending, as a result's outcome with no rows. */
export function outcomeOf(row: PastRun, finishing: Finishing): SqlOutcome {
  switch (row.outcome) {
    case 'finished':
      return {
        outcome: 'finished',
        columns: [],
        rows: [],
        rowCount: row.rowCount ?? 0,
        truncated: row.truncated,
        durationMs: row.durationMs ?? 0,
        statement: row.statement === 'explain' ? 'explain' : 'select',
      };
    case 'timeout':
    case 'cancelled':
      return {
        outcome: row.outcome,
        durationMs: row.durationMs,
        ...(row.rowCount === null ? {} : { rowCount: row.rowCount }),
        // History keeps no run on; xcube's word now does (T804's review).
        ...(finishing === null ? {} : { stillRunning: true as const, endsBy: finishing.endsBy }),
      };
    case 'refused':
      return { outcome: 'refused', error: '', reason: '', statement: row.statement };
    case 'failed':
      return { outcome: 'failed', error: '', durationMs: row.durationMs };
    case 'busy':
      return { outcome: 'busy', error: '' };
    default:
      // Lost, or not answered: whether it ran isn't known.
      return { outcome: 'unavailable', error: '' };
  }
}

/** How the tab's kept run ended, from its row in History: the newest of its SQL, started about then. */
export async function endedAway(tab: SqlTab, at: number, finishing: Finishing): Promise<SqlOutcome> {
  const lost: SqlOutcome = {
    outcome: 'unavailable',
    error: 'You were away when it ended, and History has no row for it.',
  };
  try {
    const response = await fetch(`/api/sql-runs?dataSource=${encodeURIComponent(tab.sourceId)}`);
    if (!response.ok) return lost;
    const { runs } = (await response.json()) as { runs?: readonly PastRun[] };
    const row = (runs ?? []).find(
      (run) => run.sql === tab.lastRunSql && Math.abs(Date.parse(run.startedAt) - at) <= SKEW_MS,
    );
    return row === undefined ? lost : outcomeOf(row, finishing);
  } catch {
    return lost;
  }
}
