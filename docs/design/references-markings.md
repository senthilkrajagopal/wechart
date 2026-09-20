# Spotfire markings: reference study and recommended marking model for wechart

Date: 2026-09-19. Author: ui-researcher. Target file: `docs/design/references-markings.md`.

**Why this document exists.** The user is a Spotfire power user. They clarified that "markdown (spotfire)" in `docs/inputs/2026-09-19-product-direction.md` §2 meant Spotfire **markings**. This document covers three things:

- **Part A:** Spotfire markings, in full.
- **Part B:** how Qlik Sense, Tableau, Power BI, Superset, Looker and Grafana handle selection.
- **Part C:** one recommended marking model for wechart. wechart is a React + ECharts front end on Cube, a live semantic layer.

**Inputs and roles.**

- User roles are still provisional: analyst/author, semantic-layer engineer, business consumer.
- No acceptance criteria exist yet, so inputs are cited with the IN labels from `references.md`.
- **IN-2b** is read as clarified: "cross table filters … trellis (spotfire), markdown (spotfire)", where "markdown" means markings.

---

## Sources notes

**Spotfire versions covered.**

- **Current releases:**
  - 15.0 is the latest (July 2026, Innovation).
  - 14.8 (April 2026) and 14.7 (December 2025) are Innovation releases.
  - 14.6 is the current LTS (October 2025).
  - 14.0 LTS dates from November 2023.

  ([sf-lts])

- **Latest help pages.** The 15.0 and 14.8 "Spotfire client" help renders statically under `docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/*.html`, and the same path under `14.8.0`. Those pages are the "latest" sources here.
- **Empty pages.** The `docs.tibco.com/pub/sfire-cloud/...` pages render client-side and came back empty.
- **Older property pages.** Detailed dialog pages come from the static 14.0.9 Analyst User's Guide (`.../14.0.9/.../TIB_sfire-analyst_UsersGuide/...htm`). Where 15.0 wording differs, both are quoted.
- **API references:**
  - .NET API reference 15.0, built 2026-07-02 ([api-dms])
  - Web Player JavaScript API 12.2 ([js-setmarking])
  - Mods API, the current npm declaration file ([mods-api])
- **Release notes:** [sf-relnotes] (15.0, 14.8) and [sf-rn-12.5] (the 12.5 PDF).

**What was blocked.**

- These returned HTTP 403: community.spotfire.com, community.tibco.com, support.revvitysignals.com and oreilly.com. Claims that rest only on their search-result text are marked **(excerpt)**.
- The official `LimitingMarkingsEmptyBehavior` enum page came back empty. Its member names come from the third-party IronPython reference sf-ref.com ([sfref]), and are labeled as such.
- The search budget ran out late in the session. The "Reset All Markings" command is known only from a community article title ([sf-reset]).

**Not published in any source checked** (never invented below):

- the default marking color
- how strongly unmarked items fade
- the width and color of the marked outline
- exactly how Spotfire draws a partially marked aggregated item (for example, a bar where only some of the rows are marked)
- the default "nothing marked" option for a new details visualization
- whether the web client supports the full keyboard marking table

**Internal sources** (Cube behavior was verified in earlier research):

- `/Users/srajagopal/Work/wechart/docs/research/cube/data-apis.md`: filters, and/or groups, `ungrouped`, the `inDateRange` caveat
- `/Users/srajagopal/Work/wechart/docs/research/cube/pre-aggregations.md`: matching rules
- `/Users/srajagopal/Work/wechart/docs/research/cube/data-modeling.md`: `aggType` values in `/v1/meta`

---

## Corrections to existing design docs

| Where                               | Current text                                                                                    | Correction                                                                                                                                                                                                                                                                                                                                                                                                          | Source                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `references.md` L28                 | "14.7 from Dec 15, 2025 is the latest release confirmed"                                        | 15.0 (July 2026) and 14.8 (April 2026) have shipped. 14.6 remains the LTS.                                                                                                                                                                                                                                                                                                                                          | [sf-lts]                                               |
| `references.md` L88                 | "offers an empty visualization (the default), all data, or a _message on empty background_"     | **No source states a default.** The 14.0.9 Data page wording is **"If no items are marked in the master visualizations, show"** (plural), with **All data / Empty visualization / Message on empty background**. The 14.0.9 details page instead says "Message on white background / Empty / All Data". The 6.5 master-detail page only implies that a details visualization stays empty until something is marked. | [sf-bardata-14.0], [sf-details-14.0], [sf-md-6.5]      |
| `references.md` L84                 | "authors can switch it to 'Any marking'"                                                        | The exact UI is **"Rows must be included in: All markings (AND) / Any marking (OR)"**.                                                                                                                                                                                                                                                                                                                              | [sf-bardata-14.0]                                      |
| `references.md` L635 (open point 2) | Asks whether "Markdown (Spotfire)" meant Markdown or text areas                                 | Resolved: the user meant **markings**. The Markdown tile stays, but it is not what this requirement is about.                                                                                                                                                                                                                                                                                                       | user clarification                                     |
| `direction.md` §7                   | "Shift-click adds to the selection"                                                             | This conflicts with Spotfire, where Ctrl+click toggles and **Shift+click selects a range in tables**. It also conflicts with Power BI (Ctrl+click), Looker (Cmd/Ctrl) and Tableau (Ctrl/Cmd).                                                                                                                                                                                                                       | [sf-mark-14.0], [p-multiselect], [l-cross], [t-select] |
| `direction.md` §6                   | Legend "click toggles a series"                                                                 | This conflicts with Spotfire, where clicking a category in the legend **marks** it. Looker (a legend click cross-filters) and Qlik (legend selection) behave like Spotfire.                                                                                                                                                                                                                                         | [sf-legend-15], [l-cross], [q-types]                   |
| `direction.md` §5                   | One `crossfilter / marking` color token                                                         | Spotfire markings are **named, and each has its own color**. The default rendering keeps each item's own color and fades the unmarked items. One token can't represent several markings.                                                                                                                                                                                                                            | [sf-docprops-14.0], [sf-marking-14.8]                  |
| `direction.md` principle 3, rule 13 | "cross-filters the other tiles on the same tab"                                                 | A Spotfire marking spans **all pages of the analysis**. Its default effect in other visualizations is **marking (brushing), not filtering**. Filtering happens only in visualizations limited by the marking (details visualizations).                                                                                                                                                                              | [sf-marking-14.8], [sf-across-15], [sf-limit-15]       |
| `direction.md` §7                   | "clear-selection rule configurable per dashboard: keep filtered, show all, show none (Tableau)" | Spotfire sets the empty-marking behavior **per details visualization** (All data / Empty visualization / Message). It has no "keep filtered" state.                                                                                                                                                                                                                                                                 | [sf-bardata-14.0]                                      |
| `direction.md` rule 32              | Interactions matrix, default Filter                                                             | Superseded by Part C, pending the user's approval.                                                                                                                                                                                                                                                                                                                                                                  | Part C                                                 |

---

## Part A: Spotfire markings

### A1. Why markings exist and how analysts use them

**What Spotfire itself says**

- **Definition:** "The action of marking visualization items means selecting parts of the data that you find of certain interest to examine in more detail, or to work at in various ways." ([sf-marking-15])
- **Purpose:** "view details for the item, or to distinguish rows in order to tag, copy, delete, or in other ways manipulate them." ([sf-mark-14.0])
- **12.5 release notes:** "Markings in Spotfire are visual representations of user-selected data in visualizations … Markings can be used to perform a variety of operations in Spotfire, such as highlighting selected data points, filtering data, and linking multiple visualizations together." ([sf-rn-12.5], SPOT-2161)
- **Two design principles in a TIBCO knowledge-base article:**
  - "When marking is performed in one visualization, all other visualizations shall indicate which rows are marked, translated to the graphics specific for each visualization. This behavior is sometimes called brush-linking."
  - Marking is shown "as granularly as possible so that it corresponds to the graphical elements that the user interacted with."

  ([sf-kb-marking])

- **Documented use cases:** exploring data across visualizations, displaying item details, creating drill-down details visualizations, and grouping categories. ([sf-marking-14.8])

**Documented uses, with how each works**

| Use                                                         | Mechanism                                                                                                                                                                                                                   | Source                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Brushing and linking**                                    | Marking a bar marks the underlying rows, so every visualization that uses the same marking shows those rows as marked. "To interplay, the visualizations must have the same marking applied."                               | [sf-across-15]                                                            |
| **Master–detail drill-down**                                | "Marking in one visualization defines the data of the next visualization, making it possible to drill down in level of detail." A details visualization can itself be the master for the next level.                        | [sf-md-6.5], [sf-drill-10.10], [sf-details-14.0]                          |
| **Details-on-demand**                                       | Shows "the actual values of marked items in the active visualization".                                                                                                                                                      | [dod-14.0]                                                                |
| **Subset calculations (text and KPIs)**                     | Calculated values in text areas take "Limit data using markings", combined with AND/OR.                                                                                                                                     | [sf-cv-14.0], [sf-text-7.0]                                               |
| **Comparing a subset with the whole**                       | The (Subsets) axis can compare All data, Current filtering, and marking subsets. A marking subset can use "Use the complement of this subset" and "Deactivate highlighting/marking for this subset".                        | [sf-subsets-14.0], [sf-msubset-14.0]                                      |
| **Driving calculations** (TERR / R / Python data functions) | Inputs can be limited by "Marked rows". With "Refresh function automatically" on, the function reruns whenever its inputs change.                                                                                           | [sf-df-10.10], [sf-df-11.4]                                               |
| **Driving data loading**                                    | On-demand tables take input from "Values from column" with "Marked rows", and "Load automatically" reloads them.                                                                                                            | [sf-ondemand-14.0], [sf-input-14.0]                                       |
| **Tagging and lists**                                       | "Attach Tag to Marked Rows" and "Mark Tagged Rows in Active Visualization". Lists offer "Mark Items" and "New List from Marked..." (excerpt), and keep "marking selections that persist from session to session" (excerpt). | [sf-tagsh-14.0], [sf-listsmark-6.5], [sf-listsnew-7.0], [sf-primer-lists] |
| **Regrouping categories**                                   | "Group from marked categories" builds a new grouped column from the marked categories (excerpt).                                                                                                                            | [sf-group-14.3]                                                           |
| **Changing axes from a marking**                            | "Column from marked" reads column names from marked cells and "continuously update[s] the visualization".                                                                                                                   | [sf-colmarked-15]                                                         |
| **Narratives**                                              | Arria narratives respond to "Limit data using markings".                                                                                                                                                                    | [arria]                                                                   |
| **Time-series and root-cause work**                         | 15.0 range-based marking selects "bounded ranges of any kind of continuous data such as time or depth", which is "particularly powerful … when doing intensive time series analysis and root cause investigation".          | [sf-relnotes] SPOT-4509                                                   |
| **Dense comparison across panels**                          | 14.8 lets users mark a whole trellis panel or page from its header. The notes name wafer maps, batch analysis and regional breakdowns.                                                                                      | [sf-relnotes] SPOT-3926                                                   |
| **Scripting and embedding**                                 | IronPython and the JavaScript API can read and set markings (A2.9). A community workaround triggers scripts on marking change: a data function writes to a document property.                                               | [api-dms], [js-setmarking], [sf-blog-trigger]                             |

