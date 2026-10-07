import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import { labelsOf, renderToSvg } from '../testing/renderToSvg';
import { hiddenLabelShare } from './hiddenLabels';

/**
 * T516 (AC-036, AC-187; UX-117's second half; R67, the user): the share of a
 * vertical bar's category labels ECharts would hide at a tile's size, even
 * turned 90°: what the recommender reads to offer the horizontal bar second
 * when more than half would be hidden. It is ECharts' own reckoning
 * (`calculateCategoryInterval`; research `echarts-category-labels.md`), so it
 * agrees with what a drawn chart names.
 */
const PRODUCT = 'orders.product';
const AMOUNT = 'orders.amount';
const bar = (names: readonly string[], chartType: RenderSpec['chartType'] = 'bar'): RenderSpec => ({
  chartType,
  encoding: { x: [PRODUCT], y: [AMOUNT] },
  rows: names.map((name, at) => ({ [PRODUCT]: name, [AMOUNT]: 1000 - at })),
  palette: ['#123456'],
});
const many = Array.from({ length: 60 }, (_, at) => `Product number ${String(at + 1)}`);
const few = ['North', 'South', 'East', 'West'];
const SMALL = { width: 360, height: 260 };

describe('the share of category labels a bar would hide (T516)', () => {
  it('is none where they fit, level or turned', () => {
    expect(hiddenLabelShare(bar(few), SMALL)).toBe(0);
    const ten = Array.from({ length: 10 }, (_, at) => `A longer product name ${String(at)}`);
    expect(hiddenLabelShare(bar(ten), SMALL)).toBe(0);
  });

  it('is more than half where even 90° keeps fewer than half, as the drawn chart names them', () => {
    const share = hiddenLabelShare(bar(many), SMALL);
    expect(share).toBeGreaterThan(0.5);
    const named = labelsOf(renderToSvg(optionFor(bar(many), SMALL), SMALL)).filter((label) =>
      many.includes(label.text),
    ).length;
    // ECharts' own: the chart names about as many as the share leaves.
    expect(Math.abs(named / many.length - (1 - share))).toBeLessThan(0.1);
  });

  it('is reckoned as a vertical bar of the same fields, whatever the type drawn', () => {
    expect(hiddenLabelShare(bar(many, 'groupedBar'), SMALL)).toBe(
      hiddenLabelShare(bar(many), SMALL),
    );
    expect(hiddenLabelShare(bar(many, 'hbar'), SMALL)).toBe(hiddenLabelShare(bar(many), SMALL));
  });

  it('is none for a chart with no category across', () => {
    const measuresOnly: RenderSpec = { chartType: 'kpi', encoding: { y: [AMOUNT] }, rows: [] };
    expect(hiddenLabelShare(measuresOnly, SMALL)).toBe(0);
  });
});
