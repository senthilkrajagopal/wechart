# Design references

Date: 2026-09-19. Author: ui-researcher (Phase A of `ui-design`).

**Status of inputs.**

- **Users are provisional.** The requirements interview hasn't happened yet. The three roles used here come from the caller's brief:
  - the **analyst or author**, who builds charts and dashboards
  - the **data or semantic-layer engineer**, who manages models, security, pre-aggregations and connections
  - the **business consumer**, who views and filters dashboards

  The setting is enterprise, and users are likely migrating from Spotfire.

- **No acceptance criteria exist yet**, because `docs/spec.md` hasn't been written. In place of AC IDs, this document cites the user's own words in `/Users/srajagopal/Work/wechart/docs/inputs/2026-09-19-product-direction.md` using these labels:
  - **IN-1:** surface nearly all Cube capabilities (security, pre-aggregations, jobs, connections)
  - **IN-2a:** drag-and-drop authoring
  - **IN-2b:** dashboards with tabs, sections, global filters, cross-table filters, trellis and markdown
  - **IN-2c:** charts drawn automatically, with an override
  - **IN-2d:** legends and x/y axis customization
  - **IN-3:** a Show Me-style top pick plus runners-up, each with a one-line reason, and channel-capacity limits
- **Scope change from the user.** Cube's own UI (Playground, Cube Cloud IDE and screens) is excluded as a design reference. In the user's words, it is "very basic... a starter playground". The semantic-layer patterns below come from enterprise BI tools instead.
- **Source notes.**
  - Some current Spotfire help pages (`docs.tibco.com/pub/sfire-cloud/...`) render client-side and returned empty bodies to the fetcher. Claims attributed to them rely on the official page excerpts returned by search; those are marked "(excerpt)".
  - The Tableau palette blog and the Spotfire community page returned HTTP 403. Their claims also rely on excerpts and are marked the same way.

## Products studied

