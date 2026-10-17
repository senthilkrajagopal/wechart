import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

/** A row of the picker: a cube or view, or a field of one. */
export interface PathPickerRow {
  /** Its own in the list: a workspace copy shares its original's name. */
  readonly key: string;
  /** What choosing it hands back: a cube's or a field's name. */
  readonly value: string;
  readonly title: string;
  /**
   * What its search matches, where that isn't its title: a Filter on field's
   * whole title, its cube's name in it, as its row reads the short one (T742).
   */
  readonly searchText?: string | undefined;
  /** Its cube's kind, as design 10's chip says it. */
  readonly kind: 'cube' | 'view';
  /**
   * What is written at its right: its folder path, or its cube's and its
   * path; the SQL runner's picker, a source's driver and state (T798).
   */
  readonly path: ReactNode;
  /** A chip beside its title: "Your copy" for the user's workspace copy (T718, AC-428). */
  readonly chip?: string | undefined;
  /** `data-*` attributes, for the specs that find a row by its name. */
  readonly data?: Readonly<Record<string, string>> | undefined;
  /** Drawn in place of the C or V chip: a field's role chip (T688). */
  readonly icon?: ReactNode;
  /** Listed, not chosen: a field already in the chart, "✓ in chart" (T688, EDI-11). */
  readonly disabled?: boolean | undefined;
}

/**
 * Its button in place of the "label: chosen ▾" select: a well's "+ metric"
 * (T688, EDI-11), named by its own label.
 */
export interface PathPickerTrigger {
  readonly text: ReactNode;
  readonly label: string;
  readonly className: string;
  readonly testId?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly describedBy?: string | undefined;
}

export interface PathPickerGroup {
  readonly label: string | undefined;
  /** Said after its label, quieter: a joined cube's "· via join" (T688, EDI-11). */
  readonly aside?: string | undefined;
  readonly rows: readonly PathPickerRow[];
}

/** The list's width and the window's margin, as `.cube-picker__pop` sets them (styles.ts). */
const POP_WIDTH = 520;
const GUTTER = 16;

/**
 * Design 10's grouped picker (2026-09-27, state D; T475, T633): a button
 * named by its label and the one chosen, opening on a search box over rows
 * grouped by folder along the item's path, nearest first. Each row has a C or
 * V chip, its title, and its path at the right; the user's workspace copy of
 * a landed cube a "Your copy" chip beside its title (T718, AC-428). Nothing
 * is hidden: a name is one item's (R71; AC-342 retired).
 *
 * The APG combobox with a list popup, its box in the popup: Down and Up move
 * through the rows, Enter picks, Escape closes; focus goes back to
 * the button either way. The list is drawn fixed to the window under the
 * button, so a scrolling pane around it doesn't cut it short.
 */
