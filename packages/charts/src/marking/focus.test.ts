/**
 * T306 (AC-176, AC-100): the item a tile's keyboard is on, drawn.
 *
 * AC-100's arrows move between a tile's items without marking, and Space
 * marks the one they are on. Until now that item was said in the live region
 * and drawn nowhere, so a sighted keyboard user could not see what Space
 * would mark. AC-176 asks for a visible focus indicator distinct from the
 * marking outline: here a dashed 2 px ring in the accent, where a marked item
 * has a solid 1.5 px outline in its marking's ink.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { themed } from '../themed';
import { focusedItemOf } from './focus';
import { MARKED_OUTLINE_PX } from './render';

const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';
const ROWS = [
  { [STATUS]: 'paid', [COUNT]: 3 },
  { [STATUS]: 'shipped', [COUNT]: 5 },
  { [STATUS]: 'refunded', [COUNT]: 2 },
];

type Item = { itemStyle?: { borderColor?: string; borderWidth?: number; borderType?: string } };
const itemsOf = (spec: RenderSpec) =>
  ((optionFor(spec) as { series?: { data?: unknown[] }[] }).series ?? []).map((one) =>
    (one.data ?? []).map((item) =>
      typeof item === 'object' && item !== null ? (item as Item) : {},
    ),
  );
const ringed = (item: Item) => item.itemStyle?.borderType === 'dashed';

describe('the item the keyboard is on (T306)', () => {
  const bar: RenderSpec = {
    chartType: 'bar',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: ROWS,
    keyboardFocus: 'shipped',
  };

  it('rings that item, and only it, dashed in the accent', () => {
    const [items = []] = itemsOf(bar);
    expect(items.map(ringed)).toEqual([false, true, false]);
    expect(items[1]?.itemStyle).toMatchObject({
      borderColor: COLORS.light.accent,
      borderWidth: 2,
      borderType: 'dashed',
    });
  });

  it('rings nothing when no item has the keyboard', () => {
    const [items = []] = itemsOf({ ...bar, keyboardFocus: undefined });
    expect(items.some(ringed)).toBe(false);
  });

  it('leaves a marked item its marking’s outline, and rings an unmarked one', () => {
    const marked = (value: string): RenderSpec => ({
      ...bar,
      marking: {
        predicate: { items: [[{ member: STATUS, value }]], ranges: [] },
        colour: '#aa3377',
      },
    });
    // On the marked item: its outline, solid, 1.5 px, in the marking's ink.
    const [onMarked = []] = itemsOf(marked('shipped'));
    expect(onMarked[1]?.itemStyle).toEqual(
      expect.objectContaining({ borderColor: '#aa3377', borderWidth: MARKED_OUTLINE_PX }),
    );
    expect(onMarked.some(ringed)).toBe(false);
    // On an unmarked one beside a marked one: the ring, told from the outline.
    const [beside = []] = itemsOf(marked('paid'));
    expect(beside.map(ringed)).toEqual([false, true, false]);
    expect(beside[0]?.itemStyle?.borderWidth).toBe(MARKED_OUTLINE_PX);
    expect(beside[1]?.itemStyle?.borderWidth).not.toBe(MARKED_OUTLINE_PX);
  });

  it('names the first item the keyboard is on, for its tooltip', () => {
    expect(focusedItemOf(optionFor(bar), bar)).toEqual({ seriesIndex: 0, dataIndex: 1 });
    expect(focusedItemOf(optionFor(bar), { ...bar, keyboardFocus: undefined })).toBeUndefined();
  });

  it('is drawn: the focused bar’s path has a dashed accent stroke', () => {
    const svg = renderToSvg(optionFor(bar));
    const dashed = [...svg.matchAll(/<path\b[^>]*stroke-dasharray="[^"]+"[^>]*>/g)].map(
      (match) => match[0],
    );
    expect(dashed).toHaveLength(1);
    expect(dashed[0]).toContain(`stroke="${COLORS.light.accent}"`);
  });

  it('rings it in the dark theme’s accent in the dark theme', () => {
    const dark = themed(optionFor(bar), 'dark') as { series?: { data?: Item[] }[] };
    expect(dark.series?.[0]?.data?.[1]?.itemStyle?.borderColor).toBe(COLORS.dark.accent);
  });

  it('rings a slice of a donut and a cell column of a heatmap by their category', () => {
    const [slices = []] = itemsOf({ ...bar, chartType: 'donut' });
    expect(slices.map(ringed)).toEqual([false, true, false]);

    const [cells = []] = itemsOf({
      chartType: 'heatmap',
      encoding: { x: [STATUS], y: [REGION], color: [COUNT] },
      rows: ROWS.map((row) => ({ ...row, [REGION]: 'North' })),
      keyboardFocus: 'refunded',
    });
    expect(cells.map(ringed)).toEqual([false, false, true]);
  });

  it('rings the category in every series of a chart split by colour', () => {
    const split = itemsOf({
      chartType: 'groupedBar',
      encoding: { x: [REGION], y: [COUNT], color: [STATUS] },
      rows: [
        { [REGION]: 'North', [STATUS]: 'paid', [COUNT]: 1 },
        { [REGION]: 'South', [STATUS]: 'paid', [COUNT]: 2 },
        { [REGION]: 'North', [STATUS]: 'shipped', [COUNT]: 3 },
        { [REGION]: 'South', [STATUS]: 'shipped', [COUNT]: 4 },
      ],
      keyboardFocus: 'South',
    });
    expect(split.map((items) => items.map(ringed))).toEqual([
      [false, true],
      [false, true],
    ]);
  });
});
