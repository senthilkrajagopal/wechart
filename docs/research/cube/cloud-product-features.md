---
library: Cube Cloud (commercial product features on top of Cube Core)
packages: [@cube-dev/embed-sdk]
version: 1.7.42
researched: 2026-09-19
sources: [https://github.com/cube-js/cube/tree/v1.7.42/docs-mintlify, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs.json, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/embed-apis/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx, https://cube.dev/pricing, https://registry.npmjs.org/@cube-dev/embed-sdk]
---

# Cube Cloud product features, docs tag v1.7.42 (plus @cube-dev/embed-sdk 0.0.13)

## Summary

Cube Cloud is Cube's commercial platform. wechart runs on Cube Core (open source, self-hosted). This doc lists the Cloud product features documented at git tag `v1.7.42`, whose release was published 2026-09-18 ([release]). For each feature it marks whether a Cube Core API makes it reproducible in wechart, or whether it depends on Cloud backend services. It is a feature reference and a map of the boundary. It is not a recommendation to adopt Cloud.

**Traceability.** There are no acceptance-criterion IDs yet, because `docs/spec.md` has not been written. The relevant inputs are sections of `/Users/srajagopal/Work/wechart/docs/inputs/2026-09-19-product-direction.md`:

- §1: surface almost all Cube functionality in the UI.
- §2: drag-and-drop authoring, dashboards with tabs, sections, global and cross-table filters, trellis, markdown, legends, and x/y axis customization.
- §3: auto-drawn charts with an overridable recommendation.

**Findings that matter for wechart:**

1. **Charts are Vega-Lite specs rendered from query results in the browser.**
   - The docs state that all standard chart types are built on Vega-Lite v5 ([ch-custom]).
   - The per-option pages call only bar, line, area, scatter, heatmap and boxplot "Vega-based" ([cfg-tooltips], [cfg-axes]). How pie, funnel, sankey, map, table and KPI are rendered is not stated.
   - Chart data comes from query results. So every built-in chart type can be reproduced on Core query APIs (`/v1/load`, SQL API) with a client-side renderer, which for wechart is ECharts ([ref-rest]).
2. **The chart-type recommender is documented rule by rule.** Its thresholds come from Draco (Moritz et al., VIS 2018): 12 categories, 10 series and a 30-value cutoff. The 16-character label-length rule is Cube's own ([ch-types]). This bears directly on input §3.
3. **Dashboards.**
   - Cloud dashboards use a 12-column board with stack and grid containers ([db-layout]).
   - There are four control types: filter, time-granularity switcher, field switcher and parent control. Their state is carried in URL parameters (`f_`, `tg_`, `ms_`) ([db-controls], [emb-iframe-db]).
   - The docs at this tag describe **no dashboard tabs and no click-a-chart cross-filtering** ([db-controls], [db-index]).
   - The nearest thing to trellis is small multiples, capped at a 5×5 grid and a single split dimension ([cfg-small]).
4. **Some Cloud features need backend services that Core does not provide.** These are:
   - all AI surfaces: Analytics Chat, the workbook and dashboard agents, AI summary, skills, scheduled tasks, Python, apps and MCP;
   - platform services: publishing and versioning, folders and sharing, users, roles, SSO and SCIM, monitoring, notifications, server-rendered PNG/PDF export, and embedding.

   wechart would have to build each of these itself or leave it out. Sources are in the inventory table.

5. **Security boundary.**
   - `userAttributes` in access policies exists only on the Cloud platform. On Core, groups come from `contextToGroups` and attributes come from `securityContext` ([dm-dap]).
   - Core's own dev mode (`CUBEJS_DEV_MODE=true`) is an authentication bypass: it switches off JWT verification ([dm-devmode]).

## Install

- **Cloud features:** nothing to install. They are hosted services on `*.cubecloud.dev` ([api-intro]).
- **React Embed SDK (Cloud-only, public preview):**
  - Package `@cube-dev/embed-sdk`. The latest dist-tag is `0.0.13`, published 2026-05-22. License MIT ([npm-embed], [npm-embed-all]).
  - The docs say "currently in public preview. The API may change in future releases" ([emb-react]).
  - Pin command: `pnpm add @cube-dev/embed-sdk@0.0.13`.
  - Peer dependencies: `react ^18.0.0 || ^19.0.0`, `react-dom ^18.0.0 || ^19.0.0`, `vega-lite ^6.4.1`, `@tanstack/react-query ^5.0.0`.
  - Runtime dependencies: `@cubejs-client/core ^1.6.43`, `react-vega ^7.6.0`, `d3-format`, `d3-time-format`, `fast-deep-equal`, `use-context-selector 1.4.4` ([npm-embed]).
  - `exports` has only an `import` condition, so the package is ESM-only ([npm-embed]).
  - **It cannot be used against Cube Core.** It needs an `apiUrl` on `cubecloud.dev` and a `sessionId` minted by the Cloud Generate Session API ([emb-react], [api-session]).
  - Node 26 / Vite compatibility: UNVERIFIED. The registry metadata I read did not show an `engines` field.

## Init / auth pattern

### (a) wechart on Cube Core (what is actually callable)

- **Auth header.** The Core Data API takes a JWT in the `Authorization` header with no prefix ([api-intro]).
- **Groups.** Access-policy groups must be mapped from the security context by hand on Core. Verbatim from the docs ([dm-dap]):

  ```javascript
  contextToGroups: ({ securityContext }) => {
    return securityContext.groups || ['default'];
  };
  ```

- **User attributes.** "If you are using Cube Core or authenticating against Core Data APIs directly, you won't have access to `userAttributes`. Instead, you need to use `securityContext` directly" ([dm-dap]).
- **Dev mode.** Do not run Core with `CUBEJS_DEV_MODE=true` outside a developer machine ([dm-devmode]):
  - the flag "forces `NODE_ENV=development`, switching off JWT verification on the data APIs";
  - "With `CUBEJS_DEV_MODE=true` and no `CUBEJS_SQL_PASSWORD` set, the SQL API accepts any credentials."

### (b) Cloud embedding (reference only, not usable on Core)

- **Endpoint.** `POST https://{accountName}.cubecloud.dev/api/v1/embed/generate-session`, with `Authorization: Api-Key …`. It returns `{ "sessionId": … }` ([api-session]).
- **Lifetime.** The sessionId is single-use and must be exchanged within 5 minutes. The exchanged token lasts about 23 hours: it is minted with a 24 h expiry, and the iframe stops trusting it an hour early ([api-session], [emb-signed]).
- **iframe URLs.**
  - Dashboard: `https://<tenant>.cubecloud.dev/embed/dashboard/<publicId>?session=<id>` ([emb-iframe-db]).
  - Creator Mode: `…/embed/d/{deploymentId}/app?session=<id>` ([emb-creator]).
  - Chat: `…/embed/chat?sessionId=<id>` ([emb-chat]).
- **Revoke.** `POST …/api/v1/embed/session/revoke` with `{ sessionId }` returns 204 ([api-session]).

## API surface we will use

### A. Core APIs that make Cloud features reproducible (callable by wechart)

| Core surface                                                                                              | What it provides                                                                                                                            | Cloud features it can back                                                                                | Source                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| `POST/GET {base}/v1/load`                                                                                 | `data`, `annotation` (title, shortTitle, type), `lastRefreshTime`, `external` (served from pre-aggregation), `usedPreAggregations`, `total` | All chart types, tables, the freshness "leaf", the pre-aggregation "lightning" icon                       | [ref-rest]                  |
| Query options: `compareDateRange`, `total`, `ungrouped`, `timezone`, `limit`                              | Default row limit 10,000; maximum 50,000; `ungrouped` omits `GROUP BY`                                                                      | Period-over-period comparison, KPI comparison, boxplot (needs observation-level rows), time zones, paging | [ref-queries]               |
| `GET {base}/v1/meta`                                                                                      | Cubes and views, members with `drillMembers`, `hierarchies`, custom `meta`; `viewGroups` array                                              | Field pickers, drill-down, view-group browsing, content validation                                        | [ref-rest], [ref-viewgroup] |
| `GET {base}/v1/sql`                                                                                       | Generated SQL for a query                                                                                                                   | The "Generated SQL" tab                                                                                   | [ref-rest]                  |
| `POST {base}/v1/convert-query`                                                                            | Converts an SQL API query to REST JSON                                                                                                      | The "Semantic JSON" view                                                                                  | [ref-rest]                  |
| `POST {base}/v1/cubesql` and the Postgres-wire SQL API                                                    | SQL with `MEASURE()`; regular, post-processing and pushdown execution                                                                       | Semantic SQL editing, calculated fields                                                                   | [ref-rest], [ref-sql-api]   |
| `DELETE {base}/v1/running-query/{requestId}`                                                              | Cancels a running query                                                                                                                     | Cancel button                                                                                             | [ref-rest]                  |
| `POST {base}/v1/pre-aggregations/jobs`                                                                    | Triggers pre-aggregation builds and returns their status; needs the `jobs` API scope                                                        | Pre-aggregation "Build All" / "Build Selected"                                                            | [ref-rest], [ref-orch]      |
| `/readyz`, `/livez`                                                                                       | Health checks                                                                                                                               | Deployment status                                                                                         | [ref-rest]                  |
| Cloud-only on the same API: `/v1/data-sources`, `/v1/entities`, `/v1/entities/{name}`, `/v1/entities/all` | Not in Core                                                                                                                                 | —                                                                                                         | [ref-rest]                  |

Data-model features in Core that Cloud UIs consume:

- **`view_groups`** (name, title, description, includes, nesting) ([ref-viewgroup]).
- **Dimension `links`** ([dm-dimensions]):
  - `url:` is an SQL expression. `dashboard:` is a Cloud dashboard slug, and its `params` become equality filters on the target.
  - Link options include `icon`, `target` and `primary`.
  - Links require v1.6.53 or later.
- **`format`** ([ref-dimensions]):
  - strings: `imageUrl`, `link`;
  - numbers: `number[_N]`, `percent[_N]`, `currency[_N]`, `abbr[_N]`, `accounting[_N]`, `id`;
  - time: strftime / d3-time-format strings.
- **`meta` keys read by Cloud UIs:** `meta.ai_context` ([dm-aicontext]), `meta.auto_run` and `meta.default_ui_filters` ([wb-query]).

Core configuration: `semanticLayerSync` is a validated option (`semanticLayerSync: Joi.func()`) ([core-optval]), with type `(context: RequestContext) => Promise<BiToolSyncConfig[]> | BiToolSyncConfig[]` ([core-types]). I found no call site in `server.ts` ([core-server]). See the open questions.

### B. Cloud feature reference (design reference; not callable from Core)

#### B1. Data modeling UI

**Data Model IDE**

- A browser code editor with "freedom to use all available data modeling features" ([dm-ide]).
- Branch switcher in the status bar. Branches are shared with everyone who has deployment access. A copy-link button appends `?branch=<name>` ([dm-ide]).
- A "Generate data model" wizard builds model files from tables. Conflicting files are renamed with a `.backup` suffix, and a Changes tab lets you review before committing ([dm-ide]).
- A deployment setting controls whether direct commits to main are allowed ([dm-ide]).

**Development mode (Cloud)**

- Flow: "Save all" → "Commit & Sync" → merge or open a PR → pull → resolve conflicts ([dm-devmode]).
- Deep links: `?branch=<name>` and `?devmode=true` ([dm-devmode]).
- The dev API has no autoscaling, and scheduled refresh is disabled ([dm-devmode]).
- It is "unrelated to Cube Core's development mode" ([dm-devmode]).

**Visual Modeler** (Premium and above per [dm-visual])

- Canvas:
  - An ERD canvas with pan, zoom and search. "+ Add Cube" and "+ Generate Cube" (pick tables) add cubes.
  - An Edit modal covers cube details, dimensions, measures and access policies.
  - Joins are managed in a Relationships tab or drawn by dragging between dimension points.
  - Views appear with their source cubes to the left. "+ Add View" asks for base cubes and join paths.
  - Every modal has "Edit with YAML" ([dm-visual]).
- Not supported in the UI: meta, segments, hierarchies, refresh keys, folders in views, subquery dimensions, custom granularities, drill members, rolling-window measures, pre-aggregations, and removing cubes or views. It edits YAML only: no JS, no dynamic models, no Jinja ([dm-visual]).

**SQL Runner**

- Runs SQL against a data source or Cube Store and shows row count and execution time. A data source only appears if at least one cube uses it ([dm-sqlrunner]).
- Security context comes either from `scheduledRefreshContexts` or from custom JSON ([dm-sqlrunner]).
- A Schema Explorer lists tables, columns and types ([dm-sqlrunner]).

**Content Validator**

- Opens from Data Model → Content Validator and runs as soon as it opens ([dm-validator]).
- Checks every workbook, including draft reports and published dashboard snapshots. It is branch-aware and ignores visibility and access policies ([dm-validator]).
- Columns: Content, State, Field, Error ("No such field" / "No such view"), Status ("Missing") ([dm-validator]).
- Draft actions: Open, Replace (a searchable dialog with "Replace in all affected reports"), Delete. Published snapshots offer Open only. Reports the parser can't read are shown as "not checked" ([dm-validator]).

**View groups**

- A Core model feature, exposed in `/v1/meta` ([dm-viewgroups], [ref-viewgroup]).
- Cloud UI: the launchpad category "View groups — browse view groups as folders". Admins can set a default view group and choose "Available tabs" under Settings → Configuration ([wb-index]).

**AI context**

- `meta.ai_context` on views and members. It is hidden from the UI, and anything past 2,000 characters is silently truncated ([dm-aicontext]).

**Access policies viewer**

- Read-only. The list view shows each group with counts of cubes and views that have explicit policies. The detail view shows conditions, member access, masking and row-level filters. Requires `PlaygroundRead` ([dm-apviewer]).

#### B2. Workbooks and querying

**Workbooks**

- A workbook is a set of tabs. Tab types are Semantic Query and Source SQL Query ([wb-index]).
- Tabs are copied between workbooks via "Copy to Clipboard", then Cmd/Ctrl+V ([wb-index]).
- Duplicates start private; "Copy sharing and embedding settings" is an option ([wb-index]).
- Publishing a dashboard creates a version snapshot. Restoring a version replaces all tabs ([wb-index]).
- The launchpad offers search, categories (View groups, Views, Workbooks, Source tables), paste of Semantic SQL / Source SQL / JSON / GraphQL, and "Ask Cube agent" ([wb-index]).

**Semantic query tab** ([wb-query])

- Picker and run:
  - Views sit in a left panel, with members grouped by cube or folder, plus search.
  - Auto-run is a per-tab toggle. `meta.auto_run` sets the model default.
- Filters:
  - Filters appear as chips. Dimension filters go to WHERE; measure filters go to HAVING.
  - Operators vary by type, including relative dates such as "7 days ago".
  - "Add advanced filter" builds AND/OR groups, and "Add custom SQL" takes a raw condition.
  - `meta.default_ui_filters` seeds default filters.
- Totals and limits:
  - The Σ menu adds column totals, row totals and subtotals. Subtotals are computed by the database, not by summing cells.
  - Default limit 5,000 rows, adjustable to 50,000.
- Sort: a Sort button with drag-and-drop priority order.
- Time series: "Fill in missing rows" densifies time series (additive measures become 0). Period-over-period adds previous, absolute-difference and %-change columns.
- SQL panel: Semantic SQL (editable, "Save and Run" / "Discard"), Generated SQL, Semantic JSON, Semantic GraphQL.
- Queries may include CTEs, unions and multiple views.
- Developers and admins can override the security context (inherit, customize or remove groups; override user attributes).
- Indicators: a freshness leaf, and a lightning bolt when a pre-aggregation served the query.

**Source SQL tabs**

- Query a data source directly, bypassing the semantic layer, by hand or with an AI agent ([wb-srcsql]).

**Calculated fields**

- "Expressed as Semantic SQL and pushed down to the Cube backend" ([wb-calc]).
- Aggregations from dimensions: Count Distinct, Sum, Avg, Min, Max, depending on type ([wb-calc]).
- Measure calculations: % of total, % of previous, % change from previous, running total. The last three need a dimension ([wb-calc]).
- Also: filtered measures (when pivoting), bins and value groups, and editing the name and SQL ([wb-calc]).

**Python analysis** (preview; support must enable it) ([wb-python])

- Contract: input is `data.csv`; output is `output.json` as a flat array of row objects.
- Environment: Python 3.11 with pandas, numpy, scipy, scikit-learn, statsmodels, prophet, matplotlib, seaborn and plotly. Custom packages are not supported.
- Limits: SQL timeout 120 s, Python timeout 120 s, 10,000 persisted rows, 2 MB output, 16 KB of stdout.
- Runs under the security context of whoever pressed Run.

**Workbook agent**

- Creates and saves reports, searches published reports, and builds, edits and publishes dashboards ([wb-agent]).

#### B3. Charts

**Chart panel** ([ch-index])

- A new tab shows a type picker. The recommended type is "Recommended" (outlined), and the user must pick one.
- Configuration survives field edits, and each section has its own reset.
- The AI agent can write a Vega-Lite v5 spec, whereas the recommendation "only marks a built-in type for you to pick".

**Recommender rules** (verbatim conditions; [ch-types])

_Falls back to Table when:_

- "no measure, two time dimensions, three or more dimensions, or a category past 30 values".

_Otherwise, checked in order:_

1. **Map:** latitude and longitude are present.
2. **KPI:** one measure, no dimensions, a single row.
3. **Line:** a measure over a time dimension, optionally split by one category of up to 10 values.
4. **Scatter:** two or more measures, no time dimension.
5. **Stacked bar:** one measure split by two categories, the first up to 12 values and the second up to 10.
6. **Heatmap:** both categories past those bounds, and "whose combinations fill at least half the grid".
7. **Bar:** up to 12 categories whose labels average 16 characters or fewer.
8. **Horizontal bar:** labels are longer, or there are more than 12 categories.

Pie, Funnel, Sankey, Area, Boxplot and HTML are never recommended.

**Chart types**

| Type        | Fields / channels                                   | Variants and options                                                                                                                                                                                  | Source       |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Bar         | X ordinal, Y measure(s), Color                      | Basic, grouped, stacked, Stack %, horizontal, composite bar+line (right axis). Stack-total labels                                                                                                     | [ch-bar]     |
| Line        | Time or ordered X                                   | Single, multi-series (Color or several Y measures), reference lines. Temporal X is "continuous, time-aware"                                                                                           | [ch-line]    |
| Area        | Time X                                              | Stacked, Stack %, overlaid                                                                                                                                                                            | [ch-area]    |
| Scatter     | Two measures                                        | Color by dimension; Size by third measure with min/max radius in Style                                                                                                                                | [ch-scatter] |
| Pie / donut | Theta                                               | Shape dropdown. Donut "Show total" in centre (plus "100%" when % labels are on). Legend hide/position. Slice order follows result sort                                                                | [ch-pie]     |
| Funnel      | Stage (dimension), Value (measure)                  | Vertical or horizontal. Connector % "First" (on) and "Prev". Stage order follows query sort. Zero stages drawn as thin lines. No legend by default                                                    | [ch-funnel]  |
| Sankey      | Source, Target, Value                               | Swap direction. Cycles split nodes (`A (2)`); self-loops rejected. Grouping into "Other" by minimal share or Top N. Capped at 50 flows. Flow colour: source, neutral or target. Drill down on ribbons | [ch-sankey]  |
| Heatmap     | X dimension, Y dimension, Color measure             | Continuous gradient by default; reversible. Empty cells stay blank                                                                                                                                    | [ch-heatmap] |
| Boxplot     | Category X, raw numeric Y                           | Box = IQR, median line, whiskers at 1.5×IQR, outlier points. Needs unaggregated rows                                                                                                                  | [ch-boxplot] |
| Table       | Rows, Columns, Values (pivot)                       | See the Table detail below                                                                                                                                                                            | [ch-table]   |
| KPI         | Stacked blocks                                      | Number, Comparison, Progress (bar or circle), Sparkline (bar or line), Text (Markdown), HTML. Layout: direction, align, justify, gap, wrap. One-way "convert to Markdown"                             | [ch-kpi]     |
| Map         | Point: lat/lon (+Size, Color). Region: GeoJSON join | Mercator (2D) or Globe (3D). Clustering (off by default). Region sources: World countries, US states, or custom HTTPS+CORS GeoJSON. "Fill unmatched"                                                  | [ch-map]     |
| HTML        | Handlebars template                                 | `result._first`, `{{#each result.data}}`, `<script>` tags allowed (Chart.js/D3 example)                                                                                                               | [ch-html]    |

**Table detail** ([ch-table])

_Columns and layout_

- Hide columns from the header menu. Drag headers to reorder.
- Pivot presets: "Table (default)" and "Vertical records".
- "Group rows" needs at least two row dimensions and no column pivot. Groups can be expanded or collapsed, and per-group subtotals are computed at the group's grain.
- Per-column options: Label, Alignment, Vertical alignment, Word wrap, Width (Flex weight or Fix in px, steps of 10), Hide.
- Bulk width actions: Flex, Fix, Fit.

_Cell display modes_

- Value. Bars or Sparkline (mutually exclusive). Link. Image.
- Inline bars: positive and negative colours, Auto or Manual scale, bars centred on zero.
- Sparklines: time axis, granularity, Area/Line/Bar. The time dimension is removed from the table query. Requires a view.
- Images: square or circle, fit or fill, height 20–100 px.

_Interaction_

- Cell menu: dimension links, Copy value, and Drill down. Drill down works on measure drill members, and on time cells down to finer granularities (weeks drill to Day and finer only).
- Range select by drag or Shift+click. Copy is tab-separated, with a "Copy values with headers" option.

_Style_

- Sections: Headers, Values, Totals, Columns, Borders, Pagination.
- Values toggles: row numbers, hover row, banding.
- Five borders, each with toggle, colour and width 1–10 px, plus presets: Rows, Full grid, Minimal, Accounting, None.
- Pagination: pages of 50 rows, with totals pinned.

_Conditional formatting_

- Rules and cases with type-specific operators. The first match wins.
- Reach: source column, entire row, or selected columns.
- Presets: threshold highlights, 2-tier and 3-tier traffic lights, and indicator icons (arrows, check, cross, dash, dot).
- Colour scales: 2 or 3 stops anchored at Min/Max/Midpoint/Average/Median/Number/Percentile, with Reverse and "Treat nulls as zero".

_Totals_

- Column and row totals. Pivot subtotals appear as "Total for ‹value›" columns.

**Chart configuration**

_Series mapping_ ([cfg-mapping])

- Channels: X, Y, Color, Size, Split by, Tooltip, Theta (pie), Source/Target/Value (sankey).
- Fields are dragged from "Available fields" into a slot. A field can sit in several channels. Remove it by dragging back or with ×.

_Series configuration_ ([cfg-series])

- Per series: mark override (Bar, Line, Area, Scatter), colour picker (only when no Color channel is set), left or right Y axis, per-series data labels, and per-axis stacking override.

_Axes_ ([cfg-axes])

- X: Show axis, Title, Grid lines, Labels, Label angle, Label format.
- Y left: the same plus Min/Max (format example `$,.0f`).
- Dual Y: set a series to Right, then configure the right axis on its own.
- Reference lines:
  - Options: Value, Label, Color, Style (solid, dashed, dotted), label alignment Start/Middle/End × Above/Below (default End/Above).
  - Left axis only.

_Color and stacking_ ([cfg-color])

- Colour by data type: strings get discrete palettes only; dates and numbers get discrete or continuous.
- Palette options: "Reverse colors". Custom palettes via "Customize" and "Open hex code editor".
- Stacking modes: Automatic, Stack, Group (bars only), Overlay, Stack %. Can be set per axis.
- "Sort stack by": Label (default), Value (bar only), Sum, Unsorted.
- Legend: position Right/Left/Top/Bottom, or Hidden.

_Data labels_ ([cfg-labels])

- Totals above stacked bars. Format (`,.0f`, `$,.2f`), font size, and position (Outside end, Inside end, Inside center, Inside base).

_Small multiples_ ([cfg-small])

- "Split by" takes one dimension (not a measure), on bar, line, area and scatter only.
- Grid up to 5×5. Axis scales Shared (default) or Independent. Panels can be sorted by dimension or measure, ascending or descending.
- One legend for the whole grid. Data labels and reference lines must be added after the split is enabled.

_Tooltips_ ([cfg-tooltips])

- Every mapped field is included automatically; sankey leaves out source, target and value.
- Fields can be added, removed or reordered by drag. An empty slot disables the tooltip.
- On stacked bars the tooltip shows the segment under the cursor, not the stack total.

_Custom spec_ ([ch-custom])

- "Edit spec" shows the Vega-Lite JSON.
- The builder switches to code when a spec has a top-level `transform`, more than two non-text layers, or certain dual-axis and rule-mark combinations.

#### B4. Dashboards

**Lifecycle** ([db-index])

- One dashboard per workbook. Draft vs `v{N}`, with Undo, Redo and Revert.
- Revision history with preview and Restore. Viewers see a version chip listing added, updated and removed widgets.
- Data freshness: each widget has a leaf, and the dashboard's leaf reflects its oldest widget.
- Slugs are unique per deployment. Drill-in happens through `dashboard:` links.
- Downloads: PNG and PDF are "server-rendered snapshots"; CSV is built from data already loaded.

**Layout** ([db-layout])

- Spacer: visible only while editing.
- Divider: fixed height.
- Horizontal and vertical stacks: children split space evenly; stacks can nest.
- Grid: fixed cell positions. A new grid defaults to the board's column count (for example 12×12). Minimum 2×2. Grids nest in the board or other grids but not in stacks. Dropping onto an occupied cell is rejected, and nothing is auto-compacted.

**Controls: filter operators** ([db-controls])

- String: is, is not, contains, not contains, starts with, not starts with, ends with, not ends with, is null, is not null.
- Number: is, is not, >, ≥, <, ≤, is null, is not null.
- Time: is, is not, before, before or on, after, after or on, between, relative date, is null, is not null.

**Controls: behaviour** ([db-controls], [emb-iframe-db])

- Faceted filters narrow each other's value lists.
- Mapping states: Mapped automatically, Manually mapped, Can't map automatically.
- Defaults are static or taken from a user attribute. URL parameters override the defaults.
- Visibility: Visible, Hidden, Disabled. A parent control holds up to 50 options.
- URL format:
  - filter `f_<view>.<dim>=<JSON>`;
  - granularity `tg_<view>.<dim>=week`;
  - field switch `ms_<view>.<member>=<member>`.

**Widgets**

- Text: Markdown with live preview and "Hide Title" ([db-text]).
- Chart:
  - Only published reports can be added. Edits are made in the underlying report.
  - "Edit in Workbook" carries the dashboard filters over, tinted violet.
  - A warning icon appears when a control is incompatible with the chart ([db-charts]).
- AI summary:
  - Takes a prompt and caches its output against a checksum of the dashboard state.
  - Marked "stale" when the state changes. Each widget can override the agent ([db-ai]).

**Styling** ([db-styling], [cust-dbthemes])

- Canvas background and padding. Card background and padding.
- Border colour, radius, style (solid, dashed, dotted, double, none) and width.
- Title colour, size, weight and family.
- Themes add text colour, secondary colour, font family and code font. Themes are saved account-wide and assigned per dashboard.

**Dashboards as code** ([db-code])

- Endpoints:
  - `PUT /api/v1/deployments/{id}/reports/by-public-id/{publicId}`;
  - `PUT …/workbooks/by-slug/{slug}` (layout in `meta.dashboardDraft`);
  - `POST …/workbooks/{id}/publish`.
- `publicId` is 12 characters and write-once. `meta` is merged, not replaced. A 409 carries codes such as `upsert_branch_changed`.

**Dashboard agent**

- Answers questions with live read-only queries and changes controls for the current session only.
- Cannot create or edit content or the model ([db-agent]).

#### B5. Other Explore and Analyze surfaces

**Explore**

- Opened from chat results, a dashboard widget, or a view.
- State is kept in the URL. Save, Save as, rename, and convert to a workbook ([explore]).

**Playground** (Core)

- Available "in Cube Core at localhost:4000 when it's run in the development mode" ([playground]).
- Security Context button. Past queries are kept in browser local storage. Clicking the query time proposes a pre-aggregation ([playground]).
- Cloud users are told to move to Explore and Workbooks ([playground]).

**Apps** (preview)

- AI-generated code apps built in the Dashboard Builder. They run in sandboxed frames and get no credentials ([apps]).
- Cannot be published, embedded, scheduled or delivered ([apps]).

**Scheduled refreshes** (Premium and Enterprise)

- Warm the cache for a published dashboard ([sched-refresh]).
- Schedules: Hourly, Daily, Weekly, Monthly, or Custom 5-part cron, with a time zone ([sched-refresh]).
- Phases: Initializing → Fetching credentials → Refreshing → Screenshot → AI summary → Sending ([sched-refresh]).

**Notifications** (Premium and Enterprise)

- Email to users or groups; groups expand at send time. Slack to one channel via OAuth ([notif]).
- Screenshot attached as PNG (default) or PDF ([notif]).
- Optional AI summary: one headline plus 2–4 bullets, computed per recipient under their own row access ([notif]).
- Viewers can subscribe themselves ([notif]).

**Scheduled tasks**

- Run a named agent prompt on a schedule: Manual, Hourly, Daily, Weekly, Monthly, or Custom cron, with a time zone per task ([sched-tasks]).
- Each run runs headless under its creator's security context and produces a chat thread ([sched-tasks]).

**Skills**

- Offered as buttons in the empty chat, through a `/` menu, or by automatic matching ([skills]).
- Authored as `agents/skills/*.md` with `title`, `description` and `name` frontmatter ([adm-ai-skills]).

**Analytics Chat**

- Uses multiple queries per answer and can run Python. Messages can be queued while it works ([chat]).
- Results can be saved as reports or explorations. Shared chats are read-only for recipients ([chat]).

**Time zones**

- Levels: account, user and dashboard.
- Dashboard options: Deployment default, Viewer time zone, or a named zone.
- Resolution order: lens or `?timezone=` → pinned zone → personal zone → account zone → deployment default.
- IANA names only; bare offsets are rejected ([adm-tz]).

#### B6. Organizing content

**Folders**

- Hold workbooks, dashboards and explorations. Up to 10 levels deep. Names up to 255 characters, unique within their parent ([org-folders]).
- Deleting a folder deletes everything in it ([org-folders]).
- Permission levels: Can view, Can edit, Full access ([org-folders]).

**Sharing**

- Levels: Can view, Can edit, Full access.
- Share with people or groups, or give organization-wide "General access".
- Content inherits folder permissions: the nearest folder wins, and direct permissions override inherited ones ([org-sharing]).

#### B7. Admin

**Roles**

- Built-in roles: Admin, Developer, Explorer, Viewer ([adm-roles]).
- Permission matrix: Viewer can view dashboards, export, use chat and query from BI tools. Explorer adds exploring and editing workbooks. Developer adds editing the model, running SQL against sources and managing deployments ([adm-roles]).
- There is an account-wide "Allow data downloads" switch ([adm-roles]).

**Custom roles** (Enterprise)

- Built from a base role plus global permissions (audit log, billing, palettes, themes, OAuth, deployments) and deployment permissions (access, edit or delete deployment; secrets; view or edit the model; query history; chat history; download data; Full access) ([adm-custom-roles]).

**Users**

- Invite links, resend, deactivate or reactivate, delete ([adm-users]).
- Users created by SCIM or on first SAML login get the Viewer role ([adm-users]).

**User groups**

- Group roles are in preview and are additive. An "Effective access" view shows each user's resulting roles ([adm-groups]).

**User attributes**

- Defined with name, type, default and display name, then set per user ([adm-attrs]).
- Referenced in policies as `{ userAttributes.city }` ([adm-attrs]).

**SSO**

- SAML is Enterprise-only, with guides for Google Workspace, Entra ID and Okta ([adm-sso]).
- Other sign-in options: email and password, GitHub, Google ([adm-sso]).

**Environments**

- Production runs the main branch.
- Staging is per branch and suspends after 10 minutes idle.
- Development is one per user in dev mode.
- Each environment has its own API endpoints ([adm-envs]).

**Monitoring**

- Query history ([mon-qh]):
  - API-query and database-query tabs. "All Queries" and "Top Queries" views, each capped at 100.
  - Filters: duration, cache, pre-aggregation, errors, API type.
  - Panels: Query, Errors, SQL, Pre-Aggregations, Security Context, Queue Graph, Flame Graph.
- Performance (Premium and above) ([mon-perf]):
  - API instances; requests and average response time by cache type; compilation waits; Cube Store saturation and wait time.
- Pre-aggregations ([mon-preagg]):
  - Partitions with Build All and Build Selected; Definition, Preview, Used By and Indexes tabs; 24-hour build history.
- Audit log (Enterprise) ([mon-audit]):
  - 52 event types, `[HIDDEN]` masking of secrets, CSV export, and `/api/v1/audit-logs/export`.
- Alerts (Premium and above, email only) ([mon-alerts]):
  - API outage, database timeout, pre-aggregation build failure, build completed.
  - Throttled to 1 hour or 3 hours depending on the alert.
- Usage analytics (Premium and above, admins) ([mon-usage]):
  - Four prebuilt dashboards plus Creator Mode authoring over curated views.
- Chats history ([mon-chats]):
  - Filter by source: Web, MCP, Slack, Scheduled, API.

**Customization**

- App theme ([cust-theme]):
  - Accent, background, foreground, contrast 0–100, logo (HTTPS, about 24×24), web fonts.
  - Can optionally apply across all of Cube Cloud.
- Chart palettes ([cust-palettes]):
  - Account-wide, entered as comma-separated hex values.
  - Discrete and continuous palettes are listed by encoding type.
  - Deleting a palette reverts charts to "Default".

#### B8. Embedding

**Options overview** ([emb-index])

- iframe (Premium and Enterprise), React SDK (Premium and Enterprise), and headless (Chat API or Core Data APIs).

**Dashboard iframe URL parameters** ([emb-iframe-db])

- Filter parameters: `f_`, `tg_`, `ms_`.
- `allowExport=true`, `showDashboardExportMenu=false`.
- `showDashboard{Header,BackButton,Title,EditButton,DuplicateButton}=false`.
- `locale`, `timezone`.
- Only the literal strings `true` / `false` take effect ([emb-visibility]).

**Session settings** ([api-session], [emb-visibility])

- `allowAi`, `showDashboardChat`, `showWorkbookChat`, `showAiWidgets`, `allowChatWorkspaceAuthoring`, `showWorkbookShare`, `showDashboardSettings`, `showMemberNames`, `showGroupByCube`, `locale`, `timezone`.
- `userAttributes`, `groups`, `securityContext`, `embedTenantName`, `branchName`, `creatorMode`.

**Creator Mode** (Enterprise, signed embedding only) ([emb-creator])

- The full app, isolated per `embedTenantName` (lowercase, 5–36 characters).
- Starter content is shared through the `all_embed_users` group.

**postMessage protocol** ([emb-events])

- Envelope: `{ source: "cube-embed", direction: "event"|"action", type, payload, timestamp, surface? }`.
- Events: ready, view, navigate, dashboard-loaded, download, drilldown, ai-query, session-expiring (about 30 minutes before expiry), session-expired, error.
- Actions: set-color-scheme, set-theme, set-locale, set-timezone, set-filter, navigate, refresh, set-session.

**Localization** (12 locales, `en-US` fallback)

- Resolution order: runtime action → URL → session → account → fallback ([emb-locale]).

**Chat API** (Premium and Enterprise) ([api-chat])

- `https://ai.{region}.cubecloud.dev/api/v1/public/{account}/agents/{agentId}/chat/stream-chat-state`, returning NDJSON.
- Tool calls `cubeMeta` and `cubeSqlApi`; the latter returns up to 100 rows plus `vegaSpec`.
- An `/abort` endpoint stops a stream.

**Dashboard comments API** (Premium and above) ([api-comments])

- List, create, mention lookup, edit, delete, and resolve under `/api/v1/embed/dashboard/{publicId}/comments`.
- Threads are one level deep. Only a comment's author can edit, delete or resolve it. Comments are isolated per tenant.

#### B9. Integrations

**MCP server** (Premium and Enterprise, Viewer role or higher) ([int-mcp])

- `https://cubecloud.dev/mcp`, OAuth Authorization Code + PKCE, `client_id=cube-mcp-client`.
- 30 tools, including `runQuery`, `searchDataModel`, dashboard authoring, data-model editing on dev branches, and `buildPreAggregation`.

**Semantic Layer Sync** ([int-sls])

- Maps cubes and views to datasets, and members to columns and metrics, via the SQL API.
- Supported tools: Superset and Preset on all plans, Tableau on Enterprise.
- Triggers: on build, manual (IDE → Integrations → "Start Sync"), or scheduled with `scheduleInterval`.
- Tool specifics:
  - Superset: basic auth ([int-sls-superset]).
  - Preset: API token and secret ([int-sls-preset]).
  - Tableau: PAT, least-privilege mode, `.tds` download ([int-sls-tableau]).

#### B10. Plan gating (pricing page, live and not tag-pinned, read 2026-09-19) ([pricing])

- **Tiers:** Free $0, Starter $40/dev/month, Premium $80/dev/month, Enterprise custom.
- **Workbooks:** Free is capped at 5.
- **Premium and above:** Embedded dashboards and chat, Performance Insights, custom domains, Explorer and Viewer roles.
- **Enterprise only:** SAML SSO, custom roles, audit logging.
- **Query history retention:** 1 day on Free and Starter, 7 days on Premium, custom on Enterprise.
- **Semantic Layer Sync:** Starter and above.

## Capability inventory

Legend for **Core or Cloud-only**:

- **Core**: exists in Cube Core, either in the data model or in an API.
- **Cloud, client-reproducible**: a Cloud UI whose data comes entirely from Core APIs. wechart can rebuild it in the browser plus its own metadata DB.
- **Cloud, needs backend**: depends on server-side services Core does not have. wechart must build that service or leave the feature out.

The "Candidate wechart UI surface" column is input for the interview, not a decision.

| Capability                                                                       | Core or Cloud-only                                                                      | API/config surface (if any)                                                                                       | Candidate wechart UI surface                     | Source                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| Data Model IDE (editor, branches, generate from tables)                          | Cloud, needs backend                                                                    | No model-file write endpoint in Core's REST list ([ref-rest]); Cloud `/build/api/v1/…` ([api-intro])              | Model › Code editor                              | [dm-ide]                       |
| Cloud development mode (branch-scoped APIs)                                      | Cloud, needs backend                                                                    | Unrelated to Core `CUBEJS_DEV_MODE`                                                                               | Model › Branch switcher                          | [dm-devmode]                   |
| Visual Modeler (ERD, drag-to-join, Edit with YAML)                               | Cloud, needs backend (writes); diagram client-side                                      | `/v1/meta` for a read-only diagram ([ref-rest])                                                                   | Model › Diagram                                  | [dm-visual]                    |
| SQL Runner + Schema Explorer                                                     | Cloud, needs backend                                                                    | No raw data-source SQL endpoint in Core; `/v1/cubesql` is the semantic SQL API ([ref-rest])                       | Model › SQL runner                               | [dm-sqlrunner]                 |
| Content Validator                                                                | Cloud, client-reproducible                                                              | `/v1/meta` members vs. saved chart specs                                                                          | Model › Content validator                        | [dm-validator]                 |
| View groups (model)                                                              | Core                                                                                    | `view_groups`; `/v1/meta` `viewGroups` ([ref-viewgroup])                                                          | Field picker › browse by group                   | [dm-viewgroups]                |
| Launchpad (search views, groups, workbooks, paste query)                         | Cloud, client-reproducible                                                              | `/v1/meta`, `/v1/convert-query`                                                                                   | New chart › start page                           | [wb-index]                     |
| AI context                                                                       | Core stores `meta`; consumed only by Cloud agents                                       | `meta.ai_context` (2,000-char cap)                                                                                | Model › member description                       | [dm-aicontext]                 |
| Access policies viewer                                                           | Cloud, client-reproducible if wechart reads model files; `/v1/meta` exposure UNVERIFIED | `access_policy` in model                                                                                          | Security › Policies                              | [dm-apviewer]                  |
| Workbooks (tabs, copy tab, duplicate, versions)                                  | Cloud, needs backend (persistence)                                                      | wechart metadata DB                                                                                               | Workbook / chart library                         | [wb-index]                     |
| Query builder (chips, AND/OR groups, custom SQL filter, sort priority, auto-run) | Cloud, client-reproducible                                                              | `/v1/load` filters/order; custom SQL filter via SQL API: UNVERIFIED                                               | Chart editor › Query                             | [wb-query]                     |
| Row limit control                                                                | Cloud UI over Core limits                                                               | Core default 10,000, max 50,000 ([ref-queries])                                                                   | Query options                                    | [wb-query]                     |
| Pivot, totals, subtotals                                                         | Cloud, client-reproducible                                                              | Extra `/v1/load` queries at coarser grain                                                                         | Table › Totals                                   | [wb-query], [ch-table]         |
| Fill in missing rows                                                             | Cloud, client-reproducible                                                              | Client-side densification                                                                                         | Query options                                    | [wb-query]                     |
| Period-over-period                                                               | Cloud, client-reproducible                                                              | `compareDateRange` ([ref-queries])                                                                                | Measure menu › Compare                           | [wb-query]                     |
| SQL panel (Semantic SQL, Generated SQL, JSON, GraphQL)                           | Core APIs                                                                               | `/v1/sql`, `/v1/convert-query`, `/v1/cubesql` ([ref-rest])                                                        | Chart editor › Inspect                           | [wb-query]                     |
| Security-context override ("view as")                                            | Cloud, client-reproducible                                                              | Sign a Core JWT with the chosen context ([api-intro])                                                             | Chart editor › View as                           | [wb-query]                     |
| Freshness leaf / pre-aggregation icon                                            | Core                                                                                    | `lastRefreshTime`, `external`, `usedPreAggregations` ([ref-rest])                                                 | Chart and dashboard headers                      | [wb-query], [db-index]         |
| Source SQL tabs                                                                  | Cloud, needs backend                                                                    | None in Core                                                                                                      | Out of scope unless a direct DB path is approved | [wb-srcsql]                    |
| Calculated fields                                                                | Cloud UI over the SQL API                                                               | `MEASURE()`, post-processing, pushdown ([ref-sql-api])                                                            | Chart editor › Calculated field                  | [wb-calc]                      |
| Python analysis                                                                  | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2 candidate                                | [wb-python]                    |
| Workbook agent                                                                   | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2 chat                                     | [wb-agent]                     |
| Chart picker with "Recommended"                                                  | Cloud, client-reproducible                                                              | Query shape + `/v1/meta` types                                                                                    | Chart editor › Type picker                       | [ch-index]                     |
| Recommender rules (Draco thresholds)                                             | Cloud, client-reproducible                                                              | Same                                                                                                              | Recommender                                      | [ch-types]                     |
| AI chart generation                                                              | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [ch-index]                     |
| Custom Vega-Lite spec editor                                                     | Cloud, client-reproducible (Vega-Lite, not ECharts)                                     | None needed                                                                                                       | Advanced › Spec editor                           | [ch-custom]                    |
| Bar (basic, grouped, stacked, Stack %, horizontal, bar+line)                     | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-bar]                       |
| Line                                                                             | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-line]                      |
| Area (stacked, %, overlay)                                                       | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-area]                      |
| Scatter (+ color, size)                                                          | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-scatter]                   |
| Pie / donut (center total)                                                       | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-pie]                       |
| Funnel (First/Prev conversion)                                                   | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-funnel]                    |
| Sankey (grouping, cycles, 50-flow cap)                                           | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-sankey]                    |
| Heatmap                                                                          | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type                                       | [ch-heatmap]                   |
| Boxplot                                                                          | Cloud, client-reproducible                                                              | `ungrouped` query ([ref-queries])                                                                                 | Chart type                                       | [ch-boxplot]                   |
| Table (pivot, row groups, column options, borders, pagination)                   | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type › Table                               | [ch-table]                     |
| Table inline bars, sparklines, images, links                                     | Cloud, client-reproducible                                                              | `format` ([ref-dimensions]); `links` v1.6.53+ ([dm-dimensions]); sparkline = second query by time                 | Table › Column display                           | [ch-table]                     |
| Table conditional formatting, color scales, icons                                | Cloud, client-reproducible                                                              | None needed                                                                                                       | Table › Formatting                               | [ch-table]                     |
| Table cell menu (drill down, links, copy)                                        | Cloud, client-reproducible                                                              | `drillMembers` in `/v1/meta` ([ref-rest])                                                                         | Table › Cell menu                                | [ch-table]                     |
| KPI blocks (number, comparison, progress, sparkline, text, HTML)                 | Cloud, client-reproducible                                                              | `compareDateRange`, `/v1/load`                                                                                    | Chart type › KPI                                 | [ch-kpi]                       |
| Map (point/region, Mercator/Globe, clustering, custom GeoJSON)                   | Cloud, client-reproducible                                                              | `/v1/load` + external GeoJSON                                                                                     | Chart type › Map                                 | [ch-map]                       |
| HTML chart (Handlebars + `<script>`)                                             | Cloud, client-reproducible                                                              | `/v1/load`                                                                                                        | Chart type › HTML (security review needed)       | [ch-html]                      |
| Series mapping by drag-and-drop                                                  | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Fields                            | [cfg-mapping]                  |
| Series configuration (mark override, color, axis side)                           | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Series                            | [cfg-series]                   |
| Axes (title, grid, labels, angle, format, min/max)                               | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Axes                              | [cfg-axes]                     |
| Dual Y axis                                                                      | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Axes                              | [cfg-axes]                     |
| Reference lines                                                                  | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Axes                              | [cfg-axes]                     |
| Palettes (discrete, continuous, custom, reverse)                                 | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Color                             | [cfg-color]                    |
| Stacking modes + sort stack by                                                   | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Color                             | [cfg-color]                    |
| Legend (position, hidden)                                                        | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Legend                            | [cfg-color]                    |
| Data labels (format, size, position)                                             | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Labels                            | [cfg-labels]                   |
| Small multiples (Split by, ≤5×5, shared/independent scales)                      | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Trellis                           | [cfg-small]                    |
| Tooltips (auto, reorder, disable)                                                | Cloud, client-reproducible                                                              | None                                                                                                              | Chart editor › Tooltip                           | [cfg-tooltips]                 |
| Dashboard draft, publish, version chip, revision history                         | Cloud, needs backend (persistence)                                                      | wechart metadata DB                                                                                               | Dashboard › Publish / History                    | [db-index]                     |
| Board layout (12 columns, spacer, divider, stack, grid)                          | Cloud, client-reproducible                                                              | None                                                                                                              | Dashboard builder canvas                         | [db-layout]                    |
| Filter control + faceted filters                                                 | Cloud, client-reproducible                                                              | `/v1/load` filters; dimension-value queries                                                                       | Global filter bar                                | [db-controls]                  |
| Time granularity switcher                                                        | Cloud, client-reproducible                                                              | `timeDimensions[].granularity`                                                                                    | Control widget                                   | [db-controls]                  |
| Field switcher                                                                   | Cloud, client-reproducible                                                              | Member swap                                                                                                       | Control widget                                   | [db-controls]                  |
| Parent control (≤50 options)                                                     | Cloud, client-reproducible                                                              | None                                                                                                              | Control widget                                   | [db-controls]                  |
| Controls mapping (auto, manual, can't map)                                       | Cloud, client-reproducible                                                              | `/v1/meta`                                                                                                        | Chart › Controls mapping                         | [db-controls]                  |
| Control defaults, `f_`/`tg_`/`ms_` URL params, visibility states                 | Cloud, client-reproducible (user-attribute defaults need a wechart attribute store)     | None                                                                                                              | Filter settings; shareable URL                   | [db-controls], [emb-iframe-db] |
| Text widget (Markdown)                                                           | Cloud, client-reproducible                                                              | None                                                                                                              | Markdown widget                                  | [db-text]                      |
| Chart widget from a published report                                             | Cloud, needs backend (persistence)                                                      | None                                                                                                              | Dashboard › Add chart                            | [db-charts]                    |
| AI summary widget                                                                | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [db-ai]                        |
| Dashboard styling + themes                                                       | Cloud, client-reproducible (+ persistence)                                              | None                                                                                                              | Dashboard › Style / Themes                       | [db-styling], [cust-dbthemes]  |
| Dashboard drill-in via links + slug                                              | Core model (`links`) + Cloud slug resolution                                            | `links[].dashboard`, `params` ([dm-dimensions])                                                                   | Table cell menu › Open dashboard                 | [db-index]                     |
| PNG/PDF export (server-rendered); CSV                                            | PNG/PDF Cloud, needs backend; CSV client-side                                           | Cloud dashboard-exports API ([ref-cp-api])                                                                        | Dashboard › Download                             | [db-index]                     |
| Dashboards as code                                                               | Cloud, needs backend                                                                    | Platform `PUT …/by-slug`, `…/by-public-id`, `…/publish`                                                           | wechart import/export API                        | [db-code]                      |
| Dashboard agent                                                                  | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [db-agent]                     |
| Explore (URL state, save, convert)                                               | Cloud, client-reproducible (+ persistence)                                              | `/v1/load`                                                                                                        | Explore page                                     | [explore]                      |
| Playground                                                                       | Core (dev mode only)                                                                    | `localhost:4000`                                                                                                  | Not for production                               | [playground]                   |
| Apps (AI-generated sandboxed apps)                                               | Cloud, needs backend                                                                    | None                                                                                                              | Out of scope candidate                           | [apps]                         |
| Scheduled refreshes (cache warm, cron)                                           | Cloud, needs backend                                                                    | wechart scheduler calling `/v1/load`; `/v1/pre-aggregations/jobs` ([ref-orch])                                    | Dashboard › Schedule                             | [sched-refresh]                |
| Notifications (email/Slack, PNG/PDF, AI summary)                                 | Cloud, needs backend                                                                    | None                                                                                                              | Dashboard › Subscribe                            | [notif]                        |
| Scheduled tasks (agent prompts)                                                  | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [sched-tasks]                  |
| Skills                                                                           | Cloud, needs backend                                                                    | `agents/skills/*.md` ([adm-ai-skills])                                                                            | Phase-2                                          | [skills]                       |
| Analytics Chat                                                                   | Cloud, needs backend                                                                    | Chat API ([api-chat])                                                                                             | Phase-2 chat                                     | [chat]                         |
| Time zones (account, user, dashboard)                                            | Cloud UI over Core `timezone`                                                           | Query `timezone` ([ref-queries])                                                                                  | Settings › Time zone; dashboard option           | [adm-tz]                       |
| Folders                                                                          | Cloud, needs backend                                                                    | wechart metadata DB                                                                                               | Workspace › Folders                              | [org-folders]                  |
| Sharing (view, edit, full; org-wide; inheritance)                                | Cloud, needs backend                                                                    | wechart metadata DB                                                                                               | Share dialog                                     | [org-sharing]                  |
| User management                                                                  | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Users                                    | [adm-users]                    |
| Built-in roles                                                                   | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Roles                                    | [adm-roles]                    |
| Custom roles                                                                     | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Roles                                    | [adm-custom-roles]             |
| User groups                                                                      | Cloud, needs backend; Core via `contextToGroups`                                        | `contextToGroups` ([dm-dap])                                                                                      | Admin › Groups                                   | [adm-groups]                   |
| User attributes                                                                  | Cloud-only in policies; Core uses `securityContext`                                     | `securityContext.*` ([dm-dap])                                                                                    | Admin › Attributes                               | [adm-attrs]                    |
| SAML SSO / SCIM                                                                  | Cloud, needs backend                                                                    | Cloud SCIM `/api/scim/v2` ([api-intro])                                                                           | Admin › SSO                                      | [adm-sso], [adm-users]         |
| Environments (prod, staging, dev)                                                | Cloud, needs backend                                                                    | None                                                                                                              | Connections › Environments                       | [adm-envs]                     |
| Query history                                                                    | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Query history                            | [mon-qh]                       |
| Performance insights                                                             | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Performance                              | [mon-perf]                     |
| Pre-aggregation monitoring                                                       | Partly Core                                                                             | `/v1/pre-aggregations/jobs` trigger and status ([ref-orch]); partition sizes and build history in Core UNVERIFIED | Admin › Pre-aggregations                         | [mon-preagg]                   |
| Audit log                                                                        | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Audit                                    | [mon-audit]                    |
| Alerts                                                                           | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Alerts                                   | [mon-alerts]                   |
| Usage analytics                                                                  | Cloud, needs backend                                                                    | None                                                                                                              | Admin › Usage                                    | [mon-usage]                    |
| Chats history                                                                    | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [mon-chats]                    |
| Monitoring export (Vector sinks)                                                 | Cloud, needs backend                                                                    | None                                                                                                              | Out of scope candidate                           | [mon-qhexport], [mon-datadog]  |
| App theme                                                                        | Cloud, client-reproducible                                                              | None                                                                                                              | Settings › Branding                              | [cust-theme]                   |
| Chart palettes (account-wide)                                                    | Cloud, client-reproducible (+ persistence)                                              | None                                                                                                              | Settings › Palettes                              | [cust-palettes]                |
| AI agent config (model, rules, memory)                                           | Cloud, needs backend                                                                    | `agents/config.yml`                                                                                               | Phase-2                                          | [adm-ai]                       |
| iframe dashboards (private, signed, URL params)                                  | Cloud, needs backend                                                                    | None                                                                                                              | wechart embed mode candidate                     | [emb-iframe-db]                |
| iframe Analytics Chat                                                            | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [emb-chat]                     |
| Creator Mode (embed tenants)                                                     | Cloud, needs backend                                                                    | None                                                                                                              | Out of scope candidate                           | [emb-creator]                  |
| Embed feature visibility (3 layers)                                              | Cloud, needs backend                                                                    | None                                                                                                              | Embed settings                                   | [emb-visibility]               |
| Embed customization (`embedTheme`)                                               | Cloud                                                                                   | None                                                                                                              | Embed settings                                   | [emb-custom]                   |
| Localization (12 locales)                                                        | Cloud, client-reproducible                                                              | None                                                                                                              | Settings › Language                              | [emb-locale]                   |
| postMessage events and actions                                                   | Cloud, client-reproducible                                                              | None                                                                                                              | Embed host API                                   | [emb-events]                   |
| Generate / revoke session                                                        | Cloud, needs backend                                                                    | None                                                                                                              | wechart embed auth                               | [api-session]                  |
| Chat API (NDJSON)                                                                | Cloud, needs backend                                                                    | None                                                                                                              | Phase-2                                          | [api-chat]                     |
| Dashboard comments API                                                           | Cloud, needs backend                                                                    | None                                                                                                              | Dashboard › Comments                             | [api-comments]                 |
| React Embed SDK                                                                  | Cloud, needs backend                                                                    | `@cube-dev/embed-sdk@0.0.13` ([npm-embed])                                                                        | Not usable on Core                               | [emb-react]                    |
| Headless embedding via Core Data APIs                                            | Core                                                                                    | JWT + REST / SQL / GraphQL                                                                                        | wechart itself                                   | [emb-index]                    |
| MCP server                                                                       | Cloud, needs backend                                                                    | `https://cubecloud.dev/mcp`                                                                                       | Phase-2 candidate                                | [int-mcp]                      |
| Semantic Layer Sync (Superset, Preset, Tableau)                                  | Cloud runs it; Core validates the option                                                | `semanticLayerSync` ([core-optval], [core-types])                                                                 | Integrations › BI sync                           | [int-sls]                      |

## Gotchas

**Charts and rendering**

- **Vega-Lite vs ECharts.** Cloud charts and the Chat API's `vegaSpec` are Vega-Lite ([ch-custom], [api-chat]), but wechart's decided renderer is ECharts (CLAUDE.md). The Cloud spec editor and AI-generated specs don't carry over. Only the configuration vocabulary (channels, stacking, axes) does.
- **Vega-Lite major version mismatch.** The docs say Vega-Lite v5 ([ch-custom]), but `@cube-dev/embed-sdk@0.0.13` peer-depends on `vega-lite ^6.4.1` ([npm-embed]).
- **Recommender thresholds depend on Draco.** The 12, 10 and 30 thresholds are attributed to Draco ([ch-types]). They should be checked in the pending Draco / Vega-Lite research before wechart reuses them.
- **HTML charts accept arbitrary `<script>`** and pull code from a CDN ([ch-html]). The page says nothing about sandboxing or CSP ([ch-html]). If wechart reproduces HTML charts, script execution against user data is an XSS and exfiltration risk. That concern is my inference, not a statement from Cube.

**Dashboards and trellis**

- **No precedent for tabs or cross-filtering.** Cloud dashboards at this tag document neither dashboard tabs nor chart-click cross-filtering ([db-controls], [db-index]). wechart's tabs and cross-table filters from input §2 have no Cloud design to follow.
- **Small multiples are limited.** They allow one split dimension, a 5×5 maximum, and Cartesian charts only. Data labels and reference lines must be added after the split ([cfg-small]). They are a narrower thing than Spotfire-style trellis.

**Query behaviour**

- **Row limits differ.** Cloud workbooks default to 5,000 rows, adjustable to 50,000 ([wb-query]). Core defaults to 10,000 and allows at most 50,000 ([ref-queries]).
- **Subtotals are database-computed** in Cloud, so non-additive measures stay correct ([wb-query]). Summing cells client-side would be wrong for averages and distinct counts.
- **Some metadata endpoints don't exist on Core.** `/v1/data-sources` and `/v1/entities*` are Cloud-only ([ref-rest]).

**Security**

- **`userAttributes` is Cloud-only.** Access policies copied from Cloud examples (`{ userAttributes.city }`, [adm-attrs]) won't work on Core. Use `securityContext` plus `contextToGroups` ([dm-dap]).
- **Core dev mode is an auth bypass.** It disables JWT verification, and the SQL API accepts any credentials when no `CUBEJS_SQL_PASSWORD` is set ([dm-devmode]). Playground needs dev mode ([playground]). The docker-compose dev stack must not leak into production.
- **Python analysis can leak rows.** It runs as the user who pressed Run. Stored results stay visible to viewers with narrower access ([wb-python]). If wechart ever persists query results for other viewers, the same leak applies. This is my inference from the documented behaviour.

**Embed SDK**

- **Docs and package disagree.** The docs show `CubeEmbedProvider` ([emb-react]) and `connectCubeEmbed` ([emb-events]), but neither is exported by `dist/index.d.ts` in 0.0.13 ([unpkg-embed-dts]). The package exports `EmbedProvider`, `VegaChart`, `useReport`, and others.
- **ESM-only.** The SDK exports only an `import` condition ([npm-embed]).

**Documentation inconsistencies**

- **Visual Modeler plan.** The docs say "Premium and above" ([dm-visual]); the pricing page shows "Visual Modeler (IDE)" on every tier ([pricing]).
- **Data-labels option.** The tooltips page refers to a data-labels "Simple totals" option ([cfg-tooltips]) that the data-labels page doesn't list ([cfg-labels]).
- **Semantic Layer Sync overview is hidden.** Its index page has `hidden: true` in its frontmatter ([int-sls]).

**Other limits and formats**

- **Dashboards as code.** The page never says "Cloud-only", but every endpoint lives on the Cube Cloud host (`https://<your-cube-cloud-host>/api/v1/…`) ([db-code]).
- **Time zones.** IANA names only; bare offsets like `+05:30` are rejected ([adm-tz]).
- **AI context.** `ai_context` is silently truncated at 2,000 characters ([dm-aicontext]).
- **Embed URL flags.** They take effect only for literal `true` or `false`, and viewers can see and edit them. Do not use them for security decisions ([emb-visibility]).

## Alternatives considered

Not requested by the caller.

## Open questions / unverified

**Schemas I could not extract**

- **`meta.dashboardDraft` schema** (widgets, layout, positions, controls): UNVERIFIED. The dashboards-as-code page doesn't document it ([db-code]). `api-reference/api.yaml` refers to `WorkbookDashboard` and `Report` schemas, but the fetch tool couldn't pull their definitions from that large file ([api-yaml]). Next step: download the file at the tag and read `components.schemas` directly.
- **Report visualization schema** (the chart config fields): UNVERIFIED, for the same reason ([api-yaml]).
- **KPI "convert to Markdown" syntax:** not documented on the KPI page ([ch-kpi]).

**Core behaviour I could not confirm**

- **Does Core `/v1/meta` expose dimension `links` and `format`?** UNVERIFIED. The reference page mentions `/v1/meta` only for synthetic dimensions ([ref-dimensions]). Next step: call `/v1/meta` on a local Core 1.7.42 with a `links` dimension.
- **Does Core execute `semanticLayerSync`?** UNVERIFIED. Core validates and types the option ([core-optval], [core-types]), but I found no call site in `server.ts` ([core-server]). The docs describe the triggers only in Cloud terms ([int-sls]).
- **Is Cloud "Semantic SQL" the same dialect as the Core SQL API?** UNVERIFIED. Core's SQL API page doesn't use the term ([ref-sql-api]).
- **Can the custom-SQL filter in workbooks be reproduced with Core?** UNVERIFIED. Its mechanism is not documented ([wb-query]).
- **Core Playground's "generate data model from tables"** is only in a commented-out section of the Playground page ([playground]). UNVERIFIED for 1.7.42.
- **Core pre-aggregation partition sizes and build history** (to mirror the Cloud Pre-Aggregations page): only trigger and status via `/v1/pre-aggregations/jobs` are confirmed ([ref-orch]).

**Rendering and packaging gaps**

- **Rendering of pie, funnel, sankey, map, table and KPI** (Vega-Lite or otherwise): not stated ([ch-custom], [cfg-tooltips]).
- **Plan gating for scheduled tasks and skills:** not stated on their pages ([sched-tasks], [skills]) or on the pricing page ([pricing]).
- **Node 26 / Vite support for `@cube-dev/embed-sdk`:** UNVERIFIED (no `engines` field seen) ([npm-embed]).

**Product scope questions for the interview (not research gaps)**

- Should wechart reproduce any Cloud-backend feature groups: AI, notifications, SSO/SCIM, audit log, server-rendered export?
- Should wechart offer an HTML chart type at all, given the script-execution risk?
- Should wechart adopt Cube's `f_` / `tg_` / `ms_` URL-parameter convention for shareable dashboard state?

[release]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[pricing]: https://cube.dev/pricing
[ch-index]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/index.mdx
[ch-custom]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/custom.mdx
[ch-types]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/index.mdx
[ch-bar]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/bar.mdx
[ch-line]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/line.mdx
[ch-area]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/area.mdx
[ch-scatter]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/scatter.mdx
[ch-pie]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/pie.mdx
[ch-funnel]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/funnel.mdx
[ch-sankey]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/sankey.mdx
[ch-heatmap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/heatmap.mdx
[ch-boxplot]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/boxplot.mdx
[ch-table]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/table.mdx
[ch-kpi]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/kpi.mdx
[ch-map]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/map.mdx
[ch-html]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/chart-types/html.mdx
[cfg-axes]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/axes.mdx
[cfg-color]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/color-and-stacking.mdx
[cfg-labels]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/data-labels.mdx
[cfg-series]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/series-configuration.mdx
[cfg-mapping]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/series-mapping.mdx
[cfg-small]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/small-multiples.mdx
[cfg-tooltips]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/charts/configuration/tooltips.mdx
[db-index]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/index.mdx
[db-layout]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/widgets/layout.mdx
[db-controls]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/widgets/controls.mdx
[db-text]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/widgets/text.mdx
[db-charts]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/widgets/charts.mdx
[db-ai]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/widgets/ai-summary.mdx
[db-styling]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/styling.mdx
[db-code]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/dashboards-as-code.mdx
[db-agent]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/dashboard-agent.mdx
[wb-index]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/index.mdx
[wb-query]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/querying-data.mdx
[wb-srcsql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/source-sql-tabs.mdx
[wb-calc]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/calculated-fields.mdx
[wb-python]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/python-analysis.mdx
[wb-agent]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/workbooks/workbook-agent.mdx
[explore]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/explore.mdx
[playground]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/playground.mdx
[chat]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/analytics-chat.mdx
[apps]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/apps.mdx
[notif]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/notifications.mdx
[sched-refresh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-refreshes.mdx
[sched-tasks]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-tasks.mdx
[skills]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/skills.mdx
[dm-ide]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/data-model-ide.mdx
[dm-devmode]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dev-mode.mdx
[dm-visual]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/visual-modeler.mdx
[dm-sqlrunner]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/sql-runner.mdx
[dm-validator]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/content-validator.mdx
[dm-viewgroups]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/view-groups.mdx
[dm-aicontext]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/ai-context.mdx
[dm-dimensions]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dimensions.mdx
[dm-dap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/data-access-policies.mdx
[dm-apviewer]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-policies-viewer.mdx
[ref-viewgroup]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/view-group.mdx
[ref-dimensions]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[ref-rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[ref-queries]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/queries.mdx
[ref-sql-api]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[ref-orch]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/index.mdx
[ref-cp-api]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/control-plane-api.mdx
[api-intro]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/api-reference/introduction.mdx
[api-yaml]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/api-reference/api.yaml
[org-folders]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/organize-content/folders.mdx
[org-sharing]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/organize-content/sharing.mdx
[adm-users]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/manage-users.mdx
[adm-roles]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/roles-and-permissions.mdx
[adm-custom-roles]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/custom-roles.mdx
[adm-groups]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/user-groups.mdx
[adm-attrs]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/user-attributes.mdx
[adm-sso]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/index.mdx
[adm-envs]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/environments.mdx
[adm-tz]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/time-zones.mdx
[adm-ai]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/ai/index.mdx
[adm-ai-skills]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/ai/skills.mdx
[mon-qh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history.mdx
[mon-perf]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/performance.mdx
[mon-preagg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx
[mon-audit]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/audit-log.mdx
[mon-alerts]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/alerts.mdx
[mon-usage]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/usage-analytics.mdx
[mon-chats]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/chats-history.mdx
[mon-qhexport]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history-export.mdx
[mon-datadog]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/monitoring-integrations/datadog.mdx
[cust-theme]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/customization/app-theme.mdx
[cust-palettes]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/customization/chart-palettes.mdx
[cust-dbthemes]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/customization/dashboard-themes.mdx
[emb-index]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/index.mdx
[emb-react]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/react-embed-sdk.mdx
[emb-iframe-db]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/dashboards.mdx
[emb-chat]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/analytics-chat.mdx
[emb-creator]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/creator-mode.mdx
[emb-visibility]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/feature-visibility.mdx
[emb-custom]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/customization.mdx
[emb-locale]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/localization.mdx
[emb-events]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/events.mdx
[emb-signed]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/iframe/auth/signed.mdx
[api-session]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/embed-apis/generate-session.mdx
[api-chat]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/embed-apis/chat-api.mdx
[api-comments]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/embed-apis/dashboard-comments.mdx
[int-mcp]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/mcp-server.mdx
[int-sls]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/index.mdx
[int-sls-superset]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/superset.mdx
[int-sls-preset]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/preset.mdx
[int-sls-tableau]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/tableau.mdx
[core-optval]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/packages/cubejs-server-core/src/core/optionsValidate.ts
[core-types]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/packages/cubejs-server-core/src/core/types.ts
[core-server]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[npm-embed]: https://registry.npmjs.org/@cube-dev/embed-sdk/latest
[npm-embed-all]: https://registry.npmjs.org/@cube-dev/embed-sdk
[unpkg-embed-dts]: https://unpkg.com/@cube-dev/embed-sdk@0.0.13/dist/index.d.ts
