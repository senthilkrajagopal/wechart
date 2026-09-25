# The chart context menu (DSH-08): can Cube support it, and what it would look like in wechart

**Asked by the user, 2026-09-25:** "I like the chart context menu.. it is in https://claude.ai/design/p/54408e7a-a7f7-4e2e-a09e-cec16e8c0b9e?file=Charter+Modern+UI.dc.html DSH-08 have an independent agent that can analyze whether this kind of functionality can be supported by cube... and if yes. what would it look like.."

**Mockup:** [`designs/08-chart-context-menu.html`](designs/08-chart-context-menu.html) shows the whole menu, with the Drill by, Data as of, Export and Copy submenus, the rows drawer, the nothing-marked and cross-filter menus, and the selection drawing compared.

**Inputs.**

- **The design canvas couldn't be opened.** This analysis works from the user's description of the screenshot "The menu in place". The tile "Revenue by region" has a "DATA AS OF 09:15" badge and the line "Selection · Default — Region = West, East". West and East are filled and hatched; Cent, North, South and Mtn are hollow. The kebab (⋯) is pressed and opens a floating menu:
  - a header, "Revenue by region / Region = West, East · 2 of 6 values"
  - Filter to selection · Filter out selection
  - Drill to detail… · Drill by…
  - Details panel, a toggle
  - Copy chart… · Export…
  - "Data as of 09:15 today / Pre-aggregation · refreshed hourly", which opens a submenu
- **Sources:** everything under `docs/research/`, including the corrections in sibling docs; `docs/spec.md`, `docs/tasks.md`, `docs/design/direction.md`, `docs/design/references-markings.md` and the approved prototype (`docs/design/prototype/`); and the code under `packages/`.
- **Probes:** read-only calls to the local Cube at `http://localhost:54000/cubejs-api`, with an HS256 JWT signed with `dev-secret` and the security context `{}`.
  - **The running containers are `cubejs/cube:v1.7.42`.** `docker-compose.yml` already names v1.7.45 in the working tree, but the move is T263 and is still open. Every "observed" below is therefore v1.7.42.
- **Labels used below:** "UNVERIFIED" marks a claim no source in the repo supports. "Proposal — needs the user's approval" marks anything beyond `docs/spec.md`.

---

## 1. Verdict

**Cube Core can support every item on the menu.** None of them needs a Cube Cloud feature or an undocumented route.

- **The Cube-backed items are ordinary REST calls:**
  - selection predicates compiled to `/v1/load` filters;
  - a regrouped query;
  - an `ungrouped` query with `total`;
  - `usedPreAggregations` and `lastRefreshTime` on every answer;
  - the refresh key from `/v1/meta?extended`.
- **The rest are wechart's own work.** Copying and exporting happen in the browser, with no Cube involvement.
- **About half the menu is already in wechart's spec.** Four items have a spec criterion or a task. Drill by, the Details panel toggle, most of Copy and Export, and the Data-as-of submenu don't, and need the user's approval.

