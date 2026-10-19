import {
  isEmptyPredicate,
  matchesPredicate,
  memberOn,
  membersOn,
  OTHER_LABEL,
  type RenderSpec,
} from '@wechart/core';

import { isTrellisType } from '../layout/trellis';
import { isBarType } from '../series/bar';
import { boxesOf, isBoxplotType } from '../series/boxplot';
import { isBulletType } from '../series/bullet';
import { isComboType } from '../series/combo';
import { isHeatmapType } from '../series/heatmap';
import { isLineType } from '../series/line';
import { isMapType } from '../series/map';
import { isPieType } from '../series/pie';
import { isScatterType, scatterSeriesOf } from '../series/scatter';
import { isTreemapType } from '../series/treemap';
import type { EChartsOption } from '../theme';
import { markedState, partialMark, type PartialMark } from './partial';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from './render';

/**
 * Items partly marked, drawn (T387, T453, AC-097; direction.md §7a, rule 49).
 *
 * A tile that doesn't group by a member its marking names has its marked
 * share answered apart (`marking.share`, T388): each of its items has a
 * total and a marked part. How that is drawn depends on the measure, which
 * `partialMark` decides — a sum's or a count's share is a part of it, drawn
 * from the baseline; any other measure's isn't, and its item is drawn whole
 * with a hatch, the two values said in its tooltip — and on the chart:
 *
 * - a bar is two parts in one stack, the marked one at its foot, and in a
 *   stacked bar each segment is split on its own — a combo's bars and a
 *   trellis panel's too, each panel in its own stack;
 * - a line is faded, with a full-strength line for its marked share drawn
 *   over it once the Customize tab has stacked and ordered the lines
 *   (`withMarkedShareLines`), so it sits in its own band — a combo's line too;
 * - a heatmap's partly marked cell is outlined dashed, its colour the scale's
 *   (direction.md: "dashed when partly marked"), and hatched as well where its
 *   measure is not additive (AC-097);
 * - a pie's or a treemap's partly marked item is hatched and outlined, never
 *   a smaller angle or area; and so, in the user's answer of 2026-09-28
 *   (R43), is a scatter's point, a map's country and a box plot's box — a box
 *   partly marked when some of its rows are, and each outlier marked or not.
 *
 * Each item carries its `share`, for the tooltip to say "Marked: X" beside
 * the total.
 */
export interface ItemShare {
  /**
   * The measure over the item's marked rows; none where none is marked. A
   * box plot's box: how many of its points hold marked rows.
   */
  readonly marked?: number;
  /** The item's whole value; none on a marked line's gap. A box's: its points. */
  readonly total?: number;
  /** Which part of a split bar or line the item is, where it is one. */
  readonly part?: 'marked' | 'rest';
  /** A scatter point's two measures, each over its marked rows, by member. */
  readonly markedBy?: Readonly<Record<string, number>>;
  /**
   * A line's point that a marking holds whole, from its own rows rather than
   * a share (T507): on the marked line at its value, with no "Marked:" said.
   */
  readonly whole?: boolean;
}

type Row = Record<string, unknown>;
type Item = Record<string, unknown>;
type Series = Record<string, unknown> & {
  readonly data?: unknown[];
  readonly name?: string;
  readonly stack?: string;
  readonly type?: string;
};

/** The hatch a partly marked item wears where no sub-length can be drawn. */
const HATCH = { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 };

/**
 * A partly marked scatter point's shape: its disc, crossed by two strokes on
 * the diagonal, as the hatch runs. ECharts draws no decal on a symbol — it
 * would be scaled with it — so a point's hatch is its own shape, its outline
 * and its strokes both in the marking's colour (research/echarts-symbol-hatch.md).
 * A circle of radius 5, and two chords 2 from its centre.
 */
export const HATCHED_POINT =
  'path://M0,5a5,5 0 1,0 10,0a5,5 0 1,0 -10,0Z M3.17,9.65L9.65,3.17 M0.35,6.83L6.83,0.35';

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
const styleOf = (item: Item): Item => (item['itemStyle'] as Item | undefined) ?? {};
const colourOf = (one: Series) => (one['itemStyle'] as { color?: string } | undefined)?.color ?? '';
/**
 * A measure over some of the share's rows, summed; none where no row gives it
 * a value — an average over marked rows with none is no measurement, never 0
 * (T453's review).
 */
