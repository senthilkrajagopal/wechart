# Measured observations from local reference instances

These values were measured on 2026-09-19 from the running apps on the local `docker-desktop` cluster, using computed styles in Chrome at a 1470×823 viewport. They are first-hand evidence for `direction.md`, and they complement the web-sourced `references.md`.

## Superset 6.1.0 (http://localhost:8088, Northwind sample dashboards)

**Global**

- Font: `Inter, Helvetica, Arial, sans-serif`. Text colors are black at 88% (primary), 65% (secondary) and 25% (disabled/placeholder), following the Ant Design 5 token scheme. The accent is teal `rgb(40,147,179)` and the success green is `rgb(90,193,137)`.
- The top nav is 61px tall with text tabs (Dashboards · Charts · Datasets · SQL), plus create (+), a data menu and Settings on the right.

**List pages** (Dashboards, Databases, Row Level Security)

- A page title at 18px sits over an inline filter row: labelled selects and a search box, each about 32px tall.
- Table rows are 45–48px tall with 14px body text. Column headers can be sorted.
- There's a primary "+ Entity" button at top right and "Bulk select" next to it.
- The empty state is an illustration, a message and a primary CTA.

**Dashboard view**

- A collapsible left "Filters and controls" panel, **260px** wide, stacks labelled filter inputs. "Apply filters" and "Clear all" are pinned to the bottom.
- The title row holds the name, favorite, refresh, a "Published" status pill, the owner, the modified time, "Edit dashboard" and an overflow menu.
- Chart cards: white, **16px padding, 6px radius**, no border. A card involved in cross-filtering gets a teal glow (`0 0 12px rgb(40,147,179)`).
- Card titles are **16px / 500**. KPI big numbers are **36px**. Chart axis and legend text is **12px**, which dominates the dashboard: 63 of 92 text nodes.
- A markdown block at the top of the dashboard holds the title, a description with bold emphasis, and cross-filter instructions.
- Loading state: a logo spinner with "Waiting on <database>".

**Dashboard edit mode**

- A right-hand builder panel with the tabs **Charts** (search, sort by recent, "show only my charts", chart cards showing viz type, dataset and modified time) and **Layout elements** (**Tabs, Row, Column, Header, Text/Markdown**, Divider). Items are dragged onto the grid.
- The header has undo/redo, Discard and Save.

**Explore (chart builder)**

