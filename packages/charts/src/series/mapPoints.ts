/**
 * A Map's Points layer (T976, AC-625; design 23 sheet 6; direction.md rules
 * 158, 160): a geo dimension's rows as circles on the map, each at its
 * latitude and longitude, sized by area from 8 px across for the least value
 * to 24 px for the most, at 0.72 with a 1 px surface ring.
 *
 * Over a Regions layer they take categorical slot 2, slot 1 being the ramp's
 * own hue; alone, slot 1. A Colour dimension of at most 3 members colours
 * them instead, from slot 2 over regions (slot 1 alone); with more, it is
 * refused and said, and the points keep the one colour.
 *
 * The layer is its own query (`mapPointsQuery`), answered into the spec's
 * `mapPoints`. Cube writes a geo value "lat,lng"; ECharts' `geo` takes
 * `[lng, lat]` (research `cube-geo-values.md`, `echarts-geo-points.md`). The
 * points are a scatter series on a `geo` component of its own that draws
 * nothing (`show: false`) and is laid out as the map series' own geo is —
 * the same map, projection and box — so a coordinate lands on the same pixel
 * on both, while the map series keeps drawing and marking its regions.
 */
import {
  formatterFor,
  geoPointOf,
  mapSettingsOf,
  memberOn,
  type RenderSpec,
} from '@wechart/core';

import { markedItemStyle } from '../marking/render';
import { DEFAULT_PALETTE, DEFAULT_SURFACE, type EChartsOption } from '../theme';

export const POINT_MIN_PX = 8;
export const POINT_MAX_PX = 24;
export const POINT_OPACITY = 0.72;
/** The most members a Colour dimension may have on a Points layer (AC-625). */
export const POINT_COLOURS_MAX = 3;

export interface MapPoint {
  readonly lng: number;
  readonly lat: number;
  /** The geo value as Cube gave it, which marks the point (T978). */
  readonly location: string;
  /** Its size measure's value, where it has one. */
  readonly value?: number;
  /** Its Colour member, as its row holds it. */
  readonly member?: unknown;
  readonly diameter: number;
  readonly colour: string;
}

export interface MapPointsDrawn {
  readonly points: readonly MapPoint[];
  /** The rows with no location to place them at. */
  readonly unlocated: number;
  /** How many rows Cube returned. */
  readonly shown: number;
  /** How many rows there are in all, where Cube counted them. */
  readonly total?: number;
  /** What one point is, in the plural: the location's cube, "stores". */
  readonly noun: string;
  /** Why Colour isn't drawn, where it isn't. */
  readonly refusal?: string;
}

/**
 * A point's diameter, its area linear in its value between the least's
 * (8 px across) and the most's (24 px); 8 px where all are one value.
 */
export function diameterOf(value: number, min: number, max: number): number {
  if (!(max > min) || !Number.isFinite(value)) return POINT_MIN_PX;
  const share = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const area = POINT_MIN_PX ** 2 + share * (POINT_MAX_PX ** 2 - POINT_MIN_PX ** 2);
  return Math.sqrt(area);
}

/** The location's cube, as words: `stores.location` → "stores". */
function nounOf(location: string): string {
  return (location.split('.')[0] ?? location).replace(/_/g, ' ');
}

const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/** The Points layer as drawn; none without the layer or before its answer is in. */
export function mapPointsOf(spec: RenderSpec): MapPointsDrawn | undefined {
  const layer = mapSettingsOf(spec.options).points;
  const answer = spec.mapPoints;
  if (layer === undefined || answer === undefined) return undefined;
  const overRegions = memberOn(spec.encoding, 'x') !== undefined;
  const palette = spec.palette ?? DEFAULT_PALETTE;
  const first = overRegions ? 1 : 0;

  const located = answer.rows.flatMap((row) => {
    const at = geoPointOf(row[layer.location]);
    return at === undefined ? [] : [{ row, at }];
  });
  const members =
    layer.colour === undefined
      ? []
      : [...new Set(located.map(({ row }) => String(row[layer.colour!] ?? '')))];
  const refusal =
    members.length > POINT_COLOURS_MAX
      ? `Colour takes at most ${String(POINT_COLOURS_MAX)} members; ${
          spec.titles?.[layer.colour!] ?? layer.colour
        } has ${String(members.length)}.`
      : undefined;
  const byColour = refusal === undefined && members.length > 0;

  const values = located
    .map(({ row }) => (layer.size === undefined ? undefined : numberOf(row[layer.size])))
    .filter((value): value is number => value !== undefined);
  const [min, max] =
    values.length === 0 ? [0, 0] : [Math.min(...values), Math.max(...values)];

  const points = located.map(({ row, at }): MapPoint => {
    const value = layer.size === undefined ? undefined : numberOf(row[layer.size]);
    const member = layer.colour === undefined ? undefined : row[layer.colour];
    const slot = byColour ? first + members.indexOf(String(member ?? '')) : first;
    return {
      lng: at.lng,
      lat: at.lat,
      location: String(row[layer.location]),
      ...(value === undefined ? {} : { value }),
      ...(layer.colour === undefined ? {} : { member }),
      diameter: value === undefined ? POINT_MIN_PX : diameterOf(value, min, max),
      colour: palette[slot % palette.length] ?? DEFAULT_PALETTE[slot]!,
    };
  });
  return {
    points,
    unlocated: answer.rows.length - located.length,
    shown: answer.rows.length,
    ...(answer.total === undefined ? {} : { total: answer.total }),
    noun: nounOf(layer.location),
    ...(refusal === undefined ? {} : { refusal }),
  };
}

