---
packages: [echarts]
version: echarts 6.1.0
researched: 2026-10-19
---

# A combo below 1,024 px: a reference line's own tooltip, and a legend that wraps (T866)

T866 (AC-511, design 20 state I) draws a combo tile for a narrow window. Each reference line is labelled by its label alone and gives its value in a tooltip. The legend wraps under the title instead of paging. This doc sits beside `rich-tiles-and-combo-tech.md` ("Reference lines and areas") and `echarts-axis-legend-bars.md` §2–3 (the legend), and contradicts neither. Every claim below was read in the installed sources, `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/`, and was then seen working in `e2e/combo.spec.ts` ("a combo tile at 390 px").

## A mark line's tooltip

- **A mark line has a tooltip of its own, triggered by the item.** `MarkLineModel.defaultOption` sets `tooltip: { trigger: 'item' }` (`component/marker/MarkLineModel.js:57-67`).
- **Its drawn line carries the marker's model, not its series'.** `MarkLineView` sets `getECData(el).dataModel = mlModel` on each line and its children ("Set host model for tooltip", `component/marker/MarkLineView.js:291-296`). `MarkAreaView` does the same for an area.
- **The tooltip reads that model's options.** `TooltipView._showSeriesItemTooltip` builds the tooltip's model from `[itemModel, dataModel, coordinateSystemModel]` over the global tooltip. It returns early only when the resulting `trigger` isn't `'item'` (`component/tooltip/TooltipView.js:446-467`).
  - So a mark line with `tooltip: { trigger: 'item', formatter }` shows its own tooltip even while the chart's tooltip triggers on the axis. A combo's tooltip does trigger on the axis (`packages/charts/src/tooltip.ts`, `CROSSHAIR_TYPES`).
  - The series' own `tooltip: { show: false }` isn't in that chain, so it doesn't hide the marker's.
- **A marker is silent while its series is.** `lineDraw.group.silent = mlModel.get('silent') || seriesModel.get('silent')` (`MarkLineView.js:318`). For the marker to answer the pointer, both the carrier series and the mark line must be `silent: false`.

## A legend that wraps

- **A `plain` horizontal legend wraps its entries into rows.** `LegendView.layoutInner` lays the entries out with `layoutUtil.box(orient, contentGroup, itemGap, maxSize.width, maxSize.height)` (`component/legend/LegendView.js:369-373`).
  - `boxLayout` starts a new row wherever the next entry would pass `maxWidth`, moving down by the row's tallest entry plus `itemGap` (`util/layout.js:60-110`).
  - A `scroll` legend pages instead (`echarts-axis-legend-bars.md` §3).
- **An entry's text starts 5 px past its icon** (`textX = itemWidth + 5`, `LegendView.js:319`). wechart estimates the rows from this, so it can leave the grid room above the plot. As `echarts-axis-legend-bars.md` says, the legend reserves no grid space in v6.
