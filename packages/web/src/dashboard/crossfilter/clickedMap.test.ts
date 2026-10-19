import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { clickedValue } from './clicked';

/**
 * T978 / AC-627: THE SYSTEM SHALL mark a region as its member and a point as
 * its member; … and as a cross-filter source a region or point filters the
 * others to its member.
 * `Fails when: … a region or point doesn't filter.`
 */
const map: RenderSpec = {
  chartType: 'map',
  encoding: { x: ['stores.state'], y: ['orders.revenue'] },
  rows: [{ 'stores.state': 'Bavaria', 'orders.revenue': 10 }],
  options: {
    map: { boundarySet: 'admin1', points: { location: 'stores.location' } },
  },
};

describe('what a click on a map stands for (AC-627)', () => {
  it('is a region’s member, as its row holds it', () => {
    expect(clickedValue(map, { name: 'Bavaria', seriesName: '' })).toEqual({
      member: 'stores.state',
      value: 'Bavaria',
    });
  });

  it('is a point’s place, by what it marks', () => {
    expect(
      clickedValue(map, {
        name: '48.8566,2.3522',
        seriesName: '',
        marks: [{ member: 'stores.location', value: '48.8566,2.3522' }],
      }),
    ).toEqual({ member: 'stores.location', value: '48.8566,2.3522' });
  });
});
