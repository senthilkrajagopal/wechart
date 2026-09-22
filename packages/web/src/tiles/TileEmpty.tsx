import { StatusIcon } from '../shell/StatusIcon';

/**
 * A chart whose query came back with no rows (AC-043): said in words, with
 * every filter in effect named — so a reader can tell "nothing matches these
 * filters" from "nothing there at all" — rather than blank axes, which read as
 * a chart that failed to draw.
 */
export function TileEmpty({ inEffect = [] }: { inEffect?: readonly string[] | undefined }) {
  return (
    <div className="tile-no-rows" data-testid="tile-no-rows" role="status">
      <p className="tile-no-rows__headline">
        {/* Icon plus words (direction.md rule 3). */}
        <StatusIcon kind="idle" />
        <span>No rows to show.</span>
      </p>
      {inEffect.length === 0 ? (
        <p>The query returned no rows.</p>
      ) : (
        <>
          <p>Nothing matches the filters in effect:</p>
          <ul>
            {/* By place: two filters on one field can read alike. */}
            {inEffect.map((filter, index) => (
              <li key={`${String(index)} ${filter}`}>{filter}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