**Outlier investigation** isn't named as a use case in the sources checked. The mechanisms that support it are documented: lasso marking, tagging marked rows, and Filter out.

A training book calls marking "one of the most important Spotfire concepts" with two aspects, "the visual effect" and "the behavior that follows marking" ([sf-primer], excerpt).

### A2. Complete feature surface

#### A2.1 Data model

- **Rows, per data table.** "Marking in Spotfire is expressed per data table and has a resolution of rows … there is no concept of marking parts of a row." ([sf-kb-marking])
- **Marking a visual item marks its rows.** "When you mark items in a visualization, you in fact mark the underlying data … If any marked data row is part of an item in another visualization, this item also becomes marked." ([sf-across-15])
- **Symbolic or index-based.** "Spotfire tries to find a symbolic representation of the selection you make when marking data, whenever this is possible."
  - Categories marked in aggregated visualizations pick up new matching rows after a data reload.
  - Binary and Currency columns always use index-based marking in memory.
  - "When you are working with external data (in-db) from a data connector, you will always use symbolic marking."

  ([sf-reapply-15])

- **API.**
  - `DataMarkingSelection` is "a DataSelection representing a marking of rows in the DataTables". It has `Color`, `Name` and `SetSelection`, and each selection is stored per `DataTable`. ([api-dms])
  - **Since 14.5**, `SetSelection(string whereClause, DataTable)` takes "An expression string with conditions for the data columns used to set the marking" ([api-setsel-where]).
  - `TryGetSelectionExpression` returns a selection as an expression, and fails "when the selection includes index sets" ([api-trygetexpr]).
  - Spotfire itself therefore supports predicate-defined markings.

#### A2.2 How to mark

**Keyboard and mouse, 14.0 Analyst** ([sf-mark-14.0]). The wording is verbatim.

| Action                         | Effect                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mouseover item                 | "Highlight item."                                                                                                                                                    |
| Click on item                  | "Mark clicked item and unmark all other items."                                                                                                                      |
| Ctrl + click on item           | "Toggle mark for clicked item. Leave other items as is."                                                                                                             |
| Shift + click                  | "Useful in table visualizations, where you mark all items between the previously marked item and the clicked item. All other items are unmarked."                    |
| Ctrl + Shift + click           | "…mark all items between the clicked item and the previously marked item. Other items are left as is."                                                               |
| Alt + click                    | "…click on a column header or row header in the cross table to mark the entire column or row."                                                                       |
| Click and drag                 | "Mark items within the drawn rectangle and unmark all other items."                                                                                                  |
| Alt + click and drag           | "Mark items within the drawn area of any shape and unmark all other items." (lasso)                                                                                  |
| Ctrl + click and drag          | "If none of the items in the drawn rectangle are marked, they are added … If all items … are marked, they are unmarked. If some … the unmarked items will be added." |
| Ctrl + Alt + click and drag    | The same add-or-toggle rule, for a lasso.                                                                                                                            |
| Shift + click and drag         | "Marks the entire line in a line chart if the drawn rectangle contains parts of the line."                                                                           |
| Arrow keys                     | "Mark the first item above/below/left/right of the previously marked item and unmark all other items."                                                               |
| Shift + Arrow keys             | "Extend the set of marked items … unless the next item is already marked."                                                                                           |
| Ctrl + Arrow keys              | "Move highlight up/down/left/right." (moves focus without marking)                                                                                                   |
| Space / Ctrl + Space           | "Mark the highlighted item. Unmark other items." / "Toggle mark for highlighted item."                                                                               |
| Ctrl + A / Ctrl + E / Ctrl + I | "Mark all the filtered rows." / "Unmark all the marked rows." / "Invert the current marking."                                                                        |
| Del                            | "Delete all the marked rows."                                                                                                                                        |
| Ctrl + M / Ctrl + Shift + M    | "Filter to the marked rows." / "Filter out the marked rows."                                                                                                         |

**How 15.0 describes the same gestures** ([sf-items-15]):

- "Ctrl + click an item – adds or subtracts items".
- "Ctrl + drag rectangle – adds items within the rectangle that are not already marked".
- "Ctrl + Alt + draw a shape … toggles items within the shape to the opposite of marked/unmarked". This contradicts the 14.0 table.
- The Mods API names the 14.0 rule `ToggleOrAdd`: it "will behave like toggle if all or no rows in the set are marked, otherwise it is an add operation. This is the default Spotfire behavior for control marking." ([mods-api])

**Other ways to mark**

- **Axis marking.** "Click the scale label area and drag along any of the axes – marks all items between the two axis values." In bar charts, "Only those bars with the top part of the bar included within the axis marking rectangle will be marked." ([sf-items-15])
- **Legend marking.**
  - Clicking a category marks all of its items. Ctrl+click adds more categories.
  - "Click the category text, not the symbol."
  - Categories that aren't marked are "grayed out in the legend".
  - It works only on categorical color, shape and series axes: "The legend cannot be used to mark items on axes with numerical data (unless a coloring rule has been applied)."

  ([sf-legend-15])

- **Line charts.** "By clicking a line anywhere, the entire line is marked." A rectangle or lasso marks part of a line. "If data points next to each other on the line are included, the points and the line between the points are marked." ([sf-line-15])
- **Trellis headers (14.8).** Clicking a panel or page header marks all of its data. Ctrl+click adds more panels. ([sf-relnotes] SPOT-3926)
- **Range-based marking (15.0).**
  - To turn it on: View > Markings, open the marking's menu, then **Marking mode > Range-based**. This needs the Industry Pro license feature "Add and configure range-based marking" and Editing mode.
  - Gestures:
    - Drag along the axis to mark.
    - Ctrl+drag adds a range.
    - Ctrl+click inside a range splits it.
    - Drag the indicator to move a range; Ctrl+drag the indicator to duplicate it.
    - Drag an endpoint to resize.
  - "The marked range is visualized with a colored stripe along the axis." It "does not take active filtering and data limitations into consideration."
  - Tags and lists can't apply range markings.

  ([sf-range-15])
  - First-release limits: one table only, and not supported in Table or Parallel Coordinate Plot ([sf-relnotes] SPOT-4509).
  - A hotfix, TS-85972, covers "Range marking sometimes does not work when using data limiting" ([sf-hotfix], excerpt).

- **Map chart.** Rectangle, lasso and radius (circle) marking modes. Shift temporarily switches to radius and Alt to lasso. ([sf-map-15], [api-mapmode])
- **Tables.** Lasso isn't available in table visualizations ([sf-mark-6.5]). With in-db data, table marking needs a primary key ([sf-indb-14.0]).
- **Touch, old Web Player docs.** Tapping marks one item. For lasso: "Touch the screen next to an item … hold until a gray circle is shown … then draw a shape." "You cannot add more items to a current marking." ([sf-touch], excerpt, 5.x/6.5 era; no current page found)
- **Unmarking.** Click an empty area, right-click **Marked rows > Unmark**, or Ctrl+re-mark. ([sf-unmark-15])

#### A2.3 Named markings

- **Name and color.** "A marking is what specifies the color of marked items from one or more data tables." ([sf-docprops-14.0])
- **Document Properties > Markings:**
  - **Available markings**, **New**, **Edit** (name and color), **Delete**, **Set as Default**.
  - Set as Default makes that marking "the marking that is used when new visualizations are created".
  - Delete: "If any visualizations use the deleted marking, they will be set to not allow marking."

  ([sf-docprops-14.0], [sf-docprops-10.10])

- **Markings panel (12.5 and later), View > Markings:**
  - Add, edit and remove markings "both in the installed client and the web client".
  - See "the number of visualizations that are using or are limited by a specific marking".
  - "Jump directly to a visualization."

  ([sf-rn-12.5])
  - In 15.0 you click the color icon to recolor a marking and double-click its name to rename it. Adding a marking needs an author license and Editing mode. ([sf-newmark-15])

- **Default name.** The default marking is named "Marking" (IronPython `Document.Data.Markings["Marking"]`, excerpt) ([sf-ipy-default]).
- **Which marking a visualization uses.** Properties > Data > **Marking**: "Specifies the marking (that is, the color and relationships to other marked items) that will be used to mark items in this visualization." ([sf-bardata-14.0])
- **A visualization can use no marking.**
  - The legend's Marking drop-down offers "(None)" ([sf-across-15]).
  - In the API: "If the marking reference is set to null (the default), no marking will be displayed … and the user cannot mark anything. Note that if the marking reference is also present in Filterings, the user will not be able to mark anything either." So a visualization can't be limited by the marking it marks with. ([api-markref])

#### A2.4 Scope and propagation

- **Scope.** A marking belongs to the whole document and spans pages. `DataManager.Markings` holds every marking ([api-markings]). Marking "affects all visualizations using that same data and marking across the analysis" ([sf-marking-14.8]).
- **Per table.** "Setting a marking in one data table does not affect the marking of unrelated data tables." Each marking keeps "its own marking color." ([sf-mark-14.0])
- **Related tables.** "When data tables are related, marking is always carried over." Relations match rows on key columns, or on expressions built from them. ([sf-rel-15])
- **Column matches don't carry marking.** "Marking and filtering is still individual for each data table, even if they have columns matching between them." ([sf-tables-15])
- **Choosing the table for a new details visualization.** The Create Details Visualization dialog offers "Related data table for new visualization", and the relation must exist first ([sf-details-14.0], [sf-createdetails-14.0]).
- **Which marking an operation uses.** For tags, "the active visualization defines which marking to get the marked rows from" ([sf-tags-14.0]). In the API, `Document.ActiveMarkingSelectionReference` is "the active marking of the active Visual" ([api-active]).

