---
library: Apache ECharts, category axis labels hidden by the auto interval
packages: [echarts]
version: '6.1.0'
researched: 2026-09-28
sources: [https://echarts.apache.org/en/option.html#xAxis.axisLabel.interval, https://echarts.apache.org/en/option.html#xAxis.axisLabel.rotate]
---
# ECharts 6.1.0: when a category axis hides its labels, and how rotating keeps them

A sibling of [`echarts-axis-labels.md`](echarts-axis-labels.md), which covers `hideOverlap` on value axes and leaves category axes to ECharts' own interval. This covers that interval, for T467 (UX-117: "Top 10 Products by Revenue" drew 11 bars and labelled 3).

## What the source does

Read in the version wechart pins (`packages/charts/package.json`: `echarts` 6.1.0).

- **The auto interval** (`axisLabel.interval` left at `'auto'`, the default; [option reference][interval]) comes from `lib/coord/axisTickLabelBuilder.js`, `calculateCategoryInterval` (L263–319):
  - `rotation = (axisRotate − labelRotate) / 180 · π`. On a horizontal x axis `axisRotate` is 0, so it is minus the label's own `rotate`.
  - `unitSpan` is the pixel distance between two neighbouring categories.
  - Each label's box is measured with the axis's font (`textContain.getBoundingRect`), and **30 % is added to its width and height** ("Magic number", L299–301). The widest and tallest are kept, and never under 7 px.
  - `interval = floor(min(maxW / |unitSpan · cos rotation|, maxH / |unitSpan · sin rotation|))`. ECharts then draws one label in every `interval + 1` categories. At 0 every label is drawn.
  - So a level label (rotation 0) hides its neighbours once its padded width reaches the category's span. A turned one is judged by the smaller of its two sides against the span projected on each, so at 45° or 90° its **height** decides, not its length.
- **Rotation** is `axisLabel.rotate`, in degrees, from −90 to 90 ([option reference][rotate]).
- **Text measurement is exported:** `echarts.format.getTextRect(text, font)` (`lib/export/api/format.js` L44, from `lib/legacy/getTextRect.js`). It builds a zrender `Text` element and returns its bounding rect, the same measurement the interval uses. In a browser zrender measures with a canvas. With no canvas (SSR, or jsdom, whose canvas has no 2D context), it falls back to its table of em fractions (`zrender/lib/core/platform.js`, as `echarts-axis-labels.md` records).

## What wechart does with it

`packages/charts/src/layout/categoryLabels.ts` measures each label as ECharts will, pads it by the same 30 %, and estimates the category span. The span is `categoryAxisPx`, which under-estimates the axis (research `echarts-bar-density.md`), divided by the number of categories. With those it applies ECharts' own formula:
- labels that fit level are left level;
- otherwise they are turned 45° if that keeps every one, else 90°;
- a rotation set in the axis editor is left alone.

## Observed

Rendered through `optionFor` and ECharts' SSR SVG renderer (`packages/charts/src/axisLabels.test.ts`), on 11 Northwind product names, "Other (67)" among them:
- Unturned, at 360 × 260, two names were drawn ("Côte de Blaye", "Alice Mutton").
- Turned as above, all 11 were drawn whole at 360 × 260 and at 640 × 320.
- Four short region names at 640 × 320 were left level.

[interval]: https://echarts.apache.org/en/option.html#xAxis.axisLabel.interval
[rotate]: https://echarts.apache.org/en/option.html#xAxis.axisLabel.rotate
