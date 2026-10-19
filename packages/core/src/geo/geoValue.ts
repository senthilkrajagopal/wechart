/**
 * A Cube geo value (T976, AC-625; research `cube-geo-values.md`): a
 * `type: geo` dimension reaches a `/v1/load` row as one string, latitude
 * first, `"lat,lng"`, in the database's own digits — never an object or two
 * columns. Parsed as two numbers split on its one comma, never compared as
 * text; anything else, or a coordinate off the globe, is no point.
 *
 * ECharts' `geo` takes the other order, `[lng, lat]` (research
 * `echarts-geo-points.md`), which the map's series write from this.
 */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function geoPointOf(value: unknown): GeoPoint | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 2 || !parts.every((part) => NUMBER.test(part))) return undefined;
  const [lat, lng] = parts.map(Number) as [number, number];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}
