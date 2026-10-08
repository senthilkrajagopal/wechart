---
library: echarts (end and direct labels)
packages: [echarts]
version: 6.1.0
researched: 2026-10-08
sources:
  [
    https://echarts.apache.org/en/option.html#series-line.endLabel,
    https://echarts.apache.org/en/option.html#series-line.labelLayout,
    https://echarts.apache.org/en/option.html#series-bar.label.position,
    https://echarts.apache.org/en/option.html#series-bar.labelLayout,
    https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/label-layout.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/label.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/line/LineView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/line/LineSeries.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/label/LabelManager.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/label/labelLayoutHelper.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/label/labelStyle.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/bar/BarView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/Grid.ts,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/Element.ts,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/graphic/Text.ts,
    https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/line-race.ts,
  ]
---

# ECharts 6.1.0: series end labels and direct labels (line, area, bar)

## Summary

This doc sits beside `echarts.md`, `echarts-text-and-grid.md`, `echarts-axis-labels.md`, `echarts-category-labels.md`, `echarts-pie-labels.md` and `echarts-bar-density.md`, and contradicts none of them. It is for R76's dashboard-Q1: "View as table" moves into the ⋯ menu, and design rule 5 asks for a legend at 2 or more series plus direct labels at the series' end at 4 or fewer.

Line numbers below are in the compiled `lib/` of the installed package, the version wechart pins:
- `EC` = `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts`
- `ZR` = `node_modules/.pnpm/zrender@6.1.0/node_modules/zrender`

Each claim also links the TypeScript file at tag 6.1.0.

