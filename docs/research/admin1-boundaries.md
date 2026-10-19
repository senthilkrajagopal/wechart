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

**Re-asserted against the pinned v5.1.2 GeoJSON (T975, 2026-10-18):** 4,596 features, but over **251** `adm0_a3` values, not 249; every per-country count above, Germany's 16 codes, 60 codes shared by more than one unit in a country, and UA-43/UA-40 under `adm0_a3 = RUS` all hold.

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

## ISO top tier: where Natural Earth's units dissolve (for R83, researched 2026-10-18)

ISO structure is from each country's `https://en.wikipedia.org/wiki/ISO_3166-2:XX` page (raw wikitext, fetched 2026-10-18; it carries the ISO OBP change log); ISO's own OBP is script-only. NE values are from the pinned GeoJSON (blob `4a8438f9…`), read with node. The only padded value in `region_cod`/`region`/`geonunit`/`iso_3166_2`/`gu_a3` is `"FR-IDF\t"` (8 features): trim all. English names are Wikipedia's.

**Dissolved, by NE field → ISO top-tier code (English name):**

- **FRA** by `region_cod` (12 metropolitan regions plus Corse; OBP 2020-11-24 FR-COR→FR-20R; OBP 2021-11-25 moved the overseas units to FR-971…976, top tier): FR-ARA Auvergne-Rhône-Alpes, FR-BFC Bourgogne-Franche-Comté, FR-BRE Brittany, FR-CVL Centre-Val de Loire, FR-COR→**FR-20R** Corsica, FR-GES Grand Est, FR-HDF Hauts-de-France, FR-IDF Île-de-France, FR-NOR Normandy, FR-NAQ Nouvelle-Aquitaine, FR-OCC Occitania, FR-PDL Pays de la Loire, FR-PAC Provence-Alpes-Côte d'Azur, FR-GUA→**FR-971** Guadeloupe, FR-MTQ→**FR-972** Martinique, FR-GUF→**FR-973** French Guiana, FR-LRE→**FR-974** Réunion, FR-MAY→**FR-976** Mayotte ([FR](https://en.wikipedia.org/wiki/ISO_3166-2:FR)).
- **ITA** by `region_cod`, already ISO (15 regions, 5 autonomous): IT-21 Piedmont, IT-23 Aosta Valley, IT-25 Lombardy, IT-32 Trentino-South Tyrol, IT-34 Veneto, IT-36 Friuli Venezia Giulia, IT-42 Liguria, IT-45 Emilia-Romagna, IT-52 Tuscany, IT-55 Umbria, IT-57 Marche, IT-62 Lazio, IT-65 Abruzzo, IT-67 Molise, IT-72 Campania, IT-75 Apulia, IT-77 Basilicata, IT-78 Calabria, IT-82 Sicily, IT-88 Sardinia ([IT](https://en.wikipedia.org/wiki/ISO_3166-2:IT)).
- **ESP** by `region_cod` (HASC; 17 autonomous communities, 2 cities): ES.AN→ES-AN Andalusia, ES.AR→ES-AR Aragon, ES.AS→ES-AS Asturias, ES.CB→ES-CB Cantabria, ES.CL→ES-CL Castile and León, ES.CM→ES-CM Castilla–La Mancha, ES.CN→ES-CN Canary Islands, ES.CT→ES-CT Catalonia, ES.EX→ES-EX Extremadura, ES.GA→ES-GA Galicia, ES.LO→**ES-RI** La Rioja, ES.MD→ES-MD Community of Madrid, ES.MU→**ES-MC** Region of Murcia, ES.NA→**ES-NC** Navarre, ES.PM→**ES-IB** Balearic Islands, ES.PV→ES-PV Basque Country, ES.VC→ES-VC Valencian Community; ES.CE splits by `region`: "Ceuta"→ES-CE Ceuta, "Melilla"→ES-ML Melilla ([ES](https://en.wikipedia.org/wiki/ISO_3166-2:ES)).
- **GBR** by `gu_a3` (3 countries, 1 province; GB-EAW/GBN/UKM are "for completeness" only): ENG→GB-ENG England, SCT→GB-SCT Scotland, WLS→GB-WLS Wales, NIR→GB-NIR Northern Ireland ([GB](https://en.wikipedia.org/wiki/ISO_3166-2:GB)).
- **BEL** by `geonunit` (3 regions over 10 provinces, OBP 2015-11-27): Flemish Region→BE-VLG Flanders, Walloon Region→BE-WAL Wallonia, Brussels Capital Region→BE-BRU Brussels ([BE](https://en.wikipedia.org/wiki/ISO_3166-2:BE)).
- **PHL** by `region_cod`, already ISO (17 regions): PH-00 National Capital Region, PH-01 Ilocos, PH-02 Cagayan Valley, PH-03 Central Luzon, PH-05 Bicol, PH-06 Western Visayas, PH-07 Central Visayas, PH-08 Eastern Visayas, PH-09 Zamboanga Peninsula, PH-10 Northern Mindanao, PH-11 Davao, PH-12 Soccsksargen, PH-13 Caraga, PH-14 Autonomous Region in Muslim Mindanao, PH-15 Cordillera Administrative Region, PH-40 Calabarzon, PH-41 Mimaropa. ISO's parents differ from NE's on 4 provinces (Lanao del Norte, Sarangani, South Cotabato, Basilan); `region_cod` is followed ([PH](https://en.wikipedia.org/wiki/ISO_3166-2:PH)).
- **LKA** by `region_cod`, already ISO (9 provinces): LK-1 Western, LK-2 Central, LK-3 Southern, LK-4 Northern, LK-5 Eastern, LK-6 North Western, LK-7 North Central, LK-8 Uva, LK-9 Sabaragamuwa ([LK](https://en.wikipedia.org/wiki/ISO_3166-2:LK)).
- **GNB** by `region_cod` (3 provinces, Bissau autonomous): GW-L East, GW-N North, GW-S South, GW-B→**GW-BS** Bissau ([GW](https://en.wikipedia.org/wiki/ISO_3166-2:GW)).
- **KNA** by `region_cod` (2 states): KN-K Saint Kitts, KN-N Nevis ([KN](https://en.wikipedia.org/wiki/ISO_3166-2:KN)).
- **GIN** by `region_cod`, `.`→`-` (7 regions, Conakry): GN-B Boké, GN-C Conakry, GN-D Kindia, GN-F Faranah, GN-K Kankan, GN-L Labé, GN-M Mamou, GN-N Nzérékoré ([GN](https://en.wikipedia.org/wiki/ISO_3166-2:GN)).
- **BFA** by `region` (13 regions): Boucle du Mouhoun BF-01, Cascades BF-02, Centre BF-03, Centre-Est BF-04, Centre-Nord BF-05, Centre-Ouest BF-06, Centre-Sud BF-07, Est BF-08, Hauts-Bassins BF-09, Nord BF-10, Plateau-Central BF-11, Sahel BF-12, Sud-Ouest BF-13; names as ISO's ([BF](https://en.wikipedia.org/wiki/ISO_3166-2:BF)).
- **MWI** by `iso_3166_2` (3 regions; NE's `region_cod` is wrong for Mangochi and Balaka): MW-C Central Region ← DE, DO, KS, LI, MC, NI, NK, NU, SA; MW-N Northern Region ← CT, LK, MZ, NB, RU; MW-S Southern Region ← BA, BL, CK, CR, MG, MH, MU, MW, NE, NS, PH, TH, ZO ([MW](https://en.wikipedia.org/wiki/ISO_3166-2:MW)).
- **BIH** by `geonunit`, Brčko by `iso_3166_2` (2 entities, 1 district; cantons deleted OBP 2015-11-27): "Bosnia and Herzegovina"→BA-BIH Federation of Bosnia and Herzegovina, "Republic Srpska"→BA-SRP Republika Srpska, iso BA-BRC→BA-BRC Brčko District ([BA](https://en.wikipedia.org/wiki/ISO_3166-2:BA)).
- **Partly** (an ISO autonomous region over some units, the rest top tier themselves): AZE `region_cod` AZ-10 → AZ-NX Nakhchivan ([AZ](https://en.wikipedia.org/wiki/ISO_3166-2:AZ)); IRQ `geonunit` "Iraqi Kurdistan" → IQ-KR Kurdistan (OBP 2022-03-03, [IQ](https://en.wikipedia.org/wiki/ISO_3166-2:IQ)); SRB `geonunit` "Vojvodina" → RS-VO Vojvodina ([RS](https://en.wikipedia.org/wiki/ISO_3166-2:RS)).

**ISO's top tier differs, and NE's units are kept** (lane CHARTS-B's call T975-1):
- Not a government tier: UGA (4 *geographical* regions), CPV (2 *geographical* regions), IDN (7 *geographical units*), DOM (10 planning regions, OBP 2014-10-29), IRL (4 provinces with no administrative role), MDG (6 provinces abolished in 2009) ([UG](https://en.wikipedia.org/wiki/ISO_3166-2:UG), [CV](https://en.wikipedia.org/wiki/ISO_3166-2:CV), [ID](https://en.wikipedia.org/wiki/ISO_3166-2:ID), [DO](https://en.wikipedia.org/wiki/ISO_3166-2:DO), [IE](https://en.wikipedia.org/wiki/ISO_3166-2:IE), [MG](https://en.wikipedia.org/wiki/ISO_3166-2:MG)).
- No NE field to dissolve by, or NE's units cross or are coarser than ISO's: NPL, MAR, CIV, LUX, KEN, STP, KIR.
- NE groupings that aren't ISO tiers and are never dissolved: AZE AZ-01…09 (economic regions), NZL NZ-N/NZ-S (deleted 2015), MDV provinces (removed by 2018), TZA Zanzibar, PRT NUTS-II, SOM Puntland, and the statistical `region` values of IND, USA, RUS, CHN, JPN and others.
- Stale codes in a same-tier country (Norway's pre-2020 counties, Mauritius's cities, Iceland's `IS-0`) stay as NE has them: no alias table (R83).

## Questions, closed (the user, 2026-10-18, round R83 in `docs/requirements-log.md`)

1. **Tier policy**: "ISO top tier (Recommended)". Régions, regions, autonomous communities and nations, dissolved from `region_cod`/`geonunit` (AC-622).
2. **Key formats**: "ISO + names (Recommended)". ISO 3166-2 codes plus English names (`name_en`, else `name`); `code_hasc`, `postal` and `fips` don't count (AC-623).
3. **Stale-code aliases**: not asked; no alias table is shipped, and a value under an old code is named as not placed, as AC-623 says.
4. **Disputed units**: "Natural Earth default (Recommended)". Natural Earth's default point of view, as shipped (so Crimea and Sevastopol stay in `adm0_a3 = RUS`'s file), noted in the map's text alternative (AC-629).
5. **Duplicates**: "Not placed, named (Recommended)". A value matching more than one region is not placed and is named as matching more than one region (AC-623); each duplicate-coded feature is keyed `~adm1_code`, drawn and never placed.
6. Lakes or plain, shapefile or GeoJSON: lane CHARTS-B's call (`docs/design/decisions-charts-b.md`, T975).
