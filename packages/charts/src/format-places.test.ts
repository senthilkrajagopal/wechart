/**
 * T052 / AC-046: THE SYSTEM SHALL format every value with its member's format
 * from the Cube model, including currency and percentage, in **axes, labels,
 * tooltips and tables**.
 *
 * `format.test.ts` in core proves the formatter. This proves the four places,
 * because a formatter nothing calls formats nothing — and the criterion names
 * the places for a reason: the same number appearing as `1234` on an axis and
 * `$1,234.00` in the table of the same chart is exactly the failure.
 *
 * Tables are covered in `packages/web` where they are rendered.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { tooltipFor } from './tooltip';
import { labelsOf, renderToSvg } from './testing/renderToSvg';

const STATUS = 'orders.status';
const AMOUNT = 'orders.total_amount';

const spec: RenderSpec = {
  chartType: 'bar',
  encoding: { x: [STATUS], y: [AMOUNT] },
  rows: [
    { [STATUS]: 'paid', [AMOUNT]: 1000 },
    { [STATUS]: 'refunded', [AMOUNT]: 4000 },
  ],
  palette: ['#123456'],
  formats: { [AMOUNT]: 'currency' },
};

/** The chart's tooltip formatter, as ECharts would call it. */
const tooltipOf = (rendered: RenderSpec) =>
  (optionFor(rendered)['tooltip'] as { formatter: (params: unknown) => string }).formatter;

/** A scatter of two measures, each with its own format. */
const SHARE = 'orders.share';
const scatter: RenderSpec = {
  chartType: 'scatter',
  encoding: { x: [AMOUNT], y: [SHARE] },
  rows: [
    { [AMOUNT]: 1000, [SHARE]: 0.25 },
    { [AMOUNT]: 4000, [SHARE]: 0.75 },
  ],
  palette: ['#123456'],
  formats: { [AMOUNT]: 'currency', [SHARE]: 'percent' },
};

/** Small multiples of a currency measure, one panel per region. */
const trellis: RenderSpec = {
  chartType: 'trellis',
  encoding: { facet: ['orders.region'], x: [STATUS], y: [AMOUNT] },
  rows: [
    { 'orders.region': 'west', [STATUS]: 'paid', [AMOUNT]: 1000 },
    { 'orders.region': 'east', [STATUS]: 'paid', [AMOUNT]: 4000 },
  ],
  palette: ['#123456'],
  formats: { [AMOUNT]: 'currency' },
};

describe('the axis', () => {
  it('writes each of a scatter’s two measures on its own axis, its own way', () => {
    /**
     * T195. A scatter has two value axes, each a measure. Only one was ever
     * formatted, and with the y measure's format.
     */
    const labels = labelsOf(renderToSvg(optionFor(scatter))).map((label) => label.text);

    expect(labels.some((label) => /^\$[\d,]+/.test(label))).toBe(true);
    expect(labels.some((label) => /^\d+%$/.test(label))).toBe(true);
    // Neither measure wears the other's format: the share's fractions are not
    // written as money ("$0.25"). The money axis's own "$0.00" is its zero.
    expect(labels.some((label) => /^\$0\.(?!00$)\d+$/.test(label))).toBe(false);
  });

  it('writes a trellis panel’s values as money', () => {
    // A trellis was drawn without passing through the axis settings at all.
    const labels = labelsOf(renderToSvg(optionFor(trellis))).map((label) => label.text);

    expect(labels.some((label) => /^\$[\d,]+/.test(label))).toBe(true);
  });

  it('writes a currency measure as money', () => {
    const labels = labelsOf(renderToSvg(optionFor(spec))).map((label) => label.text);

    expect(labels.some((label) => label.startsWith('$'))).toBe(true);
  });

  it('leaves a measure with no declared format as a plain number', () => {
    const plain: RenderSpec = { ...spec, formats: {} };
    const labels = labelsOf(renderToSvg(optionFor(plain))).map((label) => label.text);

    // The format follows the member; without one there is nothing to follow.
    expect(labels.some((label) => label.startsWith('$'))).toBe(false);
  });

  it('formats the value axis of a horizontal bar, not its category axis', () => {
    /**
     * T194. A horizontal bar draws its value axis along x and its categories
     * down y, but the member's formatter was always hung on `yAxis`. So the
     * measure's values went unformatted and the measure's currency format was
     * applied to the *categories* — order ids reading "$1,234.00". Numeric
     * categories are used here so that mistake shows; with text categories a
     * currency formatter would pass them through looking untouched.
     *
     * It is reached without anyone choosing a horizontal bar: the recommender
     * turns a bar with more than fifty categories horizontal, and since T193 a
     * dashboard follows it.
     */
    const ORDER = 'orders.id';
    const horizontal: RenderSpec = {
      chartType: 'hbar',
      encoding: { x: [ORDER], y: [AMOUNT] },
      rows: [
        { [ORDER]: 1234, [AMOUNT]: 1000 },
        { [ORDER]: 5678, [AMOUNT]: 4000 },
      ],
      palette: ['#123456'],
      formats: { [AMOUNT]: 'currency' },
    };

    const labels = labelsOf(renderToSvg(optionFor(horizontal))).map((label) => label.text);

    // The categories are shown as they are…
    expect(labels).toContain('1234');
    expect(labels).not.toContain('$1,234.00');
    // …and the values as money.
    expect(labels.some((label) => /^\$[\d,]+/.test(label))).toBe(true);
  });

  it('gives way to an explicit axis setting, which is the more specific one', () => {
    const overridden: RenderSpec = {
      ...spec,
      options: { axes: { y: { numberFormat: 'compact' } } },
    };
    const labels = labelsOf(renderToSvg(optionFor(overridden))).map((label) => label.text);

    // AC-040's setting is the exception and the member's format the default,
    // not the other way round.
    expect(labels).toContain('4K');
  });
});

