import { memberOn, seriesOf, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from '../theme';
import { drawsPartialMarks, withPartialMarks } from './partialOption';
import { markedItemStyle } from './render';

/**
 * Drawing a tile's marking over its chart (AC-096, direction.md rule 49).
 *
 * `markedItemStyle` says what one item looks like; this finds the row behind
 * each drawn item so it can be asked. Applied to the finished option, like
 * the cross-filter highlight beside it, so no chart type can quietly forget
 * a marking it is showing.
 *
 * The row is found by what the item *is* on this chart: its category on the
 * axis, its series where a dimension splits them, its own name where the
 * type names items (a slice, a treemap leaf). That is the same reading of an
 * item the click uses, so what a click marks is what is then drawn marked.
 */
type Series = Record<string, unknown> & { readonly data?: unknown[]; readonly name?: string };

const asObject = (item: unknown) =>
  typeof item === 'object' && item !== null && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : { value: item };

export function withMarks(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const marking = spec.marking;
  if (marking === undefined) return option;
  // Its items partly marked, where the marked share was answered apart (T387).
  if (drawsPartialMarks(spec)) return withPartialMarks(option, spec);

  const series = (option['series'] as Series[] | undefined) ?? [];
  if (series.length === 0) return option;

  const category = memberOn(spec.encoding, 'x');
  const splitBy = memberOn(spec.encoding, 'color');
  const { categories } = seriesOf(spec);

  /**
   * The row an item was drawn from: the one whose category matches, and
   * whose split value matches the series it is in. A chart with neither is
   * drawn from its only row.
   */
  const rowFor = (seriesName: string | undefined, index: number, named: string | undefined) => {
    const wanted = named ?? categories[index];
    return spec.rows.find((row) => {
      if (category !== undefined && String(row[category] ?? '') !== String(wanted ?? '')) {
        return false;
      }
      if (splitBy !== undefined && seriesName !== undefined) {
        return String(row[splitBy] ?? '') === seriesName;
      }
      return true;
    });
  };

  return {
    ...option,
    series: series.map((one) => ({
      ...one,
      data: (one.data ?? []).map((item, index) => {
        const object = asObject(item);
        /**
         * A pie's slice carries the values it stands for apart from its
         * written name — "paid · North" names the slice for its reader and
         * is no row's value (AC-221) — and its split value in place of the
         * series it is in.
         */
        const raw = typeof object['category'] === 'string' ? object['category'] : undefined;
        const split = typeof object['split'] === 'string' ? object['split'] : undefined;
        const row = rowFor(
          split ?? one.name,
          index,
          raw ?? (object['name'] as string | undefined) ?? undefined,
        );
        if (row === undefined) return item;
        const own = (object['itemStyle'] as { color?: string } | undefined)?.color;
        const style = markedItemStyle(row, own ?? colourOfSeries(one), marking);
        return {
          ...object,
          itemStyle: { ...((object['itemStyle'] as object | undefined) ?? {}), ...style },
        };
      }),
    })),
  };
}

/** A series' own colour, where the item carries none of its own. */
function colourOfSeries(one: Series): string {
  const style = one['itemStyle'] as { color?: string } | undefined;
  return style?.color ?? '';
}
