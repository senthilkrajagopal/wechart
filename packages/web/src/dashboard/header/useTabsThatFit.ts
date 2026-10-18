import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { tabsThatFit } from './tabsThatFit';

/** The title's floor in the compact row (direction §7g; `.dashboard__header h1`). */
const TITLE_MIN = 160;

/** AC-492 holds at 1,024 px and wider; below, the row is T842's. */
const WIDE = '(min-width: 1024px)';

interface Page {
  readonly id: string;
  readonly title: string;
}

interface Placed {
  /** The pages behind "More ▾", by id, in order. */
  readonly menu: readonly string[];
  /** What is inline, and "More ▾" when shown, fits the room it has. */
  readonly fits: boolean;
}

const NONE: Placed = { menu: [], fits: false };
const keyOf = (page: Page) => `${page.id}\u0000${page.title}`;
const same = (a: Placed, b: Placed) =>
  a.fits === b.fits &&
  a.menu.length === b.menu.length &&
  a.menu.every((each, index) => each === b.menu[index]);

/** An element's width with its margins. */
function outer(element: Element): number {
  const style = getComputedStyle(element);
  return (
    element.getBoundingClientRect().width +
    (Number.parseFloat(style.marginLeft) || 0) +
    (Number.parseFloat(style.marginRight) || 0)
  );
}

/**
 * The room the compact row leaves its page tabs: its width inside its
 * padding, less every other part in it and the gaps between them, and less
 * the title's 160 px floor, since the title gives way before the tabs
 * (design 19 G). The spacer takes no room of its own.
 */
function roomIn(header: Element, strip: Element): number {
  const style = getComputedStyle(header);
  let room =
    header.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0);
  const parts = [...header.children].filter((part) => {
    const { display, position } = getComputedStyle(part);
    return display !== 'none' && position !== 'absolute' && position !== 'fixed';
  });
  room -= Math.max(0, parts.length - 1) * (Number.parseFloat(style.columnGap) || 0);
  for (const part of parts) {
    if (part === strip || part.classList.contains('dashboard__header-spacer')) continue;
    room -= part.tagName === 'H1' ? TITLE_MIN : outer(part);
  }
  return room;
}

/**
 * Which pages go behind "More ▾" in the compact row (AC-492; T837), measured
 * from the row as it is laid out.
 *
 * - **The widths** are each tab's own, kept from when it was last drawn
 *   inline; a page not yet measured, or renamed, brings every tab back inline
 *   for one layout so it can be. All before paint.
 * - **Again** whenever the row, its spacer or its title changes size: a wider
 *   window, a compact chip coming or going.
 *
 * Nothing goes to the menu while `active` is false (edit mode, where the strip
 * scrolls, AC-491), below 1,024 px, or where nothing is laid out (jsdom). The
 * strip `row` is a part of `.dashboard__header`; its tabs carry `data-page`
 * with their page's id, and "More ▾" is in `.page-tabs__more-box`.
 */
export function useTabsThatFit(
  row: RefObject<HTMLElement | null>,
  pages: readonly Page[],
  openId: string | undefined,
  active: boolean,
): Placed {
  const [placed, setPlaced] = useState<Placed>(NONE);
  const [tick, setTick] = useState(0);
  const widths = useRef(new Map<string, number>());
  const moreWidth = useRef(0);

  /**
   * Measured after layout and placed again before paint: React's own use of
   * a layout effect ("Measuring layout before the browser repaints the
   * screen", react.dev `useLayoutEffect`), so the state is set here on
   * purpose. It settles: a placement that doesn't change sets nothing.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const strip = row.current;
    const header = strip?.closest('.dashboard__header');
    const wide = typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches;
    if (
      !active ||
      !wide ||
      strip === null ||
      header === null ||
      header === undefined ||
      // Not laid out (hidden, or jsdom): nothing to measure.
      header.clientWidth === 0
    ) {
      if (!same(placed, NONE)) setPlaced(NONE);
      return;
    }
    // What is drawn now, measured.
    const tabs = new Map<string, HTMLElement>();
    for (const tab of strip.querySelectorAll<HTMLElement>('[role="tab"][data-page]'))
      tabs.set(tab.dataset['page'] ?? '', tab);
    for (const page of pages) {
      const tab = tabs.get(page.id);
      if (tab !== undefined) widths.current.set(keyOf(page), tab.getBoundingClientRect().width);
    }
    const box = strip.querySelector('.page-tabs__more-box');
    if (box !== null) moreWidth.current = outer(box);
    // A page not measured yet: every tab inline for a layout, then again.
    if (pages.some((page) => !widths.current.has(keyOf(page)))) {
      if (placed.menu.length > 0) setPlaced(NONE);
      return;
    }

    const list = strip.querySelector('[role="tablist"]');
    const gap = list === null ? 0 : Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const all = pages.map((page) => widths.current.get(keyOf(page)) ?? 0);
    // A pixel kept back for the browser's rounding: the strip's widths are
    // whole pixels, and one short would scroll it.
    const room = roomIn(header, strip) - 1;
    const split = tabsThatFit(
      all,
      room,
      pages.findIndex((page) => page.id === openId),
      moreWidth.current,
      gap,
    );
    const used =
      split.inline.reduce((sum, index) => sum + (all[index] ?? 0), 0) +
      Math.max(0, split.inline.length - 1) * gap +
      (split.menu.length > 0 ? moreWidth.current : 0);
    const next: Placed = {
      menu: split.menu.map((index) => pages[index]?.id ?? ''),
      // Where even the open page beside "More ▾" is too wide (a window at
      // 1,024 px before T841), the strip still shrinks and scrolls rather
      // than push the row's end out of the window.
      fits: used <= room,
    };
    if (!same(next, placed)) setPlaced(next);
  }, [row, pages, openId, active, placed, tick]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Again when the row or any part of it changes size, or a part comes or
  // goes (a compact chip, T838), once the frame that changed it has been laid
  // out.
  useEffect(() => {
    const header = row.current?.closest('.dashboard__header');
    if (!active || header === null || header === undefined) return;
    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setTick((tick) => tick + 1);
      });
    };
    const sizes = new ResizeObserver(again);
    const observeAll = () => {
      sizes.observe(header);
      for (const part of header.children) sizes.observe(part);
    };
    observeAll();
    const parts = new MutationObserver(() => {
      observeAll();
      again();
    });
    parts.observe(header, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      parts.disconnect();
    };
  }, [row, active]);

  return active ? placed : NONE;
}
