/**
 * The line and area family (AC-037): line, multi-series line, area and
 * stacked area.
 *
 * One ECharts `line` series set, as with the bar family. What separates the
 * four is whether the region beneath the line is filled and whether the series
 * share a stack — a line *is* an unfilled area, and writing them apart would
 * let their axis handling, gaps and mark styling drift.
 */
import { seriesOf, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { MARK, type EChartsOption } from '../theme';

const LAYOUT = {
  line: { filled: false, stacked: false },
  multiLine: { filled: false, stacked: false },
  area: { filled: true, stacked: false },
  stackedArea: { filled: true, stacked: true },
} as const;

export type LineType = keyof typeof LAYOUT;

export function isLineType(chartType: string): chartType is LineType {
  return chartType in LAYOUT;
}

/**
 * How solid the fill under an area is.
 *
 * direction.md publishes no figure for this. Stacked areas are read by
 * comparing bands, so the fill has to carry the series colour without the
 * lines on top of it disappearing into their own fill.
 */
const AREA_OPACITY = 0.25;

export function lineOption(spec: RenderSpec): EChartsOption {
  if (!isLineType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a line chart`);
  }

  const { filled, stacked } = LAYOUT[spec.chartType];
  const { categories, series } = seriesOf(spec);

  return {
    animation: false,
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series: series.map((one, index) => {
      const colour = colourFor(spec, one.name, index);
      return {
        type: 'line' as const,
        name: one.name,
        data: [...one.values],
        ...(stacked ? { stack: 'total' } : {}),
        // Left at ECharts' default of false on purpose: a gap in the data is
        // a month that was never measured, and joining across it would draw a
        // trend through nothing.
        connectNulls: false,
        lineStyle: { color: colour, width: MARK.linePx },
        itemStyle: { color: colour },
        symbolSize: MARK.markerPx,
        ...(filled ? { areaStyle: { color: colour, opacity: AREA_OPACITY } } : {}),
      };
    }),
  };
}
