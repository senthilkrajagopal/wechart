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
