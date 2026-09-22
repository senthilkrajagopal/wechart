/**
 * T153 / AC-147: a chart no pre-aggregation serves depends on the source
 * database — under rollup-only mode Cube refuses such a query rather than
 * falling back to the database (research/cube/pre-aggregations.md §2, "No
 * match"). An icon beside the words, never colour alone; shown on the chart
 * in the editor, and in its acceleration panel.
 */
export function RollupOnlyWarning() {
  return (
    <p className="rollup-only-warning" role="status" data-testid="rollup-only-warning">
      <span className="rollup-only-warning__icon" data-icon="warning" aria-hidden="true" />
      Depends on the source database: in rollup-only mode, Cube would refuse this chart.
    </p>
  );
}
