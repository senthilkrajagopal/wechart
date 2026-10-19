/**
 * The Admin-1 boundary set (T975, AC-622, AC-624; R83): each country's ISO
 * 3166-2 top tier, from Natural Earth v5.1.2's 1:10m admin-1 units, derived
 * by `scripts/derive-admin1.mjs` into `admin1/‹ISO-3›.geo.json`, one file per
 * country, and `admin1/index.json`, every country's regions by key and
 * English name (research/admin1-boundaries.md).
 *
 * A map on Admin-1 is drawn by country: the one whose regions the values
 * name most, read from the index (90 kB) before that country's file is
 * fetched and registered with ECharts as its own map. A region is placed by
 * its ISO 3166-2 code or its English name; a `~` key is placed by its name
 * alone; a name two regions share matches both, and is never placed (R83).
 * Units Natural Earth gives one code are one region under it (T975-3).
 */
import { regionIndexOf, type RegionIndex } from '@wechart/core';

import { echarts } from '../echarts';
import { registerRegionSet, regionSetOf, type RegionSet } from './regionSets';

/** The feature property a region is keyed by in every country's file. */
export const ADMIN1_KEY = 'key';

/** Every country's regions: [key, English name, and any other value that names it]. */
export type Admin1Index = Readonly<Record<string, readonly (readonly string[])[]>>;

/** The ECharts map one country's Admin-1 regions are registered as. */
export const admin1MapName = (country: string) => `wechart-admin1-${country}`;

/** The id a country's Admin-1 set is registered under (`regionSets.ts`). */
export const admin1SetId = (country: string) => `admin1:${country}`;

let index: Admin1Index | undefined;
let indexLoading: Promise<Admin1Index> | undefined;
const byCountry = new Map<string, RegionIndex>();

/** A country's regions as its values name them, from the index. */
export function admin1RegionsOf(country: string, from: Admin1Index | undefined = index): RegionIndex | undefined {
  const regions = from?.[country];
  if (regions === undefined) return undefined;
  if (from === index && byCountry.has(country)) return byCountry.get(country);
  const made = regionIndexOf(
    regions.map(([key = '', name = '', alias]) => ({
      key,
      names: alias === undefined ? [name] : [name, alias],
    })),
  );
  if (from === index) byCountry.set(country, made);
  return made;
}

/** The index, registered: from the file, or a test's own. */
export function registerAdmin1Index(given: Admin1Index): Admin1Index {
  index = given;
  byCountry.clear();
  return given;
}

export function admin1Index(): Admin1Index | undefined {
  return index;
}

export function loadAdmin1Index(): Promise<Admin1Index> {
  indexLoading ??= import('./admin1/index.json').then(
    (module) => registerAdmin1Index(module.default as unknown as Admin1Index),
    (error: unknown) => {
      indexLoading = undefined;
      throw error;
    },
  );
  return indexLoading;
}

/**
 * The country a dimension's values are regions of: the one whose regions
 * they name, each exactly once, the most; none where they name none.
 * Ties go to the country first in ISO-3 order, so the choice is stable.
 */
export function admin1CountryOf(
  values: readonly unknown[],
  from: Admin1Index | undefined = index,
): string | undefined {
  if (from === undefined) return undefined;
  const distinct = [
    ...new Set(
      values.filter((value) => value !== null && value !== undefined && value !== '').map(String),
    ),
  ];
  let best: { country: string; placed: number } | undefined;
  for (const country of Object.keys(from).sort()) {
    const regions = admin1RegionsOf(country, from);
    if (regions === undefined) continue;
    const placed = distinct.filter((value) => regions.regionsOf(value).length === 1).length;
    if (placed > 0 && (best === undefined || placed > best.placed)) best = { country, placed };
  }
  return best?.country;
}

interface Admin1Features {
  readonly features: readonly {
    readonly properties: { readonly key: string; readonly name: string };
  }[];
}

/** One country's regions, registered with ECharts and as a region set. */
export function registerAdmin1(country: string, geoJSON: Admin1Features): RegionSet {
  // ECharts' own GeoJSON type asks for more than a feature's properties.
  echarts.registerMap(admin1MapName(country), { geoJSON } as unknown as Parameters<
    typeof echarts.registerMap
  >[1]);
  const features = geoJSON.features.map((feature) => feature.properties);
  return registerRegionSet(admin1SetId(country), {
    map: admin1MapName(country),
    nameProperty: ADMIN1_KEY,
    index:
      admin1RegionsOf(country) ??
      regionIndexOf(features.map(({ key, name }) => ({ key, names: [name] }))),
    noun: 'region',
    names: new Map(features.map(({ key, name }) => [key, name] as const)),
  });
}

const loading = new Map<string, Promise<RegionSet>>();

/** A country's regions, fetched and registered the first time they are asked for. */
export function loadAdmin1(country: string): Promise<RegionSet> {
  const registered = regionSetOf(admin1SetId(country));
  if (registered !== undefined) return Promise.resolve(registered);
  const pending =
    loading.get(country) ??
    import(`./admin1/${country}.geo.json`).then(
      (module: { default: Admin1Features }) => registerAdmin1(country, module.default),
      (error: unknown) => {
        loading.delete(country);
        throw error;
      },
    );
  loading.set(country, pending);
  return pending;
}
