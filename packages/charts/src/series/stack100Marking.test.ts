import type { MarkingPredicate, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';

/**
 * T958 / AC-585: THE SYSTEM SHALL mark a 100 % stacked segment as its
 * (category, colour member) tuple …; WHILE another tile's marking covers part
 * of a segment, it SHALL draw the marked share from the segment's own base as
 * a fraction of the segment …
 * `Fails when: a segment marks otherwise; a partly marked segment's share is
 * drawn from the bar's base or as a fraction of the bar; …`
 *
 * The click's tuple is read in `web/dashboard/crossfilter/clicked.ts`; here,
 * how a tuple and a marked share are drawn on the 100 % chart.
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';
const MARKING = '#d9480f';

const REVENUES: Record<string, Record<string, number>> = {
  EMEA: { Web: 210000, Partner: 120000, Retail: 80000 },
  APAC: { Web: 300000, Partner: 100000, Retail: 100000 },
  LATAM: { Web: 60000, Partner: 50000, Retail: 50000 },
};
const ROWS = Object.entries(REVENUES).flatMap(([region, channels]) =>
  Object.entries(channels).map(([channel, revenue]) => ({
    [REGION]: region,
    [CHANNEL]: channel,
    [REVENUE]: String(revenue),
  })),
);
const EMPTY: MarkingPredicate = { items: [], ranges: [] } as unknown as MarkingPredicate;

const spec = (
  chartType: 'stackedBar' | 'stackedArea',
  marking: RenderSpec['marking'],
): RenderSpec =>
  ({
    chartType,
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    rows: ROWS,
    options: { stack: 'percent' },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
    marking,
  }) as unknown as RenderSpec;

type Item = { value: number | null; itemStyle?: Record<string, unknown> };
type Series = { name: string; type: string; stack?: string; data: unknown[] };
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];
const item = (raw: unknown): Item =>
  (typeof raw === 'object' && raw !== null ? raw : { value: raw }) as Item;
const EMEA = 0;
const emeaTotal = Object.values(REVENUES['EMEA'] ?? {}).reduce((sum, value) => sum + value, 0);
const shareOf = (channel: string) => ((REVENUES['EMEA']?.[channel] ?? 0) / emeaTotal) * 100;

describe('a 100 % stacked segment marked as its tuple (AC-585)', () => {
  it('outlines the one (Region, Channel) segment a tuple names and fades the rest', () => {
    const predicate = {
      ...EMPTY,
      items: [
        [
          { member: REGION, value: 'EMEA' },
          { member: CHANNEL, value: 'Partner' },
        ],
      ],
    } as unknown as MarkingPredicate;
    const option = optionFor(spec('stackedBar', { predicate, colour: MARKING }));
    const styleAt = (name: string, at: number) =>
      item(seriesOf(option).find((one) => one.name === name)?.data[at]).itemStyle ?? {};

    expect(styleAt('Partner', EMEA)).toMatchObject({
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    // Neither the bar's other segments nor the Channel's other bars.
    expect(styleAt('Web', EMEA)['opacity']).toBe(UNMARKED_OPACITY);
    expect(styleAt('Partner', 1)['opacity']).toBe(UNMARKED_OPACITY);
  });
});

describe('a 100 % segment partly marked by another tile (AC-585)', () => {
  /** Another tile's marking covers half of EMEA · Partner's revenue. */
  const share = [{ [REGION]: 'EMEA', [CHANNEL]: 'Partner', [REVENUE]: '60000' }];
  const marking = {
    predicate: {
      ...EMPTY,
      items: [[{ member: 'orders.status', value: 'paid' }]],
    } as unknown as MarkingPredicate,
    colour: MARKING,
    share,
    aggTypes: { [REVENUE]: 'sum' },
  };

  it('draws the marked part as its fraction of the segment, from the segment’s own base', () => {
    const series = seriesOf(optionFor(spec('stackedBar', marking)));
    const partner = series.flatMap((one, at) => (one.name === 'Partner' ? [at] : []));
    expect(partner).toHaveLength(2);
    const [markedAt, restAt] = partner as [number, number];
    const marked = item(series[markedAt]?.data[EMEA]).value ?? 0;
    const rest = item(series[restAt]?.data[EMEA]).value ?? 0;

    // Half of the segment, which is Partner's share of EMEA: never half of the bar.
    expect(marked).toBeCloseTo(shareOf('Partner') / 2, 9);
    expect(marked + rest).toBeCloseTo(shareOf('Partner'), 9);

    // From the segment's own base: in the bar's one stack, the marked part
    // straight after every segment below Partner and before Partner's rest.
    const stack = series[markedAt]?.stack;
    expect(series[restAt]?.stack).toBe(stack);
    expect(restAt).toBe(markedAt + 1);
    const below = series
      .slice(0, markedAt)
      .filter((one) => one.stack === stack)
      .reduce((sum, one) => sum + (item(one.data[EMEA]).value ?? 0), 0);
    expect(below).toBeCloseTo(shareOf('Web'), 9);
    expect(item(series[markedAt]?.data[EMEA]).itemStyle).toMatchObject({
      borderColor: MARKING,
      opacity: 1,
    });
  });

  it('draws an area’s marked share on the segment’s base, a fraction of the segment', () => {
    const series = seriesOf(optionFor(spec('stackedArea', marking)));
    // The full-strength line over Partner's band, unstacked: its base plus its marked part.
    const line = series.find((one) => one.name === 'Partner' && one.stack === undefined);
    expect(item(line?.data[EMEA]).value).toBeCloseTo(shareOf('Web') + shareOf('Partner') / 2, 9);
  });
});
