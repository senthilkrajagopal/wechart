import { describe, expect, it } from 'vitest';

import { tabsThatFit } from './tabsThatFit';

/**
 * T837 (AC-492; 19-Q5 (a); design 19 pin 3 and state D1): in view mode the
 * page tabs that don't fit the compact row go behind "More ▾", in order, the
 * open page always inline, and none go there when every tab fits.
 *
 * Widths in px; tabs 2 px apart; "More ▾" 60 px with its 4 px lead.
 */
const GAP = 2;
const MORE = 60;
const eight = [80, 80, 80, 80, 80, 80, 80, 80];

describe('tabsThatFit', () => {
  it('keeps every tab inline and none in the menu when all fit', () => {
    // 8 × 80 + 7 × 2 = 654.
    expect(tabsThatFit(eight, 654, 0, MORE, GAP)).toEqual({
      inline: [0, 1, 2, 3, 4, 5, 6, 7],
      menu: [],
    });
    expect(tabsThatFit(eight, 1000, 6, MORE, GAP)).toEqual({
      inline: [0, 1, 2, 3, 4, 5, 6, 7],
      menu: [],
    });
  });

  it('keeps inline as many as fit beside "More ▾", in order, and the rest in the menu, in order', () => {
    // One px short of all eight: room for "More ▾" (60) leaves 593, which
    // holds seven tabs (7 × 80 + 6 × 2 = 572) but not eight.
    expect(tabsThatFit(eight, 653, 0, MORE, GAP)).toEqual({
      inline: [0, 1, 2, 3, 4, 5, 6],
      menu: [7],
    });
    // 400 - 60 = 340: four tabs (4 × 80 + 3 × 2 = 326), not five (408).
    expect(tabsThatFit(eight, 400, 1, MORE, GAP)).toEqual({
      inline: [0, 1, 2, 3],
      menu: [4, 5, 6, 7],
    });
  });

  it('gives the open page the last inline place when it would otherwise fall in the menu', () => {
    expect(tabsThatFit(eight, 400, 6, MORE, GAP)).toEqual({
      inline: [0, 1, 2, 6],
      menu: [3, 4, 5, 7],
    });
    // A wide open page takes as many places as its width needs.
    const wide = [80, 80, 80, 80, 80, 80, 200, 80];
    // 340 left: 200 + 2 + 80 = 282 with one before it, 364 with two.
    expect(tabsThatFit(wide, 400, 6, MORE, GAP)).toEqual({
      inline: [0, 6],
      menu: [1, 2, 3, 4, 5, 7],
    });
  });

  it('keeps the open page inline even when nothing else fits beside it', () => {
    expect(tabsThatFit(eight, 100, 5, MORE, GAP)).toEqual({
      inline: [5],
      menu: [0, 1, 2, 3, 4, 6, 7],
    });
  });

  it('has nothing to place with no tabs', () => {
    expect(tabsThatFit([], 0, 0, MORE, GAP)).toEqual({ inline: [], menu: [] });
  });
});
