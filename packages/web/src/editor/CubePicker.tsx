import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { PickerGroup, PickerRow } from './pathCubes';

/**
 * The chart editor's cube picker (T475; AC-329, AC-342; 2026-09-27 design
 * 10, state D): "Cube or view" names the one chosen, and opens on a "Search
 * cubes and views" box over the cubes on the item's path, grouped by folder,
 * nearest first. Each is listed by its title, C for a cube or V for a view,
 * with its folder path beside it, never its prefixed name. A farther cube a
 * nearer one of its name hides is listed dimmed and can't be picked, saying
 * what hides it, so its absence from the chart's binding is no mystery.
 *
 * The APG combobox with a list popup, its box in the popup: Down and Up move
 * through what can be picked, Enter picks, Escape closes; focus goes back to
 * the button either way.
 */
export function CubePicker({
  groups,
  value,
  valueTitle,
  onChoose,
}: {
  readonly groups: readonly PickerGroup[];
  /** The cube chosen, by name, or '' for none. */
  readonly value: string;
  /** How the chosen cube is named, by its title. */
  readonly valueTitle: string | undefined;
  readonly onChoose: (name: string) => void;
}) {
  const ids = useId();
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState<string | null>(null);

  const needle = typed.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => row.cube.title.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.rows.length > 0);
  /** What can be picked, in the order listed: the keys move through these. */
  const pickable = shown.flatMap((group) => group.rows).filter((row) => !row.hiddenBy);
  /** By its row's own key: a workspace copy shares its original's name (T475's review). */
  const optionId = (key: string) => `${ids}-option-${key}`;
  // The active row in view as the keys move it through a long list (T475's review).
  useEffect(() => {
    if (active === null) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // `optionId` is made anew each render from the stable `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /**
   * Where the list is drawn: under the button, fixed to the window, so the
   * field pane's scrolling box doesn't cut its 520 px down to the pane's
   * width; placed again as the window or a box around it moves.
   */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect !== undefined) setAt({ top: rect.bottom + 4, left: rect.left });
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
  }, [open]);

  /** Closed from inside it: focus back on its button. */
  const close = () => {
    dismiss();
    button.current?.focus();
  };
  /** Opened under its button, on the cube chosen where it is listed (APG). */
  const openList = () => {
    place();
    setActive(
      groups.flatMap((group) => group.rows).find((row) => row.cube.name === value && !row.hiddenBy)
        ?.key ?? null,
    );
    setOpen(true);
  };
  const choose = (row: PickerRow) => {
    if (row.hiddenBy) return;
    onChoose(row.cube.name);
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
    <div className="cube-picker" ref={box}>
      <span id={`${ids}-label`} className="cube-picker__label">
        Cube or view
      </span>
      <button
        ref={button}
        type="button"
        id="cube-picker"
        className="select-sm cube-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${ids}-label ${ids}-value`}
        data-value={value}
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
        <span id={`${ids}-value`}>
          {value === '' ? 'Choose a cube or view…' : (valueTitle ?? value)}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          className="cube-picker__pop"
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
              aria-label="Search cubes and views"
              placeholder="Search cubes and views"
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
            aria-label="Cubes and views"
            className="cube-picker__list"
          >
            {shown.length === 0 ? (
              <p className="cube-picker__none">No cube or view matches “{typed.trim()}”.</p>
            ) : (
              shown.map((group) => (
                <div
                  key={group.label ?? ''}
                  role="group"
                  aria-label={group.label ?? 'Cubes and views'}
                >
                  {group.label === undefined ? null : (
                    <div className="cube-picker__group" aria-hidden="true">
                      {group.label}
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
                      aria-disabled={row.hiddenBy === undefined ? undefined : true}
                      data-cube={row.cube.name}
                      className={
                        row.hiddenBy === undefined
                          ? 'cube-picker__option'
                          : 'cube-picker__option is-hidden'
                      }
                      // Picked by pointer as by Enter; the box keeps focus till then.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(row);
                      }}
                    >
                      <span className="cube-picker__kind" aria-hidden="true">
                        {row.cube.isView ? 'V' : 'C'}
                      </span>
                      <span className="cube-picker__title">{row.cube.title}</span>
                      <span className="cube-picker__path">
                        {group.label ?? ''}
                        {row.hiddenBy === undefined ? '' : ` · ${row.hiddenBy}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