| DSH-08 item | Can Cube Core support it? | Through | In wechart today | What's missing |
|---|---|---|---|---|
| Header line "Selection · Default — Region = West, East · 2 of 6" | **n/a.** It is client state: wechart stores the selection and compiles it to filters. | — | **Built.** The marking badge (AC-098, AC-201) and the filter-bar chip (AC-200). The menu heading shows the marking and its count (AC-199's heading, T219). | The values summary in the menu heading and "of 6": **proposal** (P7). |
| DATA AS OF badge | **Yes** | `lastRefreshTime`, `usedPreAggregations` on `/v1/load` | **Built:** AC-013 (T014), AC-148 (T154), one badge (T252) | — |
| Filter to selection | **Yes** | `/v1/load` `filters`: `equals`, `or`/`and`, `inDateRange` for a time bucket, `notSet` for NULL | **Specified, not built:** AC-113, T119, the "Filter to marked" item | T119 |
| Filter out selection | **Yes, with care.** Cube has no `not` operator, so the filter is built by De Morgan, and `notEquals` keeps NULL rows. | Same as above | **Specified, not built:** AC-113, T119 | T119 |
| Drill to detail… | **Yes** | `ungrouped: true`, the selection as filters, and `total: true` for the count; `drillMembers` from `/v1/meta` where a measure declares them | **Specified, not built:** AC-114, T120 ("View marked rows"). The editor's version is built (AC-036, T034). | T120. **Proposals:** the rows of the whole tile when nothing is marked (P2); drill members as the columns (design 02, item 5). |
| Drill by… | **Yes**, observed | A new `/v1/load` with the chosen dimension and the selection as filters. Candidates come from `/v1/meta`: dimensions, `hierarchies`, and join reachability. | **Not in the spec.** `requirements.md` lists "drill-down from `drill_members`" and chart-builder "drill" as In. direction.md rule 31 and `references-markings.md` C5 name "Drill into". Only the prototype's chart editor draws it. | **Proposal** (P1) |
| Details panel (toggle) | **Yes**: the same query as Drill to detail, asked again when the marking changes | `ungrouped` + filters | The details tile is **built** (AC-112, T118). **View marked rows (AC-114) is a one-off action, not a toggle.** | **Proposal** (P3) |
| Copy chart… | **n/a** to Cube | Browser Clipboard API (UNVERIFIED, no research); ECharts `getDataURL` / `renderToSVGString` (`research/echarts.md`) | Copy link with marks is **specified, not built** (AC-123, T129). Duplicate (AC-062) and Save to folders… (AC-127) are **built**, in edit mode only. | **Proposal** (P4) |
| Export… | **CSV: yes**, from the JSON Cube returns. Cube Core has **no export API**: server-rendered PNG and PDF are Cloud features (`research/cube-capabilities.md` §8). | `/v1/load` JSON, then wechart writes the file | **Download CSV is built** (T177, T178; AC-172 and AC-173 ticked; AC-171 open for marked rows). | Marked-rows CSV comes with T120. **Proposals:** PNG/SVG images and `.xlsx` (P5). |
| Data as of … · Pre-aggregation · refreshed hourly › | **Yes** | `usedPreAggregations[t].preAggregationId` and `lastUpdatedAt`; `/v1/meta?extended` for `preAggregations[].refreshKey`; next runs computed from Cube's refresh-key formula | **Built separately.** Refresh now (AC-148, the tile's ↻). Schedules lists each refresh key with a link into Model (AC-154, T160). The next runs are in `nextRefreshes` (T159, AC-153; uncommitted in the working tree). | Gathering these in a submenu: **proposal** (P6) |

---

## 2. Item by item

### 2.1 The header line and the selection (DSH-03 "selection" and wechart markings)

**The same concept, with four differences.** A wechart marking and DSH-03's selection are both a named, coloured selection that is shared across tiles and stored as a predicate over dimension members:

- spec glossary, "Marking";
- AC-086: "only as a predicate over Cube dimension members… never as row numbers";
- direction.md §7a, Model.

"Selection · Default" reads as a selection named "Default". The same slot in wechart is a marking's name, and a new dashboard's default marking is named "Marking" (AC-072, direction.md rule 57). The differences:

1. **Where it is said.** wechart says it twice:
   - a badge in the tile's header row, "Marking · n marked" (AC-098, AC-201; `dashboard/markings/MarkBadge.tsx`);
   - a chip in the filter bar naming the marking, its values by title and the source tile (AC-200; `MarkChip.tsx`).

   DSH-08's line "Selection · Default — Region = West, East" is the chip's content: name plus value summary.
   - Design 04 (state C) already has the marking badge take the freshness badge's place, so a tile head carries one badge.
   - The menu's footer then keeps "Data as of" one click away. That is how the mockup lays it out.
2. **"2 of 6 values".** wechart counts marked items; it doesn't say "of N". The tile knows its own items, the same set Invert and Mark all use (T121). So "of 6" is presentation only. **Proposal** (P7).
3. **How it is drawn. This is the one real conflict.**
   - DSH-03 draws selected items filled and textured, and unselected ones hollow.
   - wechart draws marked items in their own colour with a 1.5 px outline in the marking colour, and fades unmarked items to 0.28 (AC-096, ticked; direction.md §7a Rendering).
   - wechart **already uses a pattern for a different meaning**: a partly marked item whose measure isn't additive (AC-097, open).

   Drawing selected items textured, DSH-03's way, would give the hatch two meanings. It would also stop "marked vs. partly marked" being readable without colour, which AC-098 and direction.md rule 50 depend on. The same goes for hollow unmarked items: a partly marked item draws its marked share from the baseline at full strength with the remainder faded (direction.md rule 49), so hollow outlines would need a second rule.

   **Recommendation: keep AC-096's drawing.** The mockup's state I sets the two side by side.
4. **Up to four markings.** A wechart dashboard has up to four markings (AC-084), and each tile marks with one of them. The menu's heading therefore names the *tile's* marking (AC-199), as the mockup does.
   - **In cross-filter mode there is no marking at all** (AC-120). There the menu loses its marking group, but not its views, Copy, Export or data-as-of (mockup state H).

