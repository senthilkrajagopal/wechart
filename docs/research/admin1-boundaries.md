---
packages: []
version: 'Natural Earth vector v5.1.2 (git tag v5.1.2, 2022-05-13), theme ne_10m_admin_1_states_provinces (theme version 5.1.1)'
researched: 2026-10-18
---

# Admin-1 boundary dataset

For T975 (AC-624, AC-622's "Admin-1, by country" boundary set) and T974 (AC-623's region keys): a first-level subdivision dataset (states, provinces, Länder) to ship with the app, keyed as a business table would hold it. Read `country-map.md` first: the Countries set is Natural Earth too, derived by `packages/charts/scripts/derive-countries.mjs`.

Counts marked **(Mirror)** come from a third-party ArcGIS Online copy of `ne_10m_admin_1_states_provinces` (the `Esri_SDI` account's FeatureServer), queried because the 40.7 MB source file is past the research tool's fetch limit. Its fields include `FCLASS_TLC`, which Natural Earth added in 5.1.0 ([CHANGELOG](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/CHANGELOG)), so it is at least 5.1.0. **The derive script's tests must re-assert every (Mirror) figure against the pinned v5.1.2 file.**

## Recommendation

1. **Vendor Natural Earth 1:10m `ne_10m_admin_1_states_provinces` from tag v5.1.2.** Public domain, so bundling in a commercial product carries no attribution or share-alike duty ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)); "all but a few tiny countries", "over 4,500" units ([10m page](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)); the Countries set's source and licence.
2. **Key each feature by `iso_3166_2`** (`DE-BY`), under the keying rules below.
3. **One file per parent country**, keyed by its ISO 3166-1 alpha-3: simplify the whole world once with mapshaper *before* splitting, so shared borders are simplified once and stay gap-free; lazy-load each file and register it as its own ECharts map.
4. **Not 1:50m**: its admin-1 covers only AUS, BRA, CAN, USA, CHN, IND, IDN, RUS and ZAF (grep of the v5.1.2 50m `.dbf`'s `adm1_code`) — no Germany or France.

Rejected: GADM ("Redistribution or commercial use is not allowed without prior permission", [licence](https://gadm.org/license.html)); geoBoundaries (licences per country, including CC BY-SA 2.0 for Austria, required attribution, and "ADM1" tiers that differ: Italy 5 macro-regions, the UK 4 nations; e.g. [DEU](https://www.geoboundaries.org/api/current/gbOpen/DEU/ADM1/), [AUT](https://www.geoboundaries.org/api/current/gbOpen/AUT/ADM1/)); Overture divisions (ODbL share-alike, [attribution](https://docs.overturemaps.org/attribution/)).

## Source files at tag v5.1.2

| File | Bytes | Git blob |
|---|---|---|
| `geojson/ne_10m_admin_1_states_provinces.geojson` | 40,726,851 | `4a8438f98ac7dfec7dc1739b1eaf91398ad33f22` |
| `geojson/ne_10m_admin_1_states_provinces_lakes.geojson` (large lakes erased) | 41,037,472 | `c4a7366cd343d5e3df150c048e0a4e0f3bf02b1b` |
| `10m_cultural/ne_10m_admin_1_states_provinces.shp` | 20,998,780 | `f97a631c6784f4097304a83668df51ec803b0072` |
| `10m_cultural/ne_10m_admin_1_states_provinces.dbf` | 15,161,514 | `83821576779dd93b32ab6b56993071f3ce1ba0cb` |

Source: [contents API at v5.1.2](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson?ref=v5.1.2); raw files at `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/<path>`. The plain GeoJSON wasn't regenerated at 5.1.1, while the shapefile `.dbf` was (`e08a35c8`, 2022-05-09; [commits](https://api.github.com/repos/nvkelso/natural-earth-vector/commits?path=10m_cultural/ne_10m_admin_1_states_provinces.dbf&sha=v5.1.2&per_page=3)); deriving from the shapefile set avoids the question. Build tool: `mapshaper` 0.7.90, MPL-2.0 ([registry](https://registry.npmjs.org/mapshaper/latest)), as a dev-time CLI (importing it would need it in this doc's `packages:`).

## ECharts: one map per country

- `registerMap` keeps each resource in a module-level map keyed by its name; registering a name again replaces it; there is no unregister (`echarts@6.1.0/lib/coord/geo/geoSourceManager.js` L47–121).
- `nameProperty` picks the key property: `new GeoJSONRegion(properties[nameProperty || 'name'], …)` (`lib/coord/geo/parseGeoJson.js` L142); parsing is cached per resource and `nameProperty` (`lib/coord/geo/GeoJSONResource.js` L65–74). Matching is exact and case-sensitive (`country-map.md`).
- `specialAreas` (insets such as Alaska and Hawaii) is looked up by region name, so `'US-AK'`, `'US-HI'` (`GeoJSONResource.js` L109–112); how it behaves under the equal-area `projection` AC-622 asks for is unverified.
- Never name a map `'china'` (ECharts' built-in fixes key on it); no `Point` or `GeometryCollection` features; `properties.echartsStyle` is reserved (`country-map.md`).

## Properties wechart reads

| Need | Property | Example (Germany) | Notes |
|---|---|---|---|
| ISO 3166-2 key | `iso_3166_2` | `DE-BY` | NE placeholders: `??-X**~` where ISO lists none; `-99-X**~` where the country has no ISO code ([CHANGELOG 4.0.0](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/CHANGELOG)) |
| Parent country | `adm0_a3` (NE's code) | `DEU` | No ISO alpha-3 field in admin-1; NE codes differ from ISO for `SDS`, `PSX`, `SAH`, `KOS` (Mirror): map through the admin-0 rule (`ISO_A3`, else `ISO_A3_EH`), as `derive-countries.mjs` does |
| Other keys a table may hold | `code_hasc` `DE.BY`, `fips` `GM02`, `postal` `BY`, `name` `Bayern`, `name_en` | (Mirror) | `postal` is unique only within a country and wrong for Brandenburg (`BE`, as Berlin; Mirror) |
| Higher grouping | `region`, `region_cod`; `geonunit`, `gu_a3` | France `FR-ARA`; UK `England`/`ENG` | lets France dissolve into régions and the UK into nations |

Germany's 16 codes, complete: DE-BW, DE-BY, DE-BE, DE-BB, DE-HB, DE-HH, DE-HE, DE-MV, DE-NI, DE-NW, DE-RP, DE-SL, DE-SN, DE-ST, DE-SH, DE-TH (Mirror). Feature counts (Mirror): 4,596 over 249 `adm0_a3`; USA 51 (50 states and `US-DC`), IND 36, BRA 27, CHN 32, POL 16, FRA 101, ITA 110, ESP 52, GBR 232, JPN 47, MEX 33, CAN 13, AUS 11.

## Keying rules for the derived files

1. Key = `iso_3166_2` where it matches `^[A-Z]{2}-[A-Z0-9]{1,3}$` and is unique in its country's file; otherwise `~` + `adm1_code`, drawn but never placed (the Countries set's `~KOS` rule).
2. Duplicates (`PH-MNL` ×17, `BA-BIH` ×9, about 60 codes in all; Mirror; upstream [#745](https://github.com/nvkelso/natural-earth-vector/issues/745)) merge into one region in ECharts (`country-map.md`): each either keyed `~adm1_code` or kept as one placed region — a pinned list either way.
3. Parent ISO-3 through the admin-0 rule. Crimea (`UA-43`) and Sevastopol (`UA-40`) are under `adm0_a3 = RUS` (Mirror): splitting by `adm0_a3` puts them in Russia's file, by the code's prefix in Ukraine's — a policy.
4. Tooltip name: `name_en`, else `name`.

## Gotchas

- **Several countries' admin-1 is a lower tier**: France 101 départements, Italy 110 provinces, Spain 50 provinces plus Ceuta and Melilla, the UK 232 local authorities (Mirror). NE won't change it ([#1003](https://api.github.com/repos/nvkelso/natural-earth-vector/issues/1003), closed not planned). A France-by-région map needs a dissolve on `region_cod` and `FR-COR` remapped to `FR-20R`.
- **Stale codes**: Poland's letter codes (ISO numeric since 2018), Czechia ([#676](https://github.com/nvkelso/natural-earth-vector/issues/676)), France's Paris and overseas codes ([#904](https://github.com/nvkelso/natural-earth-vector/issues/904)), and others open upstream. Current codes in a business table then fail to place, which AC-623 names under the map.
- 188 features carry unusable codes (`~`, `-99`, empty; Mirror).
- NE hasn't released since 2022-05-13 ([releases](https://api.github.com/repos/nvkelso/natural-earth-vector/releases?per_page=3)); Germany's Amt Neuhaus is in the wrong Land ([#1000](https://github.com/nvkelso/natural-earth-vector/issues/1000)).
- 10m admin-1 coastlines don't match the 50m Countries outlines; irrelevant while Admin-1 is drawn by country.
- Per-country sizes at a chosen simplification are unmeasured: the derive step must print and its test bound them (the Countries file is 1.7 MB, 570 kB gzipped).

## Attribution

None required: "All versions of Natural Earth raster + vector map data found on this website are in the public domain." The optional credit is "Made with Natural Earth." ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)).

## Open questions (for the user and the spec)

1. **Tier policy**: does "Admin-1" mean NE's units (départements, provinces, councils) or the ISO top tier (régions, regions, autonomous communities, nations), dissolved from `region_cod` and `geonunit`?
2. **Key formats**: ISO 3166-2 only, or also `code_hasc`, `postal`, `fips` or English names?
3. **Stale-code aliases**: ship a table of known ISO changes, or name such values as unplaced?
4. **Disputed units** (Crimea, Sevastopol, Kosovo, Western Sahara, the `-99` entities): which file, if any.
5. **Duplicates**: one placed region, or all unplaceable?
6. Lakes or plain variant; shapefile or GeoJSON as the source.
