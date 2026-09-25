import { csvOf, exportNoteOf, rowsText, type RenderSpec } from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine, StatusIcon, type StateKind } from '../shell/StatusIcon';
import { useKeepInside } from './keepInside';

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
  marked,
}: {
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
   * In Markings mode, the tile's marking: the marked-rows group, headed by
   * its name and count (AC-199). Absent in any other mode.
   */
  marked?:
    | {
        name: string;
        count: number;
        onUnmark: () => void;
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
  const list = useRef<HTMLUListElement>(null);
  useKeepInside(list, open);
  /** Put away, and back to ⋯. */
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="tile-menu" ref={wrapper}>
      <button
        type="button"
        ref={trigger}
        aria-label={`Actions for ${title}`}
        aria-expanded={open}
        data-testid={`tile-view-menu-${tileId}`}
        // What focus returns to when View query closes: its own attribute, so
        // a build that stripped test ids would not lose it.
        data-view-menu={tileId}
        onClick={() => {
          // The menu and the note share the place under ⋯: opening it puts
          // the note away, so neither covers the other.
          setNote(undefined);
          setOpen((was) => !was);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <ul className="tile-menu__list" ref={list} aria-label={`Actions for ${title}`}>
          {/* The marked-rows group first, as the prototype's: headed by the
              tile's marking and how much it holds (AC-199). Shown with
              nothing marked too: Unmark is then unavailable, while Invert,
              Mark all and Create details tile still have something to do. */}
          {marked === undefined ? null : (
            <li>
              <div role="group" aria-labelledby={`${why}-marked`} className="tile-menu__group">
                <span id={`${why}-marked`} className="tile-menu__heading">
                  <span aria-hidden="true">● </span>
                  {marked.name} · {marked.count} marked
                </span>
                {/* On this tile's items alone, other tiles' left as they
                    are (AC-115); offered where the tile has items to name. */}
                {marked.onInvert === undefined ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      marked.onInvert?.();
                      close();
                    }}
                  >
                    Invert marking
                  </button>
                )}
                {marked.onMarkAll === undefined ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      marked.onMarkAll?.();
                      close();
                    }}
                  >
                    Mark all
                  </button>
                )}
                <button
                  type="button"
                  disabled={marked.count === 0}
                  onClick={() => {
                    marked.onUnmark();
                    close();
                  }}
                >
                  Unmark
                </button>
                {marked.onCreateDetails === undefined ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      marked.onCreateDetails?.();
                      close();
                    }}
                  >
                    Create details tile
                  </button>
                )}
              </div>
            </li>
          )}
          {onTableView === undefined ? null : (
            <li>
              <button
                type="button"
                onClick={() => {
                  onTableView(!tableView);
                  close();
                }}
              >
                {tableView ? 'View as chart' : 'View as table'}
              </button>
            </li>
          )}
          {onViewQuery === undefined ? null : (
            <li>
              <button
                type="button"
                onClick={() => {
                  // Back to ⋯ first, so focus is never left on the page; the
                  // dialog then takes it, and gives it back when it closes.
                  close();
                  onViewQuery();
                }}
              >
                View query
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              disabled={asking}
              aria-describedby={asking ? why : undefined}
              onClick={() => {
                // The tile's table, as it writes it, with the mark that tells
                // a spreadsheet it is UTF-8 — and then what it holds.
                download();
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Download CSV
            </button>
            {/* Why not yet, in words beside it (T182, AC-176): a disabled
                button takes no focus, so a tooltip on it was out of the
                keyboard's reach. */}
            {asking ? (
              <StateLine kind="run" className="tile-menu__why" id={why}>
                Its newest answer is still on its way.
              </StateLine>
            ) : null}
          </li>
          {onEditChart === undefined ? null : (
            <li>
              <button
                type="button"
                onClick={() => {
                  // As View query: ⋯ first, then the editor takes focus.
                  close();
                  onEditChart();
                }}
              >
                Edit chart
              </button>
            </li>
          )}
        </ul>
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
