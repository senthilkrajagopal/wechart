import { csvOf, type RenderSpec } from '@wechart/core';
import { useEffect, useRef, useState } from 'react';

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
  save = saveFile,
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
  /** How the file is handed over; the browser's download unless a test says. */
  save?: (name: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

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
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <ul className="tile-menu__list" aria-label={`Actions for ${title}`}>
          <li>
            <button
              type="button"
              disabled={asking}
              title={asking ? 'Its newest answer is still on its way' : undefined}
              onClick={() => {
                // The tile's table, as it writes it, with the mark that tells
                // a spreadsheet it is UTF-8.
                save(csvFileName(title), `${BYTE_ORDER_MARK}${csvOf(spec)}`);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Download CSV
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
