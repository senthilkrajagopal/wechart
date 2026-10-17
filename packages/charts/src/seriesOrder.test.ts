import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { labelsOf, marksOf, renderToSvg } from './testing/renderToSvg';

/**
 * T392, AC-300: WHEN the user orders a chart's series in Customize, THE
 * SYSTEM SHALL draw, stack and list the series in that order, and keep it
 * after a refresh (gap 7).
 * `Fails when: series stack alphabetically after another order was set, or
 * the order changes on refresh.`
 *
 * Read off the drawn SVG, as a tile draws it. Each region has a colour of its
 * own, set in Customize, so its segment is found by its fill whatever its
 * place: colour follows the series, never its rank.
 */
const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';
const COLOURS = { north: '#1f77b4', south: '#d62728', east: '#2ca02c' } as const;

const rows = ['paid', 'refunded'].flatMap((status, at) =>
  (['north', 'south', 'east'] as const).map((region, n) => ({
    [STATUS]: status,
    [REGION]: region,
    [COUNT]: 10 + 5 * at + n,
  })),
);

const stacked = (seriesOrder?: readonly string[], data = rows): RenderSpec => ({
  chartType: 'stackedBar',
  encoding: { x: [STATUS], y: [COUNT], color: [REGION] },
  rows: data,
  palette: ['#123456', '#abcdef', '#0f9d58'],
  options: {
    series: Object.fromEntries(Object.entries(COLOURS).map(([name, colour]) => [name, { colour }])),
    ...(seriesOrder === undefined ? {} : { seriesOrder }),
  },
});

const SIZE = { width: 640, height: 320 };
const svgOf = (spec: RenderSpec) => renderToSvg(optionFor(spec, SIZE), SIZE);

/** The regions of the first status's bar, bottom to top. */
function stackOf(svg: string): string[] {
  const byColour = Object.fromEntries(
    Object.entries(COLOURS).map(([name, colour]) => [colour, name]),
  );
  // The bars, not the legend's swatches in its top 32 px band, which sit at
  // the left since T683 (CMP-12).
  const marks = marksOf(svg, Object.values(COLOURS)).filter((mark) => mark.top >= 32);
  const first = Math.min(...marks.map((mark) => mark.left));
  return marks
    .filter((mark) => Math.abs(mark.left - first) < 1)
    .sort((a, b) => b.bottom - a.bottom)
    .map((mark) => byColour[mark.fill] ?? mark.fill);
}

/**
 * The legend's names, as read along it: in its top 32 px band (legend.ts),
 * not the series' direct labels at their ends (T681's follow-up).
 */
const legendOf = (svg: string) =>
  labelsOf(svg)
    .filter((label) => label.text in COLOURS && label.y < 32)
    .sort((a, b) => a.x - b.x)
    .map((label) => label.text);

const namesOf = (spec: RenderSpec) =>
  ((optionFor(spec, SIZE).series ?? []) as { name?: string }[]).map((one) => one.name);

describe('series in the order set in Customize (T392, AC-300)', () => {
  it('draws, stacks and lists them in that order', () => {
    const order = ['south', 'east', 'north'];
    const svg = svgOf(stacked(order));

    expect(namesOf(stacked(order))).toEqual(order);
    // Stacked from the baseline up in that order, not alphabetically.
    expect(stackOf(svg)).toEqual(order);
    expect(legendOf(svg)).toEqual(order);
  });

  it('keeps it when the rows come back in another order, as on a refresh', () => {
    const order = ['south', 'east', 'north'];
    const svg = svgOf(stacked(order, [...rows].reverse()));

    expect(stackOf(svg)).toEqual(order);
    expect(legendOf(svg)).toEqual(order);
  });

  it('puts a series the order doesn’t name after those it does, in their own order', () => {
    const unordered = namesOf(stacked());
    const named = ['east'];

    expect(namesOf(stacked(named))).toEqual([
      'east',
      ...unordered.filter((name) => name !== 'east'),
    ]);
  });

  it('draws in the data’s order with none set', () => {
    const svg = svgOf(stacked());

    expect(stackOf(svg)).toEqual(['north', 'south', 'east']);
  });

  /**
   * T467, UX-116: years split a chart into series, and Cube answered them by
   * the measure, largest first — the legend read "1997, 1998, 1996". Drawn and
   * listed in year order; an order set in Customize still wins.
   */
  it('draws and lists year series in year order, unless Customize orders them', () => {
    const YEAR = 'orders.year';
    const byYear = ['1997', '1998', '1996'].map((year, at) => ({
      [STATUS]: 'paid',
      [YEAR]: year,
      [COUNT]: 30 - at,
    }));
    const years = (seriesOrder?: readonly string[]): RenderSpec => ({
      chartType: 'groupedBar',
      encoding: { x: [STATUS], y: [COUNT], color: [YEAR] },
      rows: byYear,
      palette: ['#123456', '#abcdef', '#0f9d58'],
      ...(seriesOrder === undefined ? {} : { options: { seriesOrder } }),
    });
    // Along the legend, in its top 32 px band, not over the bars (T681's follow-up).
    const listed = (spec: RenderSpec) =>
      labelsOf(svgOf(spec))
        .filter((label) => /^\d{4}$/.test(label.text) && label.y < 32)
        .sort((a, b) => a.x - b.x)
        .map((label) => label.text);

    expect(namesOf(years())).toEqual(['1996', '1997', '1998']);
    expect(listed(years())).toEqual(['1996', '1997', '1998']);
    expect(namesOf(years(['1998', '1996', '1997']))).toEqual(['1998', '1996', '1997']);
  });

  /**
   * T392's review: the rounded end of a stack (direction.md: rounded
   * data-ends) is on its outermost segment in the order drawn, not the
   * data's.
   */
  it('rounds the stack’s end on the series drawn last, whatever the order', () => {
    const order = ['south', 'east', 'north'];
    const bars = optionFor(stacked(order), SIZE).series as {
      name: string;
      data: { itemStyle: { borderRadius: number[] } }[];
    }[];
    const rounded = bars
      .filter((bar) => bar.data.some((datum) => datum.itemStyle.borderRadius.some((r) => r > 0)))
      .map((bar) => bar.name);

    expect(rounded).toEqual(['north']);
  });

  /**
   * T392's review: AC-046 — each value in a tooltip is written by its own
   * measure's format, found by the series' name, not its place.
   */
  it('writes each measure in the tooltip by its own format after a reorder', () => {
    const measures: RenderSpec = {
      chartType: 'bar',
      encoding: { x: [STATUS], y: [COUNT, 'orders.amount'] },
      rows: [{ [STATUS]: 'paid', [COUNT]: 10, 'orders.amount': 1000 }],
      // Both money, each its own format (T510: a percent beside money is on
      // another scale, and no longer drawn on a bar to be ordered).
      formats: { 'orders.amount': 'currency', [COUNT]: { specifier: '$,.2f' } },
      options: { seriesOrder: ['orders.amount', COUNT] },
    };
    const formatter = (
      optionFor(measures, SIZE).tooltip as { formatter: (params: unknown) => string }
    ).formatter;

    const text = formatter([
      { seriesName: 'orders.amount', seriesIndex: 0, name: 'paid', value: 1000 },
      { seriesName: COUNT, seriesIndex: 1, name: 'paid', value: 10 },
    ]);
    // By place, the amount took the count's two places, and the count none.
    expect(text).toContain('$1,000');
    expect(text).not.toContain('$1,000.00');
    expect(text).toContain('$10.00');
  });
});
