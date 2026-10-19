/**
 * A combo drawn below 1,024 px (T866; AC-511; design 20 state I; direction.md
 * §2's breakpoint). Its axis titles stay above their axes, as they are drawn
 * at every width (`axisTitle`). Here, last, on the option as drawn:
 *
 * - each value axis's ticks compact ("$160K"), a value under 1,000 written as
 *   its axis writes it ("40%"), unless Customize gave the axis a format;
 * - the category labels level, so ECharts thins them to those with room,
 *   rather than turned (`fitCategoryLabels`), unless Customize turned them;
 * - the legend wrapped under the title, not paged, with room above the plot
 *   for each of its rows.
 *
 * A reference line's label is shortened where it's drawn (`referenceDrawing`).
 */
import { comboSeriesOf, memberOn, membersOn, type ComboAxis, type RenderSpec } from '@wechart/core';
import { format } from 'echarts/core';

import { axesOf } from '../axis';
import { compactWriter } from '../compact';
import type { Canvas } from '../series/bar';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';

/** The legend's text: ECharts' default 12 px, in the chart's face. */
const LEGEND_FONT = `12px ${CHART_FONT}`;
/** ECharts puts an entry's text 5 px past its icon (`LegendView.js`, `textX`). */
const ICON_TO_TEXT_PX = 5;
/** The legend's padding on each side, ECharts' default. */
const LEGEND_PADDING_PX = 5;

type Axis = Record<string, unknown> & {
  axisLabel?: Record<string, unknown> & { formatter?: unknown };
};

/** A value written compact from 1,000 up, as its axis writes it below. */
export function compactTicks(
  spec: RenderSpec,
  measure: string,
  write: (value: unknown) => string,
): (value: unknown) => string {
  const short = compactWriter(spec, measure);
  return (value) => {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) >= 1000 ? short(number) : write(value);
  };
}

/** Each value axis's first measure, as the combo draws it. */
function firstMeasures(spec: RenderSpec): Record<ComboAxis, string | undefined> {
  const resolved = comboSeriesOf(membersOn(spec.encoding, 'y'), spec.options, {
    split: memberOn(spec.encoding, 'color') !== undefined,
  });
  return {
    left: resolved.find((one) => one.axis === 'left')?.measure,
    right: resolved.find((one) => one.axis === 'right')?.measure,
  };
}

/** "{right|(right)}" read as the text it draws, "(right)". */
const richText = (text: string) => text.replace(/\{[^|{}]+\|([^{}]*)\}/g, '$1');

/**
 * How many rows a horizontal legend wraps into across a width, as ECharts
 * lays it out (`layout.js`, `boxLayout`): each entry its icon, 5 px, and its
 * text, `itemGap` after it, a new row wherever the next would pass the width.
 */
function legendRows(legend: Record<string, unknown>, width: number): number {
  const data = Array.isArray(legend['data']) ? (legend['data'] as unknown[]) : [];
  const names = data.map((one) =>
    typeof one === 'object' && one !== null
      ? String((one as { name?: unknown }).name ?? '')
      : String(one),
  );
  const write =
    typeof legend['formatter'] === 'function'
      ? (legend['formatter'] as (name: string) => string)
      : undefined;
  const iconWidth = typeof legend['itemWidth'] === 'number' ? legend['itemWidth'] : 25;
  const gap = typeof legend['itemGap'] === 'number' ? legend['itemGap'] : 10;
  const room = width - 2 * LEGEND_PADDING_PX;
  let rows = names.length === 0 ? 0 : 1;
  let x = 0;
  for (const name of names) {
    const text = richText(write === undefined ? name : write(name));
    const entry = iconWidth + ICON_TO_TEXT_PX + format.getTextRect(text, LEGEND_FONT).width;
    if (x > 0 && x + entry > room) {
      rows += 1;
      x = 0;
    }
    x += entry + gap;
  }
  return rows;
}

export function withNarrowCombo(
  option: EChartsOption,
  spec: RenderSpec,
  canvas: Canvas,
): EChartsOption {
  if (spec.chartType !== 'combo' || canvas.narrow !== true) return option;
  const axes = axesOf(spec);
  const first = firstMeasures(spec);

  const compacted = (axis: Axis, side: ComboAxis): Axis => {
    const settings = side === 'left' ? axes.y : axes.right;
    const write = axis.axisLabel?.formatter;
    const measure = first[side];
    if (
      settings?.numberFormat !== undefined ||
      measure === undefined ||
      typeof write !== 'function'
    )
      return axis;
    return {
      ...axis,
      axisLabel: {
        ...axis.axisLabel,
        formatter: compactTicks(spec, measure, write as (value: unknown) => string),
      },
    };
  };
  const yAxis = option['yAxis'] as Axis | Axis[] | undefined;
  const ticks =
    yAxis === undefined
      ? {}
      : {
          yAxis: Array.isArray(yAxis)
            ? yAxis.map((axis, at) => compacted(axis, at === 0 ? 'left' : 'right'))
            : compacted(yAxis, 'left'),
        };

  const xAxis = option['xAxis'] as Axis | undefined;
  const level =
    xAxis === undefined || Array.isArray(xAxis) || axes.x?.tickRotation !== undefined
      ? {}
      : { xAxis: { ...xAxis, axisLabel: { ...xAxis.axisLabel, rotate: 0 } } };

  const legend = option['legend'] as Record<string, unknown> | undefined;
  const grid = (option['grid'] as Record<string, unknown> | undefined) ?? {};
  const rows = legend === undefined ? 0 : legendRows(legend, canvas.width);
  const rowPx =
    format.getTextRect('Mg', LEGEND_FONT).height +
    (typeof legend?.['itemGap'] === 'number' ? legend['itemGap'] : 10);
  const top = typeof grid['top'] === 'number' ? grid['top'] : 0;
  const wrapped =
    legend === undefined
      ? {}
      : {
          legend: { ...legend, type: 'plain' },
          grid: { ...grid, top: top + Math.max(0, rows - 1) * rowPx },
        };

  return { ...option, ...ticks, ...level, ...wrapped };
}
