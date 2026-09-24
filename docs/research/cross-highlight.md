---
library: Cross-highlight targets and cross-filter pairs in BI tools (Power BI, Apache Superset, Tableau, Looker), with the Apache ECharts drawing options
packages: []
version: power-bi-docs-2026-09 (Learn ms.date 2024-12-30…2026-07-24; PBIR report schema 3.3.0, page schema 2.1.0); superset-master-2026-09-22; preset-docs-2026-04-30; tableau-help-current-2026-09-22; looker-docs-2026-09-22; echarts-6.1.0
researched: 2026-09-22
sources: [https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions, https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-interactions, https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-filters-and-highlighting, https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight, https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-multi-select, https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-pie-donut-chart, https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-optimize-ribbon-scenarios, https://learn.microsoft.com/en-us/power-bi/guidance/directquery-model-guidance, https://raw.githubusercontent.com/microsoft/json-schemas/main/fabric/item/report/definition/page/2.1.0/schema.json, https://raw.githubusercontent.com/microsoft/json-schemas/main/fabric/item/report/definition/report/3.3.0/schema.json, https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/utils/eventHandlers.ts, https://github.com/apache/superset/tree/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/CrossFilters, https://docs.preset.io/docs/cross-filtering, https://help.tableau.com/current/pro/desktop/en-us/actions_highlight.htm, https://help.tableau.com/current/pro/desktop/en-us/actions_highlight_advanced.htm, https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards, https://echarts.apache.org/en/option.html, https://echarts.apache.org/en/api.html, https://github.com/apache/echarts-doc/tree/master/en/option]
---

# Cross-highlight targets and cross-filter pairs: Power BI, Superset, Tableau, Looker, and ECharts 6.1.0

## Summary

This covers how BI tools draw a **cross-highlighted target visual** and how **per-pair Filter / Highlight / None** behaves. It serves:

- **AC-117:** apply the action set for each source → target pair.
- **AC-118:** apply the dashboard's default pair action to unset pairs, and show it.
- **AC-119:** a chip that names the member, the value and the source tile, cleared by dismissing it or by Escape.

It is a behaviour study, not a library choice. The renderer stays ECharts 6.1.0, as in [echarts.md][echarts-doc].

**Main findings**

1. **Power BI Highlight draws the full data faded, with the matching part at full strength.**
   - Docs: cross-highlighting "retains all the original data points but dims the portion that doesn't apply to your selection" ([p-end-user]). For a column chart it "highlights the relevant portion within each column while dimming the rest" ([p-pie]).
   - In the official screenshots, the full-strength part starts at the zero baseline, and the faded full value stays behind it ([p-img-after], [p-img-pie]).
   - Line charts, scatter charts and maps "can only" be cross-filtered ([p-interactions]).
2. **The contract is two arrays.** A visual that supports highlight receives "the full unfiltered `values` array along with a `highlights` array", with `null` for unselected points. When the highlight is less than the value, the point is partially highlighted ([p-highlight-dev]).
   - A visual without highlight support gets filtered values instead ([p-highlight-dev]).
3. **Power BI doesn't restrict highlight to additive measures.**
   - The docs say nothing about additivity. Highlighting "require[s] queries be submitted to the underlying source" ([p-dq-guidance]).
   - The official screenshot shows a percentage-change measure highlighted. Some full-strength bars are taller than the faded bar, and some are on the other side of zero ([p-img-before], [p-img-after]; this is my reading of the images).
4. **The per-pair model is a stored matrix with a type-dependent default.**
   - PBIR `visualInteractions[]` entries are `{source, target, type}`, where `type` is `Default | DataFilter | HighlightFilter | NoFilter`.
   - `Default` means "The target visual type determines if it should accept the interaction as a highlight or as a filter" ([pbir-page]).
   - At report level, "Change default visual interaction from cross highlighting to cross filtering" switches the default to filter ([p-optimize]; `defaultFilterActionIsDataFilter` in [pbir-report]). Query reduction can turn the default interactions off ([p-dq-guidance]).
5. **Selection.**
   - Clicking a point selects it. **Ctrl+click** multi-selects ([p-multiselect]).
   - "To remove the highlighting, select the value again, or select any empty space in the same visual" ([p-filters-highlight]).
   - The documented keyboard shortcut for clearing is **Ctrl+Shift+C**. **Esc** exits a layer or visual ([p-keys]).
6. **Superset** only filters, one cross-filter per chart ([ss-preset]).
   - Its filter bar shows the **emitting chart's title**, a "Locate the chart" button, and a closable tag with the column and value ([ss-title], [ss-tag]).
   - Unselected items in the emitting chart drop to 0.3 opacity ([ss-pie], [ss-constants]).
7. **Tableau** highlight actions color "specific marks and dim all others" ([t-highlight]). They work on whole marks. Partial shading of an aggregated mark is done with set actions ("proportional brushing") ([t-sets-actions]).
8. **Looker** only filters. Its chips show "The cross-filter field and value", not the source tile. The X removes a cross-filter ([l-cross]).
9. **ECharts 6.1.0 has no built-in partial highlight.** The pieces it does have:
   - per-item `itemStyle.opacity`
   - overlapping bars with `barGap: '-100%'`
   - `stack` / `stackOrder`
   - `custom` series
   - the emphasis/blur/select states, which hold one boolean per item ([ec-bargap], [ec-stack], [ec-custom], [ec-emphasis], [echarts-doc])

## Install

No new packages.

- `echarts@6.1.0` is already pinned (`/Users/srajagopal/Work/wechart/pnpm-lock.yaml` lines 1264 and 3416; [echarts-doc]).
- Every ECharts option cited below exists at or before 6.0.0, according to the version notes quoted in each entry.

## Init / auth pattern

Not applicable. This is a behaviour study. Cube access stays as described in the data-layer and Cube research docs ([data-apis]).

## API surface we will use

### 1. Power BI: what a Highlight target draws

**Documented text**

- "In general, *highlighting* isn't filtering. In most visuals, highlighting doesn't remove the unrelated data… The rest of the data remains visible but dimmed" ([p-filters-highlight]).
- "Cross-highlighting retains all the original data points but dims the portion that doesn't apply to your selection… The column chart dims all the data that applies to the Convenience segment and highlights all the data that applies to the Moderation segment" ([p-end-user]).
- With the pie chart as source and Highlight set on a column chart: "the column chart highlights the relevant portion within each column while dimming the rest, rather than hiding unrelated data" ([p-pie]).
- Report tooltips "always show the cross-highlighted data, even if you're hovering over the faded section of the data point" ([p-tooltips]).

**Before and after screenshots on the same Learn page** ([p-img-before] → [p-img-after]; my reading of the images)

- **Clustered column target** ("Total Units by Month and isVanArsdel", two series):
  - Every column keeps its full height in a faded tint.
  - A full-strength segment rises from the **0 baseline** to the highlighted value.
  - Data labels switch from totals (for example 2.8K) to the **highlighted values** (for example 0.4K, 1.0K).
  - Months with no matching data (2013) are fully faded and have no label.
- **Ratio-measure target** ("% Unit Market Share YOY Change by Rolling Period and Region"):
  - The faded bars keep their pre-selection values.
  - The full-strength bars start at 0 with the highlighted value. Some are taller than the faded bar (P-10, West), and some point the opposite way (P-11, Central: faded bar positive, highlighted bar negative).
  - The y-axis maximum grows from 10 % to 20 %.
- **Line chart target:** the y-range moves from 20–40 % to 70–80 %. It was filtered, not highlighted, consistent with [p-interactions].
- **Card targets:**
  - "Total Category Volume" goes from 49,832 to 14,680, and "% Units Market Share" from 32.86 % to 72.77 %. The cards show the selection's value.
  - No text says whether cards can be highlighted.

**The later pie-chart doc screenshot** ([p-img-pie]; my reading)

- **Column chart target:** each faded bar keeps its full value, positive or negative. A **narrower** full-strength bar is drawn from the zero line inside it. The older screenshot above draws the highlight segment at full column width.
- **Edit-interactions icons:**
  - The column chart target shows three icons (Filter, Highlight, None).
  - The two card targets, the map and the scatter chart each show only **two** icons.

**Which visual types support highlight**

- Can only be filtered: "You can only cross-filter line charts, scatter charts, and maps. You can't cross-highlight them" ([p-interactions]).
- Can be highlighted, per their docs:
  - column and bar charts ([p-filters-highlight])
  - pie and donut charts: when highlighted as a target, "the pie chart remains visible but is dimmed" ([p-pie])
  - treemaps ([p-treemap])
  - funnels ([p-funnel])
  - combo charts: a selection "cross-highlights and cross-filters the other visualizations" ([p-combo])
- **Tables:** as a source, you can "select rows, columns, and even individual cells, then cross-highlight the values" ([p-table]). How a table is drawn as a Highlight target is not documented.
- **Custom visuals:** highlight only if `supportsHighlight: true`. "Table data view mapping doesn't support the highlights feature" ([p-highlight-dev]).

**Target with no relationship to the selected field**

- "A model relationship propagates filters… Filters will propagate so long as there's a relationship path to follow" ([p-rel]).
- When filters don't reach the fact table, the visual shows the unfiltered total for every group: "Each customer in this visual has the same balance as the total balance… Filters aren't flowing all the way to the `Transaction` table" ([p-m2m]).
- The cross-filter docs only say that "all the other visuals on the page that contain the same data change" ([p-end-user]).
- So an unrelated target appears unchanged. For a highlight, that would mean highlight = value. This is **inference**; no page states it for cross-highlight.
- Documented error cases:
  - "If the tables have no hierarchical relationships, slicing up the measures (often referred as complex slicers) might result in an error" ([p-end-user]).
  - A matrix built from different tables, cross-highlighted at several hierarchy levels, errors "on the other visuals" ([p-interactions]).

### 2. Power BI: how highlight values are computed, and additivity

- **The data contract** ([p-highlight-dev]):
  - Categorical: `DataViewValueColumn.values` holds the unfiltered values, and `DataViewValueColumn.highlights` has the same length, with `null` for unselected points.
  - Matrix: each node value has a `value` ("the value of the node without applying a selection from the other visual") and a `highlight` ("which part of the data was highlighted").
  - "If the value of `highlight` is less than the value of `value`, then `value` was partially highlighted."
  - Type names are in [pbi-api]: `highlights?: PrimitiveValue[]` and `highlight?: PrimitiveValue`.
- **Re-querying:**
  - "Cross-highlighting and cross-filtering interactions require queries be submitted to the underlying source" ([p-dq-guidance]).
  - "Interactions (slicer changes, cross-highlighting, filters) run the queries again" ([p-dq-about]).
  - So each highlight produces a fresh evaluation of both the unfiltered and the highlighted measure. **Whether that is one DAX query or two is not documented** (UNVERIFIED).
- **Non-additive measures:**
  - No Microsoft page discusses averages, distinct counts or ratios under highlight.
  - The "partially highlighted" note assumes highlight ≤ value ([p-highlight-dev]).
  - The ratio-measure screenshot shows highlight > value and a sign flip, drawn anyway as a separate bar from zero ([p-img-after]).
  - So Power BI evaluates the measure over the selection, whatever its type, and does not clip it to the faded total. This is an observation from the screenshot, not documented text.
- **Source filters carry over.** If VisualA has visual-level filters, then when "you use VisualA to interact with VisualB, visual-level filters from VisualA will be applied to VisualB" ([p-end-user]).

### 3. Power BI: Edit interactions and defaults

- **Defaults:**
  - "By default, visualizations on a report page cross-filter and cross-highlight the other visualizations on the page" ([p-interactions]).
  - "The default is Power BI Desktop is cross-highlighting" ([p-optimize]).
- **UI:**
  - Select a visual, then choose Format › Edit interactions (Desktop), or the Visual interactions › Edit interactions toggle (service). Power BI then "adds filter and highlight icons to all of the other visualizations on the report page".
  - "The bolded icon is the one that is being applied."
  - The options are **Filter**, **Highlight**, and **None** ("no impact").
  - "These changes are saved with the report" ([p-interactions]).
- **Stored form (PBIR page schema 2.1.0):**
  - `visualInteractions`: "By default it is up-to the visual to apply it either as a cross-highlight or as a filter."
  - The enum is `Default`, `DataFilter`, `HighlightFilter` and `NoFilter` ("Data point selection is ignored by the target visual") ([pbir-page]).
- **Report-level defaults, three ways:**
  1. Default behaviour, where the type decides ([pbir-page]).
  2. The "Change default visual interaction from cross highlighting to cross filtering" option under File › Options and Settings › Options › Report settings ([p-optimize]). The schema field is `defaultFilterActionIsDataFilter`: "When selecting data points on a visual, it will result in apply that selection as a filter instead of a highlight on other visuals" ([pbir-report]).
  3. Query reduction: "It's possible to disable cross-highlighting and cross-filtering by default, though it can be overridden by editing interactions" ([p-dq-guidance]). "Any customized Edit interaction between visuals still works just as they had before" ([p-optimize]).
- **Drilling** doesn't affect other visuals by default. "Drilling filters other visuals" is a separate switch ([p-interactions]; schema `defaultDrillFilterOtherVisuals` in [pbir-report]).

### 4. Selecting and clearing

| Product  | Select                                                                                                                                                             | Add / toggle                                                                                                                               | Clear                                                                                                                                                                                                    | Source |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Power BI | Click a data point ("basic single-select highlighting")                                                                                                            | **Ctrl+click**. Ctrl+drag toggles; Shift+drag adds; keyboard rectangle select (S, arrows, Space). Up to **3,500** points                   | "select the value again, or select any empty space in the same visual"; "clicking an empty space on the plot area". Keyboard: **Ctrl+Shift+C** clears; **Esc** is "Exit a layer or visual"               | [p-multiselect], [p-filters-highlight], [p-keys] |
| Tableau  | "To select an individual mark, click it"; "all other marks are dimmed"                                                                                             | Ctrl (Windows) / Command (macOS)                                                                                                           | Filter actions have on-clear options: "Leave the filter / Show all values / Exclude all values"                                                                                                           | [t-select], [t-filter] |
| Looker   | Click a data point or legend                                                                                                                                       | Command / Control-click                                                                                                                    | "Select the **X** next to the cross-filter value"; a master X clears all; re-clicking the point also removes it (page summary)                                                                           | [l-cross] |
| Superset | Click emits the value as the chart's only selection                                                                                                                | None: clicking a selected value removes it, clicking another replaces it                                                                   | Close the tag; click the value again                                                                                                                                                                     | [ss-eventhandlers], [ss-tag] |

No product doc I read uses **Escape to clear** a cross-filter. AC-119's Escape is wechart's own choice (see Gotchas).

### 5. Superset cross-filters (master, 2026-09-22)

- **Emit.** `getCrossFilterDataMask` works like this:
  - If the clicked value is already selected, it removes it. Otherwise that value becomes the only selection.
  - It writes `extraFormData.filters` as `{col, op: 'IN', val}` for each groupby column, or `{col, op: 'IS NULL'}` for null values.
  - It sets `filterState.selectedValues`.
  - `clickEventHandler` does nothing unless `emitCrossFilters` is on ([ss-eventhandlers]).
- **Limit.** "Each chart can only emit one cross-filter. If you wish to apply a filter for multiple values, use the dashboard filter bar" ([ss-preset]).
- **What the source chart draws.** Pie slices not in `filterState.selectedValues` get `itemStyle.opacity = OpacityEnum.SemiTransparent` ([ss-pie]), which is `0.3` ([ss-constants]).
- **Filter bar.**
  - `CrossFilter` renders a `CrossFilterTitle` showing the **chart title**, plus a search icon with `aria-label` "Locate the chart" that calls `onHighlightFilterSource` ([ss-title]).
  - It also renders a `CrossFilterTag` showing `customColumnLabel || getColumnLabel(column)` and `filter.value`. The tag is `closable`, and `onClose` calls `removeCrossFilter(emitterId)` ([ss-tag]).
  - Removal clears `extraFormData.filters` and nulls `filterState.value` and `selectedValues` ([ss-crossfilter]).
  - The column label goes through the chart's `verboseMap` ([ss-selectors]).
- **Indicators on charts.** "the 'blue colored indicator' means a cross-filter was applied, and the 'double-ringed circle with an arrow' indicator means a cross-filter was emitted from the chart" ([ss-blog]). "A filter-applied icon is shown on those charts" ([ss-preset]).
- **Scope.**
  - Scope is either global or "Apply to specific panels", and cross-filtering can be disabled per dashboard ([ss-blog]).
  - The frontend's `getRelatedChartsForCrossFilter` checks only scope: global or hand-picked, excluding the source. It does **not** check dataset or column compatibility ([ss-related]).
  - The backend `QueryResult` carries `applied_filter_columns` / `rejected_filter_columns` ([ss-helpers]). Where rejection is decided was not located (see Open questions).
- **No highlight.** The Preset docs and blog describe only filtering ([ss-preset], [ss-blog]), and the emit path only writes filters ([ss-eventhandlers]).

### 6. Tableau highlight actions

- "Highlight actions allow you to call attention to marks of interest by coloring specific marks and dimming all others" ([t-highlight]).
- **Trigger:** Hover, Select or Menu ([t-highlight-adv]).
- **Targets** ([t-highlight-adv]):
  - **All Fields:** "Marks in the target sheet are highlighted when they match the marks selected in the source sheet"
  - **Dates and Times:** one date field per sheet, "the date fields can have different names"
  - **Selected Fields:** "highlighting using the Ship Mode field will result in an action that highlights all marks in the target sheet that have the same ship mode"
- Highlighting is **whole-mark**: a mark either matches or doesn't.
- **Partial shading of an aggregated mark** uses a set action plus the set on Color: "This set action changes the color of marks based on the proportion of the mark that is in or out of the set" ("proportional brushing") ([t-sets-actions]).
- **Target without the field:** not stated on the pages read (UNVERIFIED).
- **Field mapping for filter actions:** relational sources can map fields "even if the field names don't match". Multidimensional sources need the same data source and matching names ([t-filter]).

### 7. Looker cross-filters

All quotes from [l-cross] (updated 2026-09-22):

- **Chip:** "The cross-filter field and value appear at the top of the dashboard for reference." The chips are a darker blue, below the standard filters. The chip does **not** name the source tile.
- **Source tile:** "The tile creating the cross-filter highlights that data point and shows all other data points as unavailable by displaying them in grey."
- **Remove:** "Select the **X** next to the cross-filter value at the top of the dashboard". A master X clears all.
- **Scope:** "all dashboard tiles must be created from the same Explore".
- **Persistence:** "Cross-filters are not saved to the dashboard."
- **Highlight action:** none. Targets are filtered.

### 8. ECharts 6.1.0: options for drawing a Highlight target

| Need | Option / API | Documented behaviour | Source |
| --- | --- | --- | --- |
| Fade a whole item | `series-*.data[i].itemStyle.opacity` (also `lineStyle.opacity`, `areaStyle`) | Opacity from 0 to 1; "the component will not be drawn when set to 0". `item-style` and `line-style` both include it. Item-level `itemStyle` is "Rectangle style configurations of single data" | [ec-opacity], [ec-bar], [echarts-doc] |
| Overlay a highlight bar on a faded full bar, both from 0 | `series-bar.barGap: '-100%'` | "setting it to '-100%' creates an overlapping effect useful for layering series as backgrounds". It must be "set on the last series in the coordinate system, then it will be adopted by all series" | [ec-bargap] |
| Highlight share plus faded remainder | `stack`, `stackStrategy` (5.3.3+, default `'samesign'`), `stackOrder` (6.0.0+, `'seriesAsc'` by default, `'seriesDesc'`) | Series with the same `stack` on the same category axis stack. Set `stackOrder` the same on every series of the stack. Not supported in polar | [ec-stack] |
| Arbitrary per-item geometry (clustered bars, inner narrower bars) | `series-custom` with `renderItem(params, api)`: `api.value`, `api.coord`, `api.size`, `api.style` | "Custom series supports customizing graphic elements"; works on cartesian2d | [ec-custom] |
| Pattern for "partly matching" | `itemStyle.decal` | Independent of `aria` | [echarts-doc] |
| Built-in hover states | `emphasis.focus`: `'none'` (default), `'self'`, `'series'`, … ; `blurScope`: `'coordinateSystem'` (default), `'series'`, `'global'`; `blur` (5.0.0) | `blur` is "Available when [emphasis.focus]" | [ec-emphasis], [ec-bar] |
| Built-in selection | `selectedMode`: `false` (default), `true`, `'single'`, `'multiple'`, `'series'` (5.3.0); `select` (5.0.0); `select.disabled` | `select` is "Available when [selectedMode]" | [ec-select], [ec-bar] |
| Drive states from code | `dispatchAction({ type: 'highlight' / 'downplay' / 'select' / 'unselect' / 'toggleSelect', seriesIndex?, seriesId?, seriesName?, dataIndex?, name? })` | "Highlights specified data graphics" | [ec-action], [ec-event] |

- **Programmatic highlight and hover.** In the 6.1.0 source, `enterEmphasis` sets `__highByOuter`. `enterEmphasisWhenMouseOver` and `leaveEmphasisWhenMouseOut` skip elements with that flag, so a `dispatchAction` highlight survives later hovers ([ec-states]).
- **Why the built-in states fall short.** They store one boolean per item, so they can't show a partial highlight or a highlight larger than the total. This agrees with [echarts-doc] ("a poor fit for our three-valued marking").
- **Overlay pattern** (single-series bar target), per [ec-bargap] and [ec-opacity]:

  ```ts
  series: [
    { type: 'bar', data: totals, itemStyle: { opacity: 0.3 } },   // faded full value
    { type: 'bar', data: highlighted, barGap: '-100%' },          // full strength, from 0
  ]
  ```

  The barGap doc doesn't say which overlapped series draws on top. Check that in a visual test.
- **Stacked pattern** (only when 0 ≤ highlight ≤ total), per [ec-stack]:

  ```ts
  series: [
    { type: 'bar', stack: 'h', data: highlighted },
    { type: 'bar', stack: 'h', data: totals.map((t, i) => t - highlighted[i]), itemStyle: { opacity: 0.3 } },
  ]
  ```

### 9. What Cube provides (from sibling research docs)

- **Two queries.** Partial highlight is exact for every measure type when computed as two regular REST queries, `base` and `base ∧ selection`. They can be sent as one `/v1/load` array (a blending request) or as two loads, "because Cube evaluates each measure at the tile's own grain" ([mqs], Q3 option B).
- **Local derivation.** If every selection member is already a grouping key of the target at a nesting granularity, no extra query is needed ([mqs], Q3 option A).
- **Grain expansion is wrong for non-additive measures.** Querying at tile ∪ selection dimensions and re-aggregating on the client is wrong for count distinct, avg and ratios ([mqs], Q3 option C).
- **Failures.**
  - Blending arrays fail as a unit.
  - An unreachable filter gives HTTP 400 `Can't find join path…`.
  - `/v1/sql` or `/v1/dry-run` can decide applicability without running the query ([mqs], Q4).
- **Measure metadata.** `/v1/meta` gives each measure's `aggType` (`count`, `sum`, `countDistinct`, `countDistinctApprox`, …), while `type` is `number` for every aggregate ([data-modeling]).

## Gotchas

1. **Highlight on a target that can't be highlighted.**
   - In Power BI, line, scatter and map targets can only be filtered ([p-interactions]).
   - PBIR's `Default` lets the target type decide ([pbir-page]).
   - Custom visuals without `supportsHighlight` receive filtered values ([p-highlight-dev]).
   - wechart's rule 32 has one pair default that can be Highlight. The spec has to say what Highlight does for line, scatter, KPI and table targets. See Open questions.
2. **Non-additive and signed measures.**
   - A highlighted value can exceed the total or have the opposite sign (Power BI screenshot, [p-img-after]).
   - A stacked "share + remainder" is then meaningless or negative. An overlay from 0 still draws it.
   - The axis extent must include the highlighted values. Power BI's axis grew from 10 % to 20 % in that screenshot.
   - Cases where highlight ≤ total always holds (count, countDistinct, max, sum of non-negative values) are **inference** from the aggregate definitions, not a sourced statement.
3. **Labels and tooltips show the highlighted value.**
   - In Power BI, data labels switch to highlighted values ([p-img-after]).
   - Tooltips show highlighted data even over the faded section ([p-tooltips]).
4. **`barGap` is shared by the whole coordinate system** ([ec-bargap]). The `-100%` overlay therefore only works for single-series bars. Clustered bars would overlap every series, so they need `custom` series.
5. **Source tile filters.** In Power BI the source visual's own visual-level filters flow to targets ([p-end-user]). AC-117 doesn't say whether a wechart source tile's tile filters travel with its cross-filter.
6. **Unrelated targets.** Power BI filters propagate only along relationship paths ([p-rel]). Cube errors on an unreachable filter, and the error fails a whole blending array ([mqs]). Check applicability per pair before sending.
7. **Escape.**
   - Power BI's Esc exits a visual; its keyboard clear is Ctrl+Shift+C ([p-keys]).
   - Superset's `FilterBar/index.tsx` has no Escape handler, and its "Clear all" handler iterates native filters only ([ss-filterbar]). This is one file read, not the whole app.
   - AC-119's Escape has no precedent in the docs read. It must not collide with Esc closing menus or dialogs.
8. **Source tile named in the chip.** Superset shows the emitting chart's title ([ss-title]); Looker shows only field and value ([l-cross]). AC-119's "and the source tile" follows Superset.
9. **Power BI limits:** at most 3,500 selected points ([p-multiselect]). Matrices built from different tables error when cross-highlighted across hierarchy levels ([p-interactions]).
10. **Corrections and confirmations for the design docs:**
    - **Correction, `references.md` "Edit interactions" bullets:** "every other visual shows Filter / Highlight / None icons". Only targets that can be highlighted show a Highlight icon. Line, scatter and map "can only" be cross-filtered ([p-interactions]). In [p-img-pie], the card, map and scatter targets show two icons.
    - **Confirmed, `references.md`:** "Visuals cross-filter and cross-highlight by default" and the drilling toggle ([p-interactions]).
    - **Confirmed, `references-markings.md` Power BI column:** "dims the portion that doesn't apply", `values` + `highlights`, line/scatter/map filter-only, 3,500 cap, clear by empty-space click.
    - **Confirmed, `references-markings.md` Superset single-select:** [ss-preset], [ss-eventhandlers].
    - **Confirmed, `references-markings.md` Looker X-to-clear:** [l-cross].
    - **Context for `direction.md` rule 32 ("starts at Filter"):** Power BI's out-of-the-box default is cross-highlighting where the target supports it ([p-optimize], [pbir-page]). Filter-as-default matches Power BI's optional report setting. None-as-default matches its query-reduction option ([p-dq-guidance]).
    - **Context for `direction.md` rule 49 (markings mode):** Power BI draws the highlight for non-additive measures as an independent bar from 0, not as a pattern ([p-img-after]; screenshot reading). This is evidence of another approach, not a correction.
    - **Prototype `docs/design/prototype/charts.js` `highlight()`:** it fades whole items only when the selected dimension is the target's x, series or facet, like Tableau and Superset. It has no partial highlight.

## Alternatives considered

Not a library choice. The product comparison is in §§1–7.

## Open questions / unverified

- **Power BI query shape.** Whether highlight values come from one DAX query or two is UNVERIFIED. Tried: [p-highlight-dev], [p-dq-about], [p-dq-guidance], [pbi-api], and Learn search for "cross-highlight DAX query". The docs confirm only that highlighting re-queries.
- **Power BI and non-additive measures.** The only evidence is the screenshot ([p-img-after]); no text addresses it. The narrower inner highlight bar in [p-img-pie] versus the full-width segment in [p-img-after] may be a version or theme change (UNVERIFIED).
- **Power BI table, matrix and card as Highlight targets.** No text describes how they are drawn. Cards change to the selection's value and show two icons, from screenshots only ([p-img-after], [p-img-pie]).
- **Power BI unrelated target under Highlight.** "Unchanged, highlight = value" is inference from [p-rel] and [p-m2m].
- **Tableau target lacking the action's field.** UNVERIFIED. Tried [t-highlight], [t-highlight-adv] and [t-actions]; none states it.
- **Superset filter rejection.** How the backend decides that a cross-filter column is "rejected" for a chart was not located. `QueryResult` has the fields ([ss-helpers]), but the computing code was truncated in fetch. Whether Superset's "Clear all" clears cross-filters anywhere else is UNVERIFIED.
- **ECharts blur persistence.** Whether the `blur` applied to other items by a programmatic `highlight` survives later hovers is UNVERIFIED. Only emphasis persistence (`__highByOuter`) was read in [ec-states].
- **ECharts overlap draw order.** Which series draws on top with `barGap: '-100%'` is not stated in [ec-bargap]. Needs a visual test.
- **For the user or spec, not research:**
  - What Highlight does on targets that can't show it (line, scatter, KPI, table).
  - Whether source tile filters travel with a cross-filter.
  - What an unrelated target shows.
  - Whether Escape clears one chip or all of them.

## Options for wechart: ways to draw a Highlight target

| # | Drawing | What Cube needs | Exact for | ECharts mechanism | Visual types |
| --- | --- | --- | --- | --- | --- |
| H1 | **Whole-mark fade.** Matching items full, others faded (Tableau, Superset source, current prototype) | Target's own result only; the selected member must be a grouping key of the target ([mqs] Q3 option A) | Any measure (each item is fully in or out) | Per-item `itemStyle.opacity` / `lineStyle.opacity` ([ec-opacity]) | Bar, line (per-series lines), area, scatter, pie, treemap, heatmap, table rows, pivot cells, **only when the target groups by the selected member** |
| H2 | **Overlay from 0.** Faded full value plus full-strength highlighted value as its own bar (Power BI, [p-img-after], [p-img-pie]) | Two queries: `base` and `base ∧ selection`, as a `/v1/load` array or two loads ([mqs] Q3 option B) | Every measure type. Highlight may exceed or flip sign against the faded bar | Single series: `barGap: '-100%'` ([ec-bargap]). Clustered or narrower inner bar: `custom` series ([ec-custom]) | Bar and column. Line and area as a second, full-strength line over a faded line (Power BI filters lines instead, [p-interactions]) |
| H3 | **Stacked share + remainder.** Highlight segment from 0 plus faded `total − highlight` | Same two queries | Only where 0 ≤ highlight ≤ total per item. The remainder is only a meaningful quantity for additive measures (inference) | `stack` + `stackOrder` ([ec-stack]) | Bar and column; stacked area |
| H4 | **Pattern + tooltip** for partly matching items, the value in the tooltip (the markings approach in `direction.md` rule 49) | Same two queries, to know which items are partial and their highlighted value | Any measure (the value isn't encoded as a length) | `itemStyle.decal` ([echarts-doc]) | Every type with per-item `itemStyle`: bar, pie, treemap, heatmap, scatter |
| H5 | **Filter fallback.** Target is filtered even though the pair says Highlight (Power BI for line, scatter and map; `Default` semantics) | One query: `base ∧ selection` | Any measure | Normal render | Line, scatter, map/geo, KPI; any type where H1–H4 aren't defined |
| H6 | **KPI value pair.** Show the highlighted value, optionally alongside the total | One (highlighted only) or two queries | Any measure | DOM, not ECharts | KPI / card, table cells |

**Rows common to all options**

- **Applicability check** for pairs whose target can't reach the selected member: the `/v1/sql` or `/v1/dry-run` probe, cached per member set ([mqs] Q4). The displayed outcome when it isn't applicable is a spec decision.
- **Labels and tooltips.** Power BI shows the highlighted value in labels and tooltips ([p-img-after], [p-tooltips]). That applies to H2–H4 whichever is chosen.

[p-interactions]: https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions
[p-end-user]: https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-interactions
[p-filters-highlight]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-filters-and-highlighting
[p-highlight-dev]: https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight
[p-multiselect]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-multi-select
[p-pie]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-pie-donut-chart
[p-treemap]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-treemaps
[p-funnel]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-funnel-charts
[p-combo]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-combo-chart
[p-table]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-tables
[p-tooltips]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-tooltips
[p-optimize]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-optimize-ribbon-scenarios
[p-dq-guidance]: https://learn.microsoft.com/en-us/power-bi/guidance/directquery-model-guidance
[p-dq-about]: https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about
[p-rel]: https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand
[p-m2m]: https://learn.microsoft.com/en-us/power-bi/guidance/relationships-many-to-many
[p-keys]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-keyboard-shortcuts
[p-img-before]: https://learn.microsoft.com/en-us/power-bi/explore-reports/media/end-user-interactions/power-bi-gauge.png
[p-img-after]: https://learn.microsoft.com/en-us/power-bi/explore-reports/media/end-user-interactions/power-bi-filtered.png
[p-img-pie]: https://learn.microsoft.com/en-us/power-bi/visuals/media/pie-donut-chart/pie-donut-cross-highlight.png
[pbir-page]: https://raw.githubusercontent.com/microsoft/json-schemas/main/fabric/item/report/definition/page/2.1.0/schema.json
[pbir-report]: https://raw.githubusercontent.com/microsoft/json-schemas/main/fabric/item/report/definition/report/3.3.0/schema.json
[pbi-api]: https://unpkg.com/powerbi-visuals-api/src/visuals-api.d.ts
[ss-eventhandlers]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/utils/eventHandlers.ts
[ss-pie]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/Pie/transformProps.ts
[ss-constants]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/constants.ts
[ss-crossfilter]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/CrossFilters/CrossFilter.tsx
[ss-tag]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/CrossFilters/CrossFilterTag.tsx
[ss-title]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/CrossFilters/CrossFilterTitle.tsx
[ss-selectors]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/CrossFilters/selectors.ts
[ss-related]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/getRelatedCharts.ts
[ss-filterbar]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/index.tsx
[ss-helpers]: https://github.com/apache/superset/blob/master/superset/models/helpers.py
[ss-preset]: https://docs.preset.io/docs/cross-filtering
[ss-blog]: https://preset.io/blog/cross-filtering-in-superset-and-preset/
[t-highlight]: https://help.tableau.com/current/pro/desktop/en-us/actions_highlight.htm
[t-highlight-adv]: https://help.tableau.com/current/pro/desktop/en-us/actions_highlight_advanced.htm
[t-actions]: https://help.tableau.com/current/pro/desktop/en-us/actions.htm
[t-filter]: https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm
[t-sets-actions]: https://help.tableau.com/current/pro/desktop/en-us/actions_sets.htm
[t-select]: https://help.tableau.com/current/pro/desktop/en-us/inspectdata_pan_zoom.htm
[l-cross]: https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards
[ec-emphasis]: https://github.com/apache/echarts-doc/blob/master/en/option/partial/emphasis-common.md
[ec-bar]: https://github.com/apache/echarts-doc/blob/master/en/option/series/bar.md
[ec-bargap]: https://github.com/apache/echarts-doc/blob/master/en/option/partial/barGrid.md
[ec-stack]: https://github.com/apache/echarts-doc/blob/master/en/option/partial/stack.md
[ec-select]: https://github.com/apache/echarts-doc/blob/master/en/option/partial/selected-mode.md
[ec-opacity]: https://github.com/apache/echarts-doc/blob/master/en/option/partial/style-shadow-opacity.md
[ec-custom]: https://github.com/apache/echarts-doc/blob/master/en/option/series/custom.md
[ec-action]: https://github.com/apache/echarts-doc/blob/master/en/api/action.md
[ec-event]: https://echarts.apache.org/handbook/en/concepts/event/
[ec-states]: https://github.com/apache/echarts/blob/6.1.0/src/util/states.ts
[echarts-doc]: ./echarts.md
[mqs]: ./cube/markings-query-support.md
[data-apis]: ./cube/data-apis.md
[data-modeling]: ./cube/data-modeling.md
