---
library: Apache ECharts, pixel conversion on a category axis
packages: [echarts]
version: '6.1.0'
researched: 2026-09-26
sources: [https://echarts.apache.org/en/api.html#echartsInstance.convertFromPixel, https://echarts.apache.org/en/api.html#echartsInstance.convertToPixel, https://echarts.apache.org/en/api.html#echartsInstance.containPixel]
---
# ECharts 6.1.0: what the pixel converters give on a category axis

A sibling of [`echarts.md`](echarts.md), whose §"Hit-testing" records the documented signatures of `convertToPixel`, `convertFromPixel` and `containPixel` ([API][api-from]) but not what they return on a category axis. T386 (AC-093) reads a drag along a time dimension's category axis with them, so their answers there are recorded here.

## Observed

Observed locally on 2026-09-26, with the version wechart pins (`packages/charts/package.json`: `echarts` 6.1.0), in Node, on an instance made with `echarts.init(null, null, { renderer: 'svg', ssr: true, width: 600, height: 300 })` and a bar chart over a category x axis of four categories `a`–`d`:

| Call | Answer |
| --- | --- |
| `convertFromPixel({ xAxisIndex: 0 }, 100)`, `250`, `400` | `0`, `1`, `2`: the **index** of the band under the pixel |
| `convertFromPixel({ xAxisIndex: 0 }, 550)` | `4`: past the last band it doesn't stop at 3, so the caller clamps |
| `convertFromPixel({ gridIndex: 0 }, [250, 150])` | `[1, 1.806…]`: the band's index, and the value on the y axis |
| `convertToPixel({ xAxisIndex: 0 }, 'b')` and `(…, 1)` | `258.75` both: a category's **name or its index** gives its band's centre |
| `containPixel({ gridIndex: 0 }, [300, 150])` / `[300, 299]` | `true` / `false`: inside and outside the grid |

## What wechart relies on

- A drag's ends are read as band indices, rounded and kept on the axis (`bucketRangeAt` in `packages/charts/src/interaction/axisRange.ts`). An answer that isn't a finite number is no range.
- A stripe is placed from the stored bounds, with each band's centre from `convertToPixel` by the category's name, and the grid's edges found by halving with `containPixel` (`edgeBetween`).
- The end-to-end test `e2e/markings.spec.ts` ("in range mode a drag along the time axis…") exercises all three in the browser.

[api-from]: https://echarts.apache.org/en/api.html#echartsInstance.convertFromPixel
