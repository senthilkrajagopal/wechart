/**
 * Axis settings (AC-040, direction.md §6 "Axes").
 *
 * The criterion's failing state is "a setting is accepted and the drawing does
 * not change", so these are applied to the option the renderer produced rather
 * than being a second place that decides what an axis is. Every renderer gets
 * them for free, and none can forget.
 */
import { formatterFor, membersOn, scaleOf, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from './theme';
import { modelWriter } from './modelWriter';

export type NumberFormat = 'auto' | 'compact' | 'full' | 'percent' | 'currency';

export interface AxisSettings {
  readonly title?: string;
  readonly min?: number;
  readonly max?: number;
  readonly log?: boolean;
  readonly gridlines?: boolean;
  /** direction.md offers 0, 45 or 90. */
  readonly tickRotation?: number;
  readonly numberFormat?: NumberFormat;
  /**
   * Whether a value axis starts at zero (AC-219): on unless turned off, when
   * it spans only the data.
   */
  readonly includeZero?: boolean;
}

export interface AxesSettings {
  readonly x?: AxisSettings;
  readonly y?: AxisSettings;
}

/** direction.md §5 uses a muted border for chart furniture. */
const GRIDLINE = '#e3e2de';

const FORMATTERS: Record<NumberFormat, (value: number) => string> = {
  auto: (value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value),
  compact: (value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value),
  full: (value) => new Intl.NumberFormat('en-US').format(value),
  percent: (value) => new Intl.NumberFormat('en-US', { style: 'percent' }).format(value),
  currency: (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value),
};

export function axesOf(spec: RenderSpec): AxesSettings {
  const axes = spec.options?.['axes'];
  return typeof axes === 'object' && axes !== null ? (axes as AxesSettings) : {};
}

/** The ECharts fragment for one axis, from its settings. */
function axisFragment(settings: AxisSettings | undefined): Record<string, unknown> {
  if (settings === undefined) return {};

  const {
    title,
    min,
    max,
    log,
    gridlines,
    tickRotation,
    numberFormat: format = undefined,
    includeZero,
  } = settings;

  return {
    ...(title === undefined ? {} : { name: title, nameLocation: 'middle', nameGap: 28 }),
    // ECharts' `scale` is the inverse: a value axis spanning only the data.
    ...(includeZero === false ? { scale: true } : {}),
    // A log axis is a different scale, not a styling of the linear one, so it
    // replaces the type rather than decorating it.
    ...(log === true ? { type: 'log' } : {}),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(gridlines === undefined
      ? {}
      : { splitLine: { show: gridlines, lineStyle: { color: GRIDLINE } } }),
    ...(tickRotation === undefined && format === undefined
      ? {}
      : {
          axisLabel: {
            ...(tickRotation === undefined ? {} : { rotate: tickRotation }),
            ...(format === undefined
              ? {}
              : {
                  formatter: (value: unknown) => {
                    const numeric = Number(value);
                    // A category axis carries strings; leave those alone
                    // rather than printing NaN over them.
                    return Number.isFinite(numeric) ? FORMATTERS[format](numeric) : String(value);
                  },
                }),
          },
        }),
  };
}

/**
 * A value axis's labels thinned where they'd overlap (T391, AC-299): ECharts
 * lays them out, then hides any tick label that meets one it has already kept
 * (`axisLabel.hideOverlap`; research `echarts-axis-labels.md`), so a narrow
 * tile shows fewer numbers, never numbers over numbers. Every value axis, a
 * log one and a trellis's panels' included; a category axis keeps ECharts'
 * own interval for its labels.
 */
export function thinValueLabels(option: EChartsOption): EChartsOption {
  const thinned = (axes: unknown): unknown => {
    if (Array.isArray(axes)) return axes.map(thinned);
    if (typeof axes !== 'object' || axes === null) return axes;
    const axis = axes as { type?: unknown; axisLabel?: object };
    return axis.type === 'value' || axis.type === 'log'
      ? { ...axis, axisLabel: { ...axis.axisLabel, hideOverlap: true } }
      : axes;
  };
  return {
    ...option,
    ...(option.xAxis === undefined
      ? {}
      : { xAxis: thinned(option.xAxis) as EChartsOption['xAxis'] }),
    ...(option.yAxis === undefined
      ? {}
      : { yAxis: thinned(option.yAxis) as EChartsOption['yAxis'] }),
  };
}

/**
 * Apply the axis settings to a drawn option.
 *
 * Charts with no cartesian axes — pie, treemap, KPI — have nothing to apply
 * them to, and a trellis has an array of axes per panel, which is a different
 * editing problem than one axis. Both are left alone rather than half-handled.
 */
export function applyAxes(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const { x, y } = axesOf(spec);

  /**
   * The value axis carries the measure's declared format unless the axis
   * editor overrides it (AC-046, AC-040). The member's format is the default
   * and the axis setting is the exception, not the other way round — a
   * currency measure should read as money without anyone asking.
   */
  /**
   * The member's format belongs on the axis that carries the *values*, which
   * is not always `yAxis`: a horizontal bar draws its values along x and its
   * categories down y. Hung on `yAxis` regardless, the measure's values went
   * unformatted and its currency format was applied to the categories — order
   * ids reading "$1,234.00" (T194). Found by the axis's own type rather than
   * by chart type, so a horizontal type added later needs no entry here.
   *
   * A scatter has two value axes, each its own measure — handled below.
   */
  const isValueAxis = (key: 'xAxis' | 'yAxis') => {
    const axis = option[key];
    return (
      axis !== undefined && !Array.isArray(axis) && (axis as { type?: unknown }).type === 'value'
    );
  };
  const valueKey: 'xAxis' | 'yAxis' =
    isValueAxis('xAxis') && !isValueAxis('yAxis') ? 'xAxis' : 'yAxis';
  const valueSettings = valueKey === 'xAxis' ? x : y;

  /**
   * The member's formatter for an axis, unless the axis editor sets one — on
   * its tick labels, and on the label a "cross" pointer puts on it when the
   * chart is hovered (ECharts calls that label's formatter with the raw axis
   * value: `component/axisPointer/viewHelper.js`, docs/research/echarts.md).
   * Without it the crosshair read "4,000" beside ticks reading "$4,000.00".
   */
  const formatOf = (member: string | undefined, settings: AxisSettings | undefined) => {
    if (member === undefined || settings?.numberFormat !== undefined) return undefined;
    const format = formatterFor(member, spec.formats ?? {});
    return {
      axisLabel: { formatter: format },
      axisPointer: { label: { formatter: (params: { value: unknown }) => format(params.value) } },
    };
  };

  /**
   * The measures on the value axis. They share it when there are several —
   * direction.md's one-axis rule — and a measure on another scale than the
   * first is not drawn there at all (`onOneScale`, T510; R67, the user: the
   * axis keeps the first's format). So the axis wears the first's format
   * where every measure on it is on that scale, its own format kept in the
   * tooltip. T195's call, that an axis of two formats wear neither, is
   * retired by R67.
   */
  const measures = membersOn(spec.encoding, 'y');
  const formats = spec.formats ?? {};
  const scale = (member: string | undefined) => scaleOf(formats[member ?? '']);
  const oneFormat = measures.every((member) => scale(member) === scale(measures[0]));

  /**
   * Only on a value axis. A heatmap has none — both its axes are dimensions —
   * and the fallback to `yAxis` hung its row dimension's formatter there,
   * grouping the year 2024 into "2,024".
   */
  const memberFormat =
    isValueAxis(valueKey) && oneFormat ? formatOf(measures[0], valueSettings) : undefined;

  /**
   * Both axes value axes — a scatter, whose x and y are each a measure with
   * its own format (T195). Each axis wears its own; only one was formatted
   * before, and with the y measure's format.
   */
  const bothValues = isValueAxis('xAxis') && isValueAxis('yAxis');
  const xFormat = bothValues ? formatOf(membersOn(spec.encoding, 'x')[0], x) : undefined;

  /**
   * A category axis of time is written by its granularity, on its ticks and
   * on the crosshair's label (AC-188). It carries the x member — down y on a
   * horizontal bar — except on a heatmap, whose two axes are x and y.
   */
  const isCategoryAxis = (key: 'xAxis' | 'yAxis') => {
    const axis = option[key];
    return (
      axis !== undefined && !Array.isArray(axis) && (axis as { type?: unknown }).type === 'category'
    );
  };
  const timeFormatOf = (key: 'xAxis' | 'yAxis', settings: AxisSettings | undefined) => {
    if (!isCategoryAxis(key) || settings?.numberFormat !== undefined) return undefined;
    const channel = spec.chartType === 'heatmap' && key === 'yAxis' ? 'y' : 'x';
    const write = modelWriter(spec, membersOn(spec.encoding, channel)[0]);
    if (write === undefined) return undefined;
    return {
      axisLabel: { formatter: write },
      axisPointer: { label: { formatter: (params: { value: unknown }) => write(params.value) } },
    };
  };
  const xTime = timeFormatOf('xAxis', x);
  const yTime = timeFormatOf('yAxis', y);

  if (
    x === undefined &&
    y === undefined &&
    memberFormat === undefined &&
    xFormat === undefined &&
    xTime === undefined &&
    yTime === undefined
  ) {
    return option;
  }

  const merge = (
    key: 'xAxis' | 'yAxis',
    settings: AxisSettings | undefined,
    extra: Record<string, unknown> = {},
  ) => {
    const existing = option[key];
    // A trellis has an array of axes per panel, which is a different editing
    // problem; a pie or a KPI has none at all.
    if (existing === undefined || Array.isArray(existing)) return {};
    const fragment = axisFragment(settings);
    /**
     * `axisLabel` merged key by key, not replaced: a rotation set in the axis
     * editor replaced the whole of it, and the member's formatter with it —
     * rotated labels lost their currency (T195).
     */
    const labelOf = (from: unknown) => (from as { axisLabel?: object } | undefined)?.axisLabel;
    const axisLabel = {
      ...labelOf(extra),
      ...labelOf(existing),
      ...labelOf(fragment),
    };
    return {
      [key]: {
        ...extra,
        ...(existing as object),
        ...fragment,
        ...(Object.keys(axisLabel).length === 0 ? {} : { axisLabel }),
      },
    };
  };

  return {
    ...option,
    ...merge(
      'xAxis',
      x,
      bothValues ? (xFormat ?? {}) : valueKey === 'xAxis' ? (memberFormat ?? {}) : (xTime ?? {}),
    ),
    ...merge('yAxis', y, valueKey === 'yAxis' ? (memberFormat ?? yTime ?? {}) : (yTime ?? {})),
  };
}