const sumOf = (rows: readonly Row[], measure: string): number | undefined => {
  const values = rows.flatMap((row) => {
    const value = numberOf(row[measure]);
    return value === undefined ? [] : [value];
  });
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0);
};
const isOther = (at: unknown) => String(at ?? '').startsWith(`${OTHER_LABEL} (`);

/** The types whose items can be drawn partly marked (T387, T453). */
function drawsPartly(chartType: string): boolean {
  return (
    isBarType(chartType) ||
    isLineType(chartType) ||
    isComboType(chartType) ||
    isTrellisType(chartType) ||
    isPieType(chartType) ||
    isTreemapType(chartType) ||
    isHeatmapType(chartType) ||
    isScatterType(chartType) ||
    isBoxplotType(chartType) ||
    isMapType(chartType) ||
    // Its value bar, as a bar's (T955, AC-582).
    isBulletType(chartType)
  );
}

export function drawsPartialMarks(spec: RenderSpec): boolean {
  return (
    spec.marking?.share !== undefined && spec.marking.whole !== true && drawsPartly(spec.chartType)
  );
}

/** The members a chart measures: a scatter's x and a heatmap's colour among them. */
function measuredOf(spec: RenderSpec): ReadonlySet<string> {
  return new Set([
    ...(spec.measures ?? []),
    ...membersOn(spec.encoding, 'y'),
    ...(isScatterType(spec.chartType) ? membersOn(spec.encoding, 'x') : []),
    ...(isHeatmapType(spec.chartType) ? membersOn(spec.encoding, 'color') : []),
  ]);
}

/**
 * The share's rows for a row a chart or table drew (T453): those alike in
 * every member it is grouped by — every column it has that isn't measured.
 * The share is the same question asked with the marking (T388), so its rows
 * carry the same columns. Indexed once by those members' values, so a tile
 * of many rows is read in a pass, not a scan per row (T453's review).
 */
function shareMatcher(
  share: readonly Row[],
  measured: ReadonlySet<string>,
): (row: Row) => readonly Row[] {
  const indexes = new Map<string, Map<string, Row[]>>();
  const keyOf = (row: Row, members: readonly string[]) =>
    members.map((member) => String(row[member] ?? '')).join('\u0000');
  return (row) => {
    const members = Object.keys(row).filter((key) => !measured.has(key));
    const signature = members.join('\u0000');
    let index = indexes.get(signature);
    if (index === undefined) {
      index = new Map();
      for (const other of share) {
        const key = keyOf(other, members);
        const rows = index.get(key);
        if (rows === undefined) index.set(key, [other]);
        else rows.push(other);
      }
      indexes.set(signature, index);
    }
    return index.get(keyOf(row, members)) ?? [];
  };
}

/** A table's row under a marking (T453, T507). */
export interface RowMark {
  /** Marked in full, in part, or not at all. */
  readonly state: 'whole' | 'partly' | 'none';
  /** Its measures over its marked rows, where a share was answered for it. */
  readonly marked: Readonly<Record<string, number>>;
}

/**
 * A table's rows under a marking; none where it shows none, or its marking
 * holds nothing (AC-096: nothing is dimmed then).
 *
 * - A table grouped by what the marking names reads each row from itself
 *   (T507, AC-096): marked, or not — every row where it was marked whole.
 * - One whose share was answered (T453; the user's answer of 2026-09-28, R43)
 *   reads each row's measures over its marked rows: marked in part where any
 *   measure isn't marked in full, which a measure that isn't additive never
 *   is (T387's review), and not at all where none of it is. Top N's
 *   "Other (n)" row takes the marked rows of the categories it folds, as a
 *   bar's does.
 */