UNVERIFIED: whether DSH-03's selection is per dashboard or per chart, and whether it can be named. The canvas couldn't be opened.

### 2.2 Filter to selection / Filter out selection

- **What it does in wechart.** It turns the marking into an ordinary removable dashboard filter, or its negation, and then clears the marking (AC-113; direction.md rule 53; references-markings.md A2.7 "Adapt"). Spotfire's own Filter To/Out doesn't work on in-db data (`[sf-kb-filterto]` there); a normal filter works and can be bookmarked.
- **Cube support: yes.** The research covers the compile rules, and a probe confirms the SQL:
  - **Filter to** is the predicate `limitFilterFor` already emits for limited tiles (`core/src/markings/query.ts`, AC-107, ticked):
    - a single tuple becomes flat `equals`;
    - several become `{or:[{and:[…]}]}`;
    - a time bucket becomes `inDateRange` over the bucket;
    - a marked NULL becomes `notSet` (`research/cube/markings-query-support.md` §1.2, §1.5).
  - **Filter out** has no `not` operator in Cube, so it applies De Morgan (§1.7): AND over tuples of an OR over each member's negation.
    - **Observed:** `notEquals ["Germany","United States"]` compiles to `("customers".country NOT IN ($1, $2) OR "customers".country IS NULL)`. So filtering out keeps rows whose country is NULL, which is the right complement.
    - `notInDateRange` drops NULL rows in the JS planner (gotcha 3 there). So "filter out" on a time bucket and "filter out" on a string don't treat NULL alike, and T119 has to handle it.
- **In wechart.** Specified, not built: **T119** (AC-113, AC-199). The keyboard shortcuts Ctrl+M and Ctrl+Shift+M are in direction.md §7a's gesture table and the prototype's menu. Keyboard reach as a whole is AC-176.

### 2.3 Drill to detail…

- **What it does in wechart.** It shows the rows behind the marked items, states the total, and offers an export (AC-114). references-markings.md A2.7 adapts Spotfire's Details-on-Demand to this "View marked rows" drawer. The mockup keeps AC-114's words, "View marked rows…". Whether to call it "Drill to detail…" instead is the user's call (P2).
- **Cube support: yes.** Observed: `{dimensions:[orders.id, orders.ordered_at, orders.status, customers.country], measures:[orders.total_amount], filters:[customers.country equals Germany, United States], ungrouped:true, limit:3, total:true}` returned 3 rows and `total: 120`.
  - **Primary-key check.** `ungrouped` needs every cube's primary key unless `allow_ungrouped_without_primary_key`. At 1.7.42 that check is **off by default** (markings-query-support.md "Corrections" 1, overriding `data-apis.md`'s row). `core/src/chart-spec.ts` (`toUnderlyingQuery`) records the same.
  - **`drillMembers`.** Cube's `ResultSet.drillDown` recipe builds a *grouped* query from the measure's `drillMembersGrouped`, plus a `measureFilter` on the measure and the clicked value (data-apis.md §11). It returns `null` when the measure declares none.
    - **Observed:** the sample model declares none. `orders.total_amount` has `drillMembers: []` and `drillMembersGrouped: {measures: [], dimensions: []}`.
    - So on the sample model the rows fall back to the chart's own members, ungrouped, as the editor's drawer does today.
    - Design 02 (item 5) already proposes drill members, or else the primary key and time dimension, for traceable rows.
- **In wechart.**
  - The editor's version is **built**: AC-036, T034, `ResultsDrawer`, capped by `UNDERLYING_ROW_LIMIT = 100`.
  - The dashboard's is **specified, not built: T120** (AC-114, AC-199).
  - With nothing marked, or in cross-filter mode, AC-114 offers nothing. **Proposal (P2):** "View underlying rows…" for the whole tile, as the prototype's editor does.

### 2.4 Drill by…

- **What it would do.** Regroup the selected items by another dimension: "Germany and United States, by Category".
- **Cube support: yes.** It is a new `/v1/load` with the selection's predicate as filters. Observed:
  - `{measures:[orders.total_amount], dimensions:[products.category], filters:[customers.country equals Germany, United States]}` returned Components 57,900.00 and Instruments 57,000.00.
  - The predicate is the same one Filter to uses (§2.2), so a time bucket drills as its `inDateRange` span.