describe('found at T195’s review', () => {
  const SHARE_FORMATS = { [AMOUNT]: 'currency', [SHARE]: 'percent' };

  it('writes the crosshair’s value label in the measure’s format', () => {
    // A "cross" pointer labels both axes; the value axis's label read "4,000".
    const line: RenderSpec = { ...spec, chartType: 'line' };
    const yAxis = optionFor(line)['yAxis'] as {
      axisPointer: { label: { formatter: (params: { value: unknown }) => string } };
    };

    expect(yAxis.axisPointer.label.formatter({ value: 4000 })).toBe('$4,000.00');
  });

  it('keeps the measure’s format when the labels are rotated', () => {
    // A rotation replaced the axis's labels wholesale, formatter and all.
    const rotated: RenderSpec = { ...spec, options: { axes: { y: { tickRotation: 45 } } } };
    const labels = labelsOf(renderToSvg(optionFor(rotated))).map((label) => label.text);

    expect(labels.some((label) => /^\$[\d,]+/.test(label))).toBe(true);
  });

  it('formats a colour-split chart’s tooltip by the one measure it draws', () => {
    /**
     * Split by colour, a chart draws its first measure once per member, so
     * every series is that measure — the second series is not the second
     * measure, whose format made 76,900 read "7,690,000%".
     */
    const split: RenderSpec = {
      ...spec,
      encoding: { x: [STATUS], y: [AMOUNT, SHARE], color: ['orders.region'] },
      rows: [
        { [STATUS]: 'paid', 'orders.region': 'west', [AMOUNT]: 76900, [SHARE]: 0.25 },
        { [STATUS]: 'paid', 'orders.region': 'east', [AMOUNT]: 1000, [SHARE]: 0.75 },
      ],
      formats: SHARE_FORMATS,
    };
    const text = tooltipOf(split)({
      seriesName: 'east',
      name: 'paid',
      value: 76900,
      seriesIndex: 1,
    });

    expect(text).toBe('paid<br/>east: $76,900.00');
  });

  it('puts no one measure’s format on an axis shared by measures formatted differently', () => {
    // Decided (the user: breadth, not polish): one axis cannot honour two
    // formats, so it wears neither rather than misstating one measure — a
    // share read against "$0.25" ticks. Each keeps its format in the tooltip.
    const both: RenderSpec = {
      ...spec,
      chartType: 'groupedBar',
      encoding: { x: [STATUS], y: [AMOUNT, SHARE] },
      rows: [
        { [STATUS]: 'paid', [AMOUNT]: 1, [SHARE]: 0.25 },
        { [STATUS]: 'refunded', [AMOUNT]: 0.5, [SHARE]: 0.75 },
      ],
      formats: SHARE_FORMATS,
    };
    const labels = labelsOf(renderToSvg(optionFor(both))).map((label) => label.text);

    expect(labels.some((label) => label.startsWith('$'))).toBe(false);
    expect(labels.some((label) => label.endsWith('%'))).toBe(false);
  });

  it('leaves a heatmap’s category axes as they are', () => {
    // No value axis: a dimension's formatter was hung on the rows, grouping
    // the year 2024 into "2,024".
    const heatmap: RenderSpec = {
      chartType: 'heatmap',
      encoding: { x: [STATUS], y: ['orders.year'], color: [AMOUNT] },
      rows: [
        { [STATUS]: 'paid', 'orders.year': 2024, [AMOUNT]: 1000 },
        { [STATUS]: 'refunded', 'orders.year': 2025, [AMOUNT]: 250 },
      ],
      palette: ['#123456'],
      formats: { [AMOUNT]: 'currency' },
    };
    const labels = labelsOf(renderToSvg(optionFor(heatmap))).map((label) => label.text);

    expect(labels).toContain('2024');
    expect(labels).not.toContain('2,024');
  });
});

