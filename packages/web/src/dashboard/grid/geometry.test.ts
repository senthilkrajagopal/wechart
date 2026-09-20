import { describe, expect, it } from 'vitest';

import {
  COLUMNS,
  GUTTER_PX,
  ROW_UNIT_PX,
  heightOf,
  pitchOf,
  snapColumns,
  snapRows,
  trackOf,
} from './geometry';

/**
 * T060 / AC-054: WHILE editing, THE SYSTEM SHALL show a 12-column grid on the
 * canvas and snap every tile to whole columns and to 8-pixel row units
 * (direction.md rule 15).
 *
 * `Fails when: a tile's width is not a whole number of columns, or its height
 * is not a multiple of 8 pixels` — the criterion is about what comes *out* of
 * a drag, whatever went in. So these tests feed in the awkward pixel values a
 * pointer actually produces (fractional, off-boundary, negative, absurd) and
 * assert the invariant over all of them, rather than checking a couple of
 * values that happen to land on a boundary anyway.
 *
 * Geometry lives apart from the canvas because resize (T061) and the keyboard
 * (T063) have to snap the same way a drag does — three callers, one rule.
 */

/** A spread of canvas widths: the fixed 1440 page, a narrow pane, an odd one. */
const CANVASES = [1440, 1200, 960, 733];

/** Pixel offsets that are deliberately unhelpful. */
const OFFSETS = [-4000, -120, -1, 0, 0.5, 37, 119.6, 240, 611.25, 1439, 99999];

describe('snapping a width to whole columns', () => {
  it('always yields a whole number of columns inside the grid', () => {
    for (const canvas of CANVASES) {
      for (const px of OFFSETS) {
        const columns = snapColumns(px, canvas);

        expect(Number.isInteger(columns)).toBe(true);
        expect(columns).toBeGreaterThanOrEqual(1);
        expect(columns).toBeLessThanOrEqual(COLUMNS);
      }
    }
  });

  it('gives a full-width drag all twelve columns', () => {
    expect(snapColumns(1440, 1440)).toBe(COLUMNS);
  });

  it('gives a half-width drag six of them', () => {
    // Half the canvas is six tracks and the five gutters between them.
    const half = trackOf(1440) * 6 + GUTTER_PX * 5;

    expect(snapColumns(half, 1440)).toBe(6);
  });

  it('rounds to the nearer column rather than always down', () => {
    const pitch = pitchOf(1440);
    // Four columns and most of a fifth: the tile the user is dragging out has
    // its right edge nearer the fifth boundary than the fourth.
    expect(snapColumns(pitch * 4 + pitch * 0.8, 1440)).toBe(5);
    expect(snapColumns(pitch * 4 + pitch * 0.2, 1440)).toBe(4);
  });
});

describe('snapping a height to the row unit', () => {
  it('always yields a height that is a multiple of 8 pixels', () => {
    for (const px of OFFSETS) {
      const height = heightOf(snapRows(px));

      expect(height % ROW_UNIT_PX).toBe(0);
      expect(height).toBeGreaterThanOrEqual(ROW_UNIT_PX);
    }
  });

  it('measures height in whole row units', () => {
    for (const px of OFFSETS) expect(Number.isInteger(snapRows(px))).toBe(true);
  });

  it('rounds to the nearer row unit', () => {
    expect(snapRows(100)).toBe(13); // 104 px is nearer than 96
    expect(snapRows(99)).toBe(12); // 96 px is nearer than 104
  });
});

/**
 * A tile of n columns is n pitches wide, less the gutter that would have
 * followed the last one. This is the layout `Canvas` produces, so snapping has
 * to be its inverse.
 */
const widthOfColumns = (columns: number, canvasWidth: number) =>
  columns * pitchOf(canvasWidth) - GUTTER_PX;

describe('snapping is the inverse of laying out', () => {
  it('returns the same column count a tile of that many columns occupies', () => {
    for (const canvas of CANVASES) {
      for (let columns = 1; columns <= COLUMNS; columns += 1) {
        expect(snapColumns(widthOfColumns(columns, canvas), canvas)).toBe(columns);
      }
    }
  });

  it('puts the boundary halfway between one tile width and the next', () => {
    // The exact widths above are not enough on their own: a drag is a smooth
    // range of pixels, and the missing-gutter version of this inverse is only
    // 0.13 of a column out — invisible at the exact widths, and decisive near
    // the boundary, which is the only place "nearest column" is defined.
    for (const canvas of CANVASES) {
      for (let columns = 1; columns < COLUMNS; columns += 1) {
        const from = widthOfColumns(columns, canvas);
        const step = widthOfColumns(columns + 1, canvas) - from;

        expect(snapColumns(from + step * 0.6, canvas)).toBe(columns + 1);
        expect(snapColumns(from + step * 0.4, canvas)).toBe(columns);
      }
    }
  });
});

describe('the track and the pitch', () => {
  it('fits twelve tracks and eleven gutters into the canvas exactly', () => {
    for (const canvas of CANVASES) {
      const used = trackOf(canvas) * COLUMNS + GUTTER_PX * (COLUMNS - 1);

      expect(used).toBeCloseTo(canvas, 6);
    }
  });

  it('counts a gutter with every track but the last', () => {
    // The pitch is what a drag crosses to gain one column, which is a track
    // plus the gutter that follows it. Using the bare track instead is the
    // classic off-by-176px at the right-hand edge of a 12-column grid.
    expect(pitchOf(1440)).toBeCloseTo(trackOf(1440) + GUTTER_PX, 6);
    expect(pitchOf(1440) * COLUMNS - GUTTER_PX).toBeCloseTo(1440, 6);
  });
});
