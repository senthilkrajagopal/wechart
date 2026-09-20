---
library: Vega-Lite
packages: [vega-lite, vega, vega-embed, react-vega, vega-themes]
version: 6.4.3
researched: 2026-09-19
sources:
  [
    https://vega.github.io/vega-lite/docs/,
    https://github.com/vega/vega-lite/tree/v6.4.3,
    https://vega.github.io/vega/docs/api/view/,
    https://github.com/vega/vega/tree/v6.4.0,
    https://github.com/vega/vega-embed/blob/v7.2.0/src/embed.ts,
    https://github.com/vega/react-vega,
    https://github.com/vega/vega-themes,
    https://github.com/cmudig/draco2,
    https://github.com/vega/compassql,
  ]
---

# Vega-Lite 6.4.3

Companion pins covered by this doc: vega 6.4.0, vega-embed 7.2.0, react-vega 8.0.0, and vega-themes 3.0.0. vega-embed 7.2.0 pins vega-themes exactly ([npm-vl], [npm-vega], [npm-embed], [npm-rv], [npm-themes]).

## Summary

Vega-Lite is a declarative JSON grammar of interactive graphics. Its compiler turns a Vega-Lite spec into a Vega spec ([doc-compile]). Vega then evaluates that spec as a reactive dataflow and renders it to canvas or SVG, or runs headless ([vega-view-api]).

**Why this project is looking at it.** `docs/spec.md` does not exist yet, so there are no AC or feature IDs to cite. This doc is tied to sections of [the input doc][input-doc]:

- **§4:** the user asked for Vega-Lite research.
- **§3:** the recommender design cites Draco 2, CompassQL and "Vega-Lite's own guides/* defaults".
- **§2:** the authoring features: drag-and-drop, auto-drawn charts the user can override, legends, x/y axis customization, trellis, global and cross-table filters, and tabs/sections.

The decided renderer is ECharts (CLAUDE.md). This doc reports facts and trade-offs for three possible roles: grammar or reference, recommender IR, and alternative renderer. It makes no recommendation.

Key findings:

1. **The `guides/*` path does not exist in Vega-Lite.** There is no `guides/` directory in vega-lite v6.4.3 `src/`, `src/compile/`, the repo root, or `site/docs/` ([vl-src], [vl-compile-dir], [vl-root], [vl-site-docs]). The under-specification defaults live in about a dozen files under `src/compile/{scale,axis,legend,mark}/` plus `src/stack.ts`, `src/channeldef.ts`, `src/encoding.ts` and `src/config.ts` (section B).
   - A `guides/` directory does exist in the **Vega** repo, at `packages/vega-parser/src/parsers/guides/` ([vega-guides-dir]). It builds the axis and legend scenegraph; it does not choose marks or scales.
2. **Vega-Lite never picks the mark.** `mark` is a required property of a unit spec (`mark: M` in `GenericUnitSpec`, [vl-unit-ts]). Once a mark and encodings are given, it infers field types, scale types, orientation, zero baselines, stacking, and axis and legend defaults. None of the default functions read in section B take data cardinality as an input.
3. **Draco 2's native output is its own spec format, "independent of Vega-Lite"** ([draco2-paper]). Vega-Lite comes out of its default Python `AltairRenderer` ([draco-altair-renderer]).
   - `draco` 2.0.1 ships a `py3-none-any` wheel ([pypi-draco]), but it depends on `clingo`, which ships platform-specific native wheels ([pypi-clingo]). It requires Python `>=3.10,<3.12` ([pypi-draco]).
   - The JS/WASM route is `draco-pyodide`, which runs Pyodide in the browser or Node ([draco-pyodide-readme]).
4. **CompassQL is effectively unmaintained.** The last npm version is 0.21.2 (release commit 2019-08-20) and it depends on `vega-lite ^3.3.0` ([npm-compassql], [compassql-release-commit]). Every commit since has been a dependabot bump ([compassql-commits-api]).
5. **No maintained Vega-Lite → ECharts converter was found** (section H).
6. **Controlling Vega-Lite selections from outside the chart is weak.** You cannot set a selection signal defined in a nested group through the View API (issue open since 2021, [vl-7584]). There is no brush-end event (open since 2019, [vl-5341]).
7. **Faceted and concatenated views cannot use `width: "container"` or `autosize: "fit"`** ([doc-size], [vl-messages]).

## Install

Run these in the workspace package that will import them:

```sh
# embed/render path (roles 1 and 3)
pnpm add vega-lite@6.4.3 vega@6.4.0 vega-embed@7.2.0
# optional React wrapper
pnpm add react-vega@8.0.0
# headless compile only (roles 1 and 2): vega-lite plus its declared peer
pnpm add vega-lite@6.4.3 vega@6.4.0
```

| Package     | Pinned | Published                         | License                               | Peer dependencies                                                                   | Module / engines                                 |
| ----------- | ------ | --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| vega-lite   | 6.4.3  | 2026-04-24 ([vl-releases])        | BSD-3-Clause ([npm-vl])               | `vega ^6.0.0` ([npm-vl])                                                            | `"type":"module"`, `node >=20` ([npm-vl])        |
| vega        | 6.4.0  | 2026-08-14 ([vega-releases-api])  | BSD-3-Clause ([npm-vega])             | none ([npm-vega])                                                                   | `"type":"module"`, no engines field ([npm-vega]) |
| vega-embed  | 7.2.0  | 2026-09-02 ([embed-releases-api]) | BSD-3-Clause ([npm-embed])            | `vega *`, `vega-lite *` ([npm-embed])                                               | `"type":"module"` ([npm-embed])                  |
| react-vega  | 8.0.0  | 2025-09-04 ([rv-releases-api])    | BSD-3-Clause ([rv-pkg], [rv-license]) | `react ^17 \|\| ^18 \|\| ^19`, `react-dom` (same range), `vega-embed ^7` ([rv-pkg]) | `"type":"module"` ([rv-pkg])                     |
| vega-themes | 3.0.0  | not checked                       | BSD-3-Clause ([npm-themes])           | `vega *`, `vega-lite *` ([npm-themes])                                              | `"type":"module"` ([npm-themes])                 |

- **ESM only.** vega-lite 6.0.0 ([vl-600]), vega 6.0.0 ([vega-releases-api]) and vega-embed 7.0.0 ([embed-releases-api]) each made their package ESM-only.
- **vega-embed runtime dependencies.** vega-embed 7.2.0 pins `vega-themes 3.0.0` and `vega-tooltip 1.1.0` exactly, and depends on `vega-interpreter ^2.3.2` ([npm-embed]).
- **Node 26** satisfies vega-lite's `node >=20` engine range ([npm-vl]).

**Maintenance and release cadence (question I).**

- **vega-lite:**
  - 6.x releases: 6.0.0 (2025-03-28), 6.1.0 (2025-03-28), 6.2.0 (2025-06-27), 6.3.1 (2025-09-10), 6.4.0 (2025-09-17), 6.4.1 (2025-09-23), 6.4.2 (2026-01-14) and 6.4.3 (2026-04-24) ([vl-changelog], [vl-releases]).
  - At 2026-09-19 there has been no release for about five months.
- **vega:**
  - 6.x releases: 6.0.0 (2025-03-27), 6.1.x (2025-03), 6.2.0 (2026-01-05), 6.3.0 (2026-07-21) and 6.4.0 (2026-08-14).
  - The v5 maintenance line got security fix 5.33.1 on 2026-01-06 ([vega-releases-api]).
- **vega-embed:** 7.0.0 (2025-03-28), 7.1.0 (2025-10-09) and 7.2.0 (2026-09-02) ([embed-releases-api]).
- **react-vega:**
  - 8.0.0 (2025-09-04) was a full rewrite. The GitHub release before it was 7.5.1 (2022-05-07) ([rv-releases-api]).
  - The license moved to BSD-3-Clause for v8: the LICENSE file is "Copyright (c) 2025, Vega" ([rv-license]). The registry's package-level metadata still shows Apache-2.0, which probably reflects older versions ([npm-rv-root]).
  - It has one open issue, #649: a webpack 5 build error with vega-embed 7.1.0, with no maintainer reply visible ([rv-649]).

