import {
  isEmptyPredicate,
  matchesPredicate,
  memberOn,
  seriesOf,
  type RenderSpec,
} from '@wechart/core';

import { isTrellisType } from '../layout/trellis';
import { isBoxplotType } from '../series/boxplot';
import { isHeatmapType } from '../series/heatmap';
import { isScatterType, scatterSeriesOf } from '../series/scatter';
import type { EChartsOption } from '../theme';
import { drawsPartialMarks, withBoxMarks, withPartialMarks, type ItemShare } from './partialOption';
import { markedItemStyle, UNMARKED_OPACITY } from './render';

/**
 * Drawing a tile's marking over its chart (AC-096, direction.md rule 49).
 *
 * `markedItemStyle` says what one item looks like; this finds the row behind
 * each drawn item so it can be asked. Applied to the finished option, like
 * the cross-filter highlight beside it, so no chart type can quietly forget
 * a marking it is showing.
 *
 * The row is found by what the item *is* on this chart (T507): its category
 * on the axis and the series it is in (a trellis's panel, else its colour's
 * value), or its own values where the type names items (a slice by every
 * member it is grouped by, a treemap leaf, a country); a heatmap's cell by
 * its column and row, and a scatter's point by the row its series drew it
 * from — never by its place among the categories, which neither follows. That
 * is the reading of an item the click uses, so what a click marks is what is
 * then drawn marked.
 */
