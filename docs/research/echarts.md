---
library: Apache ECharts
packages: [echarts, echarts/core, echarts/charts, echarts/components, echarts/features, echarts/renderers]
version: 6.1.0
researched: 2026-09-19
sources:
  [
    https://registry.npmjs.org/echarts/latest,
    https://echarts.apache.org/en/api.html,
    https://echarts.apache.org/en/option.html,
    https://echarts.apache.org/handbook/en/basics/import/,
    https://github.com/apache/echarts/blob/6.1.0/package.json,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts,
  ]
---

# Apache ECharts 6.1.0

## Summary

ECharts is the chart renderer for wechart's tiles. It covers the chart types in **AC-037** with first-party series (bar/line/scatter/pie/treemap/heatmap; KPI, table and pivot stay in DOM, as the prototype already does at `/Users/srajagopal/Work/wechart/docs/design/prototype/charts.js`). Per-data-item `itemStyle` (colour, border, opacity, `decal`) covers the marking visuals of **AC-096/AC-097**; multiple `grid` + `title` arrays with `title.triggerEvent` cover trellis layout and panel-header marking (**AC-045**, **AC-091**). It does **not** cover **AC-088** rectangle/lasso marking for our series mix, nor **AC-100** keyboard item navigation — both must be built on `convertToPixel` and DOM around the canvas (details below).

- Latest stable, and the version pinned here: **6.1.0**, published as npm `latest` ([registry](https://registry.npmjs.org/echarts/latest)); changelog dates 6.1.0 at 2026-05-18 and 6.0.0 at 2025-07-30 ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- Licence **Apache-2.0**; runtime deps `tslib@2.3.0` and `zrender@6.1.0` only ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json)).
- Browser support: no `engines` and no `browserslist` in package.json, and neither the README nor the v6 upgrade guide states a support matrix ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json), [v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)). The published `lib/` is compiled with `"target": "ES3"` ([tsconfig.json](https://github.com/apache/echarts/blob/6.1.0/tsconfig.json)), so no syntax-level constraint applies to desktop browsers.

## Install

```bash
pnpm add echarts@6.1.0
```

No peer dependencies ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json)). The package is `"type": "module"` with an `exports` map exposing `.`, `./core`, `./charts`, `./components`, `./features`, `./renderers`, plus per-chart/per-component paths and `./theme/*`, `./i18n/*` ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json)) — Vite resolves these directly; no interop shim needed.

`sideEffects` is a list, not `false`: `index.js`, `index.common.js`, `index.simple.js`, `lib/echarts.js`, `lib/chart/*.js`, `lib/component/*.js`, `extension/**/*.js`, `theme/*.js`, `i18n/*.js` ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json)). Importing the root `echarts` therefore pulls the whole library; only the `echarts/core` route tree-shakes.

### Bundle size