- **Where the candidates come from** (all `/v1/meta`, research `data-apis.md` §1, `data-modeling.md` §9):
  - **Hierarchies.** Each is `{name, title?, levels: [coarse → fine], public?}`. When the tile's dimension is level *k*, level *k + 1* is the natural first choice.
    - **Observed:** every sample cube carries `hierarchies: []`. The sample model declares none, so this list is empty today.
    - Two gotchas:
      - `/v1/meta` keeps `public: false` hierarchies, so wechart must filter them (data-modeling.md gotcha 5);
      - a view silently drops hierarchy levels it doesn't include (gotcha 18).
  - **Time.** A finer granularity of a time dimension: Cube's own granularities, plus custom ones from meta.
  - **Other dimensions.**
    - A dimension qualifies when it is in the same cube or view, or in a cube joined to it. `connectedComponent` rules pairs out and `/v1/dry-run` rules them in (direction.md §7a "Across cubes").
    - **Observed:** `orders`, `customers` and `products` report component 1; `monthly_orders`, `product_catalog` and `order_summary` report none.
    - **So a tile on `monthly_orders` can drill only by time.**
- **In wechart: not in the spec.**
  - `requirements.md` has "drill" in the chart builder and "drill-down from `drill_members`" as **In**. `research/cube-capabilities.md` lists "Drill-down from `drill_members`" as in, and the spec's overview says users "drill into details".
  - The only drill criterion is master–detail through details tiles (AC-107 … AC-112).
  - direction.md rule 31 ("Drill into (when a hierarchy exists) … Drill-down shows a breadcrumb that goes back") and references-markings.md C5 ("Drill into (when a hierarchy exists)") both name it.
  - The prototype's **chart editor** draws "Drill into Product" with a breadcrumb (`prototype/editor.js`). No wechart code reads `drillMembers` or `hierarchies` outside the model form.
  - **Proposal (P1).**
- **Pre-aggregations.** A drilled query usually leaves the rollup: the new dimension is seldom in it. Cube then answers from the database. Under rollup-only mode it refuses, and AC-147 warns.
  - The drilled tile must say "Live" in its own badge rather than keep the parent's "Pre-agg" (see Risks).

### 2.5 Details panel (a toggle)

- **What it would be.** Spotfire's **Details-on-Demand**: a panel that shows "the actual values of marked items in the active visualization" and follows the marking (references-markings.md A1, A2.7 `[dod-14.0]`, `[sf-dod-15]`).
  - wechart adapted it as AC-114's "View marked rows" drawer, a one-off action.
  - It also has the **details tile** (AC-112, T118, built): a real tile limited by the marking, which persists with the dashboard.
  - "Details panel" as a *toggle* is the drawer pinned open, re-querying as the marking changes. That is neither AC-114 (one-off) nor AC-112 (saved tile).
- **The numbering in the brief.** It named "the details tile AC-115"; the details tile is AC-112. AC-115 is Invert marking and Mark all.
- **Cube support: yes.** It is the same `ungrouped` query as §2.3, asked again on each marking change. It is cancelled when superseded (AC-011) and cached by canonical predicate (AC-105).
- **Proposal (P3).** A marking change already re-queries every tile using it (AC-095), so the panel adds one query per change while open. Say so in its heading.

### 2.6 Copy chart…

"Copy chart" can mean four things. Cube is involved in none of them.

| Meaning | Status in wechart | Sources |
|---|---|---|
| Copy the chart as an image to the clipboard | **Not specified.** wechart registers only ECharts' **SVG renderer** (`charts/src/echarts.ts`). `renderToSVGString` and `getDataURL` are documented instance members (`research/echarts.md` §"getZr"). A PNG on the clipboard needs the browser's Clipboard API and rasterising the SVG. **Neither has a research doc: UNVERIFIED.** KPI, table and pivot are drawn in the DOM, not by ECharts (`tiles/ChartTile.tsx`), so they have no ECharts image at all. The artifact viewer refuses clipboard access, but the app runs in an ordinary browser tab, so that refusal doesn't carry over. | echarts.md; no clipboard research |
| Copy marked values (text) | direction.md §7a ("Also: Copy marked values…") and the prototype's menu have it; **the spec has no criterion**. | references-markings.md A2.7 "Copy data for marked items: Keep (tuples)" |
| Copy link with marks | **Specified, not built:** AC-123, T129 | direction.md rule 54 |
| Copy the chart to another dashboard or folder | **Built in edit mode only:** Duplicate gives a local copy (AC-062, AC-205), Save to folders… makes a library chart (AC-127), and a library chart's page offers "Add to a dashboard" (AC-022). **Nothing in view mode.** | spec F7, F14 |

**Proposal (P4):** a Copy submenu with Copy image, Copy marked values, Copy link with marks (AC-123) and Copy to dashboard….

- **Copy to dashboard…** places a dashboard-local copy, as Duplicate makes one (AC-062), on a chosen dashboard. It never writes the source dashboard.
- **Copy image** waits for a research doc on the Clipboard API and on rasterising SVG. The project rule is that every third-party claim needs a source.

