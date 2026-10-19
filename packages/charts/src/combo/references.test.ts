/**
 * T863 (AC-508; design 20 pins 15 and 16, state F3; direction.md §7h): a
 * combo's reference lines and bands as drawn. A fixed line 1.5 px, dashed
 * 5 4, in text-secondary; a computed one dashed in its series' colour; a
 * band filled bg-subtle with no edge, below every series; reference lines
 * over the points; each labelled in the chart in text-xs text-primary on a
 * 3 px surface halo, never in the legend; a label that would meet another
 * moved to its line's other end, then 16 px inward; and one outside its
 * axis's range not drawn, and said to be.
 */
import { describe, expect, it } from 'vitest';

import type { ComboReference, RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { optionFor } from '../optionFor';
import { labelsOf, renderToSvg } from '../testing/renderToSvg';
import { COMBO_Z } from '../theme';
import { referenceDrawing, referencesOutside, type ReferenceContext } from './references';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const SURFACE = '#ffffff';

const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, MARGIN] },
  rows: [
    { [MONTH]: '2026-01-01T00:00:00.000', [REVENUE]: 120_000, [MARGIN]: 0.2 },
    { [MONTH]: '2026-02-01T00:00:00.000', [REVENUE]: 150_000, [MARGIN]: 0.3 },
  ],
  palette: [BLUE, ORANGE],
  formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [MARGIN]: 'Margin %' },
  options: { series: { [MARGIN]: { mark: 'line', axis: 'right' } } },
};

const line = (over: Partial<ComboReference> = {}): ComboReference => ({
  id: 'plan',
  kind: 'line',
  direction: 'horizontal',
  axis: 'left',
  value: 100_000,
  label: 'Monthly plan',
  ...over,
});

const context = (over: Partial<ReferenceContext> = {}): ReferenceContext => ({
  categories: ['2026-01-01T00:00:00.000', '2026-02-01T00:00:00.000'],
  extents: { left: { min: 0, max: 160_000 }, right: { min: 0, max: 0.4 } },
  log: { left: false, right: false },
  plotHeight: 320,
  colourOf: (measure) => (measure === MARGIN ? ORANGE : BLUE),
  surface: SURFACE,
  write: (_reference, value) => String(value),
  ...over,
});

type MarkLine = {
  lineStyle?: { width?: number; type?: number[]; color?: string };
  label?: {
    position?: string;
    color?: string;
    fontSize?: number;
    textBorderColor?: string;
    textBorderWidth?: number;
    offset?: number[];
    formatter?: string;
  };
  data?: Record<string, unknown>[];
};
type Carrier = {
  name?: string;
  z?: number;
  yAxisIndex?: number;
  markLine?: MarkLine;
  markArea?: { itemStyle?: { color?: string; borderWidth?: number }; data?: unknown[] };
};
const drawnOf = (references: ComboReference[], over: Partial<ReferenceContext> = {}) =>
  referenceDrawing({ ...spec, options: { ...spec.options, references } }, context(over));

