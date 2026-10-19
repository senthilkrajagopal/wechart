import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { clickedMarkItem, clickedValue, clickMarksCategory } from './clicked';

/**
 * T955 / AC-582: THE SYSTEM SHALL make a bullet its member: a click marks
 * it, Ctrl/⌘ toggles it, and a drag marks the bullets it touches …; and as a
 * cross-filter source a bullet SHALL filter the others to its member.
 * `Fails when: a gesture marks otherwise; … or a bullet doesn't filter.`
 *
 * A click on any of a bullet's marks names its member (`series/bullet.ts`);
 * here, that the member is what it marks and filters by, whichever mark.
 */
const spec = {
  chartType: 'bullet',
  encoding: { x: ['orders.region'], y: ['orders.revenue'] },
  rows: [],
  options: { bullet: { target: { kind: 'value', value: 500000 } } },
} as unknown as RenderSpec;

describe('a bullet clicked (AC-582)', () => {
  it('marks and filters by its member, from its value bar or its target', () => {
    for (const seriesName of ['Revenue', 'Target']) {
      expect(clickedValue(spec, { name: 'EMEA', seriesName })).toEqual({
        member: 'orders.region',
        value: 'EMEA',
      });
      expect(clickedMarkItem(spec, { name: 'EMEA', seriesName })).toEqual([
        { member: 'orders.region', value: 'EMEA' },
      ]);
    }
  });

  it('counts its members as the tile’s items, for Mark all and Invert', () => {
    expect(clickMarksCategory(spec)).toBe(true);
  });
});
