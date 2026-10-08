import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { NARROW_QUERY } from '../../dashboard/useNarrowWindow';
import { useFocusTrap } from '../../shell/useFocusTrap';

/**
 * Jobs' and Schedules' panes as sheets below 1,024 px (T640; design 16, G8:
 * "as designs 01, 11 and 13 do"), in the pattern of their `.source-pane`
 * sheets: a head, a body that scrolls, and the pane's actions pinned in the
 * sheet's foot (`.source-pane__foot`); Esc closes it, as theirs, asking
 * first over typed work; Tab stays in it while it covers the page; and
 * focus goes back to what opened it (direction.md rule 85).
 */

/** The sheet's foot, below 1,024 px, where a pane's actions are pinned; none on a wider window. */
export const SheetFootContext = createContext<HTMLElement | null>(null);

/**
 * A pane's actions: where the pane has them on a wide window, and pinned in
 * the sheet's foot below 1,024 px, its actions staying put as its body
 * scrolls (G8: "its actions stay pinned at the bottom").
 */
export function SheetActions({
  className = 'admin-pane__actions',
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const foot = useContext(SheetFootContext);
  const actions = <div className={className}>{children}</div>;
  return foot === null ? actions : createPortal(actions, foot);
}

/** Whether the window is a sheet's, narrower than 1,024 px, now. */
export const narrowNow = (): boolean => globalThis.matchMedia?.(NARROW_QUERY).matches ?? false;

/**
 * Esc closes the sheet, as the `.source-pane` sheets have it (T471's
 * review): an Esc pressed in it, or, while it covers the page, with focus
 * on nothing. Read on the window, after the document's own listeners, so a
 * dialog over it that takes its Esc (and says so with `preventDefault`) keeps it.
 */
export function useSheetEscape(
  pane: RefObject<HTMLElement | null>,
  open: boolean,
  onEscape: () => void,
) {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const at = event.target;
      const ours =
        (at instanceof Node && pane.current?.contains(at) === true) ||
        ((at === document.body || at === document.documentElement) && narrowNow());
      if (!ours) return;
      event.preventDefault();
      escape.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, pane]);
}

/**
 * How tall the sheet's foot is, as `--sheet-foot-height` on `over`: a toast
 * over the sheet sits above its pinned actions, not on them (T640's review).
 */
export function useFootHeight(foot: HTMLElement | null, over: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = over.current;
    if (foot === null || box === null || typeof ResizeObserver !== 'function') return undefined;
    const measure = () => {
      box.style.setProperty('--sheet-foot-height', `${String(foot.offsetHeight)}px`);
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(foot);
    return () => {
      watching.disconnect();
      box.style.removeProperty('--sheet-foot-height');
    };
  }, [foot, over]);
}

/** Tab kept in the sheet while it covers the page: mounted only then (rule 85). */
export function SheetTrap({ pane }: { readonly pane: RefObject<HTMLElement | null> }) {
  useFocusTrap(pane);
  return null;
}

/**
 * Focus, after the sheet closes, on what opened it: its row, or the button
 * that did; where that's gone, on `fallback` (the list, or the page's own
 * way back). Only where focus fell to the page with the sheet: a close
 * that moved focus on purpose is left alone. Two frames on, so a close
 * rendered after an answer (G5's) has been drawn first.
 */
export function focusAfterClose(opener: string, ...fallbacks: string[]) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now !== null && now !== document.body) return;
      for (const selector of [opener, ...fallbacks]) {
        const found = document.querySelector<HTMLElement>(selector);
        if (found !== null) {
          found.focus();
          return;
        }
      }
    });
  });
}