### 2.7 Export…

- **CSV: built, wechart-side.**
  - Cube returns JSON; `csvOf` writes the tile's table in the browser with a UTF-8 BOM (`dashboard/TileViewMenu.tsx`).
  - AC-172 (truncation said, T178) and AC-173 (formatted values plus raw numbers) are ticked.
  - AC-171 stays open for its marked-rows half, which comes with T120 (tasks.md T177 notes).
  - Row ceiling: `limit` defaults to 10,000 and can't exceed 50,000 (`CUBEJS_DB_QUERY_LIMIT`); `total: true` tells a truncated export (data-apis.md §2; observed 2026-09-22).
- **Marked rows CSV.** AC-114 asks View marked rows to "offer an export of them": **T120**.
- **PNG/SVG image: not specified.** Server-rendered PNG and PDF are Cube Cloud's (cube-capabilities.md §8: "Server-rendered PNG and PDF export … CSV export only · out"). A *client-side* image isn't excluded; spec F20's purpose is "get data out, without a server renderer".
  - SVG comes straight from ECharts' SVG renderer; PNG needs rasterising.
  - DOM-drawn types (KPI, table, pivot) need another route.
  - **Proposal (P5).**
- **Excel (.xlsx): not specified.** Cube has nothing for it, and a library would be a new package. CLAUDE.md requires a `docs/research/` doc before code imports one. **Proposal (P5), after research.**
- **PDF: not offered.** Server-rendered export is out of phase 1 (requirements §"Cloud-only", spec non-goals: scheduled delivery).
- **AC-199 names "Download CSV" as a menu item.** Moving it into an "Export ›" submenu changes that wording. P5 asks for it. If the user declines, the root item stays "Download CSV" and Export holds only the other formats.

### 2.8 "Data as of 09:15 today · Pre-aggregation · refreshed hourly ›"

- **Cube support: yes, per answer and per model.**
  - **Observed** for `monthly_orders` by status and month:
    - `lastRefreshTime: "2026-09-25T07:15:34.000Z"`
    - `usedPreAggregations: {"prod_pre_aggregations.monthly_orders_by_status_month": {preAggregationId: "monthly_orders.by_status_month", lastUpdatedAt: 1790320534000, type: "rollup"}}`
    - `external: true`
  - **On a rollup-served answer, `lastRefreshTime` is the rollup's build time.** `cache: 'no-cache'` doesn't move it; only a rebuild does (pre-aggregations.md "Observed locally"; refresh-jobs-caching.md). This is why AC-148 was reworded to say the data is as of the pre-aggregation's last build.
  - **Observed:** `/v1/meta?extended` gives the rollup `refreshKey: {"every":"1 hour"}`, `scheduledRefresh: true`, `partitionGranularity: "year"`, and its cube's `fileName: "cubes/monthly_orders.yml"`. That is "refreshed hourly".
  - **Next run.** An interval key turns over at `floor((t − D) / I)` boundaries from the epoch in the build time zone, UTC by default. `nextRefreshes` and `refreshLagSeconds` in `core/src/refresh-key.ts` compute the next runs and the lateness (research `refresh-key-schedule.md` §"Turn-over formula", §"Refresh worker cadence").
- **What wechart already has:**
  - the badge (AC-013);
  - ↻ Refresh now, which asks past wechart's cache, and for a rollup-served tile the note naming the pre-aggregation with a link to `/jobs` (AC-148, T154, `tiles/RollupRefreshNote.tsx`);
  - Schedules, listing each refresh key read-only with "Edit in Model" (`/model/files/<file>?cube=<cube>&tab=pre_aggregations`; AC-154, T160);
  - Jobs' Build and follow (AC-149, AC-228, AC-229);
  - the next runs, in progress for the model editor (T159, AC-153; uncommitted `RefreshSchedule.tsx`).
- **Proposal (P6): gather these in the footer's submenu.**
  - Pre-aggregation name, last build, schedule in words and as written, next run with its lateness, Refresh now, Open in Jobs, Edit schedule in Model.
  - For a live tile: "Answered by the database", Refresh now, and "Why not accelerated?", which opens the chart editor's Acceleration panel (AC-144, built).
  - **"Open in Jobs" can't yet select the pre-aggregation.** Jobs keeps the selection in component state (`workspaces/jobs/BuildPanel.tsx`), and AC-002's URL rule covers workspaces, dashboards, charts and model files only. A `?preagg=` parameter is part of P6.
