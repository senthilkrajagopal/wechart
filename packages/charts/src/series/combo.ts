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
import { plotEdgesOf } from '../customize';
import { PROTOTYPE_GRID } from '../layout/grid';
import { categoryAxisPx, DEFAULT_CANVAS, gapFor, laidBarWidth, type Canvas } from './bar';
import { DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

export function isComboType(chartType: string): boolean {
  return chartType === 'combo';
}

export function comboOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isComboType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a combo chart`);
  }

  const surface = spec.surface ?? DEFAULT_SURFACE;
  const { categories, series } = seriesOf(spec);

  return {
    animation: false,
    // The grid its bars' widths are estimated against (T254).
    grid: { ...PROTOTYPE_GRID },
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
              // One bar series, a bar per category, its gap kept only where
              // it leaves the bar its colour on this canvas (AC-210).
              borderWidth: gapFor(
                laidBarWidth(
                  categoryAxisPx(
                    canvas,
                    false,
                    plotEdgesOf(
                      spec,
                      series.map((each) => each.name),
                    ),
                  ),
                  categories.length,
                  1,
                ),
              ),
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
