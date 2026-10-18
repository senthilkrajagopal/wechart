# Spotfire combination chart and Text Area: reference study for wechart's phase 3 combo charts and rich tiles

Date: 2026-10-18. Author: ui-researcher (Spotfire specialist). Target file: `docs/design/references-spotfire-combo-textarea.md`.

**Why this document exists.** wechart is meant to replace Spotfire for the user's organisation ([req §1][req]). The parity checklist explicitly names "text areas" ([req §3, M4][req]). Phase 3 brings in "rich tiles and combo charts", with ten open questions. Six of them concern this study ([phase-3 input][p3]):
- whether AI narrative is regenerated on refresh;
- whether rich tiles replace text tiles;
- the limit of 10 live elements per tile;
- when AC-218 should warn about a hand-picked combo;
- the limits of 8 series and 4 axes;
- whether more than one series may be split by a dimension.

This document covers Spotfire's combination chart and Text Area, a few modern comparators, and the mapping onto wechart concepts. It ends with one direction and the open questions. Spotfire markings are already covered in [references-markings.md][refs-mk] and are not repeated here.

---

## Source notes

- **Spotfire versions.**
  - "Latest" means the 15.0 Spotfire client help, `docs.tibco.com/pub/sfire-analyst/15.0.0/.../TIB_sfire_client/...`.
  - Detailed property-dialog pages come from the static 14.0.9 Analyst User's Guide. Its combination chart pages sit under the `comb/` folder.
  - Release notes come from [sf-relnotes]. The release list (15.0 latest, 14.6 LTS) is the same one cited in [refs-mk].
- **What was blocked.**
  - This session's web-search budget was used up before research began. Every page was reached by fetching documentation URLs directly and following the links on each page.
  - community.spotfire.com returned HTTP 403, as in [refs-mk].
  - Three 15.0 pages returned empty: "Adding and configuring reference elements", a JavaScript-in-text-areas page, and the 14.0.9 "properties in expressions" page. Their content comes from sibling pages instead.
  - The ideas portal can be read one idea at a time, but not searched.
- **Fetch summaries.** Some quotations came through a summarising fetch tool. Wording given in quotation marks is what the tool returned as verbatim. Anything paraphrased is not in quotation marks.
- **wechart's current state.** It was read from the files directly. `graphify query` could not be run because no shell tool was available in this session.
- **Not published in any source checked** (never invented below):
  - Spotfire's limit on the number of series, scales or Y-axes in a combination chart.
  - Spotfire's limit on the number of dynamic items or controls in a text area.
  - Default sizes for sparklines, icons and bullet graphs, beyond "limited by the edit box".
  - Default style, width and colour of reference lines.
  - How Spotfire draws a partly marked bar. This is already noted as unpublished in [refs-mk].
  - Whether "Series by" accepts (Column Names) nested with a category column.
  - Usage statistics: which Spotfire users rely on which of these features. Only the user's `.dxp` corpus can answer that (see Open questions).

---

## wechart today (the baseline this amends)

| Area | What exists | Source |
| --- | --- | --- |
| Combo rendering | `combo` is a chart type (AC-037). The first measure is drawn as bars and the rest as lines. There is **exactly one value axis**, "shared by every series". The code comment notes that per-series mark choice "the chart spec should eventually carry", for example Metabase's `series_settings.<key>.display`. | [combo.ts], [spec AC-037][spec] |
| Combo warning | AC-218: a manually chosen combo shows a warning with an icon and offers the recommended type. | [spec AC-218][spec] |
| Dual axis | AC-030 and rule 8: the recommender never proposes two value axes. The legality rule fails any candidate with `valueAxisCount > 1`. direction.md says "The inspector allows a dual axis only as an explicit override", and rule 30 says "A dual-axis (combo) chart is reachable only as a manual pick". **The override is not built:** `combo.ts` has one `yAxis`. | [legality.ts], [direction §5, rules 8, 30][dir] |
| Two metrics on different scales | R67: an unsplit bar, line or area draws the first metric only. The second metric's pill says "not drawn · on another scale" and offers Small multiples and Table. R69: "never a form that hides a metric" applies across scales only. | [req-log R67, R69][reqlog] |
| Text tile | Markdown subset: headings, emphasis, lists and line breaks. It is rendered as React nodes with **no raw HTML** (AC-208, rule 25). | [Markdown.tsx], [spec AC-208][spec], [dir rule 25][dir] |
| Live tokens | `{{marking:Name.count}}`, `{{marking:Name.summary}}`, `{{measure:cube.member}}` and `{{measure:cube.member \| marking:Name}}`. A limited measure shows all data while the marking is empty (AC-116). | [text-tokens.ts], [spec AC-116][spec] |
| Link/button tile | A label and a style. The target is another dashboard (optionally passing the current filters) or an http(s) URL. Any other scheme is rejected. | [dir §2][dir] |
| Bookmarks | Store the page tab, the filter values and the current marks (AC-121). | [spec F13][spec] |
| Parameters | Typed `{{name}}` parameters exist **only in the SQL runner**, bound as database parameters. Dashboards have none. | [req L716][req] |
| Non-goal so far | "Spotfire-style controls inside text tiles (filter dropdowns, buttons and input fields placed in the text)" were left out of phase 1 [R7]. | [req §7][req] |

---

## Products studied

