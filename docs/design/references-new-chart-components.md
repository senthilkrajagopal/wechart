# Design references: new chart components for wechart

**For:** choosing the chart components that would add the most value to wechart and that it doesn't have yet.
**Status:** proposed on 2026-10-18. Nothing here amends the spec until the user answers §7.
**Method note:**
- The WebSearch budget for this session was already used up, so every external source was fetched from a known vendor URL: TIBCO docs, Microsoft Learn, Google Cloud docs, Metabase docs, Sigma help, Grafana docs, GitHub for Superset, ECharts, Observable Plot and Vega-Lite.
- Where a fetch failed, this document makes **no claim** about that product. That covers Tableau's bullet-graph and density-map pages (404) and Observable Plot's site (429; its GitHub docs were used instead).
- `graphify` was not run because this agent has no shell. wechart's state was read directly from the files named in §1.
- Measurements and caps are never invented. Any number marked "proposed" is a candidate answer in §7, not a decision.

---

## 1. What wechart has today (not proposed again)

| Area | As built | Where |
|---|---|---|
| Chart types (20) | KPI, bar, horizontal bar, grouped bar, stacked bar, line, multi-series line, area, stacked area, scatter, pie, donut, treemap, heatmap, table, pivot, small multiples (trellis), combo, box plot, country map | `packages/core/src/chart-type-names.ts`; `packages/web/src/editor/chartTypeCatalog.ts`; AC-037, AC-305, AC-306 |
| ECharts series modules | bar, line, scatter, pie, treemap, heatmap, boxplot, combo, map | `packages/charts/src/series/` |
| Wells | Metrics, Dimensions, Time, plus a colour split (`encoding.color`) and the box plot's "Each point is" (AC-314) | `packages/recommender/src/requirements.ts`; `series/scatter.ts:45` |
| Scatter | Fixed marker size (`symbolSize: MARK.markerPx`); no size or shape channel | `series/scatter.ts:89` |
| KPI | One number and its label, with a "Marked $X · p%" badge. No comparison, target, sparkline or tile-by | `packages/web/src/tiles/Kpi.tsx` |
| Country map | ISO-3 admin-0, Natural Earth 1:50m, equal-area through d3-geo, sequential ramp | AC-305, AC-313; `series/map.ts`; direction.md rule 86 |
| Stacking | Sums only; no 100 % stacking | grep of `packages/` |
| Recommender caps | 8 colours, 20 panels, 6 pie slices, 200 heatmap cells; never two value axes | AC-030, AC-031 |
| Markings | A predicate over dimension members (AC-087, AC-103); range marking along an axis (AC-093); at most 1,000 items (AC-102); marked share through one extra query (AC-104); marked items keep their colour with an outline, unmarked items fade (AC-096) | `docs/spec.md` F10 |
| Accessibility baseline | A table view for every chart (AC-178); no state shown by colour alone (AC-177); keyboard reach frozen as built, new keyboard work only with the user's OK (AC-176) | `docs/spec.md` |
| **Already being designed (R80), so not redone here** | Per-series combo marks, 2 axes, synchronize, log scale per axis, **reference lines and bands**; rich text tiles with **inline SVG sparklines, icons, bullet graphs, Change values**, filter controls, parameters; trend lines computed by wechart | `docs/requirements-log.md` R80; `docs/design/references-combo-and-rich-tiles.md`; `docs/research/rich-tiles-and-combo-tech.md` |
| **Phase 3 (planned, not redone)** | Curve fits, forecasting, clustering, statistics, data functions | `docs/inputs/2026-10-18-phase-3-advanced-analytics.md` |

---

## 2. Products studied

