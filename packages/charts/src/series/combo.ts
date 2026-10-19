/**
 * The combo chart (AC-037, F44): each measure drawn as its own series, with
 * its own mark — bars, a line, an area or points — on its own value axis,
 * left or right (AC-497).
 *
 * The marks and axes come from the chart's options through `comboSeriesOf`
 * (`@wechart/core`), Auto unless the author chose: the first measure as bars
 * and the rest as lines, all on the left (AC-498). So by Auto every series
 * shares one scale, and the chart says something true about the magnitudes
 * rather than merely about the shapes; a second axis exists only because the
 * author drew one (rule 117).
 *
 * Layers follow §7h's draw order (`COMBO_Z`): areas, bars, lines, points. A
 * line lies on a halo in the surface colour (`withLineHalos`), added once the
 * rest of the option is drawn, so marking, the legend and the tooltip never
 * see it as a series of the chart's.
 */
import {
  comboSeriesOf,
  comboStackingOf,
  formatterFor,
  isSynchronized,
  logScaleState,
  memberOn,
  membersOn,
  onOneScale,
  seriesOf,
  type ComboAxis,
  type ComboMark,
  type RenderSpec,
} from '@wechart/core';

import { COLORS } from '@wechart/ui';

import { allCounts, axesOf, writeInFormat, type AxisSettings } from '../axis';
import { alignedAxes, alignedLogAxes, type AxisRange, type LogRange } from '../combo/alignedAxes';
import { axisTitle } from '../combo/axisTitles';
import { colourFor } from '../colours';
import { plotEdgesOf } from '../customize';
import { PROTOTYPE_GRID } from '../layout/grid';
import { labelOf, modelWriter } from '../modelWriter';
import {
  BAR_MAX_PX,
  categoryAxisPx,
  DEFAULT_CANVAS,
  drawnBarWidth,
  gapFor,
  type Canvas,
} from './bar';
import { COMBO_MARK, COMBO_Z, DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';
import { tooltipFor } from '../tooltip';

export function isComboType(chartType: string): boolean {
  return chartType === 'combo';
}

const AXIS_INDEX: Record<ComboAxis, number> = { left: 0, right: 1 };

/**
 * The stack a series is drawn in, or none (AC-503, rule 126): every bar
 * series while bars are stacked, every area series while areas are, each in
 * its axis's own stack. ECharts stacks series by their `stack` string alone,
 * whatever their axis, so the id carries the axis's index ("0:bars",
 * "1:areas"; research/rich-tiles-and-combo-tech.md §2). Lines and points
 * never stack.
 */
function stackOf(spec: RenderSpec, mark: ComboMark, axis: ComboAxis): string | undefined {
  const stacking = comboStackingOf(spec.options);
  if (mark === 'bar' && stacking.bars === 'stacked') return `${String(AXIS_INDEX[axis])}:bars`;
  if (mark === 'area' && stacking.areas === 'stacked') return `${String(AXIS_INDEX[axis])}:areas`;
  return undefined;
}

/**
 * The values an axis must reach (AC-503): each unstacked series' own, and
 * each stack's running totals per category, ECharts stacking values of one
 * sign on those of the same sign (`stackStrategy` 'samesign', its default).
 */
function reachOf(
  drawn: readonly { stack: string | undefined; values: readonly (number | null)[] }[],
): number[] {
  const reach: number[] = [];
  const stacks = new Map<string, { above: number[]; below: number[] }>();
  for (const one of drawn) {
    if (one.stack === undefined) {
      for (const value of one.values) if (value !== null) reach.push(value);
      continue;
    }
    const sums = stacks.get(one.stack) ?? { above: [], below: [] };
    stacks.set(one.stack, sums);
    one.values.forEach((value, at) => {
      if (value === null) return;
      const side = value < 0 ? sums.below : sums.above;
      side[at] = (side[at] ?? 0) + value;
      reach.push(side[at]);
    });
  }
  return reach;
}

/** Whether a combo is split by a dimension, across every measure (AC-504). */
const isSplit = (spec: RenderSpec) => memberOn(spec.encoding, 'color') !== undefined;

/** Which of a combo's value axes are log axes (AC-502, `logScaleState`). */
function logAxesOf(spec: RenderSpec): Record<ComboAxis, boolean> {
  const state = logScaleState(membersOn(spec.encoding, 'y'), spec.options, undefined, {
    split: isSplit(spec),
  });
  return state.available ? { left: state.left, right: state.right } : { left: false, right: false };
}

/** A series as a combo draws it: its measure's mark and axis, and its member where split. */
interface ComboDrawn {
  readonly name: string;
  readonly measure: string;
  readonly mark: ComboMark;
  readonly axis: ComboAxis;
  readonly values: readonly (number | null)[];
  /** Its member's place among the split's members, for its colour; else its own place. */
  readonly colourIndex: number;
}

/**
 * Each series of a combo with the mark and axis it's drawn with (AC-497):
 * unsplit, each series is its measure; split, each is its measure's for one
 * member (AC-504, `seriesOf`), and takes the member's colour slot.
 */
function comboDrawingOf(spec: RenderSpec): {
  categories: string[];
  series: ComboDrawn[];
} {
  const split = isSplit(spec);
  const { categories, series } = seriesOf(spec);
  const resolved = comboSeriesOf(membersOn(spec.encoding, 'y'), spec.options, { split });
  const members = [...new Set(series.map((one) => one.name))];
  return {
    categories,
    series: series.map((one, index) => {
      const measure = one.measure ?? one.name;
      const own = resolved.find((each) => each.measure === measure);
      return {
        name: one.name,
        measure,
        mark: own?.mark ?? 'line',
        axis: own?.axis ?? 'left',
        values: one.values,
        colourIndex: split ? members.indexOf(one.name) : index,
      };
    }),
  };
}

/**
 * A combo's stored log settings as they are drawn (AC-502): off on both
 * while bars are drawn, on both while two axes are drawn and either asks.
 * One axis is drawn by the axis settings (`applyAxes`), which then read the
 * left's as settled here. Any other chart is returned as it came.
 */
export function withSettledLogScale(spec: RenderSpec): RenderSpec {
  if (!isComboType(spec.chartType)) return spec;
  const axes = axesOf(spec);
  const logOn = logAxesOf(spec);
  if ((axes.y?.log === true) === logOn.left && (axes.right?.log === true) === logOn.right) {
    return spec;
  }
  const settle = (settings: AxisSettings | undefined, on: boolean): AxisSettings => {
    const rest: { -readonly [K in keyof AxisSettings]: AxisSettings[K] } = { ...settings };
    delete rest.log;
    return on ? { ...rest, log: true } : rest;
  };
  return {
    ...spec,
    options: {
      ...spec.options,
      axes: { ...axes, y: settle(axes.y, logOn.left), right: settle(axes.right, logOn.right) },
    },
  };
}

/** The values a combo's log axes leave out, and the note under the chart that counts them. */
export interface LogOmissions {
  readonly count: number;
  readonly text: string;
}

/** "Jan", "Jan and Feb", "Jan, Feb and Mar". */
const listed = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;

/**
 * What a combo's log axes leave out (AC-502, design 20 state E): each value
 * at or below zero on a log axis, which has no place for it, counted and
 * named under the chart — "3 values not drawn: Orders was 0 in Jan, Feb and
 * Mar, and a log scale has no zero." Nothing while none is left out.
 */
export function logScaleOmissions(given: RenderSpec): LogOmissions | undefined {
  if (!isComboType(given.chartType)) return undefined;
  // What the drawing reads (`optionFor`): a measure left off its axis for
  // its scale isn't drawn at all, so it neither counts nor refuses log.
  const spec = onOneScale(given);
  const logOn = logAxesOf(spec);
  if (!logOn.left && !logOn.right) return undefined;
  const { categories, series } = comboDrawingOf(spec);
  const split = isSplit(spec);
  const writeCategory = modelWriter(spec, membersOn(spec.encoding, 'x')[0]);
  const named = (category: unknown) =>
    writeCategory === undefined ? String(category) : writeCategory(category);

  let count = 0;
  let negative = false;
  const parts = series.flatMap((one) => {
    if (!logOn[one.axis]) return [];
    const left = one.values.flatMap((value, at) =>
      value !== null && value <= 0 ? [{ value, at }] : [],
    );
    if (left.length === 0) return [];
    count += left.length;
    const below = left.some(({ value }) => value < 0);
    negative ||= below;
    const label = split
      ? `${labelOf(spec, one.measure)} for ${one.name}`
      : labelOf(spec, one.measure);
    return [
      `${label} was ${below ? 'at or below 0' : '0'} in ${listed(left.map(({ at }) => named(categories[at])))}`,
    ];
  });
  if (count === 0) return undefined;
  return {
    count,
    text: `${String(count)} ${count === 1 ? 'value' : 'values'} not drawn: ${parts.join('; ')}, and a log scale has ${
      negative ? 'nothing at or below zero' : 'no zero'
    }.`,
  };
}

/**
 * The value axes: one while every series is on the left; with a series on
 * the right, two, each written in the format of its own first measure. The
 * axis settings (`applyAxes`) format a single axis; two are formatted here.
 *
 * Two are aligned (AC-499, `alignedAxes`): their extents and intervals fixed
 * so the right's ticks fall on the left's gridlines and, where both reach
 * zero, the zero lines meet; both reach zero while any bars are drawn, the
 * include zero each axis was given notwithstanding; and the right draws no
 * gridlines of its own. An axis no series is on keeps its gridlines, which
 * the other's ticks sit on, but writes no numbers (T846's review).
 */
function valueAxes(
  spec: RenderSpec,
  drawn: readonly {
    measure: string;
    mark: ComboMark;
    axis: ComboAxis;
    stack: string | undefined;
    values: readonly (number | null)[];
  }[],
  log: boolean,
): EChartsOption['yAxis'] {
  const axes = axesOf(spec);
  /**
   * Each axis titled with its unit, or with no unit its measures, each once
   * (AC-500 as amended by R82). One axis keeps a title set in Customize
   * instead (`applyAxes`).
   */
  const titleOf = (side: ComboAxis) => {
    const seen = new Set<string>();
    const measures = drawn.filter(
      (one) => one.axis === side && !seen.has(one.measure) && seen.add(one.measure),
    );
    return measures.length === 0 ? {} : axisTitle(spec, measures, side);
  };
  if (!drawn.some((one) => one.axis === 'right'))
    return { type: 'value', ...(axes.y?.title === undefined ? titleOf('left') : {}) };
  const bars = drawn.some((one) => one.mark === 'bar');
  const measuresOn = (side: ComboAxis) => [
    ...new Set(drawn.filter((one) => one.axis === side).map((one) => one.measure)),
  ];
  const rangeOf = (side: ComboAxis): AxisRange => {
    // A stack reaches its totals, not its tallest part (AC-503).
    const values = reachOf(drawn.filter((one) => one.axis === side));
    const settings = side === 'left' ? axes.y : axes.right;
    // Reduced, not spread: a long result is more arguments than a call takes.
    return {
      min: values.length === 0 ? 0 : values.reduce((a, b) => Math.min(a, b)),
      max: values.length === 0 ? 0 : values.reduce((a, b) => Math.max(a, b)),
      includeZero: bars || settings?.includeZero !== false,
      wholeNumbers: allCounts(spec, measuresOn(side)),
      // Customize's min and max end each axis as typed (decision T846-2, T849).
      ...(typeof settings?.min === 'number' ? { fixedMin: settings.min } : {}),
      ...(typeof settings?.max === 'number' ? { fixedMax: settings.max } : {}),
    };
  };
  const synchronize = isSynchronized(membersOn(spec.encoding, 'y'), spec.options, spec.formats);
  /**
   * Log on both or neither (AC-502), from the values it draws, those above
   * zero, in whole decades; ECharts places the ticks at powers of ten.
   */
  const logRangeOf = (side: ComboAxis): LogRange => {
    const settings = side === 'left' ? axes.y : axes.right;
    const values = reachOf(drawn.filter((one) => one.axis === side)).filter((value) => value > 0);
    return {
      min: values.length === 0 ? undefined : values.reduce((a, b) => Math.min(a, b)),
      max: values.length === 0 ? undefined : values.reduce((a, b) => Math.max(a, b)),
      ...(typeof settings?.min === 'number' ? { fixedMin: settings.min } : {}),
      ...(typeof settings?.max === 'number' ? { fixedMax: settings.max } : {}),
    };
  };
  const logAligned = log
    ? alignedLogAxes(logRangeOf('left'), logRangeOf('right'), { synchronize })
    : undefined;
  const aligned: Record<ComboAxis, object> =
    logAligned === undefined
      ? { ...alignedAxes(rangeOf('left'), rangeOf('right'), { synchronize }) }
      : {
          left: { type: 'log', ...logAligned.left },
          right: { type: 'log', ...logAligned.right },
        };

  return (['left', 'right'] as const).map((side) => {
    const [first] = measuresOn(side);
    /**
     * Each axis group's own title, number format and (the left's)
     * gridlines, from Customize › Axes (T858, AC-219); otherwise its
     * unit's title and its first measure's format.
     */
    const settings = side === 'left' ? axes.y : axes.right;
    const own = settings?.numberFormat;
    const write =
      first === undefined
        ? undefined
        : own !== undefined && own !== 'auto'
          ? (value: unknown) => writeInFormat(own, value)
          : formatterFor(first, spec.formats ?? {});
    return {
      type: 'value',
      position: side,
      ...titleOf(side),
      ...(settings?.title === undefined ? {} : { name: settings.title }),
      ...aligned[side],
      ...(side === 'right' ? { splitLine: { show: false } } : {}),
      ...(first === undefined
        ? { axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: true } }
        : {}),
      ...(side === 'left' && settings?.gridlines === false ? { splitLine: { show: false } } : {}),
      ...(write === undefined
        ? {}
        : {
            axisLabel: {
              formatter: write,
              ...(settings?.tickRotation === undefined ? {} : { rotate: settings.tickRotation }),
            },
            axisPointer: {
              label: { formatter: (params: { value: unknown }) => write(params.value) },
            },
          }),
    };
  });
}