export function rowMarksOf(
  spec: RenderSpec,
  measures: readonly string[],
): (row: Row) => RowMark | undefined {
  const marking = spec.marking;
  if (marking === undefined) return () => undefined;
  if (marking.whole === true) return () => ({ state: 'whole', marked: {} });
  if (marking.share === undefined) {
    if (isEmptyPredicate(marking.predicate)) return () => undefined;
    return (row) => ({
      state: matchesPredicate(marking.predicate, row) ? 'whole' : 'none',
      marked: {},
    });
  }
  const share = marking.share;
  const matcher = shareMatcher(share, new Set([...measures, ...measuredOf(spec)]));
  const category = memberOn(spec.encoding, 'x');
  const categories = new Set(
    category === undefined ? [] : spec.rows.map((row) => String(row[category] ?? '')),
  );
  const folded =
    category === undefined
      ? []
      : share.filter((row) => !categories.has(String(row[category] ?? '')));
  return (row) => {
    const matched = category !== undefined && isOther(row[category]) ? folded : matcher(row);
    const marked: Record<string, number> = {};
    const states = measures.flatMap((measure) => {
      const total = numberOf(row[measure]);
      const value = sumOf(matched, measure);
      if (total === undefined) return [];
      if (value !== undefined) marked[measure] = value;
      return [markedState({ marked: value, total, aggType: marking.aggTypes?.[measure] })];
    });
    // No measure to say how much of it is marked (a table of dimensions
    // alone, or blank figures): marked in part where any of its rows is
    // (T507's review).
    if (states.length === 0) return { state: matched.length > 0 ? 'partly' : 'none', marked: {} };
    if (states.every((state) => state === 'none')) return { state: 'none', marked: {} };
    return { marked, state: states.every((state) => state === 'whole') ? 'whole' : 'partly' };
  };
}

/** Reading an item's marked part from the share's rows. */
function shareReader(spec: RenderSpec, drawn: readonly unknown[]) {
  const share = spec.marking?.share ?? [];
  const measures = membersOn(spec.encoding, 'y');
  const category = memberOn(spec.encoding, 'x');
  // What splits its series: a trellis's panel, else its colour.
  const splitBy = memberOn(spec.encoding, isTrellisType(spec.chartType) ? 'facet' : 'color');
  /**
   * Top N's "Other (n)" item holds every category it folded (AC-041), and
   * the share is asked without Top N (T388), so its rows are the ones whose
   * category no drawn item has (`isOther`).
   */
  const categories = new Set(drawn.map((each) => String(each ?? '')));
  /**
   * A series' measure: the one it carries, where a split combo's series of
   * one member share its name (T852); else itself where a series is a
   * measure; else the chart's one.
   */
  const measureOf = (seriesName: string | undefined, carried?: unknown) =>
    typeof carried === 'string' && measures.includes(carried)
      ? carried
      : seriesName !== undefined && measures.includes(seriesName)
        ? seriesName
        : (measures[0] ?? '');

  return {
    measureOf,
    /**
     * The measure over an item's marked rows: the share's rows for its
     * category and split — and for a pie's slice, every other member it is
     * grouped by (`grouped`) — summed. None where no row is marked.
     */
    markedOf(
      seriesName: string | undefined,
      at: unknown,
      split: string | undefined,
      grouped: Readonly<Record<string, string>> = {},
      carried?: unknown,
    ) {
      const measure = measureOf(seriesName, carried);
      const splitValue = split ?? (splitBy !== undefined ? seriesName : undefined);
      const rows = share.filter((row) => {
        if (category !== undefined) {
          const value = String(row[category] ?? '');
          const own = value === String(at ?? '');
          if (!own && !(isOther(at) && !categories.has(value))) return false;
        }
        if (Object.entries(grouped).some(([member, value]) => String(row[member] ?? '') !== value))
          return false;
        return (
          splitBy === undefined ||
          splitValue === undefined ||
          String(row[splitBy] ?? '') === splitValue
        );
      });
      return sumOf(rows, measure);
    },
  };
}

/** An axis' categories, in the order its items are drawn: a trellis panel's first. */
const axisData = (axis: unknown): unknown[] =>
  ((Array.isArray(axis) ? axis[0] : axis) as { data?: unknown[] } | undefined)?.data ?? [];

/** The category axis' values, in the order its items are drawn. */
function categoriesOf(option: EChartsOption): unknown[] {
  const [x, y] = [option['xAxis'], option['yAxis']].map(
    (axis) => (Array.isArray(axis) ? axis[0] : axis) as { type?: string } | undefined,
  );
  return axisData(
    y?.type === 'category' && x?.type !== 'category' ? option['yAxis'] : option['xAxis'],
  );
}

