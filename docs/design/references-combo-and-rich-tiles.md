# Design references: combo charts and rich text tiles

**For:** phase 3's combo-chart and rich-tile work (`docs/inputs/2026-10-18-phase-3-advanced-analytics.md`; backlog §7).
**Status:** proposed on 2026-10-18. It waits for the phase 3 interview, and it amends nothing until the user accepts it.
**Method note:**
- `graphify query` couldn't be run because this agent has no shell. wechart's current state was read directly from the files named in §1.
- The web search budget was exhausted, so every source below was fetched from a known vendor URL.
- Where a fetch failed (Observable Plot's axis docs, Coda's help, Tableau's dynamic zone visibility page), this document makes **no claim** about that product.

---

## 1. What wechart has today

| Area | As built | Where |
|---|---|---|
| Combo renderer | **One value axis.** The first measure is drawn as bars and the rest as lines, every series on a single shared `yAxis`. Which mark a measure gets is not stored in the spec. | `packages/charts/src/series/combo.ts` |
| Measures on another scale | R67/R69: metrics on different scales never share one axis. The extra metric's pill reads "not drawn · on another scale" and offers Small multiples and Table. A combo split by colour draws only its first measure. | `packages/core/src/undrawn.ts`; `docs/requirements-log.md` R67, R69 |
| AC-218 warning | The warning **always** fires for a combo, because `warningsFor('combo')` builds a candidate with `valueAxisCount: 2` and fails `no_dual_value_axis`. Its text, "Two value axes let the chart imply a relationship…", describes an axis the renderer never draws. | `packages/recommender/src/warnings.ts:72-73`, `legality.ts:57-63` |
| Type catalogue | Describes the combo as "Bars plus a line on two axes (use with care)", which is also inaccurate for what's drawn. | `packages/web/src/editor/chartTypeCatalog.ts:64` |
| Direction | §6: "Dual y-axes: the recommender never proposes them… allows a dual axis only as an explicit override, and shows a warning". Rule 8: the recommender never proposes a dual axis. **Rule 30 conflates "dual-axis" with "combo".** | `docs/design/direction.md` §6, rules 8 and 30 |
| Text tile | The "Markdown" element: a subset of headings, emphasis, lists and line breaks, drawn as React elements with no raw HTML (AC-208). It is edited in a 10-row `<textarea>` in Properties (AC-302). | `packages/web/src/tiles/Markdown.tsx`; `dashboard/edit/TileProperties.tsx:247` |
| Live tokens | Only `{{measure:cube.member}}`, `{{measure:… \| marking:Name}}` and `{{marking:Name.count\|summary}}` exist (AC-116). They follow the filters on the tile's page and its markings. §8's `{{filter:…}}` and `{{sparkline:…}}` **are not built.** | `packages/core/src/text-tokens.ts`; `DashboardView.tsx:4511` |
| Non-goal (phase 1) | "Spotfire-style controls inside text tiles." | `docs/spec.md:1561` |
| Rule numbering | direction.md:713 reserves 115 onwards for the copilot study's rules "when the copilot is taken up". **This document uses 115–138 as instructed, so that reservation clashes with it** (see question N6). | `docs/design/direction.md:713` |

---

## 2. Products studied

| Product | Why chosen | Sources |
|---|---|---|
| Tableau | An existing wechart reference. Its measure layering (blended axes versus dual axes) is the canonical model. | [tab-mm], [tab-parts], [tab-tip], [tab-dash], [tab-pulse], [tab-pulse-rn] |
| Power BI | Most target users know its combo visual. It has the best-documented dynamic-value text (smart narrative) and AI narrative (Copilot). | [pbi-combo], [pbi-ooi], [pbi-sn], [pbi-cn] |
| Looker | An existing wechart reference. Its left/right axis sections and its rule for pivoted series bear directly on split-by. | [lk-col] |
| Looker Studio | Has an explicit "Align both axes to 0" option and a breakdown restriction. Its scorecard shows a comparison and a sparkline. | [ls-combo], [ls-score] |
| Superset | An existing reference, running locally on :8088. Its Mixed chart (two queries, each with its own type, axis and group-by) is the permissive end of the range. | [ss-mixed] |
| Sigma | A modern warehouse BI tool. It sets mark type and axis per series, splits colour on bars only, and inserts dynamic text with `=`. | [sig-combo], [sig-axis], [sig-text], [sig-kpi], [sig-explain] |
| Metabase | An existing reference, running locally on :3000. wechart's code already cites its per-series `display`. It offers "Split y-axis when necessary". | [mb-lba] |
| Vega-Lite | The grammar wechart's engine-neutral spec follows (`render-spec.ts` cites it). Its layering and `resolve` set the vocabulary for shared versus independent scales. | [vl-layer], [vl-resolve] |
| Datawrapper | The standard critic of dual axes, and as of July 2026 a guarded implementer of them. | [dw-old], [dw-new] |
| Hex | Notebook-style text cells with `{{ }}` variables, the closest match to wechart's token syntax. | [hex-text], [hex-jinja] |
| Notion | The reference editing model for slash commands, @-mentions and blocks. | [notion] |
| Lexical and Tiptap | Candidate editor engines for a modern WYSIWYG text tile. | [lex-intro], [lex-nodes], [lex-plugins], [lex-md], [lex-rel], [tiptap] |
| ECharts 6.1 | The decided renderer: what it can do for two axes. | [ec-53], [ec-axis], [ec-yaxis], [ec-18876] |
| W3C ARIA APG | Keyboard contract for the insert menu. | [apg-combo] |

Not used, with the reason:
- **Observable Plot:** its axis docs as fetched contain nothing on dual axes.
- **Coda:** its help returned 403 or 404.
- **Tableau dynamic zone visibility:** four URL guesses returned 404.

No claim is made about any of these three.

---

## 3. Observations per product

### 3a. Combo charts

**Tableau**
- **Three ways to compare measures.**
  - Individual axes.
  - Blended axes, which "uses the Measure Names and Measure Values fields" to build one shared axis.
  - Dual axes. [tab-mm]
- **A caveat on blending:** it "is most appropriate when comparing measures that have a similar scale and units. If the scales… are drastically different, the trends may be distorted." [tab-mm]
- **Dual axes** are "useful for analyzing two measures with different scales". The limit is "up to four layered axes: two on the Columns shelf and two on the Rows shelf", so at most two value axes in each direction. [tab-mm]
- **Synchronize Axis** aligns the two scales, and "the data types for both measures must be the same". [tab-mm]
- **Per-measure marks:** each Marks card sets "mark type, color, size, and detail independently". [tab-mm]

**Power BI**
- **Two combo visuals:** "Line and stacked column" and "Line and clustered column". "Combo charts can have one or two Y axes." [pbi-combo]
- **Wells:** a series is assigned by dragging it to the **Column y-axis** or **Line y-axis** well. Two axes appear when a measure moves to the line well. [pbi-combo]
- **Auto secondary axis:** "The secondary y-axis… automatically shows or hides by default if its data range sufficiently overlaps with the primary y-axis". A toggle overrides it. [pbi-combo]
- **Syncing to one scale is a workaround:** set the secondary range to Auto and turn off its Values, and "you might need to turn it on and then off again". [pbi-combo]
- **Suggestions:** "Selecting a visual type yourself turns off the automatic Suggest a type toggle". This matches wechart's pin rule. [pbi-ooi]
- **On-object formatting** supports combo charts, but "Full accessibility isn't currently supported". [pbi-ooi]

**Looker**
- **Series type:** in the Series menu you "select a different visualization type for the series". [lk-col]
- **Axes:** "Left Axes and Right Axes sections" take series by drag. Grouped and overlay charts "can have multiple y-axes", while stacked charts get "one stacked data series and one y-axis". [lk-col]
- **"Unpin Axis from Zero"** is a per-axis option. [lk-col]
- **Pivots:** "If you have a measure pivoted, all of its pivoted values go on the same axis." [lk-col]

**Looker Studio**
- **Series:** each series has a **Series type** (Line or Bars) and an **Axis**. [ls-combo]
- **"Align both axes to 0":** "Makes both left and right axes start at 0". [ls-combo]
- **Metric limits:** "up to 20 metrics" with one dimension. "If you specify a breakdown dimension, the chart is limited to a single metric." [ls-combo]

**Superset (Mixed chart)**
- **Two queries:** Query A and Query B each have their own metrics and **groupby**, so both can be split, even by different dimensions. [ss-mixed]
- **Per query:** a series type (Line, Scatter, Smooth Line, Bar, Step) and `yAxisIndex` of "Primary" or "Secondary". [ss-mixed]
- **Axis settings:** separate primary and secondary bounds, formats and log scales. The control panel has **no zero-alignment option**. [ss-mixed]

**Sigma**
- **Default marks:** "the first column placed on the y-axis is displayed as a bar chart and all additional columns are plotted as lines". Shape can be Bar, Line, Area or Point. [sig-combo]
- **Colour split, bars only:** "If your combo chart includes bars, select a source column to define color categories for the bar series". [sig-combo]
- **Data limit:** 25,000 data points. [sig-combo]
- **Axis per column:** Axis > Left or Right. The axis docs mention no alignment or sync. [sig-axis]

**Metabase**
- **Per-series settings:** display type per series, and "Y-axis position: Auto, Left, or Right". [mb-lba]
- **"Split y-axis when necessary":** its trigger is not published on the page fetched. [mb-lba]

**Vega-Lite**
- **Shared by default:** "the default resolutions for layer are shared scales, axes, and legends". A dual axis is `"resolve": {"scale": {"y": "independent"}}`. [vl-layer]
- **Independence:** "Independent scales imply independent axes and legends." [vl-resolve]

**Datawrapper**
- **2018 position (Lisa Charlotte Muth, updated July 2026):**
  - "The scales of dual axis charts are arbitrary and can therefore (deliberately) mislead readers".
  - Its one legitimate case is two scales for one series, such as °C and °F.
  - Its recommended alternatives are side-by-side charts, indexed charts, annotations and connected scatterplots. [dw-old]
- **July 2026 feature (Business plan; Bentley and Levin Schtulberg, 23 July 2026):**
  - Series are dragged to the left or right axis, and each gets a chart type.
  - "If one vertical axis starts at zero, the other will too".
  - The baseline is adjusted when one axis goes negative.
  - "grid labels can also take on the color of the associated data series".
  - Interactive colour keys "highlight the related metrics and vertical axes". [dw-new]

**ECharts 6.1**
- **Two axes per grid:** "a single grid component can place at most 2 y axis, one on the left and another on the right". More needs `offset`. [ec-yaxis]
- **`alignTicks: true`** (since 5.3): "the axis will then adjust its own ticks according to the first axis's ticks". It works on value and log axes only. [ec-53]
- **Known bug:** `minInterval` is ignored under `alignTicks` (#18876, open). [ec-18876]; `docs/research/echarts-axis-legend-bars.md`
- **`axisLine.onZero: 'auto'`** is new in 6.1.0. **Axis `breaks`** arrived in 6.0.0. [ec-axis]
- **Zero alignment:** none was found in the axis docs fetched, so wechart would compute both extents itself.

### 3b. Rich text tiles

**Power BI: Narrative visual, Custom mode (smart narrative)**
- **Two modes:** Copilot and Custom. [pbi-sn]
- **Dynamic values:** "Select Value, choose a field or measure… select a Summarization. You can add a filter, name the value". Values can be formatted as currency, with decimals and separators. [pbi-sn]
- **Follows interactions:** "A summary is dynamic. It automatically updates the generated text and dynamic values when you cross-filter." [pbi-sn]
- **Empty results:** a "hidden-summary symbol" marks a value with no result under the current filters. [pbi-sn]
- **Generation limits:** "up to four summaries per visual and up to 16 per page". [pbi-sn]
- **Accessibility:** an optional header icon gives an on-demand summary "for accessibility purposes, to announce results to any assistive technology". [pbi-sn]

**Power BI: Narrative visual, Copilot mode**
- **Review:** the author is told to "Read through the summary to make sure it's accurate". [pbi-cn]
- **Footnotes:** hovering a footnote highlights the visual it cites. [pbi-cn]
- **No editing:** "You can't edit the visual after Power BI generates it", only re-prompt it. [pbi-cn]
- **Regeneration:**
  - The prompt is stored "so it can generate the summary each time a report loads".
  - Yet "The narrative visual doesn't automatically update, but there's a refresh button". [pbi-cn]

**Tableau**
- **Text objects:** dashboard Text objects "provide headers, explanations, and other information". Rich text with live hyperlinks is "supported only on the web". [tab-dash]
- **Dynamic text** comes through the **Insert** menu in titles, captions and tooltips ("page number, sheet name, and field and parameter values"). Captions can be "automatically generated". [tab-parts], [tab-tip]
- **Tableau Pulse insight summaries:**
  - The statistical service generates facts as "ground truths", which are then "processed by AI in Tableau".
  - Only Period Over Period Change and Unexpected Values feed the summaries. [tab-pulse]
  - Summaries "can be turned on or off independently". [tab-pulse-rn]

**Sigma**
- **Text elements:**
  - Six preset styles, from "Large heading" to "Small paragraph".
  - "Press = on your keyboard… to add dynamic text", with formula autocomplete. Dynamic text is formatted from the same toolbar. [sig-text]
- **KPI chart:** period-over-period comparison, a trend line or area, and Direction ("Higher is better", "Lower is better", "None") that decides green or red. [sig-kpi]
- **"Explain this chart":** an AI explanation that requires a configured AI provider and a permission. [sig-explain]

**Looker Studio scorecard**
- **Comparison:** Period, Value or Metric, shown as percent or "absolute change". [ls-score]
- **Colours:** positive and negative change colours. [ls-score]
- **Sparkline:** "add a sparkline… to visualize your primary metric's trends over time". [ls-score]
- **Compact numbers:** "553,939 becomes 553.9K". [ls-score]

**Hex**
- **Text cells:** a "WYSIWIG… editor that accepts both markdown shortcuts… as well as UI-driven formatting". [hex-text]
- **Variables:** "variable substitution using the usual double curly braces, `{{ }}`". "if statements and for loops are not yet supported in Text cells". [hex-jinja]
- **Mentions:** only Text cells notify mentioned members. [hex-text]

**Notion**
- **Slash menu:** "Type `/` followed by any type of block". [notion]
- **Mentions:** `@` mentions people, pages and dynamic dates. [notion]
- **Blocks:** a `⋮⋮` drag handle, and "Turn into". [notion]

**Editor engines**
- **Lexical:**
  - A `DecoratorNode` is a "Wrapper node to insert arbitrary view (component) inside the editor", rendered through `React.createPortal`. [lex-nodes]
  - Plugins: `LexicalTypeaheadMenuPlugin` (a trigger-character menu), Markdown shortcuts, a history plugin (undo and redo) and `LexicalNodeMenuPlugin`. [lex-plugins]
  - `$convertFromMarkdownString` and `$convertToMarkdownString` with "application-specific subset of markdown or custom transformers". [lex-md]
  - It is "built for reliability, accessibility, and performance". [lex-intro]
  - The newest release on the releases page was v0.52.0. [lex-rel]
  - Its licence was not stated on the pages fetched, so the research doc must confirm it.
- **Tiptap:** "published on GitHub under the MIT license", built "on top of ProseMirror". Pro extensions and Cloud are paid. [tiptap]

---

## 4. Cross-product patterns

**Shared**
1. **Each series chooses its own mark type** (bar, line, and usually area or point). This holds for Tableau, Power BI, Looker, Looker Studio, Superset, Sigma and Metabase. [tab-mm] [pbi-combo] [lk-col] [ls-combo] [ss-mixed] [sig-combo] [mb-lba]
2. **The default is the first measure as bars and the rest as lines** (Sigma, and Power BI's two wells). wechart already draws this. [sig-combo] [pbi-combo]
3. **At most two vertical value axes, left and right.** Tableau caps vertical axes at two; Power BI, Superset, Sigma and Looker Studio offer left/right or primary/secondary; ECharts places two per grid. Looker alone allows several on each side. [tab-mm] [pbi-combo] [ss-mixed] [sig-axis] [ls-combo] [ec-yaxis] [lk-col]
4. **Splitting is restricted.** Looker Studio allows a single metric with a breakdown; Looker puts pivoted values on one axis; Sigma colour-splits bars only. Superset is the exception, with a group-by per query. [ls-combo] [lk-col] [sig-combo] [ss-mixed]
5. **Live text values are typed references to fields or measures, formatted by the field and responsive to filters.** Power BI says so explicitly; Sigma inserts them with `=`, Hex with `{{ }}`, and Tableau through Insert. [pbi-sn] [sig-text] [hex-jinja] [tab-parts]
6. **KPI deltas pair a direction setting with a colour, and add a sparkline.** [sig-kpi] [ls-score]

**What sets them apart**
- **Alignment tools vary.** Datawrapper aligns zeros automatically; Looker Studio offers an explicit "Align both axes to 0"; Tableau has Synchronize Axis for the same data type; Superset and Sigma have none; Power BI's single-scale sync is a workaround. [dw-new] [ls-combo] [tab-mm] [ss-mixed] [sig-axis] [pbi-combo]
- **Some products split axes automatically:** Power BI's secondary axis and Metabase's "Split y-axis when necessary". The rest require an explicit choice. [pbi-combo] [mb-lba]
- **AI narrative takes two shapes:**
  - Power BI writes from what is on the canvas, regenerates on load or on refresh, and its text can't be edited. [pbi-cn]
  - Tableau Pulse computes statistical facts first, and the language model only writes them up. [tab-pulse]

---

## Direction: two layered compositions on the existing workbench

The direction, in one sentence: build both features as layered compositions on the existing workbench. A combo is a set of per-series layers on one shared scale, and a second axis appears only when the author asks for it, drawn zero- and tick-aligned with a warning that names the risk. A rich tile is today's markdown tile edited in place, whose live values are typed inline elements that follow filters and markings; its AI wording is written from facts wechart computed, reviewed before it lands, and never silently regenerated.

### 5. The combo experience

**Spec (engine-neutral).**
- Per-series settings live in the sparse `RenderSpec.options` that already exists (`render-spec.ts:207`):
  ```
  options.series[<member>] = { mark: 'bar'|'line'|'area'|'point', axis: 'left'|'right' }
  options.split = { member: <dimension>, series: <member> }
  options.axes.right = { …AC-219's axis fields }
  ```
- These map one-to-one to Vega-Lite `layer` plus `resolve.scale.y` ([vl-layer], [vl-resolve]) and to ECharts `yAxisIndex` ([ec-yaxis]), so the spec stays renderer-free.

**Inspector**
- **Customize › Series** (AC-219 already holds series colour and visibility there) gains one **28 px** row per series. Each row has:
  - a colour swatch and the series name (`text-xs`);
  - **Mark:** a segmented control of four 24 px icon buttons (Bar, Line, Area, Point), each with its name as its accessible name and tooltip;
  - **Axis:** a segmented control, Left | Right, at 28 px.
- The **Metrics** well pill's menu offers the same two choices ("Draw as ▸", "Axis ▸"), following Tableau's per-measure Marks card [tab-mm], Metabase's per-series menu [mb-lba] and Sigma's column menu [sig-combo]. The inspector stays the complete keyboard path (principle 5); the pill menu is a shortcut.
- **Customize › Axes** shows a second **Right axis** group only while some series is on the right. It has the same fields as §6's axis editor, except that "include zero" is locked on, with the reason given, whenever that axis carries a bar series.

**Auto-recommendation**
- The recommender still never proposes a second axis (rule 8).
- When the author picks Combo, wechart assigns the defaults: first measure Bar, the rest Line, all Left ([sig-combo]; today's `combo.ts`).
- Each Series row has an **Auto** reset. A manual mark or axis stays pinned through field changes (principle 2).
- A measure on another scale keeps R67's "not drawn · on another scale" pill. In a combo, its first offer becomes **"Draw on a right axis"**, then Small multiples and Table.
- So a second axis exists only by an explicit click, never by auto-split. This rejects Power BI's and Metabase's automatic split [pbi-combo] [mb-lba].

**Two-axis drawing**
- **Zeros aligned:** both axes include zero whenever either holds a bar series, and their zero lines sit at the same height ([dw-new]; Looker Studio's "Align both axes to 0" [ls-combo]). wechart computes both extents itself.
- **Ticks aligned:** the right axis uses `alignTicks` [ec-53], so the left axis's gridlines serve both, and the right axis draws no gridlines of its own. Because of #18876 [ec-18876], wechart rounds the right axis's interval itself where integers are required.
- **Axis identity, never by colour alone:**
  - each axis title lists its measures, each preceded by its mark glyph in the series colour (bar: an 8 × 8 swatch, radius 2; line: a 12 × 2 rule);
  - tick labels stay `text-secondary`.
  - Datawrapper's series-coloured tick labels [dw-new] are rejected, because aqua, yellow and magenta fall below 3:1 on light surfaces (§5), which would break rule 2.
- **Legend:** each entry shows its mark glyph, and right-axis series add "(right)". Hovering a series or its legend entry emphasises its axis, as Datawrapper's interactive keys do [dw-new].
- **Log scale:** with two axes, both must use the same scale type, because `alignTicks` aligns value-to-value or log-to-log only [ec-53]. The research doc must confirm the mixed case.

**Warning rules (AC-218 amended)**

| Case | What the editor shows |
|---|---|
| One-axis combo | Nothing. A layered chart on one shared scale misleads no more than a grouped bar ([vl-layer] shared by default; [tab-mm] blended axes). |
| Two axes | A `status-warning` row in Customize › Axes and on the type card: "Two scales: ‹A› and ‹B› can be made to look related." It offers One axis, Small multiples and Table ([dw-old]'s alternatives). |
| Two axes with the same format on both (for example, $ and $) | The stronger text "Both axes are in ‹unit›; one axis compares them honestly", with One axis first. Tableau's own caveat is that shared axes suit the same units [tab-mm]. |
| Two line-only axes, with "include zero" turned off on either | The row adds "Axes don't start at zero." |
| Capacity | The existing rules stand (rule 6; pie slices and so on). |

The warning is for the author. It appears in the editor and in the tile's edit mode, not to viewers; viewers get titled, glyph-keyed axes.

**Limits**
- **2 value axes**, from Tableau's two vertical axes, the left/right model everywhere else, and ECharts' two per grid [tab-mm] [ec-yaxis].
- **8 drawn series after any split**, from §5's 8 validated slots and rule 6.
- Over either limit, the pill reads "not drawn · over 8 series" or "· a third axis", and offers Small multiples and Table.

**Split-by**
- One dimension, applied to **one series**: by default the first bar series, which is grouped or stacked, as Power BI's two combo variants are [pbi-combo].
- Unsplit series take the next palette slots, and the slot count includes the split's members.
- Asking to split a second series offers **"Small multiples by ‹dimension›"**: one combo per panel, under the existing trellis rules (shared axes, at most 20 panels).
- This follows Looker Studio's, Looker's and Sigma's restrictions [ls-combo] [lk-col] [sig-combo], and still answers Superset's use case [ss-mixed] without overlaying two split series.

**Accessibility**
- The chart's text alternative and table view name each series' mark and axis, for example "Revenue: bars, left axis, $. Margin: line, right axis, %".
- Rule 5's table view stays one click away.

### 6. The rich tile experience

**Relation to today's tile**
- The **Markdown** element is renamed **Text** and upgraded in place.
- Its saved form stays AC-208's markdown subset plus `{{…}}` tokens. Every existing tile opens unchanged, AC-116's tokens keep working, AC-443's handling of user-written text is unaffected, and rule 25 (no raw HTML) holds by construction.
- Properties keeps the source as **Markdown**, synced with the canvas: the rule 20 pattern applied to text.

**Editor**
- **Editing:** WYSIWYG in place on the canvas in edit mode, in the manner of Hex's text cells [hex-text].
- **Engine: Lexical.**
  - Live elements are `DecoratorNode`s rendering React components [lex-nodes].
  - Custom Markdown transformers map each node to and from its `{{…}}` token [lex-md].
  - Undo comes from the history plugin [lex-plugins], and the dashboard's own undo takes the result when the editor is left.
  - Tiptap (MIT core on ProseMirror [tiptap]) is the runner-up. Lexical is chosen because the React-component node and the markdown-transformer pair are both first-party.
  - A `docs/research/` doc must cover the exact version and the licence before import (CLAUDE.md gate).
- **Toolbar** (edit mode, 32 px):
  - Block style: Paragraph, Heading small, Heading medium, Heading large, and Large value. These follow Sigma's presets [sig-text] and map to §3 tokens.
  - Bold, italic, bulleted and numbered lists, Link, **Insert**, and the counter "n / 10 live values".
  - Markdown shortcuts work as typed [lex-md].
- **Insert menu**, opened by `/` at a line start or after a space [notion], by Insert, or by `{{` (today's syntax, as Hex's [hex-jinja]):
  - it is an APG combobox with a listbox: ↑ ↓, Enter, Esc [apg-combo];
  - kinds come first, then searchable measures from the dashboard's cubes, grouped by cube as `PathPicker` groups them;
  - the menu is 320 px wide with 28 px rows.

**Live element kinds**

| Kind | Token (proposed) | Renders | Precedent |
|---|---|---|---|
| Value | `{{measure:m}}`, plus optional `\| marking:N`, `\| filter:…`, `\| range:…` | the formatted number | Power BI dynamic value with its own filter [pbi-sn]; Sigma `=` [sig-text] |
| Change | `{{change:m \| vs:previous_period \| better:higher}}` | "▲ 4.2%" or "▼ $1.1 K", with the glyph and a word for screen readers | Sigma KPI Direction [sig-kpi]; Looker Studio comparison and absolute change [ls-score] |
| Sparkline | `{{sparkline:m \| by:time.month \| last:12}}` | a word-sized line with no axes | Looker Studio scorecard sparkline [ls-score]; Sigma trend [sig-kpi] |
| Marking | `{{marking:N.count\|summary}}` (exists) | count or summary | AC-116 |
| Filter value | `{{filter:id}}` (§8, unbuilt) | the current values, for example "EMEA, APAC" | Tableau Insert of parameter values [tab-parts] |
| As of | `{{asof:m}}` | the data's age, for example "as of 14:05" | rule 19 |

- A Link becomes an ordinary markdown link under the Link tile's rules: dashboard targets or http(s) only.
- Buttons, controls and free icons are not live elements (see Rejects and N2).

**How values render and update**
- **View mode:** a value is plain inline text in the paragraph's own type, with `tnum` and the member's model format (AC-046), and no chip chrome. Focus or hover shows its definition: the measure title, the filters in effect, the marking, and the data age.
- **Edit mode:** a value is an atomic inline token (`contenteditable=false`) with `bg-subtle`, a 1 px `border-subtle` outline, radius 4, padding 0 4, at the text's own size. Selecting one opens its settings in Properties.
- **Scope:**
  - Elements follow the filters that reach the tile (today's `textFiltersOf`) and any marking they name.
  - In cross-filter mode, a text tile is a target like any tile, set to **Filter** or **None**. Highlight is shown disabled, with "Text has no marks to highlight".
  - Power BI's narrative updates on cross-filter in the same way [pbi-sn].
- **Queries:** elements sharing filters and granularity are batched into one Cube query, so a tile issues few requests even at 10 elements.
- **Large value block:** a lone Value or Change on a "Large value" line renders at `text-kpi` 32/40 (`tnum`).
- **Sparkline:** 16 px high (the `text-xs` line height) and 64 px wide; a 2 px line (§6 marks) in the measure's dashboard colour (rule 7); no markers.
- **Change colour:** `status-success` or `status-error` text when the direction is set; `text-secondary` when it is Neutral; always with ▲ or ▼ and the sign.

**Empty, loading and error states** (each with an icon and a label, rule 3)
- **Loading:** a `bg-subtle` skeleton bar, the width of the last value or 4ch, with `aria-busy` on the tile.
- **No data:** "—" with the tooltip "No data for these filters". This is Power BI's hidden-summary case, made visible [pbi-sn].
- **Error:** the `status-warning` icon and "Unavailable"; focus shows Details (the member, the query error); Retry is in the tile's ⋯ menu.
- **No permission:** "Unavailable", **without naming the member** (principle 6).
- **Unknown or removed member:** "Unavailable", plus an edit-mode badge "1 live value needs fixing".
- **Empty tile:**
  - in edit mode, the placeholder "Type, or press / to insert a live value";
  - in view mode, nothing renders;
  - the Outline names it "Empty text".

**AI narrative** (in scope; it shares the copilot's Super-Admin provider settings, `references-copilot.md`)
- **Trigger:** "Summarize…" in the Insert menu, enabled only when a Super-Admin has enabled the AI provider. The author chooses which tiles or measures it covers.
- **Facts first:** wechart computes the facts through Cube, such as period-over-period change and the top and bottom contributors (Tableau Pulse's "ground truths" [tab-pulse]). The model writes prose around them.
- **Numbers stay live:** every number in the output must be a live-element token. A draft holding a digit outside a token is rejected before the author sees it. The numbers therefore stay current, and the model can't invent one.
- **Review:** the draft appears as a card with Insert, Regenerate and Discard; nothing lands unread (principle 8; Power BI's "make sure it's accurate" [pbi-cn]). Once inserted, it is ordinary editable text. This rejects Power BI's non-editable output [pbi-cn].
- **Label:** a 24 px chip, "Written with Copilot · reviewed by ‹name›, ‹date›" (an icon and a label in `text-secondary`), the same family as "Made with Copilot" in `references-copilot.md`, with no sparkle or AI colour.
- **Refresh:** the wording is never regenerated by refresh, filter or viewer. Numbers update live. When a fact the wording cites changes sign or rank, authors see `status-warning` "Written for earlier data" with Review, and viewers see "Wording as of ‹date›" in the label.

### Reasoning
- **Roles:** analysts get honest defaults with a deliberate escape hatch, the same principle 2 as Show Me-style recommendations. Consumers read text that is always current and labelled. Authors can't publish unreviewed AI text, which extends principle 8.
- **ACs served or amended:** AC-037 (combo), AC-218 (now warns on what's actually drawn), AC-219 (axis and series settings), R67/R69 (the scale rules kept, with a new first offer), AC-208/AC-116/AC-302 (kept, and upgraded in place), and rules 5–8, 19, 25 and 30.
- **References drawn on:**
  - Tableau's and Vega-Lite's layering, with shared scales by default;
  - Datawrapper's guarded dual axis, for zero alignment and axis highlighting;
  - Looker Studio's zero alignment and Sigma's defaults;
  - the split restrictions of Looker, Looker Studio and Sigma;
  - Power BI's dynamic values and their response to cross-filters;
  - Sigma's `=` and Hex's `{{ }}` entry, Notion's `/`;
  - Tableau Pulse's facts-then-language pipeline.

### What this direction rejects
- **Automatic second axes** (Power BI, Metabase): they break rule 8 and principle 2's "never override silently".
- **Up to 4 value axes** (Looker's multiple axes per side): no other studied product has more than two vertical value axes, and ECharts draws two per grid.
- **Two split series overlaid** (Superset): it exceeds the palette quickly and needs two legends. Small multiples carry the same comparison.
- **Series-coloured tick labels** (Datawrapper): they fail rule 2 for three of the light-theme palette slots.
- **A separate rich tile beside Markdown:** two text elements with overlapping tokens would split the documentation and the outline for no user benefit.
- **Arbitrary text colour, font and size** (Sigma's toolbar): they would escape the contrast audit (rule 2) and the type scale (rule 1).
- **Buttons, controls and free icons inside text:** phase 1 named controls in text as a non-goal, and an icon without a label breaks rule 3. Kept for the user as N2.
- **AI that regenerates on load or refresh** (Power BI Copilot): viewers would see unreviewed text.
- **Non-editable AI output** (Power BI Copilot): the author owns the words.

### Tokens to derive
No new colour, type size or weight is needed.

| Use | Value | Provenance |
|---|---|---|
| Series row; Axis segmented control | 28 px, `text-xs` | §4 compact rows; rule 17 |
| Mark segmented buttons | 24 px icon buttons | §4 small controls |
| Axis-title glyphs | bar: 8 × 8, radius 2; line: 12 × 2 | wechart's product decision; nothing published |
| Combo warning row | `status-warning` icon plus `text-xs` | §5; rule 3 |
| Text body; headings | `text-sm` 14/20; `text-md` 16/22, `text-lg` 20/26, `text-xl` 24/32 | §3 (Markdown body, Header element sizes) |
| Large value block | `text-kpi` 32/40, `tnum` | §3 |
| Edit-mode token | `bg-subtle`, 1 px `border-subtle`, radius 4, padding 0 4 | §4 and §5 |
| Inline sparkline | 16 × 64 px, 2 px line, no markers | 16 from the `text-xs` line height; 64 = 16 × 4 is wechart's decision; 2 px from §6 |
| Change colours | `status-success` and `status-error` text, `text-secondary` for Neutral | §5. These are status uses, not series colours |
| Insert menu | 320 px wide, 28 px rows, `bg-raised` | §2 inspector width; §4 |
| AI label chip | 24 px, radius 999, `text-xs`, `text-secondary` | §4 chips; `references-copilot.md` tokens |
| Palette | 8 slots in total across a combo's series and split members | §5; rule 6 |

---

## 7. Open questions (recommended answer first)

**Q1. Is AI-written narrative regenerated on refresh?**
- **(a) No (recommended).** The wording is fixed at the author's review and every number is a live token. A changed sign or rank flags "Written for earlier data" to authors. *Why:* no viewer sees unreviewed text (principle 8), and the numbers can't go stale.
- (b) Regenerated on each load or data refresh, labelled "Not reviewed" (Power BI stores the prompt to "generate the summary each time a report loads" [pbi-cn]).
- (c) Regenerated after each data refresh as a draft the author must approve.

**Q2. Do rich tiles replace text tiles?**
- **(a) Yes, in place (recommended).** One Text element with the same stored markdown and tokens, so every existing tile keeps working.
- (b) Both elements, with Markdown kept for source-only authors.
- (c) A new element, with a migration.

**Q3. Is 10 the right limit on live elements per tile?**
- **(a) Yes, 10 per tile, with batched queries and the "n / 10" counter (recommended).** No studied product publishes a per-text-box limit (Power BI caps generated summaries at 4 per visual and 16 per page, which is not the same thing [pbi-sn]), so 10 is a product decision.
- (b) 16.
- (c) No count limit, bounded instead by the number of distinct queries per tile.

**Q4. When should wechart warn about a hand-picked combo (AC-218)?**
- **(a) Only while it draws a second value axis, more strongly when both axes share a unit, and also when line axes don't start at zero (recommended).** A proposed rewording: "WHILE a manually chosen chart draws a second value axis, or exceeds a channel's capacity, THE SYSTEM SHALL show a warning with an icon saying why… Fails when: a two-axis combo shows no warning, or a one-axis combo shows one."
- (b) For every combo, as today.
- (c) Never; rely on aligned, labelled axes.

**Q5. Are 8 series and 4 axes the right limits?**
- **(a) 8 series and 2 value axes (recommended):** [tab-mm], [ec-yaxis], §5.
- (b) 8 and 4, using ECharts `offset` for outer axes.
- (c) 20 series, as Looker Studio allows [ls-combo]. This breaks rule 6.

**Q6. May more than one series be split by a dimension?**
- **(a) No. One split series; a second split offers small multiples of the combo (recommended).**
- (b) Yes, if both are split by the same dimension: colour means the member and the mark means the measure, with two legends.
- (c) Yes, freely, as Superset does [ss-mixed].

**New questions**
- **N1. Indexed alternative.** Should "Index to 100" join the two-axis warning's offers as a quick calculation (Datawrapper's alternative [dw-old])? (a) Yes, research first (recommended). (b) No.
- **N2. Controls in text** (phase 1 non-goal). (a) Keep them out: links only (recommended). (b) Allow a Link/button inline. (c) Allow filter controls inline.
- **N3. Viewer-requested AI summaries.** (a) No (recommended). (b) "Summarize for my filters", temporary and labelled "Not reviewed", as Power BI's refresh button works [pbi-cn].
- **N4. Text tiles in cross-filter mode.** (a) Filter or None only (recommended). (b) Also Highlight, shown as "x of total".
- **N5. Which facts the AI may cite.** (a) Period-over-period change and top or bottom contributors now, and phase 3 stage A's statistics later (recommended; Tableau Pulse uses period-over-period and unexpected values [tab-pulse]). (b) Wait for stage A.
- **N6. Rule numbering.** direction.md:713 reserves 115 onwards for the copilot. (a) These rules take 115–138 and the copilot's follow from 139 (recommended). (b) Renumber these after the copilot's.

---

## 8. Checklist rules (proposed; they follow rule 114)

115. A combo draws each measure as its own series with its own mark (Bar, Line, Area or Point) and value axis (Left or Right), set in Customize › Series and from the Metrics pill's menu. A new combo draws the first measure as bars and the rest as lines, all on the left axis. Each Series row has an Auto reset.
116. A combo has at most two value axes, one left and one right, and at most 8 drawn series after any split. A measure over either limit shows "not drawn" with its reason and offers Small multiples and Table.
117. Only the author's explicit choice puts a series on the right axis; the recommender, Auto and field changes never do. In a combo, a measure on another scale is "not drawn · on another scale", and its first offer is "Draw on a right axis".
118. With two value axes, both include zero whenever either axis carries a bar series, their zero lines sit at the same height, the right axis's ticks fall on the left axis's gridlines, and the right axis draws no gridlines.
119. Each value axis is titled with its measures, each preceded by its mark glyph in its series colour. Tick labels stay `text-secondary` in both themes.
120. A combo's legend entries show their mark glyph, and a right-axis series adds "(right)". Hovering a series or its legend entry emphasises its axis.
121. While a combo draws a second value axis, the editor shows a `status-warning` row naming both measures and offering One axis, Small multiples and Table. A one-axis combo shows no warning (AC-218 as amended).
122. When both axes of a two-axis combo carry the same format, the warning says so and its first offer is One axis. When either line-only axis doesn't include zero, the warning says "Axes don't start at zero".
123. Only one series of a combo may be split by a dimension. Asking to split a second offers Small multiples by that dimension, with one combo per panel.
124. A combo's text alternative and table view name each series' mark and axis.
125. The dashboard has one Text element, which replaces Markdown. Every existing markdown tile opens in it unchanged. Its saved form is AC-208's markdown subset plus `{{…}}` tokens, and it never stores or renders raw HTML.
126. In edit mode a Text tile is edited in place, with a toolbar for block style, bold, italic, lists, link and Insert. Markdown shortcuts work as typed, and Properties shows the same text as Markdown source, kept in sync both ways.
127. `/` at the start of a line or after a space, the toolbar's Insert, and `{{` all open the insert menu. It is a combobox with a listbox (↑ ↓, Enter, Esc) listing the live element kinds, then measures grouped by cube.
128. The live element kinds are Value, Change, Sparkline, Marking, Filter value and As of, each stored as one token. A tile holds at most 10; the toolbar shows "n / 10 live values", and the 11th insert is disabled with its reason.
129. A live element follows the filters that reach its tile, the tile's cross-filter setting (Filter or None) and any marking it names. Any filter or time range of its own is listed in its tooltip.
130. In view mode a value reads as text in the sentence's own type, with tabular numerals and its member's model format. Focus or hover shows its measure, the filters in effect, its marking and the data's age.
131. A Change element always shows ▲ or ▼ and a sign or word with its colour. Its direction setting, Higher is better, Lower is better or Neutral, decides `status-success`, `status-error` or `text-secondary`.
132. An inline sparkline is word-sized and has no axes or markers. Its text alternative names the measure, the period, the first and last values, and the high and low.
133. A loading value shows a skeleton the width of its last value. An error shows the warning icon and "Unavailable", with Details on focus. No data shows "—" with "No data for these filters". A value the viewer may not query shows "Unavailable" and never names the member.
134. A Text tile offers no free text colour, font or size. Its block styles map to §3 tokens, and the Large value block uses `text-kpi`.
135. An AI summary is drafted only at the author's request, from facts wechart computed through Cube. Every number in it is a live element, and a draft holding a number outside one is rejected.
136. An AI draft lands only when the author chooses Insert after reading it. Once inserted, it is ordinary editable text.
137. A tile holding AI-written text shows "Written with Copilot · reviewed by ‹name›, ‹date›" as an icon and a label, in view and edit modes.
138. AI-written wording is never regenerated by a data refresh, a filter or a viewer. When a fact it cites changes sign or rank, authors see "Written for earlier data" with Review, and viewers see "Wording as of ‹date›".

---

## Sources

[tab-mm]: https://help.tableau.com/current/pro/desktop/en-us/multiple_measures.htm
[tab-dash]: https://help.tableau.com/current/pro/desktop/en-us/dashboards_create.htm
[tab-parts]: https://help.tableau.com/current/pro/desktop/en-us/view_parts.htm
[tab-tip]: https://help.tableau.com/current/pro/desktop/en-us/formatting_specific_titlecaption.htm
[tab-pulse]: https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm
[tab-pulse-rn]: https://help.tableau.com/current/online/en-us/pulse_intro.htm
[pbi-combo]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-combo-chart
[pbi-ooi]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction
[pbi-sn]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative
[pbi-cn]: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-narrative
[lk-col]: https://docs.cloud.google.com/looker/docs/column-options
[ls-combo]: https://docs.cloud.google.com/looker/docs/studio/line-chart-and-combo-chart-reference
[ls-score]: https://docs.cloud.google.com/looker/docs/studio/scorecard-reference
[ss-mixed]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/MixedTimeseries/controlPanel.tsx
[sig-combo]: https://help.sigmacomputing.com/docs/combo-charts
[sig-axis]: https://help.sigmacomputing.com/docs/format-chart-axis-position
[sig-text]: https://help.sigmacomputing.com/docs/text-elements
[sig-kpi]: https://help.sigmacomputing.com/docs/build-a-kpi-chart
[sig-explain]: https://help.sigmacomputing.com/docs/explain-visualizations-with-ai
[mb-lba]: https://www.metabase.com/docs/latest/questions/visualizations/line-bar-and-area-charts
[vl-layer]: https://vega.github.io/vega-lite/docs/layer.html
[vl-resolve]: https://vega.github.io/vega-lite/docs/resolve.html
[dw-old]: https://www.datawrapper.de/blog/dualaxis/
[dw-new]: https://www.datawrapper.de/blog/dual-axis-charts
[hex-text]: https://learn.hex.tech/docs/explore-data/cells/text-cells
[hex-jinja]: https://learn.hex.tech/docs/explore-data/cells/using-jinja
[notion]: https://www.notion.com/help/writing-and-editing-basics
[lex-intro]: https://lexical.dev/docs/intro
[lex-nodes]: https://lexical.dev/docs/concepts/nodes
[lex-plugins]: https://lexical.dev/docs/react/plugins
[lex-md]: https://lexical.dev/docs/packages/lexical-markdown
[lex-rel]: https://github.com/facebook/lexical/releases
[tiptap]: https://tiptap.dev/docs/editor/getting-started/overview
[ec-53]: https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/
[ec-axis]: https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md
[ec-yaxis]: https://github.com/apache/echarts-doc/blob/master/en/option/component/y-axis.md
[ec-18876]: https://github.com/apache/echarts/issues/18876
[apg-combo]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/

**wechart files read:**
- `/Users/srajagopal/Work/wechart/docs/inputs/2026-10-18-phase-3-advanced-analytics.md`
- `/Users/srajagopal/Work/wechart/docs/design/direction.md`
- `/Users/srajagopal/Work/wechart/docs/spec.md` (AC-037, AC-116, AC-208, AC-218, AC-302, the non-goals)
- `/Users/srajagopal/Work/wechart/docs/requirements-log.md` (R67, R69)
- `/Users/srajagopal/Work/wechart/packages/charts/src/series/combo.ts`
- `/Users/srajagopal/Work/wechart/packages/recommender/src/warnings.ts`
- `/Users/srajagopal/Work/wechart/packages/recommender/src/legality.ts`
- `/Users/srajagopal/Work/wechart/packages/core/src/undrawn.ts`
- `/Users/srajagopal/Work/wechart/packages/core/src/text-tokens.ts`
- `/Users/srajagopal/Work/wechart/packages/core/src/render-spec.ts`
- `/Users/srajagopal/Work/wechart/packages/web/src/tiles/Markdown.tsx`
- `/Users/srajagopal/Work/wechart/packages/web/src/dashboard/edit/TileProperties.tsx`
- `/Users/srajagopal/Work/wechart/packages/web/src/editor/chartTypeCatalog.ts`
- `/Users/srajagopal/Work/wechart/docs/research/echarts-axis-legend-bars.md`
- `/Users/srajagopal/Work/wechart/docs/design/references-copilot.md`
