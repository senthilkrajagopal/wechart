/**
 * T037 / AC-037: scatter.
 *
 * The criterion's own wording for this one is that the points render "with
 * both value axes bound". That is the whole difficulty: every other chart so
 * far has a category axis, and a chart that merely draws points against two
 * axes could still be putting one of them on a categorical scale. The test
 * that tells them apart is spacing — on a value axis the gap between 20 and 40
 * is twice the gap between 10 and 20, and on a category axis all three are
 * evenly spaced.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { scatterOption } from './scatter';
import { optionFor } from '../optionFor';
import { pointsOf, renderToSvg, type Point } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const PALETTE = [BLUE, ORANGE];

const COUNT = 'orders.count';
const AMOUNT = 'orders.total_amount';
const REGION = 'orders.region';

const draw = (spec: RenderSpec) => renderToSvg(scatterOption(spec));

/** Unevenly spaced on purpose: even spacing cannot distinguish the scales. */
const spec: RenderSpec = {
  chartType: 'scatter',
  encoding: { x: [COUNT], y: [AMOUNT] },
  rows: [
    { [COUNT]: 10, [AMOUNT]: 100 },
    { [COUNT]: 20, [AMOUNT]: 200 },
    { [COUNT]: 40, [AMOUNT]: 150 },
  ],
  palette: PALETTE,
};

describe('scatter', () => {
  it('draws one point per row', () => {
    expect(pointsOf(draw(spec), PALETTE)).toHaveLength(3);
  });

  it('pairs each point with its own row, not with a reordered one', () => {
    const byX = pointsOf(draw(spec), PALETTE).sort((a, b) => a.x - b.x);
    const [atTen, atTwenty, atForty] = byX as [Point, Point, Point];

    // x = 10, 20, 40 pairs with y = 100, 200, 150. Screen y runs the other
    // way, so read left to right the points go low, high, middle. A renderer
    // that sorted the rows by either measure would produce a monotonic run.
    expect(atTen.y).toBeGreaterThan(atForty.y);
    expect(atForty.y).toBeGreaterThan(atTwenty.y);
  });

  it('binds x to a value scale, not a category scale', () => {
    const [first, second, third] = pointsOf(draw(spec), PALETTE).sort((a, b) => a.x - b.x) as [
      Point,
      Point,
      Point,
    ];

    // x = 10, 20, 40. On a value axis the second gap is twice the first; on a
    // category axis the two gaps are equal.
    const firstGap = second.x - first.x;
    const secondGap = third.x - second.x;
    expect(secondGap / firstGap).toBeCloseTo(2, 1);
  });

  it('binds y to a value scale too, with larger values higher up', () => {
    const points = pointsOf(draw(spec), PALETTE).sort((a, b) => a.x - b.x);
    const [atTen, atTwenty, atForty] = points as [Point, Point, Point];

    // y = 100, 200, 150, and smaller screen y is higher. 200 is the peak.
    expect(atTwenty.y).toBeLessThan(atForty.y);
    expect(atForty.y).toBeLessThan(atTen.y);
  });

  it('draws markers no smaller than direction.md §6 allows', () => {
    for (const point of pointsOf(draw(spec), PALETTE)) {
      expect(point.diameterPx).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('a scatter split by a dimension', () => {
  const split: RenderSpec = {
    chartType: 'scatter',
    encoding: { x: [COUNT], y: [AMOUNT], color: [REGION] },
    rows: [
      { [COUNT]: 10, [AMOUNT]: 100, [REGION]: 'east' },
      { [COUNT]: 20, [AMOUNT]: 200, [REGION]: 'west' },
      { [COUNT]: 40, [AMOUNT]: 150, [REGION]: 'east' },
    ],
    palette: PALETTE,
  };

  it('gives each member its own colour', () => {
    const points = pointsOf(draw(split), PALETTE);

    expect(points.filter((point) => point.fill === BLUE)).toHaveLength(2);
    expect(points.filter((point) => point.fill === ORANGE)).toHaveLength(1);
  });

  it('still draws every row, not one point per member', () => {
    expect(pointsOf(draw(split), PALETTE)).toHaveLength(3);
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it … and never by its internal name.
 */
describe('a scatter’s axes (AC-220)', () => {
  it('are named by their measures’ titles, never their names', () => {
    const titles = { [COUNT]: 'Orders Count', [AMOUNT]: 'Orders Total Amount' };
    const option = scatterOption({ ...spec, titles }) as {
      xAxis?: { name?: string };
      yAxis?: { name?: string };
    };
    expect([option.xAxis?.name, option.yAxis?.name]).toEqual([
      'Orders Count',
      'Orders Total Amount',
    ]);
  });

  // T232's review: unsplit, the one series is the y measure, and its tooltip
  // heading read "orders.total_amount".
  it('heads an unsplit point’s tooltip by the measure’s title', () => {
    const titles = { [COUNT]: 'Orders Count', [AMOUNT]: 'Orders Total Amount' };
    const option = optionFor({ ...spec, titles }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    const said = option.tooltip?.formatter?.({ seriesName: AMOUNT, value: [10, 100] }) ?? '';
    expect(said.split('<br/>')[0]).toBe('Orders Total Amount');
    expect(said).not.toContain(AMOUNT);
  });
});