**React 19.** react-vega 8.0.0 lists `^19` in its react and react-dom peer ranges ([rv-pkg]). vega-embed does not depend on any framework: `embed(el, spec, opts): Promise<Result>` ([embed-src]).

## Init / auth pattern

There is no auth. Data comes from the host app through a named data source: the spec declares `"data": {"name": "table"}` and the app supplies rows through the View API ([doc-data]).

**A. React 19 through react-vega 8** (pattern from [rv-readme]):

```tsx
import { useEffect, useRef } from 'react';
import { useVegaEmbed } from 'react-vega';
import type { TopLevelSpec } from 'vega-lite';

export function Chart({ spec, rows }: { spec: TopLevelSpec; rows: object[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const embed = useVegaEmbed({ ref, spec, options: { mode: 'vega-lite', actions: false } });
  useEffect(() => {
    embed?.view.data('table', rows).runAsync();
  }, [embed, rows]);
  return <div ref={ref} />;
}
```

- The hook calls `embed()` and calls `currentResult?.finalize()` in its effect cleanup ([rv-src]).
- It re-embeds whenever `spec` or `options` change, compared by deep equality (`fast-deep-equal`) ([rv-src]).
- v8 removed the `data`, `width`, `height` and `signalListeners` props; use the View API instead ([rv-readme]).

**B. vega-embed directly.** `embed(el: HTMLElement | string, spec: VisualizationSpec | string, opts?: EmbedOptions): Promise<Result>`. `Result` is `{view, spec, vgSpec, embedOptions, finalize}` ([embed-src]). Call `result.finalize()` on unmount to unregister timers and listeners ([vega-view-api]).

**C. Headless compile (no DOM).** `import { compile, type TopLevelSpec } from 'vega-lite'`.

- `compile(inputSpec: TopLevelSpec, opt?: {config?, logger?, fieldTitle?})` returns `{spec: <Vega spec>, normalized}` ([vl-compile-ts]).
- The package also exports `normalize`, `version` and the `Config` type ([vl-index-ts]).
- The JSON Schema ships as `vega-lite/build/vega-lite-schema.json`, a package export since 6.1.0 ([npm-vl], [vl-changelog]).

**D. CSP.**

- By default Vega builds expression functions with the `Function` constructor, which needs `unsafe-eval`. The alternative is to parse with `{ast: true}` and pass `expr: expressionInterpreter`, which runs "on average ~10% slower" ([vega-interpreter-doc]).
- vega-embed exposes `ast?: boolean` and `expr?: typeof expressionInterpreter` ([embed-src]).

## API surface we will use

### A. Spec grammar (question A)

| Construct         | Facts                                                                                                                                                                                                                                                                                                                                                                                                | Source                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Top level         | `$schema` (use `https://vega.github.io/schema/vega-lite/v6.json`), `background`, `padding`, `autosize` (`pad`/`fit`/`none`), `config`, and `usermeta`, which is "completely ignored by Vega and Vega-Lite and can be used for custom metadata"                                                                                                                                                       | [doc-spec]                                    |
| data              | Inline `values`, `url`, named sources (bound at runtime), top-level `datasets`, and the generators `sequence`, `graticule` and `sphere`. Formats: json, csv, tsv, topojson, with a `parse` option                                                                                                                                                                                                    | [doc-data]                                    |
| mark              | Primitive marks: arc, area, bar, circle, geoshape, image, line, point, rect, rule, square, text, tick, trail. Composite marks: boxplot, errorband, errorbar. `mark` is required                                                                                                                                                                                                                      | [doc-overview], [vl-unit-ts]                  |
| encoding channels | Position: x, y, x2, y2, xError(2), yError(2). Offsets: xOffset, yOffset. Polar: theta, radius, theta2, radius2. Geographic: longitude, latitude (and their 2 variants). Mark properties: angle, color, fill, stroke, opacity, fillOpacity, strokeOpacity, shape, size, strokeDash, strokeWidth. Also text, tooltip, href, description, detail, key, order, and the facet channels facet, row, column | [doc-encoding]                                |
| Field definition  | field, type, bin, timeUnit, aggregate, bandPosition, title, scale, axis, legend, format, sort, stack, condition, impute, datum, value                                                                                                                                                                                                                                                                | [doc-encoding]                                |
| Types             | quantitative, temporal, ordinal, nominal, geojson. `type` may be omitted: the default is nominal unless aggregate, bin, timeUnit or the scale type implies otherwise                                                                                                                                                                                                                                 | [doc-type], [vl-channeldef]                   |
| aggregate         | count, valid, values, missing, distinct, sum, product, mean, average, variance, variancep, stdev, stdevp, stderr, median, q1, q3, ci0, ci1, min, max, argmin, argmax. Can be set in an encoding or as a transform                                                                                                                                                                                    | [doc-aggregate]                               |
| timeUnit          | year, quarter, month, date, week, day, dayofyear, hours, minutes, seconds, milliseconds, plus combinations, `utc` prefixes and `binned` prefixes. Parameters: unit, maxbins, step, utc, binned. "By default, all time units represent date time using local time"                                                                                                                                    | [doc-timeunit]                                |
| scale             | Types: linear, pow, sqrt, log, symlog, time, utc, ordinal, band, point, bin-ordinal, quantile, quantize, threshold (plus identity and sequential in source). Properties: domain, domainMin/Max/Mid, domainRaw, range, rangeMin/Max, scheme, interpolate, nice, zero, clamp, padding, paddingInner/Outer, align, base, exponent, constant, bins, reverse, round                                       | [doc-scale], [vl-scale-ts]                    |
| transform         | aggregate, bin, calculate, density, extent, filter, flatten, fold, impute, joinaggregate, loess, lookup, pivot, quantile, regression, sample, stack, timeUnit, window                                                                                                                                                                                                                                | [doc-overview]                                |
| Composition       | `layer` takes only unit or layer specs. Other operators: `facet`, `hconcat`/`vconcat`/`concat`, and `repeat`. `resolve` sets shared or independent scales, axes and legends per channel                                                                                                                                                                                                              | [doc-composition], [doc-layer], [doc-resolve] |
| params            | Variable parameters, and selection parameters (`select: point \| interval`) with `bind`, `expr` and `value`                                                                                                                                                                                                                                                                                          | [doc-param]                                   |

**What could serve as or inform wechart's engine-neutral spec.** Facts only; the user decides.

- **Renderer-neutral in form.** The fieldDef model names data roles and visual channels. Rendering happens only after compiling to Vega ([doc-compile]).
- **Extension slot.** `usermeta` is ignored by both compilers ([doc-spec]).
- **Validation and types.** The exported JSON Schema and the `TopLevelSpec` type are available for validation and typing ([npm-vl], [vl-index-ts]).
- **Not in the grammar.** The spec property lists contain no tab, section or dashboard-layout constructs ([doc-spec], [doc-composition]).
- **Cube type mapping, and where it lacks information:**
  - Cube dimension types: time, string, number, boolean, geo, switch ([cube-dims]).
  - Cube measure types: count, count_distinct, count_distinct_approx, sum, avg, min, max, number, number_agg, string, time, boolean ([cube-measures]).
  - Cube's type list has no nominal/ordinal distinction, but Vega-Lite's type system needs one ([doc-type]).
  - Cube measures are SQL aggregates ([cube-measures]). A Vega-Lite encoding that also sets `aggregate` aggregates again, client-side ([doc-aggregate]).
  - Cube time granularities: year, quarter, month, week (Monday start), day, hour, minute, second ([cube-dims]).
  - Vega 6.4.0 added `isoweek` ([vega-640]). Whether vega-lite 6.4.3 accepts `isoweek` is UNVERIFIED.

### B. Defaults when under-specified (question B)

**Verifying the input doc's `guides/*` reference.**