- Three columns:
  1. **Chart Source**, 300px: dataset picker, search, collapsible **Metrics** and **Columns** lists with 24px rows, type icons (Σ, #, clock) and drag handles.
  2. **Controls**, 320px: **Data / Customize** tabs, a row of recently used chart-type icons plus "View all charts", and drop zones (X-axis, Time grain, Metrics, Dimensions, Filters, Series limit, Sort). Each drop zone holds pills with ×, and has a "+ Drop columns/metrics here or click" prompt.
  3. **Chart canvas**, the rest of the width: a toolbar with row count, cache status and query time; the chart; and a bottom **Results / Samples** drawer.
- All control labels are 12px / 400. "Update chart" is a sticky button at the bottom of the controls column.
- The legend sits at top-left, scrolls horizontally, and has an "All / Inv" toggle.

**Admin**

- **Databases:** a list with backend, feature flags (AQE, DML, file upload, expose in SQL Lab) and last modified, plus "+ Database" and "Upload file to database".
- **Row Level Security:** a rule list (name, filter type, group key, clause, modified) with a "+ Rule" button.

## Metabase v0.63.18.1 (http://localhost:3000, example "E-commerce Insights" + Sample Database)

**Global**

- Font: `Lato, Arial, sans-serif`. Text colors are `rgba(7,23,34,.84)` (primary), `.62` (secondary) and `.44` (tertiary). The accent is brand blue `rgb(80,158,226)`.
- The app shell has a thin top bar (hamburger, logo, breadcrumb, a centred-right search box, a blue "+ New" button, and icons) and a collapsible left nav with Home, Collections, Data (Databases, Models, Metrics) and Trash.
- The home page offers X-ray suggestions: automatic exploratory dashboards generated per table.

**Dashboard**

- The title is **20px / 700**. Dashboard **tabs** sit under the title (Overview, Portfolio Performance, Website Analysis).
- A sticky **filter bar** runs across the top, holding filter widgets about **32px** tall: Date Range, Date Grouping, Product Category (shows "4 selections"), Vendor. Each widget has a type icon.
- Card titles are **14px / 700**, and card corners have a 6px radius. Body text is mostly 12–13px. KPI scalars are **54px / 700**.
- A goal line is drawn as a dotted rule with a label. Data labels sit on the points.
- The pivot table has conditional background shading, row and grand totals in bold, and roughly 30px rows.

**Question (chart) view**

- The header has the title plus Filter (with a count badge), Summarize, Editor, refresh, bookmark, info and overflow.
- The footer bar has a **Visualization** toggle and a **settings gear** on the left, a table/chart view switch in the centre, and row count, query time and download on the right.
- **Chart-type picker:** a left sidebar lists the "sensible" types for the current result first as an icon grid (Line, Area, Bar, Combo, Row, Scatter, Pie, Table, Pivot Table, Treemap). The rest sit behind "More charts". This is Metabase's recommendation affordance.
- **Chart settings sidebar:** tabs **Data / Display / Axes**.
  - Data: X-axis and series wells. Each series has a color swatch, a "…" menu for per-series settings, × to remove, and a drag handle to reorder.
  - Display: stack series, goal line (value and label), show values on data points (Some/All), and auto formatting (Auto/Compact/Full).
  - Axes: per axis, show label, label text, show lines/ticks, and scale (Timeseries, Linear, and so on).
- A time-grain switch sits under the chart ("View Previous 2 years or this year by Quarter").
- New saved questions show a first-use modal ("It's okay to play around…").

**Notebook editor (query builder)**

- Stacked, color-coded steps: **Data** (blue; table picker with join/column controls), **Filter** (purple), **Summarize** (green; "Pick a function or metric" _by_ "Pick a column to group by"), then sort and limit icons, and a primary **Visualize** button.
- The data picker is a flyout: Sample Database, Our analytics, Browse all.

**Admin** (a separate purple admin shell; its top nav is Settings, Databases, Embedding, AI, Table Metadata, People, Permissions, Performance, Tools)

- **Table Metadata:** three panes.
  1. A searchable table tree per database, with a hide-table eye toggle and Segments.
  2. The table header and description, then a field list: type icon, name, and description per field, plus Sorting and Sync options.
  3. A field detail editor ("Edit the table and fields": name, description, formatting).
- **Permissions:** Data and Collections tabs. Scope runs database → table on the left, and the main area is a group × permission grid (Administrators, All Users × Create queries: "Query builder and native"). Row- and column-level security is an upsell ("Get advanced permissions").

## Dashboard authoring and chart creation (measured 2026-09-19, second pass)

### Superset 6.1.0: dashboard edit mode

- **Header:** undo/redo, **Discard**, **Save** (disabled until something changes), and an overflow menu. Entering edit mode replaces the filter panel with a right-hand builder panel.
- **Builder panel:**
  - **Charts** tab: a "+ Create new chart" link, search, sort by recent, and "Show only my charts". Chart cards show viz type, dataset and modified time, and are dragged onto the grid.
  - **Layout elements** tab: Tabs, Row, Column, Header, Text/Markdown, Divider.
- **Moving:** a hovered chart gets a dashed outline, and the whole tile is draggable (the `move` cursor sits on the chart's top hover menu). Thin **empty drop targets** of about 16 px sit between rows and columns, and dropping inserts there.
- **Resizing:** right edge (`resizable-container-handle--right`: 10 px hit area, `col-resize` cursor, a 2×20 px visible grip centred on the edge) and bottom edge (`row-resize`). Widths snap to grid columns.
- **Hover menus:**
  - Chart: a top menu with a trash icon.
  - Row: a left menu (24 px wide) with delete and a background toggle (transparent or white).

### Superset 6.1.0: "Create a new chart" (`/chart/add`)

- **Step 1:** Choose a dataset (a searchable select), plus "Add a dataset".
- **Step 2:** Choose chart type from a gallery:
  - Left nav: All charts, **Featured**, then Category (Correlation, Distribution, Evolution, Flow, KPI, Map, Part of a Whole, Ranking, Table, Other) and Tags.
  - A search box.
  - A thumbnail grid (Area, Bar, Big Number, Big Number with Trendline, Box Plot, Bubble, Funnel, Gantt, Gauge, Graph, Heatmap, Line, Mixed, Pie, Pivot Table, Radar, Scatter, Sunburst, Table, Tree, Treemap, Waterfall, World Map, …).
- "Create new chart" stays disabled until both a dataset and a type are chosen, and then opens Explore.
- **Explore controls** depend on the viz type. For Area/Bar they are:
  - X-axis
  - Time grain
  - **Metrics** (one or more, as pills)
  - **Dimensions** (one or more)
  - Contribution mode
  - Filters
  - Series limit
  - Sort query by
  - Row limit

  Data/Customize tabs split the query from the styling. A "View all charts" gallery can switch the type while editing.

### Metabase 0.63.18.1: dashboard edit mode

- **Banner:** a full-width top banner reads "You're editing this dashboard." with **Cancel** and **Save**.
- **Header toolbar icons (aria-labels):** Add questions · Add a heading or text box · Add a link or iframe · **Add section** · Add a filter or parameter · Toggle width.
  - Tabs have a ▾ menu (rename, duplicate, delete) and a **+** for a new tab.
  - Filter widgets gain drag handles (⠿) for reordering.
- **Add section:** a popover of three visual layout templates (for example a heading over KPI cards over a chart, a main area with a side column, and a KPI strip over a large chart). Choosing one inserts a pre-arranged group of empty cards.
- **Card hover toolbar** (top right, icon-only): move to another tab · connect filters · visualization settings · change visualization · click behavior · replace question · duplicate · remove.
- **Resizing:** a bottom-right corner handle (`react-resizable-handle-se`, 40×40 px hit area, `nwse-resize` cursor). Cards drag freely on a grid and the others reflow.
- **Card menu (view mode, ⋯):** it includes "Edit visualization" and opens the question editor. Returning comes back to the dashboard.
