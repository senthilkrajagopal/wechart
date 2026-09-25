import { csvOf, exportNoteOf, rowsText, type RenderSpec } from '@wechart/core';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { Menu, type MenuEntry } from '../shell/Menu';
import { StateLine, StatusIcon, type StateKind } from '../shell/StatusIcon';

/** Whether this browser shows popovers (every one wechart supports does; jsdom does not). */
const CAN_POP =
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/** A file name from a chart's title: the characters file systems refuse replaced. */
export function csvFileName(title: string): string {
  const name = title.replace(/[/\\?%*:|"<>]/g, '-').trim();
  return `${name === '' ? 'chart' : name}.csv`;
}

/**
 * The byte-order mark prepended to a CSV so a spreadsheet reads it as UTF-8:
 * papaparse's `Papa.BYTE_ORDER_MARK`, which `unparse` does not write itself
 * (research/supporting-utilities.md §3).
 */
export const BYTE_ORDER_MARK = '﻿';

/** Hands the browser a file to save: a Blob behind a link, clicked once. */
export function saveFile(name: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Let go of the file a while after: nothing sourced says when a browser has
  // finished reading it, and a minute is well past a click's download starting.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A chart tile's ⋯ menu in view mode, as the prototype's is: "Download CSV"
 * (T177, AC-171) — the tile's table, every row and column as it shows them
 * (`csvOf`), its Table view for a chart (AC-178).
 * A disclosure, like the edit-mode menu (`MoveToMenu`): Escape closes it and
 * gives focus back, and a press elsewhere dismisses it.
 */
export function TileViewMenu({
  tileId,
  title,
  spec,
  asking = false,
  countRows,
  save = saveFile,
  tableView = false,
  onTableView,
  onViewQuery,
  onEditChart,
  onViewRows,
  marked,
  openAt,
}: {
  /**
   * A request to open, from a right-click on the chart (`at` the pointer) or
   * Shift+F10 or the Menu key on the focused tile (under ⋯) — T266, AC-246.
   * A new `seq` is a new request.
   */
  openAt?: { readonly seq: number; readonly at?: { x: number; y: number } } | undefined;
  tileId: string;
  title: string;
  spec: RenderSpec;
  /**
   * A newer answer is on its way — a filter just changed, a refresh — and
   * what is drawn is the one before it: not downloaded, since the file would
   * hold rows the filter now excludes (T177's review).
   */
  asking?: boolean;
  /**
   * The tile's query asked again with `total` (T178): the rows Cube returns
   * for it and its full count, from the one answer so they cannot disagree;
   * undefined when they cannot be had.
   */
  countRows?:
    ((signal: AbortSignal) => Promise<{ returned: number; total: number } | undefined>) | undefined;
  /** How the file is handed over; the browser's download unless a test says. */
  save?: (name: string, text: string) => void;
  /** Whether the tile shows its table (AC-178), and switching it (AC-199). */
  tableView?: boolean;
  onTableView?: ((showing: boolean) => void) | undefined;
  /** The Cube query and SQL behind the tile (AC-199). */
  onViewQuery?: (() => void) | undefined;
  /** The chart editor, on this tile's chart (AC-199). */
  onEditChart?: (() => void) | undefined;
  /**
   * View underlying rows (T268, AC-239): the rows behind the whole tile,
   * offered where nothing on it is marked — the marked group's View marked
   * rows takes its place when something is.
   */
  onViewRows?: (() => void) | undefined;
  /**
   * In Markings mode, the tile's marking: the marked-rows group, headed by
   * its name and count (AC-199). Absent in any other mode.
   */
  marked?:
    | {
        name: string;
        count: number;
        onUnmark: () => void;
        /**
         * Filter to marked and Filter out marked (AC-113): the action, or
         * why the marking cannot be one (nothing marked, every row marked).
         */
        filterTo?: (() => void) | { readonly refused: string } | undefined;
        filterOut?: (() => void) | { readonly refused: string } | undefined;
        /** The rows behind the marked items (T120, AC-114). */
        onViewMarkedRows?: (() => void) | undefined;
        /** Invert marking and Mark all on this tile (AC-115), where it has items to name. */
        onInvert?: (() => void) | undefined;
        onMarkAll?: (() => void) | undefined;
        /** A tile beside this one, limited by its marking (AC-112). */
        onCreateDetails?: (() => void) | undefined;
      }
    | undefined;
}) {
  const [open, setOpen] = useState(false);
  /**
   * What the last download holds (T178, AC-172): how many rows, and whether
   * they are the whole result — said once Cube has counted, and never claimed
   * whole before then.
   */
  const [note, setNote] = useState<{ kind: StateKind; text: string } | undefined>(undefined);
  const noteRef = useRef<HTMLParagraphElement>(null);
  // It lies over the tile, so it goes on Escape or a press anywhere but on it.
  const noted = note !== undefined;
  useEffect(() => {
    if (!noted) return undefined;
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (noteRef.current?.contains(event.target as Node) === true) return;
      setNote(undefined);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [noted]);

  /**
   * Only the latest download's count is said (T178's review): each new one
   * lets go of the one before, so an earlier answer arriving late cannot say
   * of this file what was true of the last.
   */
  const counting = useRef<AbortController | null>(null);
  useEffect(() => () => counting.current?.abort(), []);
  const download = () => {
    const written = spec.rows.length;
    save(csvFileName(title), `${BYTE_ORDER_MARK}${csvOf(spec)}`);
    setNote({
      kind: 'run',
      text: `Downloaded ${rowsText(written)}. Asking Cube whether any were cut short…`,
    });
    counting.current?.abort();
    const mine = new AbortController();
    counting.current = mine;
    void (countRows?.(mine.signal) ?? Promise.resolve(undefined))
      .catch(() => undefined)
      .then((counted) => {
        if (mine.signal.aborted) return;
        // Said even if the note was put away meanwhile: a truncation is news.
        const said = exportNoteOf({ written, returned: counted?.returned, total: counted?.total });
        // Whole: done. Cut short, or not known to be whole: a warning (AC-177).
        setNote({ kind: said.truncated === false ? 'ok' : 'warn', text: said.text });
      });
  };
  const trigger = useRef<HTMLButtonElement>(null);
  const why = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  /** Where it opens: at the pointer of a right-click, or under ⋯ (or the tile, by keyboard). */
  const [point, setPoint] = useState<{ x: number; y: number } | undefined>(undefined);

  /**
   * Opened from elsewhere (T266, AC-246): a right-click on the chart, at the
   * pointer, or Shift+F10 or the Menu key on the focused tile, at the tile.
   * Each request once, by its number.
   */
  const answered = useRef(openAt?.seq);
  /** Opened from the focused tile by its keys: focus goes back to it (APG). */
  const fromTile = useRef(false);
  useEffect(() => {
    if (openAt === undefined || openAt.seq === answered.current) return;
    answered.current = openAt.seq;
    fromTile.current = openAt.at === undefined;
    setNote(undefined);
    setPoint(openAt.at);
    setOpen(true);
  }, [openAt]);

  /**
   * Shown in the top layer and placed in the window: at the pointer, or
   * under ⋯ at its right edge, turned back from any edge it would cross.
   */
  useLayoutEffect(() => {
    const box = popup.current;
    if (!open || box === null) return;
    if (typeof box.showPopover === 'function' && !box.matches(':popover-open')) box.showPopover();
    const size = box.getBoundingClientRect();
    const anchor = trigger.current?.getBoundingClientRect();
    // Within the dashboard's canvas where it has one, as the picker always
    // opened (T253's review, finding 1), and within the window in any case.
    const canvas = wrapper.current?.closest('.dashboard__canvas')?.getBoundingClientRect();
    const [lowest, highest] = [
      Math.max(8, canvas?.left ?? 0),
      Math.min(window.innerWidth - 8, canvas?.right ?? window.innerWidth),
    ];
    let left = point?.x ?? (anchor === undefined ? 0 : anchor.right - size.width);
    let top = point?.y ?? (anchor === undefined ? 0 : anchor.bottom + 4);
    if (point !== undefined && left + size.width > highest) left -= size.width;
    left = Math.min(Math.max(left, lowest), highest - size.width);
    if (top + size.height > window.innerHeight - 8) {
      top = Math.max(8, (point?.y ?? anchor?.top ?? top) - size.height - 4);
    }
    box.style.left = `${String(Math.max(8, left))}px`;
    box.style.top = `${String(Math.max(8, top))}px`;
  }, [open, point]);

  // A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  /** Runs one of its actions; the menu closes itself after (`Menu`). */
  const entries: MenuEntry[] = [
    // The marked-rows group first, as the prototype's: under the heading
    // naming the tile's marking and how much it holds (AC-199). Shown with
    // nothing marked too: Unmark is then unavailable, while Invert, Mark all
    // and Create details tile still have something to do.
    ...(marked === undefined
      ? []
      : [
          {
            kind: 'group' as const,
            key: 'marked',
            labelledBy: `${why}-marked`,
            entries: [
              // The marking as a dashboard filter, or its negation, which then
              // clears it (AC-113, direction.md rule 53).
              ...(
                [
                  ['to', 'Filter to marked', marked.filterTo],
                  ['out', 'Filter out marked', marked.filterOut],
                ] as const
              ).flatMap(([key, label, action]): MenuEntry[] =>
                action === undefined
                  ? []
                  : [
                      {
                        kind: 'item',
                        key,
                        label,
                        onSelect: typeof action === 'function' ? action : () => undefined,
                        disabled: typeof action === 'function' ? undefined : action.refused,
                      },
                    ],
              ),
              ...(marked.onViewMarkedRows === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'rows',
                      label: 'View marked rows',
                      onSelect: marked.onViewMarkedRows,
                      disabled: marked.count === 0 ? 'Nothing is marked.' : undefined,
                    },
                  ]),
              // On this tile's items alone, other tiles' left as they are
              // (AC-115); offered where the tile has items to name.
              ...(marked.onInvert === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'invert',
                      label: 'Invert marking',
                      onSelect: marked.onInvert,
                    },
                  ]),
              ...(marked.onMarkAll === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'all',
                      label: 'Mark all',
                      onSelect: marked.onMarkAll,
                    },
                  ]),
              {
                kind: 'item' as const,
                key: 'unmark',
                label: 'Unmark',
                onSelect: marked.onUnmark,
                disabled: marked.count === 0 ? 'Nothing is marked.' : undefined,
              },
              ...(marked.onCreateDetails === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'details',
                      label: 'Create details tile',
                      onSelect: marked.onCreateDetails,
                    },
                  ]),
            ],
          },
          { kind: 'separator' as const, key: 'after-marked' },
        ]),
    ...(onTableView === undefined
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'table',
            label: tableView ? 'View as chart' : 'View as table',
            onSelect: () => {
              onTableView(!tableView);
            },
          },
        ]),
    ...(onViewRows === undefined || (marked !== undefined && marked.count > 0)
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'underlying',
            label: 'View underlying rows',
            onSelect: onViewRows,
          },
        ]),
    ...(onViewQuery === undefined
      ? []
      : [{ kind: 'item' as const, key: 'query', label: 'View query', onSelect: onViewQuery }]),
    {
      kind: 'item',
      key: 'csv',
      label: 'Download CSV',
      // The tile's table, as it writes it, with the mark that tells a
      // spreadsheet it is UTF-8 — and then what it holds.
      onSelect: download,
      disabled: asking ? 'Its newest answer is still on its way.' : undefined,
      // Said in words beside it, which it is described by (T182, AC-176).
      describedBy: asking ? why : undefined,
    },
    ...(onEditChart === undefined
      ? []
      : [{ kind: 'item' as const, key: 'edit', label: 'Edit chart', onSelect: onEditChart }]),
  ];

  return (
    <div className="tile-menu" ref={wrapper}>
      <button
        type="button"
        ref={trigger}
        id={`${why}-trigger`}
        aria-label={`Actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`tile-view-menu-${tileId}`}
        // What focus returns to when View query closes: its own attribute, so
        // a build that stripped test ids would not lose it.
        data-view-menu={tileId}
        onClick={() => {
          // The menu and the note share the place under ⋯: opening it puts
          // the note away, so neither covers the other.
          setNote(undefined);
          setPoint(undefined);
          fromTile.current = false;
          setOpen((was) => !was);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        // Its handlers keep focus and the browser's menu off it; the menu in
        // it takes every key and click (`Menu`).
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className="tile-view-menu"
          ref={popup}
          // In the top layer (research/context-menu-and-submenus.md §6): a
          // right-click opens it at the pointer, clear of the tile's box and
          // of any transform above it, while it stays in the tile's DOM.
          // Only where it can be shown: a popover not shown is not drawn.
          popover={CAN_POP ? 'manual' : undefined}
          // A press on its heading or its padding leaves focus on the item it
          // was on, where the menu's keys — Escape among them — are taken
          // (T266's review: it went to the tile, and Escape unmarked it).
          onMouseDown={(event) => {
            if ((event.target as Element).closest('[role^="menuitem"]') === null)
              event.preventDefault();
          }}
          // Never the browser's menu over this one (AC-246; research gotcha
          // 2): a right-click on it, or the Menu key's `contextmenu`, which
          // Chromium on Windows fires on its keyup — at the item this menu
          // has just focused.
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          {/* The marked-rows group's heading, outside the menu itself, which
              holds items only (APG): the tile's marking and how much it holds
              (AC-199). */}
          {marked === undefined ? null : (
            <div id={`${why}-marked`} className="tile-menu__heading">
              <span aria-hidden="true">● </span>
              {marked.name} · {marked.count.toLocaleString('en-GB')} marked
            </div>
          )}
          <Menu
            labelledBy={`${why}-trigger`}
            entries={entries}
            onClose={() => {
              setOpen(false);
              // Back to where it was opened from (APG): the tile, for its
              // keys; ⋯ otherwise — before a dialog an item opened takes
              // focus, and before Tab moves on from it.
              const tile = wrapper.current?.closest<HTMLElement>('[data-tile]');
              if (fromTile.current && tile !== null && tile !== undefined) tile.focus();
              else trigger.current?.focus();
              fromTile.current = false;
            }}
          />
          {/* Why Download is off, in words (T182, AC-176). */}
          {asking ? (
            <StateLine kind="run" className="tile-menu__why" id={why}>
              Its newest answer is still on its way.
            </StateLine>
          ) : null}
        </div>
      ) : null}
      {/* Always there, so each message is announced as it changes. */}
      <p
        ref={noteRef}
        className={note === undefined ? 'visually-hidden' : 'tile-export-note'}
        role="status"
      >
        {note === undefined ? (
          ''
        ) : (
          <>
            <StatusIcon kind={note.kind} />
            {note.text}
          </>
        )}
      </p>
    </div>
  );
}