| Product | Why chosen | Sources |
| --- | --- | --- |
| **Spotfire 15.0 / 14.x** (Cloud Software Group) | The product being replaced. The user and their analysts are Spotfire power users ([req §2][req]). | [sf-combo-15], [sf-comb-props-14.0], [sf-ta-15], [sf-propctl-14.0], [sf-actctl-14.0], [sf-relnotes] |
| **Power BI** (Learn pages updated 2025-10 to 2026-09) | The most common modern alternative. It has a documented combo with a secondary axis, what-if and field parameters, and narrative text with dynamic values. | [pbi-combo], [pbi-whatif], [pbi-fieldparams], [pbi-narrative] |
| **Tableau** (current help) | Per-measure mark types on dual axes, "Synchronize Axis", a documented axis limit, and parameters with parameter actions. | [t-dual], [t-params] |
| **Sigma** (current docs) | Controls are first-class page elements, referenced in formulas and SQL as parameters. This is the modern form of Spotfire's property controls. | [sigma-controls] |
| **Metabase** (wechart's own research) | Stores each series' display type and axis assignment in an engine-neutral settings object. That is the precedent for wechart's saved chart spec. | [mb-ser] |

---

## Observations per product

### Part A. Spotfire combination chart

#### A1. What it is

- "The combination chart is a visualization that combines the features of the bar chart and the line chart." "Lines are drawn on top of the bars" ([sf-combo-15]).
- **Documented examples:**
  - "compare the projected sales with the actual sales for different time periods" ([sf-combo-15]);
  - Actual vs Budget by quarter, where "the budget was exceeded a lot in Q3" ([sf-combo-create-15]);
  - "the differences in the sum of sales made by women and men" ([sf-combo-create-15]).
- **Orientation.**
  - It can be horizontal (Appearance > Horizontal, or right-click) ([sf-combo-15]).
  - 14.7 added vertical orientation "for a natural visualization of depth-oriented and height-based data, such as geological- or reservoir-measurements" (SPOT-2921, [sf-relnotes]).

#### A2. Series and "Series by"

- **What Series by does.** "Series by in the combination chart is a way to divide the data into slices … the slices … called series, can be defined as bars, or lines, as well as being colored separately" ([sf-combo-15]).
- **Two ways to set it up** ([sf-combo-create-15]):
  - **Comparing data columns.** Several columns go on the Y-axis and "the Series axis in the legend is set to (Column Names)". On creation, "no lines are drawn, only bars".
  - **Comparing categories within a column.** One column goes on Y and a categorical column on the Series axis. Each category is then set to bars or lines.
- **Constraint.** "If you have more than one column on the Y-axis, you need to series by (Column Names) to be able to display all columns in the same visualization" ([sf-comb-series-14.0]). Splitting several measures by a category at the same time is therefore not documented. Whether nesting is possible is **not published**.
- **Per-series settings.** The Series page has **Series by**, **Settings…** (continuous/categorical mode), **Series** (the list), **Type** ("displayed as bars or as a line") and **Color** ([sf-comb-series-14.0]).
- **Switching from the legend.** "click the symbol for the series … select the display option; Show as bars or Show as lines". You can also drop a column on the Color target to set Series by ([sf-combo-switch-15], [sf-comb-how-14.0]).
- **No area series.** Both 14.0.9 and 15.0 name only bars and lines ([sf-comb-series-14.0], [sf-combo-switch-15]).

#### A3. Scales and the Y-axis

- **Turning them on.** "Right-click the Y-axis and select Dual scales or Multiple Scales" ([sf-comb-how-14.0]).
- **Y-axis page** ([sf-comb-y-14.0]):
  - **Single scale.**
  - **Dual scales:** "one scale to the left in the visualization, and one scale to the right. Each scale can be shared by more than one measure … suitable, if the magnitudes of your measures vary too much to be presented on the same scale."
    - **Left scale / Right scale:** "Lists the measures displayed on the left and right scale … Use the arrows to move a measure from one scale to the other."
  - **Multiple scales:** "more than two scales on the Y-axis. By default, you get one scale for each color that is defined on the Series by axis, and the different scales can be displayed on the left as well as the right side."
    - **Individual scaling:** "one scale for each color that is defined on the Series by axis."
    - **For each trellis panel.**
  - **Position:** "Left" and "Right" for each scale.
  - **Range:** Min / Max. **Include origin:** "Always includes the value 0". **Show zoom slider.** **Show gridlines.** **Labels**, **Max number of labels**, horizontal or vertical labels. **Reverse scale.**
  - **Log scale** in the combination chart: "[Not available in this visualization.]"
- **Shared behaviour across chart types.** Scales can be shared, and "You can also make individual settings for each scale". Dual and multiple scales exist in bar, line and combination charts and scatter plots; "in combination charts, the Series by axis is used for the coloring settings" ([sf-scales-14.0], [sf-scales-15]).
- **15.0 "Adaptive" format** for continuous axes: it "adjusts the axis label time formatting to the granularity of data" (SPOT-4314, [sf-relnotes]).

#### A4. Appearance, labels, legend

- **Appearance** ([sf-comb-app-14.0]):
  - **Sort x-axis by** any series;
  - **Transparency**;
  - **Use separate color for marked items**;
  - **Side-by-side bars** or **Stacked bars**, set for the whole chart;
  - **Reverse bar segment order**;
  - **Bar width**, **Line width**, **Show line markers**, **Marker size**;
  - **Draw as step lines**, **Break lines on empty values**, **Compensate for missing values**.
- **Labels.** "Show labels for": All, **Marked rows** ("bars and lines containing marked rows only") or None. Bar labels and line-marker labels are set separately. There is also orientation and a "Max number of labels" ([sf-comb-labels-14.0]).
- **Legend.** Show, position (right or left), max values per item, which items to display, title, axis selector, horizontal values ([sf-comb-legend-14.0]).
- **Dialog pages.** The combination chart's Properties dialog has General, Data, Appearance, Formatting, Fonts, X-axis, Y-axis, Series, Actions, Labels, Tooltip, Legend, Trellis, Lines & Curves, Subsets and Show/Hide Items ([sf-comb-props-14.0]).
  - The bar chart also has **Colors** and **Error Bars** pages ([sf-bar-props-14.0]).
  - **The combination chart has no Error Bars page.**

#### A5. Markings and filters

- **Limiting.** "All visualizations can be configured to show data limited by one or more markings … Combination charts can also be limited by one or more filterings." Data from several tables is possible through column matches ([sf-combo-15]).
- **Marking.** "Click a line or a bar once to mark the line or bar". Drag to mark several, and Ctrl+click for items that aren't next to each other ([sf-comb-how-14.0]). Line marking follows the line-chart rule: "By clicking a line anywhere, the entire line is marked" ([sf-line-15]).
- **Marked-only display options.** Labels for "Marked rows" ([sf-comb-labels-14.0]) and "Use separate color for marked items" ([sf-comb-app-14.0]).
- **15.0 "Limit curve fit to marked rows."** It "performs curve fitting on only the currently marked data in a visualization" (TS-84594, [sf-relnotes]).

#### A6. Lines, curves and reference elements

- **Lines & Curves page** ([sf-comb-lc-14.0]):
  - **Visible lines and curves** (checkbox list), **Add**, **Edit**, **Remove**;
  - **More > Duplicate**: "useful if you want to add one static curve that is calculated on the whole data set";
  - **More > Export Curve Fit Result** (text file or Excel);
  - **Appearance** (colour, style, width);
  - **Place in** Foreground or Background;
  - **Transparency**;
  - **Label and Tooltip**;
  - **One per** Color and/or Trellis panel.
- **What can be added** ([sf-addline-15]):
  - Horizontal or vertical lines, which "can currently be shown in the bar chart, line chart, combination chart, scatter plot and box plot". They can sit at a fixed value, an aggregated value, a column property or a custom expression.
  - Curve draw, from an expression.
  - Curve from data table.
  - Line from column values.
  - Line from data table.
  - Caveat: "most curves can only be completely configured using the installed client."
- **Curve-fit models** ([sf-cfm-14.0]): Straight line, Logarithmic, Exponential, Power, Logistic regression, Polynomial, Gaussian, and **Holt-Winters Forecast**, which "uses … TERR". Curves are "not a fixed curve, but rather a line that can be changed … during filtering" ([sf-lc-15]).
- **Reference elements (14.6, improved in 15.0)** (SPOT-3916, SPOT-4170, [sf-relnotes], [sf-refel-15]):
  - "lines, markers, boxes, or bands" for visualizations "that have a continuous X- or Y-axis".
  - Each is calculated from "a value and, optionally, a secondary value".
  - They can be "split … by category, color, or trellising".
  - 15.0 adds layers built from independent data tables and groupings, with styling per layer.
  - Whether the combination chart is among the supported types is not stated on the pages fetched.

#### A7. Documented limits

| Limit | Source |
| --- | --- |
| Series are bars or lines only, with no area | [sf-comb-series-14.0], [sf-combo-switch-15] |
| Several Y columns require Series by = (Column Names) | [sf-comb-series-14.0] |
| No log scale in the combination chart | [sf-comb-y-14.0] |
| No Error Bars page (the bar chart has one) | [sf-comb-props-14.0], [sf-bar-props-14.0] |
| Stacked or side-by-side applies to all bar series, not per series | [sf-comb-app-14.0] |
| Scale assignment is done in a dialog (arrows between two lists) or by right-clicking the axis | [sf-comb-y-14.0], [sf-comb-how-14.0] |
| Most curves are configurable fully only in the installed client | [sf-addline-15] |
| Caps on series or scales | **Not published** |

#### A8. Who relies on what

Spotfire publishes no usage data. What is documented:
- the use cases: plan vs actual, projected vs actual, comparing categories, and depth or reservoir measurements ([sf-combo-create-15], [sf-combo-15], [sf-relnotes]);
- the audience for dual scales: "if the magnitudes of your measures vary too much" ([sf-comb-y-14.0]).

In wechart's roles ([req §2][req]):
- the **analyst/author** builds the chart and its scales;
- the **business consumer** reads it, marks it and switches nothing.

Which `.dxp` analyses use dual or multiple scales, curve fits or step lines is an open question (Q13). The planned `.dxp` inspection tool ([req §7][req]) is how to find out.

### Part B. Spotfire Text Area

#### B1. What it is and how it's authored

- **Purpose.** "a space where you can add information such as the purpose of a page, or maybe state the observations you have made" ([sf-ta-15]).
- **Content types** ([sf-ta-15]):
  - formatted text;
  - images (GIF, BMP, PNG, JPG);
  - web links;
  - **action controls**;
  - **property controls**, which let "other people control what to show in a visualization, even if they do not have authoring rights";
  - **filters**;
  - **dynamic items**, "small 'visualizations' that can live within a text area".
- **"Text areas must be authored in the installed client."** The same sentence appears on the text area, add/edit, actions and dynamic-item pages ([sf-ta-15], [sf-taedit-15], [sf-actions-ta-15], [sf-dyn-15]).
  - Calculated values, icons and bullet graphs each say the same about themselves ([sf-cv-15], [sf-icons-15], [sf-bullet-15]).
- **The WYSIWYG toolbar** ([sf-tatool-15]):
  - cut, copy and paste;
  - **Font** and **Size**, both free choice;
  - bold, italic, underline, text colour;
  - left, centre and right alignment;
  - numbered and bulleted lists, indent and outdent;
  - insert image, insert and remove link;
  - background colour and background image;
  - **Filter**, **Action**, **Property control** and **Dynamic item**;
  - **Edit HTML**.

#### B2. HTML, sanitiser and JavaScript

- **Edit HTML.** "The HTML sanitizer is switched on (true) by default." The WYSIWYG editor "can sometimes add or remove changes to the HTML that you have not expected, depending on its PerformHtmlSanitation preference setting". Once you edit HTML directly, "it is recommended to continue using this method" ([sf-edithtml-15]).
- **Supported HTML** ([sf-html-15]):
  - **Allowed:** text formatting, headings, `p`/`div`/`blockquote`/`pre`, lists, tables, `img`, `a`, `span`, `font`, `hr`, `br`, `code`. Common attributes `style`, `class`, `id`, `dir` and `lang` are allowed.
  - **Not listed:** `script`, `iframe`, `style`, `input`, `button`, `sup`, `sub`.
  - **Links:** an `href` must be http, https, mailto or tibcospotfire, a file URL to `.htm`/`.html`, or an anchor.
  - **Images:** `img src` "must refer to an image that has been included in the text area".
  - **Style values:** these "must not contain parentheses, colons or escape sequences", except `rgb (n,n,n)`.
- **JavaScript.** It is added through the Insert JavaScript dialog ([sf-edithtml-15]). The example-scripts page warns ([sf-js-15]):
  - "Spotfire provides no guarantee whatsoever of the correctness, usability or compatibility of the libraries in scope" (jQuery and jQueryUI);
  - "JavaScript parameters can only be of the type String";
  - future versions may ship incompatible libraries.

#### B3. Dynamic items

| Item | What it is | Data and limiting | Source |
| --- | --- | --- | --- |
| **Calculated value** | "derived from some kind of aggregated expression, similar to the data shown in cross tables". Optional colour and font **rules**: "rules are prioritized from top to bottom". Number formatting on its own page. "The text color cannot be set using the Format Control dialog. Text color is instead defined by rules." | Limited by markings, filtering or an expression, or "locked to show fixed values" | [sf-cv-15], [sf-cvhow-14.0] |
| **Sparkline** | X and Y set from a column, hierarchy or expression. "Starting point and/or End point". "Perform action on click". | Not stated on the sparkline pages. The general rule below applies. | [sf-spark-14.0], [sf-spark-15] |
| **Icon** | "Icons need at least one defined rule for anything to be visible". Size is limited by the edit box. | Markings, filtering, expression, or fixed | [sf-icons-15] |
| **Bullet graph** | "compare one value, represented by a horizontal bar, to another value, represented by a vertical line, and relate those to qualitative ranges". It has Min/Max ("If left blank, the range will automatically adjust"), **Set to Current Range**, **Include origin**, and background colour ranges. | Markings, filtering, expression, or fixed | [sf-bullet-15] |

- **The general rule.** Dynamic items "can also be limited by markings in other visualizations, similar to details visualizations" ([sf-text-7.0]).
- **Calculated Value Settings > Data** ([sf-cv-14.0]):
  - **Marking:** "[Not applicable for calculated values in text area.]" A text-area item can be limited by markings but cannot itself mark.
  - **Limit data using markings**, with "Rows must be included in" **All markings (AND)** or **Any marking (OR)**.
  - **"If no items are marked in the master visualizations, show":** only **All data** or **Empty visualization**. Details visualizations have a third option, a message.
  - **Limit data using filterings** (per filtering scheme), **Limit data using expression**, and a streaming time range.
- **Actions on dynamic items.** "Actions can be defined so that something happens when you click a dynamic item in a graphical table or a text area" ([sf-itemactions-15]).

#### B4. Property controls and document properties

- **Control types** ([sf-propctl-14.0], [sf-propctl-15]):
  - **Label**
  - **Input field**
  - **Input field (multiple lines)**
  - **Drop-down list**
  - **List box**
  - **List box (multiple select)**
  - **Slider**
- **What a control binds to.** A **document**, **data table** or **column** property ([sf-propctl-14.0]).
- **Where the values come from:** **Column selection**, **Unique values in column**, **Expressions** ("Available for string properties only"), **Fixed values** or **Numerical range** ([sf-propctl-15]).
  - "Include (None) alternative" is available.
  - "You cannot display more than 1000 values in a property control" ([sf-propctl-14.0]).
- **What document properties are.** They "apply to the whole document and are often used as a variable value … in calculations, for selections of certain values, or directly in visualizations as target values" ([sf-props-15]).
- **Expression syntax** ([sf-propexpr-15]):
  - `${MyProperty}` is text substitution, done as "a preprocessing step".
  - `DocumentProperty("ExchangeRate")*[Value Column]` uses the property as a value.
  - Helpers: `$esc()`, `$map()` for list-valued properties, and `$csearch()`.
- **Properties on axes.** "Only string properties can be used on axes, where the string value of the property will be interpreted as a column name or a column expression" ([sf-useprops-15]).
  - This is the classic "pick the measure from a drop-down" pattern.
  - Properties also drive action and on-demand parameters, lines and curves, and calculated expressions.
  - "If a property used in expressions is updated, the property will be updated in all currently used locations" ([sf-useprops-15]).
- **Script on change.** "Script – Act on Property Change … a script action that should be performed whenever the document property changes its value" ([sf-docprops-props-14.0], [sf-scripts-15]).

#### B5. Action controls

- **Forms.** A **Link**, **Button** or **Image** ([sf-actions-ta-15], [sf-actctl-14.0]).
- **Kinds of action** ([sf-actions-ta-15], [sf-actctl-14.0]):
  - **Actions:** "displaying or hiding panels, performing various operations on marked rows, applies bookmarks or switches pages", and navigating to visualizations. Named functions include "Reset All Visible Filters", "Mark all filtered rows", "Filter to marked rows" and "Refresh data functions". "Multiple actions of this type can be performed in just one click."
  - **Script**, which needs script-author permission.
  - **Export Report** to PDF.
  - **Data Function** refresh.
- **Notes on the dialog** ([sf-actctl-14.0]):
  - Bookmarks: "The active visualization always takes precedence over the active page".
  - Marked-rows operations use "the marking … used by the active data table".
  - "Scripts cannot be used in a TIBCO Cloud Spotfire web client environment".
- **Trust** ([sf-scripts-15]):
  - Scripts not created by you are "Not trusted" until reviewed.
  - On-premises web clients run only scripts from "trusted action mods" or saved as trusted by a Script Author.
- **Action mods** ([sf-actionmods-15], [sf-flyout-15]):
  - They package scripts that "run … in a sandboxed environment".
  - They are shared through the library, and resaving one updates every analysis that uses it.
  - They can be run from an **Actions flyout**, from visualization triggers or from text-area controls.

#### B6. Filters in a text area

- "If you only want to display a few filters in your analysis, you can add those filters to a text area" ([sf-text-7.0]).
- The Insert Filter dialog picks the **Filtering scheme** ("Only available if more than one filtering scheme have been defined") and the **Filter** ([sf-insfilter-14.0]).
- An inserted filter acts on a filtering scheme, the same state the filters panel shows.

#### B7. Known pain points (documented)

1. **Desktop-only authoring.** The text area and every dynamic item "must be authored in the installed client" ([sf-ta-15], [sf-dyn-15], [sf-cv-15]). This is exactly the problem wechart exists to remove: "Analyst work needs the installed client … the web client can't do everything the desktop can" ([req §1][req]).
2. **A fragile HTML route.** The WYSIWYG editor may rewrite hand-edited HTML. Style values can't contain parentheses or colons. Authors are told to stick to one editing route ([sf-edithtml-15], [sf-html-15]).
3. **Unsupported JavaScript.** The libraries in scope come with "no guarantee whatsoever". Parameters are strings only, and libraries may change between versions ([sf-js-15]).
4. **Script trust and client gaps.** Scripts don't run in the Cloud web client. On-premises they run only when trusted ([sf-actctl-14.0], [sf-scripts-15]).
5. **Interactivity hidden in scripts.** Reacting to a change means "Act on Property Change" scripts ([sf-docprops-props-14.0]). Reacting to a marking change needs a data-function workaround ([sf-blog-trigger], via [refs-mk]).
6. **Formatting conflicts.**
   - A font style from Format Control is "added to the calculated value on top of any font style included in a rule" ([sf-taedit-15]).
   - Text colour can be set only through rules ([sf-cvhow-14.0]).
   - Icons show nothing until a rule exists ([sf-icons-15]).
7. **No nothing-marked message for calculated values.** They offer only All data or Empty ([sf-cv-14.0]).
8. **A 1,000-value cap** on property controls ([sf-propctl-14.0]).
9. **Free font and size choice** ([sf-tatool-15]). Every author picks their own type ramp. That is a consistency problem for wechart's 12 px floor and fixed scale ([dir §3][dir]).

#### B8. What users depend on

- **Documented purposes:**
  - explaining the purpose of a page and recording observations ([sf-ta-15]);
  - giving non-authors control over visualizations through property controls ([sf-ta-15]);
  - "write instructions about the analysis" and helpful text on buttons ([sf-webprep-15]);
  - KPI-style figures "limited by markings" ([sf-text-7.0]).
- **How often the user's analyses use each one** is **not published**. See Q13.

### Part C. Modern comparators (briefly)

- **Power BI combo** ([pbi-combo]):
  - "Combo charts can have one or two Y axes." There are two types, "Line and stacked column" and "Line and clustered column". A field is moved to the secondary axis by dragging it into the **Line y-axis** well.
  - "The secondary y-axis … automatically shows or hides by default if its data range sufficiently overlaps with the primary". You can force it on or off.
  - To sync the axes, set the secondary axis range to Auto and turn its values off.
  - The combo "cross-highlights and cross-filters".
- **Power BI what-if parameters** ([pbi-whatif]):
  - New parameter > Numeric range creates a table, an auto-created measure and, optionally, a slicer. The parameter has Min, Max and Increment.
  - "Parameters can have at most 1,000 unique values". They are "designed for measures within visuals".
- **Power BI field parameters** ([pbi-fieldparams]):
  - "let report readers dynamically change the measures or dimensions they're analyzing". A slicer lists the fields, and measures and dimensions can be mixed.
  - There's no "none" option: "Selecting no fields … is the same as selecting all fields."
- **Power BI narrative, Custom mode** ([pbi-narrative]):
  - Dynamic values are inserted with **+ Value**: a field or measure, a summarisation, an optional filter and formatting.
  - "A summary is dynamic. It automatically updates the generated text and dynamic values when you cross-filter."
  - Custom mode "generates up to four summaries per visual and up to 16 per page".
  - A Copilot mode generates text with AI.
- **Tableau** ([t-dual], [t-params]):
  - Dual axes are made by dragging to the right edge of the view. "Synchronize Axis" sits on the secondary axis's menu, and "you can customize the mark type for each distinct measure".
  - "You can add up to four layered axes: two on the Columns shelf and two on the Rows shelf." Blended axes share one scale.
  - A parameter is "a workbook variable … that can replace a constant value in a calculation, filter, or reference line". Allowable values are All, List or Range, and the control can be a slider, list or type-in.
  - Parameter actions set a parameter "by clicking or selecting a mark".
- **Sigma** ([sigma-controls]):
  - Controls include list values (up to 200 displayed), text, number, slider, range slider, date, date range, Top N, switch, checkbox, segmented, legend, hierarchy and drill down.
  - Each has a control ID that can be referenced in formulas and SQL, and controls can be synced across pages.
- **Metabase** ([mb-ser]): per-series colour, line style, marker, **axis assignment** and **display type** live in `visualization_settings.series_settings[<series key>]`.

---

## Part D. What a Spotfire migrant expects first, and where Spotfire is dated

### D1. Expected first (ordered by how directly the parity checklist exposes it)

1. **Flip any series between bars and lines from the legend**, with no trip to a dialog ([sf-combo-switch-15]). wechart fixes the first measure as bars ([combo.ts]).
2. **Dual scales and "one scale per series"**, with each scale on the left or right and its own Min/Max and Include origin ([sf-comb-y-14.0]). wechart has one axis and drops the second metric (R67) ([reqlog]).
3. **Plan-vs-actual and target lines.** Horizontal lines at fixed, aggregated or expression values, and curve fits including Holt-Winters ([sf-addline-15], [sf-cfm-14.0]).
4. **Marking a bar or a whole line in a combo,** and "Show labels for: Marked rows" ([sf-comb-how-14.0], [sf-line-15], [sf-comb-labels-14.0]).
5. **Calculated values in text limited by marking.** wechart has this as AC-116 tokens ([spec][spec]).
6. **A drop-down that swaps the measure on an axis** (a string document property on the axis) and an input field or slider for a what-if value ([sf-useprops-15], [sf-propexpr-15]).
7. **Buttons that apply a bookmark, switch page or "Reset All Visible Filters"** ([sf-actctl-14.0]).
8. **A few filters placed inside the text,** next to the explanation ([sf-text-7.0]).
9. **Sparklines, traffic-light icons and bullet graphs next to the prose** ([sf-dyn-15]).

### D2. Where Spotfire is dated, and what better looks like (concrete)

| Spotfire today | Better, with evidence |
| --- | --- |
| Text areas are authored only in the installed client ([sf-ta-15]). | Author in the browser, in the dashboard's edit mode, where wechart's tiles are already edited (AC-302, [spec][spec]). |
| Free font and size per run ([sf-tatool-15]). | Typed blocks on wechart's type scale: headings, body and a "large value" style. This keeps the 12 px floor and the scale ([dir §3][dir]). |
| Raw HTML through a sanitiser that rewrites edits, and jQuery scripts with "no guarantee" ([sf-edithtml-15], [sf-js-15]). | No HTML and no scripts. Every live element is a typed block that React renders, as wechart's Markdown tile already does ([Markdown.tsx], rule 25). |
| Dual scales assigned by moving measures between two lists with arrows ([sf-comb-y-14.0]). | Drag a series to a right-axis well, as Power BI's Line y-axis well works ([pbi-combo]), or onto the right edge of the chart, as Tableau does ([t-dual]). Also a per-series legend menu with "Bars / Line / Area" and "Left axis / Right axis / Own axis". |
| A secondary axis that Power BI shows or hides on its own ([pbi-combo]). | Explicit **Synchronize axes** (Tableau, [t-dual]). The chart never changes its axes without the author knowing. |
| Interactivity through IronPython "Act on Property Change" scripts and trust dialogs ([sf-docprops-props-14.0], [sf-scripts-15]). | Declarative bindings: a control sets a parameter or a filter, and anything that reads it updates. This is the Sigma and Tableau model ([sigma-controls], [t-params]). |
| Calculated values have no nothing-marked message ([sf-cv-14.0]). | Reuse wechart's details-tile message for live blocks (rule 33, [dir][dir]). |
| Text colour only through rules; icons blank until a rule exists ([sf-cvhow-14.0], [sf-icons-15]). | Conditional formatting on the block, with a visible default state. |
| Bars and lines only; no log scale; no error bars in combos ([sf-comb-series-14.0], [sf-comb-y-14.0], [sf-comb-props-14.0]). | Area as a series mark (Metabase stores a per-series display type, [mb-ser]). Whether log scale and error bars are wanted is Q11. |
| Stacked or side-by-side is chart-wide ([sf-comb-app-14.0]). | A stack group per series is possible in the spec. Whether to offer it is part of Q3. |

---

## Part E. Mapping Spotfire concepts onto wechart

| Spotfire | wechart today | Mapping | New concept needed? |
| --- | --- | --- | --- |
| **Series by** and per-series Type and Color ([sf-comb-series-14.0]) | Combo: first measure bars, rest lines ([combo.ts]) | Chart spec gains per-series `mark` (bar, line, area) and `axis`, keyed by series, as Metabase does ([mb-ser]) | **Yes**: per-series settings in the engine-neutral spec |
| **Dual / Multiple scales**, Left/Right, individual scale settings ([sf-comb-y-14.0]) | One axis (AC-030 bans recommending more; rule 30 allows a manual override, not built) ([legality.ts], [dir][dir]) | Named value axes (left and right, ordered), each with Min/Max, Include origin, format and gridlines. AC-030 still holds: Auto never proposes them. | **Yes**: value axes in the spec. Amends R67 and AC-218 |
| **Lines & Curves**, reference elements ([sf-comb-lc-14.0], [sf-refel-15]) | Customize section "Reference lines" planned in [refs-dash] | Reference lines and bands at a fixed value, an aggregate of a measure, or a parameter. Curve fits come in phase 3 stage A ([p3]). | Partly. Curve fits are stage A. |
| **Document property** as a value (`DocumentProperty()`) ([sf-propexpr-15]) | None on dashboards. SQL runner parameters only ([req L716][req]) | **Dashboard parameter**: typed (number, date, text, boolean), with a default, a min/max/step and a control. How its value reaches a Cube measure is unverified (research item R3). | **Yes**: the phase 3 "what-if parameters" question ([p3]) |
| **Document property** as a column name on an axis ([sf-useprops-15]) | None | **Field switch**: a parameter whose values are Cube members, used in a chart well. It needs no Cube change because a member is just a name in the query (Power BI's field parameter, [pbi-fieldparams]). | **Yes**, a parameter of kind "member" |
| **Property control** (drop-down, list box, input, slider, label) ([sf-propctl-14.0]) | None | Control blocks in the rich tile, bound to a parameter. A "Label" is a parameter token. | Yes, with the parameter |
| **Filter in a text area** (a filtering scheme) ([sf-insfilter-14.0]) | Filter bar; dashboard, tab and tile filter scopes ([spec][spec], [refs-mk]) | A filter block bound to an existing dashboard filter: **the same state as the filter bar**, not a copy | No new state. Spotfire's **filtering schemes** (named, alternative filter states) have no wechart equivalent: see Q8 |
| **Action control**: page, bookmark, reset filters, marked-rows operations, export ([sf-actctl-14.0]) | Link/button tile: dashboard or URL ([dir][dir]); bookmarks (AC-121); Filter to/out marked (AC-113) | Declarative actions on a button or link block: go to page tab, apply bookmark, open dashboard (passing filters), URL, reset filters, set parameter, marked-rows operations, export | Small: an **action list** on the button |
| **Script action**, Act on Property Change, action mods ([sf-scripts-15], [sf-actionmods-15]) | No script runtime (phase 1 non-goal, [refs-mk] C-table) | **Drop**. Declarative bindings cover the documented uses. Code runs only as phase 3 stage B data functions ([p3]). | No |
| **Data function refresh** action ([sf-actctl-14.0]) | None | Phase 3 stage B ([p3]) | Belongs to stage B |
| **Dynamic items** limited by markings ([sf-cv-14.0], [sf-text-7.0]) | AC-116 measure tokens with `marking:` | Extend to sparkline, icon and bullet blocks, with the same AND/OR and nothing-marked options as details tiles | Extension of an existing concept |
| **Calculated value rules** ([sf-cvhow-14.0]) | None | Conditional formatting on a value block: thresholds to a status colour, plus an icon so the state is not shown by colour alone ([dir][dir] WCAG rule) | Yes: block conditional formatting |
| **Markings** | Built ([refs-mk], AC-084 … AC-116) | Combo series mark by item. A line marks whole, as in Spotfire ([sf-line-15]). "Limit curve fit to marked rows" ([sf-relnotes]) is a stage A option. | No |
| **Bookmarks**, which capture "properties" ([sf-bm-add-15]) | Tab, filters, marks (AC-121) | Bookmarks also capture parameter values | Amends AC-121 when parameters exist |

---

## Cross-product patterns

**Shared by most of the products**
- One or two Y axes, each series with its own mark type: Spotfire, Power BI, Tableau, Metabase ([sf-comb-y-14.0], [pbi-combo], [t-dual], [mb-ser]).
- A way to put both axes on one scale: Tableau's Synchronize, Power BI's sync procedure, Spotfire's Single scale.
- Typed variables set by a control and read by measures and reference lines: Spotfire document properties, Power BI what-if, Tableau parameters, Sigma controls.
- Live values inside text that follow filtering or marking: Spotfire calculated values, Power BI narrative dynamic values.

**Only in Spotfire**
- **Multiple scales:** one per series, on either side ([sf-comb-y-14.0]).
- Curve fits on a combo, with one curve per colour or trellis panel ([sf-comb-lc-14.0]).
- Marking-limited dynamic items with AND/OR ([sf-cv-14.0]).
- Sparkline, icon and bullet graph as inline text items ([sf-dyn-15]).
- Text-area HTML and scripts. The other products studied don't offer them.

**Only in Power BI**
- A secondary axis that shows or hides automatically.
- Field parameters as a separate parameter kind.
- A per-page cap on generated summaries.

**Only in Tableau**
- A documented cap of four layered axes, two per shelf.

**Only in Sigma**
- Controls referenced by ID from formulas and SQL, and synced across pages.

---

## Must keep / should modernise / can drop

| Spotfire feature | Decision | Why (user value, correctness, fit) |
| --- | --- | --- |
| Per-series bars or lines, switchable from the legend ([sf-combo-switch-15]) | **Must keep** | The core of the combination chart for plan-vs-actual work. Add **area** as a third mark. |
| Series by (Column Names) for several measures ([sf-comb-series-14.0]) | **Must keep** | It is the default way several measures become series. |
| Series by a category column ([sf-combo-create-15]) | **Must keep** | A documented use case (sales by gender). |
| Dual scales with Left/Right assignment ([sf-comb-y-14.0]) | **Must keep, modernise the assignment** | Drag between axis wells or use the legend menu instead of arrows between two lists. |
| Multiple scales, one per series ([sf-comb-y-14.0]) | **Must keep** | Spotfire users use it for measures "of very different magnitudes" (Spotfire's words). The cap is Q2. |
| Per-scale Min/Max, Include origin, gridlines, labels, reverse, zoom slider ([sf-comb-y-14.0]) | **Must keep** | These are the axis settings wechart already customises per axis ([req §6][req]). |
| Single-scale option and **Synchronize axes** ([t-dual]) | **Should modernise** (add Synchronize) | Spotfire has no "same scale, two labelled sides" toggle in the pages checked. Tableau's is explicit. |
| Power BI's auto-hidden secondary axis ([pbi-combo]) | **Reject** | Axes would change without the author knowing. |
| Stacked or side-by-side bars ([sf-comb-app-14.0]) | **Must keep** (chart-wide); per-series stacking is Q3 | Documented appearance setting. |
| Step lines, break on empty, sort by series, transparency, markers ([sf-comb-app-14.0]) | **Must keep** | Each is a documented appearance option. |
| Show labels for: All / Marked rows / None ([sf-comb-labels-14.0]) | **Must keep** | Consistent with the marking model ([refs-mk]). |
| Mark a bar; clicking a line marks it whole ([sf-comb-how-14.0], [sf-line-15]) | **Must keep** | Marking parity. |
| Horizontal, vertical and expression lines; One per color or trellis ([sf-addline-15], [sf-comb-lc-14.0]) | **Must keep** | Targets and thresholds on combos. |
| Curve fits, Holt-Winters, "Limit curve fit to marked rows" ([sf-cfm-14.0], [sf-relnotes]) | **Must keep, in phase 3 stage A** | [p3] places curve fits and forecasting in stage A. |
| Reference bands, boxes and markers (14.6/15.0) ([sf-refel-15]) | **Should modernise**: bands at least | A current Spotfire feature, shared with Tableau's reference bands ([t-params]). |
| Horizontal and vertical orientation ([sf-combo-15], [sf-relnotes]) | **Should keep** | Vertical serves depth data (SPOT-2921). Whether the user's data needs it is part of Q13. |
| Log scale and error bars, absent from Spotfire's combination chart | **Open** (Q11) | Spotfire users have never had them on combos. |
| Text area authored only in the installed client ([sf-ta-15]) | **Drop** | wechart authors in the browser. This is the problem in [req §1][req]. |
| Free fonts and sizes ([sf-tatool-15]) | **Should modernise** to typed styles | Keeps the 12 px floor and the type scale ([dir §3][dir]). |
| Edit HTML, sanitiser, JavaScript ([sf-edithtml-15], [sf-html-15], [sf-js-15]) | **Drop** | Rule 25 and AC-208 forbid raw HTML. Spotfire itself bans `script`, `iframe` and `style` tags and gives JavaScript no guarantee. |
| Images, links, headings, lists, tables in text ([sf-html-15]) | **Must keep** (tables as a Markdown table block) | Standard prose content. Images and links already exist as tiles ([dir][dir]). |
| Calculated value limited by markings, AND/OR ([sf-cv-14.0]) | **Must keep** (built as AC-116) | It extends to every live block. |
| Calculated value nothing-marked: All data or Empty ([sf-cv-14.0]) | **Should modernise**: add the Message option | Brings it in line with details tiles (rule 33). |
| Calculated value rules for colour and font ([sf-cvhow-14.0]) | **Should modernise** to block conditional formatting with icon plus colour | Never colour alone. |
| Sparkline, icon, bullet graph ([sf-dyn-15]) | **Must keep** as typed blocks | Part of the parity checklist ("text areas", M4). |
| Property controls: drop-down, list box, multi-select, input, multi-line input, slider, label ([sf-propctl-14.0]) | **Must keep** as control blocks bound to a parameter | They let non-authors change what is shown ([sf-ta-15]). |
| Column-selection property on an axis ([sf-useprops-15]) | **Must keep**, as a field switch | The classic "choose the measure" pattern. Needs no Cube change. |
| Document properties as values in expressions ([sf-propexpr-15]) | **Must keep, pending Q7 and research R3** | This is the what-if parameter. Whether Cube can take a value into a measure is unverified. |
| `${}` text preprocessing, `$esc`, `$csearch` ([sf-propexpr-15]) | **Drop** | wechart has no expression language in the client. Members are typed names. |
| Filters inside text ([sf-insfilter-14.0]) | **Must keep** as a filter block sharing the filter bar's state | Placing filters next to the prose is documented. |
| Filtering schemes ([sf-insfilter-14.0]) | **Open** (Q8) | wechart has scopes, not named schemes. |
| Action buttons, links and images: page, bookmark, reset filters, marked-rows operations, export ([sf-actctl-14.0]) | **Must keep**, declaratively | It extends the Link/button tile. |
| Several actions in one click ([sf-actions-ta-15]) | **Should keep** | A documented capability. The action list is ordered. |
| Script actions, Act on Property Change, action mods ([sf-scripts-15], [sf-actionmods-15]) | **Drop** | Trust model, no Cloud web-client support, and no script runtime in wechart. Code belongs to stage B data functions ([p3]). |
| Data-function refresh action ([sf-actctl-14.0]) | **Defer to stage B** | Depends on data functions. |
| Clicking a dynamic item runs an action ([sf-itemactions-15]) | **Should keep** | For example, a value block that opens a page tab or applies a bookmark. |
| 1,000-value cap on property controls ([sf-propctl-14.0]) | **Open** (part of Q6) | Power BI caps what-if at 1,000 values ([pbi-whatif]). Sigma lists up to 200 ([sigma-controls]). |

---

## Direction: wechart keeps Spotfire's combination-chart and Text Area capabilities and vocabulary, but delivers them as browser-authored, typed, declarative blocks. The combo chart gives every series its own mark (bar, line or area) and its own value axis, assigned by drag or from the legend. The rich text tile's live elements are typed blocks (calculated value, sparkline, icon, bullet graph, parameter control, filter, action button), bound to markings, filters and a new dashboard-parameter object, with no HTML, JavaScript or scripts.

### Reasoning

**User fit**
- The user and analysts are Spotfire power users with no SQL ([req §2][req]).
- M1 (50 `.dxp` analyses signed off) and M4 (the parity checklist, including text areas) need the capabilities themselves: dual and multiple scales, per-series marks, lines and curves, marking-limited dynamic items, property controls and action buttons ([sf-comb-y-14.0], [sf-comb-lc-14.0], [sf-cv-14.0], [sf-propctl-14.0], [sf-actctl-14.0]).
- Spotfire's wording is kept as wechart already keeps it for markings: Series by, Dual scales, Multiple scales, Include origin, Show labels for: Marked rows, Limit data using markings ([req R7 decision 1][req]).

**Roles and criteria served**
- **Analyst/author:** builds combos with the right scales and authors rich tiles in the browser. This amends AC-218, R67 and R69, and extends AC-116 and AC-302.
- **Business consumer:** changes parameters and filters, and presses actions, without authoring rights. Spotfire documents this as the point of property controls ([sf-ta-15]).
- **Semantic-layer engineer:** decides whether and how a numeric parameter can reach a measure (research item R3).

**Correctness**
- **Typed blocks keep AC-208's "no raw HTML" by construction** ([Markdown.tsx]). They remove the documented failure modes: sanitiser rewrites, unsupported jQuery, string-only JavaScript parameters, and script trust ([sf-edithtml-15], [sf-js-15], [sf-scripts-15]).
- **Declarative bindings replace "Act on Property Change" scripts.** A change of parameter or filter is state that bookmarks and URLs can capture, which a script's side effect is not.
- **Per-series mark and axis belong in the engine-neutral spec,** as Metabase stores them ([mb-ser]). That keeps CLAUDE.md's rule that chart definitions are data, not renderer code.
- **AC-030 stays.** Auto never proposes two axes ([legality.ts]). Extra axes exist only in a combo the author chose, which is direction rule 30's intent ([dir][dir]).

**References drawn on**
- **Spotfire:** capabilities and terms.
- **Power BI:** axis wells for assigning the secondary axis, what-if and field parameters, and dynamic values that follow cross-filtering ([pbi-combo], [pbi-whatif], [pbi-fieldparams], [pbi-narrative]).
- **Tableau:** explicit Synchronize Axis, per-measure mark type, the four-axis precedent, and parameter actions ([t-dual], [t-params]).
- **Sigma:** controls as first-class, ID-addressable elements read by formulas ([sigma-controls]).
- **Metabase:** per-series settings in the saved spec ([mb-ser]).

### What this direction rejects

- **Raw HTML, CSS and JavaScript in text tiles,** even sanitised. Spotfire's own sanitiser bans `script`, `iframe` and `style`, may rewrite edits, and gives JavaScript "no guarantee whatsoever" ([sf-html-15], [sf-edithtml-15], [sf-js-15]). wechart's rule 25 and AC-208 already forbid it.
- **IronPython or JavaScript script actions and property-change scripts.** They don't run in Spotfire's own Cloud web client, need a trust workflow, and hide state in side effects ([sf-actctl-14.0], [sf-scripts-15]). Code enters wechart only as phase 3 stage B data functions ([p3]).
- **Desktop-only or dialog-only authoring.** Text areas and their items "must be authored in the installed client" ([sf-ta-15]), and scale assignment uses arrows between lists ([sf-comb-y-14.0]).
- **Free fonts and sizes per text run** ([sf-tatool-15]). They break the 12 px floor and the fixed scale ([dir §3][dir]).
- **Power BI's automatic show/hide of the secondary axis** ([pbi-combo]). Axes must not change without the author knowing.
- **Keeping the combo at one axis and dropping the second metric** (today's R67 behaviour inside a manually chosen combo). A Spotfire user who picks a combo for "magnitudes [that] vary too much" ([sf-comb-y-14.0]) loses the metric they asked for.
- **Text substitution of properties (`${}`, `$esc`, `$csearch`)** ([sf-propexpr-15]). Typed parameters and member references replace string preprocessing.
- **A separate filter state for filters placed in text.** A filter block shares the filter bar's state, so chips, bookmarks and the URL stay the single truth.

### Tokens to derive

| Token | Value | Provenance |
| --- | --- | --- |
| Rich tile body | `text-sm` 14/20, weight 400 | [dir §3][dir] (Markdown body) |
| Rich tile headings | `text-md` 16/22, `text-lg` 20/26 and `text-xl` 24/32, all 600, under the tile's h3…h6 outline | [dir §3][dir], [Markdown.tsx] |
| Value block "large" style | `text-kpi` 32/40, 600, `tnum` | [dir §3][dir]. Spotfire publishes no calculated-value size; its toolbar allows any size ([sf-tatool-15]) |
| Inline value block | Body size, `tnum`, 600 | [dir §3][dir] (numerals and weights) |
| Control blocks (drop-down, input, slider) | 32 px default, 28 px compact | [dir §4][dir] |
| Action button block | Reuse the Link/button tile styles (Button, Primary, Text link) | [dir §2][dir] |
| Sparkline block size | **Not published** by Spotfire. Derive the height from the body line height (20 px) and test it. | [sf-spark-14.0] |
| Bullet graph block size | **Not published**. Derive it. | [sf-bullet-15] |
| Icon block | **Not published**. Spotfire limits it by the edit box. Pair every state colour with a shape. | [sf-icons-15], WCAG rule in [dir][dir] |
| Block spacing | 8 px between inline blocks, 16 px between paragraphs | [dir §4][dir] spacing scale; tile padding 16 px |
| Series colours | The 8 categorical slots, in fixed order | [dir §5][dir]. Wechart's 8-colour cap ([req §5][req]) |
| Series marks | Bars: 2 px surface gap, 4 px rounded data-ends, max 36 px wide. Lines: 2 px. Markers: at least 8 px. | [dir §5][dir], [combo.ts] (`BAR_MAX_PX`) |
| Area mark fill opacity | **Not published** by Spotfire, which has no combo area. Derive it so that bars behind remain readable. | — |
| Axis ownership cue | The series' own swatch next to each axis title. No new colour role. | Derived. Spotfire shows axis selectors per scale ([sf-comb-legend-14.0]) |
| Value axes per combo | Spotfire: **not published** (one per series in Multiple scales). Tableau: 4 layered, 2 per shelf. Power BI: 2. Proposed 4: Q2. | [sf-comb-y-14.0], [t-dual], [pbi-combo], [p3] |
| Series per combo | Proposed 8, equal to the categorical slots: Q2 | [p3], [dir §5][dir] |
| Reference line style | Spotfire lets the author set colour, style and width; defaults **not published**. Labels at `text-xs` 12/16. | [sf-comb-lc-14.0], [dir §3][dir] |
| Marking on combos | Reuse `mk1…mk4`: fade 0.28, outline 1.5 px | [dir §5][dir], [refs-mk] |
| Live elements per rich tile | Proposed 10: Q6. Spotfire: **not published**. | [p3] |

---

## Open questions for the user (with candidate answers)

1. **Area as a combo series mark?** Spotfire's combination chart has bars and lines only ([sf-comb-series-14.0]).
   - (a) Bars, line and area. *Recommended:* wechart already draws area charts, and per-series display is a spec field ([mb-ser]).
   - (b) Bars and line only, matching Spotfire exactly.
2. **Limits: 8 series and 4 axes?** Spotfire publishes no cap, and Multiple scales gives one per series ([sf-comb-y-14.0]). Tableau caps at 4 layered axes ([t-dual]). Power BI allows 2 ([pbi-combo]).
   - (a) 8 series, 4 axes (2 left, 2 right). *Recommended:* it matches the 8 validated colour slots and Tableau's documented cap.
   - (b) 8 series, one axis per series, as Spotfire's Multiple scales does.
   - (c) 8 series, 2 axes, as Power BI does.
3. **May more than one series be split by a dimension?** Spotfire documents only (Column Names) when several measures are on Y ([sf-comb-series-14.0]).
   - (a) One split dimension for the whole chart, applying to every measure, so series = measure × category, capped by Q2. *Recommended:* it covers both documented setups.
   - (b) A different split per measure (for example bars by region, line unsplit).
   - (c) Spotfire's rule: a split only when there is one measure.
4. **When should AC-218 warn about a hand-picked combo?**
   - (a) Only while it has more than one value axis that isn't synchronized, with "Synchronize axes" and "Small multiples" as fixes. *Recommended:* a single-axis combo has nothing to warn about. AC-030 keeps Auto from proposing extra axes.
   - (b) Always, as today.
   - (c) Never.
5. **Do rich tiles replace text tiles?**
   - (a) Yes. The text tile becomes the rich tile, existing Markdown and tokens become its first blocks, and AC-116 tokens keep working. *Recommended:* one place for prose and live values, as in Spotfire's single text area ([sf-ta-15]).
   - (b) Keep both tile kinds.
6. **10 live elements per tile, and the value cap for a list control?** Spotfire publishes no element cap. Its property controls cap at 1,000 values ([sf-propctl-14.0]), Power BI what-if at 1,000 ([pbi-whatif]), and Sigma lists show 200 ([sigma-controls]).
   - (a) 10 elements, and controls with a searchable list up to 1,000 values. *Recommended:* Spotfire parity on values.
   - (b) 10 elements, 200 values.
   - (c) No element cap.
7. **Dashboard parameters (Spotfire document properties): in scope for phase 3?**
   - (a) Both kinds: a member kind (field switch, needing no Cube change) and value kinds (number, date, text, boolean) for what-if, the latter subject to research R3. *Recommended:* this covers both documented Spotfire uses ([sf-useprops-15], [sf-propexpr-15]).
   - (b) Field switch only.
   - (c) None in phase 3.
8. **Spotfire filtering schemes** (named alternative filter states, chosen per filter block or per calculated value, [sf-insfilter-14.0], [sf-cv-14.0]):
   - (a) Not needed; wechart's dashboard, tab and tile scopes suffice. *Recommended unless your `.dxp` files use them.*
   - (b) Add named filter states.
9. **Scripts:**
   - (a) None. Declarative actions only, and code only as stage B data functions. *Recommended.*
   - (b) Allow sandboxed user scripts, as Spotfire's action mods do ([sf-actionmods-15]).
10. **AI-written narrative: regenerated on refresh?** Power BI's narrative updates its text and values when you cross-filter ([pbi-narrative]).
    - (a) Typed value blocks always live; AI prose regenerated only on request, stamped with the data time it describes. *Recommended:* prose that changes silently can contradict its own values.
    - (b) Regenerated on every refresh and filter change.
    - (c) Written once and never regenerated.
11. **Log scale and error bars on combos?** Spotfire's combination chart has neither ([sf-comb-y-14.0], [sf-comb-props-14.0]).
    - (a) Log scale per axis, and error bars deferred to stage A statistics. *Recommended.*
    - (b) Neither, matching Spotfire exactly.
12. **Curve fits in stage A: which models first?** Spotfire offers Straight line, Logarithmic, Exponential, Power, Logistic regression, Polynomial, Gaussian and Holt-Winters ([sf-cfm-14.0]).
    - (a) All eight, with "One per color/trellis" and "Limit to marked rows". *Recommended for parity.*
    - (b) A subset chosen from the `.dxp` corpus.
13. **What do your `.dxp` analyses actually use?** Spotfire publishes no usage data. The planned `.dxp` inspection tool ([req §7][req]) could count:
    - dual or multiple scales;
    - vertical combos;
    - curve fits;
    - text-area HTML or JavaScript;
    - property controls by type;
    - script actions;
    - filters in text areas;
    - filtering schemes.

    Should the phase 3 interview wait for those counts?

## Research items for component-research (not user questions)

- **R1. ECharts:**
  - several `yAxis` entries with offsets on both sides;
  - per-series `yAxisIndex`;
  - a stack group per series;
  - `markLine` and `markArea` for reference lines and bands;
  - how marking hit-testing ([itemsShape]) handles several y-axes.

  wechart's marking code already reads `yAxisIndex` (`packages/charts/src/interaction/itemsInShape.ts`).
- **R2. Spec migration:** existing combo specs (first measure bars, the rest lines, one axis) must read back unchanged under per-series settings.
- **R3. Cube:** how a dashboard parameter's value can reach a measure. Candidates to verify are `FILTER_PARAMS` on a parameter dimension, or a query-time member. Verify against `docs/research/cube/` and the xcube fork before promising what-if.
- **R4. Pre-aggregations:** whether a field switch or a parameter-driven filter still matches rollups ([pre-aggs]).

---

## Link references

[req]: ../requirements.md
[reqlog]: ../requirements-log.md
[spec]: ../spec.md
[dir]: ./direction.md
[refs-mk]: ./references-markings.md
[refs-dash]: ./references-dashboard-authoring.md
[p3]: ../inputs/2026-10-18-phase-3-advanced-analytics.md
[mb-ser]: ../research/metabase-card-serialization.md
[pre-aggs]: ../research/cube/pre-aggregations.md
[combo.ts]: ../../packages/charts/src/series/combo.ts
[legality.ts]: ../../packages/recommender/src/legality.ts
[Markdown.tsx]: ../../packages/web/src/tiles/Markdown.tsx
[text-tokens.ts]: ../../packages/core/src/text-tokens.ts
[itemsShape]: ../../packages/charts/src/interaction/itemsInShape.ts
[sf-relnotes]: https://releasenotes.spotfire.com/
[sf-combo-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/combination_chart.html
[sf-combo-create-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/creating_a_combination_chart.html
[sf-combo-switch-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/switching_between_bars_and_line_series.html
[sf-scales-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adjusting_scales_on_axes.html
[sf-comb-props-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_chart_properties.htm
[sf-comb-series-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_series.htm
[sf-comb-y-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_y_axis.htm
[sf-comb-how-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_how_to_use_the_combination_chart.htm
[sf-comb-app-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_appearance.htm
[sf-comb-labels-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_labels.htm
[sf-comb-legend-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_legend.htm
[sf-comb-lc-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/comb/comb_properties_lines_curves.htm
[sf-scales-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_using_more_than_one_scale_on_an_axis.htm
[sf-bar-props-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_chart_properties.htm
[sf-cfm-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/curve/curve_curve_fit_models.htm
[sf-lc-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/lines_and_curves.html
[sf-addline-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_a_line_or_curve.html
[sf-refel-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/reference_elements.html
[sf-line-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking_in_line_charts.html
[sf-ta-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/text_area.html
[sf-taedit-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_or_editing_a_text_area.html
[sf-tatool-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/edit_text_area_toolbar.html
[sf-edithtml-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/edit_html.html
[sf-html-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/supported_html_in_the_text_area.html
[sf-js-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/java_script_example_scripts.html
[sf-dyn-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_dynamic_item_text_area.html
[sf-cv-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/calculated_values.html
[sf-cv-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/cv/cv_settings_data.htm
[sf-cvhow-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/cv/cv_how_to_use_calculated_values.htm
[sf-spark-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/sparklines.html
[sf-spark-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/spark/spark_how_to_use_sparklines.htm
[sf-icons-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/icons.html
[sf-bullet-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/bullet_graphs.html
[sf-propctl-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_a_property_control_to_a_text_area.html
[sf-propctl-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/text/text_details_on_property_control.htm
[sf-actions-ta-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_actions_to_a_text_area.html
[sf-actctl-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/text/text_details_on_action_control.htm
[sf-insfilter-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/text/text_details_on_insert_filter.htm
[sf-text-7.0]: https://docs.tibco.com/pub/spotfire/7.0.1/doc/html/text/text_how_to_use_the_text_area.htm
[sf-props-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/doc_col_and_dt_properties.html
[sf-useprops-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/using_properties_in_an_analysis.html
[sf-propexpr-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/properties_in_expressions.html
[sf-docprops-props-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/other/other_details_on_document_properties_properties.htm
[sf-scripts-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/managing_scripts_in_spotfire.html
[sf-actionmods-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/action_mods.html
[sf-flyout-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/the_actions_flyout.html
[sf-itemactions-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_actions_performed_when_clicking_on_visualization_items.html
[sf-webprep-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/preparing_analyses_for_spotfire_web_clients.html
[sf-bm-add-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_a_bookmark.html
[sf-blog-trigger]: https://spotfired.blogspot.com/2015/10/update-doc-property-trigger-ironpython.html
[pbi-combo]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-combo-chart
[pbi-whatif]: https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-what-if
[pbi-fieldparams]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-field-parameters
[pbi-narrative]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative
[t-dual]: https://help.tableau.com/current/pro/desktop/en-us/multiple_measures.htm
[t-params]: https://help.tableau.com/current/pro/desktop/en-us/parameters_create.htm
[sigma-controls]: https://help.sigmacomputing.com/docs/intro-to-control-elements

---

**Notes for the caller (not part of the file):**
- I had no shell tool, so I couldn't run `graphify query "combo chart"` or `graphify query "text tile"`. Instead I read these files directly:
  - `/Users/srajagopal/Work/wechart/packages/charts/src/series/combo.ts`
  - `/Users/srajagopal/Work/wechart/packages/recommender/src/legality.ts`
  - `/Users/srajagopal/Work/wechart/packages/web/src/tiles/Markdown.tsx`
  - `/Users/srajagopal/Work/wechart/packages/core/src/text-tokens.ts`
  - `/Users/srajagopal/Work/wechart/docs/spec.md` (AC-030, AC-037, AC-116, AC-121, AC-208, AC-218)
  - `/Users/srajagopal/Work/wechart/docs/requirements.md`
  - `/Users/srajagopal/Work/wechart/docs/requirements-log.md` (R67, R69)
  - `/Users/srajagopal/Work/wechart/docs/design/direction.md`
- **A discrepancy for whoever plans phase 3.** direction.md (§5 and rule 30) says the inspector allows a dual axis as a manual override with a warning. `combo.ts` builds exactly one axis and has no override.
- **Search budget.** The session's web-search budget was used up before research began, so every source was fetched by URL. community.spotfire.com still returns 403.