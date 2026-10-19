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

/** The header sheet, as the count opens it: the sheet's id, and how to open it. */
export interface CompactSheet {
  readonly controls: string;
  readonly open: () => void;
}

const counted = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * The chips collapsed to a count, "n filters" or "n markings" (AC-484,
 * decision CLOSE-2): what the row shows from 1,024 to 1,279 px in place of
 * the chips, which the stylesheet hides there (headerStyles.ts), so the
 * tabs and the toggle keep their room on the row's one line. Its name and
 * tooltip list what it holds; it opens the sheet, whose bar has them all.
 */
function Count({
  label,
  names,
  sheet,
}: {
  readonly label: string;
  readonly names: readonly string[];
  readonly sheet: CompactSheet | undefined;
}) {
  if (sheet === undefined) return null;
  const said = `${label}: ${names.join('; ')}`;
  return (
    <button
      type="button"
      className="compact-chips__count"
      data-testid="compact-chips-count"
      aria-label={said}
      aria-controls={sheet.controls}
      title={said}
      onClick={sheet.open}
    >
      {label}
    </button>
  );
}

export function CompactChips({
  markings,
  crossFilters,
  note = '',
  sheet,
}: {
  readonly markings: readonly CompactMarking[];
  readonly crossFilters: readonly CompactCrossFilter[];
  /** What Copy link with marks came to, shown beside the chips as in the bar. */
  readonly note?: string;
  /** The header sheet the count opens; with none, no count (AC-484, CLOSE-2). */
  readonly sheet?: CompactSheet | undefined;
}) {
  const [cross, ...otherCrosses] = crossFilters;
  if (cross !== undefined) {
    const named = fromTile(cross.what, cross.from);
    return (
      <span className="compact-chips">
        <Count
          label={counted(crossFilters.length, 'filter', 'filters')}
          names={crossFilters.map((each) => fromTile(each.what, each.from))}
          sheet={sheet}
        />
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
      <Count
        label={counted(markings.length, 'marking', 'markings')}
        names={markings.map((marking) =>
          fromTile(`${marking.name}: ${marking.values}`, marking.from),
        )}
        sheet={sheet}
      />
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
