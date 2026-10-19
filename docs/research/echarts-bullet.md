---
library: ECharts bar layout per axis, and dataZoom for a scrolling category axis (the bullet chart, T954)
packages: []
version: 6.1.0
researched: 2026-10-18
sources:
  [
    node_modules/echarts/lib/layout/barGrid.js (6.1.0, as installed),
    node_modules/echarts/lib/coord/axisStatistics.js (6.1.0),
    node_modules/echarts/lib/component/dataZoom/InsideZoomModel.js (6.1.0),
    node_modules/echarts/lib/component/dataZoom/SliderZoomModel.js (6.1.0),
    node_modules/echarts/lib/component/dataZoom/DataZoomModel.js (6.1.0),
    node_modules/echarts/lib/component/dataZoom/AxisProxy.js (6.1.0),
    node_modules/echarts/lib/component/dataZoom/roams.js (6.1.0),
    node_modules/echarts/lib/export/components.js (6.1.0),
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/barGrid.md,
  ]
---

# The bullet chart in ECharts 6.1.0: overlapping bars of two widths, and a scrolling member axis

No new package: `echarts` is already researched (`echarts.md`). This covers two behaviours the bullet chart (AC-581, design 23 sheet 8) relies on, read from ECharts 6.1.0's own source as installed in `packages/charts/node_modules/echarts`. The chart's tests then render the option to SVG (`testing/renderToSvg.ts`) and check the geometry, so each claim below is also checked in a test.

## 1. Bars of different widths, centred on one category

A bullet draws a 24 px band row and an 8 px value bar centred in it.

- **`barGap: '-100%'` doesn't centre them.** `calcBarWidthAndOffset` (`layout/barGrid.js`, lines 236–256) sums each column's `width * (1 + barGapPercent)`, takes the last column's gap back off, starts at `-widthSum / 2` and advances each column by `width * (1 + barGapPercent)`. At `-100%` every column starts at the same offset, `-lastWidth / 2`: two widths line up at one edge, not on the centre. `cross-highlight.md` reaches the same answer from the docs: a narrower inner bar needs another approach.
- **Bars are laid out per base axis.** `createLayoutInfoListOnAxis(baseAxis, …)` (`barGrid.js`, lines 107–133) collects only the series on that axis (`eachSeriesOnAxisOnKey(baseAxis, …)`, `coord/axisStatistics.js` line 118). So a bar series on a second category axis, with the same categories and the same grid, is laid out alone, as one column centred at offset `-width / 2`.
- **What wechart does:** the bands are stacked bars on y-axis 0, one column of 24 px; the value bar is a bar of 8 px on a hidden y-axis 1 with the same members; both are centred on the member. The target is a `scatter` point with a `rect` symbol of `[2, 32]` at (target, member) on y-axis 0, centred as every scatter point is on a category.

## 2. A member axis that scrolls while the value axis stays

AC-581: members past the tile's height scroll with the axis fixed.

- **The components.** `DataZoomInsideComponent` and `DataZoomSliderComponent` are exported from `echarts/components` (`export/components.js`, lines 67–68). wechart registers neither before T954.
- **`inside` dataZoom defaults** (`InsideZoomModel.js`, lines 55–62): `zoomLock: false`, `zoomOnMouseWheel: true`, `moveOnMouseMove: true`, `moveOnMouseWheel: false`. By default a drag would pan the members, which would take over the marking's rectangle drag (AC-088). wechart sets `moveOnMouseMove: false`, `zoomOnMouseWheel: false` and `moveOnMouseWheel: true`, so only the wheel scrolls.
- **`zoomLock` on an `inside` dataZoom silences the wheel.**
  - With `zoomLock: true` the roam controller's type is `'move'` (`roams.js` line 160).
  - `RoamController.enable` adds the `mousewheel` listener only for the types `true`, `'scale'` and `'zoom'` (`component/helper/RoamController.js`, lines 116–122). So under `zoomLock` the wheel reaches nothing, and `moveOnMouseWheel` does nothing.
  - wechart therefore leaves `zoomLock` off the `inside` dataZoom. It holds the window at one size with `minValueSpan` and `maxValueSpan`, which the zoom handler applies (`AxisProxy._updateMinMaxSpan`, lines 371–388; `InsideZoomView.js`, lines 99–100). That also stops a pinch from zooming.
  - The first e2e of this chart found it: the wheel moved nothing until `zoomLock` came off.
- **`slider` dataZoom** has `zoomLock: false` by default (`SliderZoomModel.js` line 108); with `zoomLock: true` dragging moves the whole window (`SliderZoomView.js` line 546). It is shown by default and placed by `right` and `width`.
- **The window.** `start` and `end` are percentages, 0 and 100 by default (`DataZoomModel.js`, lines 405–411); `startValue` and `endValue` are read as raw options (line 421), on a category axis as indexes.
- **The value axis stays put with `filterMode: 'none'`.** The default is `'filter'` (`DataZoomModel.js` line 408). With `'none'`, `AxisProxy.filterData` returns before filtering any series (`AxisProxy.js`, lines 294–298). The other axis's extent is then computed from all the data, so the value axis neither rescales nor moves while the members scroll. Bars and points outside the window are clipped by the grid.