| Product                                                                                                                | Why chosen                                                                                                                                                                                                                                                                                                                                                                                                                                         | Sources                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spotfire** (14.x; 14.6 is the LTS release from Oct 2025, and 14.7 from Dec 15, 2025 is the latest release confirmed) | This is the user's named reference for trellis, text areas ("markdown") and cross-table filtering, and the probable migration source. Its marking, related-table filtering, trellis modes and text areas with live controls set the behavior bar for IN-2b.                                                                                                                                                                                        | [14.7 release](https://www.spotfire.com/blog/2025/12/15/spotfire-14-7-faster-insights-clearer-visuals-and-a-more-seamless-visual-data-science-experience/), [14.6 release](https://www.spotfire.com/blog/2025/10/20/spotfire-14-6-stability-meets-smarter-insights-with-next-gen-visual-data-science/), [UI overview](https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/the_user_interface.html) |
| **Tableau** (2026.1 features page; Desktop 2026.2 release page)                                                        | Required. It has Show Me (the productized recommender the user cites in IN-3), the Marks card and shelves, the data source page, Prep, and the Jobs page. It is the most widely known authoring model among analysts.                                                                                                                                                                                                                              | [2026.1 features](https://www.tableau.com/2026-1-features), [Desktop 2026.2](https://www.tableau.com/support/releases/desktop/2026.2), [Show Me](https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm)                                                                                                                                                                                                                          |
| **Apache Superset** (6.x; 6.0 announced in Preset's release post, with docs published for 6.1.0)                       | Required. It renders with **Apache ECharts**, the same renderer wechart uses. Its dashboard layout-element tree includes Tabs, Row, Column, Header, Markdown and Divider. It also has native filters and cross-filters, a token-based theme with published defaults, and a dataset editor, database connection flow, RLS, and alerts & reports.                                                                                                    | [6.0 release](https://preset.io/blog/apache-superset-6-0-release/), [6.1 user docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/), [theming](https://superset.apache.org/user-docs/6.0.0/configuration/theming/)                                                                                                                                                                                      |
| **Metabase** (v0.63.x current per the Aug 2026 security release)                                                       | Required. It has a "recommended vs More charts" picker, dashboard tabs, section templates, and text/heading cards with filter variables. On the admin side it has three-level filter scope, table-metadata admin, a permissions grid, and sync/scan schedules.                                                                                                                                                                                     | [Aug 2026 release note](https://www.metabase.com/blog/security-focused-release-announcement-2026-08-12), [dashboards](https://www.metabase.com/docs/latest/dashboards/introduction), [permissions](https://www.metabase.com/docs/latest/permissions/data)                                                                                                                                                                                          |
| **Power BI** (docs updated Jul–Sep 2026; the Fluent 2 base theme is the default for new reports)                       | This is the most common enterprise BI tool. It covers field wells with "Suggest a type", small multiples, the per-target cross-filter/highlight matrix, and the three-level Filters pane. On the modeling side it has model view, TMDL code view, an RLS editor with form and DAX modes plus "Test as role", and refresh schedules and history. It is the only product here that publishes both a UI type ramp (Fluent 2) and chart text defaults. | [visual defaults (Fluent 2)](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults), [on-object](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction), [RLS](https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security)                                                                                                                         |
| **Looker** (26.18 is rolling out, with deployment due by Oct 4, 2026)                                                  | Its BI sits on a semantic model, which makes it the closest analog to BI on a semantic layer. It offers the LookML IDE (dev mode, Git, validator), the Explore field picker, dashboards with tabs, cross-filter chips and Markdown tiles, a connection form, and the **PDT admin page**, which is a direct analog for pre-aggregation build jobs.                                                                                                  | [release notes](https://docs.cloud.google.com/looker/docs/release-notes), [Looker IDE](https://docs.cloud.google.com/looker/docs/looker-ide), [PDT admin](https://docs.cloud.google.com/looker/docs/admin-panel-database-pdts)                                                                                                                                                                                                                     |

**Considered and not studied:**

- **Cube Cloud and Playground:** excluded by the user.
- **Sigma** (spreadsheet-first), **Hex** (notebook-first) and **Omni:** less familiar to a Spotfire-migrating enterprise audience. The six products above already cover all three surfaces with products the target users know.

## Observations per product

### Spotfire

**Layout**

- An analysis is a set of pages. Authors resize and move visualizations freely on each page.
- The authoring bar holds Files and data, the "Data in analysis" panel, Visualization types, Analytic tools (f(x)), Actions, and the Data canvas.
- The right section of the menu bar opens the collaboration, bookmarks and filters panels and the visualization properties.
- A status bar shows the active visualization's main data table. ([UI](https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/the_user_interface.html))
- Page navigation has three modes:
  - **Titled tabs**
  - **Step-by-step**: numbered links plus Next and Previous
  - **History arrows**: navigation through action controls

  ([latest (excerpt)](https://docs.tibco.com/pub/sfire-cloud/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/changing_page_navigation_method.html), [6.5 pages](https://docs.tibco.com/pub/spotfire/6.5.0/doc/html/layout/layout_pages.htm))

- The "Data in analysis" flyout:
  - has a type-to-search data-table selector
  - auto-groups columns into **Numbers, Time, Categories**, which authors can re-categorize
  - lets authors drag columns onto column selectors "indicated with a blue color" or onto drop targets; one axis can take several columns

  ([14.0 Data in analysis](https://docs.tibco.com/pub/sfire-analyst/14.0.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/data/data_in_analysis.htm))

- Release 14.7 added an "enhanced visualization properties panel" that unifies the web and desktop clients. ([14.7](https://www.spotfire.com/blog/2025/12/15/spotfire-14-7-faster-insights-clearer-visuals-and-a-more-seamless-visual-data-science-experience/))

**Type scale.** Not published. The default font comes from the visual theme and can be changed under Canvas styling > Edit custom theme; the default face isn't named in the sources. ([TIBCO KB](https://support.tibco.com/external/article/77152/how-to-find-and-set-the-default-font-use.html))

**Density.** Not published.

**Interaction**

- **Drop targets:**
  - axis selectors on the visualization (X, Y)
  - center targets: Color by, Shape, Size, Line by, Trellis

  ([drag-and-drop](https://docs.tibco.com/pub/sfire-analyst/10.10.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_drag-and-drop.htm))

- **Drop behavior:** dropping _on_ a selector replaces the column. Dropping _next to_ it adds a column. Dragging a selector moves it, and Ctrl-drag copies it. Filters from the Filters panel can be dropped onto targets too. (same source)
- **Recommendations:**
  - Selecting several columns in the flyout gives "recommendations on how you can visualize those columns together". Authors click or drag a recommendation onto the page.
  - Each column has an "Include in recommendations" setting.

  ([expanded flyout (excerpt)](https://docs.tibco.com/pub/spotfire_server/latest/doc/html/en-US/TIB_sfire_bauthor-consumer_usersguide/bauthcons/topics/en-US/the_expanded_data_in_analysis_flyout.html))

- **Trellis:**
  - _Rows and columns_ mode: Rows, Columns, and Pages, where each value becomes a page of panels.
  - _Panels_ mode: split by a column, with optional _Manual layout_ that sets the max rows and max columns visible without scrolling.

  ([14.0 trellis](https://docs.tibco.com/pub/sfire-analyst/14.0.5/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_properties_trellis.htm))

- **Marking:** covered in full, with corrections to this section, in `references-markings.md` (2026-09-19). The UI strings are "Rows must be included in: All markings (AND) / Any marking (OR)", and no source states a default for the nothing-marked option.
  - One or more markings can limit a details visualization. The default combination is intersection; authors can switch it to "Any marking".
  - Marking limits combine with filtering and expression limits using AND.

  ([14.4 (excerpt)](https://docs.tibco.com/pub/sfire-cloud/14.4.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/using_markings_for_data_limiting.html))

- **Nothing-marked state:** "If no items are marked in the master visualization, show:" offers an empty visualization, all data, or a _message on empty background_. No source states which is the default; an earlier version of this line claimed one (corrected per `references-markings.md`). ([details viz](https://docs.tibco.com/pub/spotfire_server/10.10.2/doc/html/en-US/TIB_sfire_bauthor-consumer_usersguide/GUID-AC96305D-FAF3-4690-BF5F-D7660DFE3ADF.html))
- **Filtering in related data tables:**
  - Set per data-table header in the Filters panel. Options are _Include filtered values only_, _Exclude filtered out rows_, and _Ignore filtering_.
  - The icon turns blue when active and red when the relation is invalid.
  - Two-way propagation needs the setting on both tables.

  ([14.3 (excerpt)](https://docs.tibco.com/pub/sfire-cloud/14.3.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/filtering_in_related_data_tables.html))

- **Filter types** include range, check boxes, list box (multi-select with incremental search) and item (a slider, including All/None). ([filter types (excerpt)](https://docs.spotfire.cloud.tibco.com/spotfire/GUID-7A2C2933-E938-495F-9FD9-66A7169E5685.html), [list box](https://docs.tibco.com/pub/sfire-analyst/7.14.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/filter/filter_list_box_filter.htm))
- **Text area:**
  - Holds the page purpose and observations: formatted text, images, action controls, property controls (drop-downs, list boxes, sliders), embedded filters, and **dynamic items** (sparklines, calculated values, icons, bullet graphs).
  - Editing happens in an Edit Text Area dialog. ([14.0 text area](https://docs.tibco.com/pub/sfire-analyst/14.0.4/doc/html/en-US/TIB_sfire-analyst_UsersGuide/text/text_how_to_use_the_text_area.htm))
  - The toolbar is WYSIWYG plus **Edit HTML**. Once an author edits the HTML directly, they are advised to keep using HTML.
  - **The first-party toolbar has no Markdown mode.** ([14.4 toolbar](https://docs.tibco.com/pub/sfire-analyst/14.4.1/doc/html/en-US/TIB_sfire-analyst_UsersGuide/text/text_area_edit_mode.htm)) Markdown in Spotfire comes from the community _Basic Text Area Mod_. ([community (excerpt)](https://community.spotfire.com/articles/spotfire/basic-text-area-mod-for-spotfire/))

**Data-viz defaults**

- **Legend:**
  - Toggled from the title bar. It can run vertically, or horizontally above or below the chart.
  - It contains **column selectors**, so users can change color-by from the legend. Clicking a color box opens a palette.
  - Its contents are configurable, and it shows a data-table selector when there are several tables.

  ([legend](https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/vis/vis_legend.htm))

- **Value axis options:**
  - Min/Max; blank means auto-fit to the filtered data. A "Set to Current Range" button.
  - Include origin, zoom slider, gridlines.
  - Labels horizontal or vertical, with a max number of labels.
  - Left/right placement; reverse scale.
  - Single, dual, or multiple scales (one per color).
  - Log scale isn't available for bar charts.

  ([value axis](https://docs.tibco.com/pub/sfire-analyst/14.0.9/doc/html/en-US/TIB_sfire-analyst_UsersGuide/bar/bar_properties_value_axis.htm))

- **Recent additions:**
  - 14.6: reference elements (thresholds, targets, benchmarks) and violin plots. ([14.6](https://www.spotfire.com/blog/2025/10/20/spotfire-14-6-stability-meets-smarter-insights-with-next-gen-visual-data-science/))
  - 14.7: box plots that show every data point, vertical line charts, and reference elements in legends. ([14.7](https://www.spotfire.com/blog/2025/12/15/spotfire-14-7-faster-insights-clearer-visuals-and-a-more-seamless-visual-data-science-experience/))
- Loading and error states: not published in the sources.

**Semantic layer and admin**

- **Information Designer elements tree:** a folder tree of information links, column elements, filter elements and joins. Right-click to edit or validate. ([elements tree](https://docs.tibco.com/pub/sfire-analyst/11.0.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/id/id_elements_tree.htm), [14.6 information links](https://docs.tibco.com/pub/sfire-cloud/14.6.2/doc/html/en-US/TIB_sfire_client/client/topics/en-US/id_information_links.html))
- **Data canvas:**
  - A node graph of sources, combine operations and data functions. Authors insert rows or columns at a chosen point in the graph.
  - Join types are left outer, left single match, full outer, and inner.

  ([data canvas (excerpt)](https://docs.tibco.com/pub/sfire-cloud/12.4.0/doc/html/en-US/TIB_sfire_client/client/topics/en-US/data_canvas.html), [joins (excerpt)](https://docs.tibco.com/pub/sfire-analyst/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/related_data_tables_joins_and_column_matches.html))

- **Scheduled updates:**
  - Each rule sets days of week, an availability window, check frequency, resource pool, and instance count.
  - A row menu moves a rule to top or bottom, or edits, disables or deletes it. Monitoring views exist.

  ([14.0](https://docs.tibco.com/pub/spotfire_server/14.0.8/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/scheduled_updates_to_analyses.html), [monitoring](https://docs.tibco.com/pub/spotfire_server/14.3.0/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/scheduled_update_monitoring.html))

### Tableau

**Layout**

- **Worksheet areas:**
  - Data pane.
  - Columns and Rows shelves (structure), Filters shelf, Pages shelf.
  - **Marks card:** Color, Size, Label/Text, Detail, Tooltip, Shape. Size and Shape take one field each.
  - Color, Size and Shape legends, parameter controls, title and caption, summary card.

  ([shelves](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm))

- **Dashboard pane:**
  - The sheets list sits at left.
  - Objects: Horizontal and Vertical containers, Text (rich text), Image, Web Page, Blank, Navigation, Download, Extension, Pulse Metric. ([create dashboard](https://help.tableau.com/current/pro/desktop/en-us/dashboards_create.htm))
  - Sizing is Fixed (the default), Range, or Automatic. Objects are **tiled (the default)** or floating. The Layout pane takes x/y pixel positions. Containers offer "Distribute Evenly". ([size and layout](https://help.tableau.com/current/pro/desktop/en-us/dashboards_organize_floatingandtiled.htm))
  - 2026.1 added native corner radius on dashboard objects. ([2026.1](https://www.tableau.com/2026-1-features))

**Type scale.** Not published.

- The Default theme's fonts and sizes aren't documented.
- Custom-theme JSON exposes 23 style elements; its only example sets `"font-family": "Tableau Bold"` and `"font-size": 14`. ([custom themes](https://help.tableau.com/current/pro/desktop/en-us/formatting_custom_themes.htm), [workbook formatting](https://help.tableau.com/current/pro/desktop/en-us/formatting_workbook.htm))

**Density.** Not published.

**Interaction**

- **Pill colors:** blue means **discrete** and creates headers; green means **continuous** and creates axes. Tableau's own help warns that "blue = dimension" is a common misconception. ([blue and green](https://help.tableau.com/current/pro/desktop/en-us/datafields_typesandroles.htm))
- **Show Me:**
  - Evaluates the fields already in the view plus any selected fields, and outlines the recommended type **in orange**.
  - Hovering a type shows its **minimum requirements**. For example, a date and a measure lead to a line chart.

  ([Show Me](https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm))

- **Filter actions:**
  - Run on Hover, Select, or Menu.
  - "Clearing the selection" can keep the filtered values, show all values, or exclude all values.
  - "Use as Filter" generates a filter action in one step.

  ([filter actions](https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm))

**Data-viz defaults**

- Legends appear when a field is on Color, Size or Shape. ([parts of the view](https://help.tableau.com/current/pro/desktop/en-us/view_parts.htm))
- **Edit Axis:**
  - Range: Automatic, **Uniform** (the same range across all panes), **Independent** (per pane), or Fixed.
  - Include zero; Reversed; Logarithmic (Positive or Symmetric).
  - Custom title and subtitle.
  - Major and minor ticks: Automatic, Fixed, or None.

  ([edit axes](https://help.tableau.com/current/pro/desktop/en-us/formatting_editaxes.htm))

- **Palettes:**
  - _Tableau 10_ has 10 hues with varying chroma, a full hue circle, and a lightly tinted gray.
  - _Tableau 20_ is built from light-dark pairs of those hues.
  - Since v10 the default sequential palette is **blue** and the default diverging palette is **orange-blue**.

  ([palette blog (excerpt)](https://www.tableau.com/blog/colors-upgrade-tableau-10-56782), [color help](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties_color.htm))

**Semantic layer and admin**

- **Data source page:**
  - Four parts: left pane, canvas, data grid (the first 1,000 rows), and metadata grid.
  - The canvas has a _logical_ layer, where tables are related with "noodles". Double-clicking a table opens its _physical_ layer for joins and unions.

  ([data source page](https://help.tableau.com/current/pro/desktop/en-us/environment_datasource_page.htm))

- **Prep:** a Flow pane, a Profile pane (binned summaries that expose nulls and outliers), and a Data grid. Selecting a value in the profile filters the grid. ([Prep](https://help.tableau.com/current/prep/en-us/prep_get_started.htm))
- **Jobs page (Tableau Cloud):**
  - Columns: Job ID, status, priority, task type, current run and queue time, average run and queue time.
  - Nine statuses, including _In Progress (Running Late)_, _Pending (Running Late)_ and _Suspended_ (after 5 consecutive failures).
  - Filters: status, task type, time range. Cancel is available, and each job has a detail view.

  ([jobs](https://help.tableau.com/current/online/en-us/server_backgrounder_job_management.htm))

- Extract refresh schedules exist on Tableau Cloud. ([schedule refreshes](https://help.tableau.com/current/online/en-us/schedule_add.htm))

### Apache Superset

**Layout**

- **Explore:**
  - The dataset panel on the left lists columns and metrics.
  - **Data** and **Customize** tabs; a data preview below the chart; a Run button.

  ([6.1 docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/))

- **Chart gallery:** "View all charts", with **Popular** preselected, plus tags such as ECharts, Advanced-Analytics, Statistical and Proportional. ([#15720](https://github.com/apache/superset/issues/15720), [#15734](https://github.com/apache/superset/pull/15734))
- **Dashboard edit mode:**
  - A **Layout elements** tab provides Tabs, Row, Column, Header (small, medium or large), **Markdown** (markdown or HTML with live preview), and Divider. Authors drag these onto the grid.
  - Authors resize a tile by its corner; it snaps to the grid. Tabs also speed up loading.

  ([layout elements (Preset)](https://docs.preset.io/docs/dashboard-customization), [header sizes](https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/constants.ts), [resize](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/))

- **Filter bar:** a vertical sidebar, or a horizontal top bar (introduced in 2.1 behind the `HORIZONTAL_FILTER_BAR` flag). ([2.1 notes](https://preset.io/blog/superset-2-1-release-notes/))
- Dashboards are Draft or Published. ([6.1 docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/))

**Type scale** (published through config and Ant Design v5 source)

- **Fonts:** `fontFamily: "Inter, Helvetica, Arial, sans-serif"` and `fontFamilyCode: "'IBM Plex Mono', 'Courier New', monospace"`.
- **Weights:** 300, 400, 500 (strong) and 700.
- **Overridden sizes:** `fontSizeXS: 8` and `fontSizeXXL: 28`. ([config.py](https://github.com/apache/superset/blob/master/superset/config.py))
- **Other sizes (Ant Design defaults):** base `fontSize` 14. The scale is SM 12, LG 16, XL 20, H5 16, H4 20, H3 24, H2 30, H1 38.
- **Line height:** `(size + 8) / size`, which gives 12/20, 14/22, 16/24, 20/28, 24/32, 30/38, 38/46. These values are _derived by applying the published formula_. ([antd seed tokens](https://ant.design/docs/react/customize-theme), [genFontSizes](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/shared/genFontSizes.ts), [genFontMapToken](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/shared/genFontMapToken.ts))

**Density**

- **Ant Design defaults:** `sizeUnit` 4, `controlHeight` 32 (SM ×0.75 = 24, XS ×0.5 = 16, LG ×1.25 = 40), `borderRadius` 6. ([seed tokens](https://ant.design/docs/react/customize-theme), [genControlHeight](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/shared/genControlHeight.ts))
- **Compact algorithm:** base font = `fontSizeSM` (12) and `controlHeight − 4` (28). ([compact](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/compact/index.ts))
- **Table cell padding** (block × inline): large 16×16, middle 12×8, small 8×8. With a 22 px line, rows come to about 54, 46 and 38 px (_derived_). ([antd Table](https://ant.design/components/table))
- **Dashboard grid:**
  - `GRID_COLUMN_COUNT = 12`, `GRID_BASE_UNIT = 8`, `GRID_GUTTER_SIZE = 16`.
  - `GRID_DEFAULT_CHART_WIDTH = 4`, so a new chart takes 1/3 of the width and three fit per row.
  - Row units run from 5 to 100.

  ([constants.ts](https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/constants.ts))

**Interaction**

- Drag-and-drop in the Explore control panel has explicit valid and invalid drop zones. ([SIP-62](https://github.com/apache/superset/issues/14114))
- **Cross-filtering:**
  - Clicking a chart element filters compatible charts.
  - Applied cross-filters get a **blue indicator**, and the emitting chart shows a double-ringed icon. Active cross-filters are listed in the filter bar.
  - Scope can be all charts or "Apply to specific panels". Cross-filtering can be disabled per dashboard.

  ([cross-filtering](https://preset.io/blog/cross-filtering-in-superset-and-preset/))

- 6.0 added working **undo/redo** for dashboard layout and better unsaved-changes warnings. ([6.0](https://preset.io/blog/apache-superset-6-0-release/))

**Data-viz defaults (ECharts plugin)**

- **Legend:** `showLegend: true`, `legendType: Scroll`, `legendOrientation: Top`.
- **Spacing:** grid offsets are 20 px on each side, and `yAxisPixelsPerTick: 80`.
- **Axes:** x-label rotation choices are 0°, 45° and 90°.
- **Tooltip:** rich tooltip on by default.

  ([constants.ts](https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/constants.ts), [controls.tsx](https://github.com/apache/superset/blob/master/superset-frontend/plugins/plugin-chart-echarts/src/controls.tsx))

- A raw **ECharts Options** JSON override sits in the Customize tab, and there are global `echartsOptionsOverrides`. ([6.1 docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/), [6.0 theming](https://preset.io/blog/superset-6-theming/))
- **Default categorical scheme `supersetColors`:** 20 colors, made of 10 saturated colors (`#1FA8C9 #454E7C #5AC189 #FF7F44 #666666 #E04355 #FCC700 #A868B7 #3CCCCB #A38F79`) followed by 10 pastels. ([superset.ts](https://github.com/apache/superset/blob/master/superset-frontend/packages/superset-ui-core/src/color/colorSchemes/categorical/superset.ts))
- **Status tokens:** `colorPrimary #2893B3`, `colorSuccess #5ac189`, `colorWarning #fcc700`, `colorError #e04355`, `colorInfo #66bcfe`. ([config.py](https://github.com/apache/superset/blob/master/superset/config.py))
- **Empty state:** the `EmptyState` component has a title ("No Data Available"), a description, an image and an optional button. The "No results" message tells users to check their filters and time range. ([EmptyState](https://superset.apache.org/developer-docs/6.1.0/components/ui/emptystate/), [#9722](https://github.com/apache/superset/issues/9722))
- **Dark mode** is first-class: the `algorithm: "dark"` token, OS-preference detection, and a Themes admin CRUD. ([theming](https://superset.apache.org/user-docs/6.0.0/configuration/theming/), [6.0](https://preset.io/blog/apache-superset-6-0-release/))

**Semantic layer and admin**

- **Connect Database:** pick the database type. The form can collapse to name plus SQLAlchemy URI. Then **Test Connection**, then Connect. An Advanced tab includes "Share connection". ([6.1 docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/))
- **Datasets:**
  - The list has a Folders panel.
  - The editor sets column properties (temporal, filterable, dimension), **certified** virtual metrics, and calculated columns (no aggregates allowed). (same source)
- **RLS:** each rule has a filter type (**Regular**, applied to the listed roles, or **Base**, applied to all queries), tables, roles, a group key and an SQL clause. ([security](https://superset.apache.org/admin-docs/security/), [Preset RLS](https://docs.preset.io/docs/row-level-security-rls))
- **Alerts & Reports last-run status:** a blue circle means running, a green check means nothing triggered, a yellow triangle means triggered, and a red cross means failed. An execution log exists. ([Preset](https://docs.preset.io/docs/managing-alerts-reports))
- **Warning:** enabling HTML rendering on data you don't control risks XSS. ([6.1 docs](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/))

### Metabase

**Layout**

- In a question, the **Visualization** button and the **Gear** (settings) sit at bottom-left. ([visualizing results](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results))
- **Dashboard edit mode:**
  - A grid appears and cards snap to it.
  - Card types: question, text, heading, link, iframe, placeholder, action.
  - **Tabs**; cards can move between tabs.
  - **Sections** are templates made of headings plus pre-arranged cards (for example KPI grid or large chart).
  - Width is **fixed and centered by default**, with a full-width option.
  - Per-card visualization settings don't change the saved question.

  ([dashboards](https://www.metabase.com/docs/latest/dashboards/introduction))

- **Table metadata admin:** a left tree (Database > Schema > Table) with search, then the table detail, the field list, and a field-detail panel. ([metadata](https://www.metabase.com/docs/latest/data-modeling/metadata-editing))

**Type scale.** The default font is **Lato**; Pro and Enterprise plans can switch to curated Google Fonts with regular, bold and heavy weights. Sizes: not published. ([fonts](https://www.metabase.com/docs/latest/configuring-metabase/fonts))

**Density.** Not published. The dashboard grid's column count isn't documented; an open issue proposed 24 columns instead of 18. ([#6218](https://github.com/metabase/metabase/issues/6218))

**Interaction**

- The picker splits types into **recommended** ones and a **"More charts"** section for types that don't fit the result. Those can still be picked. ([visualizing results](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results))
- **Filter scope:**
  - Levels: dashboard-level (all tabs), heading-level (same tab), and card-level.
  - Wiring is suggested automatically for cards that share the field.
  - Filters support default values, "Always require a value", and an **Auto-apply** toggle; with auto-apply off, users press an Apply button.

  ([filters](https://www.metabase.com/docs/latest/dashboards/filters))

- **Cross-filtering** is set up per card: click behavior → "Update a dashboard filter". The author wires every other card to that filter, and the clicking card is excluded. ([interactivity](https://www.metabase.com/docs/latest/dashboards/interactive), [tutorial](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/dashboards/cross-filtering))
- **Text cards:** Markdown (bold, lists, links, images), horizontal and vertical alignment, and a background toggle.
- **Heading cards:** no Markdown, fixed size, left-aligned.
- Both support **`{{filter}}` variables**. ([text and heading cards](https://www.metabase.com/docs/latest/dashboards/dashboard-markdown))

**Data-viz defaults**

- **Settings tabs:** Data, Display, Axes.
- **X axis:** label, rename, line and marks, and a timeseries or ordinal scale.
- **Y axis:** "Split y-axis when necessary", auto range or manual min/max, linear/power/log scale, and "Unpin from zero".
- **Legend:**
  - Appears automatically for multi-series charts. Hovering an entry highlights its series; clicking the color dot toggles it.
  - **The legend cannot be hidden or repositioned.**

  ([line/bar/area](https://www.metabase.com/docs/latest/questions/visualizations/line-bar-and-area-charts))

- **Chart colors:** up to **24** hex values; Metabase auto-generates the rest. Series colors are picked for distinguishability, not by order.
- **Interface colors are role-coded:** brand, _summarize_ (aggregations and breakouts) and _filter_. ([appearance](https://www.metabase.com/docs/latest/configuring-metabase/appearance))

**Semantic layer and admin**

- **Table metadata:**
  - semantic types
  - visibility: Everywhere, Only in detail views, or Do not include
  - filter widget: search box, list of all values, or plain input
  - display-value remapping, formatting, casting
  - re-sync schema and re-scan values

  The page notes that the settings "only affect the way Metabase displays the data". ([metadata](https://www.metabase.com/docs/latest/data-modeling/metadata-editing))

- **Permissions grid:**
  - View by group or by database.
  - Columns: View data, Create queries, Download results, Manage table metadata, Manage database, Transform.
  - Values: Can view, **Granular** (drill down to schemas and tables), Blocked, Impersonated, Row and column security.

  ([permissions](https://www.metabase.com/docs/latest/permissions/data))

- **Sync and scan:**
  - Sync runs hourly (the default) or daily.
  - Scans run regularly, only when a filter widget is added, or manually.
  - Manual actions exist. Progress shows under Admin > Tools > Tasks.

  ([sync and scan](https://www.metabase.com/docs/latest/databases/sync-scan))

- **Add database:** the fields depend on the engine, then "Save changes". ([connecting](https://www.metabase.com/docs/latest/databases/connecting))

### Power BI

**Layout**

- **On-object interaction** (preview):
  - The **Build a visual** menu sits next to the visual or pinned to the right-hand pane switcher. **+** adds panes; Ctrl-click opens several side by side.
  - Panes return to the right side if the previous setup is chosen. The Visualizations pane is removed in this mode.

  ([on-object](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction))

- **Fluent 2 base theme** (the default for new reports):
  - New pages are **1920×1080**, with gray wallpaper and background.
  - Titles and subtitles are **on**; axis titles are **off**.
  - More padding and rounded corners.

  ([visual defaults](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults))

**Type scale**

- **Report text classes:**

  | Class           | Default                    | Used for                          |
  | --------------- | -------------------------- | --------------------------------- |
  | callout         | DIN #252423 45 pt          | card and KPI values               |
  | header          | Segoe UI Semibold 12 pt    | headers                           |
  | title           | DIN 12 pt                  | axis titles                       |
  | largeTitle      | 14 pt                      | visual titles                     |
  | label           | Segoe UI #252423 **10 pt** | table values and headers          |
  | smallLabel      | 9 pt                       | small labels                      |
  | lightLabel      | #605E5C                    | legend text, category-axis labels |
  | smallLightLabel | #605E5C 9 pt               | data labels, value-axis labels    |

  ([custom themes](https://learn.microsoft.com/en-us/power-bi/create-reports/report-themes-create-custom))

- **Pixel equivalents:** CSS defines 1 pt = 1/72 in and 1 px = 1/96 in, so 9 pt = 12 px, 10 pt ≈ 13.3 px, 12 pt = 16 px, 14 pt ≈ 18.7 px, and 45 pt = 60 px. ([CSS units](https://www.w3.org/TR/css-values-4/#absolute-lengths))
- **Fluent 2 web ramp (Segoe UI), size/line-height in px:**

  | Style       | Size / line height |
  | ----------- | ------------------ |
  | Caption 2   | 10/14              |
  | Caption 1   | 12/16              |
  | Body 1      | 14/20              |
  | Subtitle 2  | 16/22              |
  | Subtitle 1  | 20/26              |
  | Title 3     | 24/32              |
  | Title 2     | 28/36              |
  | Title 1     | 32/40              |
  | Large Title | 40/52              |
  | Display     | 68/92              |

  Weights are Regular, Semibold and Bold. ([Fluent typography](https://fluent2.microsoft.design/typography))

**Density**

- Fluent uses a **4 px base unit**. Size tokens run from 0 to 56 px; the values 2, 6 and 10 exist only for icon alignment. ([Fluent layout](https://fluent2.microsoft.design/layout))
- Fluent Table cells come in medium (**44 px**), small (**34 px**) and extra-small (**24 px**). ([Fluent source](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-table/library/src/components/TableCell/useTableCellStyles.styles.ts))

**Interaction**

- **Suggest a type:**
  - The visual type updates as fields are added. **Picking a type manually turns Suggest a type off.**
  - With it off, all field wells show. The Add-data flyout supports multi-select.
- **Format mode** (double-click a visual):
  - Supports sub-selection and editing titles and labels in place.
  - Documented limitations: "Full accessibility isn't currently supported", and small multiples can't be selected.

  ([on-object](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction))

- **Filters pane:**
  - Levels: visual, page, report. Each field in a visual gets a filter card automatically.
  - Cards can be locked or hidden, and are styled differently when applied versus available. Custom sort works within a level, and there is search.
  - Keyboard: full tab navigation and Shift+F10.
  - An optional single **Apply** button (off by default).
  - Hovering a visual lists the filters affecting it (read-only).

  ([filters pane](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-report-filter))

- **Edit interactions:**
  - Visuals **cross-filter and cross-highlight by default**.
  - With a source selected, every other visual shows **Filter / Highlight / None** icons.
  - A separate toggle lets drilling filter other visuals.

  ([interactions](https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions))

- **Small multiples:**
  - A _Small multiples_ well on bar, column, line and area charts.
  - The default grid is 2×2, adjustable up to **6×6**, with more panels loading on scroll.
  - **Axes are synchronized:** one Y axis per row at left and one X axis per column at bottom.

  ([small multiples](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-small-multiples))
  - Under Fluent 2, small multiples start at 1×4 or 4×1, and a "Data labels" preset hides the axis, which suits small multiples. ([visual defaults](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults))

**Data-viz defaults**

- **Data colors:**
  - The documented list has 10 colors (`#118DFF #12239E #E66C37 #6B007B #E044A7 #744EC2 #D9B300 #D64550 #197278 #1AAB40`).
  - Once they run out, Power BI **auto-generates** more by adjusting saturation and hue.
  - Colors are assigned **by series order**, so the same member can get different colors in different visuals.
- **Sentiment:** good #1AAB40, neutral #D9B300, bad #D64554.
- **Divergent roles:** minimum, center, maximum, null.
- **Structural colors:** #252423 (primary text), #605E5C (legend and axis labels), #F3F2F1 (gridlines), #B3B0AD (dimmed legend), #FFFFFF (background), #C8C6C4 (grid outline). ([custom themes](https://learn.microsoft.com/en-us/power-bi/create-reports/report-themes-create-custom), [themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes))
- **Empty visuals** can be sized and formatted before any data is added. ([on-object](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction))

**Semantic layer and admin**

- **Model view:**
  - Diagram layouts. Dragging a column onto another table's column creates a relationship.
  - Selecting a relationship line edits it in the **Properties pane**. Multi-select supports bulk edits.

  ([model view](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-modeling-view), [relationships](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-create-and-manage-relationships))

- **TMDL view:**
  - A code editor for the entire model: syntax highlighting, autocomplete, formatting, search/replace, multi-line edits.
  - Exposes properties "not available in the Power BI user interface".
  - GA in September 2025; a web version is in preview.

  ([TMDL](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-tmdl-view), [GA](https://powerbi.microsoft.com/en-us/blog/tmdl-view-generally-available/))

- **RLS (Manage roles):**
  - Roles list, then _Select tables_, then _Filter data_.
  - Default drop-down editor ⇄ **DAX editor**, with a validate check and a revert X. Switching back warns that information may be lost.
  - Members are assigned in the service. **Test as role** / "Now viewing as" previews what a role sees.

  ([RLS](https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security))

- **Scheduled refresh:**
  - Sections: Gateway connection, Data source credentials, Refresh schedule (with an On toggle).
  - Limits: Pro allows 8 refreshes a day; Premium allows 48.
  - **Refresh history** shows status, start time, duration and error.
  - The schedule is **deactivated after 4 consecutive failures**, and paused after 2 months of inactivity, when it shows as "Disabled".

  ([scheduled refresh](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-scheduled-refresh))

### Looker

**Layout**

- **IDE:**
  - A Development Mode banner and a left IDE navigation bar.
  - **File Browser** or **Object Browser** (the hierarchy of model objects), the Editor, **Quick Help** (valid parameters where the cursor is), and a **Metadata** panel.
  - Project Health. The Git button shows the _next action_ toward production.
  - Cmd/Ctrl+J jumps to an object or file.

  ([IDE](https://docs.cloud.google.com/looker/docs/looker-ide))

- **Explore:**
  - Field picker with _All fields_ (by view: dimensions, then measures) and _In use_ tabs.
  - Search covers labels, descriptions and group labels.
  - Hover icons: pivot, filter, info (type, description, LookML name).
  - The results table colors **dimensions blue and measures orange**. Totals, subtotals and row-totals toggles; a Run button.

  ([Explore](https://docs.cloud.google.com/looker/docs/creating-and-editing-explores))

- **Visualization bar:** type icons plus "…". The **Edit** menu has Plot, Series, Values, Y and X tabs. Pivots split a measure into series. ([visualizations](https://docs.cloud.google.com/looker/docs/creating-visualizations))
- **Dashboard edit:**
  - Toolbar: Add, Filters, Settings, Quick layout, Style, Cancel, Save.
  - Tiles move by a six-dot handle, with blue grid lines and live width, height and % readouts.
  - **Size presets:** XS 1/6, S 1/4, M 1/3, L 1/2, XL full width. _Quick layout_ makes every tile the same size.
  - Text tiles come in two kinds: **Text** (visual editor) and **Markdown** (HTML plus a Markdown subset). Tiles can carry notes.
  - Filters sit at **Top or Right**, expanded or collapsed. Autorefresh and run-on-load settings.

  ([editing dashboards](https://docs.cloud.google.com/looker/docs/editing-user-defined-dashboards))

- **Tabs:**
  - Rename by double-clicking; names must be unique; reorder with move left/right.
  - Since 26.8, tabs can be duplicated, and **tiles run only when their tab opens**.
  - Since 26.10, dashboard filters can become draggable canvas tiles, tile sizing is finer, and buttons can navigate to tabs.

  ([tabs](https://docs.cloud.google.com/looker/docs/tabbed-dashboards), [release notes](https://docs.cloud.google.com/looker/docs/release-notes))

**Type scale.** Not published.

**Density.** Not published beyond the tile presets above.

**Interaction**

- **Cross-filtering:**
  - Turned on by a toggle in edit mode. All tiles must come from the same Explore.
  - Users click a data point or a legend entry; Cmd/Ctrl-click adds values.
  - Cross-filters show at the top **in a darker blue, separate from standard filters**, with field and value. Each has an X, and there is a clear-all X.
  - They are **not saved** and don't apply to downloads or schedules. Single-value tiles can receive cross-filters but can't emit them.

  ([cross-filtering](https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards))

**Data-viz defaults.** Palettes and axis defaults aren't in the fetched sources, so these are not published.

**Semantic layer and admin**

- **Validate LookML** sits at top right or in Project Health. Errors and warnings expand separately. A clean run shows a green check: "No LookML errors found". ([validation](https://docs.cloud.google.com/looker/docs/lookml-validation))
- **Connection form:**
  - Four sections: General (name, dialect, driver, project scope), Database (host, port, database, schema, credentials, SSH), Optional, and Review.
  - Optional covers pooling (pool timeout default **120 s**), max concurrent queries per connection and per user, SSL, SQL Runner precache (on by default), and PDT builder connections (default 1, max 100, maintenance cron `*/5 * * * *`).
  - A Test step shows expandable Status Details.

  ([connection](https://docs.cloud.google.com/looker/docs/connecting-to-your-db))

- **PDT admin page:**
  - Columns: PDT name (with incremental and materialized-view flags), **Last attempt status** (Success, Building, Not Built, Build Error), last attempted at, last successful build, last build duration plus average, **persistence rule** (Persist for, or datagroup trigger), project, model, connection.
  - Search plus filters by status, model, trigger type, duration and recency.
  - **PDT Details** modal with a **dependency graph** and trigger values; a PDT Activity dashboard; **Go to LookML**.

  ([PDT admin](https://docs.cloud.google.com/looker/docs/admin-panel-database-pdts))

- Since 26.10, deployments run as background processes, and there is a VS Code extension. ([release notes](https://docs.cloud.google.com/looker/docs/release-notes))

## Cross-product patterns

### Shared (the baseline users will expect)

1. **Typed field list as the authoring source.**
   - Fields are grouped by type: Spotfire uses Numbers/Time/Categories; Looker lists dimensions then measures; Tableau splits dimensions and measures and codes pills discrete or continuous.
   - Role is color-coded: Tableau uses blue/green, Looker blue/orange.
   - The list sits at left in Superset Explore and in the Looker and Metabase admin trees; Power BI docks it on the right.
2. **Named channel wells or drop targets.**
   - Tableau's Marks card, Power BI's field wells (including _Small multiples_), Spotfire's axis selectors and center targets (including _Trellis_), and Superset's control wells.
   - Spotfire documents replace-versus-add drop semantics.
3. **Automatic chart choice with manual override.** Each product does it differently:
   - Tableau outlines one pick and shows requirements on hover.
   - Power BI auto-switches the type; a manual pick disables the suggestion.
   - Metabase splits recommended from "More charts".
   - Spotfire recommends from a multi-column selection.

   **None shows ranked runners-up, each with a reason. That is exactly what IN-3 asks for.**

4. **A sectioned inspector:** Superset (Data / Customize), Metabase (Data / Display / Axes), Looker (Plot / Series / Values / Y / X), Power BI (Format pane cards), Spotfire (property pages).
5. **The same axis options everywhere:** auto or fixed min/max, include zero, reverse, log, label orientation or rotation, a label-count limit, gridlines, and a title. For trellised views: uniform versus independent ranges (Tableau), synchronized axes (Power BI), and one scale per panel group (Spotfire).
6. **Legends** appear when a color, series or size encoding exists, and they are interactive (toggle or highlight a series). Position is configurable everywhere except Metabase.
7. **Dashboards:**
   - Tiles snap to a grid: Superset uses 12 columns; Looker's fractional presets (1/6 to 1) all land on 12-column boundaries.
   - Every product has **tabs** (Spotfire tabbed pages, Power BI pages, and Tabs in Metabase, Looker and Superset). Looker 26.8 and Superset use them to defer loading.
   - Every product has a **text block**: Markdown in Superset, Metabase and Looker; rich text or HTML in Tableau and Spotfire.
8. **Filter scope hierarchy:** Power BI has visual, page and report; Metabase has card, tab and dashboard; Superset has per-filter scoping. The filter-bar location varies: Looker offers Top or Right; Superset offers a vertical or horizontal bar.
9. **Cross-filtering by clicking a mark:**
   - On by default in Power BI and Superset, a single toggle in Looker, "Use as Filter" in Tableau, and marking in Spotfire.
   - Metabase is the exception: authors wire it card by card.
   - Active cross-filters are shown **separately** from standard filters (Looker's darker chips, Superset's indicators).
10. **Semantic-layer admin follows the same shapes across products:**
    - **Tree, then list, then detail:** Metabase, Looker, Spotfire Information Designer.
    - **Diagram plus properties:** Power BI model view, Tableau logical and physical layers, Spotfire data canvas.
    - **Code and form views of one model:** Looker IDE, Power BI TMDL, Power BI RLS default/DAX editors.
    - **A validation panel:** Looker.
    - **Job tables** showing status, last attempt, last success, duration against average, and auto-suspend after repeated failures: Looker PDT, Tableau Jobs (suspends after 5), Power BI refresh (disables after 4).
    - **Schedules:** Power BI, Metabase, Spotfire, Tableau.
    - **Connection forms with a Test step:** Superset, Looker.
    - **Permissions:** Metabase grid, Power BI roles with Test as role, Superset RLS rules.
11. **Themes are defined as tokens or JSON:** Power BI theme JSON with text classes, Superset's Ant Design tokens, and Tableau's JSON themes.

### What sets each product apart

- **Spotfire:**
  - Marking as a first-class data-limiting model, with an empty-state choice (empty, all data, or message).
  - Related-table filtering with include, exclude and ignore semantics, where the icon state shows relation health.
  - Text areas with live controls, embedded filters and dynamic items.
  - Legends that contain column selectors.
  - A trellis _Pages_ mode.
- **Tableau:** the shelf grammar; requirements shown on hover in Show Me; explicit "clear selection" semantics for filter actions; free floating layout; Prep's linked panes (flow, profile, grid).
- **Superset:** the ECharts renderer with a raw options override; a layout-element tree (Tabs, Row, Column, Header, Markdown, Divider); certified metrics; a theme CRUD with first-class dark mode.
- **Metabase:** `{{filter}}` variables in text; section templates; auto-suggested filter wiring; the permissions grid; role-colored query-builder parts; a fixed, non-configurable legend.
- **Power BI:** the per-target Filter/Highlight/None matrix; published text classes; "Test as role"; a lossy-switch warning between form and code editors; a documented accessibility gap in its on-canvas format mode.
- **Looker:** dev mode with a Git "next action" button; the LookML validator; the PDT admin page with a dependency graph; cross-filters limited to one Explore; tabs that load lazily.

## Direction: One dense, three-pane analytical workbench (typed tree left, live canvas center, docked inspector right) shared by chart building, dashboard authoring and semantic-layer administration, carrying Spotfire's linked-analysis behaviors through Tableau/Power BI-style typed encoding wells and Show Me-style ranked recommendations, with every model object editable in synchronized code and form views and backed by Looker/Power BI-style job, history and test-as-role screens.

### Reasoning

**Why one frame across all three surfaces.** Most studied products already share this shape, even across their authoring and admin sides:

- Superset Explore puts the dataset panel at left, the chart, and the Data/Customize tabs.
- The Looker IDE has file and object browsers, the editor, and Quick Help/Metadata panels.
- Metabase's metadata admin runs tree, then field list, then field detail.
- Power BI has the canvas plus docked Data, Build and Format panes.

The three provisional roles work on the _same objects_: a measure the engineer edits appears in the analyst's field tree and in the consumer's tooltip. Looker already links these views ("Go to LookML" from the PDT page; LookML names in field info). One shell lets any object open in its other views without switching applications.

**Analyst or author (IN-2a, IN-2c, IN-2d, IN-3)**

- **Tree:** a typed tree grouped the way Spotfire groups columns (Numbers, Time, Categories), with measure and dimension role coding (Looker and Tableau precedent). The coding uses icon _and_ color, because Tableau documents that color alone gets misread.
- **Wells:** named wells for X, Y, Color, Size, Shape, Label, Tooltip, **Trellis rows, columns and panels**, and Detail. They take Spotfire's replace-or-add and Ctrl-copy drop semantics, and Power BI's _Small multiples_ well.
  - Named wells map one-to-one onto wechart's engine-neutral chart spec. Spotfire users recognize axis selectors, and Power BI users recognize wells.
- **Recommendation panel** (in the inspector): the **top pick plus ranked runners-up, each with a one-line reason** (IN-3). It combines:
  - Tableau's highlighted pick with requirements shown for types that don't apply
  - Metabase's grouping of recommended types versus the rest
  - Power BI's rule that **a manual pick turns off auto-suggestion** (so the override is pinned), with a visible way back to the recommendation
- **Inspector sections** follow the shared axis and legend option set in cross-product pattern 5:
  - axis range, include zero, reverse, log, label rotation 0/45/90 (Superset's choices), label-count limit, gridlines, title
  - legend show/hide, position and interactivity
  - uniform versus independent ranges for trellis (Tableau), with synchronized axes by default (Power BI)
- Formatting directly on the canvas can be a shortcut. The **inspector stays the complete, keyboard-reachable path**, because Power BI's own documentation says its on-object format mode lacks full accessibility.

**Business consumer (IN-2b)**

- **Grid and structure:** dashboards use a tiled 12-column grid (Superset's constants; Looker's presets align with it). They are built from Superset's element tree: Tabs, Row, Column, Header, Markdown, Divider.
  - Metabase-style section templates offer a quick start.
  - Tabs load their tiles only when opened (Looker 26.8).
- **Filter bar:** the filters are labeled by scope (dashboard, tab, tile), following Power BI and Metabase. Each filter shows which tiles it affects: hovering a tile shows the filters acting on it (Power BI).
- **Cross-filtering:**
  - **On by default** across tiles on the same tab (the default in Power BI and Superset).
  - Authors can override each target to Filter, Highlight or None (Power BI's matrix).
  - Active cross-filters appear as **separate, clearable chips** (Looker).
  - Clearing the selection follows Tableau's rule and is configurable (keep filtered, show all, exclude all).
- **Spotfire parity for migrants:**
  - Marking-style **details tiles** that follow a master tile, with Spotfire's nothing-marked choice (empty, all data, or a message).
  - **Related-data filter propagation** with include, exclude and ignore semantics, whose icon state shows an invalid relation.
  - Trellis modes: rows and columns, panels, and pages.
  - Filter-panel types: range, list box with search, check boxes, item slider.
- **Text blocks:** Markdown (Superset, Metabase, Looker), with Metabase's `{{filter}}` variables and Spotfire-style **inline live values** (calculated values, sparklines) as safe, typed tokens instead of raw HTML.

**Semantic-layer engineer (IN-1)**

- **Model tree, editor, inspector:** the left tree lists model objects. The center is a code editor (Looker IDE, Power BI TMDL) or a diagram of joins (Power BI model view, Tableau's logical layer, Spotfire's data canvas). The inspector on the right shows the **same object as a form**, kept in sync with the code.
  - Switching views warns if the conversion would lose information (Power BI's RLS editor).
  - A validation panel with separate error and warning lists and a clean-state check follows Looker's validator.
- **Security:**
  - a grid of groups against data objects with drill-down to finer levels (Metabase)
  - rule editing in form and code (Power BI RLS, Superset's Regular/Base rules)
  - **"View as" a role or user** from any dashboard (Power BI's Test as role / Now viewing as)
- **Pre-aggregation build jobs:** modeled on Looker's PDT admin page:
  - columns: name, last attempt status, last success, duration against average, trigger rule, model, connection
  - a detail view with a dependency graph and history, plus a link back to the code
  - Tableau-style statuses including "running late" measured against the average
  - Power BI and Tableau-style suspension after repeated failures, surfaced as a visible state with a notification
- **Connections:** Looker's sectioned form (General, Database, Optional, Review) with an explicit **Test** step that shows per-check details (Looker's Status Details, Superset's Test Connection). Sync and refresh schedules follow Metabase's and Power BI's scheduling sections, with a history table.

**Points the interview must settle.** These are open questions, not decisions:

1. **"Cross-table filters"** could mean Spotfire's _filtering in related data tables_ (propagation across data sources) or click-to-cross-filter between tiles. The direction supports both, but the requirement needs the user's wording.
2. **"Markdown (Spotfire)":** Spotfire's first-party text area is WYSIWYG/HTML. Markdown there comes from a community mod. The interview should confirm whether the user needs Markdown specifically or Spotfire's text-area capabilities (live controls, embedded filters, dynamic items).
3. The input mentions **.dxp migration**. If that is in scope, keeping Spotfire's vocabulary (marking, trellis, pages) becomes a requirement rather than a preference.

### What this direction rejects

- **Cube Playground or Cube Cloud-style starter screens.** The user rejected them outright; each surface is designed to the depth of the enterprise tools studied.
- **Tableau's Columns/Rows shelf grammar as the primary authoring model.** Tableau's own help documents that users confuse blue/green with dimension/measure. wechart's fields already carry declared measure and dimension roles, and named channel wells present those roles directly, as Spotfire and Power BI users already know them. Marks-card-style channels are kept as wells.
- **Silent auto-switching of the chart type** (Power BI's live retyping, Tableau's single outline with no reason). IN-3 requires a ranked list with reasons, and manual choices must stay pinned.
- **Free-floating, pixel-positioned tiles** (Tableau floating objects, Spotfire free page layout). Tableau says floating items need fixed sizing and positioning to work well. A tiled grid keeps tiles reflowing correctly and gives a predictable keyboard order for consumers.
- **Raw HTML or JavaScript in text blocks** (Spotfire's Edit HTML, Superset's HTML-capable Markdown). Superset's docs warn of XSS when rendering HTML from data you don't control. wechart uses Markdown with typed live-value tokens instead.
- **A fixed, non-configurable legend** (Metabase). It conflicts with IN-2d.
- **Cross-filtering that authors must wire card by card** (Metabase click behavior). Power BI and Superset default to linked tiles, and consumers expect linked analysis from Spotfire.
- **Form-only admin** (Superset's RLS modal, Metabase-only grids) and **code-only admin** (the Looker IDE as the sole path). Power BI TMDL shows forms can't expose every property, and code-only hides the model from analysts and admins. The direction keeps both views of one object, in sync.
- **Chart palettes that grow past 10 colors** (Tableau 20, `supersetColors` colors 11–20, Power BI's auto-generated extras, Metabase's auto-fill up to 24). The user's input treats color as illegal past about 8–10 categories.
- **Series colors assigned by order** (Power BI documents that this gives one member different colors in different visuals). Consumers comparing tiles need a stable member-to-color mapping across a dashboard.
- **A separate admin application with its own visual language** (Spotfire Server web admin, Tableau Cloud admin pages). It would break the one-object, many-views model described in the reasoning.

### Tokens to derive

These are proposals for `docs/design/direction.md`. Every value lists its provenance. "Not published" means none of the references publishes the value, and direction.md must decide it and verify it.

**Type**

| Token          | Size / line height (px)                                  | Weight | Use                                                                | Provenance                                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| family-ui      | Inter, then system sans                                  | —      | all UI and chart text                                              | Superset default `fontFamily` ([config.py](https://github.com/apache/superset/blob/master/superset/config.py)). Inter is OFL 1.1 and supports `tnum` tabular figures ([Inter](https://rsms.me/inter/)).                                                                                                                         |
| family-code    | IBM Plex Mono                                            | —      | model code, SQL, generated queries                                 | Superset `fontFamilyCode` ([config.py](https://github.com/apache/superset/blob/master/superset/config.py))                                                                                                                                                                                                                      |
| numerals       | `font-feature-settings: "tnum"` in tables, KPIs and axes | —      | aligned figures                                                    | Inter documents tnum "for tabular data" ([Inter](https://rsms.me/inter/))                                                                                                                                                                                                                                                       |
| text-xs        | 12/16                                                    | 400    | axis ticks, legend, data labels, tree rows, inspector, dense grids | Fluent Caption 1 ([typography](https://fluent2.microsoft.design/typography)). Matches antd `fontSizeSM` 12 and Power BI small labels (9 pt = 12 px) ([text classes](https://learn.microsoft.com/en-us/power-bi/create-reports/report-themes-create-custom), [CSS units](https://www.w3.org/TR/css-values-4/#absolute-lengths)). |
| text-xs-strong | 12/16                                                    | 600    | grid headers, inspector section labels, well pills                 | Fluent Caption 1 Strong                                                                                                                                                                                                                                                                                                         |
| text-sm        | 14/20                                                    | 400    | forms, menus, dialogs, Markdown body, default tables               | Fluent Body 1. antd `fontSize` 14 (line height 22).                                                                                                                                                                                                                                                                             |
| text-sm-strong | 14/20                                                    | 600    | tile and chart titles                                              | Fluent Body 1 Strong. Power BI's visual title is larger (14 pt ≈ 18.7 px); 14 px is chosen for density.                                                                                                                                                                                                                         |
| text-md        | 16/22                                                    | 600    | pane headers, dashboard Header (small), Markdown H3                | Fluent Subtitle 2; antd H5 16                                                                                                                                                                                                                                                                                                   |
| text-lg        | 20/26                                                    | 600    | admin page titles, Header (medium), Markdown H2                    | Fluent Subtitle 1; antd H4 20 (line height 28)                                                                                                                                                                                                                                                                                  |
| text-xl        | 24/32                                                    | 600    | dashboard title, Header (large), Markdown H1                       | Fluent Title 3; antd H3 24/32                                                                                                                                                                                                                                                                                                   |
| text-kpi       | 32/40                                                    | 600    | KPI values in multi-KPI rows                                       | Fluent Title 1                                                                                                                                                                                                                                                                                                                  |
| text-kpi-solo  | 40/52                                                    | 600    | a tile holding a single KPI                                        | Fluent Large Title. Power BI's callout default of 45 pt = 60 px is the upper reference.                                                                                                                                                                                                                                         |
| floor          | 12 px minimum                                            | —      | no smaller text                                                    | Power BI's smallest default text class is 9 pt = 12 px. Superset's `fontSizeXS` 8 is not adopted.                                                                                                                                                                                                                               |
| weights        | 400 and 600                                              | —      | —                                                                  | Fluent Regular and Semibold. Superset's "strong" is 500. Component-research should confirm which Inter weights are bundled, since weights weren't checked in the source.                                                                                                                                                        |

**Spacing and density**

| Token                          | Value                                                         | Provenance                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base unit                      | 4 px                                                          | Fluent 2 ([layout](https://fluent2.microsoft.design/layout)); antd `sizeUnit` 4 ([antd](https://ant.design/docs/react/customize-theme))                                                                                                                         |
| spacing scale                  | 4, 8, 12, 16, 24, 32, 40; 2, 6 and 10 only for icon alignment | Fluent confirms 4, 16, 24, 32 and 40 inside its 0–56 range, and 2/6/10 for icons. 8 and 12 are multiples of the 4 px base (8 is also Superset's `GRID_BASE_UNIT`).                                                                                              |
| dashboard grid                 | 12 columns, 8 px row unit, 16 px gutter                       | Superset `constants.ts` ([link](https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/util/constants.ts))                                                                                                                              |
| new-tile width                 | 4 columns (1/3)                                               | Superset `GRID_DEFAULT_CHART_WIDTH`                                                                                                                                                                                                                             |
| tile width presets             | 2, 3, 4, 6, 12 columns                                        | Looker XS–XL = 1/6, 1/4, 1/3, 1/2, full ([Looker](https://docs.cloud.google.com/looker/docs/editing-user-defined-dashboards)), mapped onto 12 columns                                                                                                           |
| control height, default        | 32 px (buttons, inputs, toolbars)                             | antd `controlHeight`                                                                                                                                                                                                                                            |
| control height, compact        | 28 px (tree rows, inspector rows)                             | antd compact: `controlHeight − 4` ([compact](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/compact/index.ts))                                                                                                                    |
| control height, small          | 24 px (well pills, filter chips)                              | antd `controlHeightSM` = 0.75 × 32 ([genControlHeight](https://github.com/ant-design/ant-design/blob/master/components/theme/themes/shared/genControlHeight.ts))                                                                                                |
| table row, default             | 34 px (admin lists, table tiles)                              | Fluent Table _small_ ([source](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-table/library/src/components/TableCell/useTableCellStyles.styles.ts)). Cross-check: an antd _small_ row works out to about 38 px.              |
| table row, dense               | 24 px (data preview, results grids, job logs)                 | Fluent Table _extra-small_                                                                                                                                                                                                                                      |
| cell inline padding            | 8 px                                                          | antd `cellPaddingInlineSM` and `cellPaddingInlineMD` ([antd Table](https://ant.design/components/table))                                                                                                                                                        |
| corner radius                  | 6 px                                                          | antd `borderRadius`, inherited by Superset                                                                                                                                                                                                                      |
| dashboard width                | fixed and centered by default, with a full-width toggle       | Metabase default ([dashboards](https://www.metabase.com/docs/latest/dashboards/introduction)); Tableau defaults to Fixed ([sizing](https://help.tableau.com/current/pro/desktop/en-us/dashboards_organize_floatingandtiled.htm)). Maximum width: not published. |
| panel widths (tree, inspector) | not published                                                 | —                                                                                                                                                                                                                                                               |

**Color roles (light).** Contrast ratios were computed with the WCAG formula from the published hex values.

| Role                                            | Value                                                         | Contrast on #FFFFFF | Provenance                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| text-primary                                    | #252423                                                       | 15.5:1              | Power BI `label` and `firstLevelElements`                                                                                                                                                           |
| text-secondary (legend, axis labels)            | #605E5C                                                       | 6.5:1 (AA at 12 px) | Power BI `lightLabel` and `secondLevelElements`                                                                                                                                                     |
| dimmed (inactive legend items only, never text) | #B3B0AD                                                       | 2.2:1               | Power BI `fourthLevelElements`                                                                                                                                                                      |
| gridline                                        | #F3F2F1                                                       | —                   | Power BI `thirdLevelElements`                                                                                                                                                                       |
| surface                                         | #FFFFFF                                                       | —                   | Power BI `background`                                                                                                                                                                               |
| outline                                         | #C8C6C4                                                       | —                   | Power BI `secondaryBackground` (table grid outline)                                                                                                                                                 |
| canvas wallpaper                                | gray; hex not published                                       | —                   | Power BI Fluent 2                                                                                                                                                                                   |
| accent candidates                               | #118DFF or #2893B3                                            | 3.3:1 and 3.6:1     | Power BI first data color; Superset `colorPrimary`. Both pass 3:1 for fills, focus rings and selected wells but fail 4.5:1 for text. A darker text-safe shade is not published and must be derived. |
| status                                          | success #5ac189, warning #fcc700, error #e04355, info #66bcfe | —                   | Superset. Always paired with a _shape_ (circle, check, triangle, cross), following Superset's alert icons; text-safe shades must be derived.                                                        |
| cross-filter / marking                          | a role distinct from standard filters; hex not published      | —                   | Looker shows cross-filters in a darker blue than standard filters; Spotfire's marking color isn't published.                                                                                        |
| field roles                                     | measure, dimension, time: icon plus hue; hues not published   | —                   | Looker (blue dimensions, orange measures), Tableau (blue/green), Spotfire (Numbers/Time/Categories)                                                                                                 |
| dark theme                                      | a full parallel set, required; values not published           | —                   | Superset `algorithm: "dark"`; Power BI's guidance that dark themes must reset structural and text colors                                                                                            |

**Data-viz palettes**

| Palette                 | Size and rule                                                                                                                   | Provenance                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| categorical             | **at most 10 colors per chart**; beyond that the recommender facets or uses top-k plus "Other" instead of extending the palette | Tableau 10 ([excerpt](https://www.tableau.com/blog/colors-upgrade-tableau-10-56782)); Power BI's documented 10-color list; Superset's 10 saturated colors; the user's limit of about 8–10 for color (docs/inputs §3) |
| "Other" and null        | one reserved neutral outside the 10                                                                                             | Power BI's dedicated `null` role; the user's "top-k + other" (docs/inputs §3)                                                                                                                                        |
| member-to-color mapping | stable across all tiles on a dashboard                                                                                          | rejects order-based assignment, which Power BI documents as a problem ([themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes))                                                    |
| sequential              | single hue, blue by default; step count not published                                                                           | Tableau's default since v10                                                                                                                                                                                          |
| diverging               | orange-blue by default, anchored at min, center and max, plus a null color                                                      | Tableau since v10; Power BI's divergent roles                                                                                                                                                                        |
| sentiment               | good, neutral, bad                                                                                                              | Power BI #1AAB40 / #D9B300 / #D64554 as the starting point; direction.md re-derives these for AA                                                                                                                     |
| shape channel           | at most 6                                                                                                                       | the user's input (docs/inputs §3)                                                                                                                                                                                    |
| trellis                 | at most about 20 visible panels before paging; synchronized axes by default, with an independent option                         | the user's input; Power BI's 6×6 maximum grid with synced axes; Spotfire's _Pages_ and manual max rows/columns; Tableau's Uniform/Independent                                                                        |
| chart chrome defaults   | legend shown with a scroll list at top; 20 px grid offsets; about 80 px per y tick; x-label rotation 0/45/90; rich tooltip on   | Superset's ECharts plugin constants and controls (same renderer as wechart)                                                                                                                                          |
| light and dark          | every palette gets both variants                                                                                                | Superset first-class dark mode; Power BI dark-theme guidance                                                                                                                                                         |

---

# Phase 2: security, folders, workspaces and proposals

Date: 2026-09-25. Author: ui-researcher. This section extends the accepted phase-1 direction (`docs/design/direction.md`, `docs/design/prototype/`) to phase 2's new surfaces. It replaces nothing from phase 1: the three-pane workbench, the tokens, the density and rules 1–58 all stay.

**Status of inputs**

- **Roles** come from requirements Part 2 §P2.2:
  - **Super-Admin:** a member of the configured AD group. Read-write everywhere, plus the admin surfaces.
  - **Admin:** a member of a folder's read-write groups.
  - **User:** read-only, and sees dashboards only.
  - There are 500+ people, and one person can be in hundreds of groups.
- **Criteria covered:** F25–F36 (AC-251 … AC-308); the rewritten AC-001, AC-192, AC-194, AC-222 and AC-233; and F18 (AC-157 … AC-164).
- **User input:** `docs/inputs/2026-09-25-phase-2-security-folders-workspaces.md`.
- **Source conventions** are phase 1's:
  - **(excerpt):** the official page text came back from search, but a fetch returned nothing or couldn't be made.
  - **(community):** a vendor forum or issue tracker, not vendor docs.
  - **UNVERIFIED:** no source confirms it.
- **No local measurements.** No browser was available to this research, so nothing here was measured on the local Superset (:8088) or Metabase (:3000).
- **Type and density.** None of the products below publishes type or density values for its permission, history, review or audit screens. Every such value here is "not published". Phase 1's tokens apply unchanged.

## Products studied

| Product | Why chosen | Sources |
| --- | --- | --- |
| **Tableau Cloud / Server** (current help) | Projects and nested projects, permission rules with an effective-permissions view, Locked vs Customizable, **Personal Space**, revision history (10 on Cloud), and custom views that are private until shared. It is the governance model most analysts know. | [permissions](https://help.tableau.com/current/server/en-us/permissions.htm), [projects](https://help.tableau.com/current/server/en-us/permissions_projects.htm), [effective](https://help.tableau.com/current/server/en-us/permission_effective.htm), [Personal Space](https://help.tableau.com/current/online/en-us/personal_space.htm), [revisions](https://help.tableau.com/current/pro/desktop/en-us/qs_revision_history.htm), [revision limits](https://help.tableau.com/current/server/en-us/revision_history_maintain.htm), [custom views](https://help.tableau.com/current/pro/desktop/en-us/customview.htm) |
| **Power BI / Fabric** (docs updated 2025-12 to 2026-09) | The most common enterprise BI tool. It has workspace roles granted to groups, a Manage access side pane, **My workspace**, the workspace as a "staging area" behind apps, deployment pipelines (Select related, notes, compare, history), personal vs report bookmarks, Sign out, and Purview audit search. | [roles](https://learn.microsoft.com/en-us/fabric/fundamentals/roles-workspaces), [give access](https://learn.microsoft.com/en-us/fabric/fundamentals/give-access-workspaces), [My workspace](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-workspaces), [apps](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-create-distribute-apps), [deploy](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/deploy-content), [history](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/deployment-history), [bookmarks](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-bookmarks), [sign out](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-sign-in), [audit](https://learn.microsoft.com/en-us/fabric/admin/track-user-activities) |
| **Looker** (26.x docs) | Semantic-layer BI (phase 1's closest analog). It has folder access by group with two levels and visible inheritance, personal folders, a **Development Mode** banner, and a Git button that names the next step toward production. | [folders](https://docs.cloud.google.com/looker/docs/organizing-spaces), [content access](https://docs.cloud.google.com/looker/docs/access-control-and-permission-management), [finding content](https://docs.cloud.google.com/looker/docs/finding-content), [dev mode](https://docs.cloud.google.com/looker/docs/dev-mode-prod-mode), [Git deploy](https://docs.cloud.google.com/looker/docs/version-control-and-deploying-changes) |
| **Metabase** (latest docs; v0.63.x per phase 1) | The shared root name "Our analytics" is already borrowed. It has collection permissions (Curate / View / No access, where no access means "won't be listed"), personal collections, 15-version history, and audit retention by environment variable. | [collection permissions](https://www.metabase.com/docs/latest/permissions/collections), [collections](https://www.metabase.com/docs/latest/exploration-and-organization/collections), [history](https://www.metabase.com/docs/latest/exploration-and-organization/history), [usage analytics](https://www.metabase.com/docs/latest/usage-and-performance-tools/usage-analytics) |
| **Spotfire** (Server latest; client 6.5–14.x) | The migration source. Library folders are hidden without Browse, and permissions inherit. Its **private/public bookmarks** are exactly AC-292/AC-293's model. It also has action logs. | [library permissions](https://docs.tibco.com/pub/spotfire_server/latest/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/library_permissions.html), [bookmarks](https://docs.tibco.com/pub/spotfire/6.5.3/doc/html/bm/bm_what_are_bookmarks.htm), [bookmark menu](https://docs.tibco.com/pub/spotfire/6.5.3/doc/html/bm/bm_pop-up_menu.htm), [making public (excerpt)](https://docs.tibco.com/pub/sfire-cloud/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/making_a_bookmark_public.html), [action logs (excerpt)](https://docs.tibco.com/pub/spotfire_server/latest/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/action_logs_and_system_monitoring.html) |
| **Grafana** (latest docs; phase 1 used Grafana 13 for dashboard authoring) | Nested folders whose grants **cannot be lowered in a subfolder**, which is AC-261's rule exactly, with inherited rows locked. Also version history with compare and restore, and Git Sync's save-with-comment plus a Changes tab. | [folder access](https://grafana.com/docs/grafana/latest/administration/roles-and-permissions/folder-access-control/), [dashboard permissions](https://grafana.com/docs/grafana/latest/administration/user-management/manage-dashboard-permissions/), [versions](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/manage-version-history/), [Git Sync](https://grafana.com/docs/grafana/latest/as-code/observability-as-code/git-sync/provisioned-dashboards/) |
| **Sigma** (current docs) | My Documents, and Draft vs Published. **"Restore version as draft"** is the only studied restore that doesn't publish directly, which is AC-289's shape. Its inherited access "cannot be downgraded". | [versions](https://help.sigmacomputing.com/docs/workbook-versions-and-version-history), [access](https://help.sigmacomputing.com/docs/folder-and-document-permissions), [navigation (excerpt)](https://help.sigmacomputing.com/docs/get-around-in-sigma) |
| **GitHub pull-request review** | The review grammar the brief names: Files changed, Review changes, Comment / Approve / Request changes, a summary, and Submit review. Also the self-approval rule, "review requested" filters, and an audit log with qualifiers. | [reviewing](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request), [approving](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews), [review states](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews), [filters (excerpt)](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests), [audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization), [forks (excerpt)](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork) |

**Supplementary sources** (not products studied):

- **Microsoft Entra ID group claims.** They decide what a "group" looks like in the UI. [Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims)
- **Kibana's security-off warning.** Secondary source only: [SELKS wiki](https://github.com/StamusNetworks/SELKS/wiki/Elasticsearch-authentication-warning). UNVERIFIED against Elastic's own docs.

**Considered and not studied:**

- **Apache Superset:** access is per dashboard through owners and roles, with no inherited folder model to borrow. It stays phase 1's renderer reference.
- **Hex and Omni:** less familiar to the Spotfire-migrating audience.
- **Cube Cloud:** still excluded by the user.

## Observations per product

### Tableau Cloud / Server

**Access model and editor**

- **Permissions dialog.** The top holds **permission rules**, one row per group or user.
  - Add a rule with "+ Add Group/User Rule", then pick a template or click capabilities.
  - One click sets a capability to Allowed, two to Denied, and a third to Unspecified.
  - The bottom holds an **effective permissions grid** for the selected row. "Hovering provides information about why the capability is allowed or denied."
  - A project-level dialog has tabs per content type; an asset-level dialog has none. ([permissions](https://help.tableau.com/current/server/en-us/permissions.htm))
- **Denial wins.** "If a user is a member in two groups, and one is allowed a capability and one is denied... the denial takes precedence." The hover text gives reasons such as "because a conflicting group or user rule denied it". ([effective](https://help.tableau.com/current/server/en-us/permission_effective.htm))
- **Asset permissions: Locked or Customizable.**
  - Locked comes as "Locked (including nested projects)" or "(not including nested projects)".
  - In locked projects, content owners "lose the Set Permission capability".
  - A project leader gets maximum capabilities for the project and its content. ([projects](https://help.tableau.com/current/server/en-us/permissions_projects.htm))

**Personal space**

- **Personal Space** is "a private location for all Explorers and Creators", reached from "the left navigation menu".
- Content there "cannot be shared", and share, comments, alerts and subscriptions are unavailable.
- Site administrators "can't directly access any user's Personal Space... but they can view and manage Personal Space workbooks".
- When content leaves Personal Space, the collaboration tools reappear. ([Personal Space](https://help.tableau.com/current/online/en-us/personal_space.htm))

**History**

- Opened from the item's actions menu, then **Revision History**. Each row shows the revision number, the publisher and the date.
- Actions: Preview, Download, **Restore** ("The restored version becomes the current version") and Delete. ([revisions](https://help.tableau.com/current/pro/desktop/en-us/qs_revision_history.htm))
- Limits: **25** revisions by default on Server (configurable), and "up to **10**" on Cloud. ([limits](https://help.tableau.com/current/server/en-us/revision_history_maintain.htm))

**Bookmarks (custom views)**

- Private by default. An eye icon toggles "visible to others"; an eye with a slash means private.
- Viewers can't make a view visible. ([custom views (excerpt)](https://help.tableau.com/current/pro/desktop/en-us/customview.htm))

### Power BI / Fabric

**Access model and editor**

- **Roles and groups.** The roles are Admin, Member, Contributor and Viewer. They can be assigned "to individuals or to security groups, Microsoft 365 groups, and distribution lists".
  - Someone in several groups gets "the highest level of permission". Nested groups count. ([roles](https://learn.microsoft.com/en-us/fabric/fundamentals/roles-workspaces))
- **Manage access** sits in the workspace command bar or under More options.
  - It opens a pane with **Add people or groups** (name, then role, then **Add**), a search box, and a role drop-down per entry.
  - Changes take effect "the next time the user logs into Microsoft Fabric". The limit is 1,000 users or groups per workspace. ([give access](https://learn.microsoft.com/en-us/fabric/fundamentals/give-access-workspaces))

**Personal space**

- **My workspace** is "your personal sandbox". For many business users it "remains empty". ([My workspace](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-workspaces))

**Publish and review**

- **Apps.** "The workspace is your staging area, so your changes aren't live in the app until you publish again" with **Update app**.
  - A banner in the workspace flags pending access requests.
  - "Power BI doesn't send any email to internal users when you distribute or update an app." ([apps](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-create-distribute-apps))
- **Deployment pipelines.**
  - **Select related** marks the dependencies "so that both are deployed together and the report doesn't break".
  - A review pop-up lists the items to deploy and offers **Add a note** (optional), which goes to history.
  - Items of the same name and type in the same folder are paired and "overwritten". ([deploy](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/deploy-content))
- **Compare labels** are New, Different and Missing from. **Change review** gives "a detailed, line by line comparison" of text items such as semantic models. ([compare (excerpt)](https://learn.microsoft.com/en-us/power-bi/create-reports/deployment-pipelines-compare))
- **Deployment history** columns: Deployed to, Date and time, Deployed by, Items (New / Different / Unchanged / Failed), Note, ID, and Status (Successful / Unsuccessful). It keeps up to 1,000 deployments. ([history](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/deployment-history))
- **Endorsement.** Promoted is applied by writers; Certified only by "an organization-authorized reviewer". Endorsed items get badges and are "listed first". ([endorsement](https://learn.microsoft.com/en-us/fabric/governance/endorsement-overview))

**Bookmarks**

- The Bookmarks pane has **Personal bookmarks** and **Report bookmarks** sections.
- A row's ellipsis menu offers Update, Make default, Rename and Delete.
- The cap is 20 per report. Personal bookmarks expire after six months and "can't [be] directly share[d]". ([bookmarks](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-bookmarks))

**Shell**

- "In the upper right corner, select your profile picture, and then choose **Sign out**." ([sign out](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-sign-in))

**Audit (Purview)**

- Filters: **Date and time range** (the "default selection is the past seven days", in UTC), **Activities**, **Users**, and **File, folder, or site**.
- "When you combine filters, the search results show only items that match all of the filter criteria." ([audit](https://learn.microsoft.com/en-us/fabric/admin/track-user-activities))

### Looker

**Access model and editor**

- **Two levels:**
  - **View:** "see the folder, view the Looks and dashboards inside it, and copy" them.
  - **Manage Access, Edit:** also manage access and edit the folder and its content.
- The dialog opens from the gear, then **Manage Access**. It has an "Add group or user" field and an X to remove a row.
- "If the folder is a subfolder, Looker shows whether this folder inherits its access-level settings from its parent." The page also warns: "Changes can affect all users who have access to each folder." ([folders](https://docs.cloud.google.com/looker/docs/organizing-spaces))
- Groups are "the best practice". ([content access](https://docs.cloud.google.com/looker/docs/access-control-and-permission-management))

**Personal space**

- The left Folders section holds your personal folder, **Shared folders**, and **People**, which holds other users' personal folders you may access.
- With "Default Private Personal Folders" on, non-admins don't see others' personal folders. ([finding content](https://docs.cloud.google.com/looker/docs/finding-content))

**Publish and review**

- **Development Mode** is toggled from the main menu or with Ctrl+Shift+D. It shows a banner, "You are in Development Mode", with "Exit Development Mode". Production project files are read-only. ([dev mode](https://docs.cloud.google.com/looker/docs/dev-mode-prod-mode))
- The **Git button names the next step:** Up to Date, Validate LookML, Pull from Production, Commit Changes & Push, Deploy to Production, or **Open Pull Request** when PRs are configured. After deploying, a "Deployment Submitted" dialog appears. ([Git](https://docs.cloud.google.com/looker/docs/version-control-and-deploying-changes))

### Metabase

**Access model and editor**

- **Levels:**
  - **Curate:** view, edit, move, delete and pin items, and create sub-collections.
  - **View.**
  - **No access:** the collection "won't be listed".
- Permissions are additive across groups.
- Changing a collection's access "doesn't automatically change access to _existing_ subcollections" unless **"Also change sub-collections"** is on. New sub-collections inherit. ([collection permissions](https://www.metabase.com/docs/latest/permissions/collections))

**Personal space**

- "Your personal collection": "Only you (and your admins) can view and edit this collection."
- The shared root is "Our analytics". Official collections carry a badge. ([collections](https://www.metabase.com/docs/latest/exploration-and-organization/collections))

**History**

- Shown in the info sidebar, with "up to fifteen previous versions". A back arrow reverts to a version. ([history](https://www.metabase.com/docs/latest/exploration-and-organization/history))

**Audit**

- The Usage analytics collection is admin-only by default.
- Retention is **720 days** by default, set by `MB_AUDIT_MAX_RETENTION_DAYS`. ([usage analytics](https://www.metabase.com/docs/latest/usage-and-performance-tools/usage-analytics))

### Spotfire

**Access model and editor**

- **Library permission levels:** Access; Browse (+ Access); Modify (+ Browse + Access), which includes creating subfolders; and Full control, which adds changing permissions.
- Subfolders inherit, but inheritance "is completely severed" when a subfolder sets explicit permissions.
- Permissions apply to groups.
- "Folders where users do not have 'Browse (+ Access)' will not be seen even if they are inside a folder the users have access to." ([library permissions](https://docs.tibco.com/pub/spotfire_server/latest/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/library_permissions.html))

**Bookmarks**

- A bookmark is private or public.
- "An icon showing a single person indicates that a bookmark is private, and an icon with multiple people indicates that a bookmark is public."
- New bookmarks are "private by default". "Private bookmarks are listed before public bookmarks", and the most recently updated come first. ([bookmarks 6.5.3](https://docs.tibco.com/pub/spotfire/6.5.3/doc/html/bm/bm_what_are_bookmarks.htm))
- Menu items include Private Bookmark, Public Bookmark, **Save as Private Bookmark** and Update Bookmark. ([menu](https://docs.tibco.com/pub/spotfire/6.5.3/doc/html/bm/bm_pop-up_menu.htm))
- The current client keeps the model. ([making a bookmark public (excerpt)](https://docs.tibco.com/pub/sfire-cloud/latest/doc/html/en-US/TIB_sfire_client/client/topics/en-US/making_a_bookmark_public.html))

**Audit**

- Action logs record "what the users are doing, for example, if a user opens a file from the library, when a user logs in", in categories such as `library` and `admin`. ([action logs (excerpt)](https://docs.tibco.com/pub/spotfire_server/latest/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/action_logs_and_system_monitoring.html))
- Retention is a "Pruning period (hrs)". ([config](https://docs.tibco.com/pub/spotfire_server/12.0.6/doc/html/TIB_sfire_server_tsas_admin_help/server/topics/user_action_log_dialog_box.html))

### Grafana

**Access model and editor**

- "Permissions cascade from parent folders to child folders", and "You cannot grant a user lower permissions on a subfolder than they have on a parent folder."
- **Manage permissions** is in the folder's menu. The levels are View, Edit and Admin. ([folder access](https://grafana.com/docs/grafana/latest/administration/roles-and-permissions/folder-access-control/))
- Add a permission picks User, Service Account, Team or Role. The docs' example: "user1 is set to `admin`, which is inherited from the permissions set in parent folder". ([dashboard permissions](https://grafana.com/docs/grafana/latest/administration/user-management/manage-dashboard-permissions/))
- **Inherited rows can't be removed** and show a lock labelled "Inherited Permission", and "Viewer Inherited from folder". ([forum (community)](https://community.grafana.com/t/removing-permissions-from-a-nested-folder/138260), [#98003 (community)](https://github.com/grafana/grafana/issues/98003))

**History**

- Found under Settings, then **Versions**. **Compare versions** gives text differences plus "View JSON Diff".
- **Restore** creates "a new version of the dashboard... with a different version number". It keeps **20** versions by default (`versions_to_keep`). ([versions](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/manage-version-history/))

**Publish and review**

- The Git Sync save drawer has Branch, Repository folder, Filename and **Comment**.
- A **Changes** tab shows "the differences between the updates you made and the original resource". Then "Open a pull request in GitHub". ([Git Sync](https://grafana.com/docs/grafana/latest/as-code/observability-as-code/git-sync/provisioned-dashboards/))

### Sigma

**Personal space**

- The personal folder is "My documents", in the left navigation of Home. ([navigation (excerpt)](https://help.sigmacomputing.com/docs/get-around-in-sigma))

**Publish and review**

- A **Draft** is visible only to "you and others currently editing". **Published** is visible to view or explore users. Tagged versions are read-only.

**History**

- **Version history** lists published versions, marks the **Current** one, and expands each into an edit history.
- The More menu offers **Restore version as draft**, Save as new workbook and Copy link.
- Only Can Edit users see history. ([versions](https://help.sigmacomputing.com/docs/workbook-versions-and-version-history))

**Access model**

- Access flows downward, and "Inherited access cannot be downgraded". It can be granted to users, teams, or all users. ([access](https://help.sigmacomputing.com/docs/folder-and-document-permissions))

### GitHub pull-request review

**Publish and review**

- **Flow:** the **Files changed** tab, a per-file "Viewed" checkbox, then **Review changes**, a summary comment, one of three choices, and **Submit review**. The choices:
  - **Comment:** "leave general feedback without explicitly approving the changes or requesting additional changes"
  - **Approve:** "approve merging the changes proposed in the pull request"
  - **Request changes:** "submit feedback that must be addressed before the pull request can be merged"

  ([reviewing](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request))
- **"Pull request authors cannot approve their own pull requests."** ([approving](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews))
- A Reviews drop-down filters pull requests by review status, and `user-review-requested:@me` lists the ones waiting on you. ([filters (excerpt)](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests))
- A fork shows its upstream "below the name of the fork". ([forks (excerpt)](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork))

**Audit**

- Only owners see the audit log.
- Search uses qualifiers: `actor:`, `action:`, `repo:`, `created:`.
- Each entry shows the actor, the affected user, the repository, the action, the country and the time. The default view is the past three months. Export is JSON or CSV. Retention is **180 days**. ([audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization))

### Supplementary: what a "group" looks like (Entra ID)

- "By default, group `ObjectID` attributes will be emitted in the group claim value." That is a GUID.
- `sAMAccountName` forms exist only for groups synced from on-prem AD. Display names exist only for cloud groups assigned to the application.
- Tokens carry at most **200** groups in a JWT. Beyond that, Entra "completely omit[s]" the groups claim and sends an overage pointer instead. ([Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims))
- **Consequence for design:** a group's identifier may not be human-readable. The UI must show exactly what the token carries (see the open points below).

## Cross-product patterns

### Shared (the baseline users will expect)

1. **Access is granted on containers and flows down.** Seen in Tableau projects, Power BI workspaces, Looker folders, Spotfire library folders, Grafana nested folders, and Sigma workspaces and folders. Metabase is the partial exception: existing sub-collections change only with a toggle.
2. **Groups are the unit** (Looker's best practice, Power BI, Grafana teams, Sigma teams, Spotfire). Only wechart forbids individuals outright (AC-259).
3. **A few named levels, not capability matrices, in daily use:**
   - Looker has 2, Metabase 3, Grafana 3, Power BI 4 and Spotfire 4.
   - Tableau alone exposes per-capability rules with Deny.
4. **Several memberships combine to the most permissive**, and inherited access can't be lowered below: Metabase is additive, Power BI takes the highest, Sigma says "cannot be downgraded", and Grafana says "cannot grant lower". Tableau is the exception: deny wins.
5. **What you can't see is not listed:** Metabase's "won't be listed" and Spotfire's "will not be seen".
6. **Inheritance is shown in place:**
   - Looker says whether a subfolder inherits.
   - Grafana locks inherited rows.
   - Tableau's effective grid explains why on hover.
7. **Every product has a private authoring space:** Tableau Personal Space, Power BI My workspace, Looker's personal folder, Metabase's personal collection, and Sigma's My documents. They differ on whether admins can look in.
8. **Publishing is a separate, deliberate step:** Power BI's "staging area" plus Update app; pipelines; Sigma Draft to Published; Looker's Deploy; Grafana Git Sync plus a PR; GitHub PRs.
9. **The publish step carries an optional note that lives on in history:** the Power BI deployment note, the Grafana comment, the GitHub review summary.
10. **Dependencies travel together:** Power BI's Select related.
11. **Reviewers see the change itself:** GitHub's Files changed, Power BI's Change review (line by line), Grafana's Changes tab and Compare versions.
12. **Version history is short and bounded:** 10 on Tableau Cloud, 15 in Metabase, 20 in Grafana, 25 on Tableau Server. Restore makes the old content current, directly, everywhere except Sigma, which restores as a draft.
13. **Bookmarks are private by default and shared by choice:** Spotfire private/public, Tableau's eye icon, Power BI's personal vs report sections.
14. **Audit is admin-only, filtered by who, what, where and when, with bounded retention:** GitHub 180 days, Metabase 720 days, Spotfire's pruning period, Purview's filters combined with AND.
15. **Identity and Sign out live in a top-right account menu** (Power BI).

### What sets each product apart

- **Tableau:** capability rules with Deny; the effective-permissions grid with reasons on hover; Locked vs Customizable. Site admins can manage workbooks in Personal Space.
- **Power BI:** the workspace as a staging area behind an app; pipelines with Select related, notes, compare labels and line-by-line change review; endorsement badges; personal and report bookmark sections.
- **Looker:** Development Mode is a global mode with a banner. Its Git button always names the next step.
- **Metabase:** an admin permissions grid; existing sub-collections change only with "Also change sub-collections"; admins can open personal collections.
- **Spotfire:** an explicit subfolder grant severs inheritance; hidden without Browse; person and people bookmark icons, and "Save as Private Bookmark".
- **Grafana:** inherited grants can't be lowered or removed in a subfolder; restore creates a new version; the Git Sync Changes tab.
- **Sigma:** "Restore version as draft"; "Inherited access cannot be downgraded".
- **GitHub:** three review outcomes; authors can't approve their own; qualifier search in the audit log.

## Direction: Govern where the content lives. Explore shows each person only what they may see. Access is edited in a panel docked beside the folder, which separates "Set here" from "From <ancestor>", for AD groups only. All authoring happens in a clearly banded "My workspace". Work reaches a shared folder only through a GitHub-style proposal whose review view renders the item itself. A restore is itself a proposal. Bookmarks are private or shared the Spotfire way, and Super-Admins get a Purview-style audit trail inside Security.

### Phase-2 principles (added after direction.md §1, principles 1–5)

6. **Show only what's permitted, and never hint at the rest.** Hidden folders, items, counts, search hits and links behave as if they don't exist. _Evidence:_ Metabase ("won't be listed"), Spotfire ("will not be seen"). _ACs:_ AC-264, AC-268.
7. **Access is read where it applies.** Every group that reaches a folder is shown there, and an inherited one names the folder it comes from. _Evidence:_ Looker's inheritance indicator, Grafana's locked inherited rows, Tableau's effective permissions. _ACs:_ AC-259–AC-261.
8. **Private until proposed, and nothing lands unreviewed, your own work included.** _Evidence:_ Power BI's "staging area", Sigma's Draft, Looker Development Mode, GitHub PRs. _ACs:_ AC-278, AC-284, AC-286.
9. **The reviewer sees the thing, not a description of it.** _Evidence:_ GitHub Files changed, Power BI Change review, Grafana Changes and Compare. _ACs:_ AC-287, and §P2.6 E's "reviews the proposed item".

### Reasoning

**Why these surfaces sit inside the workbench, not in an admin app.** Phase 1 rejected "a separate admin application with its own visual language" in favour of one object in many views. Access, history, proposals and bookmarks all belong to a folder or an item, so each opens beside that folder or item:

- Access and History open as a docked right panel.
- Proposals open in a full-viewport review view, as the chart editor does.

Only the audit trail, which spans every folder, is a page, under Security (Super-Admin only, AC-001 and AC-295).

**Super-Admin** (AC-256, AC-265, AC-267, AC-294–AC-297)

- **Access on every folder, root included.** A folder whose groups resolve to nothing says **"Only Super-Admins can see this folder"** in its header and its Access panel. That makes the phase-1 content still waiting for groups visible at a glance (AC-267).
- **Audit trail** under Security, with User, Event, Folder and time filters that combine with AND (Purview) and show as removable chips (phase 1's filter-chip grammar).
- **Jobs and Schedules** across all folders, with a Folder column and filter (Looker's PDT page filters by model and connection).

**Admin, a read-write member** (AC-259–AC-262, AC-269, AC-276–AC-291, AC-297, AC-157–AC-164)

- **Access panel, docked right.** It is docked rather than a modal, as Tableau's and Looker's are, because AC-260 requires showing each inherited group's source folder. In a docked panel that source is a link:
  - Clicking it moves the tree and the panel to the ancestor.
  - An admin can walk up the chain and change the grant where it's set.
  - The folder's contents stay visible, which is the population Looker warns a change affects.

  Power BI's Manage access is a side pane: the precedent. The panel separates **Set here** from **From ancestors**, and locks inherited rows (Grafana). A group set here that an ancestor already grants higher says what outranks it, because under AC-261 grants add up and can't be lowered (Grafana, Sigma).
- **My workspace as a place, not a mode.** Looker's Development Mode is global and needs a banner so people know which world they're in. wechart makes the workspace a tree root (AC-276; the user's IA decision "Explore = folders") and keeps the banner idea as a band on every workspace page. Shared items offer **Edit in my workspace**, or **Open my copy** (AC-278), never in-place editing.
- **Origin and target always visible.** GitHub shows a fork's upstream under its name. Every workspace item shows "Copied from _path_ · version _n_" or "New", plus its target folder (AC-281, AC-282).
- **Proposals follow GitHub's grammar with Power BI's dependency rule:**
  - One dialog with an optional description of up to 1,000 characters (Power BI's note, Grafana's comment).
  - Required workspace models bundled automatically, with the reason stated (Power BI's Select related; AC-285).
  - A review view that renders the proposed item: a dashboard drawn read-only, a model as a YAML diff (Power BI Change review), or a data source as a settings diff.
- **Reject is GitHub's "Request changes" made terminal.** The proposal returns to the author's workspace with an optional reason of up to 1,000 characters (AC-290).
- **Self-approval is allowed and never skipped** (R17, R18). This departs from GitHub on purpose. The review view says "You proposed this", and the button reads "Approve my own proposal", so the self-approval stays deliberate and audited.
- **History keeps the last 10 versions** (AC-289). That matches Tableau Cloud's 10 and sits inside the studied range of 10–25. **Restore follows Sigma, not Tableau, Grafana or Metabase:** it opens a "Propose restoring version _n_" dialog, because AC-289 requires a proposal.

**User, read-only** (AC-263, AC-264, AC-266, AC-277, AC-292, AC-293)

- **A reading tree.** It holds the folders they may see plus their dashboards. It has no "+ Folder", no New, no My workspace, no Access, no History and no pencils (AC-277). Folders they can't see simply aren't there (principle 6).
- **Bookmarks follow Spotfire exactly:**
  - Private by default.
  - A person icon for private and a people icon for shared.
  - Private listed before shared; the most recently updated first.
  - Others can "Save a copy to mine".

  Spotfire is the migration source, and its model is AC-292/AC-293 verbatim. The grouping labels follow Power BI's "Personal" and "Report" sections, renamed **Mine** and **Shared**.

**Single-user mode** (AC-254, AC-308)

- The same flows apply. The top bar shows a **"Single-user mode"** chip (warning icon and label) in place of the account name, and there is no Sign out.
- Phase 1 already requires a persistent warning when Cube accepts unauthenticated requests (AC-169). Kibana warns when security is off (secondary source).
- A chip is chosen over a full-width banner because the workbench is dense, and a chip is always visible at no vertical cost.

### Surfaces

Widths and heights are direction.md tokens unless the Tokens section says otherwise. Each URL restores its state (AC-002's rule).

**1. Sign-in, account and security mode** (AC-251–AC-255)

- **Top bar, right cluster, in order:** search (⌘K), **Reviews** (surface 6), the theme toggle, then the **account button**.
- **Account button:** a 28 px avatar with initials, plus the user's name (12/16, weight 600).
  - At 1280 px and wider, the name is visible, truncated at 160 px with the full name in a tooltip.
  - Below 1280 px, only the initials show, and the name moves into the menu.
  - Accessible name: "Account: _Name_".
- **Account menu:**
  - the name (`text-sm-strong`) and the identity as the provider sends it (`text-xs`, secondary)
  - a "Super-Admin" badge (shield icon) for Super-Admins, and nothing for anyone else
  - a separator, then **Sign out**
- **Security off:** the account button becomes a **"Single-user mode"** chip (open-padlock icon, `status-warning` text). Its menu says: "Sign-in is off, so wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews." There is no Sign out. Security › Policies carries the same note as a persistent notice.
- **States** (wechart-rendered; the sign-in form itself is the provider's). None of them shows any wechart content (AC-251), only the product mark, a sentence and an action:
  - **Signed out:** "You've signed out of wechart." [Sign in again]
  - **Sign-in failed:** "wechart couldn't sign you in." Details holds the provider's error text. [Try again]
  - **No group list received** (for example Entra's overage above 200 groups): "Your sign-in worked, but your identity provider sent no group list, so wechart can't tell what you may see. Tell your administrator." This is kept distinct from the no-access state.
  - **Session ended mid-work:** a modal. "Your session has ended. Sign in again to continue. Changes you haven't saved in this editor will be lost." [Sign in]
  - **No access anywhere:** Explore's empty state. "You don't have access to any folders yet. wechart gives access through AD groups; ask whoever manages the folder you need to add one of your groups." It names no folder.
- **Keyboard:** the account button opens on Enter or Space. Arrow keys move through the menu, and Esc closes it and returns focus to the button.

**2. Folder Access panel** (AC-259–AC-261, AC-265, AC-267, AC-291)

- **Placement:** an **Access** button (lock icon and label) in the folder header, between search and New. It is shown only where the user may change access (a read-write member or Super-Admin). Subfolder rows also get "Access…" in their ⋯ menu.
- **Panel:** docked right, 360 px, titled "Access · _Sales / EMEA_". It follows the selected folder as the tree changes. URL: `…?panel=access`.
- **Section 1: "Read-write groups."** Help text: "Propose changes, create subfolders, set access and run this folder's builds. They also see every folder above, view-only."
  - **Set here:** a 28 px row per group. The identifier is set in the code face (IBM Plex Mono, 12 px), exactly as the groups claim carries it, with a × labelled "Remove _group_ from read-write".
  - **+ Add group:** a combobox. Its label is "AD group"; its placeholder is "Group, as your identity provider sends it". Suggestions come from "Your groups" (the editor's own) and "Used on other folders" (groups already set on folders the editor may see). Free entry is accepted. It never suggests a person.
  - **From ancestors:** one row per inherited group, with a lock icon, the group, and "from _Sales_" as a link to that folder. There is no remove control. Its tooltip: "Set on Sales. A grant reaches every folder below it."
  - **Unset:** "Not set here. Inherits from _Sales_." appears above the inherited rows.
  - **Outranked:** a group set here that an ancestor already grants higher shows an info icon and "Read-write from _Sales_ outranks this".
- **Section 2: "Read-only groups."** Help text: "See dashboards here, in every folder below and in every folder above. Nothing else." It has the same structure.
- **Nobody reaches the folder:** a notice with an icon, "Only Super-Admins can see this folder", which also appears as a chip in the folder header.
- **Footer:** "Changes apply at once and are recorded in the audit trail." Buttons: Cancel, and **Save _n_ changes** (disabled at 0).
  - If the save would remove the editor's own read-write access and they aren't a Super-Admin, a confirmation appears first: "You'll lose read-write access to _Sales / EMEA_. Save anyway?"
  - After saving, a toast offers Undo, which is recorded as another change.
- **Security off:** a note, "Groups take effect when sign-in is turned on."
- **New folder** (direct, with no proposal, AC-291): "+ Folder" adds an inline row in rename mode, as in the prototype. After naming, a hint reads "Access inherits from _parent_ · Set access".
- **States:**
  - Loading: skeleton rows.
  - Load error: an icon, "Couldn't load access for this folder", Retry, and Details.
  - Save error: an inline error band with Details, with the edits kept.
  - Permission lost while open: "You can no longer change access here." The panel turns read-only.
- **Keyboard:** opening moves focus to the panel heading. Tab moves through the rows. Delete or Backspace on a focused row removes it. The combobox follows the APG pattern. Esc closes the panel, asking first when there are changes, and returns focus to the Access button. F6 includes the panel in the pane cycle.

**3. How roles shape Explore** (AC-192, AC-194, AC-262–AC-264, AC-266, AC-277)

- **Tree:**
  - "My workspace" is the first root (person icon), shown only to users who have a workspace.
  - Below a divider comes the shared root, "Our analytics", holding only the folders the user may see, including ancestors reached upward from a grant.
  - Counts include only visible items.
- **Folder header:** the breadcrumb, then the name as H1, then an **access chip** (a `.badge` with icon and label): **Super-Admin** (shield), **Read-write** (pencil) or **View only** (eye). Then Rename (read-write only), search, Access (read-write only), and New ▾ (read-write only; **Folder** is the only entry in shared folders, AC-192).
- **Read-only users:**
  - Rows are subfolders and dashboards only, and no row menu changes anything.
  - Empty folder: "No dashboards here yet."
- **Read-write members in an ancestor they reach upward:** the chip reads View only. They see every kind of item, with no Rename, Access or New there.
- **Footnote in shared folders** (read-write): "To add a dashboard, chart, model or data source here, create it in My workspace with this folder as its target."
- **Hidden things:** a link to a folder or item the user may not see renders the same **Not found** page as a missing one (AC-264).
- **Revoked mid-session:** an action refused by the API shows a toast, "You no longer have access to do this", and the listing refreshes.

**4. Models and data sources as folder items** (AC-269, AC-131, AC-222, AC-157)

- **Listing rows:** Type reads "Model" or "Data source". For a model, Built on reads "_n_ cubes · _n_ views". For a data source, it reads the driver ("PostgreSQL") plus health as icon and label ("Healthy · tested 2 h ago").
  - The item icons are new glyphs in the phase-1 `.itemicon` style, so every kind is distinguished by glyph **and** text.
  - Read-only users never see these rows (AC-263).
- **Opening a model** opens the model editor in context, with the breadcrumb "Explore / _Sales_ / _EMEA_ / _sales.yml_" and the folder's model files in the left pane (AC-222).
  - **In a shared folder it is read-only.** Its header reads "Read-only · in _Sales / EMEA_", with **Edit in my workspace** and **History**, and no New cube or New view.
  - **In My workspace it is editable,** with **Propose to _target_…**.
- **Opening a data source** opens its settings in context. The sections are General, Connection, Test history (AC-163) and Usage (the cubes that use it).
  - Credentials never render as text: "Stored · encrypted" plus Replace, and in a workspace copy, "Kept from _Sales / EMEA_ · encrypted" (AC-164, AC-280).
  - After an approved change it shows AC-161's state, as an icon and label: "Cube uses these settings" or "Waiting for Cube to pick up the change".

**5. My workspace, copying and targets** (AC-276–AC-283)

- **Band:** every page inside My workspace carries "My workspace · only you can see this" (person icon, `bg-subtle` band, 32 px) under the top bar. It is Looker's dev-mode banner, scoped to the place.
- **Workspace listing:** the same columns as a folder (AC-193), plus **Status** (icon and label): Draft, Waiting for review, Rejected, or "In folder as v_n_". Beneath each name: "→ _Sales / EMEA_ · copied from v7" or "→ _Finance_ · new".
- **Workspace item header:**
  - an origin line, "Copied from _Sales / EMEA_ › _Revenue overview_ · version 7" (a link to the original) or "New"
  - "Target: _Sales / EMEA_"; the target can be changed only on items created in the workspace
  - the primary action **Propose to _Sales / EMEA_…**
- **"Edit in my workspace"** on a shared item (in the header, the ⋯ menu and the tile pencil) opens a 520 px dialog:
  - Title: "Edit in my workspace".
  - "Copies _Revenue overview_ into My workspace. You'll propose it back to _Sales / EMEA_."
  - "Always copied: the dashboard, its 6 local charts and the 2 library charts it shows." (AC-279)
  - "Also copy, only if you'll change them:" checkboxes for **Models** and **Data sources**, each with its folder, all **unchecked**.
  - "Anything you don't copy is used from its folder."
  - Buttons: [Copy and edit] [Cancel].
  - A model or data source copies straight away, with a toast: "Copied to My workspace · proposes to _Sales / EMEA_."
  - If a copy exists, the action reads **Open my copy** and skips the dialog (AC-278).
- **New in My workspace** (Dashboard, Chart, Model, Data source, Folder) opens a 520 px dialog for the first four:
  - Fields: Name, and **Target folder**, a tree picker listing only folders where the user has read-write access, preselected when there is only one (AC-282).
  - Note: "It stays private in My workspace until you propose it to this folder."

**6. Proposals and Reviews** (AC-284–AC-291)

- **Propose dialog** (520 px): title "Propose to _Sales / EMEA_".
  - It names the item and the result: "Dashboard · _Revenue overview_ — replaces version 7", or "— new in this folder".
  - If the item it would replace isn't the item it was copied from, a warning: "Replaces '_Revenue overview_' (version 7), which this item wasn't copied from."
  - **Goes with it:** "2 models only your workspace has: sales.yml, returns.yml. The dashboard's cubes resolve through them, so they're approved or rejected together." They have no checkboxes (AC-285).
  - **What changed (optional):** a textarea with a live "_n_ / 1,000" counter.
    - Above 1,000 the counter turns to error text, and Propose is disabled with the message "Shorten to 1,000 characters". Nothing is silently truncated (AC-284).
    - The counter is announced politely at 900 and at 1,000.
  - **Blocked states** name the clash (AC-270): "Can't propose: cube `sales` is already defined in orders.yml in _Sales / EMEA_."
  - Buttons: [Propose] [Cancel]. ⌘Enter submits.
  - Afterwards, a toast: "Proposed to _Sales / EMEA_. It lands when approved. [Review now]". The author may approve their own, so this is the quick path, and the step still happens.
- **Waiting band on the workspace item:** "Waiting for review since _time_ · [View proposal]".
  - The proposal is a snapshot. Later edits add "You've changed it since proposing; those changes aren't in the proposal." (see open point 2)
- **Reviews control** in the top bar: an icon, the label "Reviews" and a count pill.
  - It is shown only to users who may approve anything (Super-Admins, anyone in a read-write group, single-user mode).
  - Count = rows in To review. The pill is hidden at 0.
  - Accessible name: "Reviews, 3 waiting".
  - It isn't in the workspace switcher, so AC-001's switcher list stays exact.
- **Reviews page** (`/reviews`): a list plus a full-height inspector (AC-228's layout). There are two tabs:
  - **To review (_n_):** every open proposal the user may approve, their own included and tagged "Yours".
  - **My proposals:** the user's proposals in every state.
  - Columns: Item (icon and name), Kind, Target folder, Author, Proposed, Includes ("+2 models"), and Status.
  - Selecting a row shows a summary in the inspector with **Open review**. **Approve and Reject are not offered here** (principle 9).
  - Empty states: "Nothing is waiting for your review." / "You haven't proposed anything yet. Proposals start from items in My workspace."
- **Review view** (`/reviews/:id`): full-viewport, like the chart editor.
  - **Header:** "← Reviews", "Review · _Revenue overview_ → _Sales / EMEA_", the status, "2 of 5", and Previous and Next.
  - **Left, 240 px, "In this proposal":** the dashboard and its bundled models, each marked "New" or "Replaces v7".
  - **Centre, the item itself:**
    - A dashboard is rendered read-only as it would appear in the target folder, with a **Proposed | Current** switch and Fit or Actual size.
    - A model is a unified YAML diff against the folder's current file (code face, line numbers, added and removed lines marked by +/− and colour).
    - A data source is a settings diff table (field, current, proposed). Credentials read "unchanged" or "replaced", never a value. Test connection is available (AC-159).
  - **Right inspector, 360 px:**
    - "Proposed by _name_ · _date, time_"
    - the Description as plain text with line breaks, or "No description"
    - "Replaces version 7 (approved 12 Sep by _name_)" or "New in this folder"
    - an information-only line, "Based on version 7; the folder now has version 9". It never blocks, per the user's "overwriting is OK for now".
    - **Approve** (primary) and **Reject…** at the bottom.
  - **Approve** opens an anchored confirmation: "Publish to _Sales / EMEA_? Readers see it at once. Version 7 stays in History." [Approve and publish] [Cancel].
  - **Reject…** reveals "Reason (optional)" with a "_n_ / 1,000" counter, then [Reject].
    - Toast: "Rejected. _Author_'s workspace keeps the work."
    - When the author rejects their own proposal, that is withdrawing it.
  - **Self-review:** the note "You proposed this. Approving your own proposal is allowed and is recorded." The button reads **Approve my own proposal**.
  - **Decided by someone else meanwhile:** "Approved by _name_ 1 min ago." The actions disable.
- **Rejected band on the workspace item:** "Rejected by _name_ · _date, time_", then the reason in a quote block (or "No reason given"), with [Propose again…] and [Dismiss]. The band is `status-error` text with a cross icon.
- **Proposal states, always as icon and label:**
  - Waiting for review: clock icon, `text-secondary`
  - Approved: check icon, `status-success`
  - Rejected: cross icon, `status-error`
- **Keyboard:**
  - Rows respond to arrows, and Enter opens a review.
  - In the review view, F6 cycles the three panes. Previous and Next are buttons.
  - The confirmation traps focus, and Esc cancels it.
  - No single-key shortcut approves, rejects or changes access (WCAG 2.1.4).

**7. Version history and restore** (AC-288, AC-289)

- **Placement:** a **History** button (clock icon and label) in the header of a shared item, for read-write members and Super-Admins (see open point 5). It opens a docked right panel, 360 px.
- **Panel "History · last 10 versions":** newest first, with the current version tagged **Current**. Each row has two lines:
  - "v12 · 25 Sep 2026, 14:02"
  - "by _author_ · approved by _approver_", followed by the description clamped to 2 lines, with "More".
  - Footnote: "Only the last 10 versions are kept."
- **Row actions:**
  - **View:** the centre renders that version read-only, under the band "Version 9 of _Revenue overview_ · read-only · [Back to current]".
  - **Compare with current** for models (YAML diff) and data sources (settings diff), reusing the review view's components.
  - **Propose restoring…:** opens the Propose dialog titled "Propose restoring version 9 to _Sales / EMEA_", with the description prefilled: "Restore version 9 (approved 12 Sep by _name_)." Nothing is ever replaced directly (Sigma's restore-as-draft).

**8. Bookmarks, personal and shared** (AC-292, AC-293)

- **Placement:** the dashboard header's phase-1 Bookmarks control opens a 320 px popover.
- **Sections:** **Mine** first, then **Shared**, each ordered by most recently updated first (Spotfire).
- **Row:** the name, then visibility as icon and label: a person icon with "Only me", or a people icon with "Shared". Shared rows add "by _name_".
- **Owner's ⋯ menu:** Apply, Update, Rename, **Share with everyone who can see this dashboard** or **Stop sharing**, and Delete.
  - Sharing asks: "Share '_name_' with everyone who can see this dashboard? They'll see it under Shared, labelled with your name."
- **Other people's shared rows:** Apply, and **Save a copy to mine** (Spotfire's "Save as Private Bookmark").
- **New bookmark:** a Name field. Visibility defaults to Only me.
- **Read-only users** can save and share bookmarks (AC-266, AC-293).
- **Keyboard:** arrows move through the list, and Enter applies. The ⋯ menu opens with Shift+F10 or its button.

**9. Audit trail** (AC-294–AC-296)

- **Placement:** **Security › Audit trail**, a tab beside phase 1's Policies and Context preview. Security is shown to Super-Admins only (AC-001). A direct URL for anyone else renders Not found.
- **Filter row:**
  - **User:** a combobox of the identities in the records.
  - **Event:** a multi-select of Sign-in, Access change, Proposal, Approval, Rejection, Restore and Data-source change.
  - **Folder:** a tree picker with "Include subfolders", off by default.
  - **Time:** Last 24 hours, 7 days, 30 days, All, or Custom.
  - Filters combine with AND (Purview) and show as removable chips, with "Clear filters". URL: `/security/audit?user=&event=&folder=`.
- **Table** (34 px rows, sticky headers, one page at a time, as AC-230): Time (tabular, local time with UTC on hover), User, Event (icon and label), Folder (path), Item (kind and name), Details. The details are a one-line summary such as "Added read-write group `SALES-EMEA-RW`".
  - Order is fixed, newest first (AC-295).
- **Inspector:** the full record:
  - an access change's before and after lists
  - a proposal's description and bundle
  - a rejection's reason
  - a data-source change's changed fields, with credentials shown only as "replaced"
- **Footnote:** "Records older than 1 year are removed. The deployment sets this period." It names the configured value (AC-296).
- **States:**
  - Empty after filtering: "No records match these filters. [Clear filters]"
  - Loading: skeleton rows.
  - Error: an icon, a message, Retry and Details.

**10. Data sources across folders; Jobs and Schedules by folder** (AC-157, AC-158, AC-233, AC-297)

- **Data sources page:**
  - Title and note (AC-233): "Every data source you can see, in every folder. To change one, open it and choose Edit in my workspace."
  - Columns: Name, **Folder** (a path link), Driver, **Health** (icon, label, and when last tested), Used by (_n_ cubes; hovering lists them), Updated.
  - Filters: Folder, Driver, Health, plus search.
  - A row opens the source's settings in its folder (surface 4).
  - **New data source** starts the workspace create flow with a target folder (AC-158, AC-282), then phase 1's wizard: Type → Connection → Test → Name.
  - **For a user with only read-only access**, this page can only ever be empty (see open point 6). It shows: "Data sources are available to read-write members of a folder. Your dashboards are in Explore." [Open Explore]
- **Jobs and Schedules:**
  - A **Folder** column after the name, and a Folder filter.
  - For read-write members who aren't Super-Admins, a scope note: "Showing pre-aggregations of models in the folders where you have read-write access." It names no other folder.
  - Model links open the model editor in its folder, read-only when the folder is shared.
  - ~~Building and scheduling need no proposal (AC-297).~~ Building and wechart-owned schedules need no proposal. A Cube-owned schedule is a `refresh_key` in the model, changed by a proposal (AC-297, amended 2026-09-28, R40).

### What this direction rejects

- **Tableau's capability grid with Deny.** wechart has exactly two levels and groups only. Under AC-261, grants add and never subtract, so Deny-wins would contradict the requirement.
- **Spotfire's "explicit permissions sever inheritance".** AC-261 says a descendant's groups are added alongside, never in place. Grafana's and Sigma's "cannot be lowered" is the model instead.
- **Metabase's "changing access doesn't change existing sub-collections" and its "Also change sub-collections" toggle.** wechart's inheritance is live (AC-260).
- **Modal permission dialogs** (Tableau, Looker). A modal blocks navigating to the ancestor that an inherited grant comes from, and AC-260 makes that source part of the display. The docked panel follows Power BI's side pane.
- **An app-wide group × folder permissions grid as the editor** (Metabase admin). With hundreds of AD groups and inherited folders, a grid reads badly. The per-folder panel shows effective access where it applies.
- **Admins looking into personal spaces** (Metabase admins edit personal collections; Tableau site admins manage Personal Space workbooks). AC-276 forbids it, Super-Admins included.
- **A global Development Mode toggle** (Looker). The workspace is a place in the tree (AC-276, the user's "Explore = folders" decision), so there is no hidden mode. Looker's banner survives as the workspace band.
- **Multi-stage pipelines** (Power BI Dev → Test → Prod). The requirements define one hop: workspace to folder.
- **GitHub's "authors cannot approve their own".** The user decided self-approval is always allowed and the step is never skipped (R17, R18).
- **Approving from a list or summary without seeing the item.** Principle 9.
- **Direct restore** (Tableau, Grafana, Metabase). AC-289 requires a proposal; Sigma's restore-as-draft is the model.
- **Endorsement badges** (Promoted, Certified). No requirement asks for them. In wechart, "approved" means "in the folder".
- **Power BI's 20-bookmark cap and six-month expiry.** No requirement sets them.
- **Access-request flows and locked placeholders for hidden folders** (Tableau and Power BI request access). They reveal that hidden content exists (AC-264).
- **Email or chat notices** (Tableau and Power BI access-request emails). This is a phase-2 non-goal. The Reviews count is the only notice (R12).
- **A full-width banner for single-user mode** (Kibana-style). A permanent top-bar chip says the same without costing the workbench vertical space.
- **New colour tokens.** Every new state is icon and label on the existing roles (rule 3).

### Tokens to derive

No new colours and no new type sizes. Each new value is below with its provenance.

| Token or value | Value | Provenance |
| --- | --- | --- |
| Group identifier text | IBM Plex Mono, 12/16 | direction §3 code face, used for exact identifiers as in model code (AC-223). Entra emits GUIDs by default ([Entra](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims)), so identifiers aren't prose. |
| Access and History panels | 360 px, docked right, within the 280–480 inspector range | direction §2 inspector range; the prototype's chart-editor inspector column is 360 (`index.html`, `.editor-overlay`) |
| Review view panes | 240 / fluid (min 560) / 360 | prototype model file pane 240 (`.model`); direction §2 centre minimum 560; editor inspector 360 |
| Dialogs | 520 px (Propose, Edit in my workspace, New item); 400 px (confirmations) | wechart decision; none of the studied products publishes a width |
| Account button | 28 px avatar (12/600 initials) plus name 12/16 600, truncated at 160 px; name hidden below 1280 px | avatar from prototype `.avatar`; 160 px and the 1280 breakpoint are a wechart decision, taken from direction §2's breakpoints |
| Reviews count pill | height 18, min-width 18, 12/16 600 tabular numerals, `accent` fill with `text-on-accent` | prototype `.mbadge` height 18; contrast 5.71:1 light and 6.84:1 dark from direction §5 |
| Access and visibility chips | the existing `.badge` (22 px, radius 999) with icon and label | prototype `.badge`; rule 3 |
| Workspace band | 32 px, `bg-subtle`, person icon, 12/16 `text-secondary` | direction §4 control height 32; §5 roles |
| Rows | Access panel 28 (compact); Reviews, Data sources, Audit 34; History two-line rows at 16 + 16 + 8 + 8 = 48 | direction §4 (28 and 34); 48 is derived from the two 16 px lines and 8 px padding |
| Proposal status | Waiting: `text-secondary` plus clock. Approved: `status-success` plus check. Rejected: `status-error` plus cross. | direction §5 status roles; rule 3 |
| Single-user chip | `status-warning` text plus open padlock | direction §5; the security-off warning precedent (AC-169, Kibana, secondary) |
| Description and reason limit | 1,000 characters, live counter | AC-284, AC-290 |
| Versions kept | 10 | AC-289; Tableau Cloud also keeps 10 |
| Audit retention note | deployment setting, 1 year by default | AC-296 |
| Data-viz palettes | unchanged: 8 categorical slots, sequential, diverging, markings | direction §5 |

### Checklist rules 59–85 (appended to direction.md §9)

59. The top bar shows the signed-in user's name beside a 28 px avatar at widths of 1280 px and above. The account menu holds the identity, a Super-Admin label for Super-Admins, and Sign out. With security off, the same place shows a "Single-user mode" chip (icon and label) and there is no Sign out.
60. The signed-out, sign-in-failed, no-group-list and session-ended states show only the product mark, one sentence and one action. No folder, item or wechart content renders behind them.
61. A signed-in user with no folder access sees an Explore empty state that names no folder and says access comes from AD groups.
62. The Access panel lists read-write groups before read-only groups. Each list separates "Set here" from "From ancestors". Every inherited group names its source folder as a link. Inherited rows carry a lock icon and have no remove control.
63. An unset list says "Not set here. Inherits from _folder_." When nothing reaches a folder, its header and Access panel both say "Only Super-Admins can see this folder".
64. The group picker is labelled "AD group". It suggests only the editor's own groups and groups already set on folders the editor may see, and it never offers a person.
65. Access changes apply only on Save, and the Save button counts pending changes. A save that would remove the editor's own read-write access asks first. Every saved change can be undone from its toast and appears in the audit trail.
66. A group set on a folder that an ancestor already grants at a higher level states which grant outranks it.
67. No tree, listing, count, search result or link reveals a folder or item the user may not see. A link to one renders the same Not found page as a missing item, and there are no locked or greyed placeholders.
68. A read-only user's Explore has no "+ Folder", New menu, My workspace, Access, History or pencil, lists only subfolders and dashboards, and offers no row action that changes anything.
69. Every folder header shows the user's access there as a chip with icon and label: Super-Admin, Read-write or View only.
70. Models and data sources appear in folder listings with their kind as text in Type. They open in the model editor or the source settings under the folder's breadcrumb, read-only in shared folders.
71. A shared item offers no in-place editing. For read-write members its primary action is "Edit in my workspace", or "Open my copy" when a copy exists. In folders where the user is view-only, neither appears.
72. "My workspace" is the first tree root, above the shared root, with a person icon. Every page inside it carries the band "My workspace · only you can see this".
73. Every workspace item shows its origin ("Copied from _path_ · version _n_" or "New") and its target folder. The Edit in my workspace dialog for a dashboard lists models and data sources unchecked, and says that uncopied ones are used from their folders.
74. Creating a dashboard, chart, model or data source in the workspace asks for a target folder from a picker that lists only folders where the user has read-write access.
75. The Propose dialog names the target and says whether the item is new or replaces version _n_. It warns when the item it replaces isn't its origin, and lists bundled workspace models with the reason and no way to remove them. Its description counter reads "_n_ / 1,000" and blocks submission above 1,000 without truncating.
76. The top-bar Reviews control appears only to users who may approve something. Its count equals the rows in To review, and its accessible name includes the count.
77. Approve and Reject are available only in the review view. That view renders the proposed item: a drawn dashboard with a Proposed / Current switch, a model YAML diff, or a data-source settings diff with no credential values. Approve asks for confirmation. Reject offers an optional reason with a "_n_ / 1,000" counter.
78. When the reviewer is the author, the review view says so and the button reads "Approve my own proposal".
79. Proposal states always pair an icon and a label: Waiting for review, Approved, Rejected. A rejected workspace item shows the approver, the time and the reason at the top of the item.
80. History lists at most 10 versions, newest first, each with number, time, author, approver and description, and marks the current one. Restoring always opens "Propose restoring version _n_" and never replaces directly.
81. Bookmarks list Mine before Shared, newest first within each. New bookmarks are "Only me". Each row shows its visibility as icon and label, and shared rows name who shared them. Only the owner sees Update, Rename, Stop sharing and Delete; others see "Save a copy to mine".
82. The audit trail sits under Security and is shown to Super-Admins only. It lists newest first with time, user, event (icon and label), folder, item and details. Its User, Event, Folder and Time filters combine with AND as removable chips, and the page states the retention period.
83. No stored credential renders as text anywhere, including diffs and audit records. The UI shows "Stored · encrypted", "Kept from _folder_ · encrypted" or "replaced".
84. Data sources lists each source with its folder path, driver, health (icon, label and last-test time) and the cubes using it. Jobs and Schedules show a Folder column and filter. A scoped user's page says it shows only their read-write folders and names no other folder.
85. Every new panel, dialog and popover takes focus on open, closes on Esc (asking first when there are unsaved changes), and returns focus to the control that opened it. No approval, rejection or access change is bound to a single-key shortcut.

### Open for the user

These are gaps in the requirements, not alternative directions. The design above uses the stated default until the user decides.

1. **How groups are displayed.**
   - Entra emits group **ObjectIds (GUIDs)** unless configured for `sAMAccountName` (synced groups) or display names (cloud groups assigned to the app). ([Entra](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims))
   - **Default:** show the literal claim value.
   - A human-readable label would need wechart to store group metadata or query the directory, and §P2.2 says wechart manages no groups. The sign-in research should state which claim format deployments use.
   - A related question: should wechart warn when a typed group has never appeared in any sign-in? That needs a record of the groups seen at sign-in.
2. **Edits to a workspace item while its proposal waits.** Default: the proposal is a snapshot, and later edits are flagged as "not in the proposal".
3. **The workspace copy after approval.** Default: it stays in the workspace, marked "In folder as v_n_".
4. **Edit in my workspace from view-only ancestors.** Default: not offered, because the user couldn't propose it back.
5. **Who sees History.** Default: read-write members and Super-Admins. AC-289 doesn't say whether read-only users see it.
6. **A spec conflict for write-spec.** AC-001 lists Data sources to every user, but AC-263 hides every data source from read-only users. Default: show the page to read-only users with an explanatory empty state.
7. **Where AC-252's Sign out lives.** "A Sign out control in the top bar" is met by the account menu anchored in the top bar. Confirm the wording if an always-visible button was meant.
8. **The Owner column in shared folders** (AC-193). Phase 2 has many authors per item. Default: Owner shows the author of the current version.
9. **The review view's compare and diff goes beyond AC-287's minimum** ("the proposed item + description"). It is in the direction on the evidence of GitHub, Power BI and Grafana. Confirm it belongs in scope.
