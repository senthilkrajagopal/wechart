/**
 * The country map's boundaries (T398, AC-305): Natural Earth's admin-0
 * countries at 1:50m, v5.1.2, derived by `scripts/derive-countries.mjs` into
 * `countries-50m.geo.json`, each feature keyed by its ISO-3 code in `iso_a3`
 * (research/country-map.md, "Boundary data").
 *
 * Registered with ECharts once per page, under one name, before any map is
 * drawn: `setOption` throws on a map it doesn't know, and registration is the
 * module's, not an instance's (research, "Init / auth pattern"). The file is
 * 1.7 MB (570 kB gzipped), so it is its own chunk, fetched the first time a
 * map is drawn.
 */
import { echarts } from '../echarts';

export const COUNTRY_MAP = 'wechart-countries';

/** The feature property a region is keyed by. */
export const COUNTRY_KEY = 'iso_a3';

export interface CountryMap {
  /** The ISO-3 codes the map places: a key that isn't one (`~KOS`) is drawn, never placed. */
  readonly keys: ReadonlySet<string>;
  /** Each country's English name, by its key, for the tooltip. */
  readonly names: ReadonlyMap<string, string>;
}

interface CountryFeatures {
  readonly features: readonly {
    readonly properties: { readonly iso_a3: string; readonly name: string };
  }[];
}

const ISO = /^[A-Z]{3}$/;
let registered: CountryMap | undefined;
let loading: Promise<CountryMap> | undefined;

/** The boundaries, registered with ECharts. */
export function registerCountries(geoJSON: CountryFeatures): CountryMap {
  // ECharts' own GeoJSON type asks for more than a feature's properties.
  echarts.registerMap(COUNTRY_MAP, { geoJSON } as unknown as Parameters<
    typeof echarts.registerMap
  >[1]);
  const features = geoJSON.features.map((feature) => feature.properties);
  registered = {
    keys: new Set(features.map((each) => each.iso_a3).filter((key) => ISO.test(key))),
    // A key's first feature names it: Australia, before the territories it
    // shares its code with (T398's review).
    names: new Map(features.toReversed().map((each) => [each.iso_a3, each.name] as const)),
  };
  return registered;
}

/** The boundaries as registered, or none before they are. */
export function countryMap(): CountryMap | undefined {
  return registered;
}

/** The boundaries, fetched and registered the first time they are asked for. */
export function loadCountryMap(): Promise<CountryMap> {
  loading ??= import('./countries-50m.geo.json').then(
    (module) => registerCountries(module.default as CountryFeatures),
    (error: unknown) => {
      // Asked again next time, rather than failing every map until a reload.
      loading = undefined;
      throw error;
    },
  );
  return loading;
}
