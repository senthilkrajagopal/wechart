import { describe, expect, it } from 'vitest';

import { COLUMNS, ROW_UNIT_PX, pitchOf } from './geometry';
import { MAX_ROWS, MIN_COLUMNS, MIN_ROWS, readoutFor, resizeTo, type ResizeStart } from './resize';

/**
 * T061 / AC-055: WHEN the user drags a tile's edge or corner, THE SYSTEM SHALL
 * resize it and show a live readout of columns, percentage and pixels, and
 * THE SYSTEM SHALL offer no numeric width or height field anywhere in the
 * editor (direction.md rule 36).
 *
 * `Fails when: resizing shows no readout, or a width or height input exists in
 * the editor.` The second half is a whole-editor property and is asserted in
 * `e2e/no-size-fields.spec.ts`; what lives here is the gesture.
 *
 * The drag is expressed as a pure function of where the pointer started and
 * where it is now, rather than as accumulated deltas. Accumulating drifts:
 * every intermediate move rounds to the grid, so a slow drag and a fast one
 * across the same distance would land on different sizes, and dragging out and
 * back would not return to where it began.
 */
const CANVAS = 1440;

const start = (over: Partial<ResizeStart> = {}): ResizeStart => ({
  direction: 'se',
  pointerX: 500,
  pointerY: 300,
  w: 6,
  h: 40,
  canvasWidth: CANVAS,
  ...over,
});

describe('dragging an edge', () => {
  it('widens by a column for each column pitch the pointer travels', () => {
    const from = start({ direction: 'e' });
    const moved = resizeTo(from, from.pointerX + pitchOf(CANVAS) * 2, from.pointerY);

    expect(moved.w).toBe(8);
  });

  it('narrows when the pointer goes back the other way', () => {
    const from = start({ direction: 'e' });
    const moved = resizeTo(from, from.pointerX - pitchOf(CANVAS) * 2, from.pointerY);

    expect(moved.w).toBe(4);
  });

  it('grows taller by a row unit for each 8 pixels', () => {
    const from = start({ direction: 's' });
    const moved = resizeTo(from, from.pointerX, from.pointerY + ROW_UNIT_PX * 5);

    expect(moved.h).toBe(45);
  });

  it('leaves the other axis alone, because an edge is one axis', () => {
    const east = start({ direction: 'e' });
    const south = start({ direction: 's' });

    // Dragging the right edge diagonally must not also change the height:
    // a pointer never moves in a perfectly straight line, so an edge that
    // took both axes would resize the other one every time.
    expect(resizeTo(east, east.pointerX + 400, east.pointerY + 400).h).toBe(east.h);
    expect(resizeTo(south, south.pointerX + 400, south.pointerY + 400).w).toBe(south.w);
  });

  it('takes both axes from a corner', () => {
    const from = start({ direction: 'se' });
    const moved = resizeTo(
      from,
      from.pointerX + pitchOf(CANVAS) * 3,
      from.pointerY + ROW_UNIT_PX * 4,
    );

    expect([moved.w, moved.h]).toEqual([9, 44]);
  });

  it('returns to where it began when the pointer comes back', () => {
    const from = start();
    const there = resizeTo(from, from.pointerX + 350, from.pointerY + 120);
    const back = resizeTo(from, from.pointerX, from.pointerY);

    expect(there).not.toEqual(back);
    expect(back).toEqual({ w: from.w, h: from.h });
  });
});

describe('the limits of the grid', () => {
  it('cannot be dragged wider than the canvas', () => {
    const from = start({ direction: 'e', w: 10 });

    expect(resizeTo(from, from.pointerX + pitchOf(CANVAS) * 8, from.pointerY).w).toBe(COLUMNS);
  });

  it('cannot be dragged narrower than a usable tile', () => {
    const from = start({ direction: 'e', w: 3 });

    expect(resizeTo(from, from.pointerX - pitchOf(CANVAS) * 8, from.pointerY).w).toBe(MIN_COLUMNS);
  });

  it('cannot be dragged shorter than a usable tile', () => {
    // Starting well above the floor, so what is asserted is the clamp and not
    // a tile that was already at the minimum before the drag began.
    const from = start({ direction: 's', h: 40 });

    expect(from.h).toBeGreaterThan(MIN_ROWS);
    expect(resizeTo(from, from.pointerX, from.pointerY - ROW_UNIT_PX * 100).h).toBe(MIN_ROWS);
  });

  it('cannot be dragged taller than about a screen', () => {
    const from = start({ direction: 's', h: 40 });

    expect(resizeTo(from, from.pointerX, from.pointerY + ROW_UNIT_PX * 1000).h).toBe(MAX_ROWS);
  });

  it('does not move horizontally on a canvas that has not been laid out', () => {
    // Measured width zero means the pitch is a pixel or so, and the first
    // pixel of a drag would throw the tile to one end of the grid.
    const from = start({ direction: 'se', canvasWidth: 0 });

    expect(resizeTo(from, from.pointerX + 3, from.pointerY).w).toBe(from.w);
    expect(resizeTo(from, from.pointerX + 5000, from.pointerY).w).toBe(from.w);
    // The vertical axis is pure arithmetic on the row unit and still works.
    expect(resizeTo(from, from.pointerX, from.pointerY + ROW_UNIT_PX * 3).h).toBe(from.h + 3);
  });

  it('always lands on the grid, whatever the pointer does', () => {
    const from = start();
    for (const dx of [-999, -37, 0, 11.5, 480, 5000]) {
      for (const dy of [-999, -13, 0, 7.5, 260, 5000]) {
        const moved = resizeTo(from, from.pointerX + dx, from.pointerY + dy);

        // The same invariant AC-054 asserts of a tile, now of the thing that
        // produces one: a drag cannot put a tile off the grid.
        expect(Number.isInteger(moved.w)).toBe(true);
        expect(Number.isInteger(moved.h)).toBe(true);
        expect(moved.w).toBeGreaterThanOrEqual(MIN_COLUMNS);
        expect(moved.w).toBeLessThanOrEqual(COLUMNS);
        expect(moved.h).toBeGreaterThanOrEqual(MIN_ROWS);
      }
    }
  });
});

describe('the readout', () => {
  it('reads exactly as direction.md writes it', () => {
    // direction.md section 2 gives the example verbatim: "6 / 12 cols · 50% ·
    // 320 px". Matching it is the point — the readout is the only feedback a
    // resize gives, and rule 36 names its three parts.
    expect(readoutFor(6, 40)).toBe('6 / 12 cols · 50% · 320 px');
  });

  it('names all three of columns, percentage and pixels', () => {
    const text = readoutFor(9, 25);

    expect(text).toContain('9 / 12 cols');
    expect(text).toContain('75%');
    expect(text).toContain('200 px');
  });

  it('follows the size the drag is currently at, not the size it started from', () => {
    const from = start({ direction: 'e', w: 3 });
    const moved = resizeTo(from, from.pointerX + pitchOf(CANVAS) * 3, from.pointerY);

    // "Live" is the word in the criterion: a readout computed from the start
    // size would be right only before the drag began.
    expect(readoutFor(moved.w, moved.h)).toBe('6 / 12 cols · 50% · 320 px');
  });
});
