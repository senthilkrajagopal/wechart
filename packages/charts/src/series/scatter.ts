/**
 * Scatter (AC-037).
 *
 * The first chart type whose x axis is a **measure** rather than a category,
 * which is why it does not go through `seriesOf`: that shapes rows into
 * categories and series, and a scatter has neither. Each row is one point, and
 * both axes carry values.
 */
import { distinctValues, memberOn, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { titleOf } from '../modelWriter';
import { MARK, type EChartsOption } from '../theme';

export function isScatterType(chartType: string): boolean {
  return chartType === 'scatter';
}

/** One row's position, or null when either measure is missing. */
function pointOf(row: Record<string, unknown>, x: string, y: string): [number, number] | null {
  const at = (member: string) => {
    const raw = row[member];
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const first = at(x);
  const second = at(y);
  // A point needs both coordinates. Dropping it is the only honest option:
  // there is no baseline to fall back to as a bar has.
  return first === null || second === null ? null : [first, second];
}

/**
 * A scatter's series, each with the rows its points are drawn from, one point
 * a row, in the order they are drawn — for its points and for finding the
 * row behind a point (T453).
 */
export function scatterSeriesOf(
  spec: RenderSpec,
): { readonly name: string; readonly rows: readonly Record<string, unknown>[] }[] {
  const x = memberOn(spec.encoding, 'x');
  const y = memberOn(spec.encoding, 'y');
  const splitBy = memberOn(spec.encoding, 'color');
  if (x === undefined || y === undefined) return [];

  const drawn = (rows: readonly Record<string, unknown>[]) =>
    rows.filter((row) => pointOf(row, x, y) !== null);
  return splitBy === undefined
    ? [{ name: y, rows: drawn(spec.rows) }]
    : distinctValues(spec.rows, splitBy).map((member) => ({
        name: member,
        rows: drawn(spec.rows.filter((row) => String(row[splitBy] ?? '') === member)),
      }));
}

export function scatterOption(spec: RenderSpec): EChartsOption {
  if (!isScatterType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a scatter chart`);
  }

  const x = memberOn(spec.encoding, 'x');
  const y = memberOn(spec.encoding, 'y');

  if (x === undefined || y === undefined) {
    // Both axes are measures, so neither can be defaulted the way a category
    // axis can be inferred from the rows.
    return { animation: false, xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [] };
  }

  const pointsFor = (rows: readonly Record<string, unknown>[]) =>
    rows.map((row) => pointOf(row, x, y)).filter((point) => point !== null);

  const series = scatterSeriesOf(spec);

  return {
    animation: false,
    // Both axes are value axes. A category axis would space the points evenly
    // and so misstate every distance the chart exists to show.
    // Each named by its measure's title (AC-220).
    xAxis: { type: 'value', name: titleOf(spec, x) },
    yAxis: { type: 'value', name: titleOf(spec, y) },
    series: series.map((one, index) => ({
      type: 'scatter' as const,
      name: one.name,
      data: pointsFor(one.rows),
      symbolSize: MARK.markerPx,
      itemStyle: { color: colourFor(spec, one.name, index) },
    })),
  };
}
