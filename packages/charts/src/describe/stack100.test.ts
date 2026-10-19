import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { describeChart } from './index';
import { describeStack100 } from './stack100';

/**
 * T958 / AC-585: … its text alternative SHALL name the largest and smallest
 * share of the first colour member ("Web's share is largest in APAC (62 %)
 * and smallest in LATAM (38 %).") …
 * `Fails when: … the text alternative or the share column is missing.`
 * Design 23 sheet 9: "100 % stacked bar of Revenue by Region and Channel.
 * Web's share is largest in APAC (62 %) and smallest in LATAM (38 %)."
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';

const REVENUES: Record<string, Record<string, number>> = {
  EMEA: { Web: 255000, Partner: 150000, Retail: 95000 },
  APAC: { Web: 310000, Partner: 100000, Retail: 90000 },
  LATAM: { Web: 76000, Partner: 64000, Retail: 60000 },
};

const spec = (
  chartType: 'stackedBar' | 'stackedArea',
  options: Record<string, unknown> = { stack: 'percent' },
  measureType = 'sum',
): RenderSpec =>
  ({
    chartType,
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    rows: Object.entries(REVENUES).flatMap(([region, channels]) =>
      Object.entries(channels).map(([channel, revenue]) => ({
        [REGION]: region,
        [CHANNEL]: channel,
        [REVENUE]: String(revenue),
      })),
    ),
    options,
    titles: { [REGION]: 'Region', [CHANNEL]: 'Channel', [REVENUE]: 'Revenue' },
    measureTypes: { [REVENUE]: measureType },
  }) as unknown as RenderSpec;

describe('the text alternative of a 100 % stack (AC-585)', () => {
  it('names the chart and the first colour member’s largest and smallest share', () => {
    expect(describeStack100(spec('stackedBar'))).toBe(
      '100 % stacked bar of Revenue by Region and Channel. Web’s share is largest in APAC (62 %) and smallest in LATAM (38 %).',
    );
  });

  it('names a 100 % stacked area as one', () => {
    expect(describeStack100(spec('stackedArea'))).toMatch(
      /^100 % stacked area of Revenue by Region and Channel\. /,
    );
  });

  it('is the text alternative the chart gives, at 100 % only', () => {
    expect(describeChart(spec('stackedBar'))).toBe(describeStack100(spec('stackedBar')));
    // At Sum, or with a measure that isn't summed (drawn at Sum), none of its own.
    expect(describeChart(spec('stackedBar', {}))).toBeUndefined();
    expect(describeChart(spec('stackedBar', { stack: 'percent' }, 'avg'))).toBeUndefined();
  });
});
