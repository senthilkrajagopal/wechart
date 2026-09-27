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
import { beforeAll, describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import countries from './geo/countries-50m.geo.json';
import { registerCountries } from './geo/countryMap';
import { DRAWABLE_TYPES, optionFor } from './optionFor';
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
    // written as money ("$0.25"). The money axis's own "$0" is its zero.
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
    // Nor as money, in Cube's currency format ("$1,234", T201) or with pennies.
    expect(labels).not.toContain('$1,234');
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

    // Cube's currency, `$,.2~f`: trailing zeros trimmed (T201, the user's choice).
    expect(yAxis.axisPointer.label.formatter({ value: 4000 })).toBe('$4,000');
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

    expect(text).toBe('paid<br/>east: $76,900');
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

    expect(text).toMatch(/\$1,000(?![\d,.])/);
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

    expect(text).toBe(`refunded · east<br/>${AMOUNT}: $250`);
  });

  it('writes both of a scatter point’s measures, each its own way', () => {
    // Two value axes, two measures: x's format is not y's.
    const text = tooltipOf(scatter)({ seriesName: SHARE, name: '', value: [1000, 0.25] });

    expect(text).toBe(`${SHARE}<br/>${AMOUNT}: $1,000<br/>${SHARE}: 25%`);
  });

  it('writes a trellis panel’s value, naming the panel', () => {
    const text = tooltipOf(trellis)({ seriesName: 'west', name: 'paid', value: 1000 });

    expect(text).toBe(`paid<br/>west: $1,000`);
  });

  it('is absent for the types drawn as DOM, which have their own', () => {
    // Asked of tooltipFor rather than optionFor, because ECharts draws none
    // of these and optionFor rightly refuses them.
    for (const chartType of ['kpi', 'table', 'pivot'] as const) {
      expect(tooltipFor({ ...spec, chartType })).toEqual({});
    }
  });
});

/**
 * T201 / AC-046, for every chart type rather than the ones someone remembered
 * (T052 tested a vertical bar): each drawable type, given a currency measure,
 * writes it as money on its value axis and in its tooltip. A type added to
 * `DRAWABLE_TYPES` is covered without anyone adding it here.
 */
const REGION = 'orders.region';
const ROWS = [
  { [STATUS]: 'paid', [REGION]: 'west', [AMOUNT]: 1000, [SHARE]: 0.25 },
  { [STATUS]: 'refunded', [REGION]: 'east', [AMOUNT]: 4000, [SHARE]: 0.75 },
];

function everyTypeSpec(chartType: (typeof DRAWABLE_TYPES)[number]): RenderSpec {
  const encoding: RenderSpec['encoding'] =
    chartType === 'scatter'
      ? { x: [SHARE], y: [AMOUNT] }
      : chartType === 'heatmap'
        ? { x: [STATUS], y: [REGION], color: [AMOUNT] }
        : chartType === 'trellis'
          ? { facet: [REGION], x: [STATUS], y: [AMOUNT] }
          : { x: [STATUS], y: [AMOUNT] };
  return {
    chartType,
    encoding,
    rows: ROWS,
    palette: ['#123456', '#654321'],
    formats: { [AMOUNT]: 'currency', [SHARE]: 'percent' },
  };
}

/** Types whose value is a colour or an area, not a position on an axis. */
const NO_VALUE_AXIS: readonly string[] = ['pie', 'donut', 'treemap', 'heatmap', 'map'];

describe('every drawable type', () => {
  // A map is drawn only on its boundaries, registered first (T398).
  beforeAll(() => {
    registerCountries(countries);
  });

  it.each(DRAWABLE_TYPES)('writes a %s’s measure as money in its tooltip', (chartType) => {
    // Each as ECharts hands it over: a box as its category's index and its
    // five values, `refunded` being the second category (T399).
    const value =
      chartType === 'heatmap'
        ? [0, 0, 4000]
        : chartType === 'scatter'
          ? [0.75, 4000]
          : chartType === 'boxplot'
            ? [1, 4000, 4000, 4000, 4000, 4000]
            : 4000;
    const text = tooltipOf(everyTypeSpec(chartType))({
      seriesName: AMOUNT,
      name: 'refunded',
      value,
      seriesIndex: 0,
      dataIndex: 1,
      ...(chartType === 'boxplot' ? { seriesType: 'boxplot' } : {}),
    });

    expect(text).toMatch(/\$4,000(?![\d,.])/);
  });

  it.each(DRAWABLE_TYPES.filter((type) => !NO_VALUE_AXIS.includes(type)))(
    'writes a %s’s value axis as money',
    (chartType) => {
      const labels = labelsOf(renderToSvg(optionFor(everyTypeSpec(chartType)))).map(
        (label) => label.text,
      );

      expect(labels.some((label) => /^\$[\d,.]+[KkM]?$/.test(label))).toBe(true);
    },
  );

  it('shows data labels only with a formatter, on every type', () => {
    // The guard above, over every type rather than a list kept by hand.
    for (const chartType of DRAWABLE_TYPES) {
      const series = optionFor(everyTypeSpec(chartType))['series'] as {
        label?: { show?: boolean; formatter?: unknown };
      }[];
      for (const one of series) {
        if (one.label?.show === true) expect(typeof one.label.formatter).toBe('function');
        else expect(one.label?.show ?? false).toBe(false);
      }
    }
  });
});

/**
 * T201 / AC-046: a dimension's declared format on a chart, not only in a
 * table (T195's review found tables alone honoured it). A number dimension
 * with a format — here a price band as whole dollars — is written that way on
 * the category axis, in the legend and in the tooltip's heading. One without
 * a format is left as it came (T194's order ids, above).
 */
describe('a dimension’s declared format', () => {
  const BAND = 'orders.price_band';
  const banded = (chartType: RenderSpec['chartType'], encoding: RenderSpec['encoding']) =>
    ({
      chartType,
      encoding,
      rows: [
        { [BAND]: 10, [STATUS]: 'paid', [AMOUNT]: 1 },
        { [BAND]: 20, [STATUS]: 'refunded', [AMOUNT]: 2 },
      ],
      palette: ['#123456', '#654321'],
      formats: { [BAND]: { specifier: '$,.0f' } },
    }) satisfies RenderSpec;

  it('writes its categories on the axis and in the tooltip’s heading', () => {
    const drawn = banded('bar', { x: [BAND], y: [AMOUNT] });

    expect(labelsOf(renderToSvg(optionFor(drawn))).map((label) => label.text)).toContain('$10');
    expect(tooltipOf(drawn)({ seriesName: AMOUNT, name: '20', value: 2 })).toBe(
      `$20<br/>${AMOUNT}: 2`,
    );
  });

  it('leaves a link or id dimension’s values as they came (T201’s review)', () => {
    const REF = 'orders.ref';
    for (const format of ['link', 'id'] as const) {
      const drawn: RenderSpec = {
        chartType: 'bar',
        encoding: { x: [REF], y: [AMOUNT] },
        rows: [
          { [REF]: 12345, [AMOUNT]: 1 },
          { [REF]: 23456, [AMOUNT]: 2 },
        ],
        palette: ['#123456'],
        formats: { [REF]: format },
      };
      const labels = labelsOf(renderToSvg(optionFor(drawn))).map((label) => label.text);

      expect(labels).toContain('12345');
      expect(labels).not.toContain('12,345');
    }
  });

  it('writes the members of its split in the legend', () => {
    const drawn = banded('groupedBar', { x: [STATUS], y: [AMOUNT], color: [BAND] });

    expect(labelsOf(renderToSvg(optionFor(drawn))).map((label) => label.text)).toContain('$20');
  });
});
