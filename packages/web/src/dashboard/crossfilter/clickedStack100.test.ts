import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { clickedMarkItem } from './clicked';

/**
 * T958 / AC-585: THE SYSTEM SHALL mark a 100 % stacked segment as its
 * (category, colour member) tuple and a legend entry's text as its member …
 * `Fails when: a segment marks otherwise; …`
 * Design 23 sheet 9: "a segment marks its (Region, Channel) tuple; legend text
 * marks the Channel."
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';

const spec = (
  chartType: 'stackedBar' | 'stackedArea',
  options: Record<string, unknown> = { stack: 'percent' },
): RenderSpec =>
  ({
    chartType,
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    rows: [],
    options,
    measureTypes: { [REVENUE]: 'sum' },
  }) as unknown as RenderSpec;

describe('what a click on a 100 % stack marks (AC-585)', () => {
  for (const chartType of ['stackedBar', 'stackedArea'] as const) {
    it(`marks a ${chartType}'s segment as its (Region, Channel) tuple`, () => {
      expect(clickedMarkItem(spec(chartType), { name: 'EMEA', seriesName: 'Web' })).toEqual([
        { member: REGION, value: 'EMEA' },
        { member: CHANNEL, value: 'Web' },
      ]);
    });
  }

  it('marks a legend entry as its Channel', () => {
    expect(clickedMarkItem(spec('stackedBar'), { legend: 'Web' })).toEqual([
      { member: CHANNEL, value: 'Web' },
    ]);
  });

  it('marks a stack at Sum as it did: the segment’s series', () => {
    expect(clickedMarkItem(spec('stackedBar', {}), { name: 'EMEA', seriesName: 'Web' })).toEqual([
      { member: CHANNEL, value: 'Web' },
    ]);
  });

  it('makes no tuple of the folded "Other (n)" segment, which no row holds', () => {
    expect(clickedMarkItem(spec('stackedBar'), { name: 'EMEA', seriesName: 'Other (5)' })).toEqual([
      { member: CHANNEL, value: 'Other (5)' },
    ]);
  });

  it('marks nothing for a click on nothing', () => {
    expect(clickedMarkItem(spec('stackedBar'), {})).toBeUndefined();
  });
});