| Product | Why chosen | Sources |
|---|---|---|
| Spotfire 15.0 | The product wechart replaces (requirements §1; M1 and M4). Its visualization set is the parity bar. | [sf-gt] [sf-wf] [sf-kpi] [sf-pcp] [sf-sum] [sf-map] [sf-3d] [sf-scatter] [sf-hm] [sf-bar] [sf-box] [sf-hist] [sf-bullet-15] [sf-spark-15] |
| Tableau | The reference for Show Me-style recommendation and for the chart-building idioms analysts learn. | [tab-showme] [tab-hist] [tab-gantt] [tab-pareto] [tab-maps] |
| Power BI | The BI tool most business users know. Its core visuals and Microsoft's own custom visuals. | [pbi-overview] [pbi-wf] [pbi-kpi] [pbi-bullet] [pbi-repos] |
| Superset | A named bar (requirements §1), running locally on :8088. ECharts-based, so its plugins show what ECharts can carry. | [ss-echarts] [ss-plugins] [ss-bignum] [ss-trend] [ss-bullet] [ss-wf] [ss-gantt] [ss-partition] [ss-calendar] [ss-horizon] |
| Metabase | A named bar (requirements §1), running locally on :3000. | [mb-viz] [mb-trend] [mb-map] [mb-sankey] |
| Looker / Looker Studio | Semantic-layer BI, the closest model to Cube. | [lk-types] [lk-single] [lk-timeline] [lk-funnel] [ls-score] |
| Sigma | Modern warehouse-native BI. | [sig-viz] [sig-kpi] |
| Grafana | Time-series and operational idioms. | [gf-viz] [gf-state] [gf-stat] [gf-geomap] |
| Observable Plot, Vega-Lite | Grammar-of-graphics transforms that wechart's engine-neutral spec can adopt. | [op-dodge] [op-normalize] [op-difference] [vl-bin] [vl-tick] [vl-density] |
| ECharts 6.1 | The decided renderer. | [ec-v6] [ec-series] [ec-comp] [ec-custom] and the per-series pages below |
| Cube (Core, plus Cloud's chart docs) | The query shapes every candidate must come from. | `docs/research/cube/data-apis.md`, `data-modeling.md`, `cloud-product-features.md`, `markings-query-support.md` |

---

## 3. Cross-product patterns

**Shared by most products, and missing in wechart**
1. **A KPI with a comparison and a trend.**
   - Spotfire's KPI chart has a comparative value, a sparkline and tiles per category [sf-kpi].
   - Power BI's KPI has a trend axis, a target and "High is good" [pbi-kpi].
   - Superset has Big Number with Trendline and Period-over-period [ss-bignum] [ss-trend].
   - Metabase's Trend has up to three comparisons [mb-trend]; Looker's Single Value shows Change and Progress [lk-single]; Sigma's KPI has comparison, trend and direction [sig-kpi]; Grafana's Stat has a background sparkline [gf-stat]; Looker Studio's scorecard has a sparkline [ls-score].
2. **Waterfall.** Spotfire [sf-wf], Power BI [pbi-wf], Superset [ss-wf], Metabase [mb-viz], Looker [lk-types], Sigma [sig-viz].
3. **Histogram.** Spotfire bins through the bar chart [sf-hist]; Tableau [tab-hist], Superset [ss-echarts], Metabase [mb-viz] and Grafana [gf-viz] have one; Vega-Lite has `bin` [vl-bin].
4. **Maps beyond one boundary set.** Spotfire's marker and feature layers [sf-map]; Tableau's symbol, filled, point and density maps [tab-maps]; Metabase's pin, grid and region maps with custom GeoJSON [mb-map]; Sigma's region, point and geography maps [sig-viz]; Grafana's markers, heatmap and GeoJSON layers [gf-geomap].
5. **Funnel.** Power BI [pbi-overview], Metabase [mb-viz], Looker [lk-funnel], Sigma [sig-viz], Superset [ss-echarts].
6. **Scatter with size (bubble).** Spotfire's Size by and Shape by [sf-scatter], Power BI [pbi-overview], Superset's Bubble [ss-echarts], Metabase [mb-viz].
7. **Sankey.** Metabase [mb-sankey], Sigma [sig-viz], Superset [ss-echarts]; Cube Cloud too ([cc-sankey], via `cloud-product-features.md`).

**What sets products apart**
- **Spotfire alone has a graphical table and a parallel coordinate plot** among the studied BI tools. Superset also has parallel coordinates [ss-plugins].
  - The graphical table holds sparklines, calculated values, icons and bullet graphs per row [sf-gt].
  - The parallel coordinate plot normalizes each column to 0–100 % [sf-pcp].
- **Timeline and Gantt** appear in Tableau [tab-gantt], Power BI (preview) [pbi-overview], Looker [lk-timeline] and Superset [ss-gantt]. Grafana's state timeline is the operational variant [gf-state].
- **Calendar heatmap, horizon and partition** appear only in Superset [ss-calendar] [ss-horizon] [ss-partition]. Sunburst appears in Metabase [mb-viz] and Superset [ss-echarts].
- **Gauges** appear in Power BI, Metabase, Sigma, Grafana and Superset [pbi-overview] [mb-viz] [sig-viz] [gf-viz] [ss-echarts]. Microsoft's own bullet chart presents itself as "a replacement for dashboard gauges and meters" [pbi-bullet].

---

## Direction: add the chart types that answer the questions Spotfire analysts already ask

**In one sentence:** add the chart types that answer the questions Spotfire analysts already ask of their analyses: performance against a target, contribution to a change, distribution, and multi-measure profiles. Draw each from Cube's grouped queries, make each markable at the granularity it draws, and give each a table view. Leave out types whose value is decorative.

### Reasoning
- **Roles.**
  - The Analyst/author is a Spotfire power user (requirements §2). They need the KPI chart, the graphical table, parallel coordinates, histograms and the scatter's size channel to rebuild `.dxp` files (M1) and to cover the parity checklist (M4).
  - The Business consumer needs KPI comparisons, waterfalls and bullets, the "how are we doing" charts every BI peer ships (§3, patterns 1–2).
- **ACs served or extended:** AC-037 (type list), AC-028/AC-031 (recommender and caps), AC-087/AC-093/AC-096/AC-102/AC-104 (markings), AC-178 (table view), AC-046 (formats).
- **References drawn on:**
  - Spotfire for the set itself and its marking semantics [sf-gt] [sf-kpi] [sf-pcp] [sf-wf];
  - Power BI and Looker for KPI semantics [pbi-kpi] [lk-single];
  - Tableau for bins as model fields [tab-hist];
  - Metabase and Grafana for map layers [mb-map] [gf-geomap];
  - Observable Plot and Vega-Lite for transforms [op-dodge] [vl-bin].

### What this direction rejects
- **Novelty types:** radar, chord, word cloud, liquid fill, 3D. See §6.
- **A gauge as the default single-value-against-target chart.** The bullet does the same job in less space [pbi-bullet]. The gauge is left as a user question (Q5), because five reference products ship one.
- **Any type that needs a second value axis to be recommended** (Pareto). AC-030 forbids it. Pareto is a combo preset after R80 instead.

---

## 4. Ranked recommendations

| # | Component | Question it answers | Tier | Main references | ECharts 6.1 | Depends on |
|---|---|---|---|---|---|---|
| 1 | **KPI chart**: comparison, target, sparkline, tile-by | Are we ahead or behind, and which way is it moving? | High | [sf-kpi] [pbi-kpi] [ss-bignum] [mb-trend] [lk-single] [sig-kpi] [gf-stat] | DOM, like today's KPI; the sparkline is R80's SVG | R80 sparkline and Change element |
| 2 | **Graphical table**: rows of sparklines, bars, bullets and icons | Which of many members needs attention, at a glance? | High | [sf-gt] [sf-spark-15] [sf-bullet-15] [pbi-overview] (data bars and icons) | DOM table with R80 SVG micro-charts; ECharts `matrix` is the alternative [ec-matrix] | R80 sparkline, icon and bullet elements |
| 3 | **Waterfall (bridge)** | What moved us from A to B? | High | [sf-wf] [pbi-wf] [ss-wf] [mb-viz] [lk-types] [sig-viz] | Native by composition: stacked bar with a transparent base [ec-wf] | — |
| 4 | **Histogram** | How are values distributed, and where are the outliers? | High | [sf-hist] [tab-hist] [ss-echarts] [mb-viz] [gf-viz] [vl-bin] | Native bar on a value axis | A bin source (Q2) |
| 5 | **Scatter: size and shape channels (bubble)** | How do three measures relate across members? | High | [sf-scatter] [pbi-overview] [ss-echarts] [mb-viz] | Native: `symbolSize` callback [ec-scatter] | — |
| 6 | **Geo layers**: admin-1 and custom regions, points, density | Where is it happening, below country level? | High | [sf-map] [tab-maps] [mb-map] [gf-geomap] [sig-viz] [lk-types] | Native: `map`, scatter on `geo`, heatmap on `geo` [ec-scatter] [ec-heatmap] | Boundary files; phase 3's "is geo-analytics in scope?" |
| 7 | **Parallel coordinates** | How do members' profiles across many measures compare, and which share one? | High | [sf-pcp] [ss-plugins] | Native `parallel` with axis brushing [ec-paxis] | — |
| 8 | **Bullet chart** (a chart type, one bullet per member) | How does each member compare with its target and bands? | High | [sf-bullet-15] [pbi-bullet] [ss-bullet] | Composition: bar plus a target mark plus band bars; or custom | R80 bullet element for the in-text variant |
| 9 | **100 % stacked bar and area** | How does the mix change across categories or time? | Medium | [sf-bar] [op-normalize] | No percent stack in ECharts [ec-stack]; wechart normalizes | — |
| 10 | **Sankey** | Where does volume flow between stages or categories? | Medium | [mb-sankey] [sig-viz] [ss-echarts] [cc-sankey] | Native, DAG only [ec-sankey] | — |
| 11 | **Distribution layers on the box plot**: all points (jitter or beeswarm), violin | What does the spread actually look like? | Medium | [sf-box] [op-dodge] [vl-tick] [vl-density] | Native jitter in 6.0 [ec-axis]; `@echarts-x/custom-violin` [ec-violin] | Existing AC-314/AC-315 data path |
| 12 | **Funnel** | Where do we lose people or deals between steps? | Medium | [pbi-overview] [mb-viz] [lk-funnel] [sig-viz] [ss-echarts] [cc-funnel] | Native `funnel` [ec-funnel]; bar form recommended | — |
| 13 | **Timeline / Gantt** | When did each thing run, for how long, and what overlapped? | Medium | [tab-gantt] [pbi-overview] [lk-timeline] [ss-gantt] [gf-state] | Custom series, or `@echarts-x/custom-bar-range` [ec-barrange] [ec-custom] | A start/end query shape (Q7) |
| 14 | **Calendar heatmap** | Which days and weekdays run hot or cold? | Medium | [ss-calendar] | Native `calendar` coordinate [ec-calendar] [ec-heatmap] | — |
| 15 | **Sunburst / icicle** | How does a total break down through a hierarchy? | Medium | [mb-viz] [ss-echarts] [ss-partition] | Sunburst native [ec-sunburst]; icicle needs a custom series | Cube hierarchies in `/v1/meta` |

**How the ranking was made.** Value was weighed on four things, never effort:
1. Spotfire parity for the 50 `.dxp` rebuilds (M1, M4).
2. Breadth across the reference products.
3. The business decision each component answers.
4. Fit with Cube's query shapes and with wechart's markings.

Items 1–8 meet at least three of these. Items 9–15 meet two.

---

## 5. Each recommendation, with a spec sketch

### 1. KPI chart: comparison, target, sparkline, tile-by

- **Question it answers:** "What am I ahead or behind on?" and "How far ahead or behind am I?" [pbi-kpi]. Is the trend helping or hurting? [sf-kpi]
- **References:**
  - Spotfire KPI chart: a primary value, a "comparative value", "a sparkline that shows the primary value over time", tiles per category, and colouring rules [sf-kpi].
  - Power BI KPI: Value, Trend axis, Target, "Direction > High is good", "Distance to goal" [pbi-kpi].
  - Superset: Big Number with Trendline and Period-over-period [ss-bignum] [ss-trend].
  - Metabase Trend: previous period, previous value, custom value, another column; colours can be inverted [mb-trend].
  - Looker Single Value: Show as Change, Calculate Progress, "Positive Values Are Bad" [lk-single].
  - Sigma KPI: Direction [sig-kpi].
  - Grafana Stat: background sparkline [gf-stat].
- **Fit with Cube: good.**
  - The comparison is `compareDateRange` (REST only; one time dimension; `queryType=multi`), or a `time_shift` multi-stage measure.
  - The sparkline is the same measure by the time dimension at a granularity.
  - The target is a second measure.
  - Tile-by is a dimension.
  - Sources: `data-apis.md` §2, "compareDateRange, end to end"; `spike-model-store-and-quick-calcs.md`.
  - Caveat: "A date range starting in February still takes January as February's previous month" (the spike), which is correct for a KPI.
- **Fit with ECharts:** not needed. KPI stays in the DOM, as `Kpi.tsx` argues. The sparkline is R80's SVG component (`rich-tiles-and-combo-tech.md` §3).
- **Markings and cross-filtering:**
  - Each tile is a member of the tile-by dimension. Click marks it (AC-087), and Ctrl or ⌘ toggles.
  - Limited by a marking, every tile recomputes (AC-107), as Spotfire's KPI does [sf-kpi].
  - Today's "Marked $X · p%" badge stays per tile.
  - A single KPI without tile-by marks nothing, as today.
- **Accessibility:**
  - Change is shown with ▲/▼, a sign and a word, never colour alone (AC-177).
  - The sparkline's text alternative names the first, last, high and low values (R80 rule 132).
  - Tiles are a list with roles, and each tile's accessible name is "‹member›: ‹value›, ‹change› vs ‹comparison›".
- **Tier: high.** Every studied product has it, and it is the consumer's most-read element.
- **Spec sketch:**
  - **Wells:** Metrics (1, the value); **Compare to** (one of: previous period, same period last year, another measure, a constant); **Target** (a measure or a constant, optional); Time (sparkline and period, optional); **Tile by** (a dimension, optional); **Direction** (Higher is better, Lower is better, Neutral).
  - **Recommender:** 1 measure + 1 time dimension, with no other dimension → KPI chart (with sparkline) is the top pick, and line is the runner-up. 1 measure + a dimension under the tile cap + a time dimension → KPI chart tiled is a runner-up only. The tile cap is proposed in Q4.
  - **Markings:** tile = member. Range marking doesn't apply.

### 2. Graphical table

- **Question it answers:** which of many members is off-track, and how is each trending, all on one screen? Spotfire calls it "a summarizing visualization designed to provide a lot of information at one glance" [sf-gt].
- **References:**
  - Spotfire: columns of sparklines, calculated values, icons and bullet graphs; items "respond instantly to filtering"; "Each column uses its own axis expression"; you can "mark rows in a graphical table" [sf-gt] [sf-spark-15] [sf-bullet-15].
  - Power BI: conditional formatting with "data bars, icons" in tables and matrices [pbi-overview].
- **Fit with Cube:** good. Two grouped queries per table:
  - a measures-by-dimension query for the calculated, bullet and icon columns;
  - a measures-by-dimension-by-time-granularity query for the sparkline columns, pivoted client-side (`data-apis.md`, PivotConfig).
  - The second query's row count is rows × periods, so it is bounded by the row cap (Q4) and the query limit, 10,000 by default and 50,000 at most (`data-apis.md` §2).
- **Fit with ECharts:** not needed.
  - A DOM table keeps rows selectable and readable by screen readers, the same reasoning as `Kpi.tsx` and AC-178.
  - ECharts 6's `matrix` coordinate system can lay "Mini charts… out in a table" [ec-matrix]. It is the alternative if R80's measurement of SVG sparklines at dashboard scale fails (`rich-tiles-and-combo-tech.md` line 265).
- **Markings:**
  - Row = member: click marks, Ctrl/⌘ toggles, and Shift+click selects a range, as in Spotfire tables (`references-markings.md`, corrections table).
  - Marked rows show the outline and the others fade (AC-096).
  - When limited by a marking, the whole table is limited (AC-107).
- **Accessibility:**
  - A real `<table>` with column headers.
  - Each micro-chart cell has a text alternative.
  - Icons pair a shape with a label (AC-177).
  - Bullet cells read "‹value› of ‹target›, ‹band›".
- **Tier: high.** It is a named Spotfire visualization, it underpins the text-area parity already accepted in R80, and it carries the most information per pixel of any candidate.
- **Spec sketch:**
  - **Wells:** Rows (one dimension; a second makes grouped sections, per Spotfire's "Hierarchical structures" [sf-gt]); **Columns**, an ordered list where each is one of Value, Sparkline (measure + time + period), Bullet (measure + target + bands), or Icon (measure + rules).
  - **Recommender:** never the top pick. It is a runner-up when there is 1 dimension with more members than the colour cap, ≥1 measure and a time dimension ("many members × trend → table of sparklines").
  - **Markings:** row = member. Column sorting doesn't change the marking.

### 3. Waterfall (bridge)

- **Question it answers:** "how an initial value… is affected by a series of positive and negative changes" [pbi-wf]; "factors' contributions to a total" [sf-wf].
- **References:**
  - Spotfire: a total bar by default, intermediate running totals, green and red by default, markable, limitable by markings [sf-wf].
  - Power BI: Category and **Breakdown**, with "Maximum breakdowns" keeping the top contributors and an "Other" [pbi-wf].
  - Superset [ss-wf], Metabase [mb-viz], Looker [lk-types] and Sigma [sig-viz] also have one.
- **Fit with Cube:** good.
  - Category form: dimension or time + measure, one grouped query.
  - Bridge form (Power BI's Breakdown between two periods): `compareDateRange` with the breakdown dimension gives each member's value in both periods, and wechart takes the differences.
  - The measure must be additive for running totals to mean anything. wechart already reads `aggType` (`isAdditive` in `Kpi.tsx`), and non-additive measures are refused with the reason.
- **Fit with ECharts:** native by composition. A transparent stacked placeholder bar plus the visible bar (`bar-waterfall`) [ec-wf]. Totals are ordinary bars.
- **Markings:**
  - Step = member (click marks).
  - Total and subtotal bars are derived. Clicking one marks every member it sums, as "Mark all" does (AC-115).
  - Marked share (AC-104) is drawn as an overlay on each step.
- **Accessibility:**
  - Increase and decrease use a glyph (▲/▼) in labels and the table view as well as colour, because R80's change colours are `status-*` uses, not series colours.
  - The table view adds a running-total column.
- **Tier: high.** All six peers ship it, and it is the standard finance bridge.
- **Spec sketch:**
  - **Wells:** Metrics (1); Dimensions or Time (the steps); **Compare periods** (optional, the bridge form); **Breakdown max** (the Other fold, reusing AC-041).
  - **Recommender:** runner-up only. It is offered when 1 measure has both signs across ≤ the colour cap of members, or when Compare periods is set. Intent (deviation) can't be read from the signature alone (product-direction §3, "deviation → bullet").
  - **Markings:** step = member; total = all its members.

### 4. Histogram

- **Question it answers:** how are values distributed; is the shape skewed or bimodal; where do outliers sit? The product-direction recommender table's first row is "1 Q → histogram" (`docs/inputs/2026-09-19-product-direction.md` §3).
- **References:**
  - Spotfire bins a numeric column on the bar chart's Category axis, and the bins can be changed "by dragging the slider" [sf-hist].
  - In Tableau a "Quantity (bin) dimension" replaces the measure and the count becomes CNT; bins are edited "in the Data pane" [tab-hist].
  - Superset [ss-echarts], Metabase [mb-viz] and Grafana [gf-viz] have one; Vega-Lite has `bin`/`maxbins` [vl-bin].
- **Fit with Cube:** partial. `/v1/load` has no bin operator (the query keys are listed in `data-apis.md` §2). There are two sources:
  - (a) **A bin dimension in the model**, like Tableau's bin field [tab-hist]. The model editor generates a `number` dimension whose SQL floors the value to a width. Counts are exact and come from the warehouse, and a bin is a range filter on the source dimension.
  - (b) **Client binning of per-entity values**, the box plot's AC-314/AC-315 path, with "computed from n of N rows".
  - Which source to use is Q2.
- **Fit with ECharts:** native bars on a value x-axis (bars touching).
- **Markings:**
  - Bin = range. With (a) it is a dimension range predicate, so AC-093's range marking applies directly.
  - With (b) a bin is a set of entity IDs, capped at 1,000 (AC-102), with the same "computed from" warning.
- **Accessibility:** the table view lists bin ranges and counts. Bin edges are spoken as "from ‹a› to under ‹b›".
- **Tier: high.** Distribution is a core analyst task and five references have one; wechart can show a distribution only as a box plot today.
- **Spec sketch:**
  - **Wells:** Value (a numeric dimension, or a measure with "Each point is"); **Bins** (count or width; a slider as in Spotfire [sf-hist]); Metrics (default Count); Colour (optional, stacked).
  - **Recommender:** 1 numeric dimension alone, or 1 measure with "Each point is" set → histogram is the top pick and the box plot is the runner-up.
  - **Markings:** bin = range.

### 5. Scatter: size and shape channels (bubble)

- **Question it answers:** do the big members also have high margins? It is the three-measure relationship that Spotfire's scatter is used for daily.
- **References:**
  - Spotfire: Size by, Color by, Shape by, and "Marker by… aggregate the data into fewer markers" [sf-scatter].
  - Power BI: "Bubble charts add a third dimension through bubble size" [pbi-overview].
  - Superset has Bubble [ss-echarts]; Metabase has Scatterplots/Bubble [mb-viz].
- **Fit with Cube:** good. A third measure in the same grouped query.
- **Fit with ECharts:** native. `symbolSize` takes a callback [ec-scatter]. The size scale must map value to area, not radius; wechart computes it.
- **Markings:** unchanged from today's scatter. Point = member; rectangle and lasso brushing are supported for scatter [ec-brush].
- **Accessibility:**
  - The legend states the size scale with two or three reference circles and their formatted values.
  - Shape gives a non-colour second channel, which also serves AC-177's spirit. ECharts `aria.decal` is available [ec-aria].
- **Tier: high.** It is a direct Spotfire-parity gap in an existing type.
- **Spec sketch:**
  - **Wells:** X, Y, **Size** (a measure), Colour (a dimension), **Shape** (a dimension), Detail (the marker-by dimension).
  - **Recommender:** 3 measures + 1 dimension → bubble is the top pick and parallel coordinates the runner-up. Shape counts against a shape cap; the product-direction input says "shape past ~6" dies, and the cap is Q4.
  - **Markings:** point = member.

### 6. Geo layers: admin-1 and custom regions, points, density

- **Question it answers:** which states, regions or sites drive the number, and where are the clusters?
- **References:**
  - Spotfire: marker layers by coordinates or "zip codes and cities"; feature layers of polygons; custom geocoding with shapefiles or GeoJSON; feature and marker layers support marking [sf-map].
  - Tableau: proportional symbol, choropleth, point distribution, density, flow and spider maps [tab-maps].
  - Metabase: pin, grid and region maps, with "custom GeoJSON maps in Admin" [mb-map].
  - Grafana: markers, heatmap and GeoJSON layers [gf-geomap].
  - Sigma: region, point, and geography (WKT/GeoJSON) maps [sig-viz].
  - Looker: static region and point maps [lk-types].
- **Fit with Cube:** good.
  - Cube has a `geo` dimension type with `latitude`/`longitude` (`data-modeling.md` line 291–293), and `/v1/meta` reports `geo` (line 447).
  - **To verify:** the shape of a geo value in a `/v1/load` row, and the client types, since "`TCubeMemberType` lacks `geo`" (line 1144).
  - Regions join a key dimension to a boundary file, as today's ISO-3 path does (AC-313).
- **Fit with ECharts:** native.
  - Regions use the `map` series, as built (`series/map.ts`).
  - Points use scatter with `coordinateSystem: 'geo'` [ec-scatter].
  - Density uses heatmap on `geo` with `pointSize`/`blurSize` [ec-heatmap].
  - Brush supports `geoIndex` [ec-brush].
  - There is no tile basemap, because requirements §5 rules out a tile server (as AC-305 records). Points sit on vector boundaries.
- **Markings:**
  - Region = member; point = member or row.
  - Lasso or rectangle on the map marks the points inside [ec-brush].
  - The density layer is not markable; Spotfire's reference layers aren't either [sf-map].
- **Accessibility:**
  - The table view is the primary accessible path.
  - Unplaced keys stay named (AC-305).
  - Point size gets a legend as in item 5.
- **Tier: high.** Every studied product has more than country fills, but the scope sits under phase 3's open question "is geo-analytics in scope?" (input file). See Q6.
- **Spec sketch:**
  - **Wells:** Location (an ISO-3 or region-key dimension, or a geo dimension); Metrics (colour or size); **Layer** (Regions, Points, Density); **Boundary set** (countries, admin-1, or custom GeoJSON uploaded by the semantic-layer engineer).
  - **Recommender:** a geo dimension + 1 measure → point map is the top pick. A region key + 1 measure → region map, extending AC-305's rule.
  - **Markings:** region or point = member.

### 7. Parallel coordinates

- **Question it answers:** which members share a profile across five or more measures, and how does a group differ from the rest? This is batch, wafer and customer-segment analysis.
- **References:**
  - Spotfire: every column is normalized so "the lowest value… is always set to 0%, and the highest value is set to 100%"; it has "Line by" and "Color by"; and it warns "do not compare the height of the line in one column to the height of the line in another" [sf-pcp].
  - Superset ships a parallel-coordinates plugin [ss-plugins].
  - wechart's own prototype recommender already names it (`docs/design/prototype/reco.js:57, 213`), and the input says "≥3 Q → SPLOM or parallel coordinates".
- **Fit with Cube:** good. One grouped query: the Line-by dimension × ≥3 measures (+ a colour dimension).
- **Fit with ECharts:** native `parallel` series with `parallelAxis`. "Area selecting is available on axes", with `realtime` for large data [ec-paxis]. The `parallel` series "contains brush function by itself" [ec-brush].
- **Markings:**
  - Line = member.
  - Brushing a range on one or more axes marks the members whose lines pass through every brushed range. The marking stores the member list (≤1,000, AC-102), not a measure range: a measure range would be a measure filter, which Cube forbids in ungrouped queries (`markings-query-support.md` line 397) and which isn't a dimension predicate.
  - Other tiles' markings fade unmarked lines (AC-096).
- **Accessibility:**
  - Hard to make accessible, which is why the table view is essential (AC-178).
  - Each axis has a keyboard-reachable range input as the brush's equivalent. It needs the user's OK under AC-176 (Q8).
  - The Spotfire scale warning appears as visible text under the chart.
- **Tier: high, for this user base.** It is a Spotfire-native analyst tool with no substitute in wechart. It is used mostly by analysts, rarely by consumers.
- **Spec sketch:**
  - **Wells:** Line by (1 dimension); Metrics (3 or more, one axis each, ordered); Colour (a dimension, optional); **Scale** (per-axis min–max, Spotfire's default [sf-pcp]).
  - **Recommender:** ≥3 measures + 1 dimension → parallel coordinates is the top pick when members exceed the colour cap, and otherwise a runner-up. A line cap is proposed in Q4.
  - **Markings:** line = member; axis brushing marks.

### 8. Bullet chart (a chart type)

- **Question it answers:** for each region or product, where is the actual against the target and the qualitative bands?
- **References:**
  - Spotfire: a bar, a comparative vertical line, background ranges, Min/Max, "Include origin"; in graphical tables and text areas, and supporting "markings, filtering, and expressions" [sf-bullet-15].
  - Microsoft's bullet chart: value, target, ranges from "needs improvement" to "very good"; "a replacement for dashboard gauges and meters" [pbi-bullet].
  - Superset's Bullet Chart: "progress of a single metric against a given target" [ss-bullet].
- **Fit with Cube:** good. Measure + target measure (+ band measures or constants) by a dimension, in one grouped query.
- **Fit with ECharts:** composition. Band bars overlaid with `barGap: '-100%'` (wechart already uses that overlay, `crossfilter/highlight.ts:169`), the value bar narrower on top, and the target as a short mark (a custom series or `markPoint`). Not a native series.
- **Markings:** bullet = member. The marked share is shown as in AC-104, on the value bar.
- **Accessibility:**
  - Bands use lightness steps of one neutral hue, not hue, so the bands read in greyscale.
  - Each bullet reads "‹member›: ‹value› of ‹target› (‹p›%), ‹band›".
- **Tier: high.** It is the honest form of the target comparison that peers sell as gauges, it shares its element with R80's in-text bullet, and Spotfire has it.
- **Spec sketch:**
  - **Wells:** Metrics (value); **Target** (a measure or constant); **Bands** (2–4 thresholds, as measures or constants); Dimensions (1, one bullet per member).
  - **Recommender:** shown only when a Target is set. Then it is the top pick for 1 dimension; with no dimension, a KPI with target is the top pick and a single bullet the runner-up.
  - **Markings:** bullet = member.

### 9. 100 % stacked bar and area

- **Question it answers:** is the mix shifting, even while the total moves?
- **References:** Spotfire's "100% Stacked Bars" — "Each bar height is 100%" [sf-bar]; Observable Plot's normalize transform [op-normalize].
- **Fit with Cube:** good. The same grouped rows as stacked. Shares are computed client-side for additive measures only (`aggType`), because a share of an average is meaningless (the `Kpi.tsx` reasoning).
  - **Caveat:** AC-041's "Other" fold and row limit must apply before normalizing, or the shares are wrong.
- **Fit with ECharts:** there is no percent stacking; `stack`, `stackStrategy` and `stackOrder` only sum [ec-stack]. wechart normalizes the data and formats the axis as percent.
- **Markings:** as stacked bars. The marked share is a fraction of the segment.
- **Accessibility:** the table view shows both the value and the share. Tooltips give both.
- **Tier: medium.** It is a variant of existing types, not a new reading task, but it is a common Spotfire layout.
- **Spec sketch:**
  - **Customize:** "Stack: Sum | 100 %" on stacked bar and stacked area.
  - **Recommender:** never the top pick. It is a runner-up when the stacked members are ≤ the colour cap and the measure is additive.
  - **Markings:** unchanged.

### 10. Sankey

- **Question it answers:** how does volume move from source to destination, or through stages?
- **References:**
  - Metabase: source, target and count columns; cycles are refused; edge colour by source or target [mb-sankey].
  - Sigma [sig-viz] and Superset [ss-echarts] have one.
  - Cube Cloud: cycles split nodes as `A (2)`, flows capped at 50, "Other" grouping (`cloud-product-features.md` line 261, [cc-sankey]).
- **Fit with Cube:** good. Two or more ordered dimensions + 1 additive measure in one grouped query; a link per adjacent pair.
- **Fit with ECharts:** native, but "only supports Directed Acyclic Graph(DAG)" [ec-sankey]. wechart must break cycles itself; Cube Cloud's node-splitting is the precedent.
- **Markings:**
  - A node marks its member.
  - A link marks the (source, target) tuple, a two-dimension predicate that AC-087 can express.
  - Marking from other tiles fades unmarked links. ECharts draws one width per link, so the marked share is given in the tooltip rather than drawn. This is a stated limitation.
- **Accessibility:** the table view lists each flow as "‹source› → ‹target›: ‹value›".
- **Tier: medium.** Three peers and Cube Cloud have it, but it is a specialist reading and isn't a Spotfire native.
- **Spec sketch:**
  - **Wells:** Steps (2–4 dimensions, in order); Metrics (1).
  - **Recommender:** runner-up only, for 2 dimensions + 1 additive measure whose member pairs are within the flow cap (Q4).
  - **Markings:** a node or link is marked by its predicate.

### 11. Distribution layers on the box plot: points and violin

- **Question it answers:** what is behind the box? Bimodality and clusters that quartiles hide.
- **References:**
  - Spotfire's box plot adds a violin "kernel density estimate layer" and can "show markers for all data points" [sf-box].
  - Observable Plot's dodge (beeswarm) "preserves the visual identity of individual data points" [op-dodge].
  - Vega-Lite's tick strip plot [vl-tick] and density transform for violins [vl-density].
- **Fit with Cube:** already solved. The box plot's per-entity rows (AC-314) and "computed from n of N" (AC-315).
- **Fit with ECharts:**
  - Points: `jitter` with `jitterOverlap: false` gives a beeswarm (6.0) [ec-axis].
  - Violin: `@echarts-x/custom-violin`, Apache-2.0, which computes its own KDE (`binCount`, `bandWidthScale`) [ec-violin] [ec-custom].
  - A `docs/research/` doc must cover the package before import (the CLAUDE.md gate).
- **Markings:** a point = the entity ("Each point is"), marked by ID (≤1,000); a box = the category member, as today.
- **Accessibility:**
  - Jitter is random, so wechart should fix the seed so that redraws and screenshots match (ECharts' seed control: not published).
  - Beeswarm (no overlap) is preferred over jitter.
- **Tier: medium.** It deepens an existing type to Spotfire parity.
- **Spec sketch:**
  - **Customize › Distribution:** Points (None, Outliers, All, Beeswarm) and Violin (on/off).
  - **Recommender:** no change.
  - **Markings:** a point = the entity.
  - **Phase-3 note:** Spotfire's comparison circles and confidence intervals [sf-box] belong to phase 3 statistics.

### 12. Funnel

- **Question it answers:** at which step do we lose the most?
- **References:**
  - Looker: largest-value or previous-bar percent; rows or a single row of measures [lk-funnel].
  - Metabase: "percent decrease between each step" [mb-viz].
  - Power BI: "sales pipelines and conversion tracking" [pbi-overview].
  - Sigma [sig-viz] and Superset [ss-echarts] have one.
  - Cube Cloud: connector % "First" and "Prev" (`cloud-product-features.md` line 260).
- **Fit with Cube:**
  - Two shapes: a stage dimension + measure, or N measures as stages (Looker's horizontal orientation [lk-funnel]).
  - Ordered conversion funnels (the same user through steps) need model work. `pre-aggregations.md` line 191 notes funnels as a case for `original_sql`. wechart only draws what the model returns.
- **Fit with ECharts:**
  - The `funnel` series is native, but its widths map value to a `min`/`max` range and its `percent` is relative to that range [ec-funnel], not to the previous step.
  - Recommendation: draw a funnel as **sorted horizontal bars with step-conversion labels** (Looker's "Previous bar" [lk-funnel]), which keeps a common baseline. The trapezoid shape is an option.
- **Markings:** stage-as-member → marks the member. Stage-as-measure → not markable, like a KPI; the tile states it.
- **Accessibility:** step conversion is text in labels and in the table view.
- **Tier: medium.** It is broad in peers but answers one business process, and it isn't a Spotfire native.
- **Spec sketch:**
  - **Wells:** Stages (a dimension, or ≥2 measures in order); Metrics (1 when Stages is a dimension); **Percent of** (First or Previous).
  - **Recommender:** runner-up only, when ≥3 measures share a format and no dimension is set ("measures in order → funnel").
  - **Markings:** as above.

### 13. Timeline / Gantt

- **Question it answers:** what ran when, for how long, and what overlapped (orders, shipments, batches, projects)?
- **References:**
  - Tableau: a date on Columns, `DATEDIFF` on Size, the Gantt Bar mark [tab-gantt].
  - Looker Timeline: label, start, end, optional magnitude [lk-timeline].
  - Power BI Gantt (preview) [pbi-overview]; Superset Gantt Chart [ss-gantt].
  - Grafana's state timeline for state changes over time [gf-state].
- **Fit with Cube:** to verify.
  - (a) Ungrouped rows with raw start and end time dimensions (`ungrouped`, `data-apis.md` §2).
  - (b) `min`/`max` measures over time columns per task. Whether Cube returns those as timestamps is not verified here.
  - Q7 asks which shape to support.
- **Fit with ECharts:** custom series (`renderItem` rectangles on a time axis) [ec-custom], or `@echarts-x/custom-bar-range` with `[category, lower, upper]` data [ec-barrange]. Its time-axis support is not stated in its README.
- **Markings:**
  - Bar = task member or row ID.
  - A range marking along the time axis (AC-093) marks the tasks that overlap the range. That is an overlap predicate (start < b AND end > a), which Cube filters can express.
- **Accessibility:** the table view lists start, end and duration; durations are spoken in words.
- **Tier: medium.** Four peers have it; operational dashboards use it; it isn't a Spotfire native.
- **Spec sketch:**
  - **Wells:** Rows (a dimension); **Start**; **End** (or Duration); Colour (a dimension or measure).
  - **Recommender:** runner-up only, when two time members are present per row.
  - **Markings:** bar = member; time range = overlap.

### 14. Calendar heatmap

- **Question it answers:** which days, weekdays or seasons run hot? Daily operational patterns.
- **References:** Superset's Calendar Heatmap: "Gray values are used to indicate missing values" [ss-calendar].
- **Fit with Cube:** good. A time dimension at `day` granularity + 1 measure.
- **Fit with ECharts:** native `calendar` coordinate (`range`, `orient`, `cellSize`, `dayLabel.firstDay`) with the heatmap series [ec-calendar] [ec-heatmap].
- **Markings:**
  - Cell = day.
  - A drag marks a contiguous date range (AC-093 semantics on time).
  - Ctrl/⌘ toggles single days.
- **Accessibility:**
  - Sequential ramp plus a "No data" swatch, as the map has (rule 86).
  - Cells are focusable only with the user's OK (AC-176).
  - The table view is by date.
- **Tier: medium.** It is narrow but distinctive, and the common data-quality and ops check.
- **Spec sketch:**
  - **Wells:** Time (day granularity); Metrics (1).
  - **Recommender:** 1 time dimension at day granularity spanning more than a proposed number of days + 1 measure → runner-up to line. It needs its own cell cap, since one year exceeds the 200-cell heatmap cap (AC-031); see Q4.
  - **Markings:** cell = day; drag = range.

### 15. Sunburst / icicle

- **Question it answers:** how does a total break down through region → country → city?
- **References:**
  - Metabase: "a pie chart with more than one ring" [mb-viz].
  - Superset: Sunburst [ss-echarts] and Partition Chart ("Part of a Whole") [ss-partition].
- **Fit with Cube:**
  - Ordered dimensions, or a Cube hierarchy (hierarchies are in `/v1/meta`; `data-modeling.md` line 1138).
  - **Key point:** parent values may only be summed from children for additive measures. Otherwise each level is its own query (one per level), and Cube aggregates correctly at each level.
- **Fit with ECharts:** `sunburst` is native, with `nodeClick: 'rootToNode'` and emphasis on ancestors and descendants [ec-sunburst]. An icicle needs a custom series [ec-custom].
- **Markings:**
  - A node is a path prefix, e.g. (region = EMEA, country = DE): a multi-dimension predicate.
  - Marking an inner node marks its descendants.
  - Drill-into-node is navigation, not marking, and the two must not share the click. Proposal: click marks, and double-click or Enter zooms, as AC-236's Drill by keeps them apart.
- **Accessibility:**
  - Angles are hard to compare, so the icicle is the default form and sunburst an option (Q9).
  - The table view is indented by level.
- **Tier: medium.** Hierarchy is first-class in Cube, but treemap already covers a part-of-whole with many parts.
- **Spec sketch:**
  - **Wells:** Levels (2–4 dimensions, or a hierarchy); Metrics (1).
  - **Recommender:** runner-up to treemap for ≥2 dimensions + 1 measure when the members per level are within the cap.
  - **Markings:** node = path predicate.

---

## 6. Don't build, and why

| Candidate | Why not | Sources |
|---|---|---|
| **Pareto as a chart type** | It needs a cumulative-% line on a second axis, and AC-030 forbids recommending two axes. Build it as a **combo preset** once R80's per-series axes ship, with running % of total from F6 quick calculations (Cube `rolling_window` or multi-stage). Tableau itself builds it from a dual axis and table calcs. | [tab-pareto]; `spike-model-store-and-quick-calcs.md` |
| **Control charts (SPC)** | A line plus computed control limits and rule violations: these are statistics, so wait for phase 3 stage A. Reference lines and bands from R80 will draw the limits. | phase-3 input; R80 |
| **Summary table** | Per-column mean, median and so on [sf-sum]. Medians need per-row data or percentile measures, so it belongs with phase 3 statistics. Revisit then. | [sf-sum] |
| **Heat map dendrograms** | They depend on phase-3 clustering [sf-hm]. | [sf-hm] |
| **3D scatter** | Spotfire itself: "only supported in the installed client… in a web client… will not be shown". wechart is web-only. | [sf-3d] |
| **Gauge** (as a default) | It takes much space for one number. The bullet does the same job [pbi-bullet]. Five peers ship it, so the user decides (Q5). If built: native `series-gauge` with colour bands [ec-gauge]; its docs list no accessibility features. | [ec-gauge] [pbi-bullet] |
| **Radar** | Native in ECharts [ec-series] and in Superset [ss-echarts]. Area distortion and axis order change the reading; parallel coordinates answers "compare profiles" with a table-like reading and Spotfire parity. | [ec-series] [ss-echarts] [sf-pcp] |
| **Chord** | New in ECharts 6 [ec-chord] and in Superset [ss-plugins]. It answers the same flow question as Sankey, less readably, and arc links have no clean marking granularity. | [ec-chord] |
| **Network graph** | ECharts `graph` warns that force layout with ">100" nodes can hang the browser [ec-graph]. Cube models are fact/dimension shaped, not node/edge. | [ec-graph] |
| **Marimekko, word cloud, liquid fill, pictorial bar, theme river, horizon** | Decorative or low-precision readings. Word cloud appears in Looker and Superset [lk-types] [ss-plugins]; liquid fill and word cloud are ECharts custom series [ec-custom]; horizon is Superset-only [ss-horizon]. None is in Spotfire's core set. | as cited |
| **Slope chart, lollipop, dot plot as separate types** | These are encodings of existing types. Slope = a line with two periods, with direct end labels; lollipop and dot plot = a bar variant ("Mark: Bar or Dot" in Customize). Power BI groups dot plots under scatter [pbi-overview]. Add them as Customize options, not gallery types. | [pbi-overview] |
| **Bump / ribbon chart** | Power BI's ribbon shows rank over time [pbi-overview]. It needs rank (Cube multi-stage `rank`, `spike…md`), so it is a line chart of a rank quick calculation once F6 ships, not a new renderer. | [pbi-overview] |
| **Index chart (normalize to first)** | Already open as R80's N1 ("Index to 100"); not duplicated here. | [op-normalize]; R80 doc |
| **Decomposition tree** | Power BI's AI-assisted drill [pbi-overview]. wechart's Drill by (AC-236) plus an icicle cover the manual path, and its AI ordering overlaps the parked copilot. | [pbi-overview] |
| **Candlestick, state timeline as separate types** | Candlestick is financial-specific [gf-viz]. State timeline is a Gantt with categorical colour (item 13). | [gf-viz] [gf-state] |
| **Small-multiple sparklines as their own type** | Covered by the graphical table (item 2) and by small multiples (AC-045). | [sf-gt] |

---

## Tokens to derive

No new type sizes or weights are needed. Where a component needs a new data-viz role, it reuses direction.md §5.

| Use | Value | Provenance |
|---|---|---|
| Categorical series | The existing 8 slots | direction.md §5; AC-031 |
| Map, calendar and histogram density colour | The sequential single-blue ramp `#cde2fb … #0d366b`, with the null neutral and a "No data" swatch | direction.md §5 lines 241, 487; rule 86 |
| Waterfall up/down, KPI change | `status-success` / `status-error` plus ▲/▼ and a sign; `text-secondary` for Neutral | R80 doc, tokens table (status uses, not series colours) |
| Waterfall and difference fills (alternative) | The diverging blue ↔ red with a grey midpoint | direction.md §5 line 242 |
| Bullet bands | Lightness steps of one neutral hue; how many steps: **not published** by Spotfire or Microsoft; proposed 2–4 (Q4) | [sf-bullet-15] [pbi-bullet] |
| Sparkline in a graphical table or KPI | R80's 16 × 64 px, 2 px line | R80 doc tokens (wechart's own decision) |
| Bubble size | Area-proportional; minimum and maximum diameter: **not published** by any reference | — |

---

## 7. Open questions for the user (recommended answer first)

**Q1. Which Spotfire visualization types do the 50 most-used `.dxp` files use (M1)?**
- **(a) Inventory them before ranking is final (recommended).** Count the visualization types and their settings, such as Size by and 100 % stacked, from the `.dxp` files. That count is the best evidence for this ranking.
- (b) Accept the ranking in §4 as is.

**Q2. Where do histogram bins come from?**
- **(a) Both (recommended):** a bin dimension generated in the model editor for numeric dimensions (exact, warehouse-side, markable as a range, like Tableau's bin field [tab-hist]), and client binning of per-entity values for measures (AC-314/315's path, with "computed from n of N").
- (b) Model bins only.
- (c) Client binning only.

**Q3. Is a KPI with a comparison its own chart type, or an upgrade of today's KPI?**
- **(a) Upgrade KPI in place (recommended).** Add the Compare to, Target, Time and Tile by wells; an existing KPI with none set renders exactly as today.
- (b) A new "KPI chart" type beside KPI.

**Q4. The new caps** (none are published by the references, so each is a product decision):
- **(a) Recommended starting points:**
  - KPI tiles ≤ 20 (the trellis panel cap);
  - graphical table rows ≤ 50 before paging;
  - parallel-coordinate lines ≤ 1,000 (the marking cap, AC-102);
  - Sankey flows ≤ 50 (Cube Cloud's cap, `cloud-product-features.md` line 261);
  - calendar ≤ 366 days per panel;
  - scatter shapes ≤ 6 (the input's "shape past ~6");
  - bullet bands 2–4.
- (b) Different values, given by the user.

**Q5. Gauges?**
- **(a) Don't build; offer the bullet and the KPI with target (recommended).** [pbi-bullet]
- (b) Build a gauge, never recommended, with a warning that names the bullet.
- (c) Build and recommend it like any type.

**Q6. Geo scope (overlaps phase 3's "is geo-analytics in scope?").**
- **(a) Now: admin-1 boundaries, custom GeoJSON uploaded by the semantic-layer engineer, a point layer from Cube `geo` dimensions, and a density layer; no tile basemap (recommended).**
- (b) Admin-1 only.
- (c) Defer all geo to phase 3.

**Q7. Gantt data shape.**
- **(a) Support both an ungrouped row per task (raw start and end) and grouped min/max per task, after a research check that Cube returns min/max of time columns as timestamps (recommended).**
- (b) Ungrouped only.

**Q8. Keyboard reach for the new types (AC-176 needs your OK).**
- **(a) Yes, for item marking on every new type, through the same roving focus as existing charts, and range inputs for parallel-coordinate brushing (recommended).**
- (b) The table view only (AC-178).

**Q9. Hierarchy form.**
- **(a) Icicle by default, sunburst as an option (recommended):** lengths read better than angles.
- (b) Sunburst only, as Metabase and Superset ship it [mb-viz] [ss-echarts].

**Q10. New packages.** Violin (`@echarts-x/custom-violin`) and bar-range (`@echarts-x/custom-bar-range`) are Apache-2.0 [ec-custom].
- **(a) Research each before import, and draw with wechart's own custom series if a package is unmaintained (recommended).**
- (b) Own custom series only.

---

## Sources

**Spotfire 15.0**
[sf-gt]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/graphical_table.html
[sf-wf]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/waterfall_chart.html
[sf-kpi]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/kpi_chart.html
[sf-pcp]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/parallel_coordinate_plot.html
[sf-sum]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/summary_table.html
[sf-map]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/map_chart.html
[sf-3d]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/3d_scatter_plot.html
[sf-scatter]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/scatter_plot.html
[sf-hm]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/heat_map.html
[sf-bar]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/bar_chart.html
[sf-box]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/box_plot.html
[sf-hist]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/creating_a_histogram.html
[sf-bullet-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/bullet_graphs.html
[sf-spark-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/sparklines.html

**Tableau**
[tab-showme]: https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm
[tab-hist]: https://help.tableau.com/current/pro/desktop/en-us/buildexamples_histogram.htm
[tab-gantt]: https://help.tableau.com/current/pro/desktop/en-us/buildexamples_gantt.htm
[tab-pareto]: https://help.tableau.com/current/pro/desktop/en-us/pareto.htm
[tab-maps]: https://help.tableau.com/current/pro/desktop/en-us/maps_build.htm

**Power BI**
[pbi-overview]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview
[pbi-wf]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-waterfall-charts
[pbi-kpi]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-kpi
[pbi-bullet]: https://github.com/microsoft/PowerBI-visuals-BulletChart
[pbi-repos]: https://github.com/orgs/microsoft/repositories?q=PowerBI-visuals&type=all

**Superset**
[ss-echarts]: https://github.com/apache/superset/tree/master/superset-frontend/plugins/plugin-chart-echarts/src
[ss-plugins]: https://github.com/apache/superset/tree/master/superset-frontend/plugins
[ss-bignum]: https://github.com/apache/superset/tree/master/superset-frontend/plugins/plugin-chart-echarts/src/BigNumber
[ss-trend]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberWithTrendline/index.ts
[ss-bullet]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/Bullet/index.ts
[ss-wf]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/Waterfall/index.ts
[ss-gantt]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/Gantt/index.ts
[ss-partition]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-partition/src/index.ts
[ss-calendar]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-calendar/src/index.ts
[ss-horizon]: https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-horizon/src/index.ts

**Metabase**
[mb-viz]: https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results
[mb-trend]: https://www.metabase.com/docs/latest/questions/visualizations/trend
[mb-map]: https://www.metabase.com/docs/latest/questions/visualizations/map
[mb-sankey]: https://www.metabase.com/docs/latest/questions/visualizations/sankey

**Looker and Looker Studio**
[lk-types]: https://docs.cloud.google.com/looker/docs/visualization-types
[lk-single]: https://docs.cloud.google.com/looker/docs/single-value-options
[lk-timeline]: https://docs.cloud.google.com/looker/docs/timeline-options
[lk-funnel]: https://docs.cloud.google.com/looker/docs/funnel-options
[ls-score]: https://docs.cloud.google.com/looker/docs/studio/scorecard-reference

**Sigma**
[sig-viz]: https://help.sigmacomputing.com/docs/intro-to-visualizations
[sig-kpi]: https://help.sigmacomputing.com/docs/build-a-kpi-chart

**Grafana**
[gf-viz]: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/
[gf-state]: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/state-timeline/
[gf-stat]: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
[gf-geomap]: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/geomap/

**Observable Plot and Vega-Lite**
[op-dodge]: https://raw.githubusercontent.com/observablehq/plot/main/docs/transforms/dodge.md
[op-normalize]: https://raw.githubusercontent.com/observablehq/plot/main/docs/transforms/normalize.md
[op-difference]: https://raw.githubusercontent.com/observablehq/plot/main/docs/marks/difference.md
[vl-bin]: https://raw.githubusercontent.com/vega/vega-lite/main/site/docs/transform/bin.md
[vl-tick]: https://raw.githubusercontent.com/vega/vega-lite/main/site/docs/mark/tick.md
[vl-density]: https://raw.githubusercontent.com/vega/vega-lite/main/site/docs/transform/density.md

**ECharts**
[ec-v6]: https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/
[ec-series]: https://github.com/apache/echarts-doc/tree/master/en/option/series
[ec-comp]: https://github.com/apache/echarts-doc/tree/master/en/option/component
[ec-custom]: https://github.com/apache/echarts-custom-series
[ec-matrix]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/matrix.md
[ec-axis]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/axis-common.md
[ec-sankey]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/sankey.md
[ec-chord]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/chord.md
[ec-paxis]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/parallel-axis.md
[ec-calendar]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/calendar.md
[ec-sunburst]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/sunburst.md
[ec-heatmap]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/heatmap.md
[ec-funnel]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/funnel.md
[ec-gauge]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/gauge.md
[ec-graph]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/graph.md
[ec-scatter]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/scatter.md
[ec-stack]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/partial/stack.md
[ec-brush]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/brush.md
[ec-aria]: https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/aria.md
[ec-wf]: https://raw.githubusercontent.com/apache/echarts-examples/gh-pages/public/examples/ts/bar-waterfall.ts
[ec-barrange]: https://github.com/apache/echarts-custom-series/tree/main/custom-series/barRange
[ec-violin]: https://github.com/apache/echarts-custom-series/tree/main/custom-series/violin

**Cube Cloud chart docs** (as cited in `docs/research/cube/cloud-product-features.md`)
[cc-sankey]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/sankey.mdx
[cc-funnel]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/funnel.mdx

**wechart files read**
- `/Users/srajagopal/Work/wechart/packages/web/src/editor/chartTypeCatalog.ts`
- `/Users/srajagopal/Work/wechart/packages/core/src/chart-type-names.ts`
- `/Users/srajagopal/Work/wechart/packages/charts/src/series/` (directory listing; `scatter.ts`, `map.ts`)
- `/Users/srajagopal/Work/wechart/packages/recommender/src/requirements.ts`
- `/Users/srajagopal/Work/wechart/packages/web/src/tiles/Kpi.tsx`
- `/Users/srajagopal/Work/wechart/docs/spec.md` (AC-028–AC-046, F10 markings, AC-176–AC-178, F35)
- `/Users/srajagopal/Work/wechart/docs/design/superset-parity.md`
- `/Users/srajagopal/Work/wechart/docs/design/references-combo-and-rich-tiles.md`
- `/Users/srajagopal/Work/wechart/docs/design/references-spotfire-combo-textarea.md`
- `/Users/srajagopal/Work/wechart/docs/design/references-markings.md`
- `/Users/srajagopal/Work/wechart/docs/design/direction.md` (§5 palettes, rule 86)
- `/Users/srajagopal/Work/wechart/docs/requirements.md` §1–3
- `/Users/srajagopal/Work/wechart/docs/requirements-log.md` (R80)
- `/Users/srajagopal/Work/wechart/docs/inputs/2026-10-18-phase-3-advanced-analytics.md`
- `/Users/srajagopal/Work/wechart/docs/inputs/2026-09-19-product-direction.md` §3
- `/Users/srajagopal/Work/wechart/docs/research/rich-tiles-and-combo-tech.md`
- `/Users/srajagopal/Work/wechart/docs/research/cube/data-apis.md`, `data-modeling.md`, `cloud-product-features.md`, `markings-query-support.md`, `spike-model-store-and-quick-calcs.md`