- **vega-lite v6.4.3 has no `guides/` directory** in `src/`, `src/compile/`, the repo root or `site/docs/` ([vl-src], [vl-compile-dir], [vl-root], [vl-site-docs]).
- **`src/guide.ts` holds only shared type definitions:** `TitleMixins`, `Guide`, `VlOnlyGuideConfig`, `VL_ONLY_LEGEND_CONFIG` ([vl-guide-ts]).
- **`src/compile/guide.ts`** defines one helper, `guideEncodeEntry`, which converts guide encode entries into Vega ([vl-compile-guide-ts]).
- **The closest match is in Vega:** `vega/packages/vega-parser/src/parsers/guides/`, with files `axis-config.js`, `axis-domain.js`, `axis-grid.js`, `axis-labels.js`, `axis-ticks.js`, `axis-title.js`, `legend-gradient*.js`, `legend-symbol-groups.js`, `legend-title.js` and others ([vega-guides-dir]).
  - Those files build the axis and legend marks and merge axis config by orientation ([vega-axis-config], [vega-legend-symbols]).
  - They do not pick marks or scale types.

**Where Vega-Lite 6.4.3 makes its automatic choices** (all paths under `github.com/vega/vega-lite/blob/v6.4.3/`):

| Path                                                                                       | What it decides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/compile/scale/type.ts` (`scaleType`, `defaultType`)                                   | **Nominal/ordinal:** `ordinal` on color or discrete-range channels. `band` on x/y when the mark is rect, bar, image, rule or tick, or when there is a nested offset, an arc on polar channels, a relative band size, or `axis.tickBand`. Otherwise `point`. **Temporal:** `time` on color, `ordinal` with a warning on discrete channels, `utc` for UTC timeUnits, otherwise `time`. **Quantitative:** `bin-ordinal` for binned color, `linear` for color, `ordinal` with a warning on discrete channels, otherwise `linear` ([vl-scale-type]). The docs table says temporal on color is "Linear" ([doc-scale]); the source returns `time` |
| `src/compile/scale/properties.ts`                                                          | **`zero`:** a custom domain turns it off unless the domain spans 0. It is true for quantitative `size`. For x/y it is false on the categorical axis of bar/area/line/trail marks (the axis matching the mark's orientation), true for bar/area without x2/y2, and otherwise uses `config.scale.zero` (default true). Binned fields never get zero. **`nice`:** true on x/y unless the field is binned, the domain is explicit, domainMin/Max are set, or the scale is time/utc. **Others:** `interpolate` is `hcl` for non-nominal color; the function also sets padding, paddingInner/Outer, reverse and bins ([vl-scale-props])          |
| `src/compile/scale/range.ts`                                                               | Default color scheme: `category` for nominal, `ordinal` for other types on an ordinal scale, `diverging` when `domainMid` is set, `heatmap` for rect/geoshape, otherwise `ramp`. Also size range min/max per mark, `strokeDash` patterns, shape range `symbol`, theta `[0, 2π]` ([vl-scale-range])                                                                                                                                                                                                                                                                                                                                         |
| `src/scale.ts` (`defaultScaleConfig`)                                                      | `pointPadding 0.5`, `barBandPaddingInner 0.1`, `rectBandPaddingInner 0`, `tickBandPaddingInner 0.25`, `minBandSize 2`, `minFontSize 8`, `maxFontSize 40`, `minOpacity 0.3`, `maxOpacity 0.8`, `minSize 4`, `minStrokeWidth 1`, `maxStrokeWidth 4`, `quantileCount 4`, `quantizeCount 4`, `zero true` ([vl-scale-ts])                                                                                                                                                                                                                                                                                                                       |
| `src/compile/mark/init.ts` (`initMarkdef`, `orient`, `opacity`, `defaultFilled`, `cursor`) | **Bar/text orientation:** vertical when x is binned, or when y is aggregated and x is not; horizontal in the mirror case. Line/tick/area orientation comes from which axis holds the unbinned quantitative field; if neither does, temporal x gives vertical. **Other defaults:** opacity 0.7 for non-aggregated point, tick, circle and square marks. `filled` is false for point, line and rule. The cursor is `pointer` when `href` is set ([vl-mark-init])                                                                                                                                                                             |
| `src/stack.ts`                                                                             | Auto-stacks bar, area and arc with offset `zero`. Stackable marks: arc, bar, area, rule, point, circle, square, line, text, tick. Requires a summative aggregate and a grouping field ([vl-stack])                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/channeldef.ts` (`defaultType`, title formatters)                                      | **Type inference:** latitude/longitude → quantitative; row, column, facet, shape, strokeDash → nominal; order → ordinal; timeUnit → temporal; bin or aggregate → quantitative; otherwise nominal. **Titles:** the `verbal` formatter gives "Sum of X", "X (binned)", and `countTitle` for count ([vl-channeldef])                                                                                                                                                                                                                                                                                                                          |
| `src/encoding.ts` (`initEncoding`)                                                         | Drops invalid channels and mark-incompatible channels ("Drop unsupported channel", via `markChannelCompatible` / `supportMark`). Drops `color` when `fill` or `stroke` is set. Drops empty field defs ([vl-encoding-ts])                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/compile/axis/properties.ts`                                                           | `defaultGrid`: only continuous, unbinned scales. Label angle 270 for nominal/ordinal x without a timeUnit. `labelOverlap`: `greedy` for log/symlog, `true` for non-nominal. Orient: x → bottom, y → left. `tickCount`: `ceil(size/40)`, or `ceil(size/10)` when binned. Also `labelFlush` and `zindex` ([vl-axis-props])                                                                                                                                                                                                                                                                                                                   |
| `src/compile/axis/config.ts`                                                               | Config precedence: style, then type-specific config (`axisBand`, `axisQuantitative`, `axisTemporal`, `axisXBand`, …), then `axis`/`axisX`/`axisY`/`axisTop`/… ([vl-axis-config])                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/compile/legend/properties.ts`                                                         | Legend type: `gradient` for color on a continuous-to-continuous scale, `symbol` for quarter/month/day timeUnits and everything else. Direction: horizontal for top/bottom. Symbol shape: square for bar/rect/image/square, stroke for line/trail/rule, otherwise circle. `labelOverlap`: greedy for quantile/threshold/log/symlog ([vl-legend-props])                                                                                                                                                                                                                                                                                      |
| `src/compile/legend/parse.ts`                                                              | Legends are made for `color` plus `LEGEND_SCALE_CHANNELS` (size, shape, fill, stroke, strokeDash, strokeWidth, opacity). Color maps to fill or stroke depending on `filled`. Legends for the same field merge, and `symbol` wins over `gradient` ([vl-legend-parse], [vl-legend-ts])                                                                                                                                                                                                                                                                                                                                                       |
| `src/config.ts`                                                                            | `defaultViewConfig`: `continuousWidth: 300`, `continuousHeight: 300`, `step: 20`. Other defaults: `countTitle` "Count of Records", `timeFormat` `%b %d, %Y`, boxplot `extent: 1.5` ([vl-config-ts])                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Vega `packages/vega-parser/src/config.js`                                                  | Vega's own defaults: category scheme `tableau10`, ordinal `blues`, heatmap `yellowgreenblue`, diverging `blueorange`; legend `symbolSize 100`, `gradientLength 200`; axis `tickSize 5` ([vega-config])                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**What these defaults do not encode.** None of the functions above takes data cardinality as an input. They decide from field type, channel, mark, bin/timeUnit/aggregate and explicit spec values ([vl-scale-type], [vl-scale-props], [vl-mark-init], [vl-axis-props], [vl-legend-props]). The input doc's cardinality rules (for example, color only up to about 8–10 levels) are not in these files.

### C. Faceting and trellis (question C)

