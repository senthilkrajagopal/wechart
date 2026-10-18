/**
 * A combo's hovered series emphasises its axis (AC-500, rule 120; design 20
 * state B): that axis's title and ticks in `text-primary`, and every mark on
 * the other axis faded to 0.28 of its strength, as Datawrapper's keys
 * highlight "the related metrics and vertical axes".
 *
 * Two forms. `emphasisPatch` is what the tile merges into the drawn chart as
 * the pointer moves (`setOption` without `notMerge`), so the chart keeps its
 * elements, and with them the pointer's hover; it sets every value it
 * touches, so the same patch with nothing hovered puts the chart back.
 * `axisEmphasis` is the whole option so emphasised.
 */
import { COLORS } from '@wechart/ui';

import type { ChartTheme } from '../themed';
import type { EChartsOption } from '../theme';

/** The strength the other axis's marks keep (design 20 state B). */
export const FADED = 0.28;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : {};
const opacityOf = (part: unknown) => {
  const opacity = asObject(part)['opacity'];
  return typeof opacity === 'number' ? opacity : 1;
};

/** The axis a series is read against, or none where it has no series. */
function axisOf(option: EChartsOption, seriesName: string): number | undefined {
  const series = Array.isArray(option['series']) ? (option['series'] as Loose[]) : [];
  const one = series.find((each) => each['name'] === seriesName);
  if (one === undefined) return undefined;
  const index = one['yAxisIndex'];
  return typeof index === 'number' ? index : 0;
}

/**
 * An item with its own strength, as a marking or a cross-filter highlight
 * draws one (it wins over its series'), faded by `fade`; any other item as
 * it is, taking its series' strength.
 */
function itemFaded(item: unknown, fade: number): unknown {
  const own = asObject(item);
  const style = asObject(own['itemStyle']);
  if (typeof style['opacity'] !== 'number') return item;
  return { ...own, itemStyle: { ...style, opacity: style['opacity'] * fade } };
}

/**
 * The patch to merge for `hovered`, or for nothing hovered; none but for a
 * combo of two value axes (a trellis has an axis per panel, T848's review).
 * Each value is set from the drawn option, so a mark already faded (a
 * marking's unmarked items, each with its own strength) fades further and
 * comes back to where it was.
 */
export function emphasisPatch(
  option: EChartsOption,
  chartType: string,
  hovered: string | undefined,
  theme: ChartTheme,
): EChartsOption | undefined {
  const axes = option['yAxis'];
  if (chartType !== 'combo' || !Array.isArray(axes) || axes.length < 2) return undefined;
  const on = hovered === undefined ? undefined : axisOf(option, hovered);
  if (hovered !== undefined && on === undefined) return undefined;
  const tokens = COLORS[theme];
  const series = Array.isArray(option['series']) ? (option['series'] as Loose[]) : [];
  return {
    yAxis: axes.map((axis, index) => {
      const own = asObject(axis);
      const colour = (part: string) =>
        index === on
          ? tokens['text-primary']
          : (asObject(own[part])['color'] ?? tokens['text-secondary']);
      return {
        axisLabel: { color: colour('axisLabel') },
        nameTextStyle: { color: colour('nameTextStyle') },
      };
    }),
    series: series.map((one) => {
      const index = typeof one['yAxisIndex'] === 'number' ? one['yAxisIndex'] : 0;
      const fade = on !== undefined && index !== on ? FADED : 1;
      const data = Array.isArray(one['data']) ? (one['data'] as unknown[]) : [];
      const ownStrength = data.some((item) => itemFaded(item, FADED) !== item);
      return {
        ...(ownStrength ? { data: data.map((item) => itemFaded(item, fade)) } : {}),
        itemStyle: { opacity: opacityOf(one['itemStyle']) * fade },
        lineStyle: { opacity: opacityOf(one['lineStyle']) * fade },
        ...(one['areaStyle'] === undefined
          ? {}
          : { areaStyle: { opacity: opacityOf(one['areaStyle']) * fade } }),
      };
    }),
  };
}

/** Merged one level into each part, as `setOption` merges an option. */
function merged(option: EChartsOption, patch: EChartsOption): EChartsOption {
  const each = (base: unknown, over: unknown): unknown =>
    (Array.isArray(base) ? base : []).map((one, at) => {
      const own = asObject(one);
      const top = asObject(Array.isArray(over) ? over[at] : undefined);
      return {
        ...own,
        // An array (a series' data) replaces; an object merges.
        ...Object.fromEntries(
          Object.entries(top).map(([key, value]) => [
            key,
            Array.isArray(value) ? value : { ...asObject(own[key]), ...asObject(value) },
          ]),
        ),
      };
    });
  return {
    ...option,
    yAxis: each(option['yAxis'], patch['yAxis']),
    series: each(option['series'], patch['series']),
  };
}

/** The option with `hovered`'s axis emphasised, or the option itself where nothing is. */
export function axisEmphasis(
  option: EChartsOption,
  chartType: string,
  hovered: string | undefined,
  theme: ChartTheme,
): EChartsOption {
  if (hovered === undefined) return option;
  const patch = emphasisPatch(option, chartType, hovered, theme);
  return patch === undefined ? option : merged(option, patch);
}
