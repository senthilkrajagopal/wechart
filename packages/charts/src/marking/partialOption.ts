import { memberOn, membersOn, OTHER_LABEL, type RenderSpec } from '@wechart/core';

import { isBarType } from '../series/bar';
import { isLineType } from '../series/line';
import { isPieType } from '../series/pie';
import type { EChartsOption } from '../theme';
import { partialMark, type PartialMark } from './partial';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from './render';

/**
 * Items partly marked, drawn (T387, AC-097; direction.md §7a, rule 49).
 *
 * A tile that doesn't group by a member its marking names has its marked
 * share answered apart (`marking.share`, T388): each of its items has a
 * total and a marked part. How that is drawn depends on the measure, which
 * `partialMark` decides — a sum's or a count's share is a part of it, drawn
 * from the baseline; any other measure's isn't, and its item is drawn whole
 * with a hatch, the two values said in its tooltip — and on the chart:
 *
 * - a bar is two parts in one stack, the marked one at its foot, and in a
 *   stacked bar each segment is split on its own;
 * - a line is faded, with a full-strength line for its marked share drawn
 *   over it once the Customize tab has stacked and ordered the lines
 *   (`withMarkedShareLines`), so it sits in its own band;
 * - a pie's or a treemap's partly marked item is hatched and outlined, never
 *   a smaller angle or area.
 *
 * Each item carries its `share`, for the tooltip to say "Marked: X" beside
 * the total. Other chart types are marked as their rows are (`withMarks`).
 */
export interface ItemShare {
  /** The measure over the item's marked rows; none where none is marked. */
  readonly marked?: number;
  /** The item's whole value; none on a marked line's gap. */
  readonly total?: number;
  /** Which part of a split bar or line the item is, where it is one. */
  readonly part?: 'marked' | 'rest';
}

type Item = Record<string, unknown>;
type Series = Record<string, unknown> & {
  readonly data?: unknown[];
  readonly name?: string;
  readonly stack?: string;
};

/** The hatch a partly marked item wears where no sub-length can be drawn. */
const HATCH = { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 };

const asItem = (item: unknown): Item =>
  typeof item === 'object' && item !== null && !Array.isArray(item)
    ? (item as Item)
    : { value: item };
const numberOf = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
const shareIn = (item: unknown): ItemShare | undefined => asItem(item)['share'] as ItemShare;

export function drawsPartialMarks(spec: RenderSpec): boolean {
  return (
    spec.marking?.share !== undefined &&
    spec.marking.whole !== true &&
    (isBarType(spec.chartType) ||
      isLineType(spec.chartType) ||
      isPieType(spec.chartType) ||
      spec.chartType === 'treemap')
  );
}

/** Reading an item's marked part from the share's rows. */
function shareReader(spec: RenderSpec, drawn: readonly unknown[]) {
  const share = spec.marking?.share ?? [];
  const measures = membersOn(spec.encoding, 'y');
  const category = memberOn(spec.encoding, 'x');
  const splitBy = memberOn(spec.encoding, 'color');
  const categories = new Set(drawn.map((each) => String(each ?? '')));
  /**
   * Top N's "Other (n)" item holds every category it folded (AC-041), and
   * the share is asked without Top N (T388), so its rows are the ones whose
   * category no drawn item has.
   */
  const isOther = (at: unknown) => String(at ?? '').startsWith(`${OTHER_LABEL} (`);
  /** A series' measure: itself where a series is a measure, else the chart's one. */
  const measureOf = (seriesName: string | undefined) =>
    seriesName !== undefined && measures.includes(seriesName) ? seriesName : (measures[0] ?? '');

  return {
    measureOf,
    /**
     * The measure over an item's marked rows: the share's rows for its
     * category and split, summed. None where no row is marked.
     */
    markedOf(seriesName: string | undefined, at: unknown, split: string | undefined) {
      const measure = measureOf(seriesName);
      const splitValue = split ?? (splitBy !== undefined ? seriesName : undefined);
      const rows = share.filter((row) => {
        if (category !== undefined) {
          const value = String(row[category] ?? '');
          const own = value === String(at ?? '');
          if (!own && !(isOther(at) && !categories.has(value))) return false;
        }
        return (
          splitBy === undefined ||
          splitValue === undefined ||
          String(row[splitBy] ?? '') === splitValue
        );
      });
      if (rows.length === 0) return undefined;
      return rows.reduce((sum, row) => sum + (numberOf(row[measure]) ?? 0), 0);
    },
  };
}

