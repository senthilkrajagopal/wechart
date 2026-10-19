---
packages: [echarts]
version: 6.1.0
researched: 2026-10-18
---

# ECharts parallel axis brushing (axisAreaSelect)

For T983 and T984 (AC-599, AC-600): brush along parallel axes, marking the members whose lines pass every brushed range, Ctrl/⌘ adding a brush. File paths are relative to `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/` (or `zrender@6.1.0/node_modules/zrender/`); the package ships `lib/` and `types/` only, so line numbers refer to `lib/`. **(code reading)** marks behaviour read from the source and not run. The sibling doc `echarts-parallel.md` covers how the series is drawn.

## Recommendation

**Draw the brushes in wechart (a host-drawn band and its own hit test, state held by the dashboard) and keep the ECharts parallel series for drawing only.** ECharts' built-in brush doesn't fit:

1. **No second brush on an axis by pointer, with or without a modifier.** Each axis's brush runs in `brushMode: 'single'`, so a new drag clears that axis's covers (`ParallelAxisView.js` 122–126; `lib/component/helper/BrushController.js` 75–84, 550–558). No ECharts brush code reads `ctrlKey`, `metaKey` or `shiftKey`.
2. **Intervals set by action aren't drawn on the axis they target** until a later full render (`ParallelAxisView.js` 62–65, 154–159; [issue #18446](https://github.com/apache/echarts/issues/18446)).
3. **Intervals aren't part of the option**: `setOption(…, { notMerge: true })` drops them (`lib/core/echarts.js` 463–470), which wechart's canvas does on every draw.
4. **It gets in the way of clicks**: a click inside an axis's 20 px band clears that axis's brush (`BrushController.js` 56, 572–583), covers sit at z 10000 above the lines (`BrushController.js` 55, 267–274), and every chart mousedown not on a draggable element is `preventDefault`ed (`BrushController.js` 602–603).
5. **Brushed lines lose per-item opacity**: once an axis has intervals, lines take `activeOpacity` (1) or `inactiveOpacity` (0.05) (`lib/chart/parallel/parallelVisual.js` 44–68; `ParallelSeries.js` 80–103). Per-item `lineStyle.opacity` is honoured only while no axis is brushed — which is how wechart fades unmarked lines.

The built-in brush's semantics — AND across axes, OR within an axis, bounds inclusive (`lib/coord/parallel/Parallel.js` 239–282; `AxisModel.js` 88–110) — are what wechart's own brush reproduces.

## Geometry (for the host's hit test)

- `chart.convertToPixel` / `convertFromPixel` don't work for parallel: `Parallel` defines neither (`echarts.js` 1456–1474). `chart.containPixel({ parallelIndex: 0 }, [x, y])` does (`Parallel.js` 101–109).
- With `layout: 'horizontal'` (the default) and no axis expand: the rect is `parallel.left/top/right/bottom` (`Parallel.js` 116–120); axis *i* of *n* is at `x = rect.x + i · rect.width / (n − 1)` (`Parallel.js` 185–201, 356–363); a value axis with explicit `min`/`max` puts `v` at `y = rect.y + rect.height · (1 − (v − min) / (max − min))` (`Parallel.js` 180–205). wechart's `parallel.ts` already uses this formula for its line names.

## Keeping ECharts' own brush from starting

- The brush band is the axis extent plus `min(30, 10 % of its length)` at each end, `areaSelectStyle.width` (20 px) across (`ParallelAxisView.js` 77–121). No option turns it off **(open question)**; a mousedown on a draggable element doesn't start it (`BrushController.js` 602). wechart's drag overlay is a DOM layer over the canvas, so the chart's own handlers see no drag while it is active **(UNVERIFIED; checked by T983's e2e)**.

## Events, for reference

- `axisareaselected` fires on every `dispatchAction({ type: 'axisAreaSelect' })`, user or code, unless silent (`echarts.js` 1524–1587); not on `setOption`. Payload `{ parallelAxisId, intervals }` in data units (`ParallelAxisView.js` 128–147).
- Active items: `seriesModel.getRawIndicesByActiveState('active')` (`ParallelSeries.js` 62–77), reached through the untyped `chart.getModel()`.

## Open questions

1. Whether a mousedown in an axis's band still starts ECharts' brush under wechart's overlay (T983's e2e answers it on the real surface).
2. Event interval order on `inverse` axes (not used by wechart).
