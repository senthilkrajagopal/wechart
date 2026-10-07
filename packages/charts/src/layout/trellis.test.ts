/**
 * T043 / AC-037 and AC-045: the trellis.
 *
 * AC-045: WHEN a trellis chart is rendered, THE SYSTEM SHALL lay panels out in
 * a grid with a shared scale by default and a per-panel title, and cap the
 * panels at 20 (direction.md rule 6).
 *
 * The shared scale is the part worth testing hardest. Every panel *looks*
 * right under an independent scale — each one fills its own box — and that is
 * exactly the failure: two panels whose bars are the same height while their
 * values differ tenfold. So the test compares heights across panels rather
 * than asking the option what it was set to.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import { trellisOption, MAX_PANELS } from './trellis';
import { labelsOf, marksOf, renderToSvg } from '../testing/renderToSvg';

const BLUE = '#123456';
const PALETTE = [BLUE];

const REGION = 'orders.region';
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const draw = (spec: RenderSpec) => renderToSvg(trellisOption(spec));

/** Two regions an order of magnitude apart, so a shared scale is visible. */
const spec: RenderSpec = {
  chartType: 'trellis',
  encoding: { facet: [REGION], x: [STATUS], y: [COUNT] },
  rows: [
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 100 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 80 },
    { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 10 },
    { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
  ],
  palette: PALETTE,
};

const heightsByPanel = (svg: string) => {
  // Panels are laid out left to right, so the x of a bar says which one it is
  // in. Two panels here, split at the midpoint of the canvas.
  const marks = marksOf(svg, PALETTE);
  const midpoint = 640 / 2;
  const height = (box: (typeof marks)[0]) => box.bottom - box.top;
  return {
    left: marks.filter((box) => box.left < midpoint).map(height),
    right: marks.filter((box) => box.left >= midpoint).map(height),
  };
};

