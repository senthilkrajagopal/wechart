import type { BuildHistory } from '../repos/build-history';

/**
 * A wechart schedule suspended after its runs fail as many times in a row as
 * it sets (T379, AC-155; design 16, state E and Q9; R42.4, R59). A run fails
 * when Cube refuses its start, or when any of its partitions ends failed or
 * missing: Run history's `failed`. Cube's record expiring, or a cancel,
 * counts neither way, and a run that ends done starts the count again. Only
 * the schedule's own runs count, from Resume on: Run now's don't (R59).
 */

/** How many failed runs in a row suspend a schedule unless it sets another number. */
export const SUSPEND_AFTER = 3;

/** Said of a number that isn't one: a whole number from 1 up, with no "never" (Q9). */
export const SUSPEND_AFTER_REFUSAL =
  'Suspend it after a whole number of failed runs in a row, 1 or more.';

/** The most the table holds: a Postgres integer's (T379's review). */
const MOST = 2_147_483_647;

/** The number a schedule sets, or none where it isn't a whole number of 1 or more. */
export function suspendAfterOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MOST
    ? value
    : undefined;
}

/** Its failures in a row, as Run history has its latest runs, and Cube's error on the last. */
export async function failuresOf(
  history: BuildHistory,
  schedule: {
    readonly id: string;
    readonly countedFrom: Date | null;
    readonly suspendAfter: number;
  },
): Promise<{ readonly count: number; readonly lastError: string | null }> {
  const latest = await history.scheduledEnds(
    schedule.id,
    schedule.countedFrom,
    schedule.suspendAfter,
  );
  let count = 0;
  for (const each of latest) {
    if (each.outcome !== 'failed') break;
    count += 1;
  }
  return { count, lastError: latest[0]?.outcome === 'failed' ? latest[0].error : null };
}