Published build artefacts, byte-exact from the CDN file metadata ([unpkg dist meta](https://unpkg.com/echarts@6.1.0/dist/?meta), cross-checked against [jsDelivr](https://data.jsdelivr.com/v1/packages/npm/echarts@6.1.0)):

| file                         | bytes     | contents                                                                                                                         |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dist/echarts.min.js`        | 1,121,883 | everything                                                                                                                       |
| `dist/echarts.common.min.js` | 715,020   | common subset                                                                                                                    |
| `dist/echarts.simple.min.js` | 500,315   | Line/Bar/Pie + GridSimple + Aria + Dataset + CanvasRenderer ([index.simple.js](https://unpkg.com/echarts@6.1.0/index.simple.js)) |

Importing the root package measures 1,114,829 B minified / 367,958 B gzipped ([Bundlephobia](https://bundlephobia.com/package/echarts@6.1.0)). The handbook claims tree-shaken imports "substantially decrease bundle size" but publishes **no figures** ([import guide](https://echarts.apache.org/handbook/en/basics/import/)).

### Tree-shaken import set for wechart

Installer names verified against the source export barrels ([charts.ts](https://github.com/apache/echarts/blob/6.1.0/src/export/charts.ts), [components.ts](https://github.com/apache/echarts/blob/6.1.0/src/export/components.ts)):

```ts
import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  TreemapChart,
  HeatmapChart,
  CustomChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  LegendScrollComponent,
  TitleComponent,
  VisualMapComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DatasetComponent,
  TransformComponent,
  AriaComponent,
  BrushComponent,
  MatrixComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([/* …the above… */ CanvasRenderer]);
```

A renderer is mandatory; `echarts.use()` must run before `echarts.init()` ([import guide](https://echarts.apache.org/handbook/en/basics/import/), [api: use](https://echarts.apache.org/en/api.html#echarts.use)).

## Init / auth pattern

No auth. One instance per tile DOM node:

```ts
const inst = echarts.getInstanceByDom(el) ?? echarts.init(el, null, { renderer: 'canvas' });
inst.setOption(option, true); // notMerge: replace the whole option
const ro = new ResizeObserver(() => inst.resize()); // container-driven resize
ro.observe(el);
// teardown: ro.disconnect(); inst.dispose();
```

`init(dom, theme?, opts?)` options: `renderer` (`'canvas'`/`'svg'`), `devicePixelRatio` (defaults to `window.devicePixelRatio`), `useDirtyRect` (**`false` by default**), `useCoarsePointer` (`null` = mobile only), `pointerSize`, `width`/`height` (`null`/`'auto'` = read from DOM), `locale`, `ssr` ([api: init](https://echarts.apache.org/en/api.html#echarts.init)). `getInstanceByDom`, `dispose`, `isDisposed`, `clear` are all documented instance/global APIs ([api](https://echarts.apache.org/en/api.html#echarts.getInstanceByDom)).

Under React 19 + StrictMode, create in a `useLayoutEffect` keyed to the node and `dispose()` in its cleanup — "Once disposed, the instance can not be used again" ([api: dispose](https://echarts.apache.org/en/api.html#echartsInstance.dispose)).

## API surface we will use

### Events

`on(eventName, handler, context?)` and `on(eventName, query, handler, context?)`, where `query` is `'mainType'` / `'mainType.subType'` or an object of `seriesIndex | seriesName | seriesId | dataIndex | name | dataType | element`. `off(eventName?, handler?)` unbinds ([api: on/off](https://echarts.apache.org/en/api.html#echartsInstance.on)).

Documented mouse events: `'click'`, `'dblclick'`, `'mousedown'`, `'mousemove'`, `'mouseup'`, `'mouseover'`, `'mouseout'`, `'globalout'`, `'contextmenu'`. Params carry `componentType`, `seriesType`, `seriesIndex`, `seriesName`, `name`, `dataIndex`, `data`, `dataType`, `value`, `color`, `info` ([events](https://echarts.apache.org/en/api.html#events.Mouse%20events)); the handler also sets `params.event` (the zrender event) and `params.type` ([echarts.ts](https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts)).

**What the docs guarantee about `click`: only that the event name exists and what its params contain.** There is no documented statement about when a click is or is not emitted. The behaviour is in zrender 6.1.0 ([Handler.ts](https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts)):

```js
else if (name === 'click') {
    if (this._downEl !== this._upEl || !this._downPoint
        || vec2.dist(this._downPoint, [event.zrX, event.zrY]) > 4) {
        return;
    }
    this._downPoint = null;
}
this.dispatchToElement(hovered, name, event);
```

So: `click` is derived from the browser's native `click` on the container (the DOM `click` listener is mounted in both the mouse and the pointer listener sets — `'click'` has no pointer equivalent so it survives the name mapping, [HandlerProxy.ts](https://github.com/ecomfe/zrender/blob/6.1.0/src/dom/HandlerProxy.ts)); it is **dropped** when press and release land on different zrender elements or the pointer moved more than **4 px**. When dropped, `dispatchToElement` never runs, so neither the item handler nor the zr-level `click` fires. `mousedown` and `mouseup` are dispatched unconditionally to the element under the pointer (`mouseup` skips the hover lookup when released outside the canvas). Conclusion: on a surface that also drags to select, the prototype's mousedown/mouseup pairing (`charts.js:271-281`) is strictly more robust than `click`, and its 4 px slop matches zrender's own threshold — keep it, and it satisfies AC-088's "press-and-release without movement is a click".

Titles: `title.triggerEvent` (default `false`) makes each title emit events with `componentType: 'title'` and `componentIndex` ([option: title.triggerEvent](https://echarts.apache.org/en/option.html#title.triggerEvent)) — this is the mechanism for AC-091. Axes: `axis.triggerEvent` (default `false`) emits `{ componentType: 'xAxis'|'yAxis', componentIndex, targetType: 'axisLabel'|'axisName', value?, name?, break? }` ([option: xAxis.triggerEvent](https://echarts.apache.org/en/option.html#xAxis.triggerEvent)). Non-series components reach handlers through `ecData.eventData`, which is copied verbatim into the params ([echarts.ts](https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts)).

Line bodies: **`series-line.triggerEvent` (`boolean | 'line' | 'area'`) is new in 6.1.0 and `triggerLineEvent` is deprecated in 6.1.0** ("Use 'triggerEvent' instead") ([option: series-line.triggerEvent](https://echarts.apache.org/en/option.html#series-line.triggerEvent)). The prototype's `triggerLineEvent` at `charts.js:159` must be migrated.

Other events we rely on: `legendselectchanged` (name + full selection table) ([events](https://echarts.apache.org/en/api.html#events.legendselectchanged)); `selectchanged` from `select`/`unselect`/`toggleSelect`; `rendered` ("Trigger when a frame rendered"); and **`finished`**, which fires after all animation and progressive rendering complete and should be registered _before_ `setOption` ([events](https://echarts.apache.org/en/api.html#events.finished)) — that is the hook for measuring AC-174/AC-175.

### Brush, zr events and hit-testing

Enable/disable programmatically: `dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType, brushMode } })`; `brushType: false` turns brushing off ([action: brush.takeGlobalCursor](https://echarts.apache.org/en/api.html#action.brush.takeGlobalCursor)). Set areas with `dispatchAction({ type: 'brush', areas: [{ brushType: 'rect'|'polygon'|'lineX'|'lineY', range | coordRange, xAxisIndex|yAxisIndex|geoIndex }] })` ([action: brush](https://echarts.apache.org/en/api.html#action.brush)). Events: `brushselected` — "when `dispatchAction` called, or use do brush behavior. But this event will not be triggered in `setOption`" — carries per-series selected `dataIndex` arrays; `brushEnd` fires when the brush gesture finishes (v4.5.0+) ([events](https://echarts.apache.org/en/api.html#events.brushselected)). Component options: `brushType` (default `'rect'`), `brushMode` `'single'|'multiple'`, `transformable` (default `true`), `removeOnClick`, `brushStyle`, `inBrush`/`outOfBrush`, `brushLink`, `seriesIndex` (default `'all'`), `throttleType`/`throttleDelay`, `z` = 10000 ([option: brush](https://echarts.apache.org/en/option.html#brush)).

**Decisive limit for AC-088: the brush component selects data in `scatter`, `bar` and `candlestick` series only; `parallel` has its own built-in brush** ([option: brush](https://echarts.apache.org/en/option.html#brush)). Line, area, heatmap, pie and treemap are not covered, so brush cannot implement wechart's marking rectangle across our chart set. Keep the prototype's approach: a DOM overlay for the rubber band plus our own hit test.

Coexistence with item clicks is **not documented**. Reading the source: `BrushController` mounts its own `mousedown`/`mousemove`/`mouseup` on the zrender instance, calls `preventDefault` on mousedown when there is no draggable target, and takes the `'globalPan'` interaction mutex; cover shapes are `silent: true` unless `transformable`. Nothing there cancels click propagation to series ([BrushController.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/helper/BrushController.ts)). Treat as unverified behaviour if we ever enable brush.

`getZr()` returns the zrender instance (`getZr(): zrender.ZRenderType`, [echarts.ts](https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts)). **It is public in the source but absent from the API reference** — the documented instance members are exactly: `group, setOption, getWidth, getHeight, getDom, getOption, setTheme, resize, renderToSVGString, dispatchAction, on, off, convertToPixel, convertToLayout, convertFromPixel, containPixel, showLoading, hideLoading, getDataURL, getConnectedDataURL, appendData, clear, isDisposed, dispose` ([api: echartsInstance](https://echarts.apache.org/en/api.html#echartsInstance)). `getZr().on('click', …)` (prototype `charts.js:363`, clear-marking on empty-area click) rides on an undocumented API and on the same 4 px click gate; the zr-level trigger happens at the end of `dispatchToElement` when bubbling is not cancelled ([Handler.ts](https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts)).

Hit-testing is documented and stable: `convertToPixel(finder, coord, opt?)`, `convertFromPixel(finder, value, opt?)` and `containPixel(finder, value) => boolean`. Finder keys include `xAxisIndex/Id/Name`, `yAxis*`, `grid*`, `polar*`, `geo*`, `singleAxis*`, `calendar*`, `matrix*`, `series*`; `containPixel` supports grid, polar, geo, matrix, series-map, series-graph and series-pie ([api: convertToPixel](https://echarts.apache.org/en/api.html#echartsInstance.convertToPixel)). This is exactly what `itemsInArea` (`charts.js:290-316`) uses; `containPixel` is the cheap guard for "is the drag inside this grid".

### Per-item styling for markings

A data item may be an object whose `itemStyle` overrides the series `itemStyle` ("Rectangle style configurations of single data") ([option: series-bar.data.itemStyle](https://echarts.apache.org/en/option.html#series-bar.data.itemStyle)). `itemStyle` carries `color`, `opacity`, `borderColor` (bar default `'#000'`), `borderWidth` (default `0`, i.e. no border), `borderType`, `borderRadius`, `decal` ([option: series-bar.itemStyle](https://echarts.apache.org/en/option.html#series-bar.itemStyle)). The same `itemStyle` partial backs pie sectors, heatmap cells, treemap nodes and scatter symbols, so the outline-plus-fade treatment of AC-096 is expressible per item on every type we render.

`decal` fields: `symbol` (default `'rect'`, or an array used one by one), `symbolSize` (0..1, relative), `symbolKeepAspect`, `color` (translucent recommended), `backgroundColor`, `dashArrayX`, `dashArrayY` (SVG `stroke-dasharray`-like), `rotation` (radians), `maxTileWidth`/`maxTileHeight` (both 512) ([option: decal](https://echarts.apache.org/en/option.html#series-bar.itemStyle.decal)). Important for AC-097: **`itemStyle.decal` does not depend on the `aria` option.** The decal visual stage handler converts any item- or series-level decal visual into a pattern with no aria guard at all ([visual/decal.ts](https://github.com/apache/echarts/blob/6.1.0/src/visual/decal.ts)); `aria.decal.show` only governs decals that ECharts assigns automatically ([option: aria.decal.show](https://echarts.apache.org/en/option.html#aria.decal.show)).

Built-in states exist but are a poor fit for our three-valued marking. `emphasis`/`blur`/`select` are declared per series, `emphasis.focus` is `'none' | 'self' | 'series'`, `blurScope` is `'coordinateSystem' | 'series' | 'global'`, `selectedMode` is `'single' | 'multiple' | 'series' | boolean` ([types.ts](https://github.com/apache/echarts/blob/6.1.0/src/util/types.ts); [option: series-bar.select](https://echarts.apache.org/en/option.html#series-bar.select), v5.0.0+). They are driven by `dispatchAction({ type: 'select'|'unselect'|'toggleSelect'|'highlight'|'downplay', seriesIndex?, dataIndex?, name?, … })` ([api: action](https://echarts.apache.org/en/api.html#action.highlight)). They model one boolean per item, so "full / partial / none with our own colour, outline and fade" still needs explicit per-item `itemStyle`, as the prototype does.

Stacking for the marked-share split (AC-097, additive case): `stack` (shared string id), `stackStrategy: 'samesign' | 'all' | 'positive' | 'negative'`, and **`stackOrder: 'seriesAsc' | 'seriesDesc'`, new in v6** ([types.ts](https://github.com/apache/echarts/blob/6.1.0/src/util/types.ts); [changelog 6.0.0 "stack order reversal"](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). Two series with the same `stack` id — marked value first, remainder second — put the marked share at the baseline, which is what `charts.js:117-120` relies on; `stackOrder` makes that explicit instead of relying on series order.

### Accessibility

`aria.enabled` defaults to **`false`**. With it on, `aria.label.enabled` (default `true`) generates an `aria-label` attribute on the chart DOM from the chart, data and title; `aria.decal.show` defaults to `false` and needs `aria.enabled` too ([option: aria](https://echarts.apache.org/en/option.html#aria)). That is the whole feature: a single generated `aria-label` string plus optional decals.

It does **not** generate roles for individual data items, focus order, or any keyboard interaction, and the documented instance API contains no focus or keyboard method ([api: echartsInstance](https://echarts.apache.org/en/api.html#echartsInstance)). Even ECharts' own legend buttons are reported as not keyboard accessible under the SVG renderer — open bug [#21022](https://github.com/apache/echarts/issues/21022), "[Bug] Legend Item Buttons Not Keyboard Accessible (SVG Chart)". **AC-100 must be implemented by wechart**: a focusable DOM layer over the tile driving `dispatchAction`/our own marking state.

### Many charts on one page

Guidance: canvas for large data (the stated benchmark is >1,000 elements) and for trail/heatmap blend effects; SVG for low-memory situations and "multiple chart instances that risk browser crashes", and for crisp zoom. Since 5.3.0 the SVG renderer's virtual-DOM refactor is 2-10x faster ([canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)). For a dashboard of many small tiles, the document's own criterion (many instances, memory) points at SVG; this must be measured against AC-174/AC-175 with real tile counts, using the `finished` event as the stop-watch.

`resize(opts?)` accepts `{ width, height, silent, animation: { duration, easing } }` and defaults to the container size ([api: resize](https://echarts.apache.org/en/api.html#echartsInstance.resize)). Memory is only reclaimed by `dispose()` ([api: dispose](https://echarts.apache.org/en/api.html#echartsInstance.dispose)). For dense series use `large`/`largeThreshold` and `progressive`/`progressiveThreshold` ([option: series-bar.large](https://echarts.apache.org/en/option.html#series-bar.large)).

## Gotchas

- **`triggerLineEvent` is deprecated as of 6.1.0** in favour of `series-line.triggerEvent` (`boolean|'line'|'area'`) ([option](https://echarts.apache.org/en/option.html#series-line.triggerEvent)). Prototype `charts.js:159` uses the old name.
- **`click` is gated at 4 px / same-element** inside zrender, and a dropped click also suppresses the zr-level `click` ([Handler.ts](https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts)). Do not build marking on `click`.
- **v6 default theme is new**; v5 appearance requires `import 'echarts/theme/v5.js'` ([v6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)).
- **v6 axis layout changed**: overflow and axis name/label overlap prevention are on by default, so axis positions shift; `grid.outerBoundsMode: 'none'` restores v5 behaviour ([upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/), [changelog 6.0.0](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- **v6.1.0 breaking**: bar/pictorialBar/candlestick/boxplot no longer overflow grid edges (restore with `axis.containShape: false`); `tooltip.valueFormatter`'s second arg is now `rawDataIndex`, not `dataIndex`; `axis.startValue` is decoupled from `axis.min` ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). The first affects marked-bar outlines drawn at the very top of a grid.
- **v6 rich-text labels inherit plain label properties**; disable with `richInheritPlainLabel: false` ([upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/)).
- **Root import defeats tree-shaking**: `sideEffects` lists `index.js` and `lib/chart/*.js` ([package.json](https://github.com/apache/echarts/blob/6.1.0/package.json)); one stray `import 'echarts'` adds ~368 KB gzip ([Bundlephobia](https://bundlephobia.com/package/echarts@6.1.0)).
- **`getZr()` is undocumented public API** — absent from the API reference member list ([api](https://echarts.apache.org/en/api.html#echartsInstance)). Isolate its use behind one adapter.
- **`useDirtyRect` is `false` by default** ([api: init](https://echarts.apache.org/en/api.html#echarts.init)); worth benchmarking for AC-174/175 on canvas tiles.
- **Event-name casing is inconsistent** in the docs: `brushselected` and `legendselectchanged` all-lowercase, `brushEnd` camel-cased, while `on()` is documented as taking a "lowercase event identifier" ([events](https://echarts.apache.org/en/api.html#events), [api: on](https://echarts.apache.org/en/api.html#echartsInstance.on)).
- **Security**: 6.1.0 fixed a potential XSS in the lines-series tooltip ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)). Tooltip `formatter` returns raw HTML, so every value we interpolate (dimension members, measure titles) must be escaped by us.
- Open bugs worth watching for our re-render loop: [#21566](https://github.com/apache/echarts/issues/21566) "Legend click not responding when setOption is called at high frequency (≥30fps)"; [#21584](https://github.com/apache/echarts/issues/21584) "Echartinstance.on event - eventQuery"; [#21535](https://github.com/apache/echarts/issues/21535) "TypeError in getDataParams when getData() returns null on disposed series" — the last is a dispose-ordering hazard for tiles removed mid-render.
- ECharts 6 ships a **`MatrixComponent`** coordinate system for table-like composition ([changelog 6.0.0](https://github.com/apache/echarts-doc/blob/master/en/changelog.md), [components.ts](https://github.com/apache/echarts/blob/6.1.0/src/export/components.ts)); it is an alternative to the prototype's hand-computed grid array for AC-045 trellis and should be evaluated before we commit to percentage-based `grid` maths.
- **A "cross" axis pointer labels both axes, and its label ignores `axisLabel.formatter`** (added at T195, 2026-09-21, from the installed 6.1.0 source). The pointer's label text comes from `axis.scale.getLabel` and is replaced only by the axis pointer's own `label.formatter`, which is called with `{ value, axisDimension, … }`, `value` being the raw axis value (`node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/component/axisPointer/viewHelper.js`, `getValueLabel`, around lines 120–150; the formatter option is read at line 74 as `axisPointerModel.get(['label', 'formatter'])`). So a formatted value axis needs `axisPointer.label.formatter` too, or hovering shows the value unformatted beside formatted ticks.

## Alternatives considered

Not requested — ECharts is fixed by `CLAUDE.md`. No React wrapper is used; `echarts-for-react` was not evaluated.

## Open questions / unverified

- **Tree-shaken bundle size for wechart's exact module set**: no published figure exists ([import guide](https://echarts.apache.org/handbook/en/basics/import/)); the closest published proxy is `echarts.simple.min.js` at 500,315 B for Line+Bar+Pie+Grid+Dataset+Aria+Canvas. Measure in CI.
- **Why the prototype saw no `click`**: the 4 px / same-element gate explains drops during drags, but not a total absence. Note that `charts.js:394` calls `inst.off('click')` and `charts.js:395` calls `inst.getZr().off('click')` before wiring, so no item-level `click` listener is ever attached — verify with an isolated test before concluding it is an ECharts defect.
- **Whether item clicks still reach series while the brush global cursor is active**: source reading says nothing cancels propagation, but this is undocumented ([BrushController.ts](https://github.com/apache/echarts/blob/6.1.0/src/component/helper/BrushController.ts)). Only matters if we adopt brush.
- **Official browser support matrix**: none found in README, package.json or the handbook; I checked all three. UNVERIFIED.
- **Heatmap cell and pie sector border rendering under partial marking** (dashed 1.5 px outlines at small cell sizes, prototype `charts.js:213`) is not characterised in the docs; needs a visual test.
- **Canvas vs SVG choice for a full dashboard** is a measurement, not a doc answer; the handbook explicitly declines to be prescriptive ([canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)).
