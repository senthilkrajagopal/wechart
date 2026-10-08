---
library: echarts (value-axis integer ticks, legend icon and placement, bar max width)
packages: [echarts]
version: 6.1.0
researched: 2026-10-08
sources:
  [
    https://echarts.apache.org/en/option.html#yAxis.minInterval,
    https://echarts.apache.org/en/option.html#legend.icon,
    https://echarts.apache.org/en/option.html#series-bar.barMaxWidth,
    https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/component/legend.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/icon.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/rect-layout.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/barGrid.md,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/axisNiceTicks.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/scale/Interval.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/scale/helper.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/scaleRawExtentInfo.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/axis/AxisBuilder.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/axisHelper.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/util/number.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/legend/LegendModel.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/legend/LegendView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/component/legend/ScrollableLegendModel.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/util/layout.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/util/symbol.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/model/mixin/itemStyle.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/layout/barGrid.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/Grid.ts,
  ]
---

# ECharts 6.1.0: whole-number value-axis ticks, the legend's icon and placement, and a bar's maximum width

## Summary

This doc sits beside `echarts.md`, `echarts-axis-labels.md`, `echarts-axis-pixels.md`, `echarts-bar-density.md`, `echarts-text-and-grid.md` and `echarts-end-labels.md`, and contradicts none of them. Where it extends `echarts-bar-density.md`'s width formula, it says so.

Behaviour is cited from the installed 6.1.0 package, the version wechart pins (`packages/charts/package.json`), with line numbers in the compiled `lib/`. `EC` = `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts`. Each file also links its TypeScript source at tag 6.1.0. Those links name the same module, but their line numbers weren't checked, except in `axisNiceTicks.ts`.

What wechart will use:
1. **`minInterval: 1` on the value axis** (`yAxis`, or `xAxis` on a horizontal bar, whichever has `type: 'value'`).
   - Every tick ECharts *generates* is then an integer.
   - That doesn't hold for ticks taken from an explicit non-integer `min` or `max`, or on a `log` axis, where `minInterval` is ignored.
   - Data spanning less than 1 become `[0, 1]`, with only the ticks 0 and 1.
2. **`legend.icon: 'roundRect'` with `itemWidth: 10, itemHeight: 10`** draws a rounded square with a corner radius of `min(w, h) / 4`, which is 2.5 px. No option changes that radius; only an `icon: 'path://…'` can. The icon also inherits a stroke from the series, so set `legend.itemStyle.borderWidth: 0` for a clean 10 × 10 square.
3. **The legend's placement.**
   - `left`/`right` and `top`/`bottom` are resolved independently, so `left: 0` combines freely with `top` or `bottom`.
   - When both `left` and `right` are given, ECharts keeps `left` and drops `right`; likewise `top` wins over `bottom`.
   - The legend reserves no grid space in v6, so wechart keeps offsetting the grid itself.
4. **`series-bar.barMaxWidth`.**
   - It takes pixels, or a percentage of the category band.
   - It caps each **column** (stack), so grouped bars must set it on every series.
   - Capped bars stay centred in their band, and `barGap` is measured as a share of the capped width.
   - The width estimate in `echarts-bar-density.md` becomes `max(1, min(laidBarWidth, cap))`.

## Install

Nothing new: `echarts@6.1.0` is already a dependency of `@wechart/charts`. Every option here belongs to components and series wechart already registers: Grid, Legend, LegendScroll and Bar (`echarts.md`).

## Init / auth pattern

No change from `echarts.md`.

## API surface we will use

### 1. `minInterval` on a value axis

