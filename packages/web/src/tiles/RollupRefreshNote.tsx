/**
 * What a refresh of a pre-aggregation-served tile can and cannot do (T154,
 * AC-148 as reworded at the user's decision, 2026-09-22): Cube answers it
 * from the pre-aggregation as last built — `no-cache` skips the result cache,
 * not a rollup, whose `lastRefreshTime` only a rebuild moves (research/cube/
 * refresh-jobs-caching.md) — so the tile says whose data it is, as of when,
 * and where it is rebuilt.
 */
export function RollupRefreshNote({
  preAggregation,
  builtAt,
  onDismiss,
}: {
  preAggregation: string;
  builtAt: Date | null;
  onDismiss: () => void;
}) {
  return (
    <p className="tile-note" role="status" data-testid="rollup-refresh-note">
      <span data-icon="accelerated" aria-hidden="true">
        ⚡
      </span>{' '}
      Served from pre-aggregation <code>{preAggregation}</code>: its data is as of its last build
      {builtAt === null ? '' : `, ${builtAt.toLocaleString()}`}. Rebuild it in{' '}
      <a href="/jobs">Jobs</a>.
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </p>
  );
}
