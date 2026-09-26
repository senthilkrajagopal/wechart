---
library: ECharts map series + world boundaries
packages: [echarts, echarts/core, echarts/charts, echarts/components, d3-geo, i18n-iso-countries]
version: 'echarts 6.1.0; Natural Earth vector v5.1.2 (public-domain data, vendored, not an npm package); d3-geo 3.1.1 (optional: equal-area projection); i18n-iso-countries 7.14.0 (optional: ISO 3166-1 alpha-3 list)'
researched: 2026-09-25
sources:
  [
    https://echarts.apache.org/en/api.html#echarts.registerMap,
    https://echarts.apache.org/en/option.html#series-map,
    https://echarts.apache.org/en/option.html#visualMap-continuous,
    https://echarts.apache.org/en/option.html#visualMap-piecewise,
    https://echarts.apache.org/en/option.html#aria,
    https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/series/map.md,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/,
    https://echarts.apache.org/handbook/en/basics/release-note/v5-upgrade-guide/,
    https://github.com/nvkelso/natural-earth-vector/releases/tag/v5.1.2,
    https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/CHANGELOG,
    https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/LICENSE.md,
    https://www.naturalearthdata.com/about/terms-of-use/,
    https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/,
    https://github.com/topojson/world-atlas,
    https://d3js.org/d3-geo/projection,
    https://d3js.org/d3-geo/cylindrical,
    https://github.com/michaelwittig/node-i18n-iso-countries,
    https://docs.cube.dev/reference/data-modeling/dimensions,
  ]
---

# Country map: ECharts 6.1.0 `map` series + Natural Earth v5.1.2 admin-0 boundaries

Abbreviations used in citations:
- **EC/** = the installed package, `/Users/srajagopal/Work/wechart/node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/`. I read these files for this doc.
- **ZR/** = `/Users/srajagopal/Work/wechart/node_modules/.pnpm/zrender@6.1.0/node_modules/zrender/`.
- **NE** = Natural Earth.

## Summary

wechart needs one chart type, a country-level choropleth, to cover **AC-305**. The two Superset Northwind panels it reproduces are "Revenue by Customer Country" (`revenue` per `customer_country_iso3`) and "Orders by Ship Country" (`orders` per `ship_country_iso3`) ([superset-parity.md §2](/Users/srajagopal/Work/wechart/docs/design/superset-parity.md)). The requirement is R8 / §P2.6 H ([requirements.md](/Users/srajagopal/Work/wechart/docs/requirements.md)).

- **Renderer.** ECharts 6.1.0 already draws wechart's charts ([echarts.md](/Users/srajagopal/Work/wechart/docs/research/echarts.md)). It has a first-party `map` series. The series takes GeoJSON registered with `echarts.registerMap` and keys regions by any feature property through `nameProperty`. It is coloured by a `visualMap` component, which also draws the legend ([API: registerMap](https://echarts.apache.org/en/api.html#echarts.registerMap); [geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md); [map.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/map.md)). No new renderer is needed.
- **Boundaries.** I recommend Natural Earth admin-0 countries from the v5.1.2 tag of `nvkelso/natural-earth-vector`, which is public domain ([LICENSE.md](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/LICENSE.md); [terms of use](https://www.naturalearthdata.com/about/terms-of-use/)).
  - Vendor it, and derive a slim GeoJSON keyed by ISO 3166-1 alpha-3.
  - Key on `ISO_A3` with a fallback to `ISO_A3_EH`. Plain `ISO_A3` is `-99` for France and Norway, and Northwind data contains both (details under "Boundary data").
- **Rejected alternative.** `world-atlas` 2.0.2 is built from NE 4.1.0 and keys countries by ISO *numeric* codes ([README](https://github.com/topojson/world-atlas)). Rejected on technical grounds; see Alternatives.
- **Unplaced codes.** ECharts does not report data names that match no region; wechart must compute them itself (details under "Detecting unplaced codes").
- **Nothing in Cube marks a dimension as ISO-3.** Cube's only geographic type is `geo`, which is latitude/longitude. String dimension formats are only `imageUrl` and `link` ([Cube dimensions](https://docs.cube.dev/reference/data-modeling/dimensions)). Detection is therefore a wechart design decision; see "Recommender".

## Install

- **ECharts.** Already a dependency of `@wechart/charts` at `6.1.0` ([packages/charts/package.json](/Users/srajagopal/Work/wechart/packages/charts/package.json)). Nothing to install.
  - `MapChart` must be added to the `echarts.use([...])` set in [packages/charts/src/echarts.ts](/Users/srajagopal/Work/wechart/packages/charts/src/echarts.ts), and also in the SSR test harness [renderToSvg.ts](/Users/srajagopal/Work/wechart/packages/charts/src/testing/renderToSvg.ts).
  - `MapChart` is exported from `echarts/charts` (EC/lib/export/charts.js L54). Its installer calls `use(installGeo)`, so the geo component and `registerMap` come with it (EC/lib/chart/map/install.js L51-57; EC/lib/component/geo/install.js L60).
- **Boundary data.** No package. Vendor the upstream file from the tag and record its provenance:
  - `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson`: 838,726 bytes, git blob SHA `1e6ab74c7042f97013be69ceec798be8e1aff27d` ([contents API](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_110m_admin_0_countries.geojson?ref=v5.1.2)).
  - 50m alternative: 3,083,490 bytes, blob SHA `9d99f26dc470fcdbd08b062c813005acbdf73ccb` ([contents API](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_50m_admin_0_countries.geojson?ref=v5.1.2)).
- **Optional, only if an equal-area projection is chosen:** `pnpm add d3-geo@3.1.1 --filter @wechart/charts`.
  - Licence ISC for d3-geo, plus MIT for its embedded GeographicLib portion ([LICENSE](https://unpkg.com/d3-geo@3.1.1/LICENSE)).
  - `"type": "module"`, `sideEffects: false`, one dependency: `d3-array` `2.5.0 - 3` ([package.json](https://unpkg.com/d3-geo@3.1.1/package.json)).
- **Optional, only if the ISO list comes from a package:** `pnpm add i18n-iso-countries@7.14.0`.
  - MIT; one dependency, `diacritics` 1.3.0 (MIT) ([package.json](https://unpkg.com/i18n-iso-countries@7.14.0/package.json); [diacritics](https://registry.npmjs.org/diacritics/1.3.0)).
  - It is CommonJS: `main: entry-node`, `browser: index`, no `exports` or `type` field ([package.json](https://unpkg.com/i18n-iso-countries@7.14.0/package.json)).

## Init / auth pattern

No auth. Three rules come from the source:

1. **`registerMap` is a silent no-op until `MapChart` (or `GeoComponent`) has been `use`d.** `echarts.registerMap` calls `getImpl('registerMap')` and does nothing if it is missing (EC/lib/core/echarts.js L2409-2412). The API doc says the same: "Starting from v5.3.0 … `registerMap` cannot be called unless `MapChart` or `GeoComponent` is imported" ([api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md); [5.3 notes](https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/)).
2. **`setOption` throws if the map name is not registered yet.** `MapSeries.getInitialData` reads `geoSource.regions` from `geoSourceManager.load(...)`, which returns `undefined` for an unknown map (EC/lib/chart/map/MapSeries.js L81-82; EC/lib/coord/geo/geoSourceManager.js L111-119). `Geo` then dereferences `resource.type` (EC/lib/coord/geo/Geo.js L72-76). A tile must therefore await the loader before its first `setOption`.
3. **Registration is global to the module, not per instance.** Resources live in one module-level `storage` hash map (EC/lib/coord/geo/geoSourceManager.js L47, L79-98). Register once per page and share it across tiles. Registering the same name again replaces the resource, and parsing is cached per resource and `nameProperty` (EC/lib/coord/geo/GeoJSONResource.js L65-74).

A sketch for Vite + React. The file names are wechart's to choose.

```ts
// packages/charts/src/echarts.ts — add to the existing registration set
import { MapChart } from 'echarts/charts';
echarts.use([/* existing… */ MapChart]);

