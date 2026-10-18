import { MenuButton } from '../../shell/MenuButton';

/**
 * The compact row's interaction summary while the header sheet is closed
 * (AC-200, AC-119, AC-098; design 19 screen 1 pin 4, states B4 and D1): one
 * compact chip per non-empty marking, at most two and then "+n", or in
 * cross-filter mode the first cross-filter's compact chip and then "+n".
 *
 * Each keeps the full chip's menu and ×. The tile it came from, which the
 * compact chip has no room to show, is in its tooltip, its accessible name
 * and its menu's heading. Its values are cut short at 240 px (CSS), whole in
 * the tooltip.
 */
export interface CompactMarking {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  /** Its values by the members' titles, as the full chip summarises them. */
  readonly values: string;
  /** The tile it was last marked from. */
  readonly from?: string | undefined;
  readonly onUnmark: () => void;
  readonly onCopyLink?: (() => void) | undefined;
}

export interface CompactCrossFilter {
  readonly key: string;
  /** "‹member› = ‹value›", the member by its title. */
  readonly what: string;
  /** The tile the cross-filter came from. */
  readonly from: string;
  readonly onClear: () => void;
}

/** At most this many marking chips before "+n" (AC-200). */
const MARKINGS_SHOWN = 2;

const fromTile = (said: string, from: string | undefined) =>
  from === undefined ? said : `${said}, from ${from}`;

/**
 * "+n" for the rest, which the sheet's bar shows in full. Its names are said
 * to whoever can't see the row, and are in its tooltip.
 */
function Rest({ names }: { readonly names: readonly string[] }) {
  if (names.length === 0) return null;
  const said = `${String(names.length)} more: ${names.join(', ')}`;
  return (
    <span className="compact-chips__more" data-testid="compact-chips-more" title={said}>
      <span aria-hidden="true">+{names.length}</span>
      <span className="visually-hidden">{said}</span>
    </span>
  );
}

export function CompactChips({
  markings,
  crossFilters,
  note = '',
}: {
  readonly markings: readonly CompactMarking[];
  readonly crossFilters: readonly CompactCrossFilter[];
  /** What Copy link with marks came to, shown beside the chips as in the bar. */
  readonly note?: string;
}) {
  const [cross, ...otherCrosses] = crossFilters;
  if (cross !== undefined) {
    const named = fromTile(cross.what, cross.from);
    return (
      <span className="compact-chips">
        <span
          className="compact-chip compact-chip--cross"
          data-testid="compact-cross-chip"
          role="group"
          aria-label={named}
          title={named}
        >
          <span className="compact-chip__values">{cross.what}</span>
          <MenuButton
            label={`${cross.what} menu`}
            heading={named}
            className="compact-chip__button"
            items={[{ key: 'clear', label: 'Clear', onSelect: cross.onClear }]}
          >
            <span aria-hidden="true">▾</span>
          </MenuButton>
          <button
            type="button"
            className="compact-chip__button"
            aria-label={`Clear ${cross.what}`}
            onClick={cross.onClear}
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
        <Rest names={otherCrosses.map((each) => fromTile(each.what, each.from))} />
      </span>
    );
  }

  if (markings.length === 0) return null;
  const shown = markings.slice(0, MARKINGS_SHOWN);
  return (
    <span className="compact-chips">
      {shown.map((marking) => {
        const named = fromTile(`${marking.name}: ${marking.values}`, marking.from);
        return (
          <span
            key={marking.id}
            className="compact-chip compact-chip--mark"
            data-testid="compact-mark-chip"
            role="group"
            aria-label={named}
            title={named}
            // Bordered in its marking's colour (AC-200), as the full chip is.
            style={{ borderColor: marking.colour }}
          >
            <span
              className="mark-chip__swatch"
              aria-hidden="true"
              style={{ background: marking.colour }}
            />
            <span className="compact-chip__name">{marking.name}</span>
            <span className="compact-chip__values">{marking.values}</span>
            <MenuButton
              label={`${marking.name} menu`}
              heading={fromTile(marking.name, marking.from)}
              className="compact-chip__button"
              items={[
                ...(marking.onCopyLink === undefined
                  ? []
                  : [{ key: 'link', label: 'Copy link with marks', onSelect: marking.onCopyLink }]),
                { key: 'unmark', label: 'Unmark', onSelect: marking.onUnmark },
              ]}
            >
              <span aria-hidden="true">▾</span>
            </MenuButton>
            <button
              type="button"
              className="compact-chip__button"
              aria-label={`Unmark ${marking.name}`}
              onClick={marking.onUnmark}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        );
      })}
      <Rest names={markings.slice(MARKINGS_SHOWN).map((marking) => marking.name)} />
      {note === '' ? null : (
        <span className="mark-chip-note" data-testid="compact-link-note">
          {note}
        </span>
      )}
    </span>
  );
}
