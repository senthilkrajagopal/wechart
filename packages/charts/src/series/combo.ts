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

import { allCounts, axesOf, type AxisSettings } from '../axis';
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

export function isComboType(chartType: string): boolean {
  return chartType === 'combo';
}

const AXIS_INDEX: Record<ComboAxis, number> = { left: 0, right: 1 };

/** Which of a combo's value axes are log axes (AC-502, `logScaleState`). */
function logAxesOf(spec: RenderSpec): Record<ComboAxis, boolean> {
  const state = logScaleState(membersOn(spec.encoding, 'y'), spec.options);
  return state.available ? { left: state.left, right: state.right } : { left: false, right: false };
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
  const { categories, series } = seriesOf(spec);
  const resolved = comboSeriesOf(membersOn(spec.encoding, 'y'), spec.options);
  const split = memberOn(spec.encoding, 'color') !== undefined;
  const writeCategory = modelWriter(spec, membersOn(spec.encoding, 'x')[0]);
  const named = (category: unknown) =>
    writeCategory === undefined ? String(category) : writeCategory(category);

  let count = 0;
  let negative = false;
  const parts = series.flatMap((one) => {
    const axis = (split ? resolved[0] : resolved.find((each) => each.measure === one.name))?.axis;
    if (axis === undefined || !logOn[axis]) return [];
    const left = one.values.flatMap((value, at) =>
      value !== null && value <= 0 ? [{ value, at }] : [],
    );
    if (left.length === 0) return [];
    count += left.length;
    const below = left.some(({ value }) => value < 0);
    negative ||= below;
    const label = split ? one.name : labelOf(spec, one.name);
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
    colour: string;
    values: readonly (number | null)[];
  }[],
  log: boolean,
): EChartsOption['yAxis'] {
  const axes = axesOf(spec);
  /**
   * Each axis titled with its measures' glyphs and its unit (AC-500), each
   * measure once, in its first series' colour. One axis keeps a title set in
   * Customize instead (`applyAxes`).
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
    const values = drawn
      .filter((one) => one.axis === side)
      .flatMap((one) => one.values.filter((value): value is number => value !== null));
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
    const values = drawn
      .filter((one) => one.axis === side)
      .flatMap((one) => one.values.filter((value): value is number => value !== null && value > 0));
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
    const write = first === undefined ? undefined : formatterFor(first, spec.formats ?? {});
    return {
      type: 'value',
      position: side,
      ...titleOf(side),
      ...aligned[side],
      ...(side === 'right' ? { splitLine: { show: false } } : {}),
      ...(first === undefined
        ? { axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: true } }
        : {}),
      ...(write === undefined
        ? {}
        : {
            axisLabel: { formatter: write },
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
  const { categories, series } = seriesOf(spec);
  const resolved = comboSeriesOf(membersOn(spec.encoding, 'y'), spec.options);
  /**
   * Split by colour, every series draws the first measure, so takes its mark
   * and axis; otherwise each series is its measure. (A split across every
   * measure is T852's.)
   */
  const split = memberOn(spec.encoding, 'color') !== undefined;
  const drawAs = (name: string): { measure: string; mark: ComboMark; axis: ComboAxis } =>
    (split ? resolved[0] : resolved.find((one) => one.measure === name)) ?? {
      measure: name,
      mark: 'line',
      axis: 'left',
    };
  const barCount = series.filter((one) => drawAs(one.name).mark === 'bar').length;
  const logOn = logAxesOf(spec);
  /** On a log axis a value at or below zero has no place, so isn't drawn (AC-502). */
  const valuesOf = (one: { name: string; values: readonly (number | null)[] }) =>
    logOn[drawAs(one.name).axis]
      ? one.values.map((value) => (value !== null && value <= 0 ? null : value))
      : one.values;

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
      Math.max(1, barCount),
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
        ...drawAs(one.name),
        // Split, a glyph stands for every member, so is drawn in the
        // legend's own text colour (design 20 state D).
        colour: split ? COLORS.light['text-secondary'] : colourFor(spec, one.name, index),
        values: valuesOf(one),
      })),
      logOn.right,
    ),
    series: series.map((one, index) => {
      const colour = colourFor(spec, one.name, index);
      const { mark, axis } = drawAs(one.name);
      const common = {
        name: one.name,
        data: [...valuesOf(one)],
        yAxisIndex: AXIS_INDEX[axis],
        z: COMBO_Z[mark],
      };

      switch (mark) {
        case 'bar':
          return {
            ...common,
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
  };
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
 * Each line of a combo drawn on a halo (direction.md §7h, "Line over bar"):
 * a 5 px stroke in the surface colour under its 2 px line, so a line crossing
 * bars stays one line. Not an area's edge, which lies behind the bars anyway.
 *
 * Added last, to the option as drawn: one per line, from the first series of
 * its name (a marked share drawn over a line is not another line), with its
 * values only. Named as its line and listed after it, so the legend takes its
 * entry from the line; silent, out of the tooltip and the legend's hover
 * (research/echarts-combo-layers.md).
 */
export function withLineHalos(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!isComboType(spec.chartType) || !Array.isArray(option['series'])) return option;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const series = option['series'] as Series[];
  const seen = new Set<unknown>();
  const halos = series.flatMap((one) => {
    // The first series of a name says what it is: an area's marked share,
    // drawn as a line over it, is no line of its own (T846's review).
    if (one.type !== 'line' || seen.has(one.name)) return [];
    seen.add(one.name);
    if (one.areaStyle !== undefined) return [];
    return [
      {
        type: 'line',
        name: one.name,
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
