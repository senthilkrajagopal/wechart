import { seriesOf, type RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import type { EChartsOption } from '../theme';
import { MARKED_OUTLINE_PX } from './render';

/**
 * The item a tile's keyboard is on, drawn (T306; AC-100, AC-176).
 *
 * AC-100's arrows move between a tile's items without marking; Space marks
 * the one they are on. AC-176 asks that focus be visible and "distinct from
 * the marking outline" (direction.md rules 39 and 52): a marked item has a
 * solid 1.5 px outline in its marking's ink (`render.ts`), so an unmarked
 * focused item gets a dashed 2 px ring in the accent — the colour of every
 * other focus ring in the app — differing in dash, width and colour.
 *
 * A focused item that is marked keeps its marking's outline: an item has one
 * border, and trading the outline for the ring would hide what is marked
 * exactly where the keyboard is. There, as everywhere, the tile also shows
 * the item's tooltip, as the prototype does (`dashboard.js`, `showTip`):
 * `focusedItemOf` says which item, and the tile's canvas asks ECharts for it.
 *
 * Per-item `itemStyle`, as the marking is drawn (research/echarts.md). The
 * item is found as the marking finds its row: its category on the axis (in
 * every series of a split chart), a slice's own category, a treemap leaf's
 * name, or a heatmap cell's column.
 */
export const FOCUS_RING_PX = 2;

type Series = Record<string, unknown> & { readonly data?: unknown[]; readonly type?: unknown };

const asObject = (item: unknown): Record<string, unknown> =>
  typeof item === 'object' && item !== null && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : { value: item };

/** An item with no value, which ECharts draws nothing for. */
const isEmpty = (item: unknown) => {
  const value = asObject(item)['value'];
  return value === null || value === undefined;
};

/** The category a drawn item stands for. */
function categoryReader(spec: RenderSpec) {
  const { categories } = seriesOf(spec);
  return (one: Series, item: unknown, index: number): string | undefined => {
    // A heatmap cell is [column, row, value], an object's `value` where it is
    // drawn marked (T453); its column is the category.
    const cell = Array.isArray(item) ? item : asObject(item)['value'];
    if (one.type === 'heatmap' && Array.isArray(cell)) return categories[Number(cell[0])];
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const object = item as Record<string, unknown>;
      // A slice carries its category apart from its written name (AC-221).
      if (typeof object['category'] === 'string') return object['category'];
      if (one.type === 'treemap' && typeof object['name'] === 'string') return object['name'];
      // A map's region by its code: the codes it can't place aren't drawn,
      // so its items aren't the categories in order (T398's review).
      if (one.type === 'map' && typeof object['name'] === 'string') return object['name'];
    }
    return categories[index];
  };
}

const seriesIn = (option: EChartsOption) => (option['series'] as Series[] | undefined) ?? [];

export function withKeyboardFocus(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const focus = spec.keyboardFocus;
  const series = seriesIn(option);
  if (focus === undefined || series.length === 0) return option;

  const categoryOf = categoryReader(spec);
  const ring = {
    borderColor: COLORS.light.accent,
    borderWidth: FOCUS_RING_PX,
    borderType: 'dashed',
  };

  return {
    ...option,
    series: series.map((one) => ({
      ...one,
      data: (one.data ?? []).map((item, index) => {
        if (categoryOf(one, item, index) !== focus) return item;
        const object = asObject(item);
        const style = (object['itemStyle'] as { borderWidth?: unknown } | undefined) ?? {};
        // Marked: its outline stays (see above).
        if (style.borderWidth === MARKED_OUTLINE_PX) return item;
        return { ...object, itemStyle: { ...style, ...ring } };
      }),
    })),
  };
}

/** The first drawn item the keyboard is on, for its tooltip; none without one. */
export function focusedItemOf(
  option: EChartsOption,
  spec: RenderSpec,
): { seriesIndex: number; dataIndex: number } | undefined {
  const focus = spec.keyboardFocus;
  if (focus === undefined) return undefined;
  const categoryOf = categoryReader(spec);
  const series = seriesIn(option);
  for (const [seriesIndex, one] of series.entries()) {
    // A drawn one: a partly marked bar's part that holds nothing (its marked
    // part when none is marked) is no element, and a tooltip shown on it is
    // hidden at once (T387's review).
    const dataIndex = (one.data ?? []).findIndex(
      (item, index) => categoryOf(one, item, index) === focus && !isEmpty(item),
    );
    if (dataIndex >= 0) return { seriesIndex, dataIndex };
  }
  return undefined;
}
