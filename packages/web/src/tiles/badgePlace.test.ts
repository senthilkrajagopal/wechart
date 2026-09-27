import { describe, expect, it } from 'vitest';

import { badgesNeeded, nextPlace } from './badgePlace';

/**
 * T402 (AC-201, amended; the user's answers to questions 27 and 29): a
 * tile's badges sit in its head beside a whole title where the head has room
 * for them, and otherwise go under the chart. They go when the head's items,
 * the title at its whole width, no longer fit; they come back only once the
 * head has room again for what they took there, so they never flip back and
 * forth.
 */
describe('where a tile’s badges go (T402, AC-201)', () => {
  const head = { inFoot: false, moved: 0 };

  it('keeps them in the head while everything fits', () => {
    expect(nextPlace(head, { room: 12, badges: 140 })).toBe(head);
    expect(nextPlace(head, { room: 0, badges: 140 })).toBe(head);
  });

  it('moves them under the chart once the title would be cut, keeping what they took', () => {
    expect(nextPlace(head, { room: -30, badges: 140 })).toEqual({ inFoot: true, moved: 140 });
  });

  it('moves nothing where there are no badges to move', () => {
    expect(nextPlace(head, { room: -30, badges: 0 })).toBe(head);
  });

  it('brings them back only once the head has room for all they took', () => {
    const foot = { inFoot: true, moved: 140 };
    expect(nextPlace(foot, { room: 139, badges: 0 })).toBe(foot);
    expect(nextPlace(foot, { room: 140, badges: 0 })).toEqual({ inFoot: false, moved: 0 });
  });
});

/**
 * T464's review: what the badges in the foot need back in the head is read
 * from what the foot holds now — each badge whole, but the freshness badge
 * only at its least width, which it gives way down to in the head — not kept
 * from when they left. An "Updating…" that left with them, and has gone since,
 * kept the freshness badge in the foot, and the tile 26 px shorter than its
 * twin the filter didn't reach.
 */
describe('what the foot’s badges need back in the head (T464)', () => {
  const badge = (className: string, width: number, minWidth?: string) => {
    const element = document.createElement('span');
    element.className = className;
    if (minWidth !== undefined) element.style.minWidth = minWidth;
    element.getBoundingClientRect = () => ({ width }) as DOMRect;
    return element;
  };
  const footOf = (...badges: HTMLElement[]) => {
    const foot = document.createElement('div');
    foot.className = 'tile-foot';
    foot.append(...badges);
    return foot;
  };

  it('counts the freshness badge at its least width, the others whole, a gap each', () => {
    const foot = footOf(
      badge('mark-badge', 90),
      badge('tile-busy', 70),
      badge('tile-freshness', 150, '64px'),
    );
    expect(badgesNeeded(foot, 8)).toBe(90 + 8 + 70 + 8 + 64 + 8);
  });

  it('needs only what is still there once a busy badge has gone', () => {
    const now = badgesNeeded(footOf(badge('tile-freshness', 150, '64px')), 8);
    expect(now).toBe(72);
    // Room for the freshness badge alone: back in the head.
    expect(nextPlace({ inFoot: true, moved: now }, { room: 100, badges: 0 })).toEqual({
      inFoot: false,
      moved: 0,
    });
  });

  it('needs nothing of an empty foot', () => {
    expect(badgesNeeded(footOf(), 8)).toBe(0);
  });
});
