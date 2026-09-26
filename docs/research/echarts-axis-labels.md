---
library: Apache ECharts, overlapping axis tick labels
packages: [echarts]
version: '6.1.0'
researched: 2026-09-26
sources: [https://echarts.apache.org/en/option.html#xAxis.axisLabel.hideOverlap, https://github.com/apache/echarts/issues/14266]
---
# ECharts 6.1.0: hiding tick labels that would overlap

A sibling of [`echarts.md`](echarts.md) and [`echarts-text-and-grid.md`](echarts-text-and-grid.md), which names `hideOverlap` among ECharts' layout steps without saying what turns it on for an axis. T391 (AC-299) relies on it for value axes.

## What the source does

Read in the version wechart pins (`packages/charts/package.json`: `echarts` 6.1.0), `lib/component/axis/AxisBuilder.js`:

- **L262:** the axis reads `optionHideOverlap: axisModel.get(['axisLabel', 'hideOverlap'])`. It is an option of any axis's `axisLabel`, the value axis's included ([option reference][opt]).
- **L595–612, `layOutAxisTickLabel`:** after the labels are built and laid out, and after `fixMinMaxLabelShow`, when the option is set it calls `hideOverlap` over the labels not already hidden. The source comment gives the reason: "This bit fixes the label overlap issue for the time chart", citing [apache/echarts#14266][issue].
- **`lib/label/labelLayoutHelper.js` L389, `hideOverlap(labelList)`:** the labels are sorted by priority, and a label that intersects one already kept is marked `ignore`; an ignored label isn't drawn. Boxes that touch within `touchThreshold: 0.05` px aren't taken as intersecting (L415–417).
- **A label's box** is its measured width by one line high. zrender's line height is the width of a wide character (`zrender@6.1.0` `lib/contain/text.js` L109–111, `getLineHeight`), and with no canvas, as in SSR, a character's width comes from a table of em fractions, a character not in it taking a whole em (`lib/core/platform.js` L39–54): in SSR a 12 px label's box is 12 px high. In a browser both are measured with the canvas.
- **The same code serves every cartesian axis type**, a log axis included, so the option thins a log value axis as it does a linear one.

A category axis has ECharts' own label interval as well, and T391 leaves category axes to it.

## Observed

Rendered through `optionFor` and ECharts' SSR SVG renderer (`packages/charts/src/testing/renderToSvg.ts`), on a horizontal bar of four amounts between 1.2 and 4.9 million:
- Without the option, at 220 px wide, "1,000,000" and "2,000,000" were drawn 28 px apart. By the table above each is about 54 px wide (0.56 em a digit, 0.28 em a comma); the test's own estimate, 0.6 em a character, makes it 65.
- With it, at 220, 360 and 640 px, no two value-axis labels overlapped. Fewer were drawn at 220 px than at 640 px, and at least one at every width (`packages/charts/src/axisLabels.test.ts`).
- The same held for a log value axis at 220 px: unthinned, "100,000" and "1,000,000" were 19.6 px apart. It also held in each panel of a 20-panel trellis at 640 × 320. Unthinned, a panel's labels were 5.96 px apart; thinned, 11.92 px apart, boxes that ECharts takes as touching.

[opt]: https://echarts.apache.org/en/option.html#xAxis.axisLabel.hideOverlap
[issue]: https://github.com/apache/echarts/issues/14266
