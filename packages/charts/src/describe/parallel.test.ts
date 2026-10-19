import type { MarkingPredicate, ParallelBrush, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { describeChart } from './index';
import { describeParallel } from './parallel';

/**
 * T985 / AC-601: THE SYSTEM SHALL give parallel coordinates a text
 * alternative naming the members, measures, scale and any brush ("Parallel
 * coordinates of 14 products across 5 measures, each axis min to max. 6
 * marked through Margin % 22–26 %.") …
 * `Fails when: a part of the text alternative is missing, …`
 */
const PRODUCT = 'products.name';
const MEASURES = [
  'products.revenue',
  'products.margin',
  'products.units',
  'products.cost',
  'products.returns',
];
const MARGINS = [0.22, 0.23, 0.24, 0.25, 0.26, 0.235, 0.1, 0.12, 0.15, 0.18, 0.2, 0.3, 0.32, 0.35];

const spec = (extra: Partial<RenderSpec> = {}): RenderSpec =>
  ({
    chartType: 'parallel',
    encoding: { x: [PRODUCT], y: MEASURES },
    rows: MARGINS.map((margin, at) => ({
      [PRODUCT]: `P${String(at + 1)}`,
      'products.revenue': String(1000 + at),
      'products.margin': String(margin),
      'products.units': String(10 + at),
      'products.cost': String(500 + at),
      'products.returns': String(at % 3),
    })),
    formats: { 'products.margin': 'percent' },
    titles: {
      [PRODUCT]: 'Product',
      'products.revenue': 'Revenue',
      'products.margin': 'Margin %',
      'products.units': 'Units',
      'products.cost': 'Cost',
      'products.returns': 'Returns',
    },
    ...extra,
  }) as unknown as RenderSpec;

const MARGIN_BRUSH: ParallelBrush = { member: 'products.margin', from: 0.22, to: 0.26 };

describe('parallel coordinates’ text alternative (AC-601)', () => {
  it('names its members, measures and scale', () => {
    expect(describeParallel(spec())).toBe(
      'Parallel coordinates of 14 products across 5 measures, each axis min to max.',
    );
    expect(describeChart(spec())).toBe(describeParallel(spec()));
    expect(
      describeParallel(spec({ options: { parallel: { scale: 'shared' } }, formats: {} })),
    ).toBe('Parallel coordinates of 14 products across 5 measures, on one shared scale.');
  });

  it('says how many are marked through which brushes', () => {
    const brushed = spec({
      parallelBrushes: [MARGIN_BRUSH],
      marking: {
        colour: '#000',
        predicate: {
          items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((value) => [{ member: PRODUCT, value }]),
          ranges: [],
        } as unknown as MarkingPredicate,
      },
    });
    expect(describeParallel(brushed)).toBe(
      'Parallel coordinates of 14 products across 5 measures, each axis min to max. 6 marked through Margin % 22%–26%.',
    );
  });

  it('says how many are marked without a brush', () => {
    const clicked = spec({
      marking: {
        colour: '#000',
        predicate: {
          items: [[{ member: PRODUCT, value: 'P3' }]],
          ranges: [],
        } as unknown as MarkingPredicate,
      },
    });
    expect(describeParallel(clicked)).toMatch(/ 1 marked\.$/);
  });
});
