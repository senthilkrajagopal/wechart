/**
 * Pie and donut (AC-037).
 *
 * One series, one slice per category, the measure driving the angle. A donut
 * is the same chart with an inner radius, so the two share everything except
 * that number — writing them apart would let their slice ordering, colours and
 * gap treatment drift, which is exactly what a reader compares across a
 * dashboard.
 */
import { memberOn, type RenderSpec } from '@wechart/core';

import { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

const LAYOUT = {
  pie: { innerRadius: '0%' },
  donut: { innerRadius: '50%' },
} as const;

export type PieType = keyof typeof LAYOUT;

export function isPieType(chartType: string): chartType is PieType {
  return chartType in LAYOUT;
}

const OUTER_RADIUS = '70%';

export function pieOption(spec: RenderSpec): EChartsOption {
  if (!isPieType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a pie chart`);
  }

  const palette = spec.palette ?? DEFAULT_PALETTE;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');

  const slices =
    category === undefined || measure === undefined
      ? []
      : spec.rows
          .map((row) => {
            const raw = row[measure];
            if (raw === null || raw === undefined || raw === '') return null;
            const value = Number(raw);
            if (!Number.isFinite(value)) return null;
            return { name: String(row[category] ?? ''), value };
          })
          // A category with no measurement is left out rather than drawn as a
          // zero-width sliver: a sliver in the legend invites the reader to
          // look for a slice that is not there.
          .filter((slice) => slice !== null);

  return {
    animation: false,
    series: [
      {
        type: 'pie' as const,
        radius: [LAYOUT[spec.chartType].innerRadius, OUTER_RADIUS],
        label: { show: false },
        data: slices.map((slice, index) => ({
          ...slice,
          itemStyle: {
            color: palette[index % palette.length],
            // The same surface-coloured gap the bar family uses, so slices of
            // a pie and segments of a stacked bar read the same way.
            borderColor: surface,
            borderWidth: MARK.gapPx,
          },
        })),
      },
    ],
  };
}
