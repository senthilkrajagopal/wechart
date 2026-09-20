# Dashboard authoring and in-dashboard chart editing: references

**Researched:** 2026-09-19. **Scope:** how users create dashboards, add tabs, sections and charts, lay them out, and edit a chart from inside a dashboard.

**Evidence rules:**

- Every observation links to its source.
- Values that no source publishes are marked "not published".
- Code-level facts come from each project's default branch as read on 2026-09-19. That branch can be ahead of the latest release.
- The measured values for Superset 6.1 and Metabase 0.63 come from `/Users/srajagopal/Work/wechart/docs/design/observations-local.md`.

**The user's brief** (verbatim in the request):

- Tabs and sections on dashboards.
- Adding new charts from the dashboard.
- Superset-style chart editing: chart type, cube/view, one or more metrics, one or more dimensions.
- **No inline width option.** Resizing must be WYSIWYG.
- A **pencil icon** on each chart that opens the chart editor.
- Grafana and Superset as the main references.

## Products studied

| Product             | Version verified                                                                                                             | Why chosen                                                                                                                                                                                          | Primary sources                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grafana**         | 13 (released 2026-04-21). Dynamic dashboards (schema v2) became GA and are on by default. Docs are for 13.x.                 | The user named it. It has the most current in-place editing model: a docked edit sidebar, an outline, tabs and rows, auto grid, a full-view panel editor, and visualization suggestions by default. | [Grafana 13 release][gf-13], [Dynamic dashboards GA][gf-ga], [Create dashboards][gf-create], [Dashboard groupings][gf-groups], [Panel editor][gf-editor]              |
| **Apache Superset** | 6.1 (announced 2026-06-11). A local 6.1.0 instance was measured.                                                             | The user named it for chart editing. It sets the reference for the Explore anatomy (dataset, chart type, metrics, dimensions) and the Tabs/Row/Column/Header/Markdown/Divider palette.              | [6.1 release][ss-61], [6.0 release][ss-60], [Creating your first dashboard (6.1.0)][ss-doc-dash], [Exploring data][ss-doc-explore], frontend source (linked per item) |
| **Metabase**        | 63 (released 2026-07-21). A local v0.63.18.1 instance was measured.                                                          | Its dashboard grid and card hover tools are widely known. It also has a full-screen, in-dashboard **visualizer** with undo/redo, and dashboard-owned questions (since 53).                          | [Metabase 63][mb-63], [Dashboards intro][mb-dash], [Multiple series / visualizer][mb-viz], [VisualizerModal source][mb-vmodal]                                        |
| **Power BI**        | Desktop and service. Microsoft Learn pages updated 2026-07-23. On-object interaction was still marked preview on 2026-07-22. | The enterprise BI tool target users know best. Editing happens in place, with no separate chart editor. It has "Suggest a type", a full keyboard-shortcut table, and snap and smart guides.         | [Report editor tour][pbi-tour], [On-object interaction][pbi-oo], [Gridlines and snap-to-grid][pbi-grid], [Keyboard shortcuts][pbi-keys]                               |
| **Looker**          | 26.x. The tabbed dashboards doc was updated 2026-09-18 and requires 26.4 or later; tab duplication needs 26.8.               | Optional in the brief. Included for its tile editor that opens inside the dashboard, the size readout while dragging, and its query-tile vs Look-linked-tile ownership model.                       | [Editing user-defined dashboards][lk-edit], [Tabbed dashboards][lk-tabs], [Creating user-defined dashboards][lk-create]                                               |

## Per-product observations

### Grafana 13 (dynamic dashboards)

**1. Entering and leaving edit mode**

