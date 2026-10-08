/**
 * T681's follow-up (R76 dashboard-Q1; design 04 pins 5–6; direction.md §6
 * and rule 5): a chart of 4 or fewer series names each series at its end, so
 * identity never rests on colour alone, now that a tile's Table view is in ⋯.
 *
 * The coordinator's calls on research/echarts-end-labels.md (2026-10-08):
 * lines and areas by `endLabel`, a stacked area's on its band's top edge;
 * bars by a label on the last non-null item, placed by the doc's §3A table;
 * `shiftY` and `hideOverlap`, a hidden label acceptable since the legend
 * stays; no end labels on a trellis; ink-token text with `valueAnimation:
 * false`, room reserved in `grid.right`, measured with `getTextRect` and
 * capped with a width and truncation.
 *
 * Drawn for real (`renderToSvg`, ECharts' SSR) and read back from the SVG.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import { labelsOf, renderToSvg, strokesOf } from '../testing/renderToSvg';
import { DIRECT_LABEL_TOP, withDirectLabels } from './directLabels';
import { PROTOTYPE_GRID } from './grid';

const MONTH = 'orders.month';
const COUNT = 'orders.count';
const STATUS = 'orders.status';
const PALETTE = ['#123456', '#abcdef', '#654321', '#fedcba', '#0f0f0f'];
const MONTHS = ['jan', 'feb', 'mar', 'apr'];

/** One row per month and status, from each status's values. */
const split = (
  chartType: RenderSpec['chartType'],
  byStatus: Record<string, readonly (number | null)[]>,
  options?: RenderSpec['options'],
): RenderSpec => ({
  chartType,
  encoding: { x: [MONTH], y: [COUNT], color: [STATUS] },
  rows: Object.entries(byStatus).flatMap(([status, values]) =>
    values.flatMap((value, at) =>
      value === null ? [] : [{ [MONTH]: MONTHS[at]!, [STATUS]: status, [COUNT]: value }],
    ),
  ),
  palette: PALETTE,
  ...(options === undefined ? {} : { options }),
});

type Series = {
  name?: string;
  endLabel?: Record<string, unknown>;
  labelLayout?: Record<string, unknown>;
  label?: Record<string, unknown>;
  data?: unknown[];
};
const seriesOfOption = (option: Record<string, unknown>) => option['series'] as Series[];
/**
 * The labels drawn on the plot, not the legend's entries: the legend is drawn
 * in the top 32 px the grid leaves it (legend.ts), where no end label is.
 */
const endLabelsOf = (svg: string) => labelsOf(svg).filter((each) => each.y > 32);
const rightOf = (option: Record<string, unknown>) =>
  (option['grid'] as { right?: number }).right ?? 0;

