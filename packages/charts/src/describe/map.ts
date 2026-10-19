import { formatterFor, mapSettingsOf, memberOn, type RenderSpec } from '@wechart/core';

import { moneyOf } from '../compact';
import { echarts } from '../echarts';
import { titleOf } from '../modelWriter';
import { drawnRegionsOf, type DrawnRegions } from '../series/map';
import { mapPointsOf } from '../series/mapPoints';

/** A noun's plural, as a sentence says it: "territory" → "territories". */
const plural = (noun: string) =>
  /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`;

/** At most this many regions with no data are named; past it, counted. */
const NAMED_NO_DATA = 3;

/**
 * Both ends in the larger's unit, to two places ("$1.40M", "$0.20M"), as
 * design 23 writes them; under a thousand, in the measure's own format.
 */
function extremesWriter(spec: RenderSpec, measure: string, max: number): (value: number) => string {
  const steps = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const;
  const step = steps.find(([size]) => Math.abs(max) >= size);
  if (step === undefined) return formatterFor(measure, spec.formats ?? {});
  const money = moneyOf(spec.formats?.[measure]);
  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...(money === undefined ? {} : { style: 'currency', currency: money.currency }),
  });
  return (value) => `${number.format(value / step[0])}${step[1]}`;
}

function drawn(spec: RenderSpec): DrawnRegions | undefined {
  const regions = drawnRegionsOf(spec);
  return regions === undefined || 'instead' in regions ? undefined : regions;
}

/**
 * A map's text alternative (T980, AC-629; design 23 sheet 6; direction.md
 * rule 166): "Map of Revenue by sales territory, 6 territories: highest
 * Atlantic $1.40M, lowest Mountain $0.20M; Islands has no data. 10 stores as
 * points sized by Revenue." The regions counted are those with a row; those
 * of the set without one named, or past three counted. On Countries and
 * Admin-1, Natural Earth's point of view said (R83).
 */
export function describeMap(spec: RenderSpec): string | undefined {
  const regions = drawn(spec);
  const dimension = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (regions === undefined || dimension === undefined || measure === undefined) return undefined;
  const valued = regions.placed.filter((region) => Number.isFinite(region.value));
  const nameOf = (key: string) => regions.names.get(key) ?? key;
  const parts: string[] = [];
  const noun = regions.noun;
  const head = `Map of ${titleOf(spec, measure)} by ${titleOf(spec, dimension).toLowerCase()}, ${String(valued.length)} ${valued.length === 1 ? noun : plural(noun)}`;
  if (valued.length === 0) parts.push(`${head}.`);
  else {
    const highest = valued.reduce((one, other) => (other.value > one.value ? other : one));
    const lowest = valued.reduce((one, other) => (other.value < one.value ? other : one));
    const write = extremesWriter(spec, measure, highest.value);
    const placed = new Set(valued.map((region) => region.name));
    const empty = regions.keys.filter((key) => !placed.has(key));
    const noData =
      empty.length === 0
        ? ''
        : empty.length <= NAMED_NO_DATA
          ? `; ${empty.map(nameOf).join(empty.length === 2 ? ' and ' : ', ')} ${empty.length === 1 ? 'has' : 'have'} no data`
          : `; ${String(empty.length)} ${plural(noun)} have no data`;
    parts.push(
      `${head}: highest ${nameOf(highest.name)} ${write(highest.value)}, lowest ${nameOf(lowest.name)} ${write(lowest.value)}${noData}.`,
    );
  }
  const points = mapPointsOf(spec);
  const layer = mapSettingsOf(spec.options).points;
  if (points !== undefined && layer !== undefined)
    parts.push(
      `${String(points.points.length)} ${points.noun} as points${layer.size === undefined ? '' : ` sized by ${titleOf(spec, layer.size)}`}.`,
    );
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries' || boundarySet === 'admin1')
    parts.push('Borders and disputed areas as Natural Earth draws them.');
  return parts.join(' ');
}

type Ring = readonly (readonly number[])[];
type Polygon = readonly Ring[];

/** Whether a [lng, lat] is inside a ring, by ray casting. */
function insideRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let at = 0, before = ring.length - 1; at < ring.length; before = at, at += 1) {
    const [xa = 0, ya = 0] = ring[at]!;
    const [xb = 0, yb = 0] = ring[before]!;
    if (ya > lat !== yb > lat && lng < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

/** Each region's points, by its key: in its outer ring and none of its holes. */
function pointsPerRegion(regions: DrawnRegions, places: readonly [number, number][]): Map<string, number> {
  const features =
    (
      echarts.getMap(regions.mapName) as {
        geoJSON?: {
          features?: readonly {
            properties?: Record<string, unknown>;
            geometry?: { type: string; coordinates: unknown };
          }[];
        };
      } | null
    )?.geoJSON?.features ?? [];
  const counts = new Map<string, number>();
  for (const feature of features) {
    const key = String(feature.properties?.[regions.nameProperty] ?? '');
    const geometry = feature.geometry;
    if (geometry === undefined) continue;
    const polygons = (
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    ) as readonly Polygon[];
    for (const [lng, lat] of places)
      if (
        polygons.some(
          ([outer, ...holes]) =>
            outer !== undefined &&
            insideRing(outer, lng, lat) &&
            !holes.some((hole) => insideRing(hole, lng, lat)),
        )
      )
        counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface MapRegionTable {
  readonly columns: readonly string[];
  /** A region's name, its value (none where it has no row) and, with points, how many lie in it. */
  readonly rows: readonly (readonly [string, number | undefined, number?])[];
}

/**
 * A map's table by region (T980, AC-629): every region of the set, those
 * with a row first in the rows' order, then the rest by name with no value;
 * with a Points layer, how many of its points lie in each.
 */
export function mapRegionTable(spec: RenderSpec): MapRegionTable | undefined {
  const regions = drawn(spec);
  const dimension = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (regions === undefined || dimension === undefined || measure === undefined) return undefined;
  const nameOf = (key: string) => regions.names.get(key) ?? key;
  const points = mapPointsOf(spec);
  const layer = mapSettingsOf(spec.options).points;
  const counts =
    points === undefined
      ? undefined
      : pointsPerRegion(
          regions,
          points.points.map((point) => [point.lng, point.lat] as [number, number]),
        );
  const placed = new Set(regions.placed.map((region) => region.name));
  const empty = regions.keys
    .filter((key) => !placed.has(key))
    .sort((one, other) => nameOf(one).localeCompare(nameOf(other)));
  const row = (key: string, value: number | undefined) =>
    (counts === undefined
      ? [nameOf(key), value]
      : [nameOf(key), value, counts.get(key) ?? 0]) as MapRegionTable['rows'][number];
  return {
    columns: [
      titleOf(spec, dimension),
      titleOf(spec, measure),
      ...(points === undefined || layer === undefined
        ? []
        : [points.noun.charAt(0).toUpperCase() + points.noun.slice(1)]),
    ],
    rows: [
      ...regions.placed.map((region) =>
        row(region.name, Number.isFinite(region.value) ? region.value : undefined),
      ),
      ...empty.map((key) => row(key, undefined)),
    ],
  };
}