- **Entering:** you click **Edit**. In edit mode the sidebar "docks in edit mode, floats in view mode" ([GA note][gf-ga]).
- **Toolbar:** a right-side toolbar replaced the second top toolbar, which gives more vertical space. It holds the content outline and settings ([public preview note][gf-pp]).
- **Saving:** **Save**, then an optional change description, then **Save** again. After that, **Back** and **Exit edit** ([Create dashboards][gf-create]).
- **Panel editor header:** **Back** returns to the dashboard "with changes applied but not saved". **Discard** drops changes since the last save. **Save** persists them ([Panel editor][gf-editor]). The Grafana 12 docs used the names **Discard / Save / Apply** for the same three actions ([AWS Managed Grafana v12 panel editor][gf-aws12]).
- **Undo/redo is not finished:**
  - The epic is open, with 2 of 102 sub-issues done ([#99151][gf-undo-epic]).
  - Undo for row and tab operations is landing in PRs ([#132511][gf-undo-pr]).
  - The undo stack "lives in DashboardSidebar" ([#132736][gf-undo-issue], opened 2026-09-16).
- **Shortcut:** `Ctrl+S` saves ([Use dashboards][gf-use]).

**2. Adding things**

- **The "Add new element" icon** is a blue plus in the toolbar that opens the sidebar ([GA note][gf-ga]). Its entries are ([Create dashboards][gf-create]):
  - **Panel**
  - **Add row / Group into rows**
  - **Add tab / Group into tabs**
  - dashboard controls: **Filter and Group by**, **Variable**, **Annotation query**, **Links**
- **New-panel choices:** **Configure visualization** (opens the panel editor), **Use saved query**, or **Use library panel** ([Create dashboards][gf-create]).
- **Other ways to add:**
  - Grafana 13 added "drag-and-drop panel creation from the sidebar directly onto the canvas" and pasting panels through the sidebar's Add mode ([Grafana 13][gf-13], [GA note][gf-ga]).
  - Hover affordances inside groupings: **+ Add panel**, **+ New row**, **+ New tab**, **Group panels** ([Dashboard groupings][gf-groups]).
- **New dashboards:** a creation page with a "default layout selector" ([Grafana 13][gf-13]).
- **Where new items land:** not published, other than drag-to-position.

**3. Layout manipulation**

- **Two layouts per container** ([Create dashboards][gf-create], [public preview note][gf-pp]):
  - **Custom:** "position and size panels individually", the same as the pre-dynamic grid.
  - **Auto grid:** "Panels resize and fit automatically." It is configured by minimum column width, row height and maximum columns per row ([GA note][gf-ga]).
  - The schema fields are `ColumnWidth`, `ColumnWidthMode`, `FillScreen`, `MaxColumnCount`, `RowHeight` and `RowHeightMode` ([dashboardv2 SDK][gf-sdk]). The allowed mode values are not published on the pages read.
- **Custom grid:** 24 columns, with height in units of 30 px (`gridPos`: `w` 1–24, `h` units of 30 px) ([JSON model][gf-json]).
- **Moving and resizing:**
  - **Move:** click the panel title and drag it to a new row, tab, or position ([Create dashboards][gf-create]).
  - **Resize:** in Custom layout, drag the lower-right corner ([Create dashboards][gf-create]).
  - Drop-indicator styling and minimum sizes are not published.
- **Rows** have these options ([Dashboard groupings][gf-groups]):
  - Title, **Fill screen**, **Hide row header**, section-level **Filters** and **Variables**, a Rows/Tabs or Custom/Auto grid **Layout**, **Repeat options**, and **Show/hide rules**.
  - "When you hide the header of a row, you can't collapse the row."
  - In edit mode, hidden headers are shown with crossed-out styling.
- **Tabs:** the same options as rows, minus Fill screen ([Dashboard groupings][gf-groups]).
- **Nesting rules** ([Dashboard groupings][gf-groups]):
  - Up to four grouping levels.
  - Rows can go in rows, rows in tabs, and tabs in rows. **Tabs cannot sit directly in tabs**; the workaround is tab > row > tabs.
  - "You can only have one type of grouping at the first level."
  - The Grafana 13 blog describes it as "up to three levels of nesting… rows inside tabs inside rows" ([Grafana 13][gf-13]). The docs and the blog disagree on the level count.
- **Reordering and grouping:**
  - Tabs can be dragged between rows ([GA note][gf-ga]).
  - Shift-click multi-selects panels, shown with a dotted blue line; then **Group into row/tab** ([Dashboard groupings][gf-groups], [multi-select note][gf-multi]).
  - **Deleting a grouping deletes its panels. Ungrouping keeps them.** When layouts differ, ungrouping prompts **Convert to Auto grid / Convert to Custom** ([Dashboard groupings][gf-groups]).

**4. Panel hover chrome**

- **View mode:**
  - Hovering the top-right corner shows the panel menu icon ([Panel overview][gf-panel]).
  - Menu entries: **View**, **Edit**, **Share**, **Explore**, **Inspect**, **Time settings**, **Styles** (edit mode only), **Extensions** (view mode only), and **More** (Duplicate, Copy, New library panel, and so on) ([Panel overview][gf-panel], [AWS v12][gf-aws12]).
  - The description appears as a tooltip on the panel ([Configure panel options][gf-opts]).
- **Edit mode:**
  - Clicking a panel selects it and opens its options in the sidebar.
  - Title and description can be edited there "without entering panel edit mode" ([Grafana 12.4][gf-124]).
  - Selection is a dotted blue line ([Dashboard groupings][gf-groups]).
  - The exact set of icons on an edit-mode panel is not published.

**5. Creating and editing a chart from the dashboard**

- **Where it opens:** a **full-view panel editor in place of the dashboard**. The header names "the dashboard in which the panel appears" ([Panel editor][gf-editor]).
- **How to open it:** panel menu → **Edit**, or hover and press `e` ([Use dashboards][gf-use]). `Esc` exits the panel editor or full-screen view ([Use dashboards][gf-use]).
- **Return path:** **Back** applies the changes to the dashboard draft but does not save them. The whole dashboard is saved as one unit ([Panel editor][gf-editor]).
- **Ownership:**
  - Panels are stored in the dashboard.
  - **Library panels** are shared: a change "propagates to all instances", and **Unlink library panel** detaches one instance ([Library panels][gf-lib]).

**6. Chart editor anatomy**

- **Layout:** preview at the top, a data section below, options on the right ([Panel editor][gf-editor], [AWS v12][gf-aws12]).
- **Preview controls:** **Table view** (raw data), time range, and **Refresh**. The v12 docs also list **Fill** vs **Actual**, where Actual shows "the exact size as the size on the dashboard" ([AWS v12][gf-aws12]).
- **Data tabs:** **Queries** (data source picker, plus add, save or replace a query), **Transformations**, **Alert** ([Panel editor][gf-editor]).
- **Visualization picker** ([PanelVizTypePicker source][gf-vizpicker], [suggestions update][gf-sugg], [Grafana 13][gf-13]):
  - Tabs **Suggestions** and **All visualizations**, with the search placeholder "Search for…".
  - **New panels default to Suggestions.**
  - Suggestions give a full-size preview in the editor before you pick, and use data-source metadata.
  - Suggestions became GA as the default picker in 13.
- **Options pane** ([PanelOptionsPane source][gf-optpane], [Overrides][gf-over], [Panel editor][gf-editor]):
  - A **"Search options"** input.
  - Modes **All / Overrides** ("Show only overrides").
  - **Panel styles** cards with live previews.
- **Query editor redesign:** private preview, with colour-coded cards ([Grafana 13][gf-13]).

**7. Keyboard, accessibility, responsiveness**

- **Shortcuts** ([Use dashboards][gf-use]):
  - `e` edit panel, `v` full-screen view
  - `pu` / `pe` / `ps` for share link, embed and snapshot; `pd` duplicate; `pr` remove
  - `Esc`, `Ctrl+S`, and `?` for the shortcut list
- **Outline:** a searchable tree of panels, rows, tabs and variables that jumps to any element ([Create dashboards][gf-create]).
- **Responsiveness:** Auto grid is Grafana's responsive mechanism ([GA note][gf-ga]).
- **Accessibility statements:** not published on the pages read.

[gf-13]: https://grafana.com/blog/grafana-13-release-all-the-latest-features/
[gf-ga]: https://grafana.com/whats-new/2026-04-08-dynamic-dashboards-is-now-generally-available/
[gf-pp]: https://grafana.com/whats-new/2026-01-14-dynamic-dashboards-in-public-preview/
[gf-124]: https://grafana.com/blog/grafana-12-4-release-all-the-latest-features/
[gf-create]: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/
[gf-groups]: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/dashboard-groupings/
[gf-multi]: https://grafana.com/whats-new/2026-07-08-organize-dashboards-faster-with-multi-select-grouping/
[gf-editor]: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/panel-editor-overview/
[gf-aws12]: https://docs.aws.amazon.com/grafana/latest/userguide/v12-panels-editor-overview.html
[gf-use]: https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/
[gf-panel]: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/panel-overview/
[gf-opts]: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-panel-options/
[gf-over]: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-overrides/
[gf-optpane]: https://github.com/grafana/grafana/blob/main/public/app/features/dashboard-scene/panel-edit/PanelOptionsPane.tsx
[gf-vizpicker]: https://github.com/grafana/grafana/blob/main/public/app/features/dashboard-scene/panel-edit/PanelVizTypePicker.tsx
[gf-sugg]: https://grafana.com/whats-new/2026-01-22-visualization-suggestions-updates/
[gf-lib]: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-library-panels/
[gf-json]: https://grafana.com/docs/grafana/latest/as-code/observability-as-code/schema-v2/layout-schema/
[gf-sdk]: https://pkg.go.dev/github.com/grafana/grafana-foundation-sdk/go/dashboardv2
[gf-undo-epic]: https://github.com/grafana/grafana/issues/99151
[gf-undo-issue]: https://github.com/grafana/grafana/issues/132736
[gf-undo-pr]: https://github.com/grafana/grafana/pull/132511

### Apache Superset 6.1

**1. Entering and leaving edit mode**

- **Entering:** **Edit Dashboard** ([docs][ss-doc-dash]).
- **Edit header, in order:** **Undo** ("Undo the action"), **Redo**, **Discard** (labelled "Exit edit mode" when there are no changes), **Save** ([Header source][ss-header]).
- **Discard** drops the `edit` URL parameter and reloads the page ([Header source][ss-header]).
- **Undo and redo:**
  - `Ctrl+Z` / `Ctrl+Y`, in edit mode only ([Header source][ss-header]).
  - There is an undo limit. When it runs out, a toast appears and further undo is blocked ([Header source][ss-header]).
  - 6.0 made "undo/redo buttons for layout changes" work ([6.0 release][ss-60], [fix #34777][ss-undo-fix]).
- **Unsaved changes:** 6.0 added a confirmation modal on leaving dashboard edit mode or Explore with unsaved changes ([6.0 release][ss-60]).

**2. Adding things**

- **Builder pane:** a right-hand pane, **374 px** wide (`BUILDER_PANE_WIDTH`), with tabs **Charts** and **Layout elements** ([BuilderComponentPane source][ss-builder]).
- **Layout elements, in order:** Tabs, Row, Column, Header, Markdown (Text), Divider, then plugin "dynamic" components ([BuilderComponentPane source][ss-builder]).
- **Charts tab:**
  - A filter box, sort options (name, viz type, dataset, recent; recent is the default) and "Show only my charts".
  - Cards show name, modified time, viz type, dataset and thumbnail.
  - Charts already on the dashboard can't be dragged again ([SliceAdder source][ss-adder]).
- **How items are added:** everything is **dragged** from the pane onto the grid; there is no click-to-insert ([docs][ss-doc-dash], [local observations][local]).
- **Empty states** ([DashboardGrid source][ss-grid]):
  - Empty dashboard in edit mode: "Drag and drop components and charts to the dashboard", with a **Create a new chart** button.
  - Empty tab: "Drag and drop components to this tab".

**3. Layout manipulation**

- **Grid constants** ([constants.ts][ss-const]):
  - `GRID_COLUMN_COUNT = 12`
  - `GRID_BASE_UNIT = 8`
  - `GRID_GUTTER_SIZE = 16`
  - `GRID_MIN_COLUMN_COUNT = 1`
  - `GRID_MIN_ROW_UNITS = 5` (a 40 px minimum height)
  - `GRID_MAX_ROW_UNITS = 100`
  - `GRID_DEFAULT_CHART_WIDTH = 4`
- **Resizing** ([ResizableContainer source][ss-resize], [ChartHolder source][ss-holder]):
  - Handles on the **right edge, bottom edge and bottom-right corner**. They are invisible (opacity 0) until hover or an active resize.
  - Width is adjustable only for a chart inside a Row.
  - Resizing snaps to 8 px while dragging, then to "actual column multiples on stop".
  - A pixel-height label follows the cursor during a bottom-edge resize.
- **Column guides:** all 12 appear while resizing (`grid-column-guide`) ([DashboardGrid source][ss-grid]).
- **Layout model:** a tree of Rows and Columns. Charts sit side by side only inside a Row ([ChartHolder source][ss-holder]).
- **Rows** ([Row source][ss-row]):
  - Hover menu: drag handle on the left, delete, and a background setting.
  - An empty row shows "Empty row".
  - **Rows can't collapse.**
- **Tabs** ([Tabs source][ss-tabs]):
  - Add with **+**. Titles are editable in place. Tabs reorder by drag.
  - **Dropping a chart on a tab label** moves it there and switches to that tab.
  - Deleting a tab asks for confirmation: "Deleting a tab will remove all content within it… You may still reverse this action with the **undo** button (cmd + z) until you save your changes."
  - Inactive tabs don't render until they are opened.
- **Nesting:** Tabs may sit in the grid, in a Tab, or in a Column, but **not in a Row** ([isValidChild source][ss-valid]).

**4. Chart hover chrome**

- **View mode, header items** ([SliceHeader source][ss-slicehdr]):
  - editable title
  - annotation status icons
  - cross-filter icon
  - description icon
  - customizations badge
  - filters badge
  - row-limit warning
  - a **vertical ⋮ menu**
- **⋮ menu entries** ([SliceHeaderControls source][ss-controls]): Force refresh, Enter fullscreen, Show/Hide chart description, **Edit chart**, Cross-filtering scoping, View query, View as table, Drill to detail, Share, Download.
- **Edit mode:**
  - All header controls are hidden (`!editMode`) ([SliceHeader source][ss-slicehdr]).
  - Charts show a top hover menu with a **delete** button and are draggable ([ChartHolder source][ss-holder]).

**5. Creating and editing a chart from the dashboard**

- **Editing an existing chart** leaves the dashboard for **Explore, a separate page**:
  - **Edit chart** navigates in the same tab (`history.push`); ⌘/Ctrl-click opens a new tab ([SliceHeaderControls source][ss-controls]).
  - In view mode, clicking the title does the same. Its tooltip reads "Click to edit %s." / "Use ⌘ + click to open in a new tab." ([getSliceHeaderTooltip][ss-tooltip], [PR #20111][ss-pr20111]).
- **Creating a chart** from the builder:
  - **Create new chart** opens `/chart/add?dashboard_id=…` **in a new window** ([SliceAdder source][ss-adder]).
  - That page is a two-step wizard: "Choose a dataset", "Choose chart type", then **Create new chart** ([ChartCreation source][ss-create]).
- **Return path** is the Save modal ([SaveModal source][ss-save]):
  - **Save (Overwrite)** or **Save as…**, plus "Chart name" and **Add to dashboard**.
  - The dashboard is pre-selected from the URL or sessionStorage.
  - **Select a tab**, then **Save & go to dashboard**.
- **Ownership:** a chart ("slice") is shared across dashboards. **Overwrite shows no warning about other dashboards that use it** ([SaveModal source][ss-save]).

**6. Chart editor anatomy (Explore)**

- **Columns** ([local observations][local], [Exploring data][ss-doc-explore]):
  - **Chart Source**, 300 px measured: dataset picker, search, and Metrics and Columns lists with type icons and drag handles.
  - **Controls**, 320 px measured: **Data** and **Customize** tabs.
  - **Chart canvas**, with a **Results / Samples** drawer.
- **Chart type** ([VizTypeGallery source][ss-gallery], [FastVizSwitcher source][ss-fast]):
  - A row of featured-type icons plus **View all charts**.
  - The gallery has **All charts**, **Featured**, **Category** and **Tags**, a fuzzy search "Search all charts", and a detail panel with examples. Double-click selects.
  - There is **no data-driven recommendation**: "Featured" is a static tag.
- **Data tab** (timeseries line example) ([controlPanel source][ss-cp]):
  - **Query:** X-axis, Time grain, Metrics, Dimensions, Filters, Series limit, Sort, Row limit.
  - Also: Advanced analytics, Annotations and Layers, Predictive Analytics.
- **Customize tab:** Chart Title, Chart Options, Legend, X Axis, Tooltip, Y Axis ([controlPanel source][ss-cp]).
- **Running:** the user clicks **Run** or **Update chart**. Changes don't apply live ([docs][ss-doc-dash], [Exploring data][ss-doc-explore]).
- **Search within options:** not present in the sources read.

**7. Keyboard, accessibility, responsiveness**

- Undo is `Ctrl+Z` and redo is `Ctrl+Y` in edit mode ([Header source][ss-header]).
- Inactive tabs load lazily ([Tabs source][ss-tabs]).
- Responsive and accessibility behaviour: not published.

[ss-61]: https://preset.io/blog/apache-superset-6-1-release/
[ss-60]: https://preset.io/blog/apache-superset-6-0-release/
[ss-doc-dash]: https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/
[ss-doc-explore]: https://superset.apache.org/user-docs/using-superset/exploring-data/
[ss-header]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/Header/index.tsx
[ss-undo-fix]: https://www.mail-archive.com/commits@superset.apache.org/msg37492.html
[ss-builder]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/BuilderComponentPane/index.tsx
[ss-adder]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/SliceAdder.tsx
[ss-grid]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/DashboardGrid.tsx
[ss-const]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/constants.ts
[ss-resize]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/resizable/ResizableContainer.tsx
[ss-holder]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/gridComponents/ChartHolder/ChartHolder.tsx
[ss-row]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/gridComponents/Row/Row.tsx
[ss-tabs]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/gridComponents/Tabs/Tabs.tsx
[ss-valid]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/isValidChild.ts
[ss-slicehdr]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/SliceHeader/index.tsx
[ss-controls]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/SliceHeaderControls/index.tsx
[ss-tooltip]: https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/getSliceHeaderTooltip.tsx
[ss-pr20111]: https://github.com/apache/superset/pull/20111
[ss-create]: https://github.com/apache/superset/blob/master/superset-frontend/src/pages/ChartCreation/index.tsx
[ss-save]: https://github.com/apache/superset/blob/master/superset-frontend/src/explore/components/SaveModal.tsx
[ss-gallery]: https://github.com/apache/superset/blob/master/superset-frontend/src/explore/components/controls/VizTypeControl/VizTypeGallery.tsx
[ss-fast]: https://github.com/apache/superset/blob/master/superset-frontend/src/explore/components/controls/VizTypeControl/FastVizSwitcher.tsx
[ss-cp]: https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/Timeseries/Regular/Line/controlPanel.tsx
[local]: /Users/srajagopal/Work/wechart/docs/design/observations-local.md

### Metabase 63

**1. Entering and leaving edit mode**

- **Entering:** the **pencil icon** at top right. "Once in edit mode, a grid appears" ([Dashboards intro][mb-dash]).
- **Exit and save labels:** not published in the docs. The reset flow ends with "Click **Done**, then **Save**" ([Dashboards intro][mb-dash]).
- **Undo:** removing a card shows an **undo toast** ([PR #52781][mb-undo]). A general dashboard undo/redo stack is not published.
- **Width:** set from the ⋯ menu, **Fixed width** (the default) or **Full width** ([Dashboards intro][mb-dash]).

**2. Adding things**

- **Header icons in edit mode** ([Dashboards intro][mb-dash]):
  - **+** adds a question: a new question, a SQL query, or an existing saved question.
  - **T** adds a **Heading** or a **Text** (Markdown) card.
  - A **link** (paper clip) icon adds a **Link** or an **Iframe** card.
  - Filters.
  - **Sections**, which are "templates with headings and pre-arranged cards": KPI Grid, Large chart with KPIs, KPIs with large chart below.
- **Card types:**
  - A Heading "spans the width of the dashboard". It takes no Markdown, and its text stays one size when the card is resized ([Heading and text cards][mb-md]).
  - Text cards edit in place: "Click a card to edit… click away… to preview" ([Heading and text cards][mb-md]).
- **Where new cards land:** not published.

**3. Layout manipulation**

- **Moving and resizing** ([Dashboards intro][mb-dash]):
  - Move: "click and drag the card. Other cards will move out of the way."
  - Resize: "click the handle at the bottom right corner."
- **Grid:** 24 columns. The size presets include `full` 24×9 and `tall` 9×12 ([issue #82648][mb-grid-issue]).
- **Implementation** ([GridLayout source][mb-gridlayout], [grid utils][mb-gridutils]):
  - It wraps `react-grid-layout`.
  - The whole card is the drag surface, except elements marked `[data-dontdrag]`.
  - Dragging and resizing are off on mobile, and the mobile layout stacks cards at x = 0.
- **Tabs** ([Dashboards intro][mb-dash]):
  - Duplicate a tab and its cards from the down-arrow next to the tab.
  - Move a card to another tab with its **move** icon.
  - Renaming, reordering and nesting tabs are not published.

**4. Card hover chrome**

- **Edit mode** ([Dashboards intro][mb-dash], [Interactivity][mb-inter]):
  - **Duplicate**, **Move** (to a tab), **Replace**, **X** (remove)
  - **pencil** or **palette** for visualization settings
  - a **click behavior** icon
- **View mode:** not published on the pages read.

**5. Creating and editing a chart from the dashboard**

- **Editing a card:** in edit mode, the card's **pencil** opens the **visualizer**. It is a **full-screen modal** (`size="100%"`) layered over the dashboard ([Multiple series][mb-viz], [VisualizerModal source][mb-vmodal]).
- **Visualizer header** ([Header source][mb-vheader]):
  - sidebar toggle
  - editable title ("Add a title")
  - **Undo** and **Redo**
  - **Add to dashboard** (the label can be changed)
  - close
- **Closing with changes** asks "Are you sure you want to leave? Any unsaved changes will be lost." ([VisualizerModal source][mb-vmodal]).
- **Ownership:**
  - Card visualization changes "only affect how the question appears on that dashboard card" ([Multiple series][mb-viz]).
  - Since 53, questions are saved **into a dashboard by default**. They are then "only visible in that dashboard" and can't be reused elsewhere, while collection questions can go on many dashboards ([Questions][mb-q], [Metabase 53][mb-53]).
  - After saving a question to a dashboard, "you'll need to arrange the card on one of the dashboard's tabs, then save the dashboard" ([Questions][mb-q]).
  - The two scopes can collide. v1.63.16.3 blocked saving a dashboard question that was also used on other dashboards ([issue #82237][mb-82237]).
- **Return path** from "+ New question" (the full query builder): not published.

**6. Chart editor anatomy**

- **Visualizer panes** ([Visualizer source][mb-vroot], [Footer source][mb-vfooter], [Multiple series][mb-viz]):
  - **Left:** a data sidebar with **Manage data** and **Add more data**. Compatible questions show a **+**.
  - **Centre:** a canvas whose wells take drops (dnd-kit).
  - **Footer:** a **visualization picker** and a **Settings** toggle.
  - **Right:** a settings sidebar.
- **Query builder (notebook)** ([local observations][local]):
  - Stacked steps: **Data**, **Filter**, **Summarize** ("Pick a function or metric" _by_ "Pick a column to group by").
  - Then sort and limit, and a **Visualize** button.
- **Chart types** ([Visualizing results][mb-vis]):
  - The query builder picks the type automatically.
  - The picker lists sensible types first; the rest sit under **More charts**.
- **Settings:** tabs **Data / Display / Axes** ([Visualizing results][mb-vis], [local observations][local]). **Reset to defaults** is at the bottom right ([Dashboards intro][mb-dash]).
- **Search within settings:** not published.

**7. Keyboard, accessibility, responsiveness**

- The mobile grid is read-only and stacked ([GridLayout source][mb-gridlayout], [grid utils][mb-gridutils]).
- The Settings toggle exposes `aria-pressed` ([Footer source][mb-vfooter]).
- Keyboard shortcuts: not published.

[mb-63]: https://www.metabase.com/releases/metabase-63
[mb-53]: https://dev.to/metabase/metabase-53-save-questions-to-dashboards-dynamic-iframe-cards-preemptive-caching-and-more-4l49
[mb-dash]: https://www.metabase.com/docs/latest/dashboards/introduction
[mb-md]: https://www.metabase.com/docs/latest/dashboards/dashboard-markdown
[mb-inter]: https://www.metabase.com/docs/latest/dashboards/interactive
[mb-viz]: https://www.metabase.com/docs/latest/dashboards/multiple-series
[mb-q]: https://www.metabase.com/docs/latest/questions/introduction
[mb-vis]: https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results
[mb-vmodal]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/visualizer/components/VisualizerModal/VisualizerModal.tsx
[mb-vheader]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/visualizer/components/Header/Header.tsx
[mb-vroot]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/visualizer/components/Visualizer/Visualizer.tsx
[mb-vfooter]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/visualizer/components/Footer/Footer.tsx
[mb-gridlayout]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/dashboard/components/grid/GridLayout.tsx
[mb-gridutils]: https://github.com/metabase/metabase/blob/master/frontend/src/metabase/dashboard/components/grid/utils.ts
[mb-grid-issue]: https://github.com/metabase/metabase/issues/82648
[mb-undo]: https://github.com/metabase/metabase/pull/52781
[mb-82237]: https://github.com/metabase/metabase/issues/82237

### Power BI (report editing)

**1. Entering and leaving edit mode**

- **Modes:** the service has **Reading view** for consumers and **Editing view** for authors. Authors click **Edit** to enter it ([Editing view][pbi-edit], [Add visuals][pbi-add]).
- **Saving:** "save the report as you would any other" ([Copilot doc][pbi-copilot]).
- **Undo/redo:** Microsoft's pages mention it only for Copilot actions ([Copilot doc][pbi-copilot]). General undo shortcuts are not listed in the keyboard reference ([Keyboard shortcuts][pbi-keys]); not published in the sources read.
- **Canvas aids:** **Show gridlines**, **Snap to grid** (Desktop: **Snap objects to grid**) and **Show smart guides**, all in the **View** menu ([Gridlines][pbi-grid]).

**2. Adding things**

- **Ways to start a visual** ([Report editor tour][pbi-tour], [Add visuals][pbi-add]):
  - Select a type icon in the **Visualizations** pane.
  - Check fields in the **Data** pane; Power BI picks the type.
  - Drag a field onto the canvas.
- **With on-object interaction:** the Insert ribbon or **Visual gallery**, or right-click the canvas → **Add visual** / **Paste** ([On-object][pbi-oo]).
- **Other items:** text boxes, shapes and buttons. Pages are added with the green **+** at the bottom ([Editing view][pbi-edit], [Add visuals][pbi-add]).
- **Where new visuals land:** not published.

**3. Layout manipulation**

- **Free-form pixel canvas** ([Move and resize][pbi-move], [Keyboard shortcuts][pbi-keys]):
  - Move a visual by dragging "any area" of it.
  - Resize by dragging the "dark frame handles".
  - Shift plus a handle keeps the aspect ratio.
- **Arranging** ([Gridlines][pbi-grid], [Keyboard shortcuts][pbi-keys], [Format pane General][pbi-general]):
  - Snap-to-grid is optional. Smart guides show centre and edge alignment against neighbours.
  - Align and distribute tools; z-order through the **Selection** pane.
  - **Group** visuals with `Ctrl+G`.
  - Exact **Height, Width** and **Position** in px under Format → General → **Properties**.
- **Pages** are the tabs. You can add, rename, rearrange, duplicate and delete them in Editing view ([Editing view][pbi-edit]). Pages don't nest.

**4. Visual header chrome**

- **Reading mode:** a configurable row of header icons ([Format pane General][pbi-general]):
  - Visual information, warning and error
  - the drill controls
  - Pin, **Focus mode**, See data layout, **More options (…)**, **Filter**, Help tooltip, Smart narrative, Copilot summary
- **Service extras:** Comment, Personalize, Copy and Set alert ([Format pane General][pbi-general]).
- **Focus mode:** the icon appears on hover ([Move and resize][pbi-move]).

**5. Creating and editing a chart from the report**

- **There is no separate editor.** You select a visual on the canvas, and the **Visualizations** pane edits it with three tabs: **Build visual**, **Format visual**, **Analytics** ([Report editor tour][pbi-tour]).
- **On-object (preview)** ([On-object][pbi-oo]):
  - A **Build a visual** button next to the visual opens a flyout with **Add data** and **Visual types**.
  - "Selecting a visual type yourself turns off the automatic **Suggest a type** toggle."
  - **Format mode** is entered by double-click. The bounding box turns blue and the handles become squares. It is kept separate so hover and click can still cross-filter.
- **Ownership:** visuals belong to their report page, so there is no shared chart object to overwrite ([Report editor tour][pbi-tour]).

**6. Chart editor anatomy**

- **Data pane:** tables and fields. A checkmark adds a field to the visual, and Power BI chooses the well ([Report editor tour][pbi-tour]).
- **Field wells** change by type, for example **Axis / Legend / Values**. **Values** only takes numbers, so a category dropped there becomes **Count of Category** ([Report editor tour][pbi-tour]).
- **Aggregation** is chosen from a dropdown per field ([On-object][pbi-oo]).
- **Format visual** has **Visual** and **General** tabs. General has Properties, Title, Effects, Data format, Header icons, Tooltips and Alt text ([Format pane General][pbi-general]). Each section has **Reset to default** ([Titles and legends][pbi-title]).
- **Filters pane:** visual, page, report and drillthrough levels ([Report editor tour][pbi-tour]).
- **Search in the Format pane:** not confirmed on Microsoft pages read.

**7. Keyboard, accessibility, responsiveness**

- **Shortcuts** ([Keyboard shortcuts][pbi-keys]):
  - `Ctrl+F6` cycles sections. `Ctrl+Right` enters a visual. `Alt+Shift+F10` opens the visual menu. `Alt+Shift+F11` shows data.
  - In edit mode, **arrow keys move and resize** a visual, and **Shift+arrow** makes bigger moves.
  - `Shift+?` lists shortcuts.
- **Accessibility gaps:** on-object interaction states "Full accessibility isn't currently supported". Format mode doesn't work in mobile layout or focus mode ([On-object][pbi-oo]).
- **Alt text:** a per-visual field, which can be expression-based ([Format pane General][pbi-general]).

[pbi-tour]: https://learn.microsoft.com/en-us/power-bi/create-reports/service-the-report-editor-take-a-tour
[pbi-edit]: https://learn.microsoft.com/en-us/power-bi/create-reports/service-interact-with-a-report-in-editing-view
[pbi-add]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-report-add-visualizations
[pbi-oo]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction
[pbi-grid]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-gridlines-snap-to-grid
[pbi-keys]: https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-keyboard-shortcuts
[pbi-general]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-format-pane-overview
[pbi-move]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-move-and-resize
[pbi-title]: https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-customize-title-background-and-legend
[pbi-copilot]: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-reports

### Looker (user-defined dashboards)

**1. Entering and leaving edit mode**

- **Entering:** **Edit dashboard** from the ⋯ menu. A blue toolbar appears with **Add**, **Filters**, **Settings**, **Quick layout**, **Style**, **Cancel** and **Save** ([Editing dashboards][lk-edit]).
- **Saving:** **Save** turns on after the first change, and it saves and exits edit mode ([Editing dashboards][lk-edit]).
- **Undo:** not published.

**2. Adding things**

- **Add menu:** Visualization, Text (rich text or Markdown), Button, Tabs ([Editing dashboards][lk-edit], [Creating dashboards][lk-create], [Tabbed dashboards][lk-tabs]).
- **Where new tiles land:** "at the bottom of the dashboard" ([Editing dashboards][lk-edit], [Creating dashboards][lk-create]).

**3. Layout manipulation**

- **Move and resize** ([Editing dashboards][lk-edit]):
  - Move by the **six-dot icon at the tile's upper left**. Blue grid lines appear, and Looker "displays the width and height of each tile, as well as the percentage of the total dashboard width".
  - Resize from the bottom-right corner.
- **Size presets** ([Editing dashboards][lk-edit]):
  - The Tile actions menu offers Extra small to Extra Large.
  - **Quick layout** sets every tile to one size: XS fits six per row, S four, M three, L two, XL one.
- **Tabs** ([Tabbed dashboards][lk-tabs]):
  - Rename by double-click; names must be unique.
  - Reorder with ⋯ → **Move left / Move right**.
  - Delete with confirmation. **Duplicate** needs 26.8.
  - The default maximum is **5 tabs**, which admins can raise. Looker recommends 10 or fewer, with up to 20 tiles per tab.
  - Tiles load only when their tab is opened. Tiles move with **Move to tab**.
  - Nested tabs: not published.

**4. Tile chrome**

- **Edit mode:** the ⋯ **Tile actions** menu at top right. It offers **Edit**, Duplicate tile, Hide/Show title, Add/Edit note, Move tile, Move to tab, Delete or Remove Look, and View ([Editing dashboards][lk-edit]).
- **View-mode icons:** not published on the pages read.

**5. Creating and editing a chart from the dashboard**

- **Where it opens:** Add → Visualization → pick an Explore. A tile editor opens in the dashboard, with Title, field picker, filters, visualization, **Run** and **Save**. The new tile lands at the bottom ([Creating dashboards][lk-create]).
- **Editing:** **Edit** changes "a tile's underlying query… directly in the dashboard" ([Editing dashboards][lk-edit]).
- **Ownership** ([Editing dashboards][lk-edit]):
  - Query tiles are local to the dashboard.
  - For a **Look-linked** tile, the **Edit Look** toolbar "displays the dashboards containing tiles that are linked to that Look. Those dashboards will be affected by your changes."

**6. Chart editor anatomy**

- The Explore field picker (dimensions and measures), filters, the visualization bar and **Run** ([Creating dashboards][lk-create]).
- Further detail: not published on the pages read.

**7. Keyboard, accessibility, responsiveness:** not published on the pages read.

[lk-edit]: https://docs.cloud.google.com/looker/docs/editing-user-defined-dashboards
[lk-tabs]: https://docs.cloud.google.com/looker/docs/tabbed-dashboards
[lk-create]: https://docs.cloud.google.com/looker/docs/creating-user-defined-dashboards

## Cross-product patterns

**Shared by all or most**

1. **Explicit edit mode with its own header.** All five have one.
   - Every product has a Save and Cancel/Discard pair.
   - Undo/redo exists in Superset (header buttons plus shortcuts) and the Metabase visualizer (header buttons). Grafana's is in progress. Metabase uses an undo toast on removal.
2. **Snapping column grids.**
   - Grafana (Custom layout) and Metabase use **24** columns. Superset uses **12**.
   - Looker draws grid lines; its column count is not published.
   - Power BI is the outlier: free pixels, with optional snapping.
3. **Moving and resizing.**
   - Everyone resizes from the **bottom-right corner**. Superset adds right-edge and bottom-edge handles.
   - Two products show a size readout during the gesture: Looker (width, height and % of dashboard) and Superset (height in px).
4. **Tabs everywhere.**
   - Superset and Looker load inactive tabs lazily.
   - Tiles move between tabs by a "Move to tab" menu (Looker, Metabase) or by dropping on the tab label (Superset).
5. **Charts are edited without leaving the dashboard** in four of five products:
   - Grafana: full-view editor in place.
   - Metabase: full-screen modal.
   - Looker: in-dashboard tile editor.
   - Power BI: panes on the canvas.
     Only Superset navigates to a separate page with its own Save.
6. **Dashboard-local charts by default, sharing by choice.**
   - Grafana panels, Metabase dashboard questions (since 53), Looker query tiles and Power BI visuals are all local.
   - Shared objects are opt-in: Grafana library panels, Metabase collection questions, Looker Looks.
   - Looker shows who is affected ("dashboards… will be affected"). Superset alone shares by default and overwrites without that notice.
7. **Automatic chart type that a manual pick overrides.**
   - Grafana: Suggestions is the default for new panels.
   - Power BI: "Suggest a type", which switches off after a manual pick.
   - Metabase: auto-selection, then "More charts".
   - Superset only has a static "Featured" list.
8. **Preview with a table toggle.** Grafana has Table view, Superset has Results/Samples, and Metabase has a table/chart switch.

**Things only one product does**

- **Grafana:** the structural **outline**; a selection-aware sidebar (title and description editable without opening the panel editor); section-level filters and variables; show/hide rules; panel previews at "Actual" dashboard size.
- **Superset:** nested tabs, including tabs inside columns; column guides while resizing; explicit empty-state copy with a Create button.
- **Metabase:** **section templates**; combining several questions into one card in the visualizer; a Heading card whose text size stays fixed.
- **Power BI:** on-object format mode; smart guides; a full keyboard move/resize table; per-visual Alt text.
- **Looker:** a live size-and-percentage readout while dragging; a tab-count guardrail; the blast-radius toolbar for shared Looks.

## Recommended wechart interaction model

> **Direction:** A Grafana-13-style in-place editor.
>
> - An explicit edit mode docks a right sidebar with three tabs: **Add**, **Outline** and **Properties**.
> - The canvas is a WYSIWYG 12-column grid organized into **tabs** and collapsible **sections**, sized only by direct manipulation.
> - Each tile's **pencil** opens a **full-viewport chart editor that belongs to the dashboard draft**: Superset's Explore anatomy with Metabase-visualizer-style undo/redo, returning through **Back to dashboard**.

**Why this model**

- **It matches the user's asks one for one:**
  - tabs and sections
  - add a chart from the dashboard
  - pencil → chart editor
  - Superset's chart type, cube/view, metrics and dimensions
  - WYSIWYG sizing with no inline width control
- **It follows the majority pattern** (pattern 5): four of five products edit charts in the dashboard's context. The one that doesn't, Superset, makes the user save a shared chart in another page or window and then come back ("Save & go to dashboard"). That breaks the WYSIWYG loop the user asked for.
- **It keeps the direction's committed three-pane workbench** (`direction.md` §2): a typed tree, a live canvas and a docked inspector. The chart editor _is_ that workbench, opened on a single tile.

**Revisions to `direction.md` that this model implies**

- §2 "Width presets are 2, 3, 4, 6 and 12 columns" is **removed from tile chrome**. Width comes from dragging only.
- §2 "Structure uses the Superset element tree: Tabs, Section (Row or Column)…" becomes **Tabs + Section (+ Header, Markdown, Divider)**. There are no author-facing Row/Column containers.

### Edit-mode chrome

- **Entering edit mode:** the dashboard header's **Edit** button, or clicking any pencil. Evidence: Grafana **Edit**, Superset **Edit Dashboard**, Metabase pencil, Looker **Edit dashboard**.
- **The edit bar** replaces the title row with: `Editing <dashboard name>` · **Undo** · **Redo** · **Discard** · **Save**. The order follows Superset 6's header ([Header source][ss-header]).
  - **Save** persists and returns to view mode, as in Looker ([Editing dashboards][lk-edit]).
  - **Discard** reverts to the last save and exits. When there are unsaved changes, it first asks, naming how many changes will be lost. Evidence: the Superset 6.0 unsaved-changes modal ([6.0 release][ss-60]) and the Metabase "Are you sure you want to leave?" dialog ([VisualizerModal][mb-vmodal]).
  - Navigating away with unsaved changes prompts the same way ([6.0 release][ss-60]).
- **The sidebar** is docked on the right in edit mode (Grafana: "docks in edit mode") and uses the inspector width from `direction.md` §2. It has three tabs:
  1. **Add:** the element palette, described below.
  2. **Outline:** a searchable tree of Tabs > Sections > tiles. Click to scroll to and select an item; keyboard reordering is supported. Evidence: Grafana's content outline ([Create dashboards][gf-create]).
  3. **Properties:** the selected item's settings.
     - Tile: title, description, a collapsed **Layout** group (read-only size and position plus keyboard hints), and filter scope.
     - Section: title, collapsed by default, hide header, section filters.
     - Tab: title.
       Evidence: Grafana's context-aware pane edits title and description without the panel editor ([Grafana 12.4][gf-124]).
- **The canvas in edit mode:**
  - A faint 12-column background appears ("a grid appears", [Metabase][mb-dash]).
  - Full-height column guides show during any drag or resize ([Superset `grid-column-guide`][ss-grid]; Looker's blue grid lines).
  - The selected tile gets a 2 px `accent` outline (Grafana: blue selection outline). Shift-click multi-selects ([Grafana][gf-groups]).
  - Clicking a mark in edit mode **selects the tile; it does not cross-filter**. Power BI splits format mode from cross-filtering for the same reason ([On-object][pbi-oo]).

**Tile chrome**

| Mode | Left of header                                                                                                     | Right of header, on hover or focus                                                                                                               | Always visible                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View | Title, plus an **ⓘ** icon when there is a description (Grafana, Superset)                                          | **Pencil** (for editors); **⋯** with Refresh, View full screen, View as table, View query (Cube JSON + SQL), Download, Copy link, **Edit chart** | The filter indicator when filters act on the tile (Superset filters badge, Power BI Filter icon); the cache/pre-aggregation badge (`direction.md` §9 rule 19) |
| Edit | A **six-dot grip**, visible on hover. The whole header strip is the drag area (Looker grip, Grafana drag-by-title) | **Pencil**; **⋯** with Duplicate, Move to tab…, Move to section…, Copy, Delete                                                                   | Resize handles on the right edge, bottom edge and bottom-right corner, shown on hover or selection (Superset `ResizableContainer`)                            |

- **No width, height or preset control appears on the tile.** This is the user's instruction. It also rejects the Looker-style size-preset menus.
- **Deleting a tile** (Delete key or menu) shows an undo toast ([Metabase PR #52781][mb-undo]). The action is also on the Undo stack.

### The add flow

- **Palette entries (sidebar → Add):**
  - **Chart (new)**
  - **Chart from library** (see ownership below)
  - **Tabs**
  - **Section**
  - **Header**
  - **Markdown**
  - **Divider**
  - **Filter** (goes to the filter bar with a scope badge, per `direction.md`)
    These elements come from Superset's layout elements and Grafana's Add menu, minus Row/Column.
- **Three equivalent ways to insert:**
  1. **Click** a palette entry. It inserts **after the current selection, in the same section**. With nothing selected, it inserts at the end of the active tab. It is then selected and scrolled into view. Looker and Metabase always append at the bottom; inserting at the selection keeps the insert where the author is working.
  2. **Drag** a palette entry onto the canvas. A placeholder footprint shows where it will land (Superset drop indicators; Grafana 13 drag-from-sidebar).
  3. **Inline "+" slots:** in every empty section or tab ("Add a chart" / "Add a section"), plus a "+" after the last tile of a section on hover. Evidence: Grafana's "+ Add panel / + New row / + New tab" hover affordances; Superset's empty states with **Create a new chart**.
- **Chart (new)** places a 4-column placeholder tile ([Superset `GRID_DEFAULT_CHART_WIDTH = 4`][ss-const]) and **opens the chart editor on it immediately**. Grafana's **Configure visualization** does the same ([Create dashboards][gf-create]).
  - If the user goes **Back** without choosing a measure or dimension, the placeholder is removed and nothing is added to the history.
- **Group into section:** multi-select tiles, then **Group into section** in Properties ([Grafana multi-select grouping][gf-multi]).

### Drag, resize and snap rules

| Rule                  | Value                                                         | Provenance                                                                                 |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Columns               | 12                                                            | Superset `GRID_COLUMN_COUNT`; `direction.md` §2                                            |
| Row unit              | 8 px                                                          | Superset `GRID_BASE_UNIT`; `direction.md` §2                                               |
| Gutter                | 16 px                                                         | Superset `GRID_GUTTER_SIZE`; `direction.md` §2                                             |
| New chart tile width  | 4 columns                                                     | Superset `GRID_DEFAULT_CHART_WIDTH`                                                        |
| New chart tile height | Keep the prototype's current default                          | Superset's default height isn't in the constants read; not published                       |
| Header / Divider      | Full section width by default; min 1 column × 5 units (40 px) | Metabase Heading "spans the width"; Superset `GRID_MIN_COLUMN_COUNT`, `GRID_MIN_ROW_UNITS` |
| Chart tile minimum    | Set per chart type at prototype review                        | None of the studied products publishes a per-chart-type minimum                            |

- **Moving:**
  - Drag by the header. Other tiles in the section **reflow vertically** out of the way ([Metabase][mb-dash]).
  - There is no free-form overlap or z-order (see "What it rejects").
  - Dropping onto a **tab label** moves the tile into that tab and switches to it ([Superset `handleDropOnTab`][ss-tabs]).
  - Dropping into another section moves it there.
- **Resizing:**
  - Use the right edge, the bottom edge or the corner.
  - Width snaps to whole columns on release. Height snaps to 8 px units during the drag ([Superset `ResizableContainer`][ss-resize]).
  - **A live readout** near the cursor shows, for example, `6 / 12 cols · 50% · 320 px`. This combines Looker's width/height/% readout and Superset's pixel label. It is the WYSIWYG replacement for width presets.
- **Keyboard parity** (Power BI moves and resizes with the arrow keys in edit mode, [Keyboard shortcuts][pbi-keys]). With a tile focused:
  - **Arrow keys** move it one column or one row unit.
  - **Shift+Arrow** resizes it by one unit.
  - **Enter** focuses Properties. **E** opens the chart editor (Grafana `e`). **Delete** removes it.
  - Each keyboard step announces the new size in the same readout format through a live region.

### Tabs and sections behaviour

- **The container rules follow Grafana's grammar** ([Dashboard groupings][gf-groups]), limited to three levels as in the Grafana 13 blog ([Grafana 13][gf-13]):
  - The dashboard root holds tiles, sections, or one tab group.
  - A **tab** holds tiles or sections.
  - A **section** holds tiles or one tab group.
  - **A tab group can't be the direct child of a tab**, following Grafana's rule.
  - No more than three container levels.
- **Tabs:**
  - Add with **+** at the end of the strip. Rename by double-click (Looker) or by editing the title in place (Superset). Reorder by dragging (Superset).
  - **Duplicate** from the tab menu (Metabase, Looker 26.8).
  - Delete with a confirmation that names the number of tiles removed and says Undo restores them. The wording follows Superset.
  - Inactive tabs load lazily (Superset, Looker).
  - There's no tab-count cap: none of the studied products justifies one on user grounds, and Looker's cap of 5 is an admin guardrail. The strip overflows into a "More tabs" menu.
- **Sections:**
  - A titled header with a **collapse toggle**, which Grafana rows have and Superset rows lack.
  - An optional **Hide header in view mode**. As in Grafana, a hidden header also turns off collapse, and edit mode shows hidden headers in crossed-out form.
  - Section-scoped filters appear as scope "section" in the filter badges, extending `direction.md`'s dashboard/tab/tile scopes. Evidence: Grafana section-level filters.
  - **Delete section** asks whether to **Delete section and its N tiles** or **Ungroup (keep tiles)**. This makes Grafana's "deleting removes, ungrouping keeps" distinction explicit ([Dashboard groupings][gf-groups]).
  - **Section templates** (KPI row, big chart with KPIs) sit in the Add palette ([Metabase sections][mb-dash]; already in `direction.md`).
- **Header / Markdown / Divider:**
  - Markdown edits in place and previews on blur (Metabase text cards; Superset's Markdown preview).
  - It uses `direction.md`'s typed live-value tokens and no raw HTML.

### The pencil → chart editor flow and its return path

- **Opening the editor:**
  - From **edit mode**, the pencil opens the editor on that tile.
  - From **view mode**, the pencil first switches the dashboard into edit mode, then opens the editor. Grafana's `e` from view mode does the same ([Use dashboards][gf-use]).
- **Where it opens:** a **full-viewport editor at its own URL**, for example `/dashboards/:id/edit/tiles/:tileId`. It replaces the dashboard canvas and keeps the dashboard as its context, as Grafana's panel editor does. Browser Back, reload and deep links all work.
  - It carries in the dashboard's active filters, and the tile's scoped filters, so the preview matches the tile.
- **Editor header:**
  - **← Back to "<dashboard>"** applies the edit to the dashboard draft ([Grafana **Back**][gf-editor]).
  - The tile title, editable ([Metabase "Add a title"][mb-vheader]).
  - **Undo** and **Redo** for this editing session ([Metabase visualizer][mb-vheader]).
  - **Discard changes** reverts this tile to its state when the editor opened ([Grafana **Discard**][gf-editor]).
  - **Save dashboard** applies the edit and saves the whole dashboard ([Grafana **Save**][gf-editor]).
  - `Esc` means Back (Grafana `Esc`).
- **Returning:**
  - Back lands in dashboard edit mode with the tile **selected and scrolled into view**.
  - The whole editor session is **one step on the dashboard's Undo stack**, labelled "Edit chart <title>".
- **Ownership:**
  - **The chart spec belongs to the tile by default.** This is the majority pattern: Grafana panels, Metabase dashboard questions, Looker query tiles.
  - **Save to library** is the explicit exception. It makes the chart shared.
  - Editing a library-linked tile shows a header banner: "Library chart · used on N dashboards: <list>", with **Unlink** (Looker's Edit Look toolbar; Grafana's **Unlink library panel**).
  - This rejects Superset's shared-by-default slices, which overwrite without warning ([SaveModal][ss-save]).

### The chart editor: layout and steps

- **Layout:** the `direction.md` workbench.
  - **Left:** the source and member tree, 280 px. Superset measured 300 px.
  - **Centre:** the live preview.
  - **Right:** the inspector, 320 px. Superset measured 320 px.
  - **Bottom drawer:** **Results**, **Query** (Cube JSON plus generated SQL) and **Performance** (pre-aggregation hit, cache age).
- **The preview is WYSIWYG:**
  - It shows the tile at its **actual dashboard size** by default, with a **Fit** toggle (Grafana **Actual / Fill** ([AWS v12][gf-aws12])).
  - It has a **Chart / Table** toggle (Grafana Table view; Superset Results).
  - It re-queries on every committed change: a pill drop, a menu pick or a filter apply. It never re-queries on keystrokes, and there is no manual Run. Grafana, Metabase's visualizer and Power BI all preview live; Superset's Run step breaks the WYSIWYG loop.
- **Left pane:**
  1. **Source**, a cube/view picker: search, grouped into Views and Cubes, each showing its description.
  2. **Member tree:** Measures (Σ), Dimensions (type icons), Time dimensions (clock) and Segments, with search.
  - Every member can be dragged to a well or added with **+** (`direction.md` rule 11).
- **Inspector, Data tab**, in this order:
  1. **Chart type.** Shows "Auto · recommended" with the one-line reason.
     - Clicking it opens a picker with **Suggestions** and **All charts** tabs and a search box ([Grafana picker][gf-vizpicker]).
     - Suggestions show runners-up with reasons (`direction.md` §6).
     - A manual pick pins the type until **Back to recommended** (Power BI's toggle rule; `direction.md` rule 10).
     - The type can be chosen **before** any member, which keeps Superset's type-first path.
  2. **Measures:** one or more ([Superset **Metrics**][ss-cp]).
  3. **Dimensions:** any number. None is allowed for KPI types ([Superset **Dimensions**][ss-cp]).
  4. **Time:** time dimension, granularity and date range ([Superset **X-axis / Time grain**][ss-cp]).
  5. **Filters and segments.**
  6. **Sort, row limit, and series limit** with "Other" (Superset **Series limit / Sort / Row limit**; `direction.md` palette rule).
  7. **Encoding:** a type-specific mapping of members to channels (X, Y, Color, Size, Trellis…). Wells highlight legal and illegal drops (`direction.md` §7). Evidence: Power BI's wells vary by type.
- **Inspector, Customize tab:**
  - A **Search options** box filters every section ([Grafana PanelOptionsPane][gf-optpane]).
  - A **Show only changed** filter ([Grafana "Show only overrides"][gf-optpane]).
  - Sections: Title & description, Legend, X axis, Y axis, Tooltip, Data labels, Colors, Number format, Reference lines, Trellis, Accessibility (Alt text, from [Power BI][pbi-general]). This is a superset of Superset's Customize sections ([controlPanel][ss-cp]).
  - Each section has **Reset to default** (Power BI, Metabase).
- **Steps for a new chart:**
  1. Add → Chart. A placeholder tile appears and the editor opens.
  2. The **Source picker has focus**, and the canvas empty state reads "Pick a cube or view to start".
  3. Add measures and dimensions. The chart draws itself with the recommended type.
  4. Optionally pick the type, time, filters and customizations.
  5. **Back to dashboard**. The tile renders in its slot, selected.
  6. **Save** on the dashboard edit bar.
     There is no wizard page before the editor (see "What it rejects").

### Accessibility and responsiveness

- **Every drag has a non-drag equivalent:**
  - palette click-insert
  - the tile menu's **Move to tab… / Move to section…** (Looker, Metabase)
  - keyboard move and resize
  - Outline reordering
    The inspector remains the complete path to every setting (`direction.md` principle 5). Power BI's on-object mode is the counter-example: it states that full accessibility isn't supported.
- **Shortcuts:**
  - `E` edit the focused tile, `V` full screen (Grafana)
  - `⌘Z` / `⇧⌘Z`
  - `⌘S` save (Grafana `Ctrl+S`)
  - `Esc` back or exit
  - `?` shortcut sheet (Grafana `?`; Power BI `Shift+?`)
  - `F6` cycles panes (`direction.md`; Power BI `Ctrl+F6`)
- **Responsive:** editing needs a viewport of at least 1024 px (`direction.md` breakpoints). Narrower viewports are view-only, with tiles stacked in one column. Metabase also disables dragging on mobile and stacks cards ([GridLayout][mb-gridlayout]).

### Points for the spec to confirm with the user

These are proposals, not decided requirements:

1. Dashboard-owned charts by default, with an opt-in library.
2. Whether the pencil shows in view mode for every editor.
3. The three-level nesting limit.
4. Whether Image, Link or iframe elements (Metabase) are in scope beyond the elements the user named.

## What it rejects

- **Inline width controls and size presets on tiles** (the prototype's 2/3/4/6/12 presets; Looker's XS–XL tile menu and Quick layout). The user rejected inline width explicitly. Direct manipulation with a live readout gives the same precision, and the keyboard covers accessibility.
- **Superset's Explore round trip** for charts on a dashboard: a separate page or new window, its own Save modal, "Save & go to dashboard", and shared slices overwritten with no cross-dashboard notice. It breaks the WYSIWYG loop and hides the blast radius of a change.
- **Superset's Row and Column containers as authoring primitives.** Authors have to build Row → Column → chart trees to place tiles side by side. The user asked for tabs and sections, and a grid with vertical reflow (Grafana Custom, Metabase) puts tiles side by side with no container.
- **Grafana Auto grid as an authoring mode.** Panel sizes are computed from min width, row height and max columns, not placed. The author loses the "what I size is what they see" guarantee the user asked for. Narrow screens get automatic single-column stacking in view mode instead.
- **Power BI's free-form pixel canvas** with overlap, z-order and optional snapping. Overlap needs alignment, distribution and layer tools to stay tidy. It can't stack cleanly on narrow screens. And tile rhythm is no longer guaranteed by the grid (`direction.md` rule 15).
- **A modal chart editor** (Metabase visualizer, Looker tile window). The visual shape is kept: full viewport, three panes, undo/redo in the header. But the editor is a routed state of the dashboard editor, so browser Back, reload and deep links behave predictably.
- **Title click as the way into the editor** (Superset). It clashes with drag-by-header and rename in edit mode. The user asked for an explicit pencil.
- **A wizard page before the editor** (Superset's "Choose a dataset" → "Choose chart type" page). The editor itself starts with the Source picker focused. Chart type can be picked first or left to the recommender, so both entry orders work in one place.
- **A manual Run button in the chart editor** (Superset **Run / Update chart**). Live preview on every committed change is the norm in Grafana, the Metabase visualizer and Power BI, and it is what WYSIWYG requires.
- **A static "Featured" chart list** as the only guidance (Superset). Data-aware suggestions with reasons (Grafana Suggestions, Power BI Suggest a type, `direction.md` §6) replace it.
