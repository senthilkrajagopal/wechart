import { useEffect, useRef, type RefObject } from 'react';

/**
 * What, open, takes Escape before the sheet does (AC-489, innermost first): a
 * dialog, a menu — ⋯, a chip's — a filter's popover, or the Bookmarks
 * popover. The same list the dashboard's own Escape waits on (`DashboardView`).
 */
const OPEN_OVER = '[aria-modal="true"], [role="menu"], .filter-popover, .bookmarks';

/** The header: the compact row and the sheet under it (AC-489). */
const HEADER = '.dashboard__header, .header-sheet';

/**
 * Escape with focus in the header closes the open sheet, focus then on its
 * toggle (AC-489; design 19's keyboard table; rule 85).
 *
 * - **Innermost first.** While anything in `OPEN_OVER` is open, Escape is
 *   that thing's: the sheet waits for the next one.
 * - **Ahead of the dashboard's own Escape.** It listens on the dashboard's
 *   own element, which an Escape passes on its way up to the document, where
 *   the dashboard clears its cross-filters. Having closed the sheet, it
 *   marks the event handled (`preventDefault`), and the dashboard's Escape
 *   leaves an event already handled alone (AC-119).
 * - **Only in the header.** Escape on a tile is the tile's (AC-094), and the
 *   sheet stays open.
 *
 * Nothing new is bound: Escape is already how every panel here closes
 * (rule 85; R75).
 */
export function useSheetEscape(
  root: RefObject<HTMLElement | null>,
  sheetId: string,
  open: boolean,
  close: () => void,
): void {
  const closing = useRef(close);
  useEffect(() => {
    closing.current = close;
  });
  useEffect(() => {
    const node = root.current;
    if (!open || node === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!(event.target instanceof Element) || event.target.closest(HEADER) === null) return;
      if (node.ownerDocument.querySelector(OPEN_OVER) !== null) return;
      event.preventDefault();
      closing.current();
      node.querySelector<HTMLElement>(`button[aria-controls="${CSS.escape(sheetId)}"]`)?.focus();
    };
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
    };
  }, [root, sheetId, open]);
}