#### A2.5 Visual rendering

- **Default.** "Marked items retain original colors with dark outlines, while unmarked items fade out." ([sf-marking-14.8])
- **Alternative: "Use separate color for marked items"** (Appearance page). It uses "the specified marking color to distinguish marked items. If the check box is cleared, then unmarked items will be faded out instead, and the original color will be kept for the marked items." ([sf-barapp-14.0])
  - The 14.0 marking page explains when to use each: a separate color when "it is important to distinguish all marked items and see them as a group"; fading "when the color of the marked items is important" ([sf-mark-14.0]).
- **Labels.** "Show labels for": "All", "Marked rows" (bars containing marked rows only), or "None" ([sf-barlabels-14.0]).
- **Legend.** Categories that aren't marked are shown gray ([sf-legend-15]).
- **Range markings** show as a colored stripe along the axis ([sf-range-15]).
- **Partial marking of aggregated items.**
  - A bar can contain both marked and unmarked rows ("bars containing marked rows"; row-level marking).
  - Spotfire promises to show marking "as granularly as possible", but doesn't publish how a partly marked bar, pie sector, cell or point is drawn. **Not published.**
  - The knowledge-base article notes that two identically configured visualizations can show "different graphical elements as marked" when each row produces several elements, for example "(Column Names)" on trellis. After some undo sequences, Spotfire falls back to "showing the marking based only on the set of marked rows".

  ([sf-kb-marking])

- **Other display options.** None are documented beyond color and fade. An Ideas-portal request (Feb 2023, "Future Consideration") asks for size or shape emphasis on marked points. The suggested workaround is Subsets ([sf-idea]).
- **Highlighting is separate from marking.** Hovering highlights an item and shows a tooltip; it doesn't mark ([sf-hl-14.0]).

#### A2.6 Limiting data using markings (details visualizations)

All labels below are verbatim from Properties > Data, 14.0.9 ([sf-bardata-14.0]):

- **"Limit data using markings"**: "Lists the available markings that can be used to limit what is shown in the visualization." Several markings can be checked, and there is a **New** button.
- **"Rows must be included in"**:
  - **"All markings (AND)"**, which gives "the intersection".
  - **"Any marking (OR)"**, which gives "the union".
  - Intersection is the default when more than one marking is used ([sf-limiting-14.0]).
- **"If no items are marked in the master visualizations, show"**:
  - **"All data"**
  - **"Empty visualization"**: "display only the scales and axis selectors"
  - **"Message on empty background"**, where the message should "let anyone know in which visualizations to mark items to view details" ([sf-nomark-10.10])
- **Combining with other limits.** "The result will be Marking limiting AND Filtering limiting AND Expression limiting." ([sf-limiting-14.0])
- **Creating one.** Right-click a visualization and choose **Create Details Visualization**, then the visualization type. You can also convert any existing visualization on the Data page. "The most common use case of limiting data by markings is drilling down into details visualizations." ([sf-details-14.0], [sf-limit-15])
- **API.**
  - `VisualizationData.Filterings`: "add one or more marking selections to the collection" to make a details visualization ([api-filterings]).
  - `MarkingCombinationMethod` ([api-combine]).
  - `LimitingMarkingsEmptyBehavior` ([api-empty]), with members `ShowAll`, `ShowEmpty` and `ShowMessage`, and `LimitingMarkingsEmptyMessage` (member names from [sfref], third-party).

#### A2.7 Marked rows menu and operations

| Operation                                                        | Spotfire behavior                                                                                                                                                                                                                   | Source                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Marked Rows > Filter To / Filter Out** (Ctrl+M / Ctrl+Shift+M) | Creates a column "Filtered to at..." (or "Filtered out at...") with the values Yes and No, plus a check-box filter. In-memory tables only.                                                                                          | [sf-mark-14.0], [sf-mark-6.5]                          |
| Filter To / Out disabled                                         | Disabled when the data is external (in-db), or when filters are set to "Manage manually".                                                                                                                                           | [sf-kb-filterto]                                       |
| **Marked rows > Unmark** (Ctrl+E)                                | Clears the marking.                                                                                                                                                                                                                 | [sf-unmark-15]                                         |
| **Invert** (Ctrl+I) and **Mark all filtered rows** (Ctrl+A)      | Keyboard shortcuts. Whether they also appear in the menu isn't documented in the pages checked.                                                                                                                                     | [sf-mark-14.0]                                         |
| **Delete** (Del; Marked Rows > Delete, excerpt)                  | Deletes marked rows. It's a per-session feature: which rows were deleted isn't stored in the analysis (excerpt).                                                                                                                    | [sf-mark-14.0], [sf-delete]                            |
| **Copy**                                                         | "Data for marked items" copies information that identifies the marked items. "Marked rows" copies the underlying rows, and "rows that were first marked and then filtered out will also be copied". Neither works for in-db tables. | [sf-copy-14.8]                                         |
| **Tags**                                                         | "Attach Tag to Marked Rows", "Mark Tagged Rows in Active Visualization", "Mark Rows without Tags", "Remove Tags from Marked Rows". "Tags are not supported when working with in-database data."                                     | [sf-tagsh-14.0], [sf-tags-14.0]                        |
| **Lists**                                                        | "Mark Items" and "Mark Automatically". Lists persist across sessions. "New List from Marked..." (excerpt).                                                                                                                          | [sf-listsmark-6.5], [sf-lists-14.0], [sf-listsnew-7.0] |
| **Group from marked categories**                                 | Replaces the axis column with a new grouped column (excerpt).                                                                                                                                                                       | [sf-group-14.3]                                        |
| **Create Details Visualization**                                 | See A2.6.                                                                                                                                                                                                                           | [sf-details-14.0]                                      |
| **Details-on-Demand**                                            | Shows the rows behind the marked items in the active visualization, from "the main data table only".                                                                                                                                | [sf-dod-15]                                            |
| **Bookmark "Apply special" > "Mark Filtered Rows"**              | "Uses filter conditions to mark rows without changing existing filters."                                                                                                                                                            | [sf-bm-apply-15]                                       |

#### A2.8 Text areas, calculated values, expressions

- **Dynamic items** (calculated values, sparklines, icons, bullet graphs) "can also be limited by markings in other visualizations, similar to details visualizations" ([sf-text-7.0]).
- **Calculated Value Settings > Data:**
  - "Limit data using markings"
  - "Rows must be included in": All markings (AND) / Any marking (OR)
  - "If no items are marked in master visualizations, show": **All data** or **Empty visualization** only; there is no message option
  - filtering and expression limits

  ([sf-cv-14.0])
  - This is how Spotfire gets "sum of marked".

- **Expressions.** No function that reads a marking was found in the expression-language pages checked. The documented routes are data limiting, and data-function inputs limited by marked rows.

#### A2.9 Data functions, on-demand data, IronPython, JavaScript, Mods

- **Data functions:**
  - "The Limit by option allows you to limit the calculations … to rows matching a specified combination of filterings and markings … the intersection" ([sf-df-11.4]).
  - "Refresh function automatically": "update the results … automatically each time the input settings are changed" ([sf-df-11.4]).
  - "Map result to limited rows" controls where results go when inputs are limited ([sf-df-11.4]).
  - With several markings, "the intersection of the markings" is used ([sf-df-10.10]).
- **On-demand tables.** Define Input > "Values from column" with **"Marked rows"**, and "Load automatically" or a manual refresh ([sf-input-14.0], [sf-ondemand-14.0]).
- **.NET / IronPython:**
  - `DataSelectionOperation` has Replace (0), Add (1), Subtract (2), Toggle (3) and Intersect (4) ([api-dso]).
  - `SetSelection` has four overloads: a RowSelection or a where-clause string, each with or without an operation ([api-setsel]).
  - `GetSelection(DataTable)` returns a `RowSelection` ([api-getsel]).
- **Web Player JavaScript API:**
  - `setMarking(markingName, dataTableName, whereClause, markingOperation)` ([js-setmarking]).
  - `markingOperation` is REPLACE, ADD, SUBTRACT, TOGGLE, INTERSECT or CLEAR ([js-markop]).
  - `getMarking(markingName, dataTableName, dataColumnNames, maxRows, callback)` ([js-getmarking]).
  - `onChanged` listeners ([js-marking]).
- **Mods API:**
  - `DataViewRow.isMarked()`, `row.mark(operation?)`, `DataView.mark(rows, operation?)` and `clearMarking()`.
  - `marking()` returns `{colorHexCode, name}`, or null "if marking is not enabled".

  ([mods-api])

- **Triggering scripts on marking change.** This isn't native. A community pattern routes the marking through a data function into a document property ([sf-blog-trigger]).

#### A2.10 Bookmarks and sharing

- **What a bookmark captures.** Bookmark components include **"Markings: Captures which items are marked in the visualizations in the bookmark."** Filter settings, properties, page layout and the active visualization are captured separately. ([sf-bm-add-15])
- **How markings are reapplied.** Marking is reapplied symbolically: "all rows matching the marked category will be marked after data is reloaded." ([sf-bm-15])
- **Limitation.** "Bookmarks cannot capture filtering which is created using Marked rows > Filter to or Filter out." ([sf-bm-15])
- **Sharing.** Bookmark links can be copied and shared, including private bookmarks ([sf-bm-link-15]).
- **Saved files.** Markings are saved in the analysis file. Key columns let "reapply markings in unaggregated visualizations that were active when saving the file" ([sf-reapply-15]).

#### A2.11 In-database (external, live-query) data (critical for Cube)

- **Always symbolic.** In-db tables "always use symbolic marking" ([sf-reapply-15]).
- **Marking generates a query.** "When you mark items in a visualization, Spotfire will generate a query to the external data source." ([sf-indb-14.0])
- **Item limit.**
  - "Because marking of more items … results in a more complex query to the external data source, the limit will affect the number of items you can mark … The default value of the limit is 1000. This preference setting can be configured by a Spotfire administrator." ([sf-indb-14.0])
  - "Marking all items in a visualization will not result in a complex query. This means that all items can always be marked, no matter what the limit is." ([sf-indb-14.0])
  - Workaround: "add items to an existing marking by holding Ctrl or Shift … you can create markings exceeding the marking limit." ([sf-indb-10.10])
  - The preferences are named `MarkingWhereClauseLimit` and `MarkingInQueryLimit` (excerpt) ([sf-indb-pref]).
  - SQL Server rejects more than 2,100 parameters (excerpt) ([sf-indb-forum]).
  - Marking more than 50K rows to drive an on-demand table fails with an XML element limit (excerpt, article title) ([sf-50k]).
