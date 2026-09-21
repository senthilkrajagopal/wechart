import { describe, expect, it } from 'vitest';

import { keyToMarking, type KeyboardState } from './keyboardMarking';

/**
 * T106 / AC-100: WHEN a tile has keyboard focus in view mode, THE SYSTEM SHALL
 * move between its items with the arrow keys without changing the marking,
 * mark the focused item with Space, toggle it with Ctrl+Space or ⌘+Space, and
 * extend the marking with Shift and the arrow keys (direction.md rule 52).
 * `Fails when: an arrow key changes the marking, or Space does not mark the
 * focused item.`
 *
 * **Arrows moving focus without marking is the WAI-ARIA APG rule, and here it
 * is also a performance contract.** direction.md spells the reason out: "each
 * marking change re-queries other tiles". Arrowing along a bar chart of fifty
 * categories with marking-follows-focus would fire fifty rounds of queries
 * across every tile that uses the marking — so the obvious "select as you
 * move" behaviour is not merely non-standard here, it would make the keyboard
 * path unusable in a way the mouse path never is.
 *
 * ECharts contributes nothing to this: `docs/research/echarts.md` records that
 * it generates no roles for individual data items, no focus order and no
 * keyboard interaction, and that even its own legend buttons are an open
 * accessibility bug. All of it is ours.
 */
const at = (focused: number, anchor: number | null = null): KeyboardState => ({ focused, anchor });

const press = (
  key: string,
  state: KeyboardState,
  modifiers: Partial<{ shift: boolean; toggle: boolean }> = {},
) => keyToMarking(key, { shift: false, toggle: false, ...modifiers }, state, 5);

describe('moving between a tile’s items', () => {
  it('moves forward on ArrowRight and ArrowDown', () => {
    expect(press('ArrowRight', at(1)).focused).toBe(2);
    expect(press('ArrowDown', at(1)).focused).toBe(2);
  });

  it('moves back on ArrowLeft and ArrowUp', () => {
    expect(press('ArrowLeft', at(3)).focused).toBe(2);
    expect(press('ArrowUp', at(3)).focused).toBe(2);
  });

  it('does not change the marking while moving', () => {
    // The criterion's first failing state, and the performance contract:
    // every marking change re-queries the other tiles.
    expect(press('ArrowRight', at(1)).action).toBe('none');
    expect(press('ArrowLeft', at(1)).action).toBe('none');
  });

  it('stops at the ends rather than wrapping', () => {
    // Wrapping from the last item to the first reads as a jump to anyone not
    // watching, and the announcement would say a category they did not expect.
    expect(press('ArrowRight', at(4)).focused).toBe(4);
    expect(press('ArrowLeft', at(0)).focused).toBe(0);
  });
});

describe('marking the focused item', () => {
  it('marks it on Space', () => {
    // The criterion's second failing state.
    const result = press(' ', at(2));

    expect(result.action).toBe('replace');
    expect(result.focused).toBe(2);
  });

  it('toggles it on Ctrl-Space or ⌘-Space', () => {
    expect(press(' ', at(2), { toggle: true }).action).toBe('toggle');
  });

  it('leaves focus where it is when marking', () => {
    // Space is about the item under focus; moving afterwards would mark one
    // item and describe another.
    expect(press(' ', at(2), { toggle: true }).focused).toBe(2);
  });

  it('makes the marked item the anchor for a later Shift-arrow', () => {
    expect(press(' ', at(2)).anchor).toBe(2);
  });
});

describe('extending with Shift and the arrows', () => {
  it('moves focus and extends the marking together', () => {
    const result = press('ArrowRight', at(2, 2), { shift: true });

    expect(result.focused).toBe(3);
    expect(result.action).toBe('extend');
  });

  it('extends from the anchor, not from the last position', () => {
    // Shift-arrow three times from an anchor of 1 covers 1 to 4, not just the
    // step that was taken. Anything else cannot shrink a range.
    const result = press('ArrowRight', at(3, 1), { shift: true });

    expect(result.anchor).toBe(1);
    expect(result.range).toEqual([1, 4]);
  });

  it('extends backwards too', () => {
    const result = press('ArrowLeft', at(3, 4), { shift: true });

    expect(result.range).toEqual([2, 4]);
  });

  it('starts an anchor where focus is when there is not one yet', () => {
    // Shift-arrow before anything was marked has no anchor to extend from;
    // taking the current position is the reading that loses nothing.
    const result = press('ArrowRight', at(2, null), { shift: true });

    expect(result.anchor).toBe(2);
    expect(result.range).toEqual([2, 3]);
  });

  it('does not extend past the end', () => {
    const result = press('ArrowRight', at(4, 2), { shift: true });

    expect(result.focused).toBe(4);
    expect(result.range).toEqual([2, 4]);
  });
});

describe('keys the tile does not claim', () => {
  it('ignores Tab, so focus can still leave the tile', () => {
    /**
     * A tile that swallowed Tab would be a keyboard trap — the one
     * accessibility failure that makes a page unusable rather than merely
     * awkward.
     */
    const result = press('Tab', at(2));

    expect(result.action).toBe('none');
    expect(result.handled).toBe(false);
  });

  it('ignores an ordinary letter', () => {
    expect(press('a', at(2)).handled).toBe(false);
  });

  it('claims the keys it does act on, so the page does not also scroll', () => {
    // Space scrolls the page and the arrows scroll the container unless the
    // handler says it has dealt with them.
    expect(press(' ', at(2)).handled).toBe(true);
    expect(press('ArrowRight', at(2)).handled).toBe(true);
  });
});