1. **Lines and areas have `series-line.endLabel`, since 5.0.0.**
   - It places one label at the series' **last non-null point**, and trailing `null`s are skipped by itself.
   - It also works on stacked and area lines. On a stacked series it sits at the **cumulative** top edge of the band, but its text is the series' **raw** value.
   - Sources: [docs](https://echarts.apache.org/en/option.html#series-line.endLabel), [LineView.ts](https://github.com/apache/echarts/blob/6.1.0/src/chart/line/LineView.ts).
2. **Bars have no `endLabel`.**
   - The word appears only in the line series, in the docs ([bar.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md)) and in the source (`endLabel` matches only `chart/line/LineView.js` and `chart/line/LineSeries.js` in `EC/lib`).
   - A direct bar label is a per-data-item `label` on the item chosen.
3. **Overlap is handled by `labelLayout: { moveOverlap: 'shiftY', hideOverlap: true }`, which works on end labels.**
   - It is per series, and it needs the `LabelLayout` feature, which wechart already registers (`packages/charts/src/echarts.ts:36,58`).
   - It isn't documented at the root level.
   - Both actions act on **every** opted-in label in the chart instance, across series and grids.
4. **End labels reserve no grid space.** Neither `outerBoundsMode` nor `containLabel` counts series labels, so leave room with an explicit `grid.right`.
5. **Colour:**
   - with no `color`, an end label is `#333` with an automatic background-coloured halo;
   - with `color: 'inherit'`, it takes the series colour;
   - with an explicit ink-token colour, it takes that colour and has **no** halo.

## Install

Nothing new: `echarts@6.1.0` is already a dependency of `@wechart/charts`.
- **`LabelLayout`** (from `echarts/features`) is already in `echarts.use([...])` (`packages/charts/src/echarts.ts:36,58`).
  - Without it, `labelLayout` does nothing.
  - The label manager is installed by `installLabelLayout`, which registers the `series:beforeupdate` and `series:layoutlabels` lifecycles (`EC/lib/label/installLabelLayout.js:48-65`; [installLabelLayout.ts](https://github.com/apache/echarts/blob/6.1.0/src/label/installLabelLayout.ts)).
- **`MarkPointComponent`** is exported (`EC/lib/export/components.js:60`) but **not** registered by wechart. It is needed only if the `markPoint` route below is chosen.

## Init / auth pattern

No change to `echarts.md`'s init pattern.
- wechart's line and bar options set `animation: false` (`packages/charts/src/series/line.ts:46`, `bar.ts:117`).
- That matters here: the end label's position is set synchronously on the first render. `createLineClipPath` calls `during(1, clipPath)` "to make sure label layout is right" (`EC/lib/chart/line/LineView.js:446-449`).
- `labelLayout` then runs in the `series:layoutlabels` lifecycle, after render (`installLabelLayout.js:57-65`).

## API surface we will use

### 1. `series-line.endLabel` (lines, areas, stacked areas)

**Options.** `LineEndLabelOption extends SeriesLabelOption { valueAnimation?: boolean }` (`EC/types/src/chart/line/LineSeries.d.ts:25-27`). The docs build it from the shared label partial with `formatter = true`, `noPosition = true` and `labelMargin = true` ([line.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md)). So:
- **no `position`**;
- `show`, `distance`, `rotate`, `offset`, `silent`, `precision` and `valueAnimation` (`EC/types/src/util/types.d.ts:1043-1054`);
- `minMargin`, `textMargin` (new in 6.0.0), `overflow`, `lineOverflow`, `ellipsis` and `rich` (`types.d.ts:1059-1092`; [label.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/label.md));
- all text-style props: `color`, `font*`, `align`, `verticalAlign`, `width`, `textBorder*` and so on ([text-style.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md));
- `formatter`, a string template or a callback.

**Defaults in the source** (`EC/lib/chart/line/LineSeries.js:105-109`; [LineSeries.ts](https://github.com/apache/echarts/blob/6.1.0/src/chart/line/LineSeries.ts)): `show: false`, `valueAnimation: true`, `distance: 8`. The generic label partial documents `distance` as 5; for `endLabel` the source's 8 governs.

**Default alignment** (`getEndLabelStateSpecified`, `LineView.js:460-472`):

| Base axis | `align` | `verticalAlign` | When inverse |
| --- | --- | --- | --- |
| Horizontal (category x) | `'left'` | `'middle'` | `'right'` |
| Vertical | `'center'` | `'bottom'` | `verticalAlign` `'top'` |

Explicit `endLabel.align` / `endLabel.verticalAlign` override these. Distance is applied along the base axis only (`LineView.js:960-961`): `x + distance` for a horizontal base axis, `y − distance` for a vertical one.

**Default text is the raw value, not the series name** (`defaultText` → `getDefaultLabel(data, dataIndex)`, `LineView.js:928-930`; `EC/lib/chart/helper/labelHelper.js:49-62`).
- To show the name, use `formatter: '{a}'` (the series name) or a callback returning `params.seriesName`.
- The callback receives the normal data params for the last non-null index (`EC/lib/model/mixin/dataFormat.js:98-106`).

**How the last point is found** (`LineView.js:360-368, 900-939, 940-1005`).
- **Text and format** use `getLastIndexNotNull(points)`, a backwards scan that skips points whose layout is NaN. **Trailing `null`s are skipped automatically**, so the label sits on the last measured point.
- **Position** comes from `_endLabelOnDuring(percent = 1)`:
  - It looks for the segment crossing the clip rect's far edge (`xOrY` = the right edge for a horizontal base axis, `LineView.js:959`).
  - With ECharts' category default `boundaryGap: true` (`EC/lib/coord/axisDefault.js:160`), no segment reaches that edge, so it falls to the last legal index (`LineView.js:987-997`), which is the last non-null point.
  - If a series' last point is on the edge (`boundaryGap: false`), it uses `polyline.getPointOn(edge)`, which is the same point.
- **If every value is `null`,** `getLastIndexNotNull` returns −1 and no label text is set (`LineView.js:922-934`). Older versions threw `setLabelText is not a function` in that case ([#18839](https://github.com/apache/echarts/issues/18839), 5.4.2). 6.1.0 guards the call with `typeof inner.setLabelText === 'function'` (`LineView.js:998-1003`).

**Stacked and area lines.**
- The end label hangs on the **polyline** (`polyline.setTextContent(endLabel)`, `LineView.js:918`), never on the area polygon.
- A line with `areaStyle` takes exactly the same `endLabel` path: `render` calls `_initOrUpdateEndLabel` whether or not `isAreaChart` (`LineView.js:557-569, 571-582`).
- For a stacked series the polyline's points are laid out on `stackResultDimension` (`EC/lib/layout/points.js:64-69`). So the label sits at the **cumulative** value, the top edge of that series' band, vertically centred on that edge, not in the band's middle.
- Its text and `params.value` are the series' **own raw** value (`retrieveRawValue`, `labelHelper.js:49-55`).

**Other behaviour.**
- `endLabel.ignoreClip = true` (`LineView.js:917`): the grid clip path doesn't clip it, so it draws outside the plot.
- In polar coordinates `endLabel` isn't supported, and a dev-build warning says so (`LineView.js:451-457`).
- Only the series-level `endLabel` is read: `getLabelStatesModels(seriesModel, 'endLabel')` (`LineView.js:924`). `LineDataItemOption` admits `endLabel` in its type (`LineSeries.d.ts:16-21`), but per-item values aren't used for it.
- `emphasis/blur/select.endLabel` exist (since 5.0.0, [line.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md)). An open report says `emphasis.endLabel.show` doesn't appear on hover ([#14441](https://github.com/apache/echarts/issues/14441)).

**Option shape for a line or multi-line chart** (4 or fewer series, ink text):

```ts
{
  type: 'line',
  name,
  data,
  endLabel: {
    show: true,
    formatter: '{a}',            // series name; or (p) => p.seriesName
    color: INK_TOKEN,            // explicit: not the series colour (see Gotchas)
    distance: 8,                 // source default
    valueAnimation: false,       // static chart: exact raw value, no interpolation path
    minMargin: 2,                // gap kept between labels during overlap layout
    width: ROOM_PX, overflow: 'truncate', // optional cap to the room reserved in grid.right
  },
  labelLayout: { moveOverlap: 'shiftY', hideOverlap: true },
}
```

ECharts' own "Line Race" example uses the same combination: `endLabel.show` with a formatter, `labelLayout: { moveOverlap: 'shiftY' }` and `grid: { right: 140 }` ([line-race.ts](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/line-race.ts)).

### 2. Area and stacked area

Same shape as a line, with `areaStyle` added. Two differences:
- **Stacked area.**
  - Each label is centred on the top edge of its band (the cumulative y), not in the middle of the band.
  - To centre labels in their bands, wechart would have to compute the offset itself: for example, a `labelLayout` callback `dy` from `convertToPixel` of the band's lower edge.
  - The callback's `rect` is the polyline's bounding box, not the band (`EC/lib/label/LabelManager.js:64-80, 122-128`).
  - Untested (see Open questions).
- **Overlap with the fill, or with other lines, isn't detected.** `hideOverlap` and `moveOverlap` compare labels with labels only (`labelLayoutHelper.js:389-435`, `216-363`).

### 3. Bars: direct labels

There is no `endLabel` for bars (point 2 of the summary). The mechanisms are below.

**A. A per-data-item `label` on the chosen bar.**
- **How it works.** A data item's `label` is the item's own label model, with the series `label` as its parent: `getLabelStatesModels(itemModel)` (`EC/lib/chart/bar/BarView.js:712-720`; `labelStyle.js:170-180`). So the series keeps `label.show: false`, and one item sets `label: { show: true, position }`.
- **Where the formatter goes.** The docs pass `formatter = ${topLevel}` ([bar.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md)), so an item-level `formatter` isn't documented. Put the formatter on the series `label`, which is documented; it only runs for items whose label is shown.
- **Positions** (cartesian): `top/left/right/bottom/inside/insideLeft/insideRight/insideTop/insideBottom/insideTopLeft/insideBottomLeft/insideTopRight/insideBottomRight`, or `[x, y]` ([bar.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md); [option](https://echarts.apache.org/en/option.html#series-bar.label.position)).
  - `'start' / 'insideStart' / 'middle' / 'insideEnd' / 'end'` are **polar only** ("Additional positions are supported for bar series under polar coordinates", same doc). **`'end'` and `'insideEnd'` don't apply to wechart's cartesian bars.**
  - `'outside'` is in the docs' UI enum but not the prose list. The source maps it to the value end of the bar, aware of sign (`labelStyle.js:204`; `BarView.js:711, 898-913`):
    - vertical bars: `'top'` when positive, `'bottom'` when negative;
    - horizontal bars: `'right'` when positive, `'left'` when negative;
    - zero-size bars: by the axis's `inverse` (6.1.0 fix "[bar] Fix wrong label position when bar series has a 0 width/height. #21218", [changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- A bar label's default `distance` is 5 (`labelStyle.js:199`).
- **Bar labels aren't clipped in normal mode.** The source comment: "We don't use clipPath in normal mode because we needs a perfect animation And don't want the label are clipped" (`BarView.js:130-134`). `large` mode does use a clip path (`BarView.js:316-324`).
- **A `null` item has no element, so no label** (`BarView.js:169-172`). Unlike `endLabel`, wechart must pick the last **non-null** index itself.

The shapes below are a design choice, not an ECharts behaviour, and all can be overturned:

```ts
// shared, per series
label: { show: false, formatter: '{a}', color: INK_TOKEN },
labelLayout: { moveOverlap: 'shiftY', hideOverlap: true }, // or 'shiftX', see below
data: values.map((value, i) => ({
  value,
  itemStyle: { borderRadius: … },                // existing
  ...(i === lastNonNullIndex ? { label: { show: true, position: POS } } : {}),
})),
```

| Chart | Natural "end" | `POS` | `moveOverlap` |
| --- | --- | --- | --- |
| Stacked vertical (`stackedBar`) | each series' segment in the last category | `'right'` (beside the segment, vertically centred) | `'shiftY'` |
| Grouped vertical (`groupedBar`) | each series' bar in the last category | `'outside'` / `'top'` | `'shiftX'`, or `hideOverlap` |
| Horizontal (`hbar`) | the last category, at the top of an un-inversed category y axis | `'outside'` (right of the bar's end) | `'shiftY'` |
| Stacked horizontal | the last category's segments | `'top'` | `'shiftX'` |

In grouped vertical bars, neighbouring bars are one bar-width apart, so names wider than a bar collide.

**B. `markPoint`.**
- It needs `MarkPointComponent` registered (`EC/lib/export/components.js:60`).
- Its default symbol is a pin, and its labels take no part in `labelLayout` unless set up on their own.
- Not recommended over A.
- UNVERIFIED: whether markPoint labels join a series' `labelLayout`.

### 4. Overlap handling (`labelLayout`)

**Option.** From `EC/types/src/util/types.d.ts:1145-1183` (documented since 5.0.0, [label-layout.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/label-layout.md)):
- `hideOverlap?: boolean`;
- `moveOverlap?: 'shiftX' | 'shiftY' | 'shuffleX' | 'shuffleY'`;
- `draggable`, `x`, `y`, `dx`, `dy`, `rotate`, `align`, `verticalAlign`, `width`, `height`, `fontSize`, `labelLinePoints`;
- or a callback `(params) => LabelLayoutOption`, whose `params` carries `dataIndex`, `seriesIndex`, `text`, `rect` (the host element's box), `labelRect`, `align` and `verticalAlign`.

The docs: "`'shiftY'` Place the labels on vertical direction sequencely, used when aligned vertically" ([label-layout.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/label-layout.md)).

**Which series.**
- `labelLayout` is on the base `SeriesOption` type (`types.d.ts:1532`). Both `series-line` and `series-bar` document it ([line.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md), [bar.md](https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md)).
- The manager collects labels generically. It walks the series view's group and takes every child's `getTextContent()`, unless that text is marked `disableLabelLayout`, which only treemap does (`LabelManager.js:168-191`).
- The line's polyline hosts the end label, so **end labels are collected**.
- A series with no `labelLayout` is skipped entirely (`LabelManager.js:176-178`), so its labels are invisible to other series' overlap checks.

**Root-level `labelLayout`.**
- The series model's `get` falls back to the global model (`EC/lib/model/Model.js:81-86, 147-167`), since components are built with the global model as parent (`EC/lib/model/Global.js:332`). So a root `labelLayout` may be read.
- But it is undocumented and untyped, and the source comments "TODO A global layout option?" (`LabelManager.js:206`).
- **Set it per series.**

**What `moveOverlap: 'shiftY'` does** (`LabelManager.js:284-306`; `labelLayoutHelper.js:216-363`; [labelLayoutHelper.ts](https://github.com/apache/echarts/blob/6.1.0/src/label/labelLayoutHelper.ts)):
1. It collects every label **in the whole chart instance** whose layout says `shiftY`, across all series and all grids, and sorts them by the y of the label box.
2. It walks down the list. A label whose top is above the previous label's bottom is pushed down to meet it. **The x position is not considered.**
3. If the stack then crosses the bounds, which are **0 to the chart's height, not the grid**, it squeezes the gaps between labels (up to 80%, then 100%) and shifts the list back inside.
4. If the labels still don't fit, it lets them overlap ("Let other overlapping strategy like hideOverlap do the job").
5. Each label box includes `minMargin / 2` on each side when `minMargin` is set (`labelLayoutHelper.js:86-127`; `labelStyle.js:291-296`). So `endLabel.minMargin` is the gap.
6. **No leader line is drawn to the moved label.** Label lines are updated only for hosts with a `dataIndex` (`LabelManager.js:334-355`), and the polyline carries only `seriesIndex` (`LineView.js:644`).

`shiftX` is the same along x. **`shuffleX` and `shuffleY` are in the type but not implemented**: the manager filters only for `'shiftX'` and `'shiftY'` (`LabelManager.js:293-300`).

**What `hideOverlap` does** (`labelLayoutHelper.js:389-435`). It runs after the move.
- It sorts the labels by `priority`.
- It hides any label that truly intersects, in x and in y, a label already kept. Boxes that touch within 0.05 px don't count.
- A label's priority is its host's box area (`LabelManager.js:140-142`). For an end label that is the **polyline's bounding box**, not the value, and no option sets it.
- A hidden label gets `emphasis.ignore = false`, so it shows when its host is hovered (`labelLayoutHelper.js:395-404`).

Issue history: "How to resolve endLabel overlap?" ([#16711](https://github.com/apache/echarts/issues/16711), 5.3.1) was closed stale with no maintainer answer. The Line Race example shows `shiftY` as the intended tool.

### 5. Grid space

**End labels do not reserve room.**
- `layOutGridByOuterBounds` measures only the axes' tick-label boxes and axis-name boxes (`EC/lib/coord/cartesian/Grid.js:607-684`; [Grid.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/Grid.ts)).
- The legacy `containLabel` path likewise considers axis labels only (`echarts-text-and-grid.md`, Q3).
- The end label ignores the clip (`LineView.js:917`), so it draws into the grid's right margin, and past that, beyond the chart box.
- Feature request [#17828](https://github.com/apache/echarts/issues/17828) asked for `endLabel.confine` and was closed "not planned", so there is no built-in confine.

**How to leave room.** Widen `grid.right` beyond `PROTOTYPE_GRID.right` (28, `packages/charts/src/layout/grid.ts:14-21`). Under `outerBoundsMode: 'same'` the outer bounds are that rect (`echarts-text-and-grid.md`, Q3), so the axis labels stay inside the narrower rect.

**The room needed** (derived from the placement rules above, not measured):
- category x with `boundaryGap: true`: `max(0, distance + labelWidth − band/2)`, where `band = plotWidth / categories`;
- value or time x, or `boundaryGap: false`: `distance + labelWidth`.

**Measuring the labels.** Measure the formatted names with `echarts.format.getTextRect(text, font)`, the same measure ECharts uses (`echarts-category-labels.md`). Then cap each label with `endLabel.width` and `overflow: 'truncate'` so it never exceeds the room; `width` and `overflow` are copied into the label style (`labelStyle.js:280-283, 339`).

**Bars.** `bar.ts`'s width estimate (`categoryAxisPx`, `plotEdgesOf`) must subtract the same added room, or it overestimates (`echarts-bar-density.md`).

## Gotchas

- **The colour of an end label.** The label is attached to the polyline, so it is "attached" text (`labelStyle.js:119`, `isAttached = !isSetOnText`).
  - **With no `color`:** the fill falls to zrender's outside default, `#333` (`#ccc` in dark mode) (`ZR/lib/Element.js:158-169, 198-200`; `ZR/lib/config.js:11-12`). Because the text uses the default fill, a **halo stroke** in the background colour is added automatically (`ZR/lib/graphic/Text.js:226-234`; `Element.js:201-214`).
  - **With `color: 'inherit'`:** the fill is the series colour (`labelStyle.js:350-361`). The docs: "If set as 'inherit', the color will assigned as visual color, such as series color" ([text-style.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md)).
  - **With an explicit colour (an ink token):** that fill, and **no** halo, since `'fill' in style` turns off the automatic stroke (`Text.js:226-234`). For a halo over crossing lines, set `textBorderColor` (the surface colour) and `textBorderWidth` explicitly.
  - **Root text style:** root `textStyle.color` does **not** reach attached labels (`labelStyle.js:374-379`; already in `echarts-text-and-grid.md`, Q1). Root `fontFamily` and `fontSize` do (`labelStyle.js:338, 416-428`).
  - **Identity:** with ink-coloured text, identity rests on position alone. For a colour cue, `rich` with a per-series swatch token is available. Since v6, rich tokens inherit the plain label's font props unless `richInheritPlainLabel: false` (`labelStyle.js:260-273`).
- **`valueAnimation` defaults to `true`** (`LineSeries.js:107`).
  - Even with `animation: false`, the synchronous `during(1)` runs the value-animation path, calling `setLabelText(rawValue)`, which runs the formatter again with `params.value` set to that value (`LineView.js:975, 984, 992, 998-1003`; `dataFormat.js:101-103`).
  - When the last point lies on the clip edge (`boundaryGap: false`), the value is **interpolated** at t≈1 and rounded (`EC/lib/util/model.js:706-713`).
  - Set `valueAnimation: false` on static tiles, so the text is the last item's params exactly. An older report says valueAnimation didn't work ([#20292](https://github.com/apache/echarts/issues/20292), closed).
- **`labelLayout` overrides `endLabel.offset`.**
  - When a series has `labelLayout`, the manager calls `hostEl.setTextConfig({ …, offset: [dx || 0, dy || 0] })` (`LabelManager.js:217-227`), which replaces the `offset` set from `endLabel.offset` (`labelStyle.js:208-210`). Use `labelLayout.dx/dy` instead.
  - A `labelLayout` **callback** with end labels was reported to place them erratically ([#14887](https://github.com/apache/echarts/issues/14887), 5.1.1, closed not planned).
- **`shiftY` is chart-wide and ignores x.**
  - In a **trellis drawn as several grids in one instance**, every panel's `shiftY` labels form one list sorted by y, so panels side by side would push each other's labels.
  - Data labels (`series.label`) on `shiftY` series join the same list.
  - The bounds are the whole chart height, so labels can be pushed into the legend's or the axis labels' band (`LabelManager.js:284-300`; `labelLayoutHelper.js:216-283`).
- **Animation undoes the layout.** With animation **on**, each animation frame resets `endLabel.x/y` from the clip progress (`LineView.js:940-997`), which can undo a shift until the end. wechart sets `animation: false`, so the first frame is final (`echarts.md`). UNVERIFIED for animated charts.
- **Resize.** On update, `_initOrUpdateEndLabel` and `during(1, clip)` run again with the new clip rect (`LineView.js:579-592, 446-449`), so a resize repositions the label. This is derived from the source, not observed. Report [#19813](https://github.com/apache/echarts/issues/19813) (5.4.1, with animation, closed stale) describes a label left behind after a resize.
- **dataZoom** (not used by wechart). A window that cuts the line puts the label where the line crosses the clip edge, with an interpolated value (`LineView.js:967-986`).
- **Bars need their own null handling.** A bar item with no value draws nothing, label included (`BarView.js:169-172`).
- **`large` bars have no per-item labels.** Large mode renders through `createLarge` and a clip path (`BarView.js:307-325`), not per-item rects. Not traced further.
- **The docs and the source disagree on `endLabel.distance`:** the docs' shared partial says 5, the source 8 (`LineSeries.js:108`).
- **No changelog entry in 6.0.0 or 6.1.0 changes `endLabel` or `labelLayout` semantics.**
  - The related entries are 6.0.0's "[Fix] [label] Fix label layout margin. #21103", which unified `minMargin`/`textMargin` ([PR #21103](https://github.com/apache/echarts/pull/21103)), and 6.1.0's bar fix #21218 above ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
  - The changelog was read through a summarising fetch. The 6.0.0 and 6.1.0 bullet lists it returned have no other label entries.

## Alternatives considered

Not requested. `markPoint` is noted under §3B only as a mechanism.

## Open questions / unverified

- **Not yet rendered in wechart's SVG SSR harness.** Each of these needs a test in `packages/charts`:
  - end-label position with trailing `null`s, stacked areas and `boundaryGap: true`;
  - `shiftY` with `hideOverlap` on 4 close series.

  Everything above is from the source and the docs.
- **Stacked-area label centring:** whether the design wants labels in the band's middle rather than on its top edge is a design question. The callback and `convertToPixel` route is untested.
- **Labels hidden by `hideOverlap`:** with 4 or fewer series and the room capped, which label is hidden depends on the polyline's box area, not the user's priority. Should the UI accept hidden labels, or fall back to the legend alone? A design decision.
- **Bar direct-label placement by chart type** (the table in §3A) is a proposal, not a decided design.
- **UNVERIFIED:**
  - whether `endLabel` text past the chart box is cut by the SVG viewport or overflows the tile's DOM box (not checked in a browser);
  - what a click on an end label emits: the host polyline carries `seriesIndex` and no `dataIndex` (`LineView.js:644`), which matters if labels must take part in marking (AC-088/AC-100);
  - whether `markPoint` labels take part in a series' `labelLayout`;
  - whether the open bug [#14441](https://github.com/apache/echarts/issues/14441) (`emphasis.endLabel` not showing on hover) still reproduces in 6.1.0, which matters only if hover-only end labels are chosen.
