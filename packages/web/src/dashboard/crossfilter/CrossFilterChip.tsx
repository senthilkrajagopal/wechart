import type { CrossSelection } from './apply';

/**
 * The chips for the cross-filters in effect (AC-119, direction.md rule 13).
 *
 * In the filter bar's right-hand group, where direction.md puts the
 * interaction chips: a marking chip per non-empty marking in Markings mode,
 * or these in cross-filter mode.
 *
 * Each names its member, its value and the tile the click came from. The
 * source tile is the part a reader cannot work out for themselves — Superset
 * shows the emitting chart's title for the same reason, while Looker shows
 * only the field and value (`docs/research/cross-highlight.md` §§5, 7) — and
 * it is the tile to click again to take the cross-filter back.
 */
export interface CrossFilterChipsProps {
  readonly selections: readonly CrossSelection[];
  /** One of them, or all of them when nothing is named. */
  readonly onClear: (selection?: CrossSelection) => void;
  /** The member's title in the model, as the filter bar names a field. */
  readonly memberTitle?: ((member: string) => string | undefined) | undefined;
  /** The tile's name: the title of the chart it draws. */
  readonly tileName?: ((tileId: string) => string | undefined) | undefined;
}

export function CrossFilterChips({
  selections,
  onClear,
  memberTitle,
  tileName,
}: CrossFilterChipsProps) {
  if (selections.length === 0) return null;

  return (
    <div className="cross-chips" data-testid="cross-filter-chips">
      {selections.map((selection) => {
        const field = memberTitle?.(selection.member) ?? selection.member;
        const said = `${field} = ${selection.value}`;
        return (
          <span
            key={`${selection.from}:${selection.member}`}
            className="cross-chip"
            data-testid="cross-filter-chip"
          >
            <span className="cross-chip__what">{said}</span>
            {/* Where it came from, which is also where to undo it. */}
            <span className="cross-chip__from">
              from {tileName?.(selection.from) ?? selection.from}
            </span>
            <button
              type="button"
              aria-label={`Clear ${said}`}
              onClick={() => {
                onClear(selection);
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        );
      })}
      {/* The prototype's "Clear (Esc)": the key is named where it can be seen,
          since a shortcut nobody is told about is no way out at all. */}
      <button
        type="button"
        className="btn-ghost btn-sm"
        data-testid="clear-cross-filters"
        onClick={() => {
          onClear();
        }}
      >
        Clear all (Esc)
      </button>
    </div>
  );
}