- **Wording cautions, from the research's corrections:**
  - "Refreshed hourly" is only as good as the metadata. `refresh-key-schedule.md` corrects `meta-extended-pre-aggregations.md` in two places:
    - with no key declared, `refreshKey` is absent, and the default is `every: 1 hour` **only if** no cube-level key applies;
    - a `sql` key isn't in the metadata (inference), so `{sql, every: "1 hour"}` reads as `{every: "1 hour"}`. It means "checked hourly, rebuilt when the SQL's value changes", not "rebuilt hourly".
  - The mockup therefore says "every hour" for a declared interval, "Cube's default" for an absent key, and names the key as written.
  - **Lateness.** For hourly and longer keys the worker can start up to about 5 min 30 s after the turn-over (`refreshLagSeconds('1 hour')` = 330 s). AC-153's "up to about five minutes" is close, but slightly low (research finding 4). The mockup uses the code's "5½ min".

---

## 3. Mapping to wechart's spec and code

| DSH-08 | wechart label (mockup) | Criterion | Task | State | Code |
|---|---|---|---|---|---|
| Header | Tile title + "Marking · Country = … · 2 of 6" | AC-199 (heading: marking + count), AC-098, AC-201 | T219 | Built: the name and count. **Proposal:** the values and "of N" (P7) | `dashboard/TileViewMenu.tsx` (`tile-menu__heading`) |
| Filter to selection | Filter to marked · Ctrl+M | AC-113, AC-199 | T119 | Specified, not built | `core/src/markings/query.ts` (`limitFilterFor`, positive half) |
| Filter out selection | Filter out marked · Ctrl+Shift+M | AC-113, AC-199 | T119 | Specified, not built | — |
| — | Invert marking · Mark all · Unmark | AC-115, AC-102, AC-199 | T121, T219 | Built | `TileViewMenu.tsx`, `core/src/markings/limit.ts` |
| Drill to detail… | View marked rows… | AC-114, AC-199 (editor: AC-036) | T120 (T034) | Specified, not built (editor built) | `core/src/chart-spec.ts` (`toUnderlyingQuery`), `editor/ResultsDrawer.tsx` |
| Drill by… | Drill by › | none | none | **New: proposal P1** | — |
| — | Create details tile | AC-112 | T118 | Built | `dashboard/tiles/createDetails.ts` |
| Details panel ☑ | Details panel ☑ | none (AC-114 is one-off) | none | **New: proposal P3** | — |
| — | View as table · View query · Edit chart | AC-199, AC-178 | T219 | Built | `TileViewMenu.tsx` |
| Copy chart… | Copy › | AC-123 (link only) | T129 | Link specified; **image, values and to-dashboard: proposal P4** | — |
| Export… | Export › | AC-171 … AC-173, AC-199 ("Download CSV") | T177, T178, T120 | CSV built; **images and xlsx, and the rename: proposal P5** | `core/src/export/csv.ts`, `TileViewMenu.tsx` |
| Data as of … › | Data as of … › | AC-013, AC-148, AC-153, AC-154, AC-144 | T014, T154, T252, T159, T160 | Parts built; **the submenu: proposal P6** | `tiles/AccelerationBadge.tsx`, `tiles/DataAsOf.tsx`, `tiles/RollupRefreshNote.tsx`, `core/src/refresh-key.ts`, `workspaces/schedules/SchedulesPage.tsx` |

**The built menu, for comparison** (`TileViewMenu.tsx`, T219):

1. In Markings mode, a group headed "● ‹marking› · n marked": Invert marking, Mark all, Unmark, Create details tile.
2. View as table.
3. View query.
4. Download CSV.
5. Edit chart.

The menu is a disclosure list of buttons, not `role=menu`. AC-199 stays open until T119 and T120 land. `ChartTile.tsx` still puts a "Table view" button in the tile head; design 04 proposes moving it into the menu.

---

## 4. Proposals — each needs the user's approval

The criterion texts below are drafts for discussion. None is in `docs/spec.md`. Where a draft has a choice the user hasn't made, it says so.

- **P1 · Drill by.**
  - Draft: "WHEN the user chooses Drill by and a dimension on a chart tile whose marking holds items, THE SYSTEM SHALL redraw that tile grouped by the chosen dimension with the marking's predicate as its filters, show a breadcrumb naming the drilled items and a Back control, and leave the saved chart and every other tile unchanged. Fails when: the drilled tile's rows differ from a Cube query of the chosen dimension filtered to the marked items, Back does not restore the previous view, or the saved chart changes."
  - Candidates, in order: the next hierarchy level; finer time grains; the dimensions of the tile's cube; the dimensions of cubes joined to it. Neither primary keys nor the marked member itself is offered.
  - **Questions for the user:**
    - (a) Redraw in place, as the mockup does and as direction.md rule 31's breadcrumb implies? Or a modal, or a new details tile?
    - (b) Does a click in a drilled view mark, or only drill further?
    - (c) Is the drilled state carried in the URL like filters (AC-081), or lost on reload?
    - (d) Is Drill by offered in cross-filter mode on the clicked item?
