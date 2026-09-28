---
library: Apache ECharts, a hatch on symbols, boxes, heatmap cells and map regions
packages: [echarts]
version: '6.1.0'
researched: 2026-09-28
sources: [https://github.com/apache/echarts/blob/6.1.0/src/chart/helper/Symbol.ts, https://echarts.apache.org/en/option.html#series-scatter.data.symbol, https://echarts.apache.org/en/option.html#series-heatmap.itemStyle, https://github.com/ecomfe/zrender/blob/6.1.0/src/tool/path.ts]
---
# ECharts 6.1.0: where a hatch can be drawn, and how a point is hatched

A sibling of [`echarts.md`](echarts.md), whose "Per-item styling for markings" records `itemStyle.decal`. T453 (AC-097) draws a partly marked item hatched on every chart type, and the user's answer of 2026-09-28 (R43) hatches a scatter's point, a box plot's box and a map's country too. This file records where a decal is drawn, and what a scatter point uses in its place.

## A correction: a symbol draws no decal

[`cross-highlight.md`](cross-highlight.md) option H4 lists scatter among the types that draw `itemStyle.decal`. **That is wrong for 6.1.0.**

- A scatter point is a symbol, and the symbol clears its decal before it draws itself: `symbolPath.style.decal = null`, commented "Disable decal because symbol scale will been applied on the decal" (installed `echarts/lib/chart/helper/Symbol.js`, lines 241–242; [Symbol.ts][symbol]).
- A line's points and a box plot's outliers (a scatter series) are symbols too, so neither draws a decal.

## What a point uses instead: a symbol of its own

- A scatter's data item takes its own `symbol`. Its type extends `SymbolOptionMixin`, whose `symbol` is "type of symbol, like `circle`, `rect`, or custom path and image" (installed `echarts/types/src/chart/scatter/ScatterSeries.d.ts`, line 16; `echarts/types/src/util/types.d.ts`, lines 904–916; [option][scatter-symbol]).
- A `path://` symbol is parsed by zrender's SVG-path reader, which takes `A` and `a` arcs (installed zrender 6.1.0, `zrender/lib/tool/path.js`, lines 241–262; [path.ts][zr-path]).
- **Observed** on 2026-09-28 in Node, with ECharts' SSR to SVG (`packages/charts/src/testing/renderToSvg.ts`): a data item with `symbol: 'path://M0,5a5,5 0 1,0 10,0a5,5 0 1,0 -10,0Z M3.17,9.65L9.65,3.17 M0.35,6.83L6.83,0.35'` is drawn as one `<path>`. The path holds a circle and two chords, scaled to the 8 px symbol. It is filled in the item's `color` and stroked in its `borderColor`, so the chords are drawn in the border's colour across the disc. `borderWidth: 1.5` comes out as `stroke-width="0.375"` under a `matrix(4,…)` transform, which is 1.5 px on screen.

## Where a decal is drawn

Observed the same way: each of these draws a `<pattern>` for an item-level `itemStyle.decal`.

| Item | Pattern drawn |
| --- | --- |
| A bar (already relied on by T387) | yes |
| A treemap's leaf (already relied on by T387) | yes |
| A box plot's box (`series-boxplot` data `{ value, itemStyle }`) | yes |
| A heatmap's cell (`series-heatmap` data `{ value, itemStyle }`) | yes |
| A map's region, with `visualMap` on (`country-map.md` reads MapDraw as keeping the decal) | yes |
| A scatter's point | no: see above |

A heatmap cell also takes `itemStyle.borderType: 'dashed'`, which is drawn with `stroke-dasharray` ([option][heatmap-style]; observed the same way).

A treemap's leaf draws its border differently from the others: as a rectangle behind the leaf, **filled** in the border's colour, with the leaf inset by the border's width (installed `echarts/lib/chart/treemap/TreemapView.js`, lines 670–673: `normalStyle.fill = visualBorderColor`). So in the SVG a treemap leaf outlined in the marking's colour is a path whose `fill` is that colour, not one whose `stroke` is. Observed the same way.

## What wechart relies on

- `packages/charts/src/marking/partialOption.ts`, `HATCHED_POINT`: a partly marked scatter point is that path, in its own colour and outlined in the marking's colour.
- The same file hatches boxes, heatmap cells and map regions with the decal.
- `partialOption.test.ts` renders each one and checks for the `<pattern>` or the three-part path. `e2e/marked-share.spec.ts` checks them in the browser.

[symbol]: https://github.com/apache/echarts/blob/6.1.0/src/chart/helper/Symbol.ts
[scatter-symbol]: https://echarts.apache.org/en/option.html#series-scatter.data.symbol
[heatmap-style]: https://echarts.apache.org/en/option.html#series-heatmap.itemStyle
[zr-path]: https://github.com/ecomfe/zrender/blob/6.1.0/src/tool/path.ts
