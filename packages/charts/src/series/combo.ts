/**
 * The combo chart (AC-037) — bars and a line in one frame.
 *
 * **One value axis.** direction.md is explicit that the recommender never
 * proposes a dual axis: two scales in one frame let any two series be made to
 * look related, and the inspector allows one only as a deliberate override
 * carrying a warning. So every series here shares a scale, and the chart says
 * something true about the magnitudes rather than merely about the shapes.
 *
 * The first measure is drawn as bars and the rest as lines. Which measure
 * takes which mark is a decision the chart spec should eventually carry —
 * Metabase keeps it per series in `series_settings.<key>.display` — but no
 * criterion asks for that yet, and inventing a setting nothing sets would be
 * guessing at a requirement.
 */
import { seriesOf, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

export function isComboType(chartType: string): boolean {
  return chartType === 'combo';
}

export function comboOption(spec: RenderSpec): EChartsOption {
  if (!isComboType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a combo chart`);
  }

  const surface = spec.surface ?? DEFAULT_SURFACE;
  const { categories, series } = seriesOf(spec);

  return {
    animation: false,
    xAxis: { type: 'category', data: categories },
    // Exactly one, shared by every series.
    yAxis: { type: 'value' },
    series: series.map((one, index) => {
      const colour = colourFor(spec, one.name, index);
      const asBars = index === 0;

      return asBars
        ? {
            type: 'bar' as const,
            name: one.name,
            data: [...one.values],
            itemStyle: {
              color: colour,
              borderColor: surface,
              borderWidth: MARK.gapPx,
              borderRadius: [MARK.cornerRadiusPx, MARK.cornerRadiusPx, 0, 0],
            },
          }
        : {
            type: 'line' as const,
            name: one.name,
            data: [...one.values],
            connectNulls: false,
            lineStyle: { color: colour, width: MARK.linePx },
            itemStyle: { color: colour },
            symbolSize: MARK.markerPx,
          };
    }),
  };
}
