import { describe, expect, it } from 'vitest';

import { nextPlace } from './badgePlace';

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
