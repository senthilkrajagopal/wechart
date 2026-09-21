/**
 * Axis settings (AC-040, direction.md §6 "Axes").
 *
 * The criterion's failing state is "a setting is accepted and the drawing does
 * not change", so these are applied to the option the renderer produced rather
 * than being a second place that decides what an axis is. Every renderer gets
 * them for free, and none can forget.
 */
import { formatterFor, membersOn, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from './theme';

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
  } = settings;

  return {
    ...(title === undefined ? {} : { name: title, nameLocation: 'middle', nameGap: 28 }),
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
   * Only where exactly one axis is a value axis. A scatter has two, each its
   * own measure, which is T195's to format.
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

  const measure = membersOn(spec.encoding, 'y')[0];
  const memberFormat =
    measure === undefined || valueSettings?.numberFormat !== undefined
      ? undefined
      : { axisLabel: { formatter: formatterFor(measure, spec.formats ?? {}) } };

  if (x === undefined && y === undefined && memberFormat === undefined) return option;

  const merge = (
    key: 'xAxis' | 'yAxis',
    settings: AxisSettings | undefined,
    extra: Record<string, unknown> = {},
  ) => {
    const existing = option[key];
    // A trellis has an array of axes per panel, which is a different editing
    // problem; a pie or a KPI has none at all.
    if (existing === undefined || Array.isArray(existing)) return {};
    return { [key]: { ...extra, ...(existing as object), ...axisFragment(settings) } };
  };

  return {
    ...option,
    ...merge('xAxis', x, valueKey === 'xAxis' ? (memberFormat ?? {}) : {}),
    ...merge('yAxis', y, valueKey === 'yAxis' ? (memberFormat ?? {}) : {}),
  };
}