type Series = Record<string, unknown> & {
  readonly data?: unknown[];
  readonly name?: string;
  readonly type?: string;
};
type Row = Record<string, unknown>;

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
  // Nothing marked, and not marked whole: nothing fades (`markedItemStyle`).
  const holdsNothing = marking.whole !== true && isEmptyPredicate(marking.predicate);
  const isMarked = (row: Row) => marking.whole === true || matchesPredicate(marking.predicate, row);

  // A box by the points it is drawn from, some of them marked or all (T507).
  if (isBoxplotType(spec.chartType)) {
    return holdsNothing
      ? option
      : withBoxMarks(option, spec, marking.colour, (row) => (isMarked(row) ? 'whole' : 'none'));
  }

  const styled = (item: unknown, row: Row | undefined, own: string) => {
    if (row === undefined) return item;
    const object = asObject(item);
    return {
      ...object,
      itemStyle: {
        ...((object['itemStyle'] as object | undefined) ?? {}),
        ...markedItemStyle(row, own, marking),
      },
    };
  };

  if (isHeatmapType(spec.chartType)) {
    // A cell by its column and its row, as the heatmap placed it; its colour
    // is the scale's, which a colour of its own would stand in for.
    const across = memberOn(spec.encoding, 'x');
    const down = memberOn(spec.encoding, 'y');
    const axisData = (axis: unknown) => (axis as { data?: unknown[] } | undefined)?.data ?? [];
    const [columns, rows] = [axisData(option['xAxis']), axisData(option['yAxis'])];
    const keyOf = (at: unknown, by: unknown) => `${String(at ?? '')}\u0000${String(by ?? '')}`;
    const cells = new Map<string, Row>();
    for (const row of spec.rows) {
      const key = keyOf(
        across === undefined ? '' : row[across],
        down === undefined ? '' : row[down],
      );
      if (!cells.has(key)) cells.set(key, row);
    }
    return {
      ...option,
      series: series.map((one) => ({
        ...one,
        data: (one.data ?? []).map((item) => {
          const cell = asObject(item)['value'];
          if (!Array.isArray(cell)) return item;
          const row = cells.get(keyOf(columns[Number(cell[0])], rows[Number(cell[1])]));
          if (row === undefined) return item;
          const drawn = styled(item, row, '') as Record<string, unknown>;
          const style = { ...(drawn['itemStyle'] as Record<string, unknown>) };
          delete style['color'];
          return { ...drawn, itemStyle: style };
        }),
      })),
    };
  }

  if (isScatterType(spec.chartType)) {
    // Each point a row, in the order its series drew them.
    const drawn = scatterSeriesOf(spec);
    return {
      ...option,
      series: series.map((one, index) => {
        const rows = (drawn.find((each) => each.name === one.name) ?? drawn[index])?.rows ?? [];
        return {
          ...one,
          data: (one.data ?? []).map((item, at) => styled(item, rows[at], colourOfSeries(one))),
        };
      }),
    };
  }

  const category = memberOn(spec.encoding, 'x');
  // What splits its series: a trellis's panel, else its colour (T507).
  const splitBy = memberOn(spec.encoding, isTrellisType(spec.chartType) ? 'facet' : 'color');
  const { categories } = seriesOf(spec);

  /**
   * The row an item was drawn from: the one whose category matches, whose
   * split value matches the series it is in, and — a pie's slice — whose
   * other groupings match its own (T507). A chart with neither is drawn from
   * its only row.
   */
  const rowFor = (
    seriesName: string | undefined,
    index: number,
    named: string | undefined,
    grouped: Readonly<Record<string, string>>,
  ) => {
    const wanted = named ?? categories[index];
    return spec.rows.find((row) => {
      if (category !== undefined && String(row[category] ?? '') !== String(wanted ?? '')) {
        return false;
      }
      if (Object.entries(grouped).some(([member, value]) => String(row[member] ?? '') !== value))
        return false;
      if (splitBy !== undefined && seriesName !== undefined) {
        return String(row[splitBy] ?? '') === seriesName;
      }
      return true;
    });
  };

  const marked = series.map((one) => {
    const isLine = one.type === 'line' && !holdsNothing;
    return {
      ...one,
      /**
       * A line faded, its marked points' segments drawn at full strength
       * over it after the Customize tab (`withMarkedShareLines`), as
       * Spotfire draws a marked line (references-markings.md C3; T507).
       */
      ...(isLine
        ? {
            lineStyle: { ...(one['lineStyle'] as object | undefined), opacity: UNMARKED_OPACITY },
            ...(one['areaStyle'] === undefined
              ? {}
              : {
                  areaStyle: {
                    ...(one['areaStyle'] as object),
                    opacity: UNMARKED_OPACITY * 0.5,
                  },
                }),
          }
        : {}),
      data: (one.data ?? []).map((item, index) => {
        const object = asObject(item);
        /**
         * A pie's slice carries the values it stands for apart from its
         * written name — "paid · North" names the slice for its reader and
         * is no row's value (AC-221) — its split value in place of the
         * series it is in, and any other grouping's (T507).
         */
        const raw = typeof object['category'] === 'string' ? object['category'] : undefined;
        const split = typeof object['split'] === 'string' ? object['split'] : undefined;
        const grouped = (object['grouped'] as Readonly<Record<string, string>> | undefined) ?? {};
        const row = rowFor(
          split ?? one.name,
          index,
          raw ?? (object['name'] as string | undefined) ?? undefined,
          grouped,
        );
        if (row === undefined) return item;
        /**
         * A mark that only fades with its item, never outlined: a bullet's
         * bands and its target, around the value bar the marking outlines
         * (T955, AC-582).
         */
        if (one['markedAs'] === 'fade')
          return holdsNothing || isMarked(row)
            ? item
            : {
                ...object,
                itemStyle: {
                  ...((object['itemStyle'] as object | undefined) ?? {}),
                  opacity: UNMARKED_OPACITY,
                },
              };
        const own = (object['itemStyle'] as { color?: string } | undefined)?.color;
        const drawn = styled(item, row, own ?? colourOfSeries(one)) as Record<string, unknown>;
        if (!isLine || drawn['value'] === null || drawn['value'] === undefined) return drawn;
        return {
          ...drawn,
          share: {
            part: 'rest',
            ...(isMarked(row) ? { whole: true } : {}),
          } satisfies ItemShare,
        };
      }),
    };
  });
  return { ...option, series: marked };
}

/** A series' own colour, where the item carries none of its own. */
function colourOfSeries(one: Series): string {
  const style = one['itemStyle'] as { color?: string } | undefined;
  return style?.color ?? '';
}