/** Escaped, because ECharts' tooltip formatter returns raw HTML. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The map's option with its Points layer: a hidden `geo` laid out as the map
 * series' own, and the points as a scatter series on it, over the regions.
 */
export function withMapPoints(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const drawn = mapPointsOf(spec);
  const series = (option['series'] as Record<string, unknown>[] | undefined) ?? [];
  const regions = series.find((one) => one['type'] === 'map');
  if (drawn === undefined || regions === undefined) return option;
  const layer = mapSettingsOf(spec.options).points!;
  const format = layer.size === undefined ? undefined : formatterFor(layer.size, spec.formats ?? {});
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const marking = spec.marking;
  const sizeTitle = layer.size === undefined ? '' : (spec.titles?.[layer.size] ?? layer.size);

  const points = {
    type: 'scatter' as const,
    // Named, as ECharts' own default ("series\u00000") holds the separator
    // a click's item is read by (T978).
    name: spec.titles?.[layer.location] ?? layer.location,
    coordinateSystem: 'geo',
    geoIndex: 0,
    z: 3,
    emphasis: { disabled: true },
    data: drawn.points.map((point) => {
      // Marked by outline and fade, never by fill (T978, AC-627): a marked
      // point keeps its 0.72 and gains the marking's outline; the rest fade.
      const style =
        marking === undefined
          ? undefined
          : markedItemStyle({ [layer.location]: point.location }, point.colour, marking);
      return {
        name: point.location,
        value: [point.lng, point.lat, point.value ?? null],
        symbolSize: point.diameter,
        // What it marks and filters by: its place (T978).
        marks: [{ member: layer.location, value: point.location }],
        itemStyle: {
          color: point.colour,
          opacity: POINT_OPACITY * (style?.opacity ?? 1),
          borderColor:
            style?.borderWidth !== undefined && style.borderWidth > 0
              ? (style.borderColor ?? surface)
              : surface,
          borderWidth:
            style?.borderWidth !== undefined && style.borderWidth > 0 ? style.borderWidth : 1,
        },
      };
    }),
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: unknown }) => {
        const value = Array.isArray(params.value) ? (params.value[2] as unknown) : undefined;
        const said =
          format === undefined || typeof value !== 'number' ? '' : `<br/>${escapeHtml(`${sizeTitle}: ${format(value)}`)}`;
        return `${escapeHtml(params.name ?? '')}${said}`;
      },
    },
  };
  return { ...option, geo: hiddenGeoOf(option, regions), series: [...series, points] };
}

/**
 * The `geo` a layer over the regions is drawn on (research
 * `echarts-geo-points.md`): drawing nothing itself, laid out as the map
 * series' own — the same map, projection and box — so a coordinate lands on
 * the same pixel on both. One for every layer: the option's own, once made.
 */
export function hiddenGeoOf(
  option: EChartsOption,
  regions: Record<string, unknown>,
): Record<string, unknown> {
  const made = option['geo'] as Record<string, unknown> | undefined;
  return (
    made ?? {
      map: regions['map'],
      projection: regions['projection'],
      left: regions['left'],
      right: regions['right'],
      top: regions['top'],
      bottom: regions['bottom'],
      show: false,
      silent: true,
      roam: false,
    }
  );
}
