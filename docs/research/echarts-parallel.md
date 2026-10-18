---
library: ECharts parallel coordinates (series-parallel, parallel, parallelAxis)
packages: []
version: 6.1.0
researched: 2026-10-18
sources:
  [
    https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/parallel-axis.md,
    https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/parallel.md,
    https://github.com/apache/echarts/blob/6.1.0/src/export/charts.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/parallel/install.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/parallel/ParallelSeries.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/parallel/ParallelView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/parallel/ParallelModel.ts,
  ]
---

# ECharts 6.1.0: parallel coordinates

For T982 (AC-598), drawing parallel coordinates. The import names (`echarts/charts`, `echarts/core`) are covered by `echarts.md`; this doc covers how the `parallel` series behaves. Each fact below was read from the installed 6.1.0 package (`node_modules/echarts/lib/…`, the compiled form of the source files listed above) and, where it says so, checked by rendering through ECharts' SSR in `packages/charts/src/series/parallel.test.ts`.

## Install

- `ParallelChart` is exported from `echarts/charts` (`lib/export/charts.js` line 61).
- Its `install` calls `use(installParallelComponent)`, so registering `ParallelChart` also registers the `parallel` component and its `parallelAxis`. It also registers `parallelVisual` at the brush's visual priority (`lib/chart/parallel/install.js`). No separate `ParallelComponent` registration is needed (it is exported from `echarts/components` for use without the series).

## Option shape

- **Coordinate system:** `parallel: { left, top, right, bottom, layout }`. The defaults are `left: 80, top: 60, right: 80, bottom: 60, layout: 'horizontal'` (`lib/coord/parallel/ParallelModel.js`). With `'horizontal'` the axes stand vertically, side by side.
- **Axes:** `parallelAxis: [{ dim, type: 'value', name, nameLocation, nameGap, nameTextStyle, min, max, interval, axisLine, axisTick, axisLabel }]`. `dim` is the index into each data item's value array ([parallel-axis.md](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/parallel-axis.md)). Without `encode`, the series maps each axis's `dim` to that data dimension (`makeDefaultEncode` in `lib/chart/parallel/ParallelSeries.js`).
- **Series:** `{ type: 'parallel', lineStyle: { width, opacity, color }, data: [{ name, value: [v0, v1, …] }] }`. The series defaults are `lineStyle: { width: 1, opacity: 0.45 }`, `inactiveOpacity: 0.05`, `activeOpacity: 1`, `progressive: 300` and `smooth: false` (`ParallelSeriesModel.defaultOption`). So wechart sets the width and opacity itself.
- An empty value (`null`) on an axis leaves that point out of the line (`createLinePoints` skips values for which `isEmptyValue` holds, in `lib/chart/parallel/ParallelView.js`).

## As drawn (checked by SSR render, `parallel.test.ts`)

- **Each line is one SVG `<polyline>`** with `stroke-width` and `stroke-opacity` from `lineStyle`, inside a group clipped to the coordinate system's rect. `ParallelView` draws a `graphic.Polyline` per data item (`addEl`).
- **Axis name and labels.** With `nameLocation: 'end'`, a two-line `name` (`"Revenue\n$1,130"`) is drawn as two `<text>` elements centred over the axis's top end. With `axisLabel: { align: 'center', verticalAlign: 'top', margin: 0 }` and a formatter that returns text only for the minimum, the one label is centred under the axis's lower end. With `interval: max − min`, ticks fall only at the two ends.
- **Clip on first render.** On first render the series' group gets a clip rect whose width starts at 0 and is animated to full (`createGridClipShape`). With `animation: false` it is set at once, and the SSR output shows the full rect.

## Gotchas

- The clip rect is removed in a `setTimeout` after the initial animation, so a static SVG snapshot still carries the clip path.
- Brushing a parallel axis (`axisareaselected`) dims lines outside the range to `inactiveOpacity`. That is T983's subject and isn't covered here.
