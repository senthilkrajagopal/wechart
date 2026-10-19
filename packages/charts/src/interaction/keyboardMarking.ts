/**
 * Marking a tile's items from the keyboard (AC-100, direction.md rule 52).
 *
 * **All of it is ours.** `docs/research/echarts.md` records that ECharts
 * generates no roles for individual data items, no focus order and no keyboard
 * interaction, that its documented instance API has no focus or keyboard
 * method, and that even its own legend buttons are an open accessibility bug.
 * So this is a focusable DOM layer over the tile, and this module is the part
 * worth testing: what a key means.
 *
 * **Arrows move focus without marking**, which is the WAI-ARIA APG rule and
 * also a performance contract here. direction.md gives the reason: "each
 * marking change re-queries other tiles". Arrowing along fifty categories with
 * marking-following-focus would fire fifty rounds of queries across every tile
 * using the marking, so "select as you move" would make the keyboard path
 * unusable in a way the mouse path never is.
 */
export interface KeyboardState {
  /** Which item has focus. */
  readonly focused: number;
  /** Where a Shift-extend started, or null when nothing anchors it yet. */
  readonly anchor: number | null;
}

export interface KeyModifiers {
  readonly shift: boolean;
  /** Ctrl or ⌘. */
  readonly toggle: boolean;
}

export interface KeyResult {
  readonly focused: number;
  readonly anchor: number | null;
  /** `unmark`: Esc, this tile's marking cleared (AC-094, AC-563). */
  readonly action: 'none' | 'replace' | 'toggle' | 'extend' | 'unmark';
  /** For an extend: the inclusive item range the marking should now cover. */
  readonly range?: readonly [number, number];
  /**
   * Whether the tile dealt with the key. False leaves it to the page — Tab
   * above all, because a tile that swallowed it would be a keyboard trap, the
   * one accessibility failure that makes a page unusable rather than awkward.
   */
  readonly handled: boolean;
}

const FORWARD = new Set(['ArrowRight', 'ArrowDown']);
const BACK = new Set(['ArrowLeft', 'ArrowUp']);

export function keyToMarking(
  key: string,
  { shift, toggle }: KeyModifiers,
  state: KeyboardState,
  itemCount: number,
): KeyResult {
  const last = Math.max(itemCount - 1, 0);

  // Esc unmarks the tile's marking, focus staying where it is (AC-094, T971).
  if (key === 'Escape' || key === 'Esc')
    return { focused: state.focused, anchor: null, action: 'unmark', handled: true };

  if (key === ' ' || key === 'Spacebar') {
    return {
      focused: state.focused,
      // The marked item anchors whatever Shift-arrow comes next.
      anchor: state.focused,
      action: toggle ? 'toggle' : 'replace',
      handled: true,
    };
  }

  const step = FORWARD.has(key) ? 1 : BACK.has(key) ? -1 : 0;
  if (step === 0) return { ...state, action: 'none', handled: false };

  // Clamped rather than wrapped: wrapping from the last item to the first
  // reads as a jump to anyone not watching, and the announcement would name a
  // category they did not expect.
  const focused = Math.min(Math.max(state.focused + step, 0), last);

  if (!shift) {
    // Focus only. This is the branch the criterion's first failing state is
    // about, and the one that keeps the other tiles from re-querying.
    return { focused, anchor: state.anchor, action: 'none', handled: true };
  }

  /**
   * Extending runs from the anchor, not from the previous position, so a
   * second Shift-arrow grows or shrinks the same range. Measured from the last
   * step instead, the range could never shrink.
   */
  const anchor = state.anchor ?? state.focused;
  const range: readonly [number, number] =
    anchor <= focused ? [anchor, focused] : [focused, anchor];

  return { focused, anchor, action: 'extend', range, handled: true };
}
