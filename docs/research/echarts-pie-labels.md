---
library: Apache ECharts, pie and donut data labels
packages: [echarts]
version: '6.1.0'
researched: 2026-09-26
sources: [https://echarts.apache.org/en/option.html#series-pie.label.overflow, https://echarts.apache.org/en/option.html#series-pie.label.alignTo, https://echarts.apache.org/en/option.html#series-pie.labelLayout]
---
# ECharts 6.1.0: why a pie's labels end in "…", and how to keep them whole

A sibling of [`echarts.md`](echarts.md) and [`echarts-axis-labels.md`](echarts-axis-labels.md). T395 (AC-303: a pie's or donut's data labels drawn whole, moving or hiding those that don't fit) relies on it.

## What the source does

Read in the version wechart pins (`packages/charts/package.json`: `echarts` 6.1.0).

- **Defaults** (`lib/chart/pie/PieSeries.js` L153–174, L209):
  - `label.overflow: 'truncate'`;
  - `position: 'outer'` and `alignTo: 'none'`;
  - `edgeDistance: '25%'` (only with `alignTo: 'edge'`);
  - `distanceToLabelLine: 5`;
  - `avoidLabelOverlap: true`.
- **Where the width comes from** (`lib/chart/pie/labelLayout.js` L140–168): each outer label gets the room between its anchor and the view's edge, less `bleedMargin`.
  - `bleedMargin` is 10 when the view's smaller side is over 200 px, else 2 (L313–317).
  - With `alignTo: 'edge'`, the room runs from the label line's end to `edgeDistance` from the edge. With `'labelLine'`, it is set by the outermost label line.
- **`constrainTextWidth`** (L205–256) runs when that room is narrower than the text:
  - it sets the label's `style.width` to the room;
  - `overflow: 'truncate'` then cuts the text to it with "…";
  - `'break'` or `'breakAll'` wraps it instead;
  - a label whose own `style.width` is set is left alone (L214–216).
- **Hiding.** A slice narrower than `minShowLabelAngle` (0 by default) has no label (L321–330). The series' `labelLayout: { hideOverlap: true }` hides a label that meets another; it is laid out by the `LabelLayout` feature, which `packages/charts/src/echarts.ts` registers (research `echarts-axis-labels.md`: the same `hideOverlap` helper).

## Observed

A scratchpad script rendered a 220 px high pie through ECharts' SSR SVG renderer. It had four slices, labelled "$1,234,567.00", "$234,567.00", "$34,567.00" and "$4,567.00":

| Width | Settings | Labels drawn |
| --- | --- | --- |
| 260 px | defaults (`overflow: 'truncate'`) | "$1,2...", "$...", "$34,...", "$4,567.00": the AC-303 failure |
| 420 px | defaults | all whole |
| 260 px | `overflow: 'none'` | all whole; "$1,234,567.00" starts at x 215, so it runs past the 260 px edge, and "$234,567.00" ends at x 34, so it runs past the left |
| 200 and 260 px | `overflow: 'none'`, `alignTo: 'edge'`, `edgeDistance: 4` | all whole; right-side labels end 4 px from the right edge, left-side ones start 4 px from the left |

So `alignTo: 'edge'` with `overflow: 'none'` keeps every label whole. It keeps a label inside the chart only while the pie's box is wider than the label plus `edgeDistance`. `hideOverlap` hides labels that meet one another. It does not hide a label that meets the ring.

~~So `alignTo: 'edge'` with `overflow: 'none'` keeps every label whole and inside the chart.~~ Corrected by T395's review, which rendered through the app's own ECharts setup:
- An edge-aligned label is pinned at `edgeDistance` inside its box's edge, right-aligned on the right and left-aligned on the left, and its text grows inward from there (`lib/chart/pie/labelLayout.js` L360–362, L369).
- So a label wider than its room runs over the ring. Once it is wider than the box less `edgeDistance`, it runs past the box's far side too.
- Measured, with a side legend's 120 px taken out of a 180 px chart: "$1,234,567" drawn from x −8 to 52.

## The pie's box and its radii

- **The box** (`lib/util/layout.js`, `getCircleLayout` from L174): the series' `left`, `right`, `top` and `bottom` inside the chart.
- **The radii** are `radius`'s two values as shares of half the box's shorter side: `size = Math.min(width, height)`, then `r0 = parsePercent(radius[0], size / 2)` and `r = parsePercent(radius[1], size / 2)`.
- **An inside label** (`position: 'inside'`) is centred halfway between the two radii along its slice's middle (`labelLayout.js` L350–351), and centre-aligned (L369).

## What wechart does with it (T395)

`fitPieLabels` in `packages/charts/src/series/pie.ts` works out, from the canvas, the room beside the ring for the widest formatted label. That label is estimated at 0.6 em a character, at 12 px. Then:
1. Where the room is there, the labels are drawn beside the ring.
2. Otherwise the ring's radii are scaled down, to half their size at most, until the room is there.
3. Otherwise a pie's labels go inside its slices, where they stay within the box. A donut's band is too thin for them.
4. Otherwise the labels are not drawn.