- **Other in-db restrictions:**
  - Marking in table visualizations is supported only if the view has a primary key: "A primary key is required to know which rows to mark."
  - "Marking is disabled in visualizations which you have configured with a floating point expression on a categorical axis."
  - Tables and Details-on-Demand show at most 10,000 rows by default.
  - Tags, transformations, row deletion, the summary table and the box plot aren't available.

  ([sf-indb-14.0])

- **Features that stop working on in-db data:** Filter To/Out ([sf-kb-filterto]) and copying marked rows ([sf-copy-14.8]).

#### A2.12 Performance limits and client differences

- **Limits.** The in-db item limit of 1,000 and the 10,000-row display caps are covered in A2.11. No limit for in-memory marking is published.
- **Available in both clients.** The Markings panel works in the installed and web clients ([sf-rn-12.5]). The 15.0 client docs, shared by both clients, list only the mouse gestures in A2.2 ([sf-items-15]). The full keyboard table is in the Analyst guide only ([sf-mark-14.0]). **Whether the web client supports it: not published.**
- **License-gated.** Adding markings needs "the Simple or Advanced visualization properties license feature" ([sf-newmark-15]). Range-based marking needs Industry Pro ([sf-range-15]).
- **Installed client only.** Some bookmark parts (filter organization, properties) and "Apply special" filter modes ([sf-bm-15], [sf-bm-apply-15]).

### A3. Terminology (exact Spotfire UI strings)

| String                                                                                                                                  | Where                                                                                                                                                                                              | Source                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Marking**                                                                                                                             | Properties > Data; legend drop-down, which includes **(None)**                                                                                                                                     | [sf-bardata-14.0], [sf-across-15]             |
| **Markings** (panel), **New marking**, **Marking mode > Range-based**                                                                   | View > Markings                                                                                                                                                                                    | [sf-newmark-15], [sf-range-15]                |
| **Available markings**, **New**, **Edit**, **Delete**, **Set as Default**                                                               | Document Properties > Markings                                                                                                                                                                     | [sf-docprops-14.0]                            |
| **Limit data using markings**                                                                                                           | Properties > Data                                                                                                                                                                                  | [sf-bardata-14.0]                             |
| **Rows must be included in:** **All markings (AND)** / **Any marking (OR)**                                                             | Properties > Data                                                                                                                                                                                  | [sf-bardata-14.0]                             |
| **If no items are marked in the master visualizations, show:** **All data** / **Empty visualization** / **Message on empty background** | Properties > Data (14.0.9). Variants: "…master visualization, show" and "Message on an empty background" ([sf-nomark-10.10]); "Message on white background / Empty / All Data" ([sf-details-14.0]) | [sf-bardata-14.0]                             |
| **Limit data using filterings**, **Limit data using expression**                                                                        | Properties > Data                                                                                                                                                                                  | [sf-bardata-14.0]                             |
| **Use separate color for marked items**                                                                                                 | Properties > Appearance                                                                                                                                                                            | [sf-barapp-14.0]                              |
| **Show labels for:** All / Marked rows / None                                                                                           | Properties > Labels                                                                                                                                                                                | [sf-barlabels-14.0]                           |
| **Marked Rows > Filter To / Filter Out / Unmark**; the columns **"Filtered to at..." / "Filtered out at..."**                           | Right-click menu                                                                                                                                                                                   | [sf-mark-6.5], [sf-unmark-15], [sf-mark-14.0] |
| **Create Details Visualization**; **Related data table for new visualization**                                                          | Right-click menu; dialog                                                                                                                                                                           | [sf-details-14.0]                             |
| Copy > **Data for marked items**, **Marked rows**                                                                                       | Copy menu                                                                                                                                                                                          | [sf-copy-14.8]                                |
| **Attach Tag to Marked Rows**, **Mark Tagged Rows in Active Visualization**                                                             | Tags panel                                                                                                                                                                                         | [sf-tagsh-14.0]                               |
| **Use the complement of this subset**, **Deactivate highlighting/marking for this subset**                                              | Add/Edit Marking Subset                                                                                                                                                                            | [sf-msubset-14.0]                             |
| **Limit by** … **Marked rows**; **Refresh function automatically**                                                                      | Data function parameters                                                                                                                                                                           | [sf-df-10.10], [sf-df-11.4]                   |
| **Values from column** … **Marked rows**; **Load automatically**                                                                        | On-demand Define Input                                                                                                                                                                             | [sf-input-14.0]                               |
| Bookmark component **Markings**; **Apply special**; **Mark Filtered Rows**                                                              | Bookmarks                                                                                                                                                                                          | [sf-bm-add-15], [sf-bm-apply-15]              |

---

## Part B: how comparable products do it

### Products studied

| Product                                                  | Why chosen                                                                                                                            | Sources                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Qlik Sense** (Qlik Cloud help, updated 2026-09-18)     | The other "associative" enterprise tool. It has named selection states and alternate states, the closest analog to multiple markings. | [q-states], [q-types], [q-make], [q-alt]              |
| **Tableau** (current help)                               | Separate highlight, filter and set actions; sets can be named and multi-dimensional; proportional brushing.                           | [t-highlight], [t-filter], [t-sets-actions], [t-sets] |
| **Power BI** (Learn pages updated Jul 2026)              | Cross-highlight with **partial highlighting** of aggregated bars, the per-pair interactions matrix, and drillthrough.                 | [p-interactions], [p-end-user], [p-highlight-dev]     |
| **Apache Superset** (current master source; Preset docs) | Same renderer as wechart (ECharts). Its cross-filters show a single-select, filter-only baseline.                                     | [ss-eventhandlers], [ss-preset], [ss-blog]            |
| **Looker** (page updated 2026-09-18)                     | BI on a semantic model, like wechart on Cube. Cross-filter chips.                                                                     | [l-cross]                                             |
| **Grafana** (v13 era)                                    | Briefly: dashboard-wide hover sync and click-to-filter.                                                                               | [g-settings], [g-filters-2026]                        |

### Comparison

|                                     | Qlik Sense                                                                                                                                                | Tableau                                                                                                                                                  | Power BI                                                                                                                           | Superset                                                                                  | Looker                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Selection model**                 | Click, draw, range, lasso, legend and label selections. Confirm with the check mark or by clicking outside.                                               | Click marks; rectangular, radial and lasso tools; actions on Hover, Select or Menu.                                                                      | Click a data point; cross-filters and cross-highlights by default.                                                                 | Click emits a cross-filter: an `IN` filter on the groupby columns.                        | Click a data point or legend item.                                      |
| **Named / persistent**              | Selections have history (step back/forward, excerpt) and can be locked. **Alternate states** are named Master items. Bookmarks save selections (excerpt). | **Sets** are named and saved with the workbook. Fixed sets from selected marks "can use one or multiple dimensions".                                     | Not named. Bookmarks capture "Visual selection state (such as cross-highlight filters)".                                           | Not named. Persistence not documented in the sources checked.                             | Not named, "not saved to the dashboard". Shareable by direct link.      |
| **Highlight vs filter**             | "The other visualizations are updated". In the source chart, "The other values are dimmed".                                                               | Highlight actions color the matching marks "and dim all others". Filter actions filter.                                                                  | Per pair: **Filter**, **Highlight** or **None**. Line, scatter and map visuals can only be cross-filtered.                         | Filter only.                                                                              | Filter only. The source tile grays the unselected points.               |
| **Partial highlight of aggregates** | Not documented.                                                                                                                                           | Not in highlight actions. **Proportional brushing** with a set action plus a set on Color.                                                               | **Yes.** It "dims the portion that doesn't apply". The visual receives `values` and `highlights`; highlight < value means partial. | No.                                                                                       | No.                                                                     |
| **Multi-select**                    | Click values one at a time; draw or lasso for many; Shift for lasso.                                                                                      | Ctrl/Cmd+click. Ctrl while drawing removes marks from the selection.                                                                                     | Ctrl+click. Ctrl+drag toggles; Shift+drag adds. **Keyboard rectangle select** (S, arrows, Space). Up to **3,500** points.          | **Single-select toggle** in ECharts charts ("Each chart can only emit one cross-filter"). | Cmd/Ctrl+click.                                                         |
| **Empty or cleared state**          | Clear all selections.                                                                                                                                     | Filter actions on clear: "Leave the filter / Show all values / Exclude all values". Set actions: "Keep set values / Add all values / Remove all values". | Click empty space; everything shows.                                                                                               | Empty selection removes the filter.                                                       | X on the chip, or click the point again. Cleared on entering edit mode. |
| **Cross-source**                    | Not verified in the sources checked.                                                                                                                      | Relational sources can map fields even when the names differ.                                                                                            | Through model relationships. Complex slicers can error.                                                                            | Charts that share compatible dimensions.                                                  | Same Explore only; merged results can't take part.                      |
| **Lacks vs Spotfire**               | No documented highlight-only brushing, partial marking, or per-visualization nothing-selected message.                                                    | No single named, colored, document-wide marking by default. Detail behavior is authored per action. No nothing-marked message.                           | No named selections, no multiple independent selection sets with AND/OR, no nothing-marked options, no range marking.              | No multi-select, no highlight, no names, no details state.                                | No highlight, no names, no partial.                                     |

**Sources for the table:**

- Qlik: [q-states], [q-types], [q-make], [q-lasso], [q-explore], [q-alt], [q-step], [q-bookmarks]
- Tableau: [t-select], [t-highlight], [t-highlight-adv], [t-filter], [t-sets-actions], [t-sets], [t-filtering]
- Power BI: [p-interactions], [p-filters-highlight], [p-end-user], [p-multiselect], [p-highlight-dev], [p-bookmarks]
- Superset: [ss-eventhandlers], [ss-preset], [ss-blog]
- Looker: [l-cross]

**Details worth noting**

- **Qlik selection states** ([q-states]):
  - Selected: green with a check mark
  - Possible: white
  - Alternative: light gray
  - Excluded: dark gray
  - Selected excluded: dark gray with a check mark