/** The category axis' values, in the order its items are drawn. */
function categoriesOf(option: EChartsOption): unknown[] {
  const both = [option['xAxis'], option['yAxis']] as (
    { type?: string; data?: unknown[] } | undefined
  )[];
  const axis = both.find((one) => one?.type === 'category') ?? both[0];
  return axis?.data ?? [];
}

export function withPartialMarks(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const marking = spec.marking;
  if (marking === undefined || !drawsPartialMarks(spec)) return option;

  const series = (option['series'] as Series[] | undefined) ?? [];
  const colourOf = (one: Series) =>
    (one['itemStyle'] as { color?: string } | undefined)?.color ?? '';
  const outline = { opacity: 1, borderColor: marking.colour, borderWidth: MARKED_OUTLINE_PX };
  const kindOf = (
    measure: string,
    total: number,
    marked: number | undefined,
    own: string,
  ): PartialMark =>
    partialMark(
      { marked, total, aggType: marking.aggTypes?.[measure] },
      { own, marking: marking.colour },
    );
  /** What the tooltip says: the marked value wherever any of it is marked. */
  const toldOf = (kind: PartialMark, marked: number | undefined, total: number): ItemShare =>
    kind.kind === 'none' || marked === undefined ? { total } : { marked, total };

  if (isBarType(spec.chartType)) {
    const categories = categoriesOf(option);
    const { markedOf, measureOf } = shareReader(spec, categories);
    return {
      ...option,
      series: series.flatMap((one, index) => {
        const own = colourOf(one);
        const parts = (one.data ?? []).map((raw, at) => {
          const item = asItem(raw);
          const total = numberOf(item['value']);
          if (total === undefined) return { marked: { ...item, value: null }, rest: item };
          const marked = markedOf(one.name, categories[at], undefined);
          const kind = kindOf(measureOf(one.name), total, marked, own);
          const style = (item['itemStyle'] as Item | undefined) ?? {};
          const told = toldOf(kind, marked, total);
          const as = (value: number | null, part: 'marked' | 'rest', itemStyle: Item) => ({
            ...item,
            value,
            itemStyle,
            share: { ...told, part } satisfies ItemShare,
          });
          switch (kind.kind) {
            case 'none':
              return {
                marked: as(null, 'marked', style),
                rest: as(total, 'rest', {
                  ...style,
                  color: own,
                  opacity: UNMARKED_OPACITY,
                  borderWidth: 0,
                }),
              };
            case 'whole':
              return {
                marked: as(total, 'marked', { ...style, color: own, ...outline }),
                rest: as(null, 'rest', style),
              };
            case 'share':
              return {
                // At the foot, square: the remainder carries the bar's ends.
                marked: as(kind.marked, 'marked', {
                  ...style,
                  ...kind.markedStyle,
                  borderRadius: 0,
                }),
                rest: as(kind.remainder, 'rest', { ...style, ...kind.remainderStyle }),
              };
            case 'pattern':
              return {
                marked: as(null, 'marked', style),
                rest: as(total, 'rest', { ...style, ...kind.style }),
              };
          }
        });
        // Its two parts in one stack: the chart's own where it stacks, so each
        // segment is split in its place; else a stack of the bar's own.
        const stack = one.stack ?? `marked-share-${String(index)}`;
        return [
          { ...one, stack, data: parts.map((part) => part.marked) },
          { ...one, stack, data: parts.map((part) => part.rest) },
        ];
      }),
    };
  }

  if (isLineType(spec.chartType)) {
    // Faded, each point knowing its marked part; the marked line itself is
    // drawn after the Customize tab (`withMarkedShareLines`).
    const categories = categoriesOf(option);
    const { markedOf, measureOf } = shareReader(spec, categories);
    return {
      ...option,
      series: series.map((one) => ({
        ...one,
        lineStyle: { ...(one['lineStyle'] as Item | undefined), opacity: UNMARKED_OPACITY },
        itemStyle: { ...(one['itemStyle'] as Item | undefined), opacity: UNMARKED_OPACITY },
        ...(one['areaStyle'] === undefined
          ? {}
          : { areaStyle: { ...(one['areaStyle'] as Item), opacity: UNMARKED_OPACITY * 0.5 } }),
        data: (one.data ?? []).map((raw, at) => {
          const item = asItem(raw);
          const total = numberOf(item['value']);
          if (total === undefined) return raw;
          const marked = markedOf(one.name, categories[at], undefined);
          const kind = kindOf(measureOf(one.name), total, marked, colourOf(one));
          return { ...item, share: { ...toldOf(kind, marked, total), part: 'rest' } };
        }),
      })),
    };
  }

  // A pie's slices, a treemap's leaves: hatched where partly marked, never
  // a smaller angle or area.
  const measure = membersOn(spec.encoding, 'y')[0] ?? '';
  return {
    ...option,
    series: series.map((one) => {
      const items = (one.data ?? []).map(asItem);
      const { markedOf } = shareReader(
        spec,
        items.map((item) => item['category'] ?? item['name']),
      );
      return {
        ...one,
        data: items.map((item) => {
          const total = numberOf(item['value']);
          if (total === undefined) return item;
          const at = item['category'] ?? item['name'];
          const split = typeof item['split'] === 'string' ? item['split'] : undefined;
          const marked = markedOf(undefined, at, split);
          const style = (item['itemStyle'] as Item | undefined) ?? {};
          const own = (style['color'] as string | undefined) ?? colourOf(one);
          const kind = kindOf(measure, total, marked, own);
          const itemStyle =
            kind.kind === 'none'
              ? { ...style, opacity: UNMARKED_OPACITY, borderWidth: 0 }
              : kind.kind === 'whole'
                ? { ...style, ...outline }
                : { ...style, ...outline, decal: HATCH };
          return { ...item, itemStyle, share: toldOf(kind, marked, total) };
        }),
      };
    }),
  };
}

