---
library: Apache ECharts
packages: [echarts]
version: 6.1.0
researched: 2026-09-24
sources:
  [
    https://echarts.apache.org/en/option.html#textStyle,
    https://github.com/apache/echarts-doc/blob/master/en/option/option.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md,
    https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md,
    https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/,
    https://echarts.apache.org/handbook/en/how-to/cross-platform/server/,
    https://github.com/apache/echarts/pull/21059,
    https://github.com/apache/echarts/issues/21388,
    https://github.com/apache/echarts/issues/15013,
    https://developer.mozilla.org/en-US/docs/Web/CSS/font,
    https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric,
    https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/font-variant,
    https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-feature-settings,
    https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/font-face.json,
    https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D,
    https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load,
    https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity,
    https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade,
    https://html.spec.whatwg.org/multipage/canvas.html,
    https://vitest.dev/config/environment,
    https://github.com/jsdom/jsdom/blob/main/README.md,
  ]
---

# Apache ECharts 6.1.0: chart text (font family, tabular numerals) and the grid rectangle

## Summary

This note is a sibling to `echarts.md`, which pins 6.1.0 and covers init and events, and to `echarts-bar-density.md`. Before building on it, grep all of `docs/research` for corrections.

It serves **AC-187**: draw tiles with the design prototype's component styles. The prototype's styles are:

- the chart text style at `docs/design/prototype/charts.js:107`: `textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, … }`;
- the grid at `charts.js:219-225`: `{ left: 8, right: 28|140, top: 12|36, bottom: 8|40, containLabel: true }`;
- checklist rule 1, "Tables, axes and KPIs use tabular numerals" (`docs/design/direction.md:462`).

It also covers critique findings **N7** (chart text not in Inter, no tabular numerals) and **F9** (a 59 px empty band under the axis labels), in `docs/design/critiques/2026-09-24-recheck-dashboard.md:81-83, 264-269`.

Findings:

1. **Root `textStyle.fontFamily` reaches nearly every text wechart draws.** That covers axis labels, axis names, legend items, the scroll-legend page counter, titles, series labels, visualMap, axis-pointer labels and the HTML tooltip. It does not reach:
   - `legend.selectorLabel` and `calendar.yearLabel`, whose defaults hard-code `'sans-serif'`;
   - `graphic` component text;
   - the `showLoading` text.

   The root `fontSize` does **not** reach components whose defaults set their own size: axis labels (12), title (18), tooltip (14).
2. **The SVG renderer writes the font inline on every `<text>`.** For almost all ECharts text it writes longhands (`style="font-size:12px;font-family:…;"`), which leave `font-variant-numeric` unset, so a value inherited from the page applies. A few texts get the `font:` shorthand, which resets `font-variant-numeric`, and so does the HTML tooltip `div`. Neither ECharts nor zrender has any option for font features or font variants.
3. **`grid.containLabel` has been deprecated since 6.0.0.** The replacements are `outerBoundsMode`, `outerBounds`, `outerBoundsContain` and `outerBoundsClampWidth`/`outerBoundsClampHeight`.
   - The prototype loads the full 6.1.0 bundle, which registers `LegacyGridContainLabel`. So the prototype's geometry comes from the **legacy** algorithm.
   - wechart's `echarts/core` build does not register it, so the same option runs the **new** algorithm.
4. **zrender caches text widths per font string, at module level, with no invalidation.** A web font that arrives after the first measurement is never re-measured by `resize()` or `setOption()`.
   - SSR in vitest (node or jsdom) measures with a fixed character-width table that ignores the font family.

## Install

Nothing new. `echarts@6.1.0` is already a dependency of `@wechart/charts` (`packages/charts/package.json`).

`LegacyGridContainLabel`, used if prototype-identical geometry is chosen, is exported from `echarts/features`, which `echarts.md` covers (`EC/lib/export/features.js:48`).

Source-path convention in this doc, relative to the repo root:

- `EC` = `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts`
- `ZR` = `node_modules/.pnpm/zrender@6.1.0/node_modules/zrender`

## Init / auth pattern