describe('panels', () => {
  it('draws one per member of the facet', () => {
    const titles = labelsOf(draw(spec)).filter((label) => ['east', 'west'].includes(label.text));

    expect(titles).toHaveLength(2);
  });

  it('gives every panel its own title', () => {
    const titles = labelsOf(draw(spec)).map((label) => label.text);

    // Without a title a reader cannot tell which panel is which, which is the
    // whole point of splitting the chart up.
    expect(titles).toContain('east');
    expect(titles).toContain('west');
  });

  it('lays them out side by side rather than on top of each other', () => {
    const { left, right } = heightsByPanel(draw(spec));

    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it('draws every category inside each panel', () => {
    const { left, right } = heightsByPanel(draw(spec));

    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
  });
});

describe('the shared scale', () => {
  it('makes a panel of small values look small', () => {
    const { left, right } = heightsByPanel(draw(spec));

    // east peaks at 100, west at 10. On one scale west's tallest bar is about
    // a tenth of east's; on independent scales both would fill their panel and
    // the chart would say the two regions were alike.
    const tallestLeft = Math.max(...left);
    const tallestRight = Math.max(...right);
    expect(tallestRight).toBeLessThan(tallestLeft / 5);
  });

  it('can be turned off, and then each panel fills its own box', () => {
    const independent: RenderSpec = {
      ...spec,
      options: { sharedScale: false },
    };
    const { left, right } = heightsByPanel(draw(independent));

    // direction.md: synchronised by default, each settable to independent.
    const tallestLeft = Math.max(...left);
    const tallestRight = Math.max(...right);
    expect(tallestRight).toBeGreaterThan(tallestLeft * 0.8);
  });
});

describe('the cap', () => {
  const many: RenderSpec = {
    chartType: 'trellis',
    encoding: { facet: [REGION], x: [STATUS], y: [COUNT] },
    rows: Array.from({ length: 25 }, (_, index) => ({
      [REGION]: `region ${String(index)}`,
      [STATUS]: 'paid',
      [COUNT]: index + 1,
    })),
    palette: PALETTE,
  };

  it('stops at twenty panels however many members there are', () => {
    const titles = labelsOf(draw(many)).filter((label) => label.text.startsWith('region '));

    // direction.md rule 6. Past this a panel is too small to read and the
    // chart stops being a chart.
    expect(MAX_PANELS).toBe(20);
    expect(titles).toHaveLength(MAX_PANELS);
  });

  it('keeps the first twenty, in the order the rows arrived', () => {
    const titles = labelsOf(draw(many))
      .filter((label) => label.text.startsWith('region '))
      .map((label) => label.text);

    expect(titles).toContain('region 0');
    expect(titles).not.toContain('region 20');
  });
});

/**
 * T510 (AC-036; UX-057; the user's option (a)): small multiples split by
 * metric, for metrics on different scales. A panel per metric, titled by
 * its title, each value axis on its own scale and in its own metric's
 * format, so a count beside revenue is drawn at its own height.
 */
describe('a panel per metric (T510)', () => {
  const AMOUNT = 'orders.amount';
  const byMetric: RenderSpec = {
    chartType: 'trellis',
    encoding: { x: [STATUS], y: [AMOUNT, COUNT] },
    rows: [
      { [STATUS]: 'paid', [AMOUNT]: 250000, [COUNT]: 122 },
      { [STATUS]: 'refunded', [AMOUNT]: 125000, [COUNT]: 61 },
    ],
    palette: PALETTE,
    formats: { [AMOUNT]: 'currency' },
    titles: { [AMOUNT]: 'Orders Amount', [COUNT]: 'Orders Count' },
  };

  it('draws one per metric, each titled by the metric', () => {
    const titles = labelsOf(draw(byMetric)).map((label) => label.text);
    expect(titles).toContain('Orders Amount');
    expect(titles).toContain('Orders Count');
  });

  it('gives each its own scale, so the smaller metric is not drawn flat', () => {
    const { left, right } = heightsByPanel(draw(byMetric));
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    // Each panel's tallest bar fills its own panel alike, whatever the metric.
    expect(Math.max(...right)).toBeGreaterThan(Math.max(...left) * 0.8);
  });

  it('writes each panel’s values in its own metric’s format', () => {
    const labels = labelsOf(draw(byMetric)).map((label) => label.text);
    // Money on the amount's axis, plain numbers on the count's.
    expect(labels.some((label) => /^\$[\d,]+/.test(label))).toBe(true);
    // A plain number can only be the count's: the amount's ticks all read "$".
    expect(labels.some((label) => /^\d[\d,]*$/.test(label))).toBe(true);
    const option = trellisOption(byMetric) as {
      yAxis: { axisLabel: { formatter: (v: number) => string } }[];
    };
    expect(option.yAxis[0]?.axisLabel.formatter(1000)).toBe('$1,000');
    expect(option.yAxis[1]?.axisLabel.formatter(1000)).toBe('1,000');
  });

  /**
   * T510's review: its bars mark by category, so the tile's keys step through
   * its categories (`clickMarksCategory`). The one they are on is ringed in
   * every panel, as a split bar's is in every series (AC-176).
   */
  it('rings the category the keyboard is on, in every panel', () => {
    const option = optionFor({ ...byMetric, keyboardFocus: 'paid' }) as {
      series: { data: { itemStyle?: { borderType?: unknown } }[] }[];
    };
    expect(option.series.map((one) => one.data[0]?.itemStyle?.borderType)).toEqual([
      'dashed',
      'dashed',
    ]);
    expect(option.series.map((one) => one.data[1]?.itemStyle?.borderType)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('makes a panel’s header no handle to mark by: it names a metric, not a value', () => {
    const option = trellisOption(byMetric) as { title: { triggerEvent?: boolean }[] };
    expect(option.title.map((one) => one.triggerEvent === true)).toEqual([false, false]);
  });
});
