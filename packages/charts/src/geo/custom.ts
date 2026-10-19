/**
 * Custom boundary sets (T979, AC-628): GeoJSON a folder's member uploaded,
 * keyed by the property they named. Fetched by the page (the renderer asks
 * nothing of the network itself), through the loader it sets, and
 * registered with ECharts as their own map the first time one is drawn.
 */
import { regionIndexOf } from '@wechart/core';

import { echarts } from '../echarts';
import { registerRegionSet, regionSetOf, type RegionSet } from './regionSets';

export type BoundarySetLoader = (
  id: string,
) => Promise<{ readonly keyProperty: string; readonly geojson: Record<string, unknown> }>;

let loader: BoundarySetLoader | undefined;
const loading = new Map<string, Promise<RegionSet>>();

/** How the page fetches a set's GeoJSON, by its id. */
export function setBoundarySetLoader(given: BoundarySetLoader): void {
  loader = given;
}

/** The ECharts map a custom set's regions are registered as. */
export const customMapName = (id: string) => `wechart-custom-${id}`;

/** A set registered with ECharts and as `custom:‹id›`, each region by its key. */
export function registerCustomSet(
  id: string,
  keyProperty: string,
  geojson: Record<string, unknown>,
): RegionSet {
  echarts.registerMap(customMapName(id), { geoJSON: geojson } as unknown as Parameters<
    typeof echarts.registerMap
  >[1]);
  const features = (geojson['features'] as { properties?: Record<string, unknown> }[] | undefined) ?? [];
  const keys = features
    .map((feature) => feature.properties?.[keyProperty])
    .filter((key) => typeof key === 'string' || typeof key === 'number')
    .map(String);
  return registerRegionSet(`custom:${id}`, {
    map: customMapName(id),
    nameProperty: keyProperty,
    index: regionIndexOf(keys.map((key) => ({ key, names: [] }))),
    noun: 'region',
    names: new Map(keys.map((key) => [key, key] as const)),
  });
}

/** A set, fetched and registered the first time it is asked for. */
export function loadCustomSet(id: string): Promise<RegionSet> {
  const registered = regionSetOf(`custom:${id}`);
  if (registered !== undefined) return Promise.resolve(registered);
  if (loader === undefined) return Promise.reject(new Error('Custom boundary sets can’t be fetched here.'));
  const pending =
    loading.get(id) ??
    loader(id).then(
      ({ keyProperty, geojson }) => registerCustomSet(id, keyProperty, geojson),
      (error: unknown) => {
        loading.delete(id);
        throw error;
      },
    );
  loading.set(id, pending);
  return pending;
}
