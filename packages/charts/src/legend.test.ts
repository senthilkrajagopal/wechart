/**
 * T045 / AC-038: WHEN a chart has two or more series, THE SYSTEM SHALL show a
 * legend; with one series it SHALL show none (direction.md rule 4).
 * Fails when: a single-series chart shows a legend box, or a multi-series
 * chart omits it.
 *
 * Both halves are load-bearing, and the second is the one usually got wrong: a
 * legend naming the single thing already named by the axis and the title is
 * clutter, and on a small tile it is clutter that costs a chart its height.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { seriesCount } from './legend';
import { optionFor } from './optionFor';
import { labelsOf, renderToSvg } from '../src/testing/renderToSvg';

const PALETTE = ['#123456', '#abcdef', '#0f9d58'];

const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const drawn = (spec: RenderSpec) => labelsOf(renderToSvg(optionFor(spec))).map((l) => l.text);

const cartesian = (measures: readonly string[]): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [...measures] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 10, [AMOUNT]: 100 },
    { [STATUS]: 'refunded', [COUNT]: 20, [AMOUNT]: 200 },
  ],
  palette: PALETTE,
});

describe('how many series a chart has', () => {
  it('counts one per measure on a cartesian chart', () => {
    expect(seriesCount(cartesian([COUNT]))).toBe(1);
    expect(seriesCount(cartesian([COUNT, AMOUNT]))).toBe(2);
  });

  it('counts the members of a splitting dimension', () => {
    expect(
      seriesCount({
        ...cartesian([COUNT]),
        encoding: { x: [STATUS], y: [COUNT], color: [REGION] },
        rows: [
          { [STATUS]: 'paid', [REGION]: 'east', [COUNT]: 1 },
          { [STATUS]: 'paid', [REGION]: 'west', [COUNT]: 2 },
        ],
      }),
    ).toBe(2);
  });

  it('counts the slices of a pie, because those are what carry the colours', () => {
    // A pie is one ECharts series but several coloured things, and it is the
    // coloured things a legend names.
    expect(seriesCount({ ...cartesian([COUNT]), chartType: 'pie' })).toBe(2);
  });

  it('counts nothing for a chart whose colour is a scale rather than a set', () => {
    // A heatmap's colour says how much, not which. Naming its values in a
    // legend would be naming every cell.
    expect(seriesCount({ ...cartesian([COUNT]), chartType: 'heatmap' })).toBe(0);
  });

  it('counts nothing for the types that have no marks to name', () => {
    for (const chartType of ['kpi', 'table', 'pivot'] as const) {
      expect(seriesCount({ ...cartesian([COUNT]), chartType })).toBe(0);
    }
  });
});

describe('the legend itself', () => {
  it('appears, naming each series, when there are two', () => {
    const labels = drawn(cartesian([COUNT, AMOUNT]));

    expect(labels).toContain(COUNT);
    expect(labels).toContain(AMOUNT);
  });

  it('does not appear when there is only one', () => {
    const labels = drawn(cartesian([COUNT]));

    // The axis and the title already say what the one series is.
    expect(labels).not.toContain(COUNT);
  });

  it('appears on a pie with two or more slices', () => {
    const labels = drawn({ ...cartesian([COUNT]), chartType: 'pie' });

    expect(labels).toContain('paid');
    expect(labels).toContain('refunded');
  });

  it('does not appear on a pie with a single slice', () => {
    const labels = drawn({
      ...cartesian([COUNT]),
      chartType: 'pie',
      rows: [{ [STATUS]: 'paid', [COUNT]: 10 }],
    });

    expect(labels).not.toContain('paid');
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it — legends, tooltips, table headers, well
 * pills, marking chips and the "Why this chart?" trace — and never by its
 * internal name.
 * `Fails when: a legend, table header, pill, chip or trace shows a name such
 * as "orders.count".`
 */
