/**
 * A custom boundary set (T979, AC-628; R81-1): GeoJSON a read-write member
 * uploads into their My workspace, landing in a folder through a proposal.
 * Checked here, by the page before it sends and by the API before it
 * stores: a FeatureCollection of Polygons and MultiPolygons — what ECharts'
 * map draws (research `country-map.md`: no `Point` features) — each holding
 * the key property named at upload, with a value unique in the set. A
 * refusal names the first feature that fails, by its place and its key.
 */

/** The most a set may be, as uploaded: enough for a country's subdivisions at a map's detail. */
export const BOUNDARY_SET_MAX_BYTES = 5_000_000;

type Feature = {
  readonly type?: unknown;
  readonly properties?: unknown;
  readonly geometry?: { readonly type?: unknown } | null;
};

const featuresOf = (geojson: unknown): readonly Feature[] | undefined => {
  const given = geojson as { type?: unknown; features?: unknown } | null | undefined;
  return given?.type === 'FeatureCollection' && Array.isArray(given.features)
    ? (given.features as Feature[])
    : undefined;
};

const keyOf = (feature: Feature, keyProperty: string): string | undefined => {
  const properties = feature.properties as Record<string, unknown> | null | undefined;
  const value = properties?.[keyProperty];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

const isPosition = (value: unknown) =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

/** A polygon: one or more rings, each of at least 4 positions (RFC 7946 §3.1.6). */
const isPolygon = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition));

/** Whether a geometry's coordinates are what its type says (checkpoint 5's review). */
const holdsRings = (type: 'Polygon' | 'MultiPolygon', coordinates: unknown) =>
  type === 'Polygon'
    ? isPolygon(coordinates)
    : Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPolygon);

/** Why the set can't be taken, naming the first feature that fails; none where it can. */
export function boundarySetProblem(geojson: unknown, keyProperty: string): string | undefined {
  if (keyProperty.trim() === '') return 'Name the key property.';
  const features = featuresOf(geojson);
  if (features === undefined) return 'This is not a GeoJSON FeatureCollection.';
  if (features.length === 0) return 'The file holds no features.';
  const seen = new Map<string, number>();
  for (const [at, feature] of features.entries()) {
    const place = at + 1;
    const key = keyOf(feature, keyProperty);
    const named = key === undefined ? '' : ` ("${key}")`;
    const shape = feature.geometry?.type;
    if (shape !== 'Polygon' && shape !== 'MultiPolygon')
      return `Feature ${String(place)}${named} is a ${typeof shape === 'string' ? shape : 'feature with no geometry'}: every feature must be a Polygon or MultiPolygon.`;
    if (!holdsRings(shape, (feature.geometry as { coordinates?: unknown }).coordinates))
      return `Feature ${String(place)}${named} has a ${shape} that isn’t rings of at least 4 [longitude, latitude] positions.`;
    if (key === undefined)
      return `Feature ${String(place)} has no "${keyProperty}": every feature must hold the key property.`;
    const before = seen.get(key);
    if (before !== undefined)
      return `Feature ${String(place)}${named} has the same "${keyProperty}" as feature ${String(before)}: each key must be unique.`;
    seen.set(key, place);
  }
  return undefined;
}

/** The set's regions, by their keys, in the file's order (a set that passes the check). */
export function boundarySetRegions(geojson: unknown, keyProperty: string): string[] {
  return (featuresOf(geojson) ?? []).flatMap((feature) => {
    const key = keyOf(feature, keyProperty);
    return key === undefined ? [] : [key];
  });
}
