import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { DRAWABLE_TYPES, isDrawable, optionFor } from './optionFor';
import { marksOf, pointsOf, renderToSvg, sectorsOf } from './testing/renderToSvg';

/**
 * AC-037: one entry point from a spec to a drawable option.
 *
 * The renderers are per family; something has to choose between them, and that
 * choice is what the app calls. A dispatcher that quietly fell back to one
 * family for an unknown type would draw the wrong chart rather than say it
 * cannot draw it, so the unknown case is checked too.
 */
const PALETTE = ['#123456', '#abcdef'];

/**
 * Scatter is the one family whose x axis is a measure, so it needs a numeric
 * x or every row is legitimately dropped for want of a coordinate. Giving it
 * the categorical fixture would test nothing but the drop rule.
 */
const spec = (chartType: RenderSpec['chartType']): RenderSpec =>
  chartType === 'scatter'
    ? {
        chartType,
        encoding: { x: ['orders.total'], y: ['orders.count'] },
        rows: [
          { 'orders.total': 5, 'orders.count': 10 },
          { 'orders.total': 9, 'orders.count': 30 },
        ],
        palette: PALETTE,
      }
    : {
        chartType,
        encoding: { x: ['orders.status'], y: ['orders.count'] },
        rows: [
          { 'orders.status': 'paid', 'orders.count': 10 },
          { 'orders.status': 'refunded', 'orders.count': 30 },
        ],
        palette: PALETTE,
      };

describe('every drawable type produces marks', () => {
  for (const chartType of DRAWABLE_TYPES) {
    it(`draws ${chartType}`, () => {
      const svg = renderToSvg(optionFor(spec(chartType)));

      // Each family leaves a different trace, so "something was drawn" has to
      // be asked of each in its own terms.
      const drew =
        marksOf(svg, PALETTE).length > 0 ||
        pointsOf(svg, PALETTE).length > 0 ||
        sectorsOf(svg, PALETTE).length > 0 ||
        svg.includes(`stroke="${PALETTE[0] ?? ''}"`);

      expect(drew).toBe(true);
    });
  }
});

describe('a type nothing can draw yet', () => {
  it('is reported rather than drawn as something else', () => {
    // 'treemap' is in the AC-037 vocabulary but has no renderer yet. Falling
    // back to a bar would put a chart on screen that the spec never asked for.
    expect(isDrawable('treemap')).toBe(false);
    expect(() => optionFor(spec('treemap'))).toThrow(/treemap/);
  });

  it('agrees with its own list', () => {
    for (const chartType of DRAWABLE_TYPES) {
      expect(isDrawable(chartType)).toBe(true);
    }
  });
});
