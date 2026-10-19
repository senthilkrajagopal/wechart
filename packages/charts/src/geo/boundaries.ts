/**
 * A Map's boundaries, whichever its set (T975): ECharts throws on a map it
 * hasn't registered, so a tile loads them before its first option is set.
 * Countries is one file; Admin-1 its index, then the file of the country
 * the values name; a custom set is its own (T979).
 */
import { mapSettingsOf, type RenderSpec } from '@wechart/core';

import { regionSetIdOf } from '../series/map';
import { admin1Index, loadAdmin1, loadAdmin1Index } from './admin1';
import { countryMap, loadCountryMap } from './countryMap';
import { regionSetOf } from './regionSets';

/** Whether everything the map draws is registered. */
export function mapBoundariesReady(spec: RenderSpec): boolean {
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries') return countryMap() !== undefined;
  if (boundarySet === 'admin1') {
    if (admin1Index() === undefined) return false;
    const id = regionSetIdOf(spec);
    return id === undefined || regionSetOf(id) !== undefined;
  }
  return true;
}

/** Fetches and registers what the map draws, once. */
export async function loadMapBoundaries(spec: RenderSpec): Promise<void> {
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries') {
    await loadCountryMap();
    return;
  }
  if (boundarySet === 'admin1') {
    await loadAdmin1Index();
    const id = regionSetIdOf(spec);
    if (id !== undefined) await loadAdmin1(id.slice('admin1:'.length));
  }
}
