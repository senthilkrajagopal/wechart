---
library: ECharts scatter jitter, and placing points by pixel offset
packages: []
version: 6.1.0
researched: 2026-10-18
sources:
  [
    https://github.com/apache/echarts/blob/6.1.0/src/util/jitter.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/scatter/jitterLayout.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/visual/symbol.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/util/symbol.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/helper/Symbol.ts,
    https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/scatter.md,
    https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/axis-common.md,
  ]
---

# ECharts 6.1.0: scatter jitter, and seeded point placement

For T991 (AC-592, AC-306), which draws a box plot's points as All (jittered) or Beeswarm (side by side, without overlap), "from a fixed seed so a redraw or an image places every point the same". Design 23 lists the research needed as "ECharts 6.1's jitter and `jitterOverlap`, and how its placement can be seeded (the study: 'not published')". Each fact below was read from the installed 6.1.0 package (`node_modules/echarts/lib/…`, the compiled form of the sources above) and, where it says so, checked by an SSR render in `packages/charts/src/series/boxplot.test.ts`.

## ECharts' own jitter can't be seeded

- **What it is.** The `ScatterJitter` feature (`echarts/features`) adds axis options `jitter` (the spread in pixels), `jitterOverlap` and `jitterMargin`. It applies only to a scatter on a category axis of a cartesian grid, or on a single axis (`needFixJitter` in `lib/util/jitter.js`; see also `box-plot.md` and `rich-tiles-and-combo-tech.md`).
- **It's random, with no seed.** `fixJitterIgnoreOverlaps` returns `floatCoord + (Math.random() - 0.5) * jitter` (`lib/util/jitter.js` lines 93 and 97). No option reaches a seed, and the module takes no random source. Two renders of the same data place points differently.
- **Avoiding overlap gives up quietly.** With `jitterOverlap: false`, each point is pushed to the nearest free place in either direction. If that is more than `jitter / 2` away, or beyond the band less the radius, it "falls back to random jitter" (`fixJitterAvoidOverlaps`, the comment at line 114), so the points can overlap and nothing says so.
- **Its state lives on the axis.** The placed points are kept on the axis (`inner(fixedAxis).items`), so placement depends on the order the series lay out.

So ECharts' jitter meets neither "a fixed seed" nor "no two Beeswarm points overlap" with the fallback said (AC-592). wechart places each point itself (below) and leaves `ScatterJitter` unregistered.

## Placing a point by pixel offset

- **`symbolOffset`, per data item.** A scatter data item may carry `symbolOffset: [x, y]`, in pixels (or percent of the symbol size), relative to where its value puts it ([series-scatter `symbolOffset`](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/scatter.md)).
  - The data visual reads it per item, as one of `SYMBOL_PROPS_WITH_CB`, with `itemModel.getShallow('symbolOffset', true)` (`lib/visual/symbol.js`).
  - `normalizeSymbolOffset` turns a number into `[n, n]` and a percent into pixels (`lib/util/symbol.js` line 327).
  - `Symbol` sets the symbol path's `x` and `y` to it (`lib/chart/helper/Symbol.js` lines 214–217).
- **On a category axis**, a scatter item `[categoryName, value]` sits at its band's centre (`boundaryGap` is true by default for category axes, [axis-common](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/axis-common.md)), the same place as that category's box. So a horizontal `symbolOffset` moves a point sideways from its box's centre by exactly that many pixels, whatever the canvas.
- **A value axis with `min` and `max` set** runs exactly from `min` to `max`; ECharts doesn't widen a set end to a "nice" value (axis-common, `min`/`max`). So pixels per unit along it are the plot's height divided by `max − min`.

## What wechart does with these (T991)

- Each point's horizontal offset is computed in pixels by a deterministic placement: a beeswarm, or a jitter from a seeded generator. It is handed to ECharts as `symbolOffset: [dx, 0]`.
- Vertical distances are estimated from a lower bound on the plot's height and a value axis whose `min` and `max` wechart sets. Because the real distances are never smaller than the estimate, points placed 8 px apart in the estimate are at least 8 px apart as drawn. The SSR render in `boxplot.test.ts` measures every pair of drawn points.