describe('a line or area of 4 or fewer series names each at its end (dashboard-Q1)', () => {
  const three = split('multiLine', {
    completed: [10, 20, 30, 40],
    processing: [5, 15, 25, 35],
    shipped: [12, 8, 16, 22],
  });

  it('labels each series by its name, in ink, still, with shiftY and hideOverlap', () => {
    const option = optionFor(three);
    for (const one of seriesOfOption(option)) {
      expect(one.endLabel?.['show']).toBe(true);
      expect(one.endLabel?.['valueAnimation']).toBe(false);
      expect(one.endLabel?.['overflow']).toBe('truncate');
      expect(typeof one.endLabel?.['width']).toBe('number');
      expect(typeof one.endLabel?.['color']).toBe('string');
      expect(one.labelLayout).toEqual({ moveOverlap: 'shiftY', hideOverlap: true });
    }
    // Room kept for them at the right of the plot.
    expect(rightOf(option)).toBeGreaterThan(PROTOTYPE_GRID.right);

    // Drawn: each name past its line's last point.
    const svg = renderToSvg(option);
    const labels = endLabelsOf(svg);
    const lastX = Math.max(
      ...strokesOf(svg, PALETTE.slice(0, 3)).flatMap((stroke) => stroke.points.map(([x]) => x)),
    );
    for (const name of ['completed', 'processing', 'shipped']) {
      const label = labels.find((each) => each.text === name);
      expect(label, name).toBeDefined();
      expect(label!.x, name).toBeGreaterThan(lastX);
    }
  });

  it('puts a series ending early at its last measured point (trailing nulls)', () => {
    const svg = renderToSvg(
      optionFor(
        split('multiLine', {
          completed: [10, 20, 30, 40],
          shipped: [12, 8, null, null],
        }),
      ),
    );
    const labels = endLabelsOf(svg);
    const early = labels.find((each) => each.text === 'shipped')!;
    const late = labels.find((each) => each.text === 'completed')!;
    // Two categories short of the end: well left of the full series' label.
    expect(late.x - early.x).toBeGreaterThan(100);
  });

  it('labels a stacked area’s series on its band’s top edge, the higher band higher', () => {
    const svg = renderToSvg(
      optionFor(
        // The upper band's own value smaller than the lower's: on its top
        // edge (30 + 10) it is higher; at its raw value (10) it would be lower.
        split('stackedArea', {
          completed: [30, 30, 30, 30],
          shipped: [10, 10, 10, 10],
        }),
      ),
    );
    const labels = endLabelsOf(svg);
    const below = labels.find((each) => each.text === 'completed')!;
    const above = labels.find((each) => each.text === 'shipped')!;
    // The second band sits on the first: its top edge, and label, higher up.
    expect(above.y).toBeLessThan(below.y);
  });

  it('keeps 4 close series’ labels apart, hiding none it can move', () => {
    const svg = renderToSvg(
      optionFor(
        split('multiLine', {
          a: [10, 10, 10, 50],
          b: [10, 10, 10, 50.5],
          c: [10, 10, 10, 51],
          d: [10, 10, 10, 51.5],
        }),
      ),
    );
    const ends = endLabelsOf(svg)
      .filter((each) => ['a', 'b', 'c', 'd'].includes(each.text))
      .map((each) => each.y)
      .sort((one, other) => one - other);
    // Every one drawn, each a line of 12 px text below the last.
    expect(ends.length).toBe(4);
    for (let at = 1; at < ends.length; at += 1)
      expect(ends[at]! - ends[at - 1]!).toBeGreaterThanOrEqual(12);
  });

  it('counts a marked share’s parts as their series, and names each series once', () => {
    const spec = split('multiLine', { a: [1, 2], b: [2, 3] });
    const line = (name: string) => ({ type: 'line', name, data: [1, 2] });
    // A marked share's line is a series of its own under its series' name.
    const option = withDirectLabels(
      { grid: { right: 28 }, series: [line('a'), line('a'), line('b')] },
      spec,
    );
    expect(seriesOfOption(option).map((one) => one.endLabel?.['show'] ?? false)).toEqual([
      true,
      false,
      true,
    ]);
    // One series and its share: one name, no label.
    const alone = withDirectLabels(
      { grid: { right: 28 }, series: [line('a'), line('a')] },
      split('line', { a: [1, 2] }),
    );
    for (const one of seriesOfOption(alone)) expect(one.endLabel).toBeUndefined();
  });

  it('labels none past 4 series, nor one alone, whose legend or title names it', () => {
    const five = optionFor(
      split('multiLine', { a: [1, 2], b: [2, 3], c: [3, 4], d: [4, 5], e: [5, 6] }),
    );
    for (const one of seriesOfOption(five)) expect(one.endLabel).toBeUndefined();
    expect(rightOf(five)).toBe(PROTOTYPE_GRID.right);
    const alone = optionFor(split('line', { a: [1, 2, 3] }));
    for (const one of seriesOfOption(alone)) expect(one.endLabel).toBeUndefined();
  });
});

describe('a bar chart of 4 or fewer series names each on its last bar (dashboard-Q1, §3A)', () => {
  const lastShown = (one: Series) =>
    (one.data ?? []).flatMap((item, at) => {
      const label = (item as { label?: { show?: boolean; position?: unknown } }).label;
      return label?.show === true ? [{ at, position: label.position }] : [];
    });

  it('stacked: beside the last category’s segment, room kept at the right', () => {
    const option = optionFor(
      split('stackedBar', { completed: [10, 20, 30, 40], shipped: [5, 6, 7, 8] }),
    );
    for (const one of seriesOfOption(option)) {
      expect(lastShown(one)).toEqual([{ at: 3, position: 'right' }]);
      expect(one.label?.['show']).toBe(false);
      expect(one.labelLayout).toEqual({ moveOverlap: 'shiftY', hideOverlap: true });
    }
    expect(rightOf(option)).toBeGreaterThan(PROTOTYPE_GRID.right);
    const texts = endLabelsOf(renderToSvg(option)).map((each) => each.text);
    expect(texts).toContain('completed');
    expect(texts).toContain('shipped');
  });

  it('grouped: over each series’ last bar, its last measured one where it ends early', () => {
    const option = optionFor(
      split('groupedBar', { completed: [10, 20, 30, 40], shipped: [5, 6, null, null] }),
    );
    const [completed, shipped] = seriesOfOption(option);
    expect(lastShown(completed!)).toEqual([{ at: 3, position: 'outside' }]);
    expect(lastShown(shipped!)).toEqual([{ at: 1, position: 'outside' }]);
    expect(completed!.labelLayout).toEqual({ moveOverlap: 'shiftX', hideOverlap: true });
  });

  it('horizontal: past the last category’s bars, room kept at the right', () => {
    const option = optionFor(
      split('hbar', { completed: [10, 20, 30, 40], shipped: [5, 6, 7, 8] }),
    );
    for (const one of seriesOfOption(option)) {
      expect(lastShown(one)).toEqual([{ at: 3, position: 'outside' }]);
      expect(one.labelLayout).toEqual({ moveOverlap: 'shiftY', hideOverlap: true });
    }
    expect(rightOf(option)).toBeGreaterThan(PROTOTYPE_GRID.right);
  });

  it('leaves them out where Customize labels every bar with its value', () => {
    const option = optionFor(
      split('groupedBar', { completed: [10, 20], shipped: [5, 6] }, { dataLabels: true }),
    );
    for (const one of seriesOfOption(option)) expect(lastShown(one)).toEqual([]);
  });

  it('draws no end labels on a trellis, whose panels’ labels would push each other', () => {
    const option = optionFor({
      chartType: 'trellis',
      encoding: { facet: ['orders.region'], x: [STATUS], y: [COUNT] },
      rows: [
        { 'orders.region': 'east', [STATUS]: 'paid', [COUNT]: 100 },
        { 'orders.region': 'west', [STATUS]: 'paid', [COUNT]: 10 },
      ],
      palette: PALETTE,
    });
    const all = (option['series'] as Series[] | undefined) ?? [];
    for (const one of all) {
      expect(one.endLabel).toBeUndefined();
      expect(one.labelLayout).toBeUndefined();
      expect(lastShown(one)).toEqual([]);
    }
  });

  it('grouped: keeps room above the plot for a name over the tallest bar', () => {
    const grouped = optionFor(split('groupedBar', { completed: [10, 40], shipped: [5, 6] }));
    const stacked = optionFor(split('stackedBar', { completed: [10, 40], shipped: [5, 6] }));
    const topOf = (option: Record<string, unknown>) =>
      (option['grid'] as { top?: number }).top ?? 0;
    expect(topOf(grouped) - topOf(stacked)).toBe(DIRECT_LABEL_TOP);
  });
});

