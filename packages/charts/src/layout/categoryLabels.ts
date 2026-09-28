/**
 * A category axis's labels turned before any is hidden (T467, UX-117).
 *
 * ECharts hides category labels that would meet: it measures the widest
 * label, adds 30 %, and keeps one label in every `floor(…) + 1` categories
 * (`axisTickLabelBuilder.js`, `calculateCategoryInterval`; research
 * `echarts-category-labels.md`). "Top 10 Products by Revenue" drew 11 bars and
 * named 3. Its test is also its remedy: turned, a label takes the category's
 * width by its height rather than its length, so here each label is turned
 * the least of 45° and 90° (direction.md §6's rotations) at which ECharts'
 * own test keeps every one. Where even 90° can't keep every one — a dense time
 * axis — they are turned 90°, which keeps the most, and ECharts thins the rest.
 * Labels that fit are left level, and a rotation set in the axis editor (0°
 * included) stays the user's.
 */
import { format } from 'echarts/core';
import type { RenderSpec } from '@wechart/core';

import { plotEdgesOf } from '../customize';
import { categoryAxisPx, type Canvas } from '../series/bar';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';

/** ECharts' axis labels: its default 12 px, in the chart's face. */
const LABEL_FONT = `12px ${CHART_FONT}`;
/** The margin ECharts adds to a label's box before comparing it with its room. */
const ECHARTS_MARGIN = 1.3;
const TURNS = [45, 90] as const;

type Axis = {
  type?: unknown;
  data?: unknown[];
  axisLabel?: { rotate?: unknown; formatter?: unknown };
};

export function fitCategoryLabels(
  option: EChartsOption,
  spec: RenderSpec,
  canvas: Canvas,
): EChartsOption {
  const axis = option.xAxis as Axis | Axis[] | undefined;
  if (axis === undefined || Array.isArray(axis) || axis.type !== 'category') return option;
  if (axis.axisLabel?.rotate !== undefined) return option;
  const data = axis.data ?? [];
  if (data.length < 2) return option;

  const write = axis.axisLabel?.formatter;
  const boxes = data.map((value, at) =>
    format.getTextRect(
      typeof write === 'function'
        ? String((write as (v: unknown, i: number) => unknown)(value, at))
        : String(value),
      LABEL_FONT,
    ),
  );
  const width = Math.max(...boxes.map((box) => box.width)) * ECHARTS_MARGIN;
  const height = Math.max(...boxes.map((box) => box.height)) * ECHARTS_MARGIN;
  const names = ((option.series as { name?: unknown }[] | undefined) ?? []).map((one) =>
    String(one.name ?? ''),
  );
  const span = categoryAxisPx(canvas, false, plotEdgesOf(spec, names)) / data.length;
  if (width < span) return option;

  // ECharts keeps every label at a turn where either of its box's sides fits
  // the category's room along that side.
  const fits = (degrees: number) => {
    const turn = (degrees / 180) * Math.PI;
    return Math.min(width / (span * Math.cos(turn)), height / (span * Math.sin(turn))) < 1;
  };
  const rotate = TURNS.find(fits) ?? 90;
  return { ...option, xAxis: { ...axis, axisLabel: { ...axis.axisLabel, rotate } } };
}