- **Two ways to facet.** Use the `facet` operator, or the `facet`/`row`/`column` encoding channels, which are "macros for a facet specification" ([doc-facet]).
- **Wrapping.** `columns` wraps only for `concat`, and for `facet`/`repeat` with a single field (no row/column) ([doc-facet]).
- **Field restrictions.** Quantitative facet fields should be binned, and temporal ones need a timeUnit. Facet channels cannot encode a constant ([doc-facet]).
- **Resolution.** Facets share scales, axes and legends by default; set `resolve` to independent to change that ([doc-facet]).
- **Layers.** A `layer` cannot use `row`/`column`; put the layer inside a facet operator instead ([doc-layer]).
- **Channel conflict.** If `facet` is combined with `row`/`column`, the `facet` channel is dropped with a warning ([vl-messages]).
- **Sizing limits.**
  - `width`/`height: "container"` and `autosize: "fit"` work only for single and layered views. `facet`, `hconcat`, `vconcat` and `repeat` are excluded ([doc-size], [vl-messages]).
  - Panel size therefore comes from fixed numbers, `continuousWidth`/`continuousHeight`, or `step` ([vl-config-ts]).
- **Repeat.** Repeat has no shared axes. Repeating into `layer` produces no legend and no stacking ([doc-repeat]).
- **Selections across panels** resolve `global`, `union` or `intersect` ([doc-selection]).
- **Panel-count limit:** UNVERIFIED. No documented maximum was found in the facet, size or composition docs.

### D. Interaction (question D)

**Params.**

- `params: [{name, value?, bind?, expr?, select?}]`. Reserved names are `datum`, `event`, `item` and `parent` ([doc-param]).
- A top-level selection param attaches to every unit view unless you give `views: [...]` ([vl-toplevelsel]).

**Selections.**

- `point` selects discrete values; clicking selects, and shift-click toggles.
- `interval` selects by dragging, with `mark`, `translate` and `zoom` options.
- Shared options: `fields`/`encodings` (projection), `on`, `clear` (default dblclick), `toggle`, `nearest`, and `resolve` ([doc-selection]).
- Initial values: point `value: [{field: v}]`; interval `value: {x: [min, max]}` ([doc-param-value]).

**Bind.**

- Input widgets can bind to variable params and point selections; direct manipulation is then disabled by default.
- `bind: "legend"` works only for point selections over a single field, and "only binding to symbol legends are supported."
- `bind: "scales"` on an interval selection gives pan and zoom ([doc-bind], [vl-messages]).

**Using a selection.**

- Filter with `{"filter": {"param": "brush", "empty": true|false}}`, use it in `condition` encodings, or use it as a scale domain ([doc-filter], [doc-param]).
- **Cross-filtering within one spec** works: the crossfilter example repeats histograms and uses one interval `brush` param as a `filter` in each view ([ex-crossfilter]).

**What a selection compiles to.**

- A top-level signal with the selection's name, updated by `vlSelectionResolve(<name>_store, …)`.
- A `<name>_store` dataset.
- Per-unit `_tuple` and `_modify` signals ([vl-sel-assemble]).
- The resolved value is an object keyed by field name. Values are arrays of selected values, or `[min, max]` for intervals. Point selections also get a `vlPoint: {or: [...]}` entry ([vega-selresolve]).

**Cross-filtering across separately embedded charts** (for example, dashboard tiles):

- **Reading.**
  - `result.view.addSignalListener('<param>', (name, value) => …)` gets the resolved object ([vega-view-api], [vl-sel-assemble]).
  - Listeners fire "immediately upon signal update, in the midst of dataflow evaluation" ([vega-view-api]).
  - There is no brush-end event. Issue #5341 has been open since 2019, and the suggested workaround is custom Vega ([vl-5341]).
- **Writing.**
  - A variable param can be changed "by modifying the underlying signal in a Vega view API" ([doc-param]).
  - Setting a _selection_ signal that lives in a nested group does not work. Issue #7584 is open, and initializing through `value` in the spec does work ([vl-7584]).
  - A general selection get/set API is requested in #1830, open since 2017 ([vl-1830]).
  - The other route is to replace a chart's data with rows already filtered by the host, using `view.data`/`view.change`.

**Vega View API** ([vega-view-api]):

| Call                                                                                  | Semantics                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `view.signal(name)` / `view.signal(name, value)`                                      | Gets a value, or sets it and returns the view. Run the view afterwards                                             |
| `view.addSignalListener(name, (name, value) => void)` / `removeSignalListener`        | Subscribe to or unsubscribe from signal changes                                                                    |
| `view.data(name)` / `view.data(name, values)`                                         | Gets the live array, or replaces it (the same as a remove-all/insert changeset)                                    |
| `view.change(name, vega.changeset().insert(t).remove(t \| pred).modify(t, field, v))` | Applies a changeset; nothing updates until the next run                                                            |
| `view.insert(name, tuples)` / `view.remove(name, tuples \| pred)`                     | Cannot be combined in the same pulse                                                                               |
| `view.addDataListener(name, handler)`                                                 | Dataset change listener                                                                                            |
| `view.runAsync()`                                                                     | Returns a Promise that resolves after rendering. It "should not be invoked repeatedly until a prior call resolves" |
| `view.getState()` / `view.setState(state)`                                            | Snapshot or restore signal and data state                                                                          |
| `view.addEventListener(type, (event, item) => void)`                                  | DOM and scenegraph events, for example click-through                                                               |
| `view.toImageURL(type, scale?)`, `toSVG()`, `toCanvas()`                              | Image export                                                                                                       |
| `view.resize()`, `view.width()` / `view.height()`, `view.finalize()`                  | Layout and cleanup                                                                                                 |

Sketch of the variable-param pattern for a dashboard filter (built from the docs above; not an official example):

```ts
// target spec: params: [{name: 'extRange', value: null}],
// transform: [{filter: 'extRange == null || (datum.amount >= extRange[0] && datum.amount <= extRange[1])'}]
await target.view.signal('extRange', [lo, hi]).runAsync();
```

### E. Rendering and performance (question E)

- **Renderers.**
  - A Vega View supports `'canvas'` (the default), `'svg'` or `'none'`. Without a container it runs headless ([vega-view-api]).
  - vega-embed 7 defaults to SVG (`opts.renderer ?? 'svg'`), a change made in 7.0.0 ([embed-src], [embed-releases-api]).
  - Canvas is "often 2-10x faster than SVG for full-component redraws (though such comparisons require nuance)" ([vega-and-d3]).
- **Data size.** No official Vega-Lite row limit or data-size guidance was found (UNVERIFIED). Guidance from other sources:
  - Adobe react-spectrum-charts, a Vega-based library, says in its third-party doc that with "data on the order of 10K rows or more, you may want to switch to `canvas`" ([rsc-wiki]).
  - A blog post measured no problems at 1,000 points, slightly sluggish interaction at 5,000, and better hover performance with SVG ([blog-grechin]).
  - Altair (the Python wrapper) raises `MaxRowsError` above 5,000 embedded rows. Its stated reason: "calculations are performed in JavaScript." With the VegaFusion transformer, Altair supports up to 100,000 rows after transforms ([altair-large]).
- **Invalid data.** The default mode is `break-paths-show-path-domains`: path marks break at null/NaN values, and other marks filter them out ([doc-invalid]).
- **VegaFusion.**
  - It provides Rust, Python and JavaScript libraries. Its Planner splits any Vega spec into a server part and a client part, and it does "not (yet) provide full coverage of all of Vega's transforms" ([vegafusion-home], [vegafusion-how]).
  - v2.0.0 (2024-11-24) dropped `vegafusion-embed`, `vegafusion-jupyter` and Java. The latest release is v2.0.3 (2025-09-29) ([vegafusion-releases-api]).
  - `vegafusion-wasm` 2.0.3 (BSD-3-Clause) connects to a VegaFusion Runtime over gRPC-web and depends on `vega-embed ^7.0.2` ([npm-vfwasm]).
  - The license is BSD-3-Clause ([vegafusion-repo]).
- **Bundle sizes** (bundlephobia, minified / gzip):

| Package                                     | Minified    | Gzip      | Source       |
| ------------------------------------------- | ----------- | --------- | ------------ |
| vega 6.4.0                                  | 519,907 B   | 181,912 B | [bp-vega]    |
| vega-lite 6.4.3                             | 269,518 B   | 87,293 B  | [bp-vl]      |
| vega-embed 7.2.0                            | 59,780 B    | 21,118 B  | [bp-embed]   |
| react-vega 8.0.0                            | 1,894 B     | 927 B     | [bp-rv]      |
| echarts 6.1.0 (full package, for reference) | 1,114,829 B | 367,958 B | [bp-echarts] |

