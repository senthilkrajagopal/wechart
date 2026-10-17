/**
 * The words Cube 1.7.45 refuses a query with only in rollup-only mode
 * (`QueryOrchestrator.ts:240`, research `cube/rollup-only-mode.md`). A matched
 * rollup not yet built is refused in other words, which say nothing of the mode.
 */
export const REFUSED_ROLLUP_ONLY = 'No pre-aggregation table has been built for this query yet';

/**
 * Whether wechart knows Cube runs the model in rollup-only mode (AC-147 as
 * amended by R76, chart-editor-Q4; T690): as xcube's revision route says it
 * (`GET /api/rollup-only`, research `xcube-407622a6b8.md`), and, where it
 * can't say, once a query has failed with Cube's own refusal for that mode.
 */
export function rollupOnlyKnown(rollupOnly: boolean | null | undefined, failure: unknown): boolean {
  if (rollupOnly === true) return true;
  if (rollupOnly === false) return false;
  return failure instanceof Error && failure.message.includes(REFUSED_ROLLUP_ONLY);
}

/**
 * Whether a failed query was refused for rollup-only mode (T690's review):
 * in Cube's own words for it, and the mode not known off. Any other failure —
 * a refusal of access, a compile error, a matched rollup not yet built — is
 * not, even with the mode known on: "no pre-aggregation serves" would
 * misstate it.
 */
export function refusedInRollupOnly(
  rollupOnly: boolean | null | undefined,
  failure: unknown,
): boolean {
  return (
    rollupOnly !== false &&
    failure instanceof Error &&
    failure.message.includes(REFUSED_ROLLUP_ONLY)
  );
}

/**
 * T153 / AC-147 as amended (T690): the banner a chart no pre-aggregation
 * serves carries where wechart knows Cube runs in rollup-only mode, which
 * refuses it. An icon beside the words, never colour alone. Elsewhere the
 * chart's Live badge says it in its tooltip, and the Acceleration tab as a
 * note (design 02 pin 6 and state D).
 */
export function RollupOnlyWarning() {
  return (
    <p className="rollup-only-warning" role="status" data-testid="rollup-only-warning">
      <span className="rollup-only-warning__icon" data-icon="warning" aria-hidden="true" />
      Cube runs in rollup-only mode: it refuses this chart, which no pre-aggregation serves.
    </p>
  );
}