describe('reference lines and bands as drawn (T863)', () => {
  it('draws a fixed line 1.5 px, dashed 5 4, in text-secondary, over the points', () => {
    const [carrier] = drawnOf([line()]).series as Carrier[];

    expect(carrier?.markLine?.lineStyle).toEqual({
      width: 1.5,
      type: [5, 4],
      color: COLORS.light['text-secondary'],
    });
    expect(carrier?.markLine?.data).toEqual([{ yAxis: 100_000 }]);
    expect(carrier?.yAxisIndex).toBe(0);
    expect(carrier?.z).toBeGreaterThan(COMBO_Z.point);
  });

  it('draws a line from Margin %’s average dashed in Margin %’s colour, on the right axis', () => {
    const average = line({ id: 'avg', axis: 'right', stat: 'average', series: MARGIN, label: 'Avg' });
    delete (average as { value?: unknown }).value;
    const [carrier] = drawnOf([average]).series as Carrier[];

    expect(carrier?.markLine?.lineStyle?.color).toBe(ORANGE);
    expect(carrier?.markLine?.lineStyle?.type).toEqual([5, 4]);
    expect(carrier?.markLine?.data?.[0]?.['yAxis']).toBeCloseTo(0.25);
    expect(carrier?.yAxisIndex).toBe(1);
  });

  it('fills a band bg-subtle with no edge, below every series', () => {
    const band: ComboReference = {
      id: 'range',
      kind: 'band',
      direction: 'horizontal',
      axis: 'left',
      from: 90_000,
      to: 120_000,
      label: 'Target range',
    };
    const [carrier] = drawnOf([band]).series as Carrier[];

    expect(carrier?.markArea?.itemStyle).toEqual({
      color: COLORS.light['bg-subtle'],
      borderWidth: 0,
    });
    expect(carrier?.markArea?.data).toEqual([[{ yAxis: 90_000 }, { yAxis: 120_000 }]]);
    expect(carrier?.z).toBeLessThan(COMBO_Z.area);
  });

  it('labels each in text-xs text-primary on a 3 px surface halo, with its value while shown', () => {
    const [carrier] = drawnOf([line({ showValue: true })], {
      write: () => '$100K',
    }).series as Carrier[];

    expect(carrier?.markLine?.label).toEqual({
      show: true,
      position: 'insideEndTop',
      offset: [0, 0],
      color: COLORS.light['text-primary'],
      fontSize: 12,
      lineHeight: 16,
      textBorderColor: SURFACE,
      textBorderWidth: 3,
      formatter: 'Monthly plan · $100K',
    });
  });

  it('keeps reference lines out of the legend', () => {
    const option = optionFor({ ...spec, options: { ...spec.options, references: [line()] } });
    const legend = option['legend'] as { data?: { name: string }[] };

    expect(legend.data?.map((one) => one.name)).toEqual([REVENUE, MARGIN]);
    const carriers = (option['series'] as Carrier[]).filter((one) => one.markLine !== undefined);
    expect(carriers).toHaveLength(1);
  });

  it('moves a label meeting another to its line’s other end, then 16 px inward', () => {
    // 2 px apart on a 320 px plot of 0–160,000: 1,000 apart.
    const drawn = drawnOf([
      line({ id: 'a', value: 100_000, label: 'A' }),
      line({ id: 'b', value: 101_000, label: 'B' }),
      line({ id: 'c', value: 102_000, label: 'C' }),
    ]).series as Carrier[];
    const labels = drawn.map((one) => [one.markLine?.label?.position, one.markLine?.label?.offset]);

    expect(labels).toEqual([
      ['insideEndTop', [0, 0]],
      ['insideStartTop', [0, 0]],
      ['insideEndTop', [-16, 0]],
    ]);
  });

  it('leaves a line outside its axis’s range undrawn, and names it', () => {
    const drawn = drawnOf([line({ id: 'far', value: 500_000 }), line()]);

    expect((drawn.series as Carrier[]).map((one) => one.markLine?.data)).toEqual([
      [{ yAxis: 100_000 }],
    ]);
    expect(drawn.outside).toEqual(['far']);
  });

  it('leaves a line at or below zero off a log axis', () => {
    const drawn = drawnOf([line({ id: 'zero', value: 0 })], {
      log: { left: true, right: true },
      extents: {},
    });

    expect(drawn.series).toEqual([]);
    expect(drawn.outside).toEqual(['zero']);
  });

  it('draws a vertical line at the month it names, and leaves one at no month out', () => {
    const drawn = drawnOf([
      line({ id: 'feb', direction: 'vertical', value: '2026-02', label: 'Price change' }),
      line({ id: 'sep', direction: 'vertical', value: '2026-09', label: 'Later' }),
    ]);

    expect((drawn.series as Carrier[]).map((one) => one.markLine?.data)).toEqual([
      [{ xAxis: '2026-02-01T00:00:00.000' }],
    ]);
    expect(drawn.outside).toEqual(['sep']);
  });

  it('draws the line, dashed, and its label in the SVG', () => {
    const svg = renderToSvg(
      optionFor({ ...spec, options: { ...spec.options, references: [line()] } }),
    );

    expect(svg).toMatch(/stroke-dasharray="5[ ,]4"/);
    expect(labelsOf(svg).map((label) => label.text)).toContain('Monthly plan');
  });

  it('names what the chart as drawn leaves out, as the editor’s rows say it', () => {
    expect(
      referencesOutside({
        ...spec,
        options: { ...spec.options, references: [line({ id: 'far', value: 5_000_000 }), line()] },
      }),
    ).toEqual(['far']);
  });
});