**Documented** ([axis-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md), [option](https://echarts.apache.org/en/option.html#yAxis.minInterval)): `minInterval(number) = 0`, "Minimum gap between split lines. For example, it can be set to be `1` to make sure axis label is show as integer." It is "available only for axis of type 'value' or 'time'."

**How the interval is chosen** (`EC/lib/coord/axisNiceTicks.js:94-119`, `intervalScaleCalcNiceTicks`; [axisNiceTicks.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/axisNiceTicks.ts)):
1. `interval = nice(span / splitNumber, true)`. `splitNumber` defaults to 5 (`ensureValidSplitNumber(opt.splitNumber, 5)`, L95), and the value axis's model default is also `splitNumber: 5` (`EC/lib/coord/axisDefault.js:194`).
2. If `interval < minInterval`, then `interval = minInterval`; if `interval > maxInterval`, then `interval = maxInterval` (L101-109).

`nice(val, round)` returns 1, 2, 3, 5 or 10 × 10^exponent (`EC/lib/util/number.js:512-542`; [number.ts](https://github.com/apache/echarts/blob/6.1.0/src/util/number.ts)). So any nice value of 1 or more is a whole number, and anything below 1 is raised to 1. With `minInterval: 1`, **the interval is always a whole number**, unless `interval` is set (see below).

**The ticks generated** (`EC/lib/scale/Interval.js:130-226`, `getTicks`; [Interval.ts](https://github.com/apache/echarts/blob/6.1.0/src/scale/Interval.ts)):
- They are the multiples of `interval` inside the extent, starting from `niceExtent[0] = ceil(extent[0] / interval) × interval` (`axisNiceTicks.js:113`).
- **The extent's ends are also pushed as ticks when they aren't on a multiple:**
  - if `extent[0] < niceExtent[0]`, a tick is added at `extent[0]` (L156-160);
  - if `extent[1]` lies past the last nice tick, a tick is added at `extent[1]` (L211-216).
- When the extent isn't fixed, its ends are rounded out to multiples of the interval after the clamp: `floor(extent[0] / interval) × interval` and `ceil(extent[1] / interval) × interval` (`axisNiceTicks.js:80-85`, where `autoInterval` is the post-clamp value). Those ends are then whole numbers too.

**Data spanning less than 1** (derived from the code above, not rendered):

| Data | Extent before nice | Interval | Final extent | Ticks |
| --- | --- | --- | --- | --- |
| all `0` | `[0, 0]`, expanded to `[0, 1]` (`EC/lib/scale/helper.js:180-207`, `intervalScaleEnsureValidExtent`) | nice(0.2) = 0.2, raised to 1 | `[0, 1]` | 0, 1 |
| max 0.4, including zero | `[0, 0.4]` | nice(0.08) = 0.1, raised to 1 | `[0, 1]` | 0, 1; a 0.4 bar is drawn at 40 % of the height |
| `scale: true`, data 3.2–3.8 | `[3.2, 3.8]` | raised to 1 | `[3, 4]` | 3, 4 |
| all `5`, `scale: true` | `[5, 5]`, expanded ±2.5 to `[2.5, 7.5]` (`helper.js:184-198`) | nice(1) = 1 | `[2, 8]` | 2 … 8 |

The all-zero row assumes the value axis gets no "contain shape" expansion, which would make the extent `[-1, 1]` (`helper.js:200-202`). That expansion applies only to a bar's **base** axis:
- Bars register their statistics client for the base axis only. `requireAxisStatisticsForBaseBar` passes no `baseAxis`, and `makeClientLookupKey` defaults it to `true` (`EC/lib/layout/barCommon.js:50-57`, `EC/lib/coord/axisStatistics.js:259-288`).
- So the value axis gets no `containShape` handler, and `ctnShp` is false for it (`EC/lib/coord/scaleRawExtentInfo.js:478-492`; [scaleRawExtentInfo.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/scaleRawExtentInfo.ts)).

**Consequence:** for a measure whose values are fractions, such as a 0–1 ratio shown as a percentage, `minInterval: 1` collapses the axis to the ticks "0%" and "100%". Apply it only where the values are whole-number quantities. *Which* measures those are is wechart's decision (Open questions).

**Interactions:**
- **`interval` (user-set) overrides `minInterval`.** `config.interval = userInterval` is applied after the clamp, with "No validation to the specified `interval`" (`axisNiceTicks.js:65-79`). wechart doesn't set `interval`.
- **`splitNumber` is only a target**, and `minInterval` wins over it. So a small span gives fewer segments than `splitNumber`: a span of 2 gives the ticks 0, 1, 2. The docs agree that `splitNumber` "serves only as a recommendation" ([axis-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md)).
- **`scale: true`** only stops zero being forced into the extent (`needIncludeZero = !option.scale`, `EC/lib/coord/axisModelCommonMixin.js:47-49`; `scaleRawExtentInfo.js:152-164`).
  - `minInterval` still clamps the interval, and unfixed ends still round out to whole multiples (table above).
  - The docs add that `scale` "is unavailable when the min and max are set" ([axis-common.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md)).
- **Explicit `min` / `max`** (Customize's axis fields, `packages/charts/src/axis.ts:76-77`).
  - A set end is **fixed** (`fixMM`, `scaleRawExtentInfo.js:108-135`) and isn't rounded out (`axisNiceTicks.js:80-85`).
  - **If a fixed end isn't on a multiple of the interval, a tick is drawn at that exact value** (`Interval.js:156-160, 211-216`). For example, `min: 0.5` gives the ticks 0.5, 1, 2, …, and `min: 0, max: 13` gives an interval of nice(2.6) = 3, so the ticks 0, 3, 6, 9, 12, 13.
  - **So integer-only labels aren't guaranteed once a user types a non-integer bound.** An integer bound gives integer ticks, though the last step may be uneven.
  - The trellis's shared `max` (`packages/charts/src/layout/trellis.ts:140`) is fixed the same way, so a non-integer shared maximum puts a non-integer top tick on every panel.
- **`type: 'log'` ignores `minInterval` and `maxInterval`.** `scaleCalcNice2` passes `minInterval: isIntervalOrTime ? model.get('minInterval') : null`, and a log scale is neither (`axisNiceTicks.js:179-185`; lines 281-282 of [axisNiceTicks.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/axisNiceTicks.ts), checked).
  - The log scale picks its own interval in log space, `max(quantity(span), 1)` decades (`axisNiceTicks.js:123-151`). Its ticks are powers of `logBase`, which are fractional when the data lie below 1 (0.1, 0.01, …).
  - So leaving `minInterval` on an axis that Customize switches to `log` (`axis.ts:75`) is harmless, and has no effect.
- **`alignTicks`.** `EC/lib/coord/axisAlignTicks.js` never reads `minInterval` (grep: no match). Open bug [#18876](https://github.com/apache/echarts/issues/18876) reads "minInterval do not work when set `alignTicks:true` for multiple yAxis". wechart doesn't use `alignTicks` (grep of `packages/charts/src`: no match).

**Labels:**
- **The formatter isn't touched.**
  - A function `axisLabel.formatter` on a value axis is called with `(rawValue, idx, extra)` for each tick (`EC/lib/coord/axisHelper.js:163-173`, `makeLabelFormatter`; [axisHelper.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/axisHelper.ts)). `minInterval` only changes which values reach it.
  - With no formatter, `IntervalScale.getLabel` prints each tick at its own precision (`getPrecision(tick.value)`, `Interval.js:230-245`), so whole-number ticks print without decimals.
  - wechart's own formatters still decide the decimals. For example, the currency format (`axis.ts:45-46`) prints "$1.00" for the tick 1.
- **`showMinLabel` / `showMaxLabel` aren't touched.**
  - They default to `null`, meaning auto (`EC/lib/coord/axisDefault.js:107-109`). `fixMinMaxLabelShow` (`EC/lib/component/axis/AxisBuilder.js:650-727`; [AxisBuilder.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/axis/AxisBuilder.ts)) behaves the same with or without `minInterval`.
  - On an interval scale under `null`, it hides the outermost label only when it intersects its neighbour (L709-717). The auto rule that drops "not nice" end labels applies to time and category scales only (L670-678).
  - So a fixed bound's off-grid tick, such as 13 next to 12, keeps its label unless the two overlap.
  - wechart's `hideOverlap: true` (`axis.ts:109-127`; `echarts-axis-labels.md`) still runs after this, unchanged.

**Option shape**, on whichever axis `applyAxes` identifies as the value axis (`valueKey` in `axis.ts:161-163`):

```ts
{ type: 'value', minInterval: 1 /* only for whole-number measures; see Open questions */ }
```

### 2. The legend's icon, size and gap

**Defaults in the 6.1.0 source** (`EC/lib/component/legend/LegendModel.js:242-315`; [LegendModel.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/legend/LegendModel.ts)): `orient: 'horizontal'`, `left: 'center'`, `bottom: 15`, `padding: 5`, `itemGap: 8`, `itemWidth: 25`, `itemHeight: 14`, and `itemStyle: { color: 'inherit', borderColor: 'inherit', borderWidth: 'auto', … }`.
- `bottom` is `tokens.size.m` = 15 (`EC/lib/visual/tokens.js:143-152`).
- The v6 upgrade guide confirms that "the default position of the legend is now at the bottom of the canvas" ([v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)).

**`icon: 'roundRect'`.**
- The documented built-ins are `'circle'`, `'rect'`, `'roundRect'`, `'triangle'`, `'diamond'`, `'pin'`, `'arrow'` and `'none'`, plus `'image://…'` and `'path://…'`. For a path, "the size of the vector icon will be adapted automatically" ([icon partial](https://github.com/apache/echarts-doc/blob/master/en/option/partial/icon.md)).
- The legend draws a non-series-specific icon with `createSymbol(icon, 0, 0, itemWidth, itemHeight, fill, symbolKeepAspect)` (`EC/lib/component/legend/LegendView.js:493-505`; [LegendView.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/legend/LegendView.ts)).
- `'roundRect'` is a `Rect` whose shape gets `r = Math.min(w, h) / 4` (`EC/lib/util/symbol.js:168, 189-195`; [symbol.ts](https://github.com/apache/echarts/blob/6.1.0/src/util/symbol.ts)). **With `itemWidth: 10, itemHeight: 10`, the result is a 10 × 10 square with a 2.5 px corner radius.**
- **When the icon is set explicitly, it wins over the series' own icon.** For line series, `LineSeries.getLegendIcon` is used only when `legend.icon` is unset or `'inherit'` (`LegendView.js:290-318`). So `'roundRect'` gives lines the same filled square as bars, instead of the default line-and-symbol icon.

**The radius can't be configured through options.**
- `legend.itemStyle` is turned into a style through `ITEM_STYLE_KEY_MAP`: `color`, `borderColor`, `borderWidth`, `opacity`, `shadow*`, `borderType`, `borderDashOffset`, `borderCap`, `borderJoin` and `borderMiterLimit`. There is **no `borderRadius`** (`EC/lib/model/mixin/itemStyle.js:45-49`; [itemStyle.ts](https://github.com/apache/echarts/blob/6.1.0/src/model/mixin/itemStyle.ts)). The radius is set only in the shape maker above.
- The one way to get another radius is `icon: 'path://<rounded-square path>'`.
  - `makePath` scales the path into the `itemWidth × itemHeight` box, centred when `symbolKeepAspect` is on. That is the default, `true` (`symbol.js:300-301`; `LegendModel.js:261`).
  - The radius then scales with the path's own proportions.

**Gotcha: the inherited border.** `legend.itemStyle.borderWidth` defaults to `'auto'` and `borderColor` to `'inherit'`.
- In `getLegendStyle`, `'auto'` becomes `2` whenever the series' visual style has a `lineWidth > 0`, and `'inherit'` takes the series' stroke (`LegendView.js:425-473`).
- wechart's bars carry `borderColor: surface` and `borderWidth: gap`, where the gap is 2 px when kept (`packages/charts/src/series/bar.ts:143-146`, `theme.ts:25`). So a bar series' legend square is stroked 2 px in the surface colour, centred on its edge.
- Derived, not rendered: about 1 px of the 10 px square is painted over on each side, so the swatch reads as roughly 8 × 8.
- `legend.itemStyle: { borderWidth: 0 }` removes the stroke.
- A line series' legend style depends on its item-style `lineWidth`, which wasn't traced (Open questions).

**Text placement.**
- The label starts 5 px after the icon (`textX = itemWidth + 5`) and is centred vertically on `itemHeight / 2` (`LegendView.js:319-336`).
- With `itemWidth: 10`, names gain 15 px of room over the default.
- The pie's side-legend text width in `customize.ts:86-88` (`120 − 2 × 5 − 25 − 5`) assumes the 25 px icon. It must use 10 if the icon shrinks.

**`itemGap`.**
- The docs: "The distance between each legend, horizontal distance in horizontal layout, and vertical distance in vertical layout" ([legend.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/legend.md)).
- `layoutUtil.box(orient, contentGroup, itemGap, …)` adds it between item bounding boxes. A horizontal legend also uses it as the gap between wrapped rows (`EC/lib/util/layout.js:60-111`; [layout.ts](https://github.com/apache/echarts/blob/6.1.0/src/util/layout.ts)).
- **The docs give the default as 10; the 6.1.0 source sets 8** (`LegendModel.js:257`). The source governs, so set `itemGap` explicitly.

### 3. The legend's placement: `left`, `right`, `top`, `bottom`, `orient`

**Documented** ([rect-layout partial](https://github.com/apache/echarts-doc/blob/master/en/option/partial/rect-layout.md)):
- `left` takes pixels, a percentage, or `'left'`, `'center'` or `'right'`, where "the component will be aligned automatically based on position".
- `top` takes pixels, a percentage, or `'top'`, `'middle'` or `'bottom'`.
- `right` and `bottom` take pixels or a percentage.
- The docs say nothing about giving both `left` and `right`.

**What the source does when both are given.**
- The legend's model declares `layoutMode: { type: 'box', ignoreSize: true }`, with the comment "(Setting {left: 10, right: 10} does not make sense)" (`LegendModel.js:68-78`).
- With `ignoreSize`, `mergeLayoutParam` handles each axis on its own (`layout.js:514-545`).
  - Horizontally: if the new option has a value for `left`, `right` is set to `null`. Only otherwise, if it has `right`, is `left` set to `null`.
  - Vertically, `top` wins over `bottom` in the same way.
  - This runs when the component's defaults are merged into the user's option (`EC/lib/model/Component.js:63-69`), and again on every `mergeOption` (L74-76).
- **So `{ left: 0, right: 0 }` puts the legend at the left, and `right` is silently dropped. `{ top: 0, bottom: 0 }` puts it at the top.**
- wechart's legend is `type: 'scroll'` (`packages/charts/src/legend.ts:85`).
  - `ScrollableLegendModel` calls `mergeLayoutParam` again with `ignoreSize: !!ignoreSize`. `ignoreSize` is an array, so this is always `true` (`EC/lib/component/legend/ScrollableLegendModel.js:96-105`; [ScrollableLegendModel.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/legend/ScrollableLegendModel.ts)).
  - Its comment, "Do not `ignoreSize` to enable setting {left: 10, right: 10}", is therefore not what the code does: both axes still keep one end only.
- **This also clears the v6 default `bottom: 15`** whenever wechart gives `top`. The default `left: 'center'` is cleared when wechart gives `right`, and overwritten when it gives `left`.

**How the box is placed** (`getLayoutRect`, `layout.js:199-296`; `LegendView.js:108-119`).
- The legend's content size is measured, then placed by whichever of `left`/`right` and `top`/`bottom` survives.
- `'center'`/`'middle'` centre it, with `padding` (5) between the container edge and the content.
- The horizontal and vertical choices are independent, so these combine without conflict:

| Customize position | Effective option | Placement |
| --- | --- | --- |
| top | `{ left: 0, top: 0 }` | top-left |
| bottom | `{ left: 0, bottom: 0 }` | bottom-left |
| left | `{ left: 0, top: 'middle', orient: 'vertical' }` | left edge, centred vertically |

- **Only `right` conflicts:** `{ left: 0, right: 0, top: 'middle' }` resolves to the **left** edge.
- With `align: 'auto'`, the icon goes on the right of the text only when `left === 'right'` and the legend is vertical (`LegendView.js:95-99`). With `right: 0`, icons stay to the left of their names.

**Does the legend reserve grid space in v6? No.**
- `grid.outerBoundsMode` has two sources of bounds (`EC/lib/coord/cartesian/Grid.js:750-780`; [Grid.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/Grid.ts)): under `'same'`, the grid's own rect; otherwise `outerBounds`, which defaults to the canvas.
- It contains axis labels and names only (`layOutGridByOuterBounds`, `Grid.js:607-684`; `echarts-text-and-grid.md` Q3). Nothing under `EC/lib/coord/cartesian` mentions the legend (grep, case-insensitive: no match).
- So wechart must keep offsetting the grid itself, as `PLACED[…].grid` does today (`customize.ts:91-102`), and `plotEdgesOf` must keep subtracting the same room for the bar-width estimate (`echarts-bar-density.md`).

**The height of a horizontal legend with a 10 px icon** (derived, not measured).
- One row is as tall as `max(itemHeight, text height)`, plus 2 × 5 padding. At 12 px text, the text dominates.
- So `itemHeight: 10` instead of 14 shouldn't push the legend past the 32 px top room (`customize.ts:92`). Check it in SSR.

### 4. `series-bar.barMaxWidth`

**Documented** ([barGrid.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/barGrid.md), [option](https://echarts.apache.org/en/option.html#series-bar.barMaxWidth)):
- `barMaxWidth(number|string) = null`: "The maximum width of the bar. Has higher priority than barWidth."
- It "can be an absolute value like `40` or a percent value like `'60%'`. The percent is based on the calculated category width."
- "In a single coordinate system, this attribute is shared by multiple 'bar' series. This attribute should be set on the last 'bar' series in the coordinate system, then it will be adopted by all 'bar' series in the coordinate system."
- `barMinWidth`: "In cartesian the default value is `1` … Has higher priority than barWidth."

**Units** (`EC/lib/layout/barGrid.js:117-128`; [barGrid.ts](https://github.com/apache/echarts/blob/6.1.0/src/layout/barGrid.ts)).
- `barMaxWidth` is `parsePercent(value, bandWidth)`: a number is pixels, and `'N%'` is N % of the **whole category band**, before the category gap is taken off. `parsePercent` also accepts numeric strings such as `'40'` (`number.js:131-166`).
- It caps the bar's thickness along the **category** axis, so on a horizontal bar it is the bar's height in pixels.

**Per series or per axis? The source contradicts the docs: it is per column.**
- The source's comment: "relevant ec options effect all series … uses some options (e.g., `defaultBarGap`) from the first declared series, and other options (e.g., `barGap`, `barCategoryGap`) from the last declared series" (`barGrid.js:135-141`).
- In `calcBarWidthAndOffset` (L142-259):
  - **`barWidth`, `barMaxWidth` and `barMinWidth` are stored per stack column** (`stackItem.maxWidth = barMaxWidth`, L166-176).
    - A stack column is a `stack` id, or the series index for an unstacked series (`getSeriesStackId`, L61-63).
    - Within a stack, the last series that sets a non-zero value wins.
  - **`barGap` and `barCategoryGap` are axis-wide.** The last series with a non-null value wins. `barGap` starts from the **first** series' `defaultBarGap`, which is `'10%'` (`EC/lib/chart/bar/BaseBarSeries.js:161`) (L150-153, 177-180).
- **Consequence:** in a grouped bar, where each series is its own column, a `barMaxWidth` set on the last series caps only the last column. **Every series must set it**, in every renderer that draws bars: `series/bar.ts`, `series/combo.ts` and `layout/trellis.ts`.
  - In a stacked bar, one series in the stack is enough, but setting it on all of them is harmless.
  - The cross-filter overlay (`crossfilter/highlight.ts:164-169`) spreads `...first`, so it inherits the cap from the first series.

**The algorithm** (`barGrid.js:182-258`), with `W` = the band width and `g` = `barGap` as a fraction (0.1 by default):
1. `catGap = barCategoryGap`, by default `max(35 − 4 × columns, 15)%` of `W`.
2. `auto = (W − catGap) / (n + (n − 1)g)`, floored at 0.
3. For each column with no `barWidth`:
   - if `maxWidth < auto`, it becomes `min(maxWidth, remaining)`;
   - then, if `minWidth > that`, it becomes `minWidth`. **`barMinWidth` wins over `barMaxWidth`:** "`minWidth` should not be restricted by `maxWidth`" (L201-208).
   - A column whose width changed leaves the auto pool, and `remaining −= w(1 + g)`.
4. A column **with** `barWidth` is clamped to `[minWidth, maxWidth]` (L214-229), "as CSS does".
5. The columns still uncapped are recomputed: `auto' = (remaining − catGap) / (k + (k − 1)g)`. **When only some columns are capped, the uncapped ones get wider.**
6. The group is placed centred: `widthSum = Σ w(1 + g) − w_last × g`, `offset = −widthSum / 2`, and each column advances by `w(1 + g)` (L234-257).

**What this means:**
- A capped group is **centred** in its band.
- The gap between bars in a group stays `g × w`, so it shrinks with the capped width.
- All the space the cap frees goes to the band's two margins, widening the visible category gap; the bars don't spread apart.
- With a uniform cap on every column, the drawn width is `max(barMinWidth, min(auto, cap))`. `barMinWidth` defaults to 1 (`barGrid.js:120-123`, as `echarts-bar-density.md` records).

**Effect on wechart's estimate (an addition to `echarts-bar-density.md`).**
- `laidBarWidth` (`series/bar.ts:191-195`) is ECharts' `auto`.
- With a pixel cap `C` on every series, the drawn width is `max(1, min(laidBarWidth(…), C))`, and **that** is the value to feed `gapFor`.
- `gapFor` keeps the 2 px gap only for bars at least `3 × gapPx = 6` px wide (`bar.ts:205-207`). So a cap of 6 px or more never removes the gap from a bar that would otherwise keep it.
- `interaction/itemsInShape.ts:183-185` rebuilds each bar's rectangle for marking hit-tests from `laidBarWidth` and the `0.1 × width` group gap. It needs the same `min(…, C)`, or the hit area stays wider than the drawn bar. The centring formula there is unchanged, because ECharts centres a capped group the same way.
- A **percentage** cap must be resolved against the band width (`categoryAxisPx / categories`) before it can be compared.

**Option shape** (the value is a design decision, not given here):

```ts
// every bar series, in bar.ts, combo.ts and trellis.ts
{ type: 'bar', barMaxWidth: CAP_PX /* or 'N%' of the category band */, … }
```

## Interactions with wechart's Customize settings

- **Axis `min` / `max`** (`axis.ts:76-77`) fix the ends. A non-integer value produces a non-integer end tick even with `minInterval: 1` (§1). Whether to round stored bounds, hide end labels with `showMinLabel`/`showMaxLabel: false`, or accept the tick is a design question.
- **"Include zero" off → `scale: true`** (`axis.ts:72`). Compatible with `minInterval`: the unfixed ends round out to whole numbers (§1).
- **Log** (`axis.ts:75`), with its implied `logBase` (default 10, `axisDefault.js:231-233`): `minInterval` is ignored. The ticks are powers of 10, fractional below 1.
- **Number format** (`axis.ts:40-47`): the formatter is unaffected. With `percent` on a 0–1 measure, `minInterval: 1` leaves only 0 % and 100 % (§1).
- **Legend show and position** (`customize.ts:155-166`).
  - Today the code removes only `top` from the base legend before applying `PLACED[position].legend`.
  - If `legendFor` gains `left: 0` (left-aligned), the **right** placement becomes `{ left: 0, right: 0, top: 'middle' }`. ECharts keeps `left` (§3), so the legend is drawn at the left edge while the grid reserves 120 px on the right.
  - So the placement step must strip all of `left`, `right`, `top` and `bottom` before applying the placed values.
  - The bottom and left placements combine with `left: 0` without conflict.
- **The pie's side legend** (`customize.ts:86-88`): its text width assumes a 25 px icon. With `itemWidth: 10` it should be `120 − 10 − 10 − 5`.
- **Hidden series and series order** (`customize.ts:140-150`, `inSeriesOrder`): a hidden series is removed. If it was the one in a stack that carried `barMaxWidth`, the cap goes with it. Setting the cap on every series avoids that.

## Gotchas

- **The docs and the 6.1.0 source disagree in three places, and the source governs:**
  - `legend.itemGap`: the docs say 10; the source sets 8 (`LegendModel.js:257`).
  - `barGap`: the docs say `'20%'`; the effective default is the first series' `defaultBarGap: '10%'` (`BaseBarSeries.js:161`; `barGrid.js:151-153`).
  - `barMaxWidth`: the docs say "set on the last series … adopted by all"; the source caps per stack column (§4).
- **An explicit `interval` silently replaces `minInterval`** (`axisNiceTicks.js:75-79`).
- **The v6 legend default is at the bottom** (`bottom: 15`, `left: 'center'`). wechart's explicit `top: 0` clears `bottom` through `ignoreSize`, but a legend option written without any vertical key would land at the bottom ([v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/); `LegendModel.js:247-250`).
- **`barGap` is axis-wide, and the last series' value wins.** The cross-filter overlay sets `barGap: '-100%'` as the last series (`crossfilter/highlight.ts:164-169`), so it governs the gap of every column on that axis. If `share()` can run on a grouped bar with several series, every column would be overlaid. Whether that path is reachable wasn't checked.
- **A partial cap produces unequal widths:** capping only some columns widens the rest (§4, step 5).
- **`barMinWidth` beats `barMaxWidth`:** a `barMinWidth` larger than the cap wins (`barGrid.js:201-208`).
- **The legend icon's inherited stroke** shrinks the visible swatch (§2). Set `legend.itemStyle.borderWidth: 0`.
- **The 6.0.0 and 6.1.0 changelog** (a summarising fetch) returned no entries for `minInterval`, `splitNumber`, the legend icon, `itemGap`, `barWidth`, `barMaxWidth`, `barGap` or `barCategoryGap` ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). Treat its completeness as unverified; `echarts-end-labels.md` notes the same caveat.
  - The 6.1.0 axis items it did return: `dataMin`/`dataMax` for a nice extent (#20838), `containShape` across axis types (#21511) with the [Break] note that bars no longer overflow the grid, and `axisLabel.formatter` receiving its index (#21220).
- **Open issues seen** (fetches of GitHub issue searches; the web-search budget was exhausted):
  - [#18876](https://github.com/apache/echarts/issues/18876): `minInterval` with `alignTicks`.
  - [#16516](https://github.com/apache/echarts/issues/16516): "candlestick barMaxWidth will not work when barWidth is set" (candlestick only, not bar).
  - [#20552](https://github.com/apache/echarts/issues/20552): bar width on time axes, which wechart doesn't use.
  - No open issue matched legend `roundRect`.

## Alternatives considered

Not requested.

## Open questions / unverified

- **Which measures get `minInterval: 1`?** Count-type measures, measures whose values are all integers, or any measure not formatted as a percentage? That is a requirement for the user or the spec; don't invent it.
- **A non-integer Customize `min`/`max` with `minInterval`:** round it, hide the end label, or accept a fractional end tick? A design call.
- **The cap's value and form** (pixels or a percentage), and whether it applies to trellis panels and combo bars too: a design call.
- **Not rendered in wechart's SVG SSR harness.** Each of these needs a test in `packages/charts`:
  - the `[0, 1]` axis for all-zero data and for a 0.4 maximum;
  - the legend's `roundRect` `rx` of 2.5 px and the effect of its inherited 2 px stroke;
  - the legend at `{ left: 0, right: 0 }` landing on the left;
  - a capped grouped bar staying centred.
- **UNVERIFIED:** a line series' legend icon stroke under `icon: 'roundRect'`. It inherits from the line's item-style visual (`LegendView.js:166, 445-473`). What `lineWidth` that visual carries for wechart's lines wasn't traced; `series/line.ts` sets `symbolSize` only.
- **UNVERIFIED:** whether a 10 px icon changes the scroll legend's height or page buttons in a way the 32 px top room (`customize.ts:92`) doesn't cover. Not measured.
- **UNVERIFIED:** whether an open issue titled "The legend is blurry in svg rendering mode" applies to 6.1.0. It appeared in an issue-search fetch but wasn't opened.
