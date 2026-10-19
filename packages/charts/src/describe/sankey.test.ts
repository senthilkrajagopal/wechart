import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { describeChart } from './index';
import { describeSankey } from './sankey';

/**
 * T989 / AC-613: THE SYSTEM SHALL give a Sankey a text alternative naming the
 * steps, the number of flows, the total and the three largest flows ("Sankey
 * of Revenue from Channel to Region, 12 flows, $1.35M. Largest: Web → North
 * America $237K; …") …
 * `Fails when: a part of the text alternative is missing; …`
 */
const CHANNEL = 'orders.channel';
const REGION = 'orders.region';
const SEGMENT = 'orders.segment';
const REVENUE = 'orders.revenue';

const FLOWS: readonly (readonly [string, string, number])[] = [
  ['Web', 'North America', 237000],
  ['Web', 'EMEA', 210000],
  ['Web', 'APAC', 120000],
  ['Web', 'LATAM', 84000],
  ['Partner', 'North America', 118000],
  ['Partner', 'EMEA', 112000],
  ['Partner', 'APAC', 70000],
  ['Partner', 'LATAM', 54000],
  ['Retail', 'North America', 183000],
  ['Retail', 'EMEA', 90000],
  ['Retail', 'APAC', 31000],
  ['Retail', 'LATAM', 41000],
];

const spec = (steps: readonly string[] = [CHANNEL, REGION]): RenderSpec =>
  ({
    chartType: 'sankey',
    encoding: { x: [...steps], y: [REVENUE] },
    measures: [REVENUE],
    rows: FLOWS.map(([channel, region, revenue]) => ({
      [CHANNEL]: channel,
      [REGION]: region,
      [SEGMENT]: revenue > 100000 ? 'Large' : 'Small',
      [REVENUE]: String(revenue),
    })),
    titles: {
      [CHANNEL]: 'Channel',
      [REGION]: 'Region',
      [SEGMENT]: 'Segment',
      [REVENUE]: 'Revenue',
    },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
  }) as unknown as RenderSpec;

describe('a Sankey’s text alternative (AC-613)', () => {
  it('names its steps, its flows, its total and its three largest flows', () => {
    const said =
      'Sankey of Revenue from Channel to Region, 12 flows, $1.35M. Largest: Web → North America $237K; Web → EMEA $210K; Retail → North America $183K.';
    expect(describeSankey(spec())).toBe(said);
    expect(describeChart(spec())).toBe(said);
  });

  it('names every step of a longer Sankey, and its total once', () => {
    expect(describeSankey(spec([CHANNEL, REGION, SEGMENT]))).toMatch(
      /^Sankey of Revenue from Channel through Region to Segment, 18 flows, \$1\.35M\. Largest: /,
    );
  });

  it('says nothing of a Sankey it can’t draw', () => {
    expect(describeSankey(spec([CHANNEL]))).toBeUndefined();
  });
});
