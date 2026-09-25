import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps an open tile menu inside the canvas that scrolls it (T253's review,
 * finding 1).
 *
 * The menu opens leftwards from its ⋯, which sits at the tile's right. On a
 * tile narrower than the menu's 250 px its start fell past the canvas's left
 * edge, where the canvas clips it and no scrolling reaches it: "Duplicate" and
 * "Delete" were lost on a two-column tile. It is moved right just far enough to
 * clear that edge, and never past the canvas's other one.
 */
export function useKeepInside(menu: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const element = menu.current;
    if (!open || element === null) return;
    element.style.removeProperty('translate');
    const bounds = (
      element.closest('.dashboard__canvas') ?? document.documentElement
    ).getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const past = bounds.left - box.left;
    if (past <= 0) return;
    const room = bounds.right - box.right;
    element.style.setProperty('translate', `${String(Math.max(0, Math.min(past, room)))}px 0`);
  }, [menu, open]);
}