- vega-embed's figure is smaller than vega's alone, which fits with bundlephobia excluding peer dependencies. A blog post says it does ([blog-bundlephobia]); the primary source is UNVERIFIED.
- vega-embed imports `vega-lite`, `vega-themes`, `vega-tooltip` and `vega-interpreter` statically ([embed-src]). All four are therefore bundled even if only Vega specs are passed.

### F. Legend and axis customization, config, themes (question F)

- **Axis properties** ([doc-axis]):
  - **General:** aria, bandPosition, description, minExtent, maxExtent, orient, offset, position, style, translate, zindex.
  - **Domain:** domain plus domainCap/Color/Dash/DashOffset/Opacity/Width.
  - **Labels:** format, formatType, labels, labelAlign, labelAngle, labelBaseline, labelBound, labelColor, labelExpr, labelFlush, labelFlushOffset, labelFont, labelFontSize, labelFontStyle, labelFontWeight, labelLimit, labelLineHeight, labelOffset, labelOpacity, labelOverlap, labelPadding, labelSeparation.
  - **Ticks:** ticks, tickBand, tickCap, tickColor, tickCount, tickDash, tickExtra, tickMinStep, tickOffset, tickOpacity, tickRound, tickSize, tickWidth, values.
  - **Title:** title plus titleAlign/Anchor/Angle/Baseline/Color/Font/FontSize/FontStyle/FontWeight/Limit/LineHeight/Opacity/Padding/X/Y.
  - **Grid:** grid plus gridCap/Color/Dash/Opacity/Width.
  - **Other rules:**
    - `axis: null` disables an axis.
    - Axis config accepts every property except position, orient, format, values and zindex.
    - Config variants: `axisX`, `axisY`, `axisLeft`/`Right`/`Top`/`Bottom`, `axisBand`, `axisQuantitative`, `axisTemporal`, and combinations such as `axisXTemporal`.
    - Properties can be conditional on tick data.
- **Legend properties** ([doc-legend]):
  - **General:** aria, cornerRadius, description, direction, fillColor, legendX, legendY, offset, orient, padding, strokeColor, type, tickCount, values, zindex.
  - **Gradient:** gradientLength, gradientOpacity, gradientStrokeColor, gradientStrokeWidth, gradientThickness.
  - **Labels:** format, formatType, labelAlign, labelBaseline, labelColor, labelExpr, labelFont, labelFontSize, labelFontStyle, labelLimit, labelOffset, labelOverlap.
  - **Symbols:** symbolDash, symbolDashOffset, symbolFillColor, symbolOffset, symbolOpacity, symbolSize, symbolStrokeColor, symbolStrokeWidth, symbolType.
  - **Layout:** clipHeight, columnPadding, columns, gridAlign, rowPadding, symbolLimit.
  - **Title:** title plus title* properties.
  - **Other rules:**
    - `orient` takes `left`, `right`, `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right` or `none`.
    - `legend: null` disables a legend.
    - Channels that encode the same field get one combined legend.
    - Config-only properties include `disable`, the `gradient*Length` limits, and `unselectedOpacity`.
    - Defaults: `gradientHorizontalMaxLength 200`, `gradientHorizontalMinLength 100`, `gradientVerticalMaxLength 200`, `gradientVerticalMinLength 64`, `unselectedOpacity 0.35` ([vl-legend-ts]).
- **Scale properties an axis UI would expose:** type (for example log), domain, domainMin/domainMax, zero, nice, reverse, clamp, scheme ([doc-scale]).
- **Formatting.**
  - `format` uses d3-format patterns for numbers and d3-time-format for time.
  - `formatType` is `number`, `time`, or a registered custom type.
  - Config defaults: `numberFormat`, `timeFormat`, `normalizedNumberFormat` ([doc-format], [vl-config-ts]).
- **Themes.**
  - vega-themes provides excel, ggplot2, quartz, vox, fivethirtyeight, dark, latimes, urbaninstitute, googlecharts, powerbi, and carbonwhite/g10/g90/g100.
  - Apply one with vega-embed's `theme` option or `config: themes.quartz`.
  - "Once instantiated, a visualization theme can not be changed. Instead, the input specification must be re-parsed" ([themes-repo]).
  - vega-embed types `theme` as `keyof Omit<typeof themes, 'version'>` ([embed-src]).

### G. Recommendation tooling facts (question G)

**Draco 2 (cmudig/draco2).**

- **Package.**
  - PyPI `draco` 2.0.1 (2024-02-02), MIT, `requires_python >=3.10.0,<3.12`, single wheel `draco-2.0.1-py3-none-any.whl` ([pypi-draco]).
  - Dependencies: `altair>=5.2,<6`, `clingo>=5.5.2,<6`, `fastapi`, `pandas`, `pydantic`, `scikit-learn`, `uvicorn`, `tabulate` ([pypi-draco]).
  - clingo 5.8.2 ships only platform wheels (for example `cp310-…-manylinux…`, `macosx…`); there is no `py3-none-any` wheel ([pypi-clingo]).
  - **Verdict on "pure Python":** true for Draco's own code, which "doesn't need both Python and Node" ([draco-1v2]). The solver underneath is native.
- **Activity.** No release since v2.0.1 ([draco2-releases-api]). Commits through 2026-09-15 are dependency and pre-commit bumps ([draco2-commits-api]).
- **Output.**
  - The native spec format is "independent of Vega-Lite," with a default Vega-Lite-based renderer ([draco2-paper]).
  - The native spec is an entity/attribute tree: `number_rows`, `field[{name, type}]`, `view[{mark[{type, encoding[{channel, field}]}], scale[{channel, type}]}]` ([draco-examples]).
  - `AltairRenderer(BaseRenderer[VegaLiteChart])` returns Altair Chart, LayerChart, FacetChart, HConcatChart or VConcatChart objects ([draco-altair-renderer], [draco-base-renderer]).
  - Because of `altair<6`, the ceiling is Altair 5.5.0, whose `SCHEMA_VERSION = "v5.20.1"` ([altair-550-schema]). Altair adopted Vega-Lite 6 in its 6.x line ([altair-3832]).
  - **Verdict on "it emits Vega-Lite":** only through the Python renderer. The emitted spec uses the Vega-Lite v5 schema.
- **JS/WASM paths.**
  - (a) `draco-pyodide` 2.0.1 (Apache-2.0 on npm, [npm-draco-pyodide]): `loadPyodide({indexURL})`, then `loadPackage('draco')`, then `runPython(...)`, in the browser or Node ([draco-pyodide-readme]). The paper calls it a WebAssembly package for any modern browser ([draco2-paper]).
  - (b) The knowledge base is plain ASP. `define.lp`, `generate.lp`, `hard.lp`, `soft.lp`, `helpers.lp`, `constraints.lp`, `weights.lp` and `optimize.lp` on `main` contain no `#script` blocks ([draco-asp-dir], [draco-define], [draco-hard], [draco-soft], [draco-weights], [draco-optimize]).
    - Weights are `#const <name>_weight = N.` ([draco-weights]).
    - The objective is `#minimize { W,F,Q: preference_weight(F,W), preference(F,Q) }.` ([draco-optimize]).
    - `clingo-wasm` 0.6.0 (Apache-2.0) wraps clingo 5.8.1, solves in a worker, and runs in the browser and Node ([npm-clingo-wasm], [clingo-wasm-repo]).
    - Draco's spec↔facts codec (`dict_to_facts`, `answer_set_to_dict`) is Python ([draco-fact-utils]).
    - Running the Draco 2 knowledge base under clingo-wasm is UNVERIFIED: no source was found showing it done.
  - (c) The Draco 1 JS package `draco-core` 0.0.6 depends on `vega-lite ^3.0.3` ([npm-draco-core]).
- **Domains in `define.lp` (main).**
  - Marks: point, bar, line, area, text, tick, rect.
  - Channels: x, y, color, size, shape, text, detail.
  - Primitive field types: string, number, boolean, datetime.
  - Facet channels: row, col. Tasks: value, summary ([draco-define]).
