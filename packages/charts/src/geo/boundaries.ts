/**
 * A Map's boundaries, whichever its set (T975): ECharts throws on a map it
 * hasn't registered, so a tile loads them before its first option is set.
 * Countries is one file; Admin-1 its index, then the file of the country
 * the values name; a custom set is fetched by the page (T979). A Map in Auto
 * with no set chosen whose values aren't ISO-3 codes may be on Admin-1
 * (T1012): its index is asked for first, to tell.
 */
import { mapSettingsOf, type RenderSpec } from '@wechart/core';

import { mapSpecOf, mayBeAdmin1, regionSetIdOf } from '../series/map';
import { admin1Index, loadAdmin1, loadAdmin1Index } from './admin1';
import { countryMap, loadCountryMap } from './countryMap';
import { loadCustomSet } from './custom';
import { regionSetOf } from './regionSets';

/** Whether everything the map draws is registered. */
export function mapBoundariesReady(given: RenderSpec): boolean {
  if (mayBeAdmin1(given) && admin1Index() === undefined) return false;
  const spec = mapSpecOf(given);
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries') return countryMap() !== undefined;
  if (boundarySet === 'admin1') {
    if (admin1Index() === undefined) return false;
    const id = regionSetIdOf(spec);
    return id === undefined || regionSetOf(id) !== undefined;
  }
  // A custom set, once fetched and registered (T979).
  return regionSetOf(boundarySet) !== undefined;
}

/** Fetches and registers what the map draws, once. */
export async function loadMapBoundaries(given: RenderSpec): Promise<void> {
  if (mayBeAdmin1(given)) await loadAdmin1Index();
  const spec = mapSpecOf(given);
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries') {
    await loadCountryMap();
    return;
  }
  if (boundarySet === 'admin1') {
    await loadAdmin1Index();
    const id = regionSetIdOf(spec);
    if (id !== undefined) await loadAdmin1(id.slice('admin1:'.length));
    return;
  }
  await loadCustomSet(boundarySet.slice('custom:'.length));
}
