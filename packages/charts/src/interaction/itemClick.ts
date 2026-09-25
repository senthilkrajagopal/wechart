/**
 * Recognising a click on a chart item, by pairing `mousedown` with `mouseup`
 * (AC-087, direction.md rule 47).
 *
 * **Deliberately not ECharts' own `click` event.** `docs/research/echarts.md`
 * reads zrender 6.1.0's `Handler.ts` and finds `click` is *dropped* when press
 * and release land on different zrender elements, or when the pointer moved
 * more than 4 px — and a dropped click dispatches nothing at all, not even at
 * the instance level. On a surface that also drags to select, marks would
 * simply go missing with nothing to debug. `mousedown` and `mouseup` are
 * dispatched unconditionally, so the pair is strictly more robust, and the
 * research says so in as many words: "Do not build marking on `click`."
 *
 * This reports *where* a click landed. What a click then does to a marking is
 * `@wechart/core`'s `applyItemClick`, and the rectangle and lasso that a
 * longer movement begins are AC-088's, built at T094.
 */

/**
 * rule 47: "A drag of 5 px or more is never treated as a click." Slightly
 * looser than zrender's own 4 px gate, which is fine — this runs instead of
 * that gate, not after it.
 */
export const CLICK_SLOP_PX = 5;

export interface ItemEvent {
  /** The item under the pointer, or null over empty plot area. */
  readonly item: string | null;
  readonly x: number;
  readonly y: number;
  /** Ctrl or ⌘ was held. */
  readonly toggle: boolean;
}

export interface ItemClick {
  readonly item: string | null;
  readonly toggle: boolean;
}

export interface ItemClicks {
  readonly down: (event: ItemEvent) => void;
  readonly up: (event: ItemEvent) => void;
  /**
   * Forget the press under way: it became something else — a drag, or a
   * context menu (a right-click, or macOS's Ctrl+click, which presses the
   * primary button) — so its release is no click.
   */
  readonly cancel: () => void;
}

/**
 * A press/release pair that calls back when the two amount to a click.
 *
 * Empty plot area is reported rather than ignored, because rule 47 makes it
 * meaningful: "Clicking an empty plot area unmarks that tile's marking." What
 * that means is the caller's to decide; this only says where the click landed.
 */
export function itemClicks(onClick: (click: ItemClick) => void): ItemClicks {
  let pressed: ItemEvent | null = null;

  return {
    down(event) {
      pressed = event;
    },
    up(event) {
      const from = pressed;
      // Cleared before anything else, so one press can only ever produce one
      // click — a second `mouseup` is a release this press already answered.
      pressed = null;

      // A release with no press is a drag that began somewhere else on the
      // page and happened to end over the chart.
      if (from === null) return;

      // Press and release on different items is not a decision about either.
      if (from.item !== event.item) return;

      const moved = Math.hypot(event.x - from.x, event.y - from.y);
      if (moved >= CLICK_SLOP_PX) return;

      // The modifier is read from the release, which is what the user was
      // holding when they committed to it.
      onClick({ item: event.item, toggle: event.toggle });
    },
    cancel() {
      pressed = null;
    },
  };
}
