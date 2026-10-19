import type { MarkingPredicate, ParallelBrush, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import {
  brushedWords,
  membersBrushed,
  parallelAxesOf,
  parallelBrushOf,
  withBrush,
} from './parallelBrush';

/**
 * T983 / AC-599: THE SYSTEM SHALL mark a parallel-coordinate line as its
 * member on a click; and WHEN the author drags along an axis, brush that
 * range, marking the members whose lines pass through every brushed range,
 * Ctrl/⌘ adding a brush, stored as a member list of at most 1,000 (AC-102),
 * not a measure range; and as a cross-filter source filter the others to the
 * brushed members with one chip ("Product: 6 brushed in Margin %").
 * `Fails when: a member whose line misses a brushed range is marked; the
 * marking stores a measure range; a second brush replaces the first while
 * Ctrl/⌘ is held; or the chip reads otherwise.`
 *
 * wechart's own brush over ECharts' series (research/echarts-parallel-brush.md):
 * a drag along an axis read off the axes as laid out, the members passing
 * every brush found from the rows drawn.
 */
const PRODUCT = 'products.name';
const REVENUE = 'products.revenue';
const MARGIN = 'products.margin';
const RETURNS = 'products.return_rate';
const MARKING = '#d9480f';

/** 14 products: P1–P6 inside Margin % 22–26 %, and of those P1–P4 inside Return rate 0–2 %. */
const MARGINS = [0.22, 0.23, 0.24, 0.25, 0.26, 0.235, 0.1, 0.12, 0.15, 0.18, 0.2, 0.3, 0.32, 0.35];
const RETURN_RATES = [
  0, 0.01, 0.015, 0.02, 0.05, 0.06, 0.01, 0.02, 0.03, 0.04, 0.05, 0.01, 0, 0.07,
];

const spec = (extra: Partial<RenderSpec> = {}): RenderSpec =>
  ({
    chartType: 'parallel',
    encoding: { x: [PRODUCT], y: [REVENUE, MARGIN, RETURNS] },
    rows: MARGINS.map((margin, at) => ({
      [PRODUCT]: `P${String(at + 1)}`,
      [REVENUE]: String(1000 + at * 100),
      [MARGIN]: String(margin),
      [RETURNS]: String(RETURN_RATES[at]),
    })),
    formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [RETURNS]: 'percent' },
    titles: {
      [PRODUCT]: 'Product',
      [REVENUE]: 'Revenue',
      [MARGIN]: 'Margin %',
      [RETURNS]: 'Return rate',
    },
    ...extra,
  }) as unknown as RenderSpec;

const MARGIN_BRUSH: ParallelBrush = { member: MARGIN, from: 0.22, to: 0.26 };
const RETURNS_BRUSH: ParallelBrush = { member: RETURNS, from: 0, to: 0.02 };
const SIZE = { width: 600, height: 400 };

describe('brushing along a parallel axis (AC-599)', () => {
  it('reads a drag along an axis as a range of its measure', () => {
    const option = optionFor(spec(), SIZE);
    const axes = parallelAxesOf(spec(), option, SIZE);
    const margin = axes.find((axis) => axis.member === MARGIN)!;
    const shape = {
      kind: 'rect',
      x0: margin.x - 4,
      y0: margin.yOf(0.26),
      x1: margin.x + 4,
      y1: margin.yOf(0.22),
    } as const;
    const brush = parallelBrushOf(spec(), option, SIZE, shape);
    expect(brush?.member).toBe(MARGIN);
    expect(brush?.from).toBeCloseTo(0.22, 6);
    expect(brush?.to).toBeCloseTo(0.26, 6);
    // Read off the option as ECharts gives it back too, its box a list of one.
    const given = { ...option, parallel: [option['parallel']] };
    expect(parallelBrushOf(spec(), given, SIZE, shape)).toEqual(brush);
    // A drag between the axes, nearer none, brushes nothing.
    const between = (axes[0]!.x + axes[1]!.x) / 2;
    expect(
      parallelBrushOf(spec(), option, SIZE, { ...shape, x0: between - 2, x1: between + 2 }),
    ).toBeUndefined();
  });

  it('marks the members passing every brushed range: 6 through Margin %, 4 through both', () => {
    expect(membersBrushed(spec(), [MARGIN_BRUSH])).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const both = withBrush([MARGIN_BRUSH], RETURNS_BRUSH, true);
    expect(both).toEqual([MARGIN_BRUSH, RETURNS_BRUSH]);
    expect(membersBrushed(spec(), both)).toEqual(['P1', 'P2', 'P3', 'P4']);
    // Without Ctrl/⌘, a new brush replaces the others; on the same axis, it
    // replaces that axis's.
    expect(withBrush([MARGIN_BRUSH], RETURNS_BRUSH, false)).toEqual([RETURNS_BRUSH]);
    expect(withBrush(both, { ...MARGIN_BRUSH, to: 0.3 }, true)).toEqual([
      RETURNS_BRUSH,
      { ...MARGIN_BRUSH, to: 0.3 },
    ]);
  });

  it('says what it brushed in the chip’s words', () => {
    expect(brushedWords(spec(), [MARGIN_BRUSH], 6)).toBe('Product: 6 brushed in Margin %');
    expect(brushedWords(spec(), [MARGIN_BRUSH, RETURNS_BRUSH], 4)).toBe(
      'Product: 4 brushed in Margin % and Return rate',
    );
  });

  it('draws each brush as a band on its axis, and keeps ECharts’ own brush from starting', () => {
    const option = optionFor(spec({ parallelBrushes: [MARGIN_BRUSH] }), SIZE);
    const bands = (
      (option['graphic'] as { type: string; name?: string }[] | undefined) ?? []
    ).filter((one) => one.type === 'rect' && one.name === 'parallel-brush');
    expect(bands).toHaveLength(1);
    const axes = option['parallelAxis'] as { areaSelectStyle?: { width?: number } }[];
    for (const axis of axes) expect(axis.areaSelectStyle?.width).toBe(0);
    expect(() => renderToSvg(option, SIZE)).not.toThrow();
  });
});

describe('a marked parallel line (AC-599)', () => {
  it('carries its member, as a click on it marks it', () => {
    const series = optionFor(spec(), SIZE)['series'] as { data: { marks?: unknown }[] }[];
    expect(series[0]?.data[0]?.marks).toEqual([{ member: PRODUCT, value: 'P1' }]);
  });

  it('draws the marked members’ lines at full strength and fades the rest', () => {
    const marked = spec({
      marking: {
        colour: MARKING,
        predicate: {
          items: ['P1', 'P2'].map((value) => [{ member: PRODUCT, value }]),
          ranges: [],
        } as unknown as MarkingPredicate,
      },
    });
    const series = optionFor(marked, SIZE)['series'] as {
      data: { lineStyle?: { opacity?: number } }[];
    }[];
    const opacities = series[0]!.data.map((line) => line.lineStyle?.opacity);
    expect(opacities.slice(0, 3)).toEqual([1, 1, UNMARKED_OPACITY]);
  });
});
