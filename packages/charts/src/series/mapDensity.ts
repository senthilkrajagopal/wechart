/**
 * A Map's Density layer (T977, AC-626; design 23 sheet 6; direction.md rules
 * 160, 163): where a geo dimension's places gather, as ECharts' heatmap on
 * the map's `geo`, on §5's sequential ramp fading to transparent at its
 * least. While it shows, the regions are 1 px `border-strong` outlines with
 * no fill, so the ramp says one thing; and it is never marked: its heatmap
 * is silent, a rectangle or lasso passes over it (`itemsInShape`), and the
 * tooltip and the layer's row say so.
 *
 * Its own query is the Points layer's shape (`mapPointsQuery`): one row per
 * place, each weighing one. Its heatmap draws into a canvas (research
 * `echarts-geo-points.md`), which server-side rendering hasn't.
 */
import { geoPointOf, mapSettingsOf, type RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { SEQUENTIAL, type EChartsOption } from '../theme';
import { hiddenGeoOf } from './mapPoints';

export const DENSITY_CANT_BE_MARKED = "Density can't be marked; it shows where points gather";

/** §5's pale end, at no opacity: where nothing gathers, nothing is drawn. */
const TRANSPARENT_PALE = (() => {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(SEQUENTIAL[0].slice(at, at + 2), 16));
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, 0)`;
})();

/** The places a Density layer draws, as `[lng, lat, weight]`; none without it or its answer. */
export function densityPlacesOf(spec: RenderSpec): [number, number, number][] | undefined {
  const layer = mapSettingsOf(spec.options).density;
  const answer = spec.mapDensity;
  if (layer === undefined || answer === undefined) return undefined;
  return answer.rows.flatMap((row) => {
    const at = geoPointOf(row[layer.location]);
    return at === undefined ? [] : [[at.lng, at.lat, 1] as [number, number, number]];
  });
}

export function withMapDensity(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const places = densityPlacesOf(spec);
  const series = (option['series'] as Record<string, unknown>[] | undefined) ?? [];
  const regionsAt = series.findIndex((one) => one['type'] === 'map');
  const regions = series[regionsAt];
  if (places === undefined || regions === undefined) return option;

  const outlined = {
    ...regions,
    itemStyle: {
      areaColor: 'transparent',
      borderColor: COLORS.light['border-strong'],
      borderWidth: 1,
    },
    // No fill of its own on any region, marked or not: the ramp is density's.
    data: ((regions['data'] as Record<string, unknown>[] | undefined) ?? []).map((item) => {
      const style = item['itemStyle'] as Record<string, unknown> | undefined;
      return style === undefined
        ? item
        : { ...item, itemStyle: { ...style, areaColor: 'transparent' } };
    }),
  };
  const heat = {
    type: 'heatmap' as const,
    coordinateSystem: 'geo',
    geoIndex: 0,
    data: places,
    pointSize: 8,
    blurSize: 16,
    silent: true,
    z: 2,
  };
  const heatAt = series.length;
  // Said with the regions' own tooltip, the layer itself having none (silent).
  const tooltip = option['tooltip'] as
    | { formatter?: (params: unknown) => string; [key: string]: unknown }
    | undefined;
  const said =
    tooltip?.formatter === undefined
      ? tooltip
      : {
          ...tooltip,
          formatter: (params: unknown) =>
            `${tooltip.formatter!(params)}<br/>${DENSITY_CANT_BE_MARKED}`,
        };
  const { graphic: _swatch, ...rest } = option;
  void _swatch;
  return {
    ...rest,
    geo: hiddenGeoOf(option, regions),
    series: [...series.slice(0, regionsAt), outlined, ...series.slice(regionsAt + 1), heat],
    // Its ramp alone: the regions' is gone while it shows, and its "No data" swatch with it.
    visualMap: [
      {
        type: 'continuous',
        seriesIndex: heatAt,
        min: 0,
        max: 1,
        calculable: false,
        show: false,
        inRange: { color: [TRANSPARENT_PALE, SEQUENTIAL[0], SEQUENTIAL[1]] },
      },
    ],
    ...(said === undefined ? {} : { tooltip: said }),
  };
}