export function PathPicker({
  label,
  buttonId,
  buttonRef,
  empty,
  searchLabel,
  listLabel,
  noMatch,
  groups,
  value,
  valueTitle,
  onChoose,
  clearLabel,
  trigger,
  foot,
  popClass,
  popWidth = POP_WIDTH,
  anchor,
}: {
  /** Its button, where it isn't the select (T688): a well's "+ metric". */
  readonly trigger?: PathPickerTrigger | undefined;
  /** A line under the list: design 01's "↑ ↓ move · Enter adds · Esc closes". */
  readonly foot?: string | undefined;
  /** The popup's own class, beside `cube-picker__pop`. */
  readonly popClass?: string | undefined;
  /** The popup's width, as its class sets it, for placing it in the window. */
  readonly popWidth?: number | undefined;
  /**
   * The button's ancestor whose left edge the list opens at, by selector: a
   * well's "+" picker at its `.well`, as design 01 state A draws it (T688's
   * review). The button's own edge where none is given or found.
   */
  readonly anchor?: string | undefined;
  /** The button's visible label: "Cube or view", "Filter on". */
  readonly label: string;
  readonly buttonId?: string | undefined;
  /** For an owner that moves focus to the button. */
  readonly buttonRef?: RefObject<HTMLButtonElement | null> | undefined;
  /** Its words with nothing chosen. */
  readonly empty: string;
  readonly searchLabel: string;
  readonly listLabel: string;
  /** Said when nothing matches what was typed. */
  readonly noMatch: (typed: string) => string;
  readonly groups: readonly PathPickerGroup[];
  /** The one chosen, by name, or '' for none. */
  readonly value: string;
  /** How the one chosen is named. */
  readonly valueTitle: string | undefined;
  readonly onChoose: (value: string) => void;
  /**
   * A first row choosing none, while one is chosen: a filter's field can be
   * unset, as its select's first option did (T633). None for the cube picker.
   */
  readonly clearLabel?: string | undefined;
}) {
  const ids = useId();
  const own = useRef<HTMLButtonElement>(null);
  const button = buttonRef ?? own;
  const search = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState<string | null>(null);

  const needle = typed.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        (row.searchText ?? row.title).toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.rows.length > 0);
  /** None, first, while one is chosen and nothing is typed. */
  const clear: PathPickerRow | undefined =
    clearLabel === undefined || value === '' || needle !== ''
      ? undefined
      : { key: '∅', value: '', title: clearLabel, kind: 'cube', path: '' };
  /** What can be picked, in the order listed: the keys move through these. */
  const pickable = [
    ...(clear === undefined ? [] : [clear]),
    // One already in the chart is listed, never picked (T688).
    ...shown.flatMap((group) => group.rows).filter((row) => row.disabled !== true),
  ];
  /** By its row's own key: a workspace copy shares its original's name (T475's review). */
  const optionId = (key: string) => `${ids}-option-${key}`;
  // The active row in view as the keys move it through a long list (T475's review).
  useEffect(() => {
    if (active === null) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // `optionId` is made anew each render from the stable `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  /**
   * Under its button, kept within the window: a button at its right, as a
   * filter's in the edit sidebar is, would carry the list's paths and "hidden
   * by …" past the edge (T633's review). The list's width is the CSS's own.
   */
  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const edge =
      (anchor === undefined ? null : button.current?.closest(anchor))?.getBoundingClientRect()
        .left ?? rect.left;
    const width = Math.min(popWidth, window.innerWidth - 2 * GUTTER);
    const left = Math.max(GUTTER, Math.min(edge, window.innerWidth - width - GUTTER));
    setAt({ top: rect.bottom + 4, left });
  };
  /** Closed, with what was typed and the active row let go of, so it opens afresh. */
  const dismiss = () => {
    setOpen(false);
    setTyped('');
    setActive(null);
  };
  useEffect(() => {
    if (!open) return undefined;
    search.current?.focus();
    // A press outside it closes it, as a menu does.
    const onOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target) !== true) dismiss();
    };
    const onMove = (event: Event) => {
      if (event.target instanceof Node && box.current?.contains(event.target) === true) return;
      place();
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // `place` and `dismiss` only read refs and set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Closed from inside it: focus back on its button. */
  const close = () => {
    dismiss();
    button.current?.focus();
  };
  /** Opened under its button, on the one chosen where it is listed (APG). */
  const openList = () => {
    place();
    setActive(
      groups.flatMap((group) => group.rows).find((row) => row.value === value)?.key ?? null,
    );
    setOpen(true);
  };
  const choose = (row: PathPickerRow) => {
    if (row.disabled === true) return;
    onChoose(row.value);
    close();
  };

  const move = (step: 1 | -1) => {
    if (pickable.length === 0) return;
    const now = pickable.findIndex((row) => row.key === active);
    const next =
      now < 0
        ? step === 1
          ? 0
          : pickable.length - 1
        : Math.min(Math.max(now + step, 0), pickable.length - 1);
    setActive(pickable[next]!.key);
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        return;
      case 'Enter': {
        event.preventDefault();
        const row = pickable.find((each) => each.key === active);
        if (row !== undefined) choose(row);
        return;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        dismiss();
        return;
      default:
    }
  };

  return (
    <div
      className={trigger === undefined ? 'cube-picker' : 'cube-picker cube-picker--add'}
      ref={box}
    >
      {trigger === undefined ? (
        <span id={`${ids}-label`} className="cube-picker__label">
          {label}
        </span>
      ) : null}
      <button
        ref={button}
        type="button"
        id={buttonId}
        className={trigger?.className ?? 'select-sm cube-picker__button'}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...(trigger === undefined
          ? { 'aria-labelledby': `${ids}-label ${ids}-value` }
          : {
              'aria-label': trigger.label,
              ...(trigger.describedBy === undefined
                ? {}
                : { 'aria-describedby': trigger.describedBy }),
              ...(trigger.testId === undefined ? {} : { 'data-testid': trigger.testId }),
            })}
        disabled={trigger?.disabled === true}
        data-value={trigger === undefined ? value : undefined}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          openList();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
      >
        {trigger === undefined ? (
          <>
            <span id={`${ids}-value`}>{value === '' ? empty : (valueTitle ?? value)}</span>
            <span aria-hidden="true">▾</span>
          </>
        ) : (
          trigger.text
        )}
      </button>
      {open ? (
        <div
          className={popClass === undefined ? 'cube-picker__pop' : `cube-picker__pop ${popClass}`}
          style={
            at === null ? undefined : { top: `${String(at.top)}px`, left: `${String(at.left)}px` }
          }
        >
          <div className="cube-picker__field">
            {/* The design's search glyph (design 10, state D). */}
            <svg
              className="cube-picker__glyph"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <input
              ref={search}
              type="search"
              role="combobox"
              className="cube-picker__search"
              aria-label={searchLabel}
              placeholder={searchLabel}
              aria-expanded="true"
              aria-controls={`${ids}-list`}
              aria-autocomplete="list"
              aria-activedescendant={active === null ? undefined : optionId(active)}
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setActive(null);
              }}
              onKeyDown={onSearchKey}
            />
          </div>
          <div
            id={`${ids}-list`}
            role="listbox"
            aria-label={listLabel}
            className="cube-picker__list"
          >
            {clear === undefined ? null : (
              <div
                id={optionId(clear.key)}
                role="option"
                tabIndex={-1}
                aria-selected={clear.key === active}
                data-none="true"
                className="cube-picker__option cube-picker__clear"
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(clear);
                }}
              >
                <span className="cube-picker__title">{clear.title}</span>
              </div>
            )}
            {shown.length === 0 ? (
              // Nothing more to say under "No field" when nothing was typed.
              clear !== undefined ? null : (
                <p className="cube-picker__none">{noMatch(typed.trim())}</p>
              )
            ) : (
              // By place: two groups may share a label, or have none (T688's review).
              shown.map((group, at) => (
                <div
                  key={at}
                  role="group"
                  aria-label={
                    group.label === undefined
                      ? listLabel
                      : `${group.label}${group.aside === undefined ? '' : ` ${group.aside}`}`
                  }
                >
                  {group.label === undefined ? null : (
                    <div className="cube-picker__group" aria-hidden="true">
                      {group.label}
                      {group.aside === undefined ? null : (
                        <span className="cube-picker__aside"> {group.aside}</span>
                      )}
                    </div>
                  )}
                  {group.rows.map((row) => (
                    <div
                      key={row.key}
                      id={optionId(row.key)}
                      role="option"
                      // Never focused: the box keeps focus and names the active one (APG).
                      tabIndex={-1}
                      aria-selected={row.key === active}
                      aria-disabled={row.disabled === true ? 'true' : undefined}
                      {...Object.fromEntries(
                        Object.entries(row.data ?? {}).map(([name, said]) => [
                          `data-${name}`,
                          said,
                        ]),
                      )}
                      className="cube-picker__option"
                      // Picked by pointer as by Enter; the box keeps focus till then.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(row);
                      }}
                    >
                      {row.icon ?? (
                        <span className="cube-picker__kind" aria-hidden="true">
                          {row.kind === 'view' ? 'V' : 'C'}
                        </span>
                      )}
                      <span className="cube-picker__title">{row.title}</span>
                      {row.chip === undefined ? null : (
                        <span className="cube-picker__chip">{row.chip}</span>
                      )}
                      <span className="cube-picker__path">{row.path}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          {foot === undefined ? null : (
            <p className="cube-picker__foot" aria-hidden="true">
              {foot}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