- **Qlik alternate states** apply to sheets or visualizations, and set expressions compare them, for example `Sum({Group1}Sales)` ([q-alt]). Lasso "only include[s] visible data points" ([q-lasso]).
- **Tableau** has "Keep Only" and "Exclude" for selected marks ([t-filtering]), and "Use as Filter" generates filter actions ([t-filter]).
- **Power BI drillthrough** navigates to a page filtered to the selected entity. It adds an automatic Back button and supports cross-report drillthrough in the same workspace ([p-drillthrough]).
- **Grafana:**
  - Its "Shared crosshair" and "Shared tooltip" sync hover across panels ([g-settings]).
  - Clicking a series label filters in or out via ad hoc "Filter and Group by", and a "Filters overview" lists all active filters ([g-filters-2026]).
  - It has no marking or brushing model.

### Cross-product patterns

**Shared by most products**

- Click to select, and Ctrl/Cmd to add or toggle: Spotfire, Tableau, Power BI, Looker.
- Unselected marks are dimmed rather than removed in the source chart: Spotfire (fade), Tableau, Qlik, Looker.
- Clicking an empty area or the same item again clears the selection: Spotfire, Power BI, Looker.
- Active selections are listed apart from standard filters: Looker's chips, Qlik's selections bar.

**Only in Spotfire**

- Multiple named, colored markings.
- A per-target details relationship with AND/OR and a nothing-marked message.
- Symbolic marking that is re-applied after reload.
- A full keyboard marking model.
- Range markings.
- Trellis-header marking.
- Marking as input to calculations.

**Only in Power BI**

- Exact partial highlighting with a documented data contract.
- A keyboard rectangle select.

**Only in Tableau**

- Multi-dimension named sets built from marks.

**Only in Qlik**

- Named alternate states that measures can compare.

---

## Part C: Recommendation for wechart

### Direction: wechart adopts Spotfire's named-marking model as its only selection mechanism. Every mark gesture edits a named, colored, dashboard-wide marking, stored as a symbolic predicate over Cube dimension members (tuples plus bounded ranges). Tiles that use a marking brush it: unmarked items fade, marked items get an outline, and partial marking is drawn exactly for additive measures. Details tiles are limited by one or more markings, with Spotfire's AND/OR and nothing-marked options. Marking chips, and an Interactions view derived from marking settings, replace ad hoc cross-filters and the per-pair matrix.

### Reasoning

**User fit**

- The user is a Spotfire power user who asked for markings by name (IN-2b).
- Spotfire's model covers every behavior they know:
  - brushing across all visualizations that share a marking ([sf-across-15])
  - details visualizations with AND/OR and a nothing-marked choice ([sf-bardata-14.0])
  - multiple named, colored markings ([sf-docprops-14.0])
  - calculated values limited by marking ([sf-cv-14.0])
  - markings saved in bookmarks ([sf-bm-add-15])
- The input also mentions migrating about 5,000 `.dxp` files (docs/inputs §3). That makes Spotfire's vocabulary and semantics a migration asset, not just a preference.

**Correctness on a live semantic layer**

- In-memory row indexes don't exist behind Cube. Spotfire itself uses symbolic marking for every external in-db table ([sf-reapply-15]).
- Since 14.5 its API sets and reads markings as where-clause expressions ([api-setsel-where], [api-trygetexpr]). The JavaScript API has done the same since at least 10.10 ([js-setmarking]).
- A predicate over Cube dimensions is the Spotfire in-db model mapped onto Cube's filter language.
  - Cube accepts nested `{or:[…]}` and `{and:[…]}` groups of dimension filters ([data-apis]).
  - Cube forbids mixing measure and dimension filters in one logical group ([data-apis]). Markings are therefore dimension-only by construction.
- One named marking is one source of truth. Chips, Markdown tokens, bookmarks, URLs and details tiles all reference it. A per-pair matrix has no named state to reference.

**References drawn on**

- **Spotfire:** the model, gestures, the details relationship, terminology and range markings.
- **Power BI:** the partial-highlight contract (a `values` array plus a `highlights` array) ([p-highlight-dev]) and the keyboard rectangle select ([p-multiselect]).
- **Looker:** chips shown apart from standard filters ([l-cross]).
- **Tableau:** multi-dimension fixed sets as the precedent for tuple sets ([t-sets]).
- **WAI-ARIA APG:** don't make selection follow focus when each selection triggers requests ([apg]).

**Roles served**

- **Business consumer:** marks, reads the brushing, uses details tiles and chips.
- **Analyst/author:** defines markings, details tiles and limits.
- **Semantic-layer engineer:** the joins in the model decide how markings propagate.

### Keep 1:1, adapt, drop

| Spotfire behavior                                                                                                                                                                                    | Decision                                                                                                                                  | Why (user value, correctness, fit)                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Named markings with colors, a default marking, "(None)"                                                                                                                                              | **Keep 1:1**                                                                                                                              | This is the core of the user's mental model.                                                                                                                                                                                                                                   |
| Each tile picks one marking, or none; a tile can't be limited by its own marking                                                                                                                     | **Keep 1:1**                                                                                                                              | Spotfire's API rule ([api-markref]) prevents circular limiting.                                                                                                                                                                                                                |
| Marking spans the whole document (all pages)                                                                                                                                                         | **Keep 1:1**: dashboard-wide, across page tabs                                                                                            | Master and details tiles on different tabs are a Spotfire pattern ([sf-marking-14.8]).                                                                                                                                                                                         |
| Click, Ctrl+click, rectangle, Ctrl+rectangle (ToggleOrAdd), Alt lasso, Ctrl+Alt lasso, axis-area drag, legend click, trellis-header click, Shift+click range in tables, Alt+click cross-table header | **Keep 1:1**. Ctrl becomes Cmd on macOS; this mapping is an assumption.                                                                   | Users already have the muscle memory. For Ctrl+Alt lasso, 14.0 and 15.0 disagree ([sf-mark-14.0] vs [sf-items-15]). ToggleOrAdd is chosen because the Mods API calls it "the default Spotfire behavior for control marking" ([mods-api]).                                      |
| Arrow keys mark the next item                                                                                                                                                                        | **Adapt**: arrows move focus; Space marks                                                                                                 | Each marking change requeries details tiles, and selection that follows focus is "devastating … for keyboard and screen reader users" when it causes requests ([apg]). Spotfire already has Ctrl+arrow for moving focus only, and Space / Ctrl+Space to mark ([sf-mark-14.0]). |
| Fade unmarked plus outline marked (default); "Use separate color for marked items" (option)                                                                                                          | **Keep 1:1**                                                                                                                              | Spotfire, Tableau, Qlik and Looker all dim unselected items.                                                                                                                                                                                                                   |
| Partial marking of aggregated items                                                                                                                                                                  | **Adapt**: exact sub-length for additive measures; a pattern plus tooltip for non-additive ones                                           | Spotfire doesn't publish how it draws partial items. Power BI documents the value/highlight contract ([p-highlight-dev]). A sub-length is only correct when the measure sums across rows. Cube exposes `aggType` ([data-modeling]).                                            |
| Details tiles: Limit data using markings, AND/OR, the three nothing-marked options, Create details                                                                                                   | **Keep 1:1**, "visualization" becoming "tile" (open question)                                                                             | This is the core drill-down workflow.                                                                                                                                                                                                                                          |
| Limits combine as marking AND filtering AND expression                                                                                                                                               | **Keep 1:1**, as marking limits AND dashboard, tab and tile filters                                                                       | Documented in [sf-limiting-14.0].                                                                                                                                                                                                                                              |
| Range-based marking (15.0)                                                                                                                                                                           | **Keep**, as a per-marking mode Items/Range                                                                                               | It fits the predicate model directly, because bounds are symbolic.                                                                                                                                                                                                             |
| Marked Rows > Filter To / Filter Out                                                                                                                                                                 | **Adapt**: creates an ordinary dashboard filter from the predicate (a removable chip), then clears the marking                            | Spotfire's version doesn't work in-db ([sf-kb-filterto]) and can't be bookmarked ([sf-bm-15]). A normal filter can be both.                                                                                                                                                    |
| Unmark, Invert, Mark all                                                                                                                                                                             | **Keep 1:1**                                                                                                                              | Documented shortcuts ([sf-mark-14.0]).                                                                                                                                                                                                                                         |
| Details-on-Demand                                                                                                                                                                                    | **Adapt**: "View marked rows" drawer                                                                                                      | Uses Cube `ungrouped` queries, which need primary keys unless `allow_ungrouped_without_primary_key` is set ([data-apis]). Spotfire caps in-db at 10,000 rows ([sf-indb-14.0]).                                                                                                 |
| Copy data for marked items                                                                                                                                                                           | **Keep** (tuples); rows go through the drawer's export                                                                                    | [sf-copy-14.8]                                                                                                                                                                                                                                                                 |
| Delete marked rows                                                                                                                                                                                   | **Drop**                                                                                                                                  | Cube is read-only. Spotfire's deletes last one session only (excerpt, [sf-delete]) and don't work in-db ([sf-indb-14.0]).                                                                                                                                                      |
| Tags on rows                                                                                                                                                                                         | **Drop**                                                                                                                                  | Spotfire doesn't support them in-db ([sf-tags-14.0]). wechart has no row store.                                                                                                                                                                                                |
| Lists (named selections that persist across sessions)                                                                                                                                                | **Adapt, pending user answer**: save a marking as a named saved selection (a predicate)                                                   | The persistent-selection value ([sf-lists-14.0]) carries over without row identity.                                                                                                                                                                                            |
| Group from marked categories, Column from marked                                                                                                                                                     | **Drop in phase 1, pending user answer**                                                                                                  | Both create in-memory columns. wechart's equivalent is a model change owned by the engineer.                                                                                                                                                                                   |
| Marking-limited calculated values in text areas                                                                                                                                                      | **Keep**, as typed Markdown tokens                                                                                                        | [sf-cv-14.0]. Raw HTML stays banned (direction rule 25).                                                                                                                                                                                                                       |
| (Subsets) with marking subsets and complement                                                                                                                                                        | **Adapt**: "Marked" and "All data" as a split on the color or trellis well; "Not marked" only once Cube's negation semantics are verified | Supports comparing a subset with the whole ([sf-subsets-14.0]). Correctness depends on how nulls behave in `notEquals` (research item).                                                                                                                                        |
| On-demand tables driven by marking                                                                                                                                                                   | **Inherent**                                                                                                                              | Every wechart tile is a live Cube query. A details tile on a joined cube is this pattern by construction.                                                                                                                                                                      |
| Data functions and IronPython triggered by marking                                                                                                                                                   | **Drop in phase 1, pending user answer**                                                                                                  | wechart's scope has no script runtime. The marking predicate is exposed in the URL and state instead.                                                                                                                                                                          |
| Markings panel with "used by / limited by" counts and jump-to                                                                                                                                        | **Keep**, in the dashboard edit sidebar                                                                                                   | [sf-rn-12.5]                                                                                                                                                                                                                                                                   |
| Markings in bookmarks                                                                                                                                                                                | **Keep**, plus the URL                                                                                                                    | [sf-bm-add-15]; Looker allows link sharing ([l-cross]).                                                                                                                                                                                                                        |
| Markings saved in the file                                                                                                                                                                           | **Adapt, pending user answer**: saved dashboards store marking _definitions_, not the marked items                                        | Many consumers open a shared dashboard. Opening it pre-limited by the last author's marking silently narrows the details tiles. Looker doesn't save cross-filters ([l-cross]).                                                                                                 |
| Touch: tap to mark, press-and-hold lasso                                                                                                                                                             | **Keep**, and **adapt** the "can't add on touch" limit with an Add toggle in the tile toolbar                                             | Removes the documented limitation ([sf-touch], excerpt).                                                                                                                                                                                                                       |