- **P2 · View underlying rows when nothing is marked.**
  - Extends AC-114 to the whole tile: the tile's query ungrouped, as AC-036 does in the editor. It is also offered in cross-filter mode.
  - It is also where the user chooses the label: "View marked rows…" (Spotfire's, AC-114) or "Drill to detail…" (DSH-08's).
  - Design 02's drill-members proposal would apply here too.
- **P3 · Details panel toggle.**
  - AC-114's drawer, pinned open, follows the marking and re-queries on each change. The menu item shows a checkbox, and the drawer carries the same toggle.
  - Draft: "WHILE the details panel is on, WHEN the marking changes, THE SYSTEM SHALL show the rows behind the new marked items and their total. Fails when: the panel shows rows of a previous marking after the change."
- **P4 · Copy submenu.**
  - Items: Copy image, Copy marked values, Copy link with marks (AC-123 as written), Copy to dashboard….
  - Copy image and Copy to dashboard need new criteria. Copy marked values needs one too: it is already in direction.md §7a but not in the spec.
  - Copy image needs a research doc first (Clipboard API; rasterising SVG).
- **P5 · Export submenu.**
  - Rename AC-199's "Download CSV" to "Export › CSV (the tile's table)", and add "CSV (marked rows)" from T120.
  - Add SVG and PNG images of ECharts-drawn tiles.
  - Add Excel (.xlsx) only after a research doc and the user's approval of the package.
  - PDF stays out.
- **P6 · Data-as-of submenu**, in the menu's footer:
  - the pre-aggregation's model name, last build, schedule (in words and as written), next run with its lateness;
  - Refresh now (AC-148), Open in Jobs (with a `?preagg=` deep link Jobs doesn't have yet), Edit schedule in Model (AC-154's link);
  - for a live tile: "Answered by the database", Refresh now, and "Why not accelerated?" (AC-144).
- **P7 · Menu heading with the values and "of N".** "Marking · Country = Germany, United States · 2 of 6". Today's heading reads "● Marking · 2 marked".
- **P8 · Right-click and the keyboard open the same menu.**
  - DSH-08 is called a *context* menu. Right-click on the plot, Shift+F10 or the Menu key would open it at the pointer or the focused item.
  - Power BI opens a visual's menu with Alt+Shift+F10 (references-dashboard-authoring.md §7, `[pbi-keys]`). Shift+F10 and the Menu key as the trigger here are a proposal, not sourced.
  - The behaviour of the browser's own context menu on a canvas or SVG is UNVERIFIED here.

---

## 5. Risks

1. **Drilling leaves the rollup.**
   - A drilled query needs the new dimension in a pre-aggregation to stay accelerated, which is seldom the case. So a fast tile can become a database query, and under rollup-only mode an error.
   - The drilled view must show its own freshness ("Live"), and AC-147's warning where it applies.
2. **Filter out and NULLs.** `notEquals` keeps NULL rows, `notInDateRange` drops them, and a marked NULL (`notSet`) negates to `set` (markings-query-support.md §1.5, §1.7, gotcha 3). T119's test should cover a NULL row on both kinds of member.
3. **Large markings as filters.** A marking can hold 1,000 items (AC-102), and each becomes a filter value. On SQL Server that approaches the 2,100-parameter limit, which the research has only as an excerpt (references-markings.md C11). Mark all stores the tile's filter instead (T121), which avoids this.
4. **`ungrouped` and primary keys after the upgrade.** The primary-key check is off by default at 1.7.42 through `CUBESQL_SQL_PUSH_DOWN`.
   - `upgrade-1.7.43.md` says `ungrouped` is untouched from 1.7.43 to 1.7.45, because no schema-compiler or cubesqlplanner source changed in that range.
   - The default itself comes from Cube's environment module (`[src-env]` in markings-query-support.md), which that finding doesn't name.
   - Check the default when T263 lands. UNVERIFIED for 1.7.45.