- **Input-doc claims checked.**
  - Draco 1 re-implemented APT and CompassQL, and learned weights "from two independent graphical perception studies" instead of setting them by hand ([draco1-paper]).
  - Draco-Learn learns weights "from ranked pairs of visualizations," and the default knowledge base adopts CompassQL rules ([draco2-paper]).
  - A dedicated paper exists because "even visualization experts lose overview in Draco and struggle to retrace the automated recommendation decisions" ([draco-kb-va]).

**CompassQL.**

- npm `compassql` 0.21.2, BSD-3-Clause, depends on `vega-lite ^3.3.0` and `datalib` ([npm-compassql], [compassql-license]).
- The v0.21.2 tag commit is dated 2019-08-20, and the last GitHub release object is v0.21.1 (2019-05-27) ([compassql-release-commit], [compassql-releases-api]).
- The repo is not archived and has 93 open issues ([compassql-repo-api]). Recent commits are dependabot only, the latest on 2026-04-03 ([compassql-commits-api]).
- It takes partial specs with wildcards (for example `"mark": "?"`) and returns ranked Vega-Lite specs ([compassql-repo]).

### H. Vega-Lite → ECharts (question H)

**Converters.** No maintained converter was found.

- Searches for "vega-lite to echarts converter", "vl2echarts", "vegalite2echarts", "vega2echarts" and "vega-lite-to-echarts" returned none.
- `vl-convert` targets Vega, SVG and PNG, not ECharts ([vl-convert]).
- OpenSearch Dashboards issue #2385 compared Vega-Lite, Vega, Plotly and ECharts as a rendering layer and proposed consolidating on Vega-Lite. That is prior art for a choice, not a converter ([osd-2385]).

**Semantic gaps** (ECharts facts at tag 6.1.0; `echarts` latest is 6.1.0, [npm-echarts]):

1. **Scales.** ECharts axis types are `value`, `category`, `time` and `log` only ([ec-axis-types]). Vega-Lite's pow, sqrt, symlog, utc, band-vs-point, quantile, quantize, threshold and bin-ordinal scales ([doc-scale]) have no axis-type equivalent. How color scales map to ECharts `visualMap` is UNVERIFIED.
2. **Transforms.** Vega-Lite has 19 transforms that run in Vega's dataflow ([doc-overview]). ECharts documents `filter` and `sort` as built-in dataset transforms; regression, histogram and clustering need the external ecStat ([ec-transform]).
   - Any Vega-Lite transform must therefore be computed outside ECharts: in Cube, in JS, or by running Vega headless and reading `view.data(name)` ([vega-view-api]).
3. **Faceting.** The ECharts option has no `facet`/`trellis`/`row`/`column` key. `grid`, `xAxis`, `yAxis`, `series` and `matrix` all accept arrays ([ec-option]).
   - A converter must lay out the panels and apply Vega-Lite `resolve` semantics itself.
   - Whether the ECharts 6 matrix coordinate system ([ec-v6]) suits small multiples is UNVERIFIED.
4. **Stacking.** Vega-Lite auto-stacks bar, area and arc ([vl-stack]). ECharts stacks only series that share a `stack` value ([ec-stack]). Vega-Lite's `normalize`/`center` offsets would need precomputing (ECharts `stackStrategy` coverage UNVERIFIED).
5. **Grouping and legends.** Vega-Lite groups by color, detail or shape fields within one mark and builds a legend per scale channel ([vl-legend-parse]). ECharts legend items correspond to series or data names ([ec-legend]), so a converter must split rows into series. How ECharts shows size/opacity legends is UNVERIFIED.
6. **Interaction.** Vega-Lite selections are data predicates evaluated inside the dataflow ([doc-selection]). ECharts emits `brushselected`, `legendselectchanged` and `datazoom` events and accepts `dispatchAction` ([ec-event]). The host app must turn those events into filters.
7. **Chart coverage.** ECharts has treemap, sankey, sunburst, funnel, gauge, chord, radar, candlestick, themeRiver, graph and custom series ([ec-option]). None of these is in Vega-Lite's mark list ([doc-overview]). How Vega-Lite's trail, tick, rule and errorband marks map to ECharts is UNVERIFIED.
8. **Defaults.** The Vega-Lite defaults in section B (zero, nice, label angle 270, 0.7 opacity, tableau10) are compiler behavior. Visual parity would require emitting them explicitly. ECharts' own defaults are UNVERIFIED here.

## Gotchas

- **Stale docs on default size.** v6.0.0 made "feat!: change default continuous size" ([vl-600]), and the v6.4.3 source has `continuousWidth/Height: 300` ([vl-config-ts]). The size docs page still says 200 ([doc-size]).
- **Stale docs on scale types.** The scale docs table says temporal on color is Linear, and lists band only for bar/rect/rule. The source returns `time` for temporal color and includes `tick` and `image` in the band list ([doc-scale], [vl-scale-type]).
- **Renderer defaults differ.** vega-embed 7 defaults to SVG, while a raw Vega View defaults to canvas ([embed-src], [vega-view-api]).
- **ESM only.** Consumers that `require()` these packages fail. See [rv-649] for a webpack 5 report; Vite behavior with react-vega 8 is untested here.
- **Missing `type` becomes nominal.** Leaving out `type` on a numeric field without aggregate or bin gives `nominal` ([doc-type], [vl-channeldef]).
- **Invalid channels fail quietly.** They are dropped with warnings, not errors ([vl-encoding-ts]). Pass `logger` to `compile` to capture the warnings ([vl-compile-ts]).
- **Container sizing.** Only single and layered views support container sizing ([doc-size]). The docs say that after a programmatic container resize you must trigger `window.resize` ([doc-size]). Vega 6.4.0 added a `container:resize` event source ([vega-640]); whether vega-lite 6.4.3's output uses it is UNVERIFIED.
- **Timing rules.** Signal listeners run mid-dataflow, and `runAsync` must not be re-invoked before the previous call resolves ([vega-view-api]).
- **Legend binding limits.** It works only for point selections over a single field, and only on symbol legends ([doc-bind], [vl-messages]).
- **Themes are fixed per view.** Changing a theme needs a re-parse ([themes-repo]). react-vega re-embeds on any deep change to spec or options ([rv-src]).
- **Time zones.** Time units are local time unless UTC is requested ([doc-timeunit]).
- **Security.**
  - Vega has 10 published advisories ([vega-advisories]). The high-severity ones are GHSA-m9rg-mr6g-75gm (2026-01-05), GHSA-829q-m3qg-ph8r (2026-01-05) and GHSA-7f2v-3qq3-vvjf (2025-11-13).
  - GHSA-m9rg (vega-functions ≤6.1.0, patched in 6.1.1): the CSP interpreter "does not prevent this issue" ([ghsa-m9rg]).
  - GHSA-829q (vega-selections ≤6.1.0, patched in 6.1.2): workaround is to avoid attaching vega or View instances to globals ([ghsa-829q]).
  - The pinned vega 6.4.0 depends on `vega-functions ~6.2.0` ([npm-vega-640]), which depends on `vega-selections ^6.1.5` ([npm-vf-620]). Both are above the patched versions.
  - Specs can carry expressions (`filter`, `calculate`, `expr`) ([doc-filter], [doc-param]). Treat user-authored specs as code.
  - vega-embed has no published advisories ([embed-advisories]). 7.2.0 restricted `editorUrl` to URLs ([embed-720]).
  - The default actions menu includes "Open in Editor" pointing at `editorUrl` (default `http://vega.github.io/editor/`) ([embed-readme]). Setting `actions: false` removes it.
- **CSP cost.** CSP-safe mode costs about 10% ([vega-interpreter-doc]).

## Alternatives considered

The caller asked for facts and trade-offs for three roles. There is no recommendation here, and ECharts stays the decided renderer; changing it needs the user's approval under CLAUDE.md.

**Role 1: grammar or reference for wechart's engine-neutral chart spec.**