describe('a legend of measures names them by their titles (AC-220)', () => {
  const titles = { [COUNT]: 'Orders Count', [AMOUNT]: 'Orders Amount' };

  it('writes each measure series by its title, never its name', () => {
    const labels = drawn({ ...cartesian([COUNT, AMOUNT]), titles });
    expect(labels).toContain('Orders Count');
    expect(labels).toContain('Orders Amount');
    expect(labels).not.toContain(COUNT);
    expect(labels).not.toContain(AMOUNT);
  });

  it('names them in the tooltip too', () => {
    const option = optionFor({ ...cartesian([COUNT, AMOUNT]), titles }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    const said =
      option.tooltip?.formatter?.([
        { name: 'paid', seriesName: COUNT, seriesIndex: 0, value: 10 },
        { name: 'paid', seriesName: AMOUNT, seriesIndex: 1, value: 100 },
      ]) ?? '';
    expect(said).toContain('Orders Count');
    expect(said).toContain('Orders Amount');
    expect(said).not.toContain(COUNT);
  });
});

/**
 * T403, AC-220 as amended (R16): "Where the member's cube or view is evident
 * (a pill, a legend or a KPI label of a one-source chart), it SHALL use the
 * member's short title, and its full title elsewhere." `Fails when: … a
 * one-source chart's legend or KPI label repeats the source's title.`
 */
describe('a one-source chart’s legend names its measures by their short titles (T403)', () => {
  const titles = {
    [COUNT]: 'Orders Count',
    [AMOUNT]: 'Orders Amount',
    'customers.count': 'Customers Count',
  };
  const shortTitles = { [COUNT]: 'Count', [AMOUNT]: 'Amount', 'customers.count': 'Count' };

  it('writes each by its short title when every member is one cube’s', () => {
    const labels = drawn({ ...cartesian([COUNT, AMOUNT]), titles, shortTitles });
    expect(labels).toContain('Count');
    expect(labels).toContain('Amount');
    expect(labels).not.toContain('Orders Count');
    expect(labels).not.toContain('Orders Amount');
  });

  it('keeps the full titles where the chart draws on two cubes, and in the tooltip', () => {
    const two: RenderSpec = {
      ...cartesian([COUNT, 'customers.count']),
      rows: [
        { [STATUS]: 'paid', [COUNT]: 10, 'customers.count': 3 },
        { [STATUS]: 'refunded', [COUNT]: 20, 'customers.count': 4 },
      ],
      titles,
      shortTitles,
    };
    const labels = drawn(two);
    expect(labels).toContain('Orders Count');
    expect(labels).toContain('Customers Count');

    const option = optionFor({ ...cartesian([COUNT, AMOUNT]), titles, shortTitles }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    const said =
      option.tooltip?.formatter?.([
        { seriesName: COUNT, name: 'paid', value: 10, marker: '' },
        { seriesName: AMOUNT, name: 'paid', value: 100, marker: '' },
      ]) ?? '';
    expect(said).toContain('Orders Count');
    expect(said).toContain('Orders Amount');
  });
});

/**
 * T848 (AC-500, rule 120): a combo's legend entries each with their mark's
 * glyph, a right-axis series' adding "(right)" in `text-secondary`.
 */
describe('a combo’s legend', () => {
  const MARGIN = 'orders.margin_pct';
  const combo: RenderSpec = {
    chartType: 'combo',
    encoding: { x: [STATUS], y: [AMOUNT, COUNT, MARGIN] },
    rows: [
      { [STATUS]: 'paid', [AMOUNT]: 100, [COUNT]: 90, [MARGIN]: 0.2 },
      { [STATUS]: 'refunded', [AMOUNT]: 200, [COUNT]: 150, [MARGIN]: 0.3 },
    ],
    palette: PALETTE,
    titles: { [MARGIN]: 'Margin %' },
    options: {
      series: { [COUNT]: { mark: 'area' }, [MARGIN]: { mark: 'point', axis: 'right' } },
    },
  };
  type Legend = {
    data?: { name: string; icon?: string }[];
    itemWidth?: number;
    itemHeight?: number;
    formatter?: (name: string) => string;
    textStyle?: { rich?: Record<string, { color?: string }> };
  };
  const legendOf = (spec: RenderSpec) => optionFor(spec)['legend'] as Legend;

  it('gives each entry its mark’s glyph', () => {
    const legend = legendOf(combo);
    const iconOf = (name: string) => legend.data?.find((one) => one.name === name)?.icon;

    expect(legend.data?.map((one) => one.name)).toEqual([AMOUNT, COUNT, MARGIN]);
    // Bar 8 × 8 radius 2, area 12 × 8, point an 8 px dot: each a path.
    expect(iconOf(AMOUNT)).toMatch(/^path:\/\//);
    expect(new Set([iconOf(AMOUNT), iconOf(COUNT), iconOf(MARGIN)]).size).toBe(3);
    // Room for the widest glyph, 12 × 8; a path keeps its own proportions.
    expect([legend.itemWidth, legend.itemHeight]).toEqual([12, 8]);
  });

  it('says "(right)" after a right-axis series, in text-secondary', () => {
    const legend = legendOf(combo);

    expect(legend.formatter?.(MARGIN)).toBe('Margin % {right|(right)}');
    expect(legend.formatter?.(AMOUNT)).toBe(AMOUNT);
    expect(legend.textStyle?.rich?.['right']?.color).toBe(COLORS.light['text-secondary']);
  });

  it('draws "(right)" beside the entry', () => {
    const labels = labelsOf(renderToSvg(optionFor(combo))).map((label) => label.text);

    expect(labels).toContain('(right)');
  });

  it('gives a line its 12 × 2 rule', () => {
    const line: RenderSpec = { ...combo, options: {} };
    const icons = legendOf(line).data?.map((one) => one.icon);

    // The first is bars, the rest lines (Auto): two kinds of glyph.
    expect(new Set(icons).size).toBe(2);
    expect(icons?.[1]).toBe(icons?.[2]);
  });

  /**
   * AC-505: a series with no data still counts and keeps its legend entry,
   * saying "No data for these filters" in text-secondary.
   */
  it('keeps an empty series’ entry, saying "No data for these filters"', () => {
    const empty: RenderSpec = {
      ...combo,
      rows: combo.rows.map((row) => ({ ...row, [COUNT]: null })),
    };
    const legend = legendOf(empty);

    expect(legend.data?.map((one) => one.name)).toEqual([AMOUNT, COUNT, MARGIN]);
    expect(legend.formatter?.(COUNT)).toBe(`${COUNT} {none|· No data for these filters}`);
    expect(legend.formatter?.(AMOUNT)).toBe(AMOUNT);
    expect(legend.textStyle?.rich?.['none']?.color).toBe(COLORS.light['text-secondary']);
    expect(labelsOf(renderToSvg(optionFor(empty))).map((label) => label.text)).toContain(
      '· No data for these filters',
    );
  });
});