/** How the marking draws an item, whatever the chart. */
function drawingOf(marking: NonNullable<RenderSpec['marking']>) {
  const outline = { opacity: 1, borderColor: marking.colour, borderWidth: MARKED_OUTLINE_PX };
  return {
    outline,
    kindOf: (
      measure: string,
      total: number,
      marked: number | undefined,
      own: string,
    ): PartialMark =>
      partialMark(
        { marked, total, aggType: marking.aggTypes?.[measure] },
        { own, marking: marking.colour },
      ),
    /** What the tooltip says: the marked value wherever any of it is marked. */
    toldOf: (kind: PartialMark, marked: number | undefined, total: number): ItemShare =>
      kind.kind === 'none' || marked === undefined ? { total } : { marked, total },
    /**
     * An item no part of which can be drawn: faded, outlined, or outlined and
     * hatched — where it is marked in part, or its measure is not additive.
     */
    wholeStyle: (kind: PartialMark['kind'], style: Item): Item =>
      kind === 'none'
        ? { ...style, opacity: UNMARKED_OPACITY, borderWidth: 0 }
        : kind === 'whole'
          ? { ...style, ...outline }
          : { ...style, ...outline, decal: HATCH },
  };
}

export function withPartialMarks(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const marking = spec.marking;
  if (marking === undefined || !drawsPartialMarks(spec)) return option;

  const series = (option['series'] as Series[] | undefined) ?? [];
  const share = marking.share ?? [];
  const { outline, kindOf, toldOf, wholeStyle } = drawingOf(marking);
  const withSeries = (next: Series[]): EChartsOption => ({ ...option, series: next });

  if (isHeatmapType(spec.chartType)) {
    // Each cell by its column and its row, as the heatmap placed it.
    const across = memberOn(spec.encoding, 'x');
    const down = memberOn(spec.encoding, 'y');
    const measure = memberOn(spec.encoding, 'color') ?? '';
    const [columns, rows] = [axisData(option['xAxis']), axisData(option['yAxis'])];
    const cellOf = (at: unknown, by: unknown) => `${String(at ?? '')}\u0000${String(by ?? '')}`;
    const shared = new Map<string, Row[]>();
    for (const row of share) {
      const key = cellOf(
        across === undefined ? '' : row[across],
        down === undefined ? '' : row[down],
      );
      const alike = shared.get(key);
      if (alike === undefined) shared.set(key, [row]);
      else alike.push(row);
    }
    return withSeries(
      series.map((one) => ({
        ...one,
        data: (one.data ?? []).map((raw) => {
          const item = asItem(raw);
          const cell = item['value'];
          if (!Array.isArray(cell)) return raw;
          const total = numberOf(cell[2]);
          if (total === undefined) return raw;
          const marked = sumOf(
            shared.get(
              cellOf(
                across === undefined ? '' : columns[Number(cell[0])],
                down === undefined ? '' : rows[Number(cell[1])],
              ),
            ) ?? [],
            measure,
          );
          const kind = kindOf(measure, total, marked, '');
          // Its colour is the scale's: a colour of its own would stand in for its value.
          const style = styleOf(item);
          const itemStyle =
            kind.kind === 'none' || kind.kind === 'whole'
              ? wholeStyle(kind.kind, style)
              : {
                  ...style,
                  ...outline,
                  borderType: 'dashed',
                  ...(kind.kind === 'pattern' ? { decal: HATCH } : {}),
                };
          return { ...item, itemStyle, share: toldOf(kind, marked, total) };
        }),
      })),
    );
  }

  const measured = measuredOf(spec);

  if (isScatterType(spec.chartType)) {
    // Each point a row, in the order its series draws them.
    const x = memberOn(spec.encoding, 'x') ?? '';
    const y = memberOn(spec.encoding, 'y') ?? '';
    const drawn = scatterSeriesOf(spec);
    const matcher = shareMatcher(share, measured);
    return withSeries(
      series.map((one, index) => {
        const rows = (drawn.find((each) => each.name === one.name) ?? drawn[index])?.rows ?? [];
        const own = colourOf(one);
        return {
          ...one,
          data: (one.data ?? []).map((raw, at) => {
            const row = rows[at];
            const [totalX, totalY] = [numberOf(row?.[x]), numberOf(row?.[y])];
            if (row === undefined || totalX === undefined || totalY === undefined) return raw;
            const item = asItem(raw);
            const matched = matcher(row);
            const [markedX, markedY] = [sumOf(matched, x), sumOf(matched, y)];
            const kinds = [
              kindOf(x, totalX, markedX, own).kind,
              kindOf(y, totalY, markedY, own).kind,
            ];
            const kind = kinds.every((each) => each === 'none')
              ? 'none'
              : kinds.every((each) => each === 'whole')
                ? 'whole'
                : 'pattern';
            const markedBy = {
              ...(markedX === undefined ? {} : { [x]: markedX }),
              ...(markedY === undefined ? {} : { [y]: markedY }),
            };
            const style = { ...styleOf(item), color: own };
            return {
              ...item,
              // Hatched by its shape: a symbol wears no decal.
              ...(kind === 'pattern'
                ? { symbol: HATCHED_POINT, itemStyle: { ...style, ...outline } }
                : { itemStyle: wholeStyle(kind, style) }),
              ...(kind === 'none' ? {} : { share: { markedBy } satisfies ItemShare }),
            };
          }),
        };
      }),
    );
  }

  if (isBoxplotType(spec.chartType)) {
    const category = memberOn(spec.encoding, 'x');
    const measure = memberOn(spec.encoding, 'y') ?? '';
    const categoryOf = (row: Row) => (category === undefined ? '' : String(row[category] ?? ''));
    /**
     * Without "Each point is" its rows are ungrouped (T399): each point is
     * one row of the data, with nothing but its category and its value to
     * say which, and the share is the marked rows among them. A point is
     * then marked or not, found by its value among its category's marked
     * rows, each marked row once (T453's review). Grouped, a point is the
     * measure over its rows, and is matched to its share on what it is
     * grouped by.
     */
    const ungrouped = spec.rows.every((row) =>
      Object.keys(row).every((key) => measured.has(key) || key === category),
    );
    const valueKey = (row: Row) => `${categoryOf(row)}\u0000${String(numberOf(row[measure]))}`;
    const kindOfPoint = ((): ((row: Row) => PartialMark['kind']) => {
      if (!ungrouped) {
        const matcher = shareMatcher(share, measured);
        return (row) =>
          kindOf(measure, numberOf(row[measure]) ?? 0, sumOf(matcher(row), measure), '').kind;
      }
      const left = new Map<string, number>();
      for (const row of share) {
        if (numberOf(row[measure]) === undefined) continue;
        left.set(valueKey(row), (left.get(valueKey(row)) ?? 0) + 1);
      }
      return (row) => {
        const count = left.get(valueKey(row)) ?? 0;
        if (count === 0) return 'none';
        left.set(valueKey(row), count - 1);
        return 'whole';
      };
    })();
    return withBoxMarks(option, spec, marking.colour, kindOfPoint);
  }

  if (isMapType(spec.chartType)) {
    // A country by its code, from its first row, as the map draws it.
    const dimension = memberOn(spec.encoding, 'x');
    const measure = memberOn(spec.encoding, 'y') ?? '';
    const matcher = shareMatcher(share, measured);
    const firstRows = new Map<string, Row>();
    for (const row of spec.rows) {
      const code = dimension === undefined ? '' : String(row[dimension] ?? '');
      if (!firstRows.has(code)) firstRows.set(code, row);
    }
    return withSeries(
      series.map((one) => ({
        ...one,
        data: (one.data ?? []).map((raw) => {
          const item = asItem(raw);
          const total = numberOf(item['value']);
          const row = dimension === undefined ? undefined : firstRows.get(String(item['name']));
          if (row === undefined || total === undefined) return raw;
          const marked = sumOf(matcher(row), measure);
          const kind = kindOf(measure, total, marked, '');
          // Outline, fade and hatch, never fill: its fill is the scale's.
          return {
            ...item,
            itemStyle: wholeStyle(kind.kind === 'share' ? 'pattern' : kind.kind, styleOf(item)),
            share: toldOf(kind, marked, total),
          };
        }),
      })),
    );
  }

  if (isPieType(spec.chartType) || isTreemapType(spec.chartType)) {
    // A pie's slices, a treemap's leaves: hatched where partly marked, never
    // a smaller angle or area.
    const measure = membersOn(spec.encoding, 'y')[0] ?? '';
    return withSeries(
      series.map((one) => {
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
            // A slice is a row: its share is its own, on every member it is grouped by.
            const grouped = item['grouped'] as Readonly<Record<string, string>> | undefined;
            const marked = markedOf(undefined, at, split, grouped);
            const style = styleOf(item);
            const own = (style['color'] as string | undefined) ?? colourOf(one);
            const kind = kindOf(measure, total, marked, own);
            return {
              ...item,
              itemStyle: wholeStyle(kind.kind === 'share' ? 'pattern' : kind.kind, style),
              share: toldOf(kind, marked, total),
            };
          }),
        };
      }),
    );
  }

  // Bars and lines, a combo's of each and a trellis panel's bars: each series
  // as its marks are.
  const categories = categoriesOf(option);
  const { markedOf, measureOf } = shareReader(spec, categories);

  /** A bar's two parts, in one stack: the chart's own where it stacks, so each segment splits in its place. */
  const splitBar = (one: Series, index: number): Series[] => {
    const own = colourOf(one);
    const parts = (one.data ?? []).map((raw, at) => {
      const item = asItem(raw);
      const total = numberOf(item['value']);
      if (total === undefined) return { marked: { ...item, value: null }, rest: item };
      const marked = markedOf(one.name, categories[at], undefined, {}, one['measure']);
      const kind = kindOf(measureOf(one.name, one['measure']), total, marked, own);
      const style = styleOf(item);
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
    // A trellis panel's in a stack of its own, on its own axes.
    const stack = one.stack ?? `marked-share-${String(index)}`;
    return [
      { ...one, stack, data: parts.map((part) => part.marked) },
      { ...one, stack, data: parts.map((part) => part.rest) },
    ];
  };

  /**
   * A line faded, each point knowing its marked part; the marked line itself
   * is drawn after the Customize tab (`withMarkedShareLines`).
   */
  const fadeLine = (one: Series): Series => ({
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
      const marked = markedOf(one.name, categories[at], undefined, {}, one['measure']);
      const kind = kindOf(measureOf(one.name, one['measure']), total, marked, colourOf(one));
      return { ...item, share: { ...toldOf(kind, marked, total), part: 'rest' } };
    }),
  });

  return withSeries(
    series.flatMap((one, index) =>
      // A bullet's bands and target are its target's, not its measure's:
      // left as they are (T955).
      one['markedAs'] === 'fade'
        ? [one]
        : one.type === 'bar'
          ? splitBar(one, index)
          : one.type === 'line'
            ? [fadeLine(one)]
            : [one],
    ),
  );
}