// packages/charts/src/geo/countryMap.ts
import countriesUrl from './countries-110m.geo.json?url'; // hashed asset URL (Vite)
import { echarts } from '../echarts';

export const COUNTRY_MAP = 'wechart-countries';
let loading: Promise<{ keys: ReadonlySet<string>; names: ReadonlyMap<string, string> }> | undefined;

export function loadCountryMap() {
  loading ??= fetch(countriesUrl)
    .then((r) => { if (!r.ok) throw new Error(`country boundaries: HTTP ${r.status}`); return r.json(); })
    .then((geo: { features: { properties: { iso_a3: string; name: string } }[] }) => {
      echarts.registerMap(COUNTRY_MAP, { geoJSON: geo as never });
      const keys = new Set(geo.features.map((f) => f.properties.iso_a3).filter((k) => /^[A-Z]{3}$/.test(k)));
      const names = new Map(geo.features.map((f) => [f.properties.iso_a3, f.properties.name] as const));
      return { keys, names };
    });
  return loading;
}
```

- **`?url` returns a URL.** A `.json?url` import returns the file's URL and does not parse it ([Vite playground, v8](https://github.com/vitejs/vite/blob/v8.0.10/playground/json/index.html)). Imported assets larger than `assetsInlineLimit` (default 4096 bytes) get hashed filenames ([Vite assets](https://vite.dev/guide/assets)).
- **Caching and compression.** wechart's nginx config serves `/assets/` with `Cache-Control: public, max-age=31536000, immutable` and gzips `application/json` ([nginx.md L89-91, L131](/Users/srajagopal/Work/wechart/docs/research/nginx.md)).
- **Alternative loader.** A dynamic `import('./countries.geo.json')` also lazy-loads. Vite turns JSON over 10 kB into `export default JSON.parse("…")` (`json.stringify: 'auto'`) and adds named exports by default (`json.namedExports: true`) ([Vite shared options](https://vite.dev/config/shared-options.html)).
- **Tests.** The charts package's tests render with SSR in Node ([renderToSvg.ts](/Users/srajagopal/Work/wechart/packages/charts/src/testing/renderToSvg.ts)). They should import the JSON directly and call `registerMap`, not fetch a `?url` path. UNVERIFIED: how Vitest 5 resolves a `?url` import inside `packages/charts`; I did not test it.
- `optionFor` is synchronous ([optionFor.ts](/Users/srajagopal/Work/wechart/packages/charts/src/optionFor.ts)). The key set from the loader (for unplaced codes) must be passed in, and `ChartCanvas` must await the loader before `setOption` ([ChartCanvas.tsx L390-391](/Users/srajagopal/Work/wechart/packages/web/src/tiles/ChartCanvas.tsx)).

## API surface we will use

### `echarts.registerMap(mapName, opt)`

- **Signature:** `(mapName, { geoJSON, specialAreas? })`, `(mapName, { svg })`, or the legacy `(mapName, geoJSON, specialAreas?)`. `geoJSON` may be an object or a JSON string ([api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md)). SVG sources arrived in v5.1.0 (same doc). Types: `GeoJSONSourceInput = string | GeoJSON | GeoJSONCompressed` (EC/types/dist/shared.d.ts L4076).
- **Features that are dropped.** A feature with no `geometry` or no `properties`, or with empty `coordinates`, is filtered out. Only `Polygon`, `MultiPolygon`, `LineString` and `MultiLineString` produce geometry (EC/lib/coord/geo/parseGeoJson.js L113-145).
  - A `Point` feature gives a region with no geometry, so tiny-country *points* must not go into the registered map.
  - `GeometryCollection` has no `coordinates`, so reading `.coordinates.length` would throw, surfacing as "Invalid geoJson format" (EC/lib/coord/geo/GeoJSONResource.js L96-101). This is an inference from the code, not tested.
- **`properties.cp`.** It sets the region centre, which is used for labels and for the tooltip anchor (EC/lib/coord/geo/parseGeoJson.js L142; the API doc's sample GeoJSON includes `"cp"`, [api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md)). Without it, the centre is the centroid of the polygon with the most points (EC/lib/coord/geo/Region.js L139-156).
- **`properties.echartsStyle` is reserved.** It is merged into the data item as region style (EC/lib/chart/map/MapSeries.js L86-96), a feature added in 5.6.0 ("Support styling region in original GeoJSON data", [changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). The derived file must not emit that key.
- **Map names that trigger built-in fixes.** The fixes apply only to `mapName === 'china'` (EC/lib/coord/geo/fix/nanhai.js L59, textCoord.js L54, diaoyuIsland.js L50). The `'world'` fixer exists but nothing calls it (EC/lib/coord/geo/fix/geoCoord.js; no import found under EC/lib). Any name is safe, but avoid `'china'`.
- **`echarts.getMap(name)`** returns `{ geoJson, geoJSON, specialAreas }` for GeoJSON maps (EC/lib/coord/geo/geoSourceManager.js L106-110; EC/lib/core/echarts.js L2413-2416).

### `series-map`, the options wechart sets

These are the documented options, with the 6.1.0 source defaults (EC/lib/chart/map/MapSeries.js L188-258):

| Option | Default in 6.1.0 source | wechart setting | Why |
|---|---|---|---|
| `map` | `''` | the registered name | Required ("map should be explicitly specified since ec3", same file) |
| `nameProperty` (since 4.8.0) | `'name'` | the derived file's key, e.g. `'iso_a3'` | "Customized property key for GeoJSON feature" ([geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md)) |
| `data` | — | `[{ name: 'FRA', value: 123 }, …]` | `name` is matched exactly against the region key: a hash-map lookup plus `===` in `indexOfName` (MapSeries.js L75-97; EC/lib/data/SeriesData.js L563-570) |
| `selectedMode` | **`true`** | `false` | Clicking selects a region and repaints it with `select.itemStyle.color` (the theme highlight colour, MapSeries.js L248-256). That conflicts with wechart's own marking |
| `showLegendSymbol` | `true` | `false` | With any `legend` component in the option, a dot is drawn on every region (EC/lib/chart/map/MapView.js L84). Open bug [#20464](https://github.com/apache/echarts/issues/20464), "unwanted dots with legend option" |
| `itemStyle.areaColor` | theme background | wechart's "no data" neutral | Regions with no value keep this fill (see visualMap below) |
| `emphasis` | label shown; `itemStyle.areaColor` = highlight | `label.show: false`; either `emphasis.disabled: true`, or `itemStyle: { areaColor: null, color: null, … }` | By default, hovering shows the region *name* (the ISO code) and replaces the fill. The source says: "If user want the color not to be changed when hover, they should both set areaColor and color to be null" (EC/lib/component/helper/MapDraw.js L72-73). `emphasis.disabled` and `select.disabled` are documented for map ([map.md include list](https://github.com/apache/echarts-doc/blob/master/en/option/series/map.md)) |
| `roam` | not set (off) | off | Enabled only with `roam: true` ([geo-svg tutorial](https://github.com/apache/echarts-doc/blob/master/en/tutorial/geo-svg.md)) |
| `aspectScale` | 0.75 for GeoJSON | leave, or set a `projection` | With no projection, "pixelWidth / pixelHeight = lngSpan / latSpan * aspectScale" ([geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md)). Ignored when a projection is set (Geo.js L115) |
| `left/top/right/bottom` or `layoutCenter`+`layoutSize` | `left: 'center', top: 'center'` | leave room for the visualMap | The map is box-laid-out and keeps its aspect (EC/lib/coord/geo/geoCreator.js L100-141) |

**Duplicate codes in the data are combined, not rejected.** The statistic stage groups values by name across the data and applies `mapValueCalculation` ("sum", "average", "max", "min", [map.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/map.md)). With it unset, the code path is `sum` (EC/lib/chart/map/mapDataStatistic.js L48-82). Summing an average measure is wrong, so wechart must pass one row per code.

**Regions with no data are added to the data.** `getInitialData` appends every region the data doesn't name as `{ name }`, with `NaN` as its value (MapSeries.js L81-102). Data items whose name matches no region stay in the data with no graphic. They are the unplaced codes, and ECharts says nothing about them.

### `visualMap`: the sequential scale and the legend

Use a continuous visualMap. The piecewise variant is an alternative; the choice between them is an open question.

```ts
visualMap: {
  type: 'continuous',
  show: true,                        // AC-305 requires a legend
  seriesIndex: 0,
  min, max,                          // from the data: the defaults are 0 and 200
  calculable: false,                 // no drag handles
  inRange: { color: [...SEQUENTIAL] },  // ['#cde2fb', '#0d366b'], direction.md §5
  text: [format(max), format(min)],  // text[0] is the HIGH end
  formatter: (v: number) => format(v),  // hover indicator text
  orient: 'horizontal', left: 'center', bottom: 0,
}
```

- **`min`/`max` default to 0 and 200.** They are not taken from the data (EC/lib/component/visualMap/VisualMapModel.js L425-452). The continuous doc says to specify them explicitly ([visual-map-continuous.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/visual-map-continuous.md)).
- **No numbers appear unless you ask for them.** End labels come only from `text` (`_renderEndsText` returns early with no `text`; "text[0] map to high value", EC/lib/component/visualMap/ContinuousView.js L104-123). Handle labels exist only when `calculable` is on (same file, L169-175). A continuous visualMap without `text` and without `calculable` is a bare gradient with no values.
- **`formatter`** can be a string with `{value}` or a function. With a function it is called for the handle labels and the hover indicator (EC/lib/component/visualMap/VisualMapModel.js L184-217; ContinuousView.js L445, L483).
- **`precision` defaults to 0.** That only matters where the label isn't formatted by us (VisualMapModel.js L448).
- **Hover link.** `hoverLink` (default on) highlights regions whose values fall under the pointer on the bar, and moves an indicator when a region is hovered (ContinuousView.js L543-618).
- **New options.** 6.0.0 added `unboundedRange` and 6.1.0 added `seriesTargets` ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- **Precedent.** heatmap.ts already uses a hidden visualMap with the same ramp ([heatmap.ts](/Users/srajagopal/Work/wechart/packages/charts/src/series/heatmap.ts)). For the map it must be `show: true`.

**How a no-data region (value `NaN`) is painted.** This is read from the source across several files; confirm it with the render test.
1. Continuous `getValueState` treats a value as `inRange` whenever `unboundedRange` (default `true`) holds and the range covers the extent (EC/lib/component/visualMap/ContinuousModel.js L136-141).
2. Linear colour mapping of `NaN` goes through `zrColor.fastLerp`, which returns `undefined` for a normalised value outside 0..1. `stringify(undefined)` is `undefined` (EC/lib/visual/VisualMapping.js L247-250; ZR/lib/tool/color.js L323-327, L386-389).
3. `MapDraw` copies the visual fill only when it is truthy (`if (isVisualEncodedByVisualMap && style.fill)`). Otherwise the region keeps `itemStyle.areaColor` (EC/lib/component/helper/MapDraw.js L445-453).
4. Result: no-data regions draw in `itemStyle.areaColor`.

**Piecewise mode behaves differently.**
- A `NaN` matches no piece, so it is `outOfRange` (EC/lib/component/visualMap/PiecewiseModel.js L186-189).
- With no `outOfRange` given, ECharts fills in *transparent* colour plus opacity `[0, 0]` (VisualMapModel.js L320-341; EC/lib/visual/visualDefault.js L58-82). No-data countries would then vanish.
- Set `outOfRange: { color: NO_DATA }` explicitly.
- Piecewise `selectedMode` defaults to `'multiple'`, so clicking a legend piece hides that class ([visual-map-piecewise.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/visual-map-piecewise.md)). Set it to `false` if the legend must not filter.
- Related open report: [#20892](https://github.com/apache/echarts/issues/20892), "unwanted blue background for unmatched data" (5.6.0).

**The per-item fill can't be overridden while visualMap is on.** The visual fill replaces `itemStyle.areaColor`; border, opacity and decal survive (MapDraw.js L426-467). Marking a country therefore has to use `itemStyle.borderColor/borderWidth/opacity`, not fill. That matches direction.md's outline-plus-fade treatment ([direction.md §5](/Users/srajagopal/Work/wechart/docs/design/direction.md)).

### Tooltip

- **Defaults.** `trigger: 'item'`. The map series' default tooltip shows the region name and value (EC/lib/chart/map/MapSeries.js L146-167), and its anchor is the region centre (L60-67). On a no-data region the value is `NaN`.
- **Build a map tooltip in `tooltipFor`.** Heading: the country's display name, looked up by `params.name` (the ISO key) from the boundary file's name property. Then the measure through `formatterFor`. Write "No data" for `NaN`.
- **Escape HTML.** The existing helper escapes values because "ECharts' tooltip formatter returns raw HTML" ([tooltip.ts L33-40](/Users/srajagopal/Work/wechart/packages/charts/src/tooltip.ts); echarts.md Gotchas cite the 6.1.0 XSS fix).

### Projection (optional)

- **Option shape.** `projection: { project(coord), unproject(point), stream? }`, since 5.3.0. "Custom projections are only useful when using GeoJSON" ([geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md)). The d3 wiring shown in the 5.3 notes is `{ project: p => projection(p), unproject: p => projection.invert(p) }` ([5.3 notes](https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/)).
- **`stream`.** ECharts' own test page also passes `stream: projection.stream` ([test/map-projection-d3.html](https://github.com/apache/echarts/blob/master/test/map-projection-d3.html)). When `stream` is given, MapDraw projects whole rings through it, which enables d3's antimeridian clipping and resampling (MapDraw.js L163-172, L580-617).
- **Screen-down y.** With a projection, ECharts stops inverting latitude (`invertLongitute = projection ? false : …`, Geo.js L79). A hand-written `project` must therefore return y increasing downward, as the doc's Mercator example does with its leading minus sign ([5.3 notes](https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/)). d3 projections already output screen coordinates ([d3 projection](https://d3js.org/d3-geo/projection)).
- **Candidates.**
  - `geoEqualEarth()` is "an equal-area projection, by Bojan Šavrič et al., 2018".
  - `geoNaturalEarth1()` "is neither conformal nor equal-area" ([d3 cylindrical](https://d3js.org/d3-geo/cylindrical)).
  - Esri describes Equal Earth as "appropriate for small-scale mapping, especially for thematic world maps illustrating area characteristics" ([ArcGIS Pro](https://pro.arcgis.com/en/pro-app/3.4/help/mapping/properties/equal-earth.htm)).
  - A 2020 study states: "Choropleth maps … require an equal-area projection" ([arXiv 2008.13592](https://arxiv.org/abs/2008.13592)).
  - ECharts' default (raw lon/lat with `aspectScale` 0.75) is not equal-area. That is an inference from the formula in [geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md).
- **`center` must be in projected coordinates** when a projection is set (EC/types/dist/shared.d.ts L4465-4471).
- **Production skips the projection checks.** The SVG-source and missing-`unproject` checks run only outside production (Geo.js L84-98).

### SVG renderer and the tests

- **How a region is drawn.** Each region becomes a zrender `CompoundPath` of `Polygon` subpaths (MapDraw.js L207-250). wechart's `SVGRenderer` emits it as SVG `<path>`s. ECharts' handbook says the two renderers are "generally … interchangeable"; only effects such as trails and heatmap blending need canvas ([canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)).
- **A test hook exists under SSR.** With `ssr: true`, every element with a `dataIndex` gets `ecmeta_series_index`, `ecmeta_data_index` and `ecmeta_ssr_type` attributes (EC/lib/core/echarts.js L312-324; ZR/lib/svg/graphic.js L45; ZR/lib/svg/core.js L7).
  - Each region group's children receive the data index through `setItemGraphicEl` → `setCommonECData` (EC/lib/data/SeriesData.js L845-849; EC/lib/util/innerStore.js L46-65).
  - An AC-305 test can therefore find each data code's `<path ecmeta_data_index="i">` and assert that its fill is on the ramp, not the no-data colour.
  - The data rows occupy indices `0…n-1` in the order passed; the appended no-data regions follow (MapSeries.js L76-101).
- **Ramp colours are written as `rgba(…)` strings** by the linear mapping (VisualMapping.js L249). The existing `cellsOf` helper matches fills starting `rgb(` ([renderToSvg.ts L117-125](/Users/srajagopal/Work/wechart/packages/charts/src/testing/renderToSvg.ts)). UNVERIFIED: whether zrender's SVG output rewrites `rgba` into `rgb` plus `fill-opacity`. Check it in the first test.
- **The path walker can read map outlines.** Region paths are polygons, so they contain only `M`/`L`/`Z` and fit `renderToSvg`'s `outline()` walker. That is an inference from `Polygon` shapes; not tested.

### Accessibility

- **ECharts `aria` needs `AriaComponent` and `aria.enabled`.** The stage handler is registered only by `AriaComponent` (EC/lib/component/aria/install.js L46-48) and returns early unless `aria.enabled` (EC/lib/visual/aria.js L58-63). wechart registers neither today ([echarts.ts](/Users/srajagopal/Work/wechart/packages/charts/src/echarts.ts)).
- **What it adds.** When on, it sets `role="img"` and a generated `aria-label` from the first `aria.label.data.maxCount` (default 10) data items. `aria.label.description` replaces the generated text ([aria.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/aria.md); aria.js L120-207).
- **Map-specific catch.** The data includes the appended no-data regions (MapSeries.js L101). With fewer than 10 data rows, the generated label would list countries with value `NaN`. If ECharts aria is used, set `description` ourselves.
- **No keyboard support.** ECharts provides no keyboard or focus support ([echarts.md, Accessibility](/Users/srajagopal/Work/wechart/docs/research/echarts.md)). The accessible name, a values table and the unplaced-code note must be wechart DOM.

### Events

- **Click and hover.** On a region these carry `name` = the region key (the ISO code) and a `dataIndex`. The region group is registered with `data.setItemGraphicEl(dataIdx, regionGroup)` (MapDraw.js L526-540). No-data regions have indices at or above the number of data rows.
- **Hit-testing.** `containPixel` supports `series-map` ([echarts.md](/Users/srajagopal/Work/wechart/docs/research/echarts.md)).

## Boundary data

### Natural Earth v5.1.2, admin-0 countries (recommended)

- **Release.** Latest GitHub release `v5.1.2`, published 2022-05-13T23:24:34Z ([releases/latest](https://api.github.com/repos/nvkelso/natural-earth-vector/releases/latest)). The naturalearthdata.com download pages list admin-0 countries at version 5.1.1 ([110m page](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/); [50m page](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/)). v5.1.2 only added the TLC point of view to a 50m disputed-lines theme and fixed a place-name spelling ([release notes](https://api.github.com/repos/nvkelso/natural-earth-vector/releases/latest)). Pin tag `v5.1.2`.
- **Licence.** "All versions of Natural Earth raster + vector map data … are in the public domain"; "Crediting the authors is unnecessary" ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/); [LICENSE.md](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/LICENSE.md)).
- **Feature counts.** 110m: 177 rows; 50m: 242 rows; both with 169 columns (secondary source: [rnaturalearthdata docs](https://docs.ropensci.org/rnaturalearthdata/reference/countries.html), which does not state its NE version). A pre-v5 mirror also has 177 at 110m ([Opendatasoft](https://documentation-resources.opendatasoft.com/api/explore/v2.1/catalog/datasets/natural-earth-countries-110m)). Assert the count in the build test.
- **Properties on a v5.1.2 110m feature** (read from the Fiji feature of the raw file, [ne_110m_admin_0_countries.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson)):
  - codes: `ADM0_A3`, `ISO_A2`, `ISO_A2_EH`, `ISO_A3`, `ISO_A3_EH`, `ISO_N3`, `ISO_N3_EH`, `ADM0_ISO`, `ADM0_TLC`, `SOV_A3`, `GU_A3`, `SU_A3`, `BRK_A3`, `WB_A3`;
  - names: `NAME`, `NAME_LONG`, `ADMIN`, and `NAME_AR`…`NAME_ZHT`;
  - label points: `LABEL_X`, `LABEL_Y`;
  - viewpoints: `FCLASS_ISO`, `FCLASS_TLC`, `FCLASS_US`…`FCLASS_UA`.
  - The file has a `crs` member (CRS84).
  - Fiji has `ISO_A3 = ISO_A3_EH = ADM0_ISO = ADM0_TLC = "FJI"`.
- **The `-99` quirk.**
  - `ISO_A3` is `-99` for Norway and France, and that is deliberate ([#112](https://github.com/nvkelso/natural-earth-vector/issues/112); [#284 comments](https://api.github.com/repos/nvkelso/natural-earth-vector/issues/284/comments)). A 2025-05-31 comment says "As of 5.1.1, France still has `-99` as `ISO_A2`, same as Norway" (same thread).
  - The maintainer's explanation: NE "maintains it's own set of 3-character codes for each admin-0 related feature"; the `_eh` columns mean "okay but not great" matches; "interview your data" ([#268 comments](https://api.github.com/repos/nvkelso/natural-earth-vector/issues/268/comments)).
  - The 5.1.0 changelog: "Add FRA to Metropolitan France at country level as iso_a3_eh"; "Add more 'eh' support for ISO_A2 and ISO_A3 and ISO_N3 (France, Norway)"; "Mark Kosovo as recognized by fewer countries and by TLC (but not ISO)"; "Rename adm0_a3_iso to adm0_iso" ([CHANGELOG](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/CHANGELOG)).
  - In a pre-v5 mirror (modified 2020-12-30), exactly five 110m features have `iso_a3 = -99`. It is a third-party mirror, and its NE version is not stated ([mirror query](https://documentation-resources.opendatasoft.com/api/explore/v2.1/catalog/datasets/natural-earth-countries-110m/records?where=iso_a3%3D%22-99%22&limit=20&select=name,iso_a3,iso_a3_eh,adm0_a3)):

    | Feature | `iso_a3_eh` | `adm0_a3` |
    |---|---|---|
    | Somaliland | -99 | SOL |
    | N. Cyprus | -99 | CYN |
    | Kosovo | -99 | KOS |
    | Norway | -99 | NOR |
    | France | FRA | FRA |

    Per the 5.1.0 changelog, Norway gains an `_EH` value in v5.1.x. UNVERIFIED for v5.1.2 specifically: WebFetch truncated the 838 KB file before the Norway feature. The build test must assert that `NOR` and `FRA` end up as keys.
- **Keying rule for the derived file.**
  - Use `ISO_A3` when it matches `^[A-Z]{3}$`, otherwise `ISO_A3_EH` when it matches.
  - Otherwise give the feature a unique key that cannot be an ISO code (for example `~` + `ADM0_A3`), and leave it out of the placeable set.
  - Never let features share `-99`. MapDraw merges same-named regions into one group (the comment on duplicated names, MapDraw.js L184-189), so every `-99` feature would become a single region called "-99".
  - Pin the list of unkeyed and duplicate-keyed features in a test, so a data update can't change them silently.
- **Overseas territories are inside their sovereign's polygon.** "Users wanting dependent overseas regions broken out (as shown in ISO codes, such as France) should use the map units dataset instead" ([110m page](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/)). So, for example, a `GUF` row is unplaced while French Guiana's land is coloured with France's value.
  - Map units exist at 110m (861,911 B) and 50m (3,179,420 B) ([110m](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_110m_admin_0_map_units.geojson?ref=v5.1.2), [50m](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_50m_admin_0_map_units.geojson?ref=v5.1.2)).
  - UNVERIFIED: how map units split other countries and how their ISO fields read.
- **Names.** 5.0.0 "expanded name localization to 26 languages" and renamed Macedonia to North Macedonia and Swaziland to Eswatini ([releases](https://github.com/nvkelso/natural-earth-vector/releases)). `NAME` holds short forms such as "W. Sahara" (seen in the raw file). Which property to show in tooltips is a design choice; `ADMIN`, `NAME_LONG` and `NAME_EN` exist.
- **Label points.** Emitting `cp: [LABEL_X, LABEL_Y]` gives ECharts NE's own label point for tooltip anchoring (parseGeoJson.js L142).
- **Raw sizes.**

  | File | Size |
  |---|---|
  | 110m GeoJSON | 838,726 B |
  | 50m GeoJSON | 3,083,490 B |
  | 110m zip on naturalearthdata.com | 210.08 KB |
  | 50m zip on naturalearthdata.com | 781.78 KB |

  Sources: the contents-API links above and the NE download pages. Most of the GeoJSON bytes are the 169 attribute columns. UNVERIFIED: the size of the derived slim file (key, name and `cp`, with rounded coordinates). Measure it in CI.
- **Small countries.**
  - At 110m, microstates are absent. NE ships separate *point* layers: `ne_110m_admin_0_tiny_countries.geojson` (134,886 B) and a 50m equivalent (276,247 B) ([110m](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_110m_admin_0_tiny_countries.geojson?ref=v5.1.2), [50m](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_50m_admin_0_tiny_countries.geojson?ref=v5.1.2)).
  - The 110m point layer has `Point` geometries with ISO codes, including Singapore (SGP), Malta (MLT) and Bahrain (BHR) (partial read of the [raw file](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_tiny_countries.geojson)).
  - Points can't be registered as map regions (see registerMap). Placing them needs a `geo` component, the map series on `geoIndex`, and a `scatter` series with `coordinateSystem: 'geo'`. With `geoIndex` set, the series' own `map` and layout are ignored ("Otherwise use the specified geo component, and `map` and `mapType` are ignored", MapSeries.js L196-199).
  - Open bug: [#21420](https://github.com/apache/echarts/issues/21420), "Map series with scatter markers causes doubling and breaks hover/zoom".
  - Even at 50m, a polygon like Singapore is sub-pixel in a small tile. Region paths are built with `culling: true, segmentIgnoreThreshold: 1` (MapDraw.js L234-237). UNVERIFIED: the visible result under the SVG renderer. Render Singapore and Malta at the smallest tile size.
- **Disputed borders.**
  - "Natural Earth shows de facto boundaries by default according to who controls the territory, versus de jure" ([110m page](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/)).
  - 4.0.0 made "significant changes to admin-0 country shapes to account for the disputed area of Crimea" ([releases](https://github.com/nvkelso/natural-earth-vector/releases)).
  - 5.0.0 added alternate points of view via `fclass_*`, including "Taiwan and China POV". 5.0.1 updated Ukraine's POV "for current events" and noted "Kosovo is not recognized by India POV" ([CHANGELOG](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/CHANGELOG)).
  - Per-POV *polygon files* exist at 10m (`ne_10m_admin_0_countries_<pov>.geojson`, [contents API listing](https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson?ref=v5.1.2)) but not at 50m: `ne_50m_admin_0_countries_iso.geojson` returns 404.
  - At 110m and 50m, the viewpoint shows only as `FCLASS_*` attributes. The geometry follows NE's default viewpoint.
- **Kosovo has no ISO 3166-1 code.** Data may carry `XKX` (EU usage) or `XKK` (Unicode) (secondary: [Wikipedia ISO 3166-1 alpha-3](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3)). i18n-iso-countries lists Kosovo as `["XK","XKK","983",…]` ([codes.json](https://unpkg.com/i18n-iso-countries@7.14.0/codes.json)); NE's `ADM0_A3` is `KOS` (mirror above). Under the keying rule, all three are unplaced unless an alias is decided.
- **Antarctica.** The file includes Antarctica. Excluding it would make `ATA` unplaced, so whether to keep it is a design choice.

### ISO 3166-1 alpha-3 code list (for detection, optional)

- **i18n-iso-countries 7.14.0 (MIT).**
  - Codes come from "Wikipedia: Officially assigned code elements" ([README](https://github.com/michaelwittig/node-i18n-iso-countries)).
  - `getAlpha3Codes(): { [alpha3Key: string]: string }` and `isValid(alpha2orAlpha3orNumeric)` ([index.d.ts](https://unpkg.com/i18n-iso-countries@7.14.0/index.d.ts)). `isValid` also accepts alpha-2 and numeric, so test `^[A-Z]{3}$` plus membership in `getAlpha3Codes()`, not `isValid`.
  - Browsers must `registerLocale()` a locale file for names (`langs/en.json` is 6,734 B) ([README](https://github.com/michaelwittig/node-i18n-iso-countries); [unpkg meta](https://unpkg.com/i18n-iso-countries@7.14.0/?meta)).
  - `codes.json` is 10,253 B (same meta). UNVERIFIED: its exact entry count; a WebFetch summary said 249, with a Kosovo entry appended.
  - *VERIFIED at T397 (2026-09-25):* fetched from unpkg, it has 250 entries, each `[alpha2, alpha3, numeric, subdivision]`: the 249 ISO codes plus Kosovo's user-assigned `XK`/`XKK`. `packages/core/src/geo/iso3.ts` vendors the 249 alpha-3 codes as a literal set (no dependency), and T397's review checked them against the official ISO list.
- **Alternative: UN M49.** The UNSD page lists every area with its "ISO-alpha3 code" ([UNSD M49](https://unstats.un.org/unsd/methodology/m49/)). It could be vendored instead.
- **User-assigned ranges.** "AAA to AAZ, QMA to QZZ, XAA to XZZ, and ZZA to ZZZ" (secondary: [Wikipedia](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3)).

## Detecting unplaced codes

ECharts has no API for data names that match no region. They simply get no graphic (MapSeries.js L75-102). wechart computes them from the same key set it registered:

```ts
const codes = distinct(rows.map((r) => r[dimension]));               // one row per code expected
const placeable = keys;                                               // from loadCountryMap()
const placed   = codes.filter((c) => typeof c === 'string' && placeable.has(c));
const unplaced = codes.filter((c) => !(typeof c === 'string' && placeable.has(c)));
```

- **Matching is exact and case-sensitive** (MapSeries.js L75-84; SeriesData.js L563-570). Any trimming or upper-casing must happen before the match; whether to do it is a spec decision.
- **Pass only placed codes to the series.** Unplaced ones have no region and would otherwise still count in the aria label.
- **Name the unplaced codes in wechart DOM,** not in ECharts text, so that they are real, accessible text.
- **Exclude the map from top-N folding.** `applyTopN` folds rows past N into a row keyed "Other" ([topN.ts L48-80](/Users/srajagopal/Work/wechart/packages/core/src/topN.ts)). On a map that drops real countries and creates an unplaced code called "Other". Add the map to its exclusions, as scatter and heatmap already are (L59).

## Recommender: when does a dimension "hold ISO-3 codes"?

- **Cube offers no signal.**
  - Dimension types are `time`, `string`, `number`, `boolean`, `switch` and `geo`; `geo` is latitude/longitude.
  - String formats are only `imageUrl` and `link`.
  - `meta` "attaches arbitrary information" ([Cube dimensions](https://docs.cube.dev/reference/data-modeling/dimensions)). Core copies `meta` verbatim into `/v1/meta` ([data-modeling.md §14-15](/Users/srajagopal/Work/wechart/docs/research/cube/data-modeling.md)).
- **The recommender can't see it either.** Its `Field` holds only `name`, `kind` and `cardinality`, and it is deliberately not Cube-shaped ([types.ts](/Users/srajagopal/Work/wechart/packages/recommender/src/types.ts)). Whatever decides "ISO-3" has to run outside it and add a field attribute.
- **Candidate signals.** Each is a wechart design choice, not a Cube feature.
  1. **A declared hint in the member's `meta`.** Authoritative when present, and survives verbatim through `/v1/meta`. It needs a key name decided in the spec and a way to set it in the model editor.
  2. **A value check** on the query result: every non-null distinct value matches `^[A-Z]{3}$` and is in the ISO 3166-1 alpha-3 list. Use the full ISO list, not the boundary key set, so that `SGP` counts as ISO-3 even where 110m can't place it.
     - False-positive risk: other 3-letter code systems overlap country codes. UNVERIFIED example: IATA airport codes such as `CAN` and `AUS`.
     - The acceptance threshold (all values, or a share) is a product decision. None is proposed here.
  3. **Member-name heuristics** such as `iso3`, `iso_a3` or `alpha3`. Superset's datasets use `customer_country_iso3` and `ship_country_iso3` ([superset-parity.md](/Users/srajagopal/Work/wechart/docs/design/superset-parity.md)). Weak on its own.
- **wechart's own sample model would not qualify.** `customers.country` holds names ("Germany", "France", "United States", "United Kingdom"), not ISO-3 ([init.sql L27-31](/Users/srajagopal/Work/wechart/infra/sample-db/init.sql)). Under AC-305 no map would be offered for it, and e2e tests need an ISO-3 dimension.

## Gotchas

- **`registerMap` before `use([MapChart])` silently does nothing.** The next `setOption` then throws on the missing map (see Init).
- **Series-map defaults to select-on-click, hover recolouring, hover labels and legend dots** (the `selectedMode: true`, `emphasis`, `showLegendSymbol` rows above). All four fight wechart's marking and styling, so set each explicitly. Legend dots: [#20464](https://github.com/apache/echarts/issues/20464).
- **visualMap `min`/`max` default to 0 and 200,** and a continuous bar shows no numbers without `text` or `calculable` (see visualMap).
- **Piecewise without `outOfRange` makes no-data countries transparent.** Piecewise `selectedMode: 'multiple'` lets legend clicks hide classes (see visualMap).
- **Duplicate codes are summed by default** (`mapValueCalculation`), and the first duplicate wins `indexOfName` (see series-map).
- **`ISO_A3 = -99` for France and Norway in NE,** and Northwind data contains both. Keying on plain `ISO_A3` fails AC-305 on the parity dashboards (see Boundary data).
- **Same-named regions merge into one group.** Unkeyed `-99` features must get unique keys (MapDraw.js L184-196).
- **`GeometryCollection` and `Point` features** break or add nothing (see registerMap).
- **With `projection`, `project` must return screen-down y,** `center` is in projected units, and `aspectScale` is ignored (see Projection).
- **v6.0.0 changed the percent base of `center`** on `geo`/`series.map`; `legacyViewCoordSysCenterBase: true` restores it. 6.0.0 also added `clip`, `preserveAspect` and `roamTrigger` for map. 6.1.0 fixed "failed synchronization and visual artifacts on geo roaming and animation" ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- **Several map series over one geo break visualMap targeting.** Open [#20587](https://github.com/apache/echarts/issues/20587): "the first `visualMap` object's `seriesIndex` is not respected". The reported workaround is `geo` + `geoIndex`. This matters for a trellis of maps.
- **Other open map bugs, titles only (not investigated):** [#20502](https://github.com/apache/echarts/issues/20502) "Selected state not redrawn after map data update"; [#20440](https://github.com/apache/echarts/issues/20440) "getDataURL() ignores disabled map emphasis"; [#21419](https://github.com/apache/echarts/issues/21419) "Series highlighting issue causes color recovery failure".
- **Cube returns numeric measures as strings** (e.g. `"56550.00"`, [introspection-api.md L559](/Users/srajagopal/Work/wechart/docs/research/cube/introspection-api.md)). Convert with `Number()` and drop non-finite values, as [heatmap.ts L45-57](/Users/srajagopal/Work/wechart/packages/charts/src/series/heatmap.ts) does.
- **ECharts 5 removed the built-in world/China GeoJSON:** "These geoJSON files were always sourced from third parties" ([v5 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v5-upgrade-guide/)). Don't copy old ECharts `world.json`; its provenance is exactly the problem.
- **Security.** Country names from the boundary file and codes from data both end up in tooltip HTML. Escape them as `tooltip.ts` already does.
- **Bundle cost.** Adding `MapChart` (map, geo, roam controller) has no published figure ([echarts.md](/Users/srajagopal/Work/wechart/docs/research/echarts.md)). Measure it in CI.

## Alternatives considered

- **`world-atlas` 2.0.2 + `topojson-client` 3.1.0 (both ISC).** Rejected.
  - world-atlas was published 2019-09-05 from NE **4.1.0** ([registry](https://registry.npmjs.org/world-atlas); [README](https://github.com/topojson/world-atlas)). That predates 5.x's name changes and viewpoint work.
  - Feature `id` is the ISO *numeric* code. For `-99` the build sets `undefined`, except Norway, which is forced to `578` ([prepublish](https://raw.githubusercontent.com/topojson/world-atlas/master/prepublish)). An ISO-3 key would need an extra numeric-to-alpha-3 table.
  - It is TopoJSON, so a runtime `topojson-client` conversion is needed ([topojson-client](https://registry.npmjs.org/topojson-client/latest)).
  - It is smaller on the wire: `countries-110m.json` is 107,761 B ([unpkg meta](https://unpkg.com/world-atlas@2.0.2/?meta)).
- **An SVG base map (`registerMap(name, { svg })`).** Rejected: custom projections apply only to GeoJSON ([geo-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/geo-common.md)), and Geo.js L86-91 warns and drops a projection for SVG sources. Keys would have to be `name` attributes on SVG elements ([api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md)).
- **NE 50m instead of 110m.** It has 242 features instead of 177 ([rnaturalearthdata](https://docs.ropensci.org/rnaturalearthdata/reference/countries.html)), including more small states, at about 3.7× the raw GeoJSON bytes (3,083,490 vs 838,726). The trade-off is an open question below, not a decision.
- **A hand-written Equal Earth projection instead of d3-geo.** The forward formula is simple. Inversion is required by the API (`unproject`), and d3-geo supplies a tested `invert` and `stream` ([d3 projection](https://d3js.org/d3-geo/projection)).

## Open questions / unverified

1. **Resolution.** 110m (177 features, no microstates) vs 50m (242), vs 110m plus the tiny-country point layer drawn as a geo scatter (bug #21420 is a risk there). It decides whether codes such as SGP, BHR, MLT and HKG are placed or named as unplaced.
2. **Visibility of tiny polygons.** Are sub-pixel polygons at the smallest tile size "coloured" for AC-305's Fails-when? This needs a rendered check, and possibly a marker rule.
3. **Projection.** Equal-area (Equal Earth via d3-geo 3.1.1) or ECharts' default lon/lat with `aspectScale` 0.75. This is a design decision for ui-design.
4. **How "holds ISO-3 codes" is decided.** Options: a `meta` key and its name, a value-check threshold, and whether name heuristics count. For the user and the spec.
   - *Settled:* the user's R22 chose "values, plus a model override" (AC-313). T397 took, as a small decision for the user to confirm, the key `meta.wechart.countryCode` (true / false / absent) under a `wechart` namespace, every non-empty value an exact, upper-case code, and no name heuristics.
5. **Normalisation and aliases.** Whether lower-case or padded codes are normalised. Whether Kosovo aliases (`XKX`/`XKK`/`KOS`) are placed. How null or empty codes are named.
6. **Scale design.** Continuous vs classed (equal-interval or quantile). Whether the extent comes from placed rows only or all rows. What to do with negative values (a diverging scale; direction.md has one).
7. **The "no data" colour and legend.** direction.md's null neutral is `#b3b1ab` light / `#5c5b57` dark ([direction.md §5](/Users/srajagopal/Work/wechart/docs/design/direction.md)). Its distinguishability from the pale ramp end `#cde2fb` is not measured. Does the legend need a "No data" swatch? The visualMap has none.
8. **Where unplaced codes are named** (a tile note, the tooltip, or both), and a tile's accessible text alternative.
9. **Antarctica, and whose boundaries.** Whether to keep Antarctica. Whether NE's default de facto boundaries are acceptable, given that viewpoint polygon files exist only at 10m.
10. **UNVERIFIED: Norway's v5.1.2 `ISO_A3_EH`.** The 5.1.0 changelog says Norway gained `_EH` support, but WebFetch truncated the file before the Norway feature. The build test must assert `NOR` and `FRA` as keys.
11. **UNVERIFIED: the exact v5.1.2 110m feature count.** The sources are secondary or a pre-v5 mirror; assert it in the build test.
12. **UNVERIFIED: size of the derived slim GeoJSON,** raw and gzipped. Measure it.
13. **UNVERIFIED: how the SVG SSR output writes `rgba` fills,** and whether `renderToSvg`'s walker reads map paths unchanged.
14. **UNVERIFIED: how Vitest 5 resolves `?url` imports** inside `packages/charts`, and whether `vite/client` types are available to that package's `tsc`.
15. **UNVERIFIED: whether ECharts' no-data colour path** (NaN, then undefined fill, then `areaColor`) holds once a user-set range is narrower than the extent. Only the default `calculable: false` path was traced.
