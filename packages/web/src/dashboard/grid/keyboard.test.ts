import { describe, expect, it } from 'vitest';

import { COLUMNS } from './geometry';
import { actionFor } from './keyboard';
import { MAX_ROWS, MIN_COLUMNS, MIN_ROWS } from './resize';

/**
 * T063 / AC-057: WHEN a tile has keyboard focus in edit mode, THE SYSTEM SHALL
 * move it with the arrow keys, resize it with Shift and the arrow keys, open
 * its chart editor with E, and delete it with Delete (direction.md rule 39).
 * `Fails when: any of those keys has no effect on the focused tile.`
 *
 * This is the task that makes rule 39 — "every edit-mode action can be done
 * without a mouse" — true of the dashboard. Until now moving and resizing
 * were pointer-only, which T061 and T062 both recorded as an open deferral.
 *
 * The decision is a pure function of the key and the tile, so every branch can
 * be asserted without a rendered grid; the component's job is to route a
 * keydown here and apply what comes back.
 */
const press = (key: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

const TILE = { w: 6, h: 40 };

describe('moving with the arrow keys', () => {
  it('goes one place later with Right and Down', () => {
    expect(actionFor(press('ArrowRight'), TILE)).toEqual({ kind: 'move', by: 1 });
    expect(actionFor(press('ArrowDown'), TILE)).toEqual({ kind: 'move', by: 1 });
  });

  it('goes one place earlier with Left and Up', () => {
    expect(actionFor(press('ArrowLeft'), TILE)).toEqual({ kind: 'move', by: -1 });
    expect(actionFor(press('ArrowUp'), TILE)).toEqual({ kind: 'move', by: -1 });
  });
});

describe('resizing with Shift and the arrow keys', () => {
  it('widens and narrows by a column', () => {
    expect(actionFor(press('ArrowRight', { shiftKey: true }), TILE)).toEqual({
      kind: 'resize',
      size: { w: 7, h: 40 },
    });
    expect(actionFor(press('ArrowLeft', { shiftKey: true }), TILE)).toEqual({
      kind: 'resize',
      size: { w: 5, h: 40 },
    });
  });

  it('grows and shrinks by a row unit', () => {
    expect(actionFor(press('ArrowDown', { shiftKey: true }), TILE)).toEqual({
      kind: 'resize',
      size: { w: 6, h: 41 },
    });
    expect(actionFor(press('ArrowUp', { shiftKey: true }), TILE)).toEqual({
      kind: 'resize',
      size: { w: 6, h: 39 },
    });
  });

  it('stops at the same limits a drag stops at', () => {
    // One gesture must not be able to reach a size the other cannot: the
    // document does not record how a tile came to be the size it is.
    const wide = { w: COLUMNS, h: MAX_ROWS };
    const small = { w: MIN_COLUMNS, h: MIN_ROWS };

    expect(actionFor(press('ArrowRight', { shiftKey: true }), wide)).toEqual({
      kind: 'resize',
      size: wide,
    });
    expect(actionFor(press('ArrowDown', { shiftKey: true }), wide)).toEqual({
      kind: 'resize',
      size: wide,
    });
    expect(actionFor(press('ArrowLeft', { shiftKey: true }), small)).toEqual({
      kind: 'resize',
      size: small,
    });
    expect(actionFor(press('ArrowUp', { shiftKey: true }), small)).toEqual({
      kind: 'resize',
      size: small,
    });
  });
});

describe('an element with no size of its own', () => {
  it('is moved by Shift and an arrow key, not resized', () => {
    // A header, a divider and a filter are as tall as their content. The
    // pointer already refuses them a resize handle; a rule enforced on one of
    // the two paths is worse than no rule, because two keystrokes would then
    // put a header into a state the model says cannot exist. The prototype
    // falls through to a move, and so does this.
    expect(actionFor(press('ArrowDown', { shiftKey: true }), TILE, false)).toEqual({
      kind: 'move',
      by: 1,
    });
    expect(actionFor(press('ArrowLeft', { shiftKey: true }), TILE, false)).toEqual({
      kind: 'move',
      by: -1,
    });
  });

  it('still answers the other keys', () => {
    expect(actionFor(press('Delete'), TILE, false)).toEqual({ kind: 'delete' });
    expect(actionFor(press('ArrowRight'), TILE, false)).toEqual({ kind: 'move', by: 1 });
  });
});

describe('the other two keys the criterion names', () => {
  it('opens the chart editor with E, in either case', () => {
    expect(actionFor(press('e'), TILE)).toEqual({ kind: 'edit' });
    expect(actionFor(press('E'), TILE)).toEqual({ kind: 'edit' });
  });

  it('deletes with Delete, and with Backspace as well', () => {
    // Backspace is what a Mac keyboard offers where a PC has Delete, and the
    // prototype accepts both.
    expect(actionFor(press('Delete'), TILE)).toEqual({ kind: 'delete' });
    expect(actionFor(press('Backspace'), TILE)).toEqual({ kind: 'delete' });
  });
});

describe('keys that are not ours', () => {
  it('ignores a letter with a modifier held, which belongs to the browser', () => {
    // ⌘E and Ctrl+E are the browser's or the operating system's. Claiming
    // them would break find-again or a screen reader's own shortcuts.
    expect(actionFor(press('e', { ctrlKey: true }), TILE)).toBeNull();
  });

  it('ignores everything else', () => {
    for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'Home', 'PageDown']) {
      expect(actionFor(press(key), TILE)).toBeNull();
    }
  });
});