/**
 * A line's marked share, drawn at full strength over its faded total (T387,
 * direction.md §7a) — once the Customize tab has stacked and ordered the
 * lines, so a stacked line's share sits in its own band: on the lines below
 * it, as ECharts stacks them (values of one sign on those of the same sign),
 * rather than from zero through theirs (T387's review).
 */
export function withMarkedShareLines(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!drawsPartialMarks(spec) || !isLineType(spec.chartType)) return option;
  const series = (option['series'] as Series[] | undefined) ?? [];
  const valueAt = (one: Series, at: number) => numberOf(asItem((one.data ?? [])[at])['value']);

  return {
    ...option,
    series: series.flatMap((one, index) => {
      const data = one.data ?? [];
      if (!data.some((item) => shareIn(item)?.part === 'rest')) return [one];
      const below =
        one.stack === undefined
          ? []
          : series.slice(0, index).filter((other) => other.stack === one.stack);
      const line = data.map((raw, at) => {
        const told = shareIn(raw);
        const total = valueAt(one, at);
        if (told?.marked === undefined || total === undefined) {
          return { value: null, share: { ...told, part: 'marked' } satisfies ItemShare };
        }
        const offset = below.reduce((sum, other) => {
          const value = valueAt(other, at);
          return value !== undefined && Math.sign(value) === Math.sign(total) ? sum + value : sum;
        }, 0);
        return {
          value: offset + told.marked,
          share: { ...told, part: 'marked' } satisfies ItemShare,
        };
      });
      return [
        one,
        {
          ...one,
          // A line of its own over the total it is a share of: not stacked,
          // no area, no value labels of its own.
          stack: undefined,
          areaStyle: undefined,
          label: { show: false },
          lineStyle: { ...(one['lineStyle'] as Item | undefined), opacity: 1 },
          itemStyle: { ...(one['itemStyle'] as Item | undefined), opacity: 1 },
          data: line,
        },
      ];
    }),
  };
}