/**
 * A box plot's boxes and outliers under a marking, each point marked as
 * `kindOfPoint` says — once per point, in the order of the rows (T453,
 * T507). A box is faded where none of its points is marked, outlined where
 * all are marked in full, and outlined and hatched where some are: partly
 * marked when some of its rows are (R43). Each outlier is its row's — the
 * nth of its value in its category — and is marked or not (R43).
 */
export function withBoxMarks(
  option: EChartsOption,
  spec: RenderSpec,
  colour: string,
  kindOfPoint: (row: Row) => PartialMark['kind'],
): EChartsOption {
  const series = (option['series'] as Series[] | undefined) ?? [];
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const names = boxesOf(spec).map((box) => box.name);
  const categoryOf = (row: Row) => (category === undefined ? '' : String(row[category] ?? ''));
  const valueKey = (name: unknown, value: unknown) =>
    `${String(name ?? '')}\u0000${String(numberOf(value))}`;
  const outline = { opacity: 1, borderColor: colour, borderWidth: MARKED_OUTLINE_PX };

  /** Each box's points: its category's rows with a value, as the box is computed from them. */
  const points = new Map<string, Row[]>();
  /** Each point's marking, and its rows by category and value, for its outliers. */
  const kinds = new Map<Row, PartialMark['kind']>();
  const byValue = new Map<string, Row[]>();
  for (const row of spec.rows) {
    if (numberOf(row[measure]) === undefined) continue;
    const box = points.get(categoryOf(row));
    if (box === undefined) points.set(categoryOf(row), [row]);
    else box.push(row);
    kinds.set(row, kindOfPoint(row));
    const key = valueKey(categoryOf(row), row[measure]);
    const alike = byValue.get(key);
    if (alike === undefined) byValue.set(key, [row]);
    else alike.push(row);
  }

  // The boxes, then their points where Points draws any; anything after (a
  // violin, T992) is left as it is.
  const [boxes, ...after] = series;
  const outliers = after[0]?.['type'] === 'scatter' ? after[0] : undefined;
  const rest = outliers === undefined ? after : after.slice(1);
  const seen = new Map<string, number>();
  return {
    ...option,
    series: [
      ...(boxes === undefined
        ? []
        : [
            {
              ...boxes,
              data: (boxes.data ?? []).map((raw, index) => {
                const rows = points.get(names[index] ?? '') ?? [];
                const marks = rows.map((row) => kinds.get(row) ?? 'none');
                const marked = marks.filter((kind) => kind !== 'none').length;
                const item = asItem(raw);
                const style = styleOf(item);
                // A box's colour is its outline: faded, it keeps it.
                const itemStyle =
                  marked === 0
                    ? { ...style, opacity: UNMARKED_OPACITY }
                    : marks.every((kind) => kind === 'whole')
                      ? { ...style, ...outline }
                      : { ...style, ...outline, decal: HATCH };
                return {
                  ...item,
                  itemStyle,
                  ...(marked === 0
                    ? {}
                    : { share: { marked, total: rows.length } satisfies ItemShare }),
                };
              }),
            },
          ]),
      ...(outliers === undefined
        ? []
        : [
            {
              ...outliers,
              data: (outliers.data ?? []).map((raw) => {
                const item = asItem(raw);
                const [name, value] = Array.isArray(item['value']) ? item['value'] : [];
                const key = valueKey(name, value);
                const nth = seen.get(key) ?? 0;
                seen.set(key, nth + 1);
                const row = byValue.get(key)?.[nth];
                if (row === undefined) return raw;
                const style = { ...styleOf(item), color: colourOf(outliers) };
                return {
                  ...item,
                  itemStyle:
                    (kinds.get(row) ?? 'none') === 'none'
                      ? { ...style, opacity: UNMARKED_OPACITY, borderWidth: 0 }
                      : { ...style, ...outline },
                };
              }),
            },
          ]),
      ...rest,
    ],
  };
}

