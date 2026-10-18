---
library: echarts (a combo's layers: series z, a line's halo series, two value axes)
packages: [echarts]
version: 6.1.0
researched: 2026-10-18
sources:
  [
    https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/line/LineSeries.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/bar/BaseBarSeries.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/scatter/ScatterSeries.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/legend/LegendView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/axisPointer/modelHelper.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/axis/AxisBuilder.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/label/labelStyle.ts,
    https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/component/y-axis.md,
  ]
---

# ECharts 6.1.0: a combo's layers

An addendum to `rich-tiles-and-combo-tech.md` §2, for T846 (design 20's draw order and a line's surface halo). It contradicts nothing there. Behaviour is cited from the installed package, `EC = node_modules/.pnpm/echarts@6.1.0/node_modules/echarts`, with line numbers in its compiled `lib/`.

## Summary

- **A series' `z` orders its marks.** After each series is rendered, `updateZ(seriesModel, chartView)` sets the series' `z` and `zlevel` on every element it drew (`EC/lib/core/echarts.js:1792, 1893-1904`). zrender sorts what it paints by `zlevel`, then `z`, then `z2` (`shapeCompareFunc`, `node_modules/.pnpm/zrender@6.1.0/node_modules/zrender/lib/Storage.js:12-20`), so on one `zlevel` a series with a higher `z` is drawn over one with a lower. Ties keep their order (the sort is stable, `timsort`).
- **The defaults are close together:** a line series has `z: 3` (`EC/lib/chart/line/LineSeries.js:96`), a bar series `z: 2` (`EC/lib/chart/bar/BaseBarSeries.js:147`) and a scatter series `z: 2` (`EC/lib/chart/scatter/ScatterSeries.js:89`). So points and bars tie, and an area (a line) would be drawn over bars. wechart sets `z` on every combo series.
- **A line has no outline option.** `lineStyle` takes a width, a colour, a dash, caps, joins and a shadow ([line.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md)); nothing strokes a line under itself. A halo is therefore a second line series with the same data, wider, in the surface colour, at a lower `z`.
- **Such a series can be kept out of the legend and the tooltip:**
  - The legend draws one entry per name, from the **first** series with that name (`ecModel.getSeriesByName(name)[0]`; `EC/lib/component/legend/LegendView.js:151-156`). A halo named as its line and placed after it adds no entry and lends the entry none of its colour.
  - The axis-triggered tooltip skips a series whose `tooltip.show` is `false` (`collectSeriesInfo`, `EC/lib/component/axisPointer/modelHelper.js:192-202`).
  - `legendHoverLink: false` keeps it out of the legend's hover link (`LegendView.js:137-139`).
- **Two value axes:** a series picks its axis with `yAxisIndex`; the second axis goes on the right by default ([y-axis.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/y-axis.md); `rich-tiles-and-combo-tech.md` §2).

## Axis titles and the legend (T848)

- **An axis title above a vertical axis, upright.** `nameLocation: 'end'` places the name past the axis's end (`EC/lib/component/axis/AxisBuilder.js:501-503`), and a set `nameRotate` (degrees) replaces the axis's own rotation in `endTextLayout` (L512-523), so `nameRotate: 0` keeps it horizontal. `nameTextStyle.align` wins over the layout's own alignment (L547).
- **Glyphs as rich-text boxes.** The name's style comes from `createTextStyle(nameTextStyle)` (L540), so `nameTextStyle.rich` applies. A rich token's box takes `width` and `height` (`TEXT_PROPS_SELF`) and `backgroundColor`, `borderRadius`, `borderColor` and `borderWidth` (`TEXT_PROPS_BOX`) (`EC/lib/label/labelStyle.js:339-340`). There is one border for every edge, so a box can't draw its top edge alone.
- **A legend icon per entry.** Each entry reads `icon` from its own item in `legend.data`, falling back to `legend.icon` (`LegendView.js:290`), so a `path://` per entry gives each series its own glyph.
- **The legend's formatter** is called with the entry's name and returns the text, which the entry's `textStyle` (and its `rich`) draws (`LegendView.js:321-340`).
- **Legend hover.** Over an entry, the legend dispatches `highlight` with the series' name, and `downplay` as the pointer leaves (`LegendView.js:168, 517-535`). A dispatched action is triggered as an event of the same type, carrying its payload (`EC/lib/core/echarts.js:1506-1587`), so `chart.on('highlight', …)` receives `seriesName`. **But with `selectedMode: false`, every part of an entry is silent** (`LegendView.js:359-362`), so no hover reaches it. wechart's legend has `selectedMode: false` (`legend.ts`).
- **Series hover** is the documented `mouseover` / `mouseout`, with `componentType: 'series'` and `seriesName` (`echarts.md`, "Events").

## Gotchas

- Two series at the same `z` are painted in the order they're listed, so a halo listed after its line at the same `z` would cover it. Give the halos a `z` of their own, below the lines'.
- A halo copies its line's values only: not its labels, its markers or any item style a marking puts on it.