- **Browser.** `packages/web/src/tiles/ChartCanvas.tsx:69` calls `echarts.init(element, null, {})` with no `renderer`. The result is still SVG:
  - zrender defaults to `'canvas'`, and falls back to the first registered painter when the requested one isn't registered (`ZR/lib/zrender.js:55-61`);
  - `packages/charts/src/echarts.ts:36-51` registers only `SVGRenderer`.

  Passing `{ renderer: 'svg' }` would state it explicitly.
- **SSR in tests.** `packages/charts/src/testing/renderToSvg.ts:51-56` does `init(null, null, { renderer: 'svg', ssr: true, width, height })`, then `renderToSVGString()`, as the handbook prescribes ([SSR handbook](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/)).

## API surface we will use

### Q1. Root `option.textStyle`: what it reaches and how it merges

**Documented.** Root `textStyle` is described only as "Global font style." ([option.md](https://github.com/apache/echarts-doc/blob/master/en/option/option.md)).

The text-style properties are:

- `color`, `fontStyle`, `fontWeight`, `fontFamily` (documented default `'sans-serif'`), `fontSize`
- `align`, `verticalAlign`, `lineHeight`
- `backgroundColor`, `border*`, `padding`, `shadow*`
- `textBorder*`, `textShadow*`
- `width`, `height`, `overflow`, `ellipsis`, `rich`

Source: the [text-style partial](https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md).

**Merge order for the root `textStyle`** (source, since the docs don't state it):

1. Your option.
2. The theme: `mergeTheme` merges non-component keys such as `textStyle` into the option, and the option's values win (`EC/lib/model/Global.js:675, 691-711`). zrender's `merge` with `overwrite` falsy keeps existing keys (`ZR/lib/core/util.js:93-118`).
3. `globalDefault`, merged last with `overwrite = false` (`Global.js:677`). Its `textStyle` is:
   - `fontFamily`: `'Microsoft YaHei'` when `navigator.platform` starts with `Win`, otherwise `'sans-serif'`;
   - `fontSize: 12`;
   - `fontStyle` and `fontWeight`: `'normal'`.

   Source: `EC/lib/model/globalDefault.js:99-108`.

**Merge order for a component's text.** A component option is merged in this order (`EC/lib/model/Component.js:62-67`):

1. The component's own option.
2. `theme[mainType]`.
3. The component's `defaultOption`.

The root `textStyle` is consulted only for properties still null after that. The fallback happens in `setTokenTextStyle`, which covers exactly `fontStyle`, `fontWeight`, `fontSize`, `fontFamily` and `textShadow*`:

- It computes `retrieve2(model.getShallow(key), globalTextStyle[key])`, where `globalTextStyle = ecModel.option.textStyle` (`EC/lib/label/labelStyle.js:241, 338, 416-428`).
- `getShallow` first walks the model's parent chain (`EC/lib/model/Model.js:87-98`).
- `rich` tokens resolve in the order rich, then plain label, then root (`labelStyle.js:424`). This inheritance is new in v6 and can be switched off with `richInheritPlainLabel: false` ([v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)).
- Texts that build a font string with `getFont()` also fall back to the root, part by part (`labelStyle.js:472-477`).

Two limits apply:

- **Root `color`** reaches only texts not attached to a shape (`!isAttached`, `labelStyle.js:374-379`). Series labels attached to marks don't take it.
- **Non-normal states** (emphasis, blur, select) don't consult the root at all (`labelStyle.js:345`).

**Where the root `fontFamily` lands** (6.1.0 source):

| Text | How it's built | Root `fontFamily` applies? | Own default that shadows the root |
| --- | --- | --- | --- |
| Axis tick labels | `createTextStyle` (`EC/lib/component/axis/AxisBuilder.js:916`) | yes | `fontSize: 12` (`EC/lib/coord/axisDefault.js:112`) |
| Axis names | `createTextStyle` + `getFont` (`AxisBuilder.js:530-549`) | yes | none; `nameTextStyle` is commented "Use global text style by default" (`axisDefault.js:63-66`) |
| Legend items | `createTextStyle` (`EC/lib/component/legend/LegendView.js:330`) | yes | `color` only (`LegendModel.js:287-289`) |
| Scroll-legend page counter | `font: pageTextStyleModel.getFont()` (`ScrollableLegendView.js:93-102`); `LegendComponent` installs the scroll legend (`legend/install.js:47-49`) | yes, via `getFont` | none |
| Legend selector buttons | `selectorLabel` defaults | **no**: `fontFamily: 'sans-serif'` (`LegendModel.js:292-301`) | `fontSize: 12` |
| Title / subtitle | `createTextStyle` (`EC/lib/component/title/install.js:107-125`) | yes | 18 bold / 12 (`install.js:81-87`) |
| Series labels | `setLabelStyle` → `createTextStyle` (`labelStyle.js:119, 134`) | yes | none |
| visualMap | `createTextStyle` (`ContinuousView.js:134, 218, 265`; `PiecewiseView.js:84, 139`) | yes | none |
| Treemap breadcrumb | `createTextStyle` (`EC/lib/chart/treemap/Breadcrumb.js:135`) | yes | none |
| Axis-pointer label | `createTextStyle` + `getFont` (`EC/lib/component/axisPointer/viewHelper.js:76-106`) | yes | none |
| Toolbox hover titles | `getFont(…, ecModel)` (`ToolboxView.js:191-204`) | yes | none |
| **HTML tooltip** | inline CSS `font:` + `getFont()` on `tooltip.textStyle` (`TooltipHTMLContent.js:121-126, 149, 166`) | yes | `fontSize: 14` (`TooltipModel.js:119-122`) |
| Calendar year label | defaults | **no**: `fontFamily: 'sans-serif'` (`CalendarModel.js:126-136`) | 20 |
| `graphic` component text | the style is handed straight to zrender (`GraphicView.js:116-127`; the file doesn't import `createTextStyle`) | **no**: zrender default `12px sans-serif` (`ZR/lib/core/platform.js:1-3`) | none |
| `showLoading()` text | its own `opts.fontFamily`, default `'sans-serif'` (`EC/lib/loading/default.js:61-64, 88`) | **no** | none |

**Tooltip.** The tooltip is HTML by default (`renderMode: 'auto'`, `TooltipModel.js:68`). Its `div` is appended inside the chart's DOM unless `appendTo` is set (`TooltipHTMLContent.js:213-216`).

- ECharts' own tooltip markup sets only `font-size`, `color` and `font-weight` on its spans (`tooltipMarkup.js:59-72`).
- wechart's formatter returns escaped text joined with `<br/>` (`packages/charts/src/tooltip.ts:142-155`).

So all tooltip text inherits the family from the tooltip `div`.

**Issue tracker.** Open feature request [#21388](https://github.com/apache/echarts/issues/21388) (Nov 2025, no maintainer reply) has a user setting `fontFamily` per component. The source above shows the root value already reaches the texts in the table marked "yes".

**Consequence for AC-187:**

- Put `fontFamily: 'Inter, system-ui, sans-serif'` in the root `textStyle`. That also overrides the Windows `'Microsoft YaHei'` default.
- Set `tooltip.textStyle.fontSize: 12` explicitly, as the prototype does (`charts.js:154`). Otherwise the tooltip is 14 px.

### Q2. How the SVG renderer writes text, and tabular numerals

**The writer** is `brushSVGTSpan` in `ZR/lib/svg/graphic.js:197-248`.

- If the tspan's style has any of `fontSize`, `fontFamily` or `fontWeight` (`hasSeparateFont`, `ZR/lib/graphic/Text.js:498-500`), it writes **longhands**: `style="font-size:<size>;font-family:<family>;"`. It adds `font-style:` or `font-weight:` only when they are not `'normal'` (`graphic.js:213-229`).
- Otherwise it writes the **shorthand**: `style="font: <font string>"` (`graphic.js:231-233`).
- `ZRText` copies the four separate font parts into each tspan (`Text.js:262-263, 385-387, 489-497`).
- No other font attribute is written. `mapStyleToAttrs` emits only fill, stroke and opacity attributes (`ZR/lib/svg/mapStyleToAttrs.js`).
- In the browser the `style` attribute is re-applied with `elm.style.cssText = …` on every patch (`ZR/lib/svg/patch.js:98-99`). Any inline style wechart adds to a `<text>` is wiped on the next render.
- The `<svg>` root and its viewport `div` get only positioning styles (`ZR/lib/svg/Painter.js:19, 50`; `ZR/lib/svg/core.js:97-107`). Nothing stops properties inheriting from the chart container.

**Which texts get which form:**

- Everything built by `createTextStyle` always carries `fontSize` and `fontFamily`, because the root defaults always supply them (`globalDefault.js:103-105`). That is every row marked "yes" above except two, so those texts get longhands.
- The scroll-legend page counter and the toolbox hover titles carry only `font`, so they get the shorthand.
- With the root family set, an axis label is therefore written as `style="font-size:12px;font-family:Inter, system-ui, sans-serif;"`. This is derived from the format string at `graphic.js:222`, not observed.

**Consequences:**

1. **Font family.** It is inline on each `<text>`, and normal author styles lose to inline styles: "The only way to override inline styles is by using `!important`" ([MDN Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity)). Overriding it from page CSS would also make the drawn font differ from the one zrender measured (Q4). Set the family through the option.
2. **`font-variant-numeric`.**
   - The CSS `font` shorthand resets `font-variant-numeric`, `font-feature-settings` and the other `font-variant-*` longhands to their initial values ([MDN font](https://developer.mozilla.org/en-US/docs/Web/CSS/font)).
   - `font-variant-numeric` is inherited, and applies to "all elements and text". `tabular-nums` corresponds to OpenType `tnum` ([MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)).
   - The SVG `font-variant` presentation attribute applies to `<text>`, `<tspan>` and `<textPath>`, and its CSS property takes priority ([MDN SVG font-variant](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/font-variant)).
   - So: **longhand texts inherit** `font-variant-numeric` from the chart container. **Shorthand texts** have it reset inline, and only an `!important` rule on the text element overrides that.
   - The critique's reading of `font-variant-numeric: normal` on the app's SVG text is the initial value, not something ECharts sets.
3. **HTML tooltip.**
   - The tooltip `div`'s inline CSS contains `font:` (`TooltipHTMLContent.js:126`), which resets `font-variant-numeric`.
   - `tooltip.extraCssText` is concatenated **after** it in the same `style.cssText` (`TooltipHTMLContent.js:291-293`). "The last declaration in the style order is applied" ([MDN Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade)), so `extraCssText: 'font-variant-numeric: tabular-nums;'` sets it for the whole tooltip.
   - `tooltip.className` also exists (`TooltipHTMLContent.js:277`), but a class rule without `!important` loses to the inline shorthand ([MDN Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade)).
4. **No option exists for font features or variants.**
   - I searched for `fontVariant|fontFeature|font-variant|font-feature|letterSpacing` across `EC/lib/**/*.js`, `EC/types/**/*.d.ts` and `ZR/lib`, with no matches.
   - The text-style docs partial lists no such property ([text-style.md](https://github.com/apache/echarts-doc/blob/master/en/option/partial/text-style.md)).
   - The property lists that `createTextStyle` copies (`labelStyle.js:338-340`) and `TEXT_STYLE_OPTIONS` (`EC/lib/util/model.js:93`) contain none, and `rich` styles use the same lists.
5. **Ways to get tabular numerals on axis labels in the SVG.** Each needs a font that has `tnum`. Inter documents `tnum` (cited at `docs/design/references.md:735-737`).
   - **A. Page CSS.**
     - Put `font-variant-numeric: tabular-nums` on the chart container. Longhand `<text>` inherit it; that covers axis labels, axis names, the legend, titles and axis-pointer labels.
     - Add a rule on the chart's `svg text` with `font-variant-numeric: tabular-nums !important` to cover the shorthand texts (the scroll-legend counter and toolbox titles).
     - Set `tooltip.extraCssText` for the tooltip.
     - This works in the browser only. The SSR string carries no page CSS.
   - **B. An `@font-face` alias.**
     - Declare an alias family with the descriptor `font-feature-settings: "tnum" 1` and name it in `axisLabel.fontFamily`, or at the root.
     - The descriptor "sets feature values on the font object" ([MDN @font-face font-feature-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-feature-settings)). It is therefore independent of the cascade and of shorthand resets, and the family name is visible in SSR output.
     - Support per MDN browser-compat-data: Chrome 140, Firefox 34, Safari 10 ([BCD font-face.json](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/font-face.json)). MDN marks it Baseline since September 2025.
     - wechart has **no `@font-face` for Inter today**. `packages/web/src/shell/fonts.ts` declares only IBM Plex Mono, and `packages/web/src/shell/styles.ts:49` names `Inter` expecting an installed copy.
   - **Measurement caveat for both.**
     - zrender measures text through a 2D canvas (`ZR/lib/core/platform.js:25-37`), and `CanvasRenderingContext2D` has no `fontVariantNumeric` or `fontFeatureSettings` ([MDN CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)).
     - With A, layout (grid shrink, `hideOverlap`, truncation) is computed from proportional digit widths while tabular digits are drawn.
     - With B, whether canvas measurement honours the descriptor is unverified.
     - An exact fix is to replace the measurer with `echarts.setPlatformAPI({ measureText })`, documented since 5.3.0 as "measures the width of the text" ([api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md)), using one that applies `tnum`. zrender reads only `.width` from the result (`ZR/lib/contain/text.js:19-20, 35, 63`). It must be installed before any chart measures, because of the cache in Q4.

### Q3. `grid.containLabel` in 6.x and its replacement

**Deprecated since 6.0.0:**

- The grid doc marks `containLabel` deprecated as of 6.0.0: "See grid.outerBoundsMode" ([grid.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md)).
- The 6.1.0 types say `@deprecated Use grid.outerBounds instead`. They also note "`grid.containLabel` is equivalent to `{outerBoundsMode: 'same', outerBoundsContain: 'axisLabel'}`" (`EC/types/src/coord/cartesian/GridModel.d.ts:17-37`).
- The docs add that "the effect might be slightly different, but usually indiscernible" ([grid.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md)).
- PR [#21059](https://github.com/apache/echarts/pull/21059) (merged 2025-06-25 for 6.0.0) introduced the outer-bounds mechanism and moved the old implementation to `LegacyGridContainLabel`, "available in echarts.all.js but requiring explicit import for other bundles".

**Options in 6.1.0.** Values are from the types (`GridModel.d.ts:23-58`); defaults are from `EC/lib/coord/cartesian/GridModel.js:50-56, 79-99`.

| Option | Values | Default |
| --- | --- | --- |
| `containLabel` | boolean (deprecated) | `false` |
| `outerBoundsMode` | `'auto'`, `'same'`, `'none'`, or null/undefined | `'auto'` |
| `outerBounds` | `{ left, right, top, bottom, width, height }`, relative to the canvas | `{ left: 0, right: 0, top: 0, bottom: 0 }` |
| `outerBoundsContain` | `'auto'`, `'all'`, `'axisLabel'`, or null/undefined | `'all'`; `'auto'` and null parse to `'all'` (`EC/lib/coord/cartesian/Grid.js:764-775`) |
| `outerBoundsClampWidth` / `outerBoundsClampHeight` | a number, or a `'%'` string of the raw grid rect: the minimum size the rect may shrink to | `'25%'` / `'25%'` |

- The clamp options are in the types and in PR #21059 but are not on the docs page.
- `'axisLabel'` contains the cartesian rect and the axis labels but **excludes axis names**; `'all'` includes them ([grid.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md)).
- `'auto'` with the default `outerBounds` makes the outer bounds the whole canvas (`Grid.js:757-758`). The grid shrinks only if labels would leave the canvas.

**The default grid rect.** In 6.1.0 source it is `left: '15%'`, `top: 65`, `right: '10%'`, `bottom: 80` (`GridModel.js:83-86`). The docs page says `'10%'`, 60, `'10%'`, 60 (the `partial-rect-layout-width-height` parameters in [grid.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md)); the docs are out of sync, and the source governs.

This is derived, not measured: with no `grid.bottom` and `'auto'` bounds, nothing shrinks, so the default 80 px bottom leaves the empty band that F9 measured at 59 px.

**What `containLabel: true` does in 6.1.0** (`Grid.js:158-178`):

- **If `LegacyGridContainLabel` is registered**, the legacy algorithm runs (`EC/lib/coord/cartesian/legacyContainLabel.js:58-121`):
  - It takes the union of the label text rects, sampling every `ceil(n/40)`-th label when there are more than 40.
  - It subtracts that union plus `axisLabel.margin` from the rect's **perpendicular** dimension only.
  - Per PR #21059 the legacy approach "wasn't precise enough", didn't consider axis names, and let "edge labels partially overflow the viewport".
- **Otherwise**, the new path runs:
  - In non-production builds it logs once to the console: "Specified `grid.containLabel` but no `use(LegacyGridContainLabel)`; use `grid.outerBounds` instead." (`Grid.js:174-176`; the once-only behaviour is in `EC/lib/util/log.js:50-64`).
  - It then runs `layOutGridByOuterBounds(gridRect.clone(), 'axisLabel', null, …)` (`Grid.js:177`). The outer bounds are the rect from `left`/`right`/`top`/`bottom`, the contain mode is `'axisLabel'`, and there is **no clamp**: a `null` minimum size means 0 (`EC/lib/util/graphic.js:486-530`).
- **In both paths** `containLabel: true` makes the default `nameMoveOverlap` false (`Grid.js:691`, `defaultNameMoveOverlap = !optionContainLabel`; `AxisBuilder.js:246-249`). `nameGap` is then measured from the axis line, not from the line plus labels (`EC/types/src/coord/axisCommonTypes.d.ts:31-51`).

**Which algorithm the prototype ran.** The full bundle registers the legacy feature: `EC/index.js:261` calls `use(LegacyGridContainLabel)`, and `EC/dist/echarts.js:95778` calls `use(installLegacyGridContainLabel)`. The prototype loads that bundle from the CDN (`docs/design/prototype/index.html:2378`), so **the prototype's grid geometry is the legacy algorithm's**. wechart's registration set (`packages/charts/src/echarts.ts:36-51`) omits the feature.

**Equivalents of the prototype's `{ left: 8, right: 28, top: 12, bottom: 8, containLabel: true }`.** All three put the axis labels inside a rect whose bottom edge is 8 px from the chart's bottom.

1. **Prototype-identical geometry.** Keep `containLabel: true` and add `echarts.use([LegacyGridContainLabel])` from `echarts/features`. This relies on a deprecated option and the less precise legacy algorithm.
2. **The supported API, the same as `containLabel`'s new path:**
   ```ts
   grid: { left: 8, right: 28, top: 12, bottom: 8,
           outerBoundsMode: 'same', outerBoundsContain: 'axisLabel',
           outerBoundsClampWidth: 0, outerBoundsClampHeight: 0 }
   xAxis/yAxis: { nameMoveOverlap: false, … }
   ```
   - The two clamp zeros reproduce `containLabel`'s unclamped shrink; `0` parses to 0 (`EC/lib/util/number.js:154-166`).
   - `nameMoveOverlap: false` keeps the prototype's `nameGap` values (28 and 44, `charts.js:120, 134`) measured from the axis line.
   - Leaving the 25% clamp in place means the plot never shrinks below a quarter of its raw size, so very long labels overflow instead.
3. **The same as 2 with `outerBoundsContain: 'all'`.** This also keeps shown axis titles inside the rect. Under `'axisLabel'`, and under the prototype's own option, an x-axis title at `nameGap: 28` below the axis line is not contained.

**v6 upgrade guide, quoted** ([v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)):

- "If axis names or labels previously overflowed the canvas or overlapped, the position of the axes may shift slightly after upgrading, because overflow prevention and axis name/label overlap prevention are now enabled by default."
- "You can disable the overflow prevention by setting grid.outerBoundsMode: 'none', or disable the overlap prevention by setting xAxis/yAxis.nameMoveOverlap: false."

The 6.0.0 changelog lists the same change as "[Feature] [cartesian] Introduce new layout mechanism to avoid Cartesian … axis labels and axis names overflowing the canvas" plus a matching [Break] entry ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). The 6.1.0 entries on axes concern extents, ticks and bar containment, not grid layout ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).

### Q4. Font loading and SSR measurement

**Font loading in the browser:**

- **Measurement uses a 2D canvas, even under the SVG renderer.** zrender measures all text with `platformApi.measureText`, which creates a canvas via `document.createElement('canvas')` and calls `ctx.font = font; ctx.measureText(text)` (`ZR/lib/core/platform.js:20-37`).
- **Unloaded fonts fall back.** Per the HTML standard, "If a font is used before it is fully loaded … then it must be treated as if it was an unknown font, falling back to another" ([HTML canvas](https://html.spec.whatwg.org/multipage/canvas.html)).
- **Widths are cached.**
  - The cache is a module-level LRU of 100 font strings. Each font string holds an LRU of 500 string widths, plus an ASCII width map built once (`ZR/lib/contain/text.js:4-67`).
  - The key is the font string only.
  - Neither ECharts nor zrender exports a way to clear it; `contain/text.js`'s exports are listed at lines 4-124.
- **`resize()` and a second `setOption()` don't help.** Both re-run layout, but hit the cache for the same strings, so fallback-font widths persist until evicted or until the font string changes.
- **The drawn text and the layout then diverge.** The browser re-renders the SVG glyphs in Inter when it arrives, while ECharts' layout (grid shrink, `hideOverlap`, truncation, legend item widths) stays based on the fallback.
- **Line height is also cached.** It is estimated as the measured width of '国' in that font (`text.js:109-111`).
- **Mitigation: load the faces before the first `setOption`.** Wait for `document.fonts.load('12px Inter')`, and one call per weight and size ECharts will use (for example `'600 12px Inter'` for the prototype's 600-weight axis names, `charts.js:121`).
  - `load()` "forces all the fonts given in parameters to be loaded".
  - It returns a promise "fulfilled with an Array of loaded FontFace objects", rejected if one fails ([MDN FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)).
- **Related issue.** [#15013](https://github.com/apache/echarts/issues/15013) (5.1.0) reports a custom `@font-face` font appearing late and inconsistently. It is closed as inactive with no maintainer diagnosis.

**SSR and test measurement:**

- **`packages/charts` runs in node.** Vitest's default `environment` is `'node'` ([vitest config](https://vitest.dev/config/environment)), and `packages/charts` has no vitest config. So there is no `document`, and zrender uses its fallback measurer (`ZR/lib/core/platform.js:39-55`):
  - an ASCII character's width is a fixed per-character table value times the font size, taken from the first `NNpx` in the font string;
  - any other character is the font size;
  - if the font string contains `mono`, every character is the font size.
  - The family is otherwise ignored, so Inter and `sans-serif` lay out identically in SSR tests.
  - Decoding the table (`platform.js:4-19`, entries 16-25 are `'L'`, i.e. (76−20)/100): every digit is 0.56 × the font size, 6.72 px at 12 px. SSR measurement is therefore tabular by construction.
- **`packages/web` runs in jsdom** (`packages/web/vite.config.ts:26-31`).
  - jsdom 30.1.0 without the `canvas` package returns `null` from `getContext` and reports "Not implemented … without installing the canvas npm package" (`node_modules/.pnpm/jsdom@30.1.0/node_modules/jsdom/lib/jsdom/living/nodes/HTMLCanvasElement-impl.js:24-49`). The README says canvas elements then "behave like `<div>`s" ([jsdom README](https://github.com/jsdom/jsdom/blob/main/README.md)).
  - zrender falls back to the same table.
  - Because its cached context stays null, every uncached measurement retries `getContext` (`platform.js:29-33`), and jsdom reports "not implemented" each time.
- **Real metrics in SSR** can be supplied through `setPlatformAPI({ measureText })` ([api/echarts.md](https://github.com/apache/echarts-doc/blob/master/en/api/echarts.md)). The SSR handbook doesn't cover text measurement ([SSR handbook](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/)).
- **What SSR tests can and can't assert.** They can check the `font-family:` inside each `<text>` style. They cannot observe tabular figures or Inter's metrics; that needs the browser suite, with computed style plus rendered widths.

## Gotchas

- **Same option, different geometry.** `containLabel: true` runs the legacy algorithm in the full bundle (`EC/index.js:261`, which the prototype uses) and the new outer-bounds algorithm in wechart's `echarts/core` build.
- **Deprecation log.** `containLabel` without `LegacyGridContainLabel` logs a deprecation message once, in non-production builds (`Grid.js:174-176`).
- **`nameMoveOverlap` depends on `containLabel`.** Switching from `containLabel` to `outerBoundsMode: 'same'` moves axis names away from the labels unless `nameMoveOverlap: false` is set (`Grid.js:691`; `AxisBuilder.js:246-249`).
- **`'axisLabel'` excludes axis names**, so a shown axis title can overflow an 8 px bottom margin ([grid.md](https://github.com/apache/echarts-doc/blob/master/en/option/component/grid.md)).
- **Grid defaults on the docs site are wrong for 6.1.0.** The site says `'10%'`/60/`'10%'`/60; the installed source says `'15%'`/65/`'10%'`/80 (`GridModel.js:83-86`).
- **Windows default font.** Without a root `fontFamily`, Windows users get `'Microsoft YaHei'` (`globalDefault.js:103`).
- **Tooltip size.** The tooltip defaults to 14 px regardless of the root `fontSize` (`TooltipModel.js:119-122`).
- **Some texts ignore the root family.** `legend.selectorLabel`, `calendar.yearLabel`, `graphic` text and `showLoading` text all do (see the Q1 table).
- **Shorthand resets.** The inline `font:` shorthand on the scroll-legend counter, the toolbox titles and the HTML tooltip `div` resets `font-variant-numeric` and `font-feature-settings` ([MDN font](https://developer.mozilla.org/en-US/docs/Web/CSS/font)).
- **Inline styles are overwritten.** Don't post-process the SVG DOM: zrender rewrites `style.cssText` on every patch (`ZR/lib/svg/patch.js:98-99`).
- **SSR strings are not escaped.** SSR serialises attribute values without escaping (`ZR/lib/svg/core.js:21-36`), so a `fontFamily` containing `"` breaks `renderToSVGString()` output. Use unquoted or single-quoted family names. Text content is HTML-encoded (`core.js:47`).
- **The width cache outlives font loading.** It is never invalidated, so a font that loads late leaves stale layout until the page reloads, even across `resize()` and `setOption()` (`ZR/lib/contain/text.js:4-67`).
- **Canvas can't measure tabular figures.** It has no `font-variant-numeric`, so CSS-applied `tnum` is drawn but not measured ([MDN CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)).

## Alternatives considered

Not requested.

## Open questions / unverified

- **UNVERIFIED: that browsers render `tnum` glyphs for SVG `<text>` under `font-variant-numeric: tabular-nums`.**
  - Sources say the property applies to all elements and is inherited ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)), and that `font-variant` applies to SVG `<text>` ([MDN SVG](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/font-variant)).
  - My fetches of the SVG 2 and CSS Fonts 4 spec pages were truncated before the relevant sections, and I had no browser to test with.
  - To verify in Playwright: compare the rendered width (`getBBox().width`) of `"111"` against `"000"` in a chart axis label, with and without the rule.
- **UNVERIFIED:** whether `CanvasRenderingContext2D.measureText` honours an `@font-face` `font-feature-settings` descriptor (option B's measurement accuracy).
- **UNVERIFIED:** how far Inter's proportional and tabular digit widths differ at 12 px, which is the size of the measure-versus-draw mismatch under option A. No source found.
- **UNVERIFIED:** whether a locally installed Inter, which is what wechart relies on today, is available to canvas at first use with no loading delay.
- **UNVERIFIED:** whether the `system-ui` fallbacks have `tnum`.
- **UNVERIFIED:** that hover, emphasis and select states keep the root family. The root isn't consulted for those states (`labelStyle.js:345`); I did not trace whether zrender's state merge keeps the normal-state family.
- **Not traced:** root `textStyle` for custom-series text elements. wechart doesn't register `CustomChart`.
- **UNVERIFIED as spec text:** that the CSS `font` shorthand resets `font-variant-numeric`. This rests on MDN ([MDN font](https://developer.mozilla.org/en-US/docs/Web/CSS/font)); the CSS Fonts 4 fetch was truncated.