/**
 * Whether a tile draws marked lines over its faded ones: a line chart's or a
 * combo's, where its items are partly marked (T387), or where it shows a
 * marking that holds something (T507).
 */
function drawsMarkedLines(spec: RenderSpec): boolean {
  const marking = spec.marking;
  if (marking === undefined || !(isLineType(spec.chartType) || isComboType(spec.chartType)))
    return false;
  return drawsPartialMarks(spec) || marking.whole === true || !isEmptyPredicate(marking.predicate);
}

/**
 * A line's marked share, drawn at full strength over its faded total (T387,
 * direction.md §7a) — once the Customize tab has stacked and ordered the
 * lines, so a stacked line's share sits in its own band: on the lines below
 * it, as ECharts stacks them (values of one sign on those of the same sign),
 * rather than from zero through theirs (T387's review). A combo's line gets
 * one too (T453); its bars are split already.
 */
export function withMarkedShareLines(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!drawsMarkedLines(spec)) return option;
  const series = (option['series'] as Series[] | undefined) ?? [];
  const valueAt = (one: Series, at: number) => numberOf(asItem((one.data ?? [])[at])['value']);

  return {
    ...option,
    series: series.flatMap((one, index) => {
      const data = one.data ?? [];
      if (one.type !== 'line' || !data.some((item) => shareIn(item)?.part === 'rest')) return [one];
      const below =
        one.stack === undefined
          ? []
          : series.slice(0, index).filter((other) => other.stack === one.stack);
      const line = data.map((raw, at) => {
        const told = shareIn(raw);
        const total = valueAt(one, at);
        // A point the marking holds whole is on its marked line at its value,
        // outlined as it is (T507).
        const marked = told?.whole === true ? total : told?.marked;
        if (marked === undefined || total === undefined) {
          return { value: null, share: { ...told, part: 'marked' } satisfies ItemShare };
        }
        const offset = below.reduce((sum, other) => {
          const value = valueAt(other, at);
          return value !== undefined && Math.sign(value) === Math.sign(total) ? sum + value : sum;
        }, 0);
        return {
          value: offset + marked,
          ...(told?.whole === true ? { itemStyle: asItem(raw)['itemStyle'] } : {}),
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
