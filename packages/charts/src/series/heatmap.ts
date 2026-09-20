/**
 * Heatmap (AC-037).
 *
 * The one chart type whose **y axis is categorical** and whose measure drives
 * colour rather than position: `x` and `y` name the two dimensions and `color`
 * names the measure. That is inherent to a heatmap, and it is the clearest
 * case for channels being interpreted per chart type rather than fixed — the
 * old `{category, series, values}` could not have said it at all.
 *
 * ECharts requires `visualMap` here and throws "Heatmap must use with
 * visualMap" without one, so the colour scale is its component rather than a
 * per-cell colour of ours. The ramp's endpoints are direction.md §5's
 * sequential blue; the steps between are ECharts' interpolation.
 */
import { distinctValues, memberOn, type RenderSpec } from '@wechart/core';

import { SEQUENTIAL, type EChartsOption } from '../theme';

export function isHeatmapType(chartType: string): boolean {
  return chartType === 'heatmap';
}

export function heatmapOption(spec: RenderSpec): EChartsOption {
  if (!isHeatmapType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a heatmap`);
  }

  const across = memberOn(spec.encoding, 'x');
  const down = memberOn(spec.encoding, 'y');
  const measure = memberOn(spec.encoding, 'color');

  if (across === undefined || down === undefined || measure === undefined) {
    return {
      animation: false,
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'category', data: [] },
      visualMap: { show: false, min: 0, max: 1, inRange: { color: [...SEQUENTIAL] } },
      series: [],
    };
  }

  const columns = distinctValues(spec.rows, across);
  const rows = distinctValues(spec.rows, down);

  const cells = spec.rows
    .map((row) => {
      const raw = row[measure];
      if (raw === null || raw === undefined || raw === '') return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      const x = columns.indexOf(String(row[across] ?? ''));
      const y = rows.indexOf(String(row[down] ?? ''));
      // A cell with no measurement is left out rather than drawn at the pale
      // end of the ramp, which would read as a real low value.
      return x < 0 || y < 0 ? null : [x, y, value];
    })
    .filter((cell) => cell !== null);

  const values = cells.map((cell) => cell[2] as number);

  return {
    animation: false,
    xAxis: { type: 'category', data: columns },
    yAxis: { type: 'category', data: rows },
    visualMap: {
      // Hidden for now: a colour legend is AC-038's business, not a renderer's.
      show: false,
      min: values.length === 0 ? 0 : Math.min(...values),
      max: values.length === 0 ? 1 : Math.max(...values),
      inRange: { color: [...SEQUENTIAL] },
    },
    series: [{ type: 'heatmap' as const, data: cells, label: { show: false } }],
  };
}