5. **`measureFilter` in ungrouped queries.** Cube throws "Measure filters aren't allowed in ungrouped query" (markings-query-support.md, "Ungrouped queries").
   - **Observed:** a `measureFilter` on `orders.total_amount`, which has no `filters` of its own, did not throw in an ungrouped query.
   - A measure *with* `filters` wasn't tested, so a drill-members query that follows Cube's `drillDown` shape (grouped, with `measureFilter`) and an ungrouped rows query can't be assumed interchangeable.
6. **What `lastUpdatedAt` means for a partitioned rollup.**
   - `usedPreAggregations` is keyed by table. The observed key had no partition suffix, for a rollup partitioned by year, and one `lastUpdatedAt`.
   - Which partition's build time that is when a query spans several partitions is UNVERIFIED.
   - The field is typed `number` in the client but shown as an ISO string in the REST reference, so both must be parsed (pre-aggregations.md gotcha).
7. **"Refreshed hourly" can mislead.** A `sql` refresh key hides in the metadata, and an absent key's default depends on cube-level keys (§2.8).
8. **Image export covers ECharts tiles only.** KPI, table and pivot are DOM, so they have no ECharts image. The copied or exported image must include the marking's outline and fade as drawn, and the dark theme's background.
9. **Menu length and keyboard.**
   - The mockup's menu is 14 items plus a heading and a footer, about 525 px, and fits at 1,440 × 900 without scrolling.
   - Submenus need the APG menu pattern (Right arrow opens a submenu, Left or Esc closes it) to meet AC-176. Today's menu is a list of buttons.
   - The APG menu-button specifics aren't in a research doc (references-markings.md cites APG only for listbox focus): UNVERIFIED.
10. **A research doc the spec cites is missing.** F16's status note names `research/cube/system-partitions.md`, and there is no such file under `docs/research/cube/`. It matters only if "Open in Jobs" goes on to show partitions (AC-145, T151).
11. **Probes ran against v1.7.42.** The compose file names v1.7.45, but the containers weren't restarted (T263 open).

## 6. UNVERIFIED

- DSH-03's and DSH-08's exact behaviour beyond the user's description: the canvas couldn't be opened.
- The Clipboard API's handling of image writes: secure context, user gesture, supported types. There is no research doc.
- Rasterising ECharts' SVG output to PNG in the browser, and what `getDataURL` returns under the SVG renderer. echarts.md lists the member but not its behaviour per renderer.
- An `.xlsx` library's behaviour: no research doc, no package chosen.
- `lastUpdatedAt` for a query spanning several partitions (Risk 6).
- The `ungrouped` primary-key default on v1.7.45 (Risk 4).
- `measureFilter` on a measure that declares `filters`, in an ungrouped query (Risk 5).
- How a browser's native context menu interacts with a right-click on an ECharts SVG surface (P8).
- Superset's own "Drill by" behaviour. Only its ⋮ menu's "Drill to detail" entry is sourced (references-dashboard-authoring.md §4). The local Superset (:8088) is scaled to zero and wasn't consulted.

## 7. Probes (reproducible, read-only)

All `POST /cubejs-api/v1/load` unless noted, JWT HS256 `dev-secret`, security context `{}`, Cube v1.7.42, 2026-09-25.

| Query | Result |
|---|---|
| `GET /v1/meta` | Every cube has `hierarchies: []`. `orders.total_amount` has `drillMembers: []` and `drillMembersGrouped: {measures: [], dimensions: []}`. `connectedComponent` is 1 for `orders`, `customers` and `products`, and absent for `monthly_orders`, `product_catalog` and `order_summary`. |
| `orders.total_amount` by `products.category`, filtered to `customers.country equals [Germany, United States]` (Drill by) | 2 rows: Components 57,900.00, Instruments 57,000.00 |
| Same measure by `customers.country`, `notEquals [Germany, United States]` (Filter out) | 2 rows, UK and France. `GET /v1/sql` shows `NOT IN ($1, $2) OR "customers".country IS NULL` |
| Ungrouped `orders.id, ordered_at, status, customers.country` + `total_amount`, filtered to the two countries, `limit: 3, total: true` (Drill to detail) | 3 rows, `total: 120` |
| `monthly_orders.total_amount` by status and month (a rollup-served tile) | `lastRefreshTime` 2026-09-25T07:15:34.000Z. `usedPreAggregations` keyed `prod_pre_aggregations.monthly_orders_by_status_month`, with `preAggregationId: monthly_orders.by_status_month`, `lastUpdatedAt: 1790320534000` and `type: rollup`. `external: true` |
| `GET /v1/meta?extended=true` | `monthly_orders` has `fileName: cubes/monthly_orders.yml`, with `by_status_month`'s `refreshKey: {every: "1 hour"}`, `scheduledRefresh: true` and `partitionGranularity: year` |
