/**
 * T044 / AC-037: the combo chart, and the last of the eighteen types.
 *
 * A combo draws some measures as bars and some as a line. The thing to hold
 * on to is that both go against **one** value axis: direction.md is explicit
 * that the recommender never proposes a dual axis, because two scales in one
 * frame let any two series be made to look related. So the test checks that
 * the two measures share a scale, not merely that one of each mark appears.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { comboOption } from './combo';
import { marksOf, renderToSvg, strokesOf } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const PALETTE = [BLUE, ORANGE];

const STATUS = 'orders.status';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const draw = (spec: RenderSpec) => renderToSvg(comboOption(spec));

/**
 * The second measure is ten times the first, which is what makes a shared
 * axis visible: on one scale the bars are short and the line sits high.
 */
const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [STATUS], y: [COUNT, AMOUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 10, [AMOUNT]: 100 },
    { [STATUS]: 'refunded', [COUNT]: 20, [AMOUNT]: 200 },
  ],
  palette: PALETTE,
};

describe('combo', () => {
  it('draws the first measure as bars', () => {
    expect(marksOf(draw(spec), [BLUE])).toHaveLength(2);
  });

  it('draws the second measure as a line', () => {
    const lines = strokesOf(draw(spec), [ORANGE]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.points).toHaveLength(2);
  });

  it('draws bars and a line at once, not one or the other', () => {
    const svg = draw(spec);

    expect(marksOf(svg, [BLUE]).length).toBeGreaterThan(0);
    expect(strokesOf(svg, [ORANGE]).length).toBeGreaterThan(0);
  });
});

describe('one value axis', () => {
  it('measures both series against the same scale', () => {
    const svg = draw(spec);
    const bars = marksOf(svg, [BLUE]);
    const line = strokesOf(svg, [ORANGE])[0];

    const tallestBar = Math.min(...bars.map((bar) => bar.top));
    const highestPoint = Math.min(...(line?.points ?? []).map(([, y]) => y));

    // The amounts are ten times the counts, so on one axis the line sits well
    // above every bar. With a second axis each series would be scaled to fill
    // the frame and the two would overlap — which is the readability problem
    // direction.md rules out.
    expect(highestPoint).toBeLessThan(tallestBar);
  });

  it('still shares the scale when the bars are the larger series', () => {
    const flipped: RenderSpec = {
      ...spec,
      encoding: { x: [STATUS], y: [AMOUNT, COUNT] },
    };
    const svg = draw(flipped);
    const bars = marksOf(svg, [BLUE]);
    const line = strokesOf(svg, [ORANGE])[0];

    const tallestBar = Math.min(...bars.map((bar) => bar.top));
    const highestPoint = Math.min(...(line?.points ?? []).map(([, y]) => y));

    // Now the bars are the big series, so the relationship reverses. A chart
    // that scaled each series independently would look identical both ways.
    expect(tallestBar).toBeLessThan(highestPoint);
  });
});

describe('a combo with only one measure', () => {
  it('draws it as bars and no line', () => {
    const single: RenderSpec = { ...spec, encoding: { x: [STATUS], y: [COUNT] } };
    const svg = draw(single);

    // There is nothing to combine, and inventing a second series would be
    // drawing data that was never asked for.
    expect(marksOf(svg, [BLUE])).toHaveLength(2);
    expect(strokesOf(svg, PALETTE)).toHaveLength(0);
  });
});