/** T681 follow-up's review: what the series already drawn bring with them. */
describe('direct labels over what marking, cross-filtering and Customize draw', () => {
  const bar = (name: string, values: readonly (number | null)[], extra = {}) => ({
    type: 'bar',
    name,
    stack: `s-${name}`,
    data: values.map((value) => ({ value })),
    ...extra,
  });
  const labelledAt = (option: Record<string, unknown>) =>
    seriesOfOption(option).map((one) =>
      (one.data ?? []).flatMap((item, at) =>
        (item as { label?: { show?: boolean } }).label?.show === true ? [at] : [],
      ),
    );

  it('names a partly marked bar at its end: on its rest, over its marked foot', () => {
    // marking/partialOption: each series as its marked foot, then its rest,
    // in one stack, both under its name; b has nothing marked.
    const option = withDirectLabels(
      {
        grid: { right: 28 },
        series: [
          bar('a', [1, null]),
          bar('a', [2, 3]),
          bar('b', [null, null]),
          bar('b', [4, 5]),
        ],
      },
      split('stackedBar', { a: [3, 3], b: [4, 5] }),
    );
    expect(labelledAt(option)).toEqual([[], [1], [], [1]]);
  });

  it('counts no cross-filter share drawn over a bar as a series', () => {
    const overlay = (name: string) => bar(name, [1, 2], { barGap: '-100%' });
    // One series and its share: one name, none drawn.
    const alone = withDirectLabels(
      { grid: { right: 28 }, series: [bar('count', [3, 4]), overlay('shipped')] },
      split('bar', { count: [3, 4] }),
    );
    expect(labelledAt(alone)).toEqual([[], []]);
    expect((alone['grid'] as { right?: number }).right).toBe(28);
    // Two and a share: the two named, the share not.
    const two = withDirectLabels(
      {
        grid: { right: 28 },
        series: [bar('a', [3, 4]), bar('b', [1, 2]), overlay('shipped')],
      },
      split('groupedBar', { a: [3, 4], b: [1, 2] }),
    );
    expect(labelledAt(two)).toEqual([[1], [1], []]);
  });

  it('leaves a line’s or area’s labels to Customize where it writes each value', () => {
    const option = optionFor(
      split('multiLine', { completed: [10, 20], shipped: [5, 6] }, { dataLabels: true }),
    );
    for (const one of seriesOfOption(option)) {
      expect(one.endLabel).toBeUndefined();
      expect(one.labelLayout).toBeUndefined();
    }
  });

  it('names the 4 a chart draws where Customize hides its fifth', () => {
    const option = optionFor(
      split(
        'multiLine',
        { a: [1, 2], b: [2, 3], c: [3, 4], d: [4, 5], e: [5, 6] },
        { series: { e: { hidden: true } } },
      ),
    );
    const shown = seriesOfOption(option).filter((one) => one.endLabel?.['show'] === true);
    expect(shown.map((one) => one.name).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