### The model in detail

**C1. The marking object**

A marking is stored as a predicate. The shape below is load-bearing: its members are Cube member names and its operators are Cube filter operators.

```json
{
  "id": "mk_1",
  "name": "Marking",
  "color": "marking-1",
  "mode": "items",
  "terms": [
    {
      "all": [
        { "member": "orders.category", "op": "equals", "values": ["Beverages"] },
        {
          "member": "orders.created_at",
          "op": "inDateRange",
          "values": ["2024-03-01", "2024-03-31"]
        }
      ]
    },
    { "all": [{ "member": "orders.category", "op": "equals", "values": ["Condiments"] }] }
  ],
  "ranges": [],
  "source": { "tile": "t_12" }
}
```

- **How it compiles.** The predicate becomes one Cube `{or:[{and:[…]}, …]}` group. When only one dimension is involved, it collapses to a single `equals` with a list of values ([data-apis]).
- **What a mark contributes:**
  - An aggregated mark contributes the tuple of its dimension values. A time bucket becomes a date range for its granularity.
  - A table row of raw data contributes its cube's primary key; if the tile has no primary key, it can't be marked, matching Spotfire's in-db rule ([sf-indb-14.0]).
  - A KPI tile has no dimensions, so it can't emit a marking. It can still be limited by one, like Looker's single-value tiles ([l-cross]).
- **Axis-area drag:**
  - On a continuous dimension axis, it stores bounds.
  - On a measure axis, it stores the tuples whose value was in range when marked. Spotfire uses the same top-of-bar rule ([sf-items-15]). Storing tuples, rather than a `HAVING` clause, keeps the marking equal to what the user saw, and keeps dimension and measure filters apart ([data-apis]).
- **Range mode** follows Spotfire 15. Bounds are absolute and don't change when filters change ([sf-range-15]).
- **Operations** are Spotfire's algebra: Replace, Add, Subtract, Toggle, Intersect and ToggleOrAdd ([api-dso], [mods-api]).
  - Invert and Mark all apply to the focused tile's visible items. Spotfire's Ctrl+A marks all _filtered_ rows ([sf-mark-14.0]).
  - Mark all is stored as the tile's current filter predicate, not as a list of items. It is exempt from the item cap, as in Spotfire ([sf-indb-14.0]).

**C2. Gestures and modifiers.** The keep-1:1 table above applies, plus:

- Clicking an empty plot area, or pressing Esc, unmarks the tile's marking ([sf-unmark-15]).
- In dashboard edit mode, clicking a mark selects the tile and never marks (`references-dashboard-authoring.md`).
- A legend click marks the category. Series visibility moves to a separate control.

**C3. Rendering.**

- **Marked and unmarked.** Marked items keep their color and get an outline. Unmarked items fade. The tile option **Use separate color for marked items** draws marked items in the marking's color.
- **Partial marking.** For each target tile:
  - **The predicate can be evaluated from the tile's own rows.** This is the case when every predicate member is a tile dimension, or a time range contains the tile's buckets. Each item is then fully marked or fully unmarked, and no extra query is needed.
  - **Otherwise,** the tile issues its own query with the predicate ANDed in, and gets a marked value per item. This is Power BI's `highlights` contract ([p-highlight-dev]).
    - **Additive** `aggType` (`sum`, `count`; [data-modeling]): the marked part is drawn from the baseline at full strength, and the remainder fades. Each stack segment is handled on its own.
    - **Non-additive** (`avg`, `countDistinct`, `min`, `max`, `number`): the item gets a "contains marked data" pattern, using ECharts decals ([ec-aria]). The tooltip shows "Marked: X · All: Y". Never draw a sub-length for these.
    - **Pie sectors:** use the pattern, never a sub-angle. Angle is decoded less accurately than length (Cleveland & McGill, cited in docs/inputs §3).
- **Line charts.** Marked points and the segments between adjacent marked points are drawn at full strength ([sf-line-15]).
- **Legend and labels.** Unmarked legend categories are greyed, with a text state ([sf-legend-15]). "Show labels for: All / Marked rows / None" ([sf-barlabels-14.0]).
- **Range markings** get a colored stripe with drag handles ([sf-range-15]).

**C4. Details tiles.**

- Tile Properties > Data has:
  - **Marking** (with "(None)")
  - **Limit data using markings**, which lists every marking except the tile's own
  - **Rows must be included in: All markings (AND) / Any marking (OR)**
  - **If no items are marked in the master tiles, show: All data / Empty visualization / Message on empty background**. The message is pre-filled with the master tiles' names, which is the purpose Spotfire documents ([sf-nomark-10.10]). The default option is an open question.
- **Create details tile** is in the tile's menu.
- When a non-empty limiting marking's items are all filtered out, the tile says "Marked items are hidden by current filters" instead of showing the nothing-marked state. In Spotfire, marking and filtering are independent, and marked rows survive being filtered out ([sf-copy-14.8]).

**C5. Marked rows actions.** The focused tile's menu, and each chip's menu, offer:

- Filter to marked, and Filter out marked (these become filters)
- Unmark, Invert, Mark all
- View marked rows (the drawer, with export)
- Copy marked values
- Create details tile
- Save as selection (pending the user's answer)
- Drill into (when a hierarchy exists)

This menu replaces direction rule 31's list: "Keep only" and "Exclude" map to Filter to and Filter out.

**C6. Markdown tiles.**

- Tokens can be limited by markings, with AND/OR and nothing-marked **All data / Empty**, the two options Spotfire offers for calculated values ([sf-cv-14.0]). Example: `{{measure:orders.revenue | marking:Marking}}`.
- `{{marking:Marking.count}}` and `{{marking:Marking.summary}}` print the marking's state as text.

**C7. Persistence.**

- The current marking predicates live in the URL and in bookmarks (if phase 1 has bookmarks).
- The saved dashboard stores marking definitions: name, color, mode, which tiles use each marking, and the limits.

**C8. Coexistence with filters, chips and the Interactions matrix.**

- **Filters** (dashboard, tab, tile) are separate state. A marking never edits a filter.
- **Chips.** Each non-empty marking gets a chip in the filter bar's right-hand group, replacing the cross-filter chips. A chip shows:
  - the color swatch and the marking's name
  - a summary of the values, for example "Category: Beverages, Condiments +3"
  - the source tile
  - a clear control
- **Default wiring.** A new dashboard has one marking, "Marking", set as default, and every new chart tile uses it ([sf-docprops-14.0]). Tiles are linked out of the box by brushing. Filtering comes from details tiles, or from Filter to marked.
- **The Interactions view** is derived from these settings. For each source → target pair it shows:
  - **Marks together**: both tiles use the same marking.
  - **Limits**: the target is limited by the source's marking.
  - **None**.

  Editing a cell writes the underlying settings. Because a shared marking is symmetric and transitive, the view lists every other pair the change affects before applying it.

**C9. Propagation across cubes and views** (the counterpart of Spotfire relations).

- A tile takes part in a marking only when every member in the predicate resolves in its query context. In Cube terms, the members must be in the same cube or view, or reachable through model joins.
- Otherwise the tile ignores the marking and shows "Not linked to ‹marking›", like Spotfire's invalid-relation icon (`references.md` L91).
- No propagation by matching member names. Spotfire's column matches don't carry marking either ([sf-tables-15]).

**C10. Accessibility.**

- **Keyboard:**
  - Arrows move focus; Space marks; Ctrl/Cmd+Space toggles; Shift+arrow extends the marking.
  - Mark all, unmark all, invert, filter to and filter out have shortcuts.
  - A keyboard rectangle select follows Power BI's S key ([p-multiselect]).
- **Announcements.** Each marking change is announced in a polite live region, with the marking name, count and source tile.
- **Not color alone** (WCAG 1.4.1, [wcag-141]). Marking is always shown by outline, fade, pattern, an "n marked" badge on the tile header, and chip text.
- **Focus vs marking.** The focus ring looks different from the marked outline.
- **"View marked rows"** is the accessible table view of the marking.

**C11. Risks to verify** (correctness and performance, not user questions).

- **Pre-aggregations.** Marking dimensions become filter dimensions in target queries, so pre-aggregations match only when they contain those members ([pre-aggs]).
- **Date ranges in OR groups.** `inDateRange` inside an OR group "is applied as a generic filter" and skips granularity matching ([data-apis]).
- **Query size.** Large tuple sets may hit database parameter limits. SQL Server's 2,100-parameter limit is an excerpt ([sf-indb-forum]). An item cap is needed, as in Spotfire's in-db limit ([sf-indb-14.0]).

### What this direction rejects

- **The Power BI per-pair Filter/Highlight/None matrix as the underlying model.** It has no named state for chips, tokens or bookmarks to reference, and it can't express two independent selection sets combined with AND/OR.
- **Filtering as the default result of a click** (Superset, Looker). It removes the master tile's context. Spotfire users expect brushing, with filtering only in details tiles.
- **Superset's single-select cross-filter** ([ss-eventhandlers]). It can't express multi-item markings.
- **Tableau's "Leave the filter" on clear.** It leaves tiles filtered by a state that no chip shows.
- **Qlik's confirm step** ([q-make]). Spotfire applies a marking immediately.
- **Row-index markings.** There is no stable row identity behind live Cube queries, and Spotfire itself goes symbolic in-db ([sf-reapply-15]).
- **Sub-length rendering for non-additive measures.** A partial average or distinct count can't be read as part of a whole.
- **Showing marking by color alone** ([wcag-141]).
- **Propagating markings by matching member names** ([sf-tables-15]).

### Tokens to derive

| Token                         | Value                                                                                                                                                                                                                | Provenance                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| marking-1 (default "Marking") | Spotfire's default color: **not published**. Candidate: `direction.md`'s `crossfilter` `#7a3fb0` (light) / `#b58be0` (dark), **but only if** it validates as distinct from categorical violet `#4a3aa7` / `#9085e9`. | `direction.md` §5                                    |
| marking-2…n                   | Not published. Spotfire documents no cap on the number of markings. Size the set from the user's answer, then validate against all 8 categorical slots and the status colors.                                        | [sf-docprops-14.0]                                   |
| unmarked fade                 | Not published. Spotfire says "fade out", and Tableau and Power BI say "dimmed". Derive it and test it.                                                                                                               | [sf-marking-14.8], [t-select], [p-filters-highlight] |
| marked outline                | Spotfire says "dark outline"; width and color are not published.                                                                                                                                                     | [sf-marking-14.8]                                    |
| partial pattern               | An ECharts 5 decal. The pattern type is to be derived.                                                                                                                                                               | [ec-aria], [ec-v5]                                   |
| range stripe                  | Spotfire says "colored stripe along the axis"; size is not published.                                                                                                                                                | [sf-range-15]                                        |
| marking chip                  | Reuse the existing chip: 24 px high, 999 px radius, 12 px 600 weight.                                                                                                                                                | `direction.md` §4                                    |

---

## Design rules for direction.md

1. Every dashboard has at least one marking. A new dashboard starts with "Marking", set as the default, and every new chart tile uses the default marking.
2. A tile's **Marking** setting lists "(None)" and every marking. A tile set to (None) can't be marked and shows no marking.
3. A tile can't be limited by the marking it marks with. That marking is disabled in the tile's limit list, with the reason shown.
4. A marking is stored only as a predicate over Cube dimension members (tuples and bounded ranges), never as row indexes or result positions.
5. Click replaces. Ctrl/Cmd+click toggles. Dragging a rectangle replaces. Ctrl/Cmd+drag adds, or unmarks when every enclosed item is already marked. Alt+drag lassos. Ctrl/Cmd+Alt+drag lasso-adds with the same rule.
6. Clicking an empty plot area, or pressing Esc, unmarks that tile's marking. Clicking in dashboard edit mode never marks.
7. Clicking a legend category's text marks its items, and Ctrl/Cmd adds more. Series visibility uses a separate control.
8. Clicking a trellis panel header marks the whole panel, and Ctrl/Cmd adds more panels.
9. Dragging in an axis label area marks by range. On a continuous dimension axis the marking stores bounds. On a measure axis it stores the items whose value was in range at the moment of marking.
10. In table tiles, Shift+click marks the range from the anchor row, and Ctrl/Cmd+Shift+click adds that range. Raw rows can be marked only when the cube's primary key is available.
11. Arrow keys move focus between marks without marking. Space marks the focused item, Ctrl/Cmd+Space toggles it, and Shift+arrow extends the marking. Mark all, Unmark all, Invert, Filter to and Filter out each have a shortcut, checked for collisions before release.
12. Every marking change is announced in a polite live region, with the marking name, item count and source tile.
13. By default, marked items keep their color and get an outline, and unmarked items fade. The tile option "Use separate color for marked items" draws marked items in the marking's color.
14. A partially marked item is drawn as a sub-length from the baseline only when its measure is additive. Otherwise it gets a pattern, and its tooltip shows both the marked and the full value.
15. Marking state is never conveyed by color alone. Outline, fade, pattern, the tile's "n marked" badge and the chip text carry it.
16. Every non-empty marking has a chip in the filter bar's right-hand group, showing the swatch, name, value summary, source tile and a clear control.
17. Markings are dashboard-wide. Marking on one page tab updates every tile on every tab that uses, or is limited by, that marking.
18. A tile that can't resolve every member of a marking's predicate ignores that marking, and shows "Not linked to ‹marking›".
19. A details tile offers **Limit data using markings**, **Rows must be included in: All markings (AND) / Any marking (OR)**, and **If no items are marked in the master tiles, show: All data / Empty visualization / Message on empty background**. The message is pre-filled with the master tiles' names.
20. Marking limits and filters combine with AND.
21. When a limiting marking isn't empty but all its items are filtered out, the details tile says so instead of showing its nothing-marked state.
22. The tile menu offers **Create details tile**, which adds a tile limited by that tile's marking.
23. **Filter to marked** and **Filter out marked** create an ordinary, removable dashboard filter from the predicate, then clear the marking.
24. **View marked rows** opens the bottom drawer with the rows behind the focused tile's marked items, capped, with export.
25. Markdown tokens can be limited by markings (AND/OR; nothing-marked: All data or Empty) and can print a marking's count and summary.
26. The current markings are part of the URL and of bookmarks. Saved dashboards store marking definitions only, pending user confirmation.
27. The Interactions view is derived from marking settings. Editing a cell lists every other tile pair the change affects before applying it.
28. Deleting a marking sets the tiles that used it to (None), removes it from limits, and can be undone.
29. A marking has an item cap, and exceeding it explains the limit. Mark all is exempt, because it stores the tile's filter predicate.
30. Range-mode markings keep their bounds when filters change, and show a colored stripe with drag handles.
31. UI strings use Spotfire's wording (Marking, Marked rows, Limit data using markings, the AND/OR and nothing-marked labels). Whether to substitute "tile" for "visualization" is decided by the user.

---

## Open questions for the user

1. **Replacing cross-filters.** Should markings replace cross-filters, making a click brush instead of filter, and superseding direction principle 3 and rules 13 and 32? Or do you also want Power BI-style per-pair filtering?
2. **Scope.** Should markings span all page tabs, as in Spotfire? This document recommends yes.
3. **Reopening a saved dashboard.** Should it reopen with the last marking, as Spotfire does when it saves the file, or with no marking, as recommended here?
4. **Default nothing-marked option** for a new details tile: All data, Empty visualization, or Message on empty background (recommended, pre-filled)?
5. **Wording.** Keep "visualization" in the Spotfire strings, or say "tile"?
6. **Partial marking in Spotfire.** In your experience, how does Spotfire draw a partly marked bar? Its documentation doesn't say. Should wechart match it exactly?
7. **Number of markings.** How many markings do your analyses typically use at once? This sets the size of the marking palette.
8. **Migration of `.dxp` features.** Do your `.dxp` analyses rely on any of these?
   - Tags or Lists
   - Group from marked categories or Column from marked
   - (Subsets)
   - data functions or IronPython triggered by marking
   - on-demand tables driven by marking

   This decides which "drop" and "pending" rows move into phase 1.

9. **Range-based marking** (Spotfire 15, Industry Pro): is it needed in phase 1?
10. **Bookmarks:** does phase 1 have them? If not, markings persist only through the URL.
11. **Legend clicks:** should a legend click mark (Spotfire) or hide a series (the current direction)?
12. **Touch:** is touch support needed?
13. **Linking across cubes:** only through Cube model joins, or should authors also declare member mappings, like Spotfire relations?
14. **Item cap:** what cap on marked items can you accept? Spotfire's in-db default is 1,000.
15. **"Cross table filters"** (IN-2b): does it mean markings carried across related tables, Spotfire's "filtering in related data tables", or both?

## Research items for component-research (not user questions)

- **Cube negation:** how nulls behave under `notEquals` and nested `or`/`and` negation. Needed for Invert, Subtract and "Not marked".
- **Cube views:** how view members map back to cube members in `/v1/meta`, for C9's propagation rule.
- **Pre-aggregations:** how often adding marking dimensions to target queries causes misses ([pre-aggs]), and whether an `inDateRange` in an OR group costs acceleration ([data-apis]).
- **Query size:** IN-list and parameter limits for each supported database driver, to set the item cap.
- **ECharts:** whether its brush component covers rectangle, lasso, and x or y axis ranges; and whether the `select` and `blur` states and `decal` patterns ([ec-v5], [ec-aria]) render C3.
- **Shortcuts:** which Spotfire Ctrl-letter shortcuts collide with browser and OS shortcuts on Windows and macOS.
- **URLs:** length limits for predicates encoded in the URL.

---

## Link references

[sf-lts]: https://docs.tibco.com/pub/spotfire/general/LTS/spotfire_lts_releases.html
[sf-relnotes]: https://releasenotes.spotfire.com/
[sf-rn-12.5]: https://docs.tibco.com/pub/spd/12.5.0/TIB_spd_12.5.0_relnotes.pdf?id=0
[sf-hotfix]: https://community.spotfire.com/articles/spotfire/list-of-hotfixes-for-spotfire-clients-analyst-web-player-consumer-business-author-and-automation-services/
[sf-mark-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_marking_in_visualizations.htm
[sf-mark-6.5]: https://docs.tibco.com/pub/spotfire/6.5.2/doc/html/vis/vis_marking_in_visualizations.htm
[sf-marking-14.8]: https://docs.tibco.com/pub/sfire-analyst/14.8.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking.html
[sf-marking-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking.html
[sf-items-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking_items.html
[sf-range-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/range_based_marking.html
[sf-legend-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking_items_using_the_legend.html
[sf-unmark-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/unmarking_items.html
[sf-across-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/exploring_data_across_visualizations.html
[sf-newmark-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_a_new_marking.html
[sf-reapply-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/reapplying_markings_when_reloading_data.html
[sf-limit-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/using_markings_for_data_limiting.html
[sf-bm-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/using_bookmarks.html
[sf-bm-add-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/adding_a_bookmark.html
[sf-bm-apply-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/applying_a_bookmark.html
[sf-bm-link-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/copying_a_link_to_a_bookmark.html
[sf-colmarked-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/column_from_marked.html
[sf-dod-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/displaying_item_details.html
[dod-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/dod/dod_what_is_details-on-demand.htm
[sf-line-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/marking_in_line_charts.html
[sf-map-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/navigation_in_the_map_chart.html
[sf-rel-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/related_data_tables_joins_and_column_matches.html
[sf-tables-15]: https://docs.tibco.com/pub/sfire-analyst/15.0.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/data_tables_in_spotfire.html
[sf-copy-14.8]: https://docs.tibco.com/pub/sfire-analyst/14.8.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/copying_and_pasting_data_pages_or_visualizations.html
[sf-bardata-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_properties_data.htm
[sf-barapp-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_properties_appearance.htm
[sf-barlabels-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_properties_labels.htm
[sf-limiting-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_limiting_what_is_shown_in_visualizations.htm
[sf-details-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_what_is_a_details_visualization.htm
[sf-createdetails-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_details_on_create_details_visualization.htm
[sf-nomark-10.10]: https://docs.tibco.com/pub/spotfire_server/10.10.2/doc/html/en-US/TIB_sfire_bauthor-consumer_usersguide/GUID-AC96305D-FAF3-4690-BF5F-D7660DFE3ADF.html
[sf-drill-10.10]: https://docs.tibco.com/pub/spotfire_server/10.10.3/doc/html/en-US/TIB_sfire_bauthor-consumer_usersguide/GUID-01F8D5AF-7D1E-404A-B2A2-0FF71CA8BAFB.html
[sf-md-6.5]: https://docs.tibco.com/pub/spotfire/6.5.1/doc/html/md/md_master_detail_visualizations.htm
[sf-docprops-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/other/other_details_on_document_properties_markings.htm
[sf-docprops-10.10]: https://docs.tibco.com/pub/sfire-analyst/10.10.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/other/other_how_to_edit_document_properties.htm
[sf-kb-marking]: https://support.tibco.com/external/article?articleUrl=Explanation-of-marking-and-how-it-is-displayed-in-visualizations-in-TIBCO-Spotfire
[sf-kb-filterto]: https://support.tibco.com/external/article?articleUrl=Possible-reasons-why-the-Filter-To-Filter-Out-options-show-as-disabled
[sf-indb-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/data/data_working_with_in-database_data.htm
[sf-indb-10.10]: https://docs.tibco.com/pub/sfire-analyst/10.10.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/data/data_working_with_in-database_data.htm
[sf-indb-pref]: https://support.revvitysignals.com/hc/en-us/articles/4408237517460-Preference-setting-for-Spotfire-Desktop-to-MarkingWhereClauseLimit-and-MarkingInQueryLimit
[sf-indb-forum]: https://community.tibco.com/questions/db-marking-limit
[sf-50k]: https://support.revvitysignals.com/hc/en-us/articles/4408240990612-Marking-more-than-50K-rows-to-update-on-demand-data-table-throws-exception-Failed-to-execute-data-query-An-error-occurred-while-making-the-HTTP-request
[sf-ondemand-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/add/add_example_of_marking_controlled_on-demand_details_visualization.htm
[sf-input-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/add/add_details_on_define_input.htm
[sf-df-11.4]: https://docs.tibco.com/pub/sfire-analyst/11.4.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/df/df_configuring_data_function_parameters.htm
[sf-df-10.10]: https://docs.tibco.com/pub/sfire-analyst/10.10.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/df/df_details_on_edit_parameters.htm
[sf-cv-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/cv/cv_settings_data.htm
[sf-text-7.0]: https://docs.tibco.com/pub/spotfire/7.0.1/doc/html/text/text_how_to_use_the_text_area.htm
[sf-subsets-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/subsets/subsets_what_are_subsets.htm
[sf-msubset-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_details_on_add_edit_marking_subset.htm
[sf-tags-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/tags/tags_what_are_tags.htm
[sf-tagsh-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/tags/tags_how_to_work_with_tags.htm
[sf-lists-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/lists/lists_what_are_lists.htm
[sf-listsmark-6.5]: https://docs.tibco.com/pub/spotfire/6.5.2/doc/html/lists/lists_marking_items_in_visualizations.htm
[sf-listsnew-7.0]: https://docs.tibco.com/pub/spotfire/7.0.0/doc/html/lists/lists_creating_lists.htm
[sf-group-14.3]: https://docs.tibco.com/pub/sfire-cloud/14.3.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/grouping_from_marked_categories.html
[sf-delete]: https://community.spotfire.com/articles/spotfire/remove-or-delete-rows-spotfire/
[sf-hl-14.0]: https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_highlighting_in_visualizations.htm
[sf-idea]: https://ideas.spotfire.com/ideas/TS-I-9178
[sf-touch]: https://docs.tibco.com/pub/spotfire_web_player/5.0.0-nov-2012/dxpwebhelp/dxpwebclient/touch_intro.htm
[sf-primer]: https://www.oreilly.com/library/view/tibco-spotfire/9781782176404/ch02s05.html
[sf-primer-lists]: https://www.oreilly.com/library/view/tibco-spotfire/9781782176404/ch03s07.html
[sf-reset]: https://community.spotfire.com/articles/spotfire/how-to-perform-reset-all-markings-using-ironpython-in-spotfire/
[sf-ipy-default]: https://community.spotfire.com/articles/spotfire/how-to-retrieve-data-marking-selection-using-ironpython-in-spotfire/
[sf-blog-trigger]: https://spotfired.blogspot.com/2015/10/update-doc-property-trigger-ironpython.html
[arria]: https://docs.integrations.arria.com/BI/TIBCOSpotfire/en/control-narratives-using-markings.html
[sfref]: https://www.sf-ref.com/ironpython/visualizations/bar-chart/data/
[api-dms]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/T_Spotfire_Dxp_Data_DataMarkingSelection.htm
[api-setsel]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/Overload_Spotfire_Dxp_Data_DataMarkingSelection_SetSelection.htm
[api-setsel-where]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/M_Spotfire_Dxp_Data_DataMarkingSelection_SetSelection_2.htm
[api-trygetexpr]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/M_Spotfire_Dxp_Data_DataSelection_TryGetSelectionExpression.htm
[api-getsel]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/M_Spotfire_Dxp_Data_DataSelection_GetSelection.htm
[api-dso]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/T_Spotfire_Dxp_Data_DataSelectionOperation.htm
[api-markref]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/P_Spotfire_Dxp_Application_Visuals_VisualizationData_MarkingReference.htm
[api-filterings]: https://docs.tibco.com/pub/doc_remote/spotfire/7.9.0/TIB_sfire-analyst_7.9.0_api/html/P_Spotfire_Dxp_Application_Visuals_VisualizationData_Filterings.htm
[api-empty]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/P_Spotfire_Dxp_Application_Visuals_VisualizationData_LimitingMarkingsEmptyBehavior.htm
[api-combine]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/P_Spotfire_Dxp_Application_Visuals_VisualizationData_MarkingCombinationMethod.htm
[api-active]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/P_Spotfire_Dxp_Application_Document_ActiveMarkingSelectionReference.htm
[api-markings]: https://docs.tibco.com/pub/doc_remote/sfire_dev/area/doc/api/TIB_sfire-analyst_api/html/P_Spotfire_Dxp_Data_DataManager_Markings.htm
[api-mapmode]: https://docs.tibco.com/pub/doc_remote/sfire-analyst/7.11.0/TIB_sfire-analyst_7.11.0_api/html/T_Spotfire_Dxp_Application_Visuals_Maps_MarkingMode.htm
[js-marking]: https://docs.tibco.com/pub/spotfire_server/12.0.1/doc/api/TIB_sfire_Web_Player_JavaScript_API_Reference/html/T_spotfire_webPlayer_Marking.htm
[js-setmarking]: https://docs.tibco.com/pub/spotfire_server/12.2.0/doc/api/TIB_sfire_Web_Player_JavaScript_API_Reference/html/M_spotfire_webPlayer_Marking_setMarking.htm
[js-markop]: https://docs.tibco.com/pub/spotfire_server/12.2.0/doc/api/TIB_sfire_Web_Player_JavaScript_API_Reference/html/T_spotfire_webPlayer_markingOperation.htm
[js-getmarking]: https://docs.tibco.com/pub/spotfire_server/12.2.0/doc/api/TIB_sfire_Web_Player_JavaScript_API_Reference/html/M_spotfire_webPlayer_Marking_getMarking.htm
[mods-api]: https://unpkg.com/@spotfire/mods-api/visualization-mods/api.d.ts
[q-states]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/selection-states.htm
[q-types]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/selection-in-visualization.htm
[q-make]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/make-selection-2.htm
[q-lasso]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/lasso-selection.htm
[q-explore]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/SelectionsToolbar/work-with-selections.htm
[q-alt]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Visualizations/alternate-states-comparative-analysis.htm
[q-step]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/use-selection-tool.htm
[q-bookmarks]: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Bookmarks/create-bookmark.htm
[t-highlight]: https://help.tableau.com/current/pro/desktop/en-us/actions_highlight.htm
[t-highlight-adv]: https://help.tableau.com/current/pro/desktop/en-us/actions_highlight_advanced.htm
[t-filter]: https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm
[t-sets-actions]: https://help.tableau.com/current/pro/desktop/en-us/actions_sets.htm
[t-sets]: https://help.tableau.com/current/pro/desktop/en-us/sortgroup_sets_create.htm
[t-select]: https://help.tableau.com/current/pro/desktop/en-us/inspectdata_pan_zoom.htm
[t-filtering]: https://help.tableau.com/current/pro/desktop/en-us/filtering.htm
[p-interactions]: https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions
[p-filters-highlight]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-filters-and-highlighting
[p-end-user]: https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-interactions
[p-multiselect]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-multi-select
[p-highlight-dev]: https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight
[p-bookmarks]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-bookmarks
[p-drillthrough]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough
[ss-eventhandlers]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/utils/eventHandlers.ts
[ss-preset]: https://docs.preset.io/docs/cross-filtering
[ss-blog]: https://preset.io/blog/cross-filtering-in-superset-and-preset/
[l-cross]: https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards
[g-settings]: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/modify-dashboard-settings/
[g-filters-2026]: https://grafana.com/whats-new/2026-04-14-faster-dashboard-exploration-with-quick-filters-and-grouping/
[apg]: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
[wcag-141]: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
[ec-aria]: https://echarts.apache.org/handbook/en/best-practices/aria/
[ec-v5]: https://echarts.apache.org/handbook/en/basics/release-note/v5-feature/
[data-apis]: ../research/cube/data-apis.md
[pre-aggs]: ../research/cube/pre-aggregations.md
[data-modeling]: ../research/cube/data-modeling.md