- For:
  - A mature, renderer-independent channel/fieldDef/type vocabulary covering aggregate, bin, timeUnit, sort, scale, axis and legend ([doc-encoding]).
  - Composition plus `resolve` for trellis ([doc-facet], [doc-resolve]).
  - Declarative params as filter predicates ([doc-filter]).
  - An exported JSON Schema and TS types ([npm-vl], [vl-index-ts]), and a `usermeta` extension slot ([doc-spec]).
- Against:
  - No tabs, sections or dashboard constructs ([doc-spec]).
  - `mark` is required, so there is no "auto" mark ([vl-unit-ts]).
  - Client-side transforms overlap with Cube's server-side aggregation ([doc-aggregate], [cube-measures]).
  - No nominal/ordinal information from Cube ([cube-dims]).
  - Chart types ECharts has but Vega-Lite lacks (H.7).
  - Vega-Lite semantics such as auto-stack, zero and orient are defined by its compiler. Adopting the grammar for ECharts means re-implementing them (H).

**Role 2: the recommender's intermediate representation.**

- CompassQL's IR is Vega-Lite v3-era, and CompassQL has not had a release since 2019 ([npm-compassql], [compassql-release-commit]).
- Draco 2's IR is its own spec, and Vega-Lite (v5.20.1 schema) is a Python-side render output ([draco2-paper], [altair-550-schema]).
- The Draco spec's primitive field types (string, number, boolean, datetime) line up with Cube's dimension types (string, number, boolean, time) ([draco-define], [cube-dims]).
- Vega-Lite's `compile()` runs without a DOM and exposes resolved defaults in the compiled output ([vl-compile-ts]). Whether it helps as a "defaults oracle" for explanations is UNVERIFIED.
- Running Draco at all brings in Python, or Pyodide ([pypi-draco], [draco-pyodide-readme]). Python is not in the decided stack; adding it would be a stack change that needs the user's approval under CLAUDE.md.

**Role 3: alternative renderer.**

- Bundle size: vega, vega-lite and vega-embed are about 182, 87 and 21 kB gzip, versus about 368 kB gzip for full echarts ([bp-vega], [bp-vl], [bp-embed], [bp-echarts]).
- Strong in-spec cross-filtering ([ex-crossfilter]), but weak external control of selections ([vl-7584], [vl-1830], [vl-5341]).
- No container sizing for trellis ([doc-size]).
- React 19 works through react-vega 8 ([rv-pkg]).
- Security advisory history ([vega-advisories]).
- Fewer chart types than ECharts (H.7).
- Server-side scaling needs VegaFusion's Rust/Python runtime ([vegafusion-how], [npm-vfwasm]).

## Open questions / unverified

- There are no AC or feature IDs yet because `docs/spec.md` does not exist. Re-map this doc to ACs after write-spec.
- UNVERIFIED: whether vega-lite 6.4.3 accepts the `isoweek` timeUnit that Vega 6.4.0 added ([vega-640]). Cube weeks start on Monday ([cube-dims]).
- UNVERIFIED: whether vega-lite 6.4.3's compiled `width: "container"` uses Vega 6.4.0's `container:resize` event.
- UNVERIFIED: whether vega-embed's `ast: true` alone turns on the interpreter, or whether `expr` must be passed too. The README and types list both options ([embed-readme], [embed-src]).
- UNVERIFIED: any official row-count guidance for Vega-Lite. Only third-party and blog sources were found (section E).
- UNVERIFIED: running the Draco 2 knowledge base under clingo-wasm. The `.lp` files were read at `main`, not at the v2.0.1 tag.
- UNVERIFIED: the ECharts-side details in section H (visualMap, time and UTC handling, ECharts defaults, matrix for small multiples, `stackStrategy`). These belong in the ECharts research doc.
- Not read: `src/compile/layoutsize/*` (size resolution) ([vl-compile-dir]).
- Needs the user's decision: whether Python or Pyodide (for Draco) may enter the stack. Pyodide, clingo-wasm or compassql would each need their own research doc before any import. They are not in this doc's `packages:`.

