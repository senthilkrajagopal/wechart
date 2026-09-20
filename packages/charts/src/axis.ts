/**
 * Axis settings (AC-040, direction.md §6 "Axes").
 *
 * The criterion's failing state is "a setting is accepted and the drawing does
 * not change", so these are applied to the option the renderer produced rather
 * than being a second place that decides what an axis is. Every renderer gets
 * them for free, and none can forget.
 */
import type { RenderSpec } from '@wechart/core';

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
  if (x === undefined && y === undefined) return option;

  const merge = (key: 'xAxis' | 'yAxis', settings: AxisSettings | undefined) => {
    const existing = option[key];
    if (existing === undefined || Array.isArray(existing)) return {};
    return { [key]: { ...(existing as object), ...axisFragment(settings) } };
  };

  return { ...option, ...merge('xAxis', x), ...merge('yAxis', y) };
}
