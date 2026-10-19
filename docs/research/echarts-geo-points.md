---
packages: [echarts, d3-geo]
version: 'echarts 6.1.0; zrender 6.1.0; d3-geo 3.1.1'
researched: 2026-10-18
---

# ECharts `geo`: the coordinate order, points and density over a map

For T976 (AC-625, the Points layer) and T977 (AC-626, the Density layer). Read `country-map.md` first (registering a map, the Equal Earth projection through d3-geo) and `cube-geo-values.md` (a Cube geo value is the string `"lat,lng"`, **latitude first**).

Abbreviations: **EC/** is `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/`, **ZR/** is `node_modules/.pnpm/zrender@6.1.0/node_modules/zrender/`, **D3/** is `node_modules/.pnpm/d3-geo@3.1.1/node_modules/d3-geo/`. Every claim below was read in those installed files.

## Summary

- **ECharts' `geo` takes `[longitude, latitude]`, longitude first.** The geo coordinate system's dimensions are `['lng', 'lat']` (EC/lib/coord/geo/Geo.js L61, set as `this.dimensions` at L66). `Geo.dataToPoint(data)` passes `data` unchanged to `projection.project` when a projection is set (L144–156), and the d3 projection reads `point[0]` as longitude (λ) and `point[1]` as latitude (φ): `projectRotateTransform(point[0] * radians, point[1] * radians)` (D3/src/projection/index.js L80–82). GeoJSON positions are longitude first too ([RFC 7946 §3.1.1](https://www.rfc-editor.org/rfc/rfc7946#section-3.1.1)), which is why the map's own polygons line up.
- So a Cube value `"40.7128,-74.0060"` must be **swapped** to `[-74.0060, 40.7128]` before it reaches ECharts.

## Points: a scatter series on a hidden `geo`

- A scatter series draws on a map with `coordinateSystem: 'geo'` and `geoIndex`, each item's `value` being `[lng, lat, …]`: the series' data dimensions come from the coordinate system's (`geo2DDimensions` is the dimension list `geoCreator` gives series, EC/lib/coord/geo/geoCreator.js L45, L153–154).
- The map series wechart already draws keeps **its own** internal geo when it has no `geoIndex` (EC/lib/chart/map/MapSeries.js L196–199, `getHostGeoModel` L108–120). A separate `geo` component can be the scatter's coordinate system while drawing nothing: `GeoView.render` returns before drawing when `show` is false (EC/lib/component/geo/GeoView.js L60–66), while the coordinate system is still created and laid out.
- Both geos are laid out by the same `resizeGeo` from their own box options (`left`/`right`/`top`/`bottom`), the map's bounding rect and the projection (geoCreator.js L57–139, used for `geo` components at L179 and for map series' own geos at L218). **Given the same map, projection and box, the two give the same pixel for a coordinate**; wechart's test asserts it by projecting a point inside a region and checking it falls inside that region's drawn bounds.
- Alternative not taken: a `geo` component that hosts the map series (`geoIndex` on the map series). Its regions are then drawn by the geo, whose events carry `componentType: 'geo'` (EC/lib/component/helper/MapDraw.js L104–112, L575–577), which would change how wechart's tiles read clicks on regions.
- `symbolSize` may be a function of the item's value (ECharts' scatter default is 10, EC/lib/chart/scatter/ScatterSeries.js L91); wechart computes each point's diameter itself and passes it per item.

## Density: a heatmap series on `geo`

- A heatmap series on a geo coordinate system is drawn by `_renderOnGeo` (EC/lib/chart/heatmap/HeatmapView.js L117–121, L273–318): every point is projected with `geo.dataToPoint([lng, lat])` (L297), its weight being the item's third value (`mapDimension('value')`).
- **It needs a `visualMap`** targeting the series, or it throws "Heatmap must use with visualMap" (L101–112). Its colours come from that visualMap's `inRange.color` (L274–275, L306–309). A ramp that starts transparent gives the "fading to transparent" AC-626 asks for.
- Its look: `pointSize` (default 20), `blurSize` (default 30), `minOpacity` (0) and `maxOpacity` (1) (EC/lib/chart/heatmap/HeatmapLayer.js L50–53; read from the series at HeatmapView.js L281–284).
- **It draws into a canvas**, made by `platformApi.createCanvas()` (HeatmapLayer.js L45, L56–57), which is `document.createElement('canvas')`, or `false` with no `document` (ZR/lib/core/platform.js L21–24). In the SVG renderer the canvas is written as an `<image>` from `toDataURL()` (ZR/lib/svg/graphic.js L21, L169). **In Node's server-side rendering there is no canvas**, so unit tests check the Density layer's option, not an SSR drawing; the drawing is checked in the browser (e2e).
- The heatmap layer is `silent: true` (HeatmapView.js L316), so it raises no click events of its own.

## Gotchas

- Swap the order once, where the Cube value is parsed (`cube-geo-values.md`: parse two numbers, latitude first); never pass the string to ECharts.
- A projection may return `null` for a point (Geo.js L152); `dataToPoint` then returns `undefined` and the point isn't drawn.
- Several visualMaps on one chart: the Regions ramp and the Density ramp each need `seriesIndex` so neither colours the other's series.