export function comboOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isComboType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a combo chart`);
  }

  const surface = spec.surface ?? DEFAULT_SURFACE;
  /**
   * Each series with its measure's mark and axis: unsplit, a series is its
   * measure; split, its measure's for one member, in the member's colour
   * (T852, AC-504).
   */
  const { categories, series } = comboDrawingOf(spec);
  const stacks = series.map((one) => stackOf(spec, one.mark, one.axis));
  /**
   * Bars side by side in a category: one per unstacked bar series, one per
   * stack (T851's review), as a stacked bar chart counts one (`barOption`).
   */
  const barColumns = new Set(
    series.flatMap((one, index) =>
      one.mark === 'bar' ? [stacks[index] ?? `alone:${String(index)}`] : [],
    ),
  ).size;
  const logOn = logAxesOf(spec);
  /** On a log axis a value at or below zero has no place, so isn't drawn (AC-502). */
  const valuesOf = (one: ComboDrawn) =>
    logOn[one.axis]
      ? one.values.map((value) => (value !== null && value <= 0 ? null : value))
      : one.values;
  /**
   * A stacked bar's corners at each category (T851's review): rounded at its
   * data end only where it's its stack's outermost segment of its sign, as a
   * stacked bar chart's (`cornerRadii` in `bar.ts`); a value below zero grows
   * down, so its foot is its data end.
   */
  const stackedRadii = (index: number): number[][] => {
    const r = MARK.cornerRadiusPx;
    const own = series[index];
    if (own === undefined) return [];
    return valuesOf(own).map((value, at) => {
      if (value === null) return [0, 0, 0, 0];
      const negative = value < 0;
      const covered = series.some((other, later) => {
        if (later <= index || stacks[later] !== stacks[index]) return false;
        const above = valuesOf(other)[at];
        return above !== null && above !== undefined && above < 0 === negative;
      });
      if (covered) return [0, 0, 0, 0];
      return negative ? [0, 0, r, r] : [r, r, 0, 0];
    });
  };

  // Bars a bar per category in each bar series, the gap kept only where it
  // leaves each bar its colour on this canvas (AC-210).
  const barGap = gapFor(
    drawnBarWidth(
      categoryAxisPx(
        canvas,
        false,
        plotEdgesOf(
          spec,
          series.map((each) => each.name),
        ),
      ),
      categories.length,
      Math.max(1, barColumns),
    ),
  );

  return {
    animation: false,
    // The grid its bars' widths are estimated against (T254).
    grid: { ...PROTOTYPE_GRID },
    xAxis: { type: 'category', data: categories },
    yAxis: valueAxes(
      spec,
      series.map((one, index) => ({
        measure: one.measure,
        mark: one.mark,
        axis: one.axis,
        stack: stacks[index],
        values: valuesOf(one),
      })),
      logOn.right,
    ),
    series: [
      ...series.map((one, index) => {
      const colour = colourFor(spec, one.name, one.colourIndex);
      const { mark, axis } = one;
      const stack = stacks[index];
      const common = {
        ...(stack === undefined ? {} : { stack }),
        name: one.name,
        // Which measure it draws, beyond ECharts (which ignores the key):
        // split, its name is its member's, so the tooltip finds its format
        // here (T852, `withComboTooltip`).
        measure: one.measure,
        data: [...valuesOf(one)],
        yAxisIndex: AXIS_INDEX[axis],
        z: COMBO_Z[mark],
      };

      switch (mark) {
        case 'bar':
          return {
            ...common,
            // Stacked, each segment's corners by its place in the stack.
            ...(stack === undefined
              ? {}
              : {
                  data: valuesOf(one).map((value, at) => ({
                    value,
                    itemStyle: { borderRadius: stackedRadii(index)[at] },
                  })),
                }),
            type: 'bar' as const,
            // At most 36 px, as every bar (T683, CMP-12).
            barMaxWidth: BAR_MAX_PX,
            itemStyle: {
              color: colour,
              borderColor: surface,
              borderWidth: barGap,
              borderRadius: [MARK.cornerRadiusPx, MARK.cornerRadiusPx, 0, 0],
            },
          };
        case 'point':
          return {
            ...common,
            type: 'scatter' as const,
            symbol: 'circle',
            symbolSize: MARK.markerPx,
            itemStyle: { color: colour, borderColor: surface, borderWidth: COMBO_MARK.pointRingPx },
          };
        case 'area':
        case 'line':
          return {
            ...common,
            type: 'line' as const,
            connectNulls: false,
            lineStyle: { color: colour, width: MARK.linePx },
            itemStyle: { color: colour },
            symbolSize: MARK.markerPx,
            ...(mark === 'area'
              ? { areaStyle: { color: colour, opacity: COMBO_MARK.areaOpacity } }
              : {}),
          };
      }
      }),
      ...splitComboStandIns(spec, series),
    ],
  };
}

/**
 * Split, each measure's legend entry needs a series of its name to stand
 * for (AC-504; research/echarts-combo-layers.md: an entry draws from the
 * first series of its name): one per measure that draws nothing, in
 * `text-secondary`, on its measure's axis, silent and out of the tooltip
 * (`splitComboLegendOf`). Unsplit, a series is its measure: none.
 */
function splitComboStandIns(
  spec: RenderSpec,
  drawn: readonly { readonly measure: string; readonly axis: ComboAxis; readonly mark: ComboMark }[],
): Record<string, unknown>[] {
  if (!isSplit(spec)) return [];
  const measures = new Map(drawn.map((one) => [one.measure, one]));
  return [...measures.values()].map((one) => ({
    type: 'scatter' as const,
    name: one.measure,
    measure: one.measure,
    // Beyond ECharts: it stands for a measure, drawing nothing of its own.
    standIn: true,
    data: [],
    yAxisIndex: AXIS_INDEX[one.axis],
    z: COMBO_Z[one.mark],
    // Silent, and out of the axis tooltip, which skips a series whose
    // tooltip is off (research/echarts-combo-layers.md).
    silent: true,
    tooltip: { show: false },
    itemStyle: { color: COLORS.light['text-secondary'] },
  }));
}

type Series = Record<string, unknown> & {
  name?: unknown;
  type?: unknown;
  areaStyle?: unknown;
  data?: unknown;
};

/** An item's value, where a marking or a highlight made the item an object. */
const valueOf = (item: unknown): unknown =>
  typeof item === 'object' && item !== null && !Array.isArray(item) && 'value' in item
    ? (item as { value: unknown }).value
    : item;

/**
 * A split combo's tooltip, its values each in its own measure's format and
 * named "‹member› · ‹measure›" (T852, AC-504, AC-046): split, every
 * measure's series of a member share the member's name, so each is told by
 * the measure it carries in the option as drawn, a marked share's copied
 * from its series. Any other chart's tooltip is left as it is.
 */
export function withComboTooltip(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!isComboType(spec.chartType) || !isSplit(spec)) return option;
  const series = Array.isArray(option['series']) ? (option['series'] as Series[]) : [];
  const measures = series.map((one) =>
    typeof one['measure'] === 'string' ? one['measure'] : undefined,
  );
  return { ...option, ...tooltipFor(spec, (index) => measures[index]) };
}

/** An item of a marked share's line (`withMarkedShareLines`: `share.part` "marked"). */
const isMarkedShare = (item: unknown): boolean => {
  if (typeof item !== 'object' || item === null || !('share' in item)) return false;
  const share = (item as { share: unknown }).share;
  return (
    typeof share === 'object' && share !== null && (share as { part?: unknown }).part === 'marked'
  );
};

/**
 * Each line of a combo drawn on a halo (direction.md §7h, "Line over bar"):
 * a 5 px stroke in the surface colour under its 2 px line, so a line crossing
 * bars stays one line. Not an area's edge, which lies behind the bars anyway.
 *
 * Added last, to the option as drawn: one per line series (a marked share
 * drawn over a line is not another line), with its values only. Named as
 * its line and listed after it, so the legend takes its
 * entry from the line; silent, out of the tooltip and the legend's hover
 * (research/echarts-combo-layers.md).
 */
export function withLineHalos(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!isComboType(spec.chartType) || !Array.isArray(option['series'])) return option;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const series = option['series'] as Series[];
  const halos = series.flatMap((one) => {
    /**
     * A line, not an area, and not a marked share drawn over a line or an
     * area (`withMarkedShareLines`), which is no line of its own (T846's
     * review). Told by its items, not its name: split, every measure's
     * series of a member share the member's name (T852).
     */
    if (one.type !== 'line' || one.areaStyle !== undefined) return [];
    const data = Array.isArray(one.data) ? (one.data as unknown[]) : [];
    if (data.some(isMarkedShare)) return [];
    return [
      {
        type: 'line',
        name: one.name,
        // Its line's measure too, so it is its line's in every reading (T852).
        ...(one['measure'] === undefined ? {} : { measure: one['measure'] }),
        data: Array.isArray(one.data) ? one.data.map(valueOf) : [],
        yAxisIndex: one['yAxisIndex'] ?? 0,
        z: COMBO_Z.halo,
        symbol: 'none',
        connectNulls: false,
        silent: true,
        legendHoverLink: false,
        tooltip: { show: false },
        lineStyle: { color: surface, width: COMBO_MARK.haloPx },
      },
    ];
  });
  return halos.length === 0 ? option : { ...option, series: [...series, ...halos] };
}