describe('data labels', () => {
  /**
   * T195. AC-046's "labels" are, today, the axis labels — formatted above.
   * No chart draws a value as a data label (pie, treemap and heatmap turn
   * theirs off), so no value is shown there unformatted. This holds that
   * true: a renderer that turns data labels on must give them the member's
   * formatter, or this fails.
   */
  const everyType = [
    spec,
    { ...spec, chartType: 'hbar' as const },
    { ...spec, chartType: 'line' as const },
    { ...spec, chartType: 'area' as const },
    { ...spec, chartType: 'pie' as const },
    { ...spec, chartType: 'donut' as const },
    { ...spec, chartType: 'treemap' as const },
    scatter,
    trellis,
  ];

  it('are shown by no chart without a formatter', () => {
    for (const drawn of everyType) {
      const series = optionFor(drawn)['series'] as {
        label?: { show?: boolean; formatter?: unknown };
      }[];
      for (const one of series) {
        if (one.label?.show === true) expect(typeof one.label.formatter).toBe('function');
        else expect(one.label?.show ?? false).toBe(false);
      }
    }
  });
});

describe('the tooltip', () => {
  it('exists at all, which it has to before it can carry a format', () => {
    expect(optionFor(spec)['tooltip']).toBeDefined();
  });

  it('writes the value the way its member declares', () => {
    const text = tooltipOf(spec)({ seriesName: AMOUNT, name: 'paid', value: 1000 });

    expect(text).toContain('$1,000.00');
  });

  it('escapes what it interpolates, because the formatter returns raw HTML', () => {
    const text = tooltipOf(spec)({ seriesName: '<img src=x>', name: 'paid', value: 1 });

    // docs/research/echarts.md flags this: 6.1.0 fixed an XSS in a tooltip,
    // and every value wechart interpolates is ours to escape.
    expect(text).not.toContain('<img');
    expect(text).toContain('&lt;img');
  });

  it('writes a heatmap cell’s measure, naming its column and row', () => {
    /**
     * T195. A heatmap cell's value is `[column, row, measure]`; the tooltip
     * read `value[1]` — the row's *index* — through the measure's formatter,
     * so the measure never appeared at all.
     */
    const heatmap: RenderSpec = {
      chartType: 'heatmap',
      encoding: { x: [STATUS], y: ['orders.region'], color: [AMOUNT] },
      rows: [
        { [STATUS]: 'paid', 'orders.region': 'west', [AMOUNT]: 1000 },
        { [STATUS]: 'refunded', 'orders.region': 'east', [AMOUNT]: 250 },
      ],
      palette: ['#123456'],
      formats: { [AMOUNT]: 'currency' },
    };

    const text = tooltipOf(heatmap)({ seriesName: '', name: '', value: [1, 1, 250] });

    expect(text).toBe(`refunded · east<br/>${AMOUNT}: $250.00`);
  });

  it('writes both of a scatter point’s measures, each its own way', () => {
    // Two value axes, two measures: x's format is not y's.
    const text = tooltipOf(scatter)({ seriesName: SHARE, name: '', value: [1000, 0.25] });

    expect(text).toBe(`${SHARE}<br/>${AMOUNT}: $1,000.00<br/>${SHARE}: 25%`);
  });

  it('writes a trellis panel’s value, naming the panel', () => {
    const text = tooltipOf(trellis)({ seriesName: 'west', name: 'paid', value: 1000 });

    expect(text).toBe(`paid<br/>west: $1,000.00`);
  });

  it('is absent for the types drawn as DOM, which have their own', () => {
    // Asked of tooltipFor rather than optionFor, because ECharts draws none
    // of these and optionFor rightly refuses them.
    for (const chartType of ['kpi', 'table', 'pivot'] as const) {
      expect(tooltipFor({ ...spec, chartType })).toEqual({});
    }
  });
});
