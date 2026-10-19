import { describe, expect, it } from 'vitest';

import { withScrollKept } from './scrollWindow';

/**
 * T954 / AC-581: members past the tile's height scroll with the axis fixed.
 * A tile is drawn again whenever its dashboard renders, and a fresh option
 * would put its window back at the top: where the reader scrolled to is kept
 * while the chart's members are the same.
 */
const option = (members: readonly string[], startValue = 0) => ({
  yAxis: [
    { type: 'category', data: members },
    { type: 'category', data: members, show: false },
  ],
  dataZoom: [
    { type: 'inside', startValue, endValue: startValue + 2 },
    { type: 'slider', startValue, endValue: startValue + 2 },
  ],
});
const MEMBERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('a scrolled chart drawn again (AC-581)', () => {
  it('keeps the window where the reader scrolled it, for the same members', () => {
    const kept = withScrollKept(option(MEMBERS), option(MEMBERS), [
      { start: 50, end: 87.5 },
      { start: 50, end: 87.5 },
    ]);
    expect(kept['dataZoom']).toEqual([
      { type: 'inside', start: 50, end: 87.5 },
      { type: 'slider', start: 50, end: 87.5 },
    ]);
  });

  it('starts again at the top when the members change, or nothing was drawn', () => {
    const next = option(['x', 'y', 'z', 'w']);
    expect(withScrollKept(option(MEMBERS), next, [{ start: 50, end: 87.5 }])).toBe(next);
    expect(withScrollKept(null, next, [])).toBe(next);
  });

  it('leaves a chart with no window as it is', () => {
    const plain = { yAxis: { type: 'category', data: MEMBERS } };
    expect(withScrollKept(plain, plain, [])).toBe(plain);
  });
});