[input-doc]: ../inputs/2026-09-19-product-direction.md
[npm-vl]: https://registry.npmjs.org/vega-lite/latest
[npm-vega]: https://registry.npmjs.org/vega/latest
[npm-vega-640]: https://registry.npmjs.org/vega/6.4.0
[npm-embed]: https://registry.npmjs.org/vega-embed/latest
[npm-rv]: https://registry.npmjs.org/react-vega/latest
[npm-rv-root]: https://registry.npmjs.org/react-vega
[npm-themes]: https://registry.npmjs.org/vega-themes/latest
[npm-vf-620]: https://registry.npmjs.org/vega-functions/6.2.0
[npm-compassql]: https://registry.npmjs.org/compassql/latest
[npm-draco-core]: https://registry.npmjs.org/draco-core/latest
[npm-draco-pyodide]: https://registry.npmjs.org/draco-pyodide/latest
[npm-clingo-wasm]: https://registry.npmjs.org/clingo-wasm/latest
[npm-vfwasm]: https://registry.npmjs.org/vegafusion-wasm/latest
[npm-echarts]: https://registry.npmjs.org/echarts/latest
[vl-src]: https://github.com/vega/vega-lite/tree/v6.4.3/src
[vl-compile-dir]: https://github.com/vega/vega-lite/tree/v6.4.3/src/compile
[vl-root]: https://github.com/vega/vega-lite/tree/v6.4.3
[vl-site-docs]: https://github.com/vega/vega-lite/tree/v6.4.3/site/docs
[vl-guide-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/guide.ts
[vl-compile-guide-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/guide.ts
[vl-scale-type]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/scale/type.ts
[vl-scale-props]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/scale/properties.ts
[vl-scale-range]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/scale/range.ts
[vl-scale-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/scale.ts
[vl-mark-init]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/mark/init.ts
[vl-axis-props]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/axis/properties.ts
[vl-axis-config]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/axis/config.ts
[vl-legend-props]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/legend/properties.ts
[vl-legend-parse]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/legend/parse.ts
[vl-legend-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/legend.ts
[vl-stack]: https://github.com/vega/vega-lite/blob/v6.4.3/src/stack.ts
[vl-channeldef]: https://github.com/vega/vega-lite/blob/v6.4.3/src/channeldef.ts
[vl-encoding-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/encoding.ts
[vl-config-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/config.ts
[vl-unit-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/spec/unit.ts
[vl-index-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/index.ts
[vl-compile-ts]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/compile.ts
[vl-messages]: https://github.com/vega/vega-lite/blob/v6.4.3/src/log/message.ts
[vl-sel-assemble]: https://github.com/vega/vega-lite/blob/v6.4.3/src/compile/selection/assemble.ts
[vl-toplevelsel]: https://github.com/vega/vega-lite/blob/v6.4.3/src/normalize/toplevelselection.ts
[vl-releases]: https://github.com/vega/vega-lite/releases
[vl-600]: https://github.com/vega/vega-lite/releases/tag/v6.0.0
[vl-changelog]: https://github.com/vega/vega-lite/blob/v6.4.3/CHANGELOG.md
[vl-7584]: https://github.com/vega/vega-lite/issues/7584
[vl-1830]: https://github.com/vega/vega-lite/issues/1830
[vl-5341]: https://github.com/vega/vega-lite/issues/5341
[vega-guides-dir]: https://github.com/vega/vega/tree/v6.4.0/packages/vega-parser/src/parsers/guides
[vega-axis-config]: https://github.com/vega/vega/blob/v6.4.0/packages/vega-parser/src/parsers/guides/axis-config.js
[vega-legend-symbols]: https://github.com/vega/vega/blob/v6.4.0/packages/vega-parser/src/parsers/guides/legend-symbol-groups.js
[vega-config]: https://github.com/vega/vega/blob/v6.4.0/packages/vega-parser/src/config.js
[vega-selresolve]: https://github.com/vega/vega/blob/v6.4.0/packages/vega-selections/src/selectionResolve.js
[vega-releases-api]: https://api.github.com/repos/vega/vega/releases?per_page=15
[vega-640]: https://github.com/vega/vega/releases/tag/v6.4.0
[vega-view-api]: https://vega.github.io/vega/docs/api/view/
[vega-interpreter-doc]: https://vega.github.io/vega/usage/interpreter/
[vega-and-d3]: https://vega.github.io/vega/about/vega-and-d3/
[vega-advisories]: https://github.com/vega/vega/security/advisories
[ghsa-m9rg]: https://github.com/vega/vega/security/advisories/GHSA-m9rg-mr6g-75gm
[ghsa-829q]: https://github.com/vega/vega/security/advisories/GHSA-829q-m3qg-ph8r
[embed-readme]: https://github.com/vega/vega-embed/blob/main/README.md
[embed-src]: https://github.com/vega/vega-embed/blob/v7.2.0/src/embed.ts
[embed-releases-api]: https://api.github.com/repos/vega/vega-embed/releases?per_page=15
[embed-720]: https://github.com/vega/vega-embed/releases/tag/v7.2.0
[embed-advisories]: https://github.com/vega/vega-embed/security/advisories
[rv-readme]: https://github.com/vega/react-vega/blob/master/README.md
[rv-pkg]: https://github.com/vega/react-vega/blob/master/package.json
[rv-src]: https://github.com/vega/react-vega/blob/master/src/VegaEmbed.tsx
[rv-license]: https://github.com/vega/react-vega/blob/master/LICENSE
[rv-releases-api]: https://api.github.com/repos/vega/react-vega/releases
[rv-649]: https://github.com/vega/react-vega/issues/649
[themes-repo]: https://github.com/vega/vega-themes
[doc-overview]: https://vega.github.io/vega-lite/docs/
[doc-spec]: https://vega.github.io/vega-lite/docs/spec.html
[doc-encoding]: https://vega.github.io/vega-lite/docs/encoding.html
[doc-type]: https://vega.github.io/vega-lite/docs/type.html
[doc-aggregate]: https://vega.github.io/vega-lite/docs/aggregate.html
[doc-timeunit]: https://vega.github.io/vega-lite/docs/timeunit.html
[doc-scale]: https://vega.github.io/vega-lite/docs/scale.html
[doc-axis]: https://vega.github.io/vega-lite/docs/axis.html
[doc-legend]: https://vega.github.io/vega-lite/docs/legend.html
[doc-facet]: https://vega.github.io/vega-lite/docs/facet.html
[doc-composition]: https://vega.github.io/vega-lite/docs/composition.html
[doc-layer]: https://vega.github.io/vega-lite/docs/layer.html
[doc-repeat]: https://vega.github.io/vega-lite/docs/repeat.html
[doc-resolve]: https://vega.github.io/vega-lite/docs/resolve.html
[doc-size]: https://vega.github.io/vega-lite/docs/size.html
[doc-param]: https://vega.github.io/vega-lite/docs/parameter.html
[doc-selection]: https://vega.github.io/vega-lite/docs/selection.html
[doc-bind]: https://vega.github.io/vega-lite/docs/bind.html
[doc-param-value]: https://vega.github.io/vega-lite/docs/param-value.html
[doc-filter]: https://vega.github.io/vega-lite/docs/filter.html
[doc-data]: https://vega.github.io/vega-lite/docs/data.html
[doc-invalid]: https://vega.github.io/vega-lite/docs/invalid-data.html
[doc-format]: https://vega.github.io/vega-lite/docs/format.html
[doc-compile]: https://vega.github.io/vega-lite/usage/compile.html
[ex-crossfilter]: https://vega.github.io/vega-lite/examples/interactive_crossfilter.html
[bp-vega]: https://bundlephobia.com/api/size?package=vega@6.4.0
[bp-vl]: https://bundlephobia.com/api/size?package=vega-lite@6.4.3
[bp-embed]: https://bundlephobia.com/api/size?package=vega-embed@7.2.0
[bp-rv]: https://bundlephobia.com/api/size?package=react-vega@8.0.0
[bp-echarts]: https://bundlephobia.com/api/size?package=echarts@6.1.0
[blog-bundlephobia]: https://medium.com/@glitch.txs/on-measuring-the-bundle-size-of-javascript-packages-5816e216e3d8
[altair-large]: https://altair-viz.github.io/user_guide/large_datasets.html
[rsc-wiki]: https://github.com/adobe/react-spectrum-charts/wiki/Chart-API
[blog-grechin]: https://grechin.org/2022/07/19/vega-visualization-performance-benchmark.html
[vegafusion-home]: https://vegafusion.io/
[vegafusion-how]: https://vegafusion.io/about/how_it_works.html
[vegafusion-repo]: https://github.com/vega/vegafusion
[vegafusion-releases-api]: https://api.github.com/repos/vega/vegafusion/releases?per_page=5
[pypi-draco]: https://pypi.org/pypi/draco/json
[pypi-clingo]: https://pypi.org/pypi/clingo/5.8.2/json
[draco2-releases-api]: https://api.github.com/repos/cmudig/draco2/releases?per_page=10
[draco2-commits-api]: https://api.github.com/repos/cmudig/draco2/commits?per_page=10
[draco-1v2]: https://dig.cmu.edu/draco2/applications/draco1_vs_draco2.html
[draco-examples]: https://dig.cmu.edu/draco2/facts/examples.html
[draco2-paper]: https://ar5iv.labs.arxiv.org/html/2308.14247
[draco1-paper]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf
[draco-kb-va]: https://arxiv.org/abs/2307.12866
[draco-asp-dir]: https://github.com/cmudig/draco2/tree/main/draco/asp
[draco-define]: https://github.com/cmudig/draco2/blob/main/draco/asp/define.lp
[draco-hard]: https://github.com/cmudig/draco2/blob/main/draco/asp/hard.lp
[draco-soft]: https://github.com/cmudig/draco2/blob/main/draco/asp/soft.lp
[draco-weights]: https://github.com/cmudig/draco2/blob/main/draco/asp/weights.lp
[draco-optimize]: https://github.com/cmudig/draco2/blob/main/draco/asp/optimize.lp
[draco-fact-utils]: https://github.com/cmudig/draco2/blob/main/draco/fact_utils.py
[draco-base-renderer]: https://github.com/cmudig/draco2/blob/main/draco/renderer/base_renderer.py
[draco-altair-renderer]: https://github.com/cmudig/draco2/blob/main/draco/renderer/altair/altair_renderer.py
[draco-pyodide-readme]: https://unpkg.com/draco-pyodide@2.0.1/README.md
[clingo-wasm-repo]: https://github.com/domoritz/clingo-wasm
[altair-550-schema]: https://github.com/vega/altair/blob/v5.5.0/altair/vegalite/v5/schema/__init__.py
[altair-3832]: https://github.com/vega/altair/issues/3832
[compassql-repo]: https://github.com/vega/compassql
[compassql-repo-api]: https://api.github.com/repos/vega/compassql
[compassql-commits-api]: https://api.github.com/repos/vega/compassql/commits?per_page=5
[compassql-release-commit]: https://api.github.com/repos/vega/compassql/commits/fff9ae71968a9a24d9bfe57ed46f781804b7f59d
[compassql-releases-api]: https://api.github.com/repos/vega/compassql/releases?per_page=3
[compassql-license]: https://github.com/vega/compassql/blob/master/LICENSE
[ec-axis-types]: https://github.com/apache/echarts/blob/6.1.0/src/coord/axisCommonTypes.ts
[ec-option]: https://github.com/apache/echarts/blob/6.1.0/src/export/option.ts
[ec-transform]: https://apache.github.io/echarts-handbook/en/concepts/data-transform/
[ec-legend]: https://apache.github.io/echarts-handbook/en/concepts/legend/
[ec-event]: https://apache.github.io/echarts-handbook/en/concepts/event/
[ec-stack]: https://apache.github.io/echarts-handbook/en/how-to/chart-types/bar/stacked-bar/
[ec-v6]: https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/
[osd-2385]: https://github.com/opensearch-project/OpenSearch-Dashboards/issues/2385
[vl-convert]: https://github.com/vega/vl-convert
[cube-dims]: https://docs.cube.dev/reference/data-modeling/dimensions
[cube-measures]: https://docs.cube.dev/reference/data-modeling/measures
