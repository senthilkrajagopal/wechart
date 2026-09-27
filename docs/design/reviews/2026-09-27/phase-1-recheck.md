# Phase-1 UI review, re-checked (2026-09-27)

**Brief.** The user, 2026-09-27: "go back to the ui design review that was run in phase 1 … and clean up the entire ui". This document gives every finding of `docs/design/reviews/2026-09-24/ui-review.md` (UX-001 … UX-096) and every approval item of its designs 01–08 a status today, with evidence. It adds the new problems seen, mostly inconsistencies between screens, and ends with a cleanup list grouped by surface.

**What was compared**

- **App:** http://localhost:8089, the docker-desktop Helm release, revision 30 (wechart `50c12b1`), signed in as `super@wechart.test` (Super-Admin). Driven with Playwright 1.63 and system Chrome at 1440 × 900, light and dark, and 390 × 844. Values quoted as "measured" come from `getComputedStyle` / `getBoundingClientRect`. Scripts are in the session scratchpad (`phase1-recheck/`).
- **Prototype:** http://127.0.0.1:5500/index.html. The phase-1 prototype screenshots in `../2026-09-24/screens/proto-*` are reused, and two new ones are in `recheck-screens/proto-*`.
- **Rules:** `docs/design/direction.md` §3–5, §7d and checklist.
- **What was built since:**
  - `docs/tasks.md` (T234, T243–T257, T266–T273, T300–T310, T386–T404; T403 done, T406 open);
  - `git log` on `feat/xcube`;
  - `docs/phase-2/backlog.md` §1, §3 and §5;
  - `docs/spec.md` F23 and F35;
  - `docs/handoff.md`.
- **Screenshots:** `recheck-screens/`. The index is at the end. `r-*` shots are the app in light, `dark-*` the dark theme, `narrow-*` 390 × 844, and `proto-*` the prototype.

**Nothing in the app was changed.**
- Every request other than GET, and other than the read-only query routes (`/api/load`, `/api/sql`, `/api/acceleration`, `/api/search`, `/api/cube-auth`), was aborted by a route guard. The guard logged no attempt.
- Editors and dialogs were left with Discard, Cancel or Escape.
- Afterwards the dashboard was still version 10 (`updatedAt` 2026-09-26T04:27:16Z), its charts were unchanged, and the model's file list had no new file.
- Two states were **simulated in the browser only**, by rewriting the dashboard document on its way into the page:
  - Markings mode, since the only dashboard uses cross-filtering (`r-13*`);
  - a section holding a tab group (`r-14`).
  The server never saw either.

**The release's content is not phase 1's seed.** The Shared root holds a single dashboard, "Northwind Sales Overview", whose 11 charts are all dashboard-local. It also holds 10 model files, the `default` data source and two empty folders. There is no "Company dashboard 01", no Finance folder and no library chart. The model declares no pre-aggregations and no access policies. Where that hides a state, the table says so. Section 6 lists what could not be checked.

**Labels.**
- Severity and class are the phase-1 review's:
  - severity is *critical*, *major*, *minor* or *polish*;
  - class is *usability*, *aesthetics*, *consistency*, *accessibility* or *prototype-mismatch*.
- Status is one of:
  - **fixed:** the recommendation is met in the running app;
  - **partly:** some of it is met, and the rest is named;
  - **open:** not met;
  - **declined** or **deferred:** only where a user decision is on record, with its source.

  A part that waits on a user decision nobody has recorded is marked "needs the user's decision".

---

## 1. Summary

### Counts

| | Fixed | Partly | Open | Declined | Deferred | Total |
|---|---|---|---|---|---|---|
| Findings UX-001 … UX-096 | 10 | 25 | 25 | 0 | 0 | **60** |
| Approval items in designs 01–08 | 17 | 8 | 13 | 0 | 0 | **38** |
| New findings (UX-101 … UX-119) | – | – | 19 | – | – | **19** |

- **Findings.** Nothing was declined or deferred as a whole. Four findings have a part declined or waiting on the user, and the table names each:
  - UX-061: the Measures and Dimensions headings stay for AC-025 (T257).
  - UX-021: "Table view" stays in the tile head for rule 5 (T252, backlog §3 F8).
  - UX-027: the header's Markings button is a backlog §3 question (F3).
  - UX-091: the filter bar as a sheet is a backlog §5 question.
- **Approval items.**
  - Design 08 is the only one the user approved on record (spec F23, "added at the user's direction", 2026-09-25), and all 10 of its items are built.
  - For designs 01–07, no approval or decline is recorded in `docs/tasks.md`, `docs/spec.md`, `docs/requirements.md`, `docs/handoff.md` or the backlog. Their items were built only where a critique task (T234, T243–T257, T300–T310, T387) reached the same thing.
  - Two of the 13 open items are proposals still waiting on the user's decision: 02-5, underlying rows by drill members, and 04-5, a coarser default grain.

### What changed since phase 1

- **Fixed:**
  - the dashboard settings page (UX-035);
  - KPI tiles at 32/600 in tabular figures (UX-020);
  - one data grid for tile tables, the preview's Table view and the drawer (UX-024);
  - the editor's wells, pills and inline picker (UX-053, most of UX-054);
  - drawer tabs with a visible selection (UX-095);
  - New cube from the Model overview (UX-071);
  - whole-number ticks, and a line for dense time (UX-022);
  - the marking menu items (UX-029, and all of design 08).
- **Still unlike the approved designs:**
  - the chart editor's type card, recommendation and "Why" (design 01);
  - the drawer's header, Copy and CSV (design 02);
  - the whole Model form (design 03);
  - the chart page (design 06).
- **The dead end is still there.** "Edit chart" on a dashboard-local chart's page still opens an editor that cannot save (UX-040). Every chart in this release is dashboard-local, so every chart page leads there.

### Most important still-open items, in priority order (severity, then user value)

1. **UX-040 · critical:** "Edit chart" on a dashboard-local chart's page opens an editor with no Save (`r-30` → `r-40`). Design 06, item 1.
2. **UX-105 · major (new):** the data-source wizard, which the user called out. It is a modal with a 21/700 title, the browser's blue checkboxes and text-only driver buttons. The prototype puts it in a docked 400 px pane at 14/600 (`r-64`, `r-65`, `proto-64`).
3. **UX-101 · major (new):** Explore's table is 1,627 px wide in a 1,180 px pane, because the Owner column prints raw identity strings. Every row's ⋯ menu sits at x = 1,847, off-screen (`r-01`, `r-05`).
4. **UX-104 and UX-021 · major:** titles are cut while badges keep the head. In the KPI row two tiles read "Orde…" (46 px) and "Custome…" (73 px) with the badge in the head, while their neighbours move it to the foot. This goes against the user's 2026-09-27 answer that "the head is the title's" (`r-10b`).
5. **UX-103 · major (new):**
   - single-series bars are drawn in `#b3b1ab`, the neutral direction.md §5 reserves for "Other" and null;
   - the same category is two colours in two tiles (Beverages teal `#1fa8c9` in one, blue `#2a78d6` in the other; AC-039) (`r-10c`, `r-10b`).
6. **UX-050, UX-051, UX-052 · major:**
   - the Chart type card has no icon and no quick picks;
   - "Back to recommended" is a separate button;
   - the recommendation is a fixed 14 px sentence with no Use.
   Design 01, items 1–3 (`r-40`).
7. **UX-060 · major:** the field list still hides joined cubes. The Orders cube, which joins customers, employees and shippers, lists only "Orders 5" (`r-44`). Design 01, item 4.
8. **UX-057 · major, partly:** a second metric is now drawn, but it is invisible. Orders (≈122) sits on Revenue's 0–250,000 axis, the axis loses its $ format, and nothing says so or offers small multiples (`r-42`). Design 01, item 5.
9. **UX-059 · major:** "Why this chart?" is still a 56-line dump of rule ids and costs (`r-43`). Design 01, item 6.
10. **UX-058 and UX-062 · major, partly:**
    - the drawer has no "n rows · ms", no Copy, no Download CSV, and cannot be resized;
    - its underlying rows are the chart's own members;
    - the rollup-only banner still heads every chart (`r-45`–`r-47`). Design 02, items 1, 3 and 4.

The next group is the Model form: the comment banner, the member rows and the General grouping (UX-070, UX-072, UX-073; design 03). After it come member naming across screens (UX-102) and the dialog and form patterns (UX-106, UX-107).

---

## 2. Every phase-1 finding

"Evidence" names a screenshot in `recheck-screens/` and what was measured. The "Built by" column cites the task or decision that changed it.

### 2.1 Chart editor

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-050 | major · prototype-mismatch | Data tab order and structure | **partly** | `r-40`. The measured order is: type card (y 172) → Back to recommended (234) → Metrics (282) → Dimensions (348) → Time (414) → Filters (480) → Sort by beside Top N (546) → The rest / Result limit (608) → "Recommended" paragraph (668) → "Or" list (720) → Why this chart? (828). Sort is now under the wells. Still missing: the Recommended card under the type card, the section rules, and "Cube or view" at the head of the inspector (it is at the head of the field pane). | T257 |
| UX-051 | major · prototype-mismatch | Type card lacks icon and quick picks | **open** | `r-40`. The card is a 335 × 56 text button, "Stacked bar / Chosen manually · Change…", with no icon. "Back to recommended" is a separate 145 × 24 button. There is no quick-pick row. | — |
| UX-052 | major · usability | Recommendation reason is a fixed blurb, no Use | **open** | `r-40`, `r-42`. "Recommended: Bar" and "Compares a measure across categories by length." are two `<p>` at 14/400, the same sentence for one metric and for two. "Or" is a bulleted list at 14/400. There is no Use button. The block shows even when Auto's pick is the recommendation (`r-40f`: "Auto · Bar" and "Recommended: Bar"). | — |
| UX-053 | major · aesthetics | Heavy wells, UA headings | **fixed** | `r-40`. The well is dashed, 38 px high, with a 12/600 label (`h3.well-field__label`). Pills are 24 px, radius 4, 12/600 in their role's colours ("Revenue sum" orange, "Sales rep" blue). | T257 |
| UX-054 | major · prototype-mismatch | "+" is a native select | **partly** | `r-41`, `r-41c`. "+ metric" opens a 240 px `role=menu` of chips and titles. Still missing: a filter box (the dimension picker has 13 rows and none), grouping by cube, and the aggregation on each row. The rows use full titles ("Σ Sales lines Orders") where the list says "Orders". | T257 |
| UX-055 | minor · usability | Sort last; "Cube's order" unclear | **partly** | `r-40`. Sort by sits beside Top N (y 546). The default still reads "Cube's order". | T257 |
| UX-056 | minor · usability | Time grain control | **partly** | `r-25`. The grain rides on the pill ("Order date Month ▾"), but as a native `select` (Hour … Year), not a tag with a menu. | T229 |
| UX-057 | major · usability | Second metric silently not drawn | **partly** | `r-42`. With Orders added to "Revenue by Customer Country", the legend lists Revenue and Orders. Orders' bars are about 0 px on a 0–250,000 axis, and the axis drops its $ format. No pill says "not drawn". There is no note and no Small multiples or Table offer. The card still reads "Bar, horizontal". | — |
| UX-058 | major · prototype-mismatch | Results drawer | **partly** | `r-40`, `r-45`–`r-47`. **Fixed:** the tab strip is always shown (36 px, 12/600, 2 px accent underline on the selected tab); the drawer opens by default at 220 px; "Hide the results" collapses it; the rows are a grid (12 px, 24 px rows, sticky 28 px `bg-subtle` head, measures right-aligned in tabular figures). **Open:** no `role=separator`, so it cannot be resized; no "n rows · ms" line; no Copy or Download CSV; Underlying rows shows only the chart's three members, under "Showing the first 100 rows" at 14 px with a warning icon; Cube query is raw JSON with no copy and no SQL. The drill-members part of the recommendation was a proposal, and no decision is recorded. | T257 |
| UX-059 | major · usability | "Why this chart?" rule dump | **open** | `r-43`. 56 lines: a Fields table (Revenue "unknown" distinct values), then each candidate with seven rule ids: "✓ no_encodings passed", "✓ Treemap — allowed, cost 9". | T310 restyled only the button |
| UX-060 | major · prototype-mismatch | Field list hides joined cubes | **open** | `r-44`. With the source set to the Orders cube (`orders.yml` joins customers, employees and shippers), the list shows one group, "Orders 5". | — |
| UX-061 | minor · consistency | Field rows: chips, used mark, headings, names | **partly** | `r-40`. **Fixed:** 18 px role chips; a 6 px accent dot for "used"; pills use the short title ("Revenue sum"; AC-220 as amended). **Declined in part:** the per-type headings stay, because AC-025 requires "grouped by type" (T257's recorded deviation). **Open:** the picker, drawer and tables use "Sales lines …" full titles (see UX-102). | T257, T403 |
| UX-062 | minor · prototype-mismatch | Header, and the rollup warning on every chart | **partly** | `r-40`. **Fixed:** the title is bare at 15/600 (transparent border and background, measured); ↶ ↷ are 32 px icon buttons. **Open:** "Sales lines · 21 rows" is plain text, with no "Raw query" or "n rows · ms" badges. The yellow "Depends on the source database: in rollup-only mode, Cube would refuse this chart." heads the canvas of every chart and repeats in the Acceleration tab. | T257 |
| UX-063 | minor · prototype-mismatch | Preview not a tile; plain empty state | **partly** | `r-40`, `r-41-editor-no-source`. **Fixed:** the preview is drawn in a tile; the empty state gives the prototype's two lines. **Open:** with no cube chosen, the "+" buttons are still enabled (`disabled` null on all four). | T257 |
| UX-064 | minor · prototype-mismatch | Customize: raw controls, category-axis options | **partly** | `r-49`. **Fixed:** toggles are switches. **Open:** the X and Y axes are `fieldset`s with legends; label rotation and number format are selects ("0°", lower-case "auto"); the horizontal bar's category axis (Y) still offers Minimum, Maximum and Logarithmic scale. | T310 |
| UX-065 | minor · consistency | Type name vs drawn form | **open** | `r-40f`. In Auto, Sales rep × Order year reads "Auto · Bar" while three series are drawn side by side, and the runner-up list offers "Grouped bar" as a separate type. | — |
| UX-066 | polish · prototype-mismatch | Gallery cards without icons | **open** | `r-48`. The gallery's cards contain no `svg`, `img` or icon element. | — |
| UX-067 | minor · usability | Actual size / Fit as a primary button | **fixed** | `r-25`. It is a `.seg`, 28 px, with the pressed side on `accent-soft`. | T257 |

### 2.2 Chart page

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-040 | critical · usability | "Edit chart" on a local chart opens an editor that can't save | **open** | `r-30` → `r-40`. The page for "Sales Rep Performance by Year" (dashboard-local) offers a primary "✎ Edit chart" (32/14). The editor it opens shows "Local to a dashboard", a disabled "Discard changes" and the sentence "This chart belongs to a dashboard; edit and save it there.", with no Save. "← Back to dashboard" (T256) gives a way out, but it keeps no change. | — |
| UX-041 | major · aesthetics | KPI as body text | **partly** | `r-31`. The value is 32/600 on a 40 px line in tabular figures, formatted "$1,265,793", under a 12/600 "Revenue" label. **Open:** direction.md §3 asks for `text-kpi-solo` 40/52 on a single-KPI page, and the value is not centred (x 29 in a 1,066 px tile). | T300 |
| UX-042 | minor · prototype-mismatch | Raw details pane | **open** | `r-30`. A "Dashboard" label with a native select (32/14) and a disabled "Add to dashboard"; a "Delete" heading over a full-width "Delete chart" (32 px). "Built on" reads `view: sales_lines` in 16 px mono. | — |

### 2.3 Dashboard, view mode

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-020 | major · aesthetics | KPI tiles | **fixed** | `r-10b`. `.kpi__value` is 32/600/36 in tabular figures; `.kpi__label` is 12/600/16 in `text-secondary`. | T300 |
| UX-021 | major · usability | Crowded tile head truncates titles | **partly** | `r-10b`, `r-10c`, `r-11`. **Fixed:** one freshness badge, with its full sentence as a tooltip ("Live · Data as of 3:37:07 AM"); ↻ ✎ ⋯ (26 × 26) appear on hover. **Open:** every chart head keeps "● Live · as of 3:34:51 AM" to the second, plus a "Table view" text button (77 × 24). Titles are still cut: "Orde…" is 46 px and "Custome…" 73 px of 180 available; the pivot reads "Revenue by Category and Ye…". **Waiting on the user:** "Table view" is kept in the head for rule 5 (T252's deviation, backlog §3 "F8"). The user's 2026-09-27 answer to question 29 ("the head is the title's") says the title wins, which UX-104 shows is not what happens. | T252, T250, T402 |
| UX-022 | major · usability | Dense time series: 240 bars, fractional ticks | **fixed** | `r-22`. Orders counted by day (480 rows) is picked as "Auto · Line", and its y-axis reads 0, 1, 2 … 6. Part (c), a coarser default grain, was a proposal, and no decision is recorded (see 04-5). | T305 and the recommender's time rules |
| UX-023 | minor · usability | Table view repeats the time column | **open** | `r-15b`. The Table view of "Monthly Revenue by Category" has the headers "Sales lines Order date (month)", "Sales lines Order date", "Sales lines Category", "Sales lines Revenue", and both date columns read "Jul 1996". The editor's drawer does the same (`r-25`). | — |
| UX-024 | major · aesthetics / accessibility | Unstyled tables | **fixed** | `r-15b`, `r-40`, `r-40b-editor-preview-tableview`. Tile table: `td` 12 px, 34 px, tabular figures, measures right-aligned; `th` 12/600, sticky, 28 px, on `#f0efec`. The preview's Table view is the same. The drawer uses 24 px dense rows, as direction.md §4 says. | T257, T304 |
| UX-025 | major · usability (AC) | Linked tile fades everything | **partly** | `r-13` (Markings simulated in the browser). "Top 10 Products" now draws the marked share at each bar's foot (AC-097). The stacked "Sales Rep Performance" still fades every bar under its "Marking: 1 marked" badge; T453 is open for the remaining chart types. | T387, T388 |
| UX-026 | minor · usability | Marking chip truncates with room to spare | **open** | `r-13`. The chip reads "Sales lines Customer country…" and never shows "Austria". It ends at about x 543 in a band 1,392 px wide. | — |
| UX-027 | minor · prototype-mismatch | No Markings button or description line in the header | **open** (needs the user's decision) | `r-13a`, `r-10b`. The header holds the title, Edit, Bookmarks and ⚙. The dashboard has a description, which is not shown. There is no Markings button in Markings mode. Backlog §3 carries "F3's Published badge and Markings button" as a question for the user. | — |
| UX-028 | minor · aesthetics | Three nested frames in a tab group | **partly** | `r-14` (simulated). There are still three frames: the section band (1 px, radius 6); the tab-group box (`grid-tile`, 1 px border, radius 6, `#fafaf9`, padded 8 12 12); and the white Markdown tile (1 px, padded 16). The middle frame is now a tinted band rather than a white card. | T247 |
| UX-029 | minor · prototype-mismatch | ⋯ menu lacks marking actions | **fixed** | `r-12b`. The menu starts "● Marking · Sales lines Customer country: Austria · 1 of 21 marked", then Filter to marked, Filter out marked, View marked rows, Drill by ›, Details panel, Invert marking, Mark all, Unmark, Create details tile, View as table, View query, Copy ›, Export ›, Edit chart, and "Data as of 03:38 ›". | T119, T120, T266–T273 |

### 2.4 Dashboard, edit mode

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-031 | minor · usability | Adding a filter doesn't open it | **partly** | `r-29`. Add › Filter › List with search puts "List with search: choose a field…" in the band with its popover open (field select, scope select, Remove). The sidebar stays on Add, and focus is on `BODY`, not the field select. | T204 |
| UX-032 | minor · consistency | Edit-mode heads keep the badge and Table view | **open** | `r-20`, `r-21`. While editing, the head of "Monthly Revenue by Category" reads "● Live · as of 3:48:17 AM" and "Table view". | — |
| UX-033 | polish · aesthetics | Full-width Edit chart / Save to folders… | **open** | `r-21`. Properties shows "Edit chart" as a primary `btn-sm` and "Save to folders…" as a `btn-sm`, both 275 × 24 and full width. The prototype's rule is the same; the review rated this low. | T248 |

### 2.5 Dashboard settings

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-035 | major · prototype-mismatch / usability | Settings page unfinished | **fixed** | `r-26b`, `r-27`, `r-26c`. The bar holds "← Back to Northwind Sales Overview", the title "Dashboard settings", Cancel and a primary "Save settings" (all 24 px `btn-sm`). The nav is 219 px, with the chosen section on `accent-soft` (`#e3f0f4`) in the accent and Active / Inactive tags. The content is flat. The mode cards are radio cards with descriptions and gesture lines, and their radios are in the accent (`#1f6f86`). Colour slots are swatch buttons. Escape, Back and Cancel all ask "Discard your changes?". | T249 |

### 2.6 Explore and search

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-010 | major · usability | Type reads "Automatic" | **fixed** | `r-31`, `r-30`. The chart page's chip reads "KPI · auto" and "Stacked bar". This release has no library chart in Explore to show a row; T243's `e2e/explore.spec.ts` covers the row. | T243 |
| UX-011 | minor · usability | Move to… as an inline native select | **partly** | `r-05`. Targets are named by path ("Shared / New folder / New folder"). It is still a native `SELECT`, 244 px, laid over the row. | T243 |
| UX-012 | minor · usability | Unsortable list | **open** | `r-01`. The Name, Type, Built on, Updated and Owner headers contain no button and carry no `aria-sort`. | — |
| UX-013 | minor · usability | ⌘K ranks fields above dashboards | **open** | `r-16`. "order" lists eight measures and then dimensions, each with a "Measure" text column and an internal id ("order_details.revenue · cube order_details"). There is no grouping by kind. | — |

### 2.7 Model workspace

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-070 | major · prototype-mismatch | No upfront comment warning | **open** | `r-51`. `us_states.yml` has two comments (YAML lines 30–31). Its General tab says nothing about them. | — |
| UX-071 | critical · usability | New cube from the overview errors | **fixed** | `r-56`. New cube on `/model` opens `cubes/new_cube_1.yml` with "Unpublished changes · Discard · Save & reload Cube". It was not saved; the draft lives in the session. | T234 (45a150b) |
| UX-072 | major · prototype-mismatch | Boxed member rows, Remove on every row | **partly** | `r-54`, `r-54b`. **Fixed:** badges ("$,.0f"), the type, and the SQL preview; expanding opens grouped fields (BASICS, FORMATTING, FILTERS AND DRILL). **Open:** each row is a `details.model-member`, 34 px, with a 1 px border and radius 6; the SQL sits on the same line, right-aligned and truncated; eight "Remove" buttons stand outside the rows. | T236 |
| UX-073 | major · usability | Flat, unguided General form | **open** | `r-51`. The fields run Name, SQL table (a 54 px textarea), SQL, Extends, Data source, SQL alias, Title, Description, Public (a select: "(not set) / true / false / expression"), Meta, Calendar, and a Refresh key fieldset. There are no groups and no help lines. Inputs are 32 px with 12 px text. | — |
| UX-074 | minor · usability | Tab strip clips "Access policy" | **open** | `r-51`. The tabs run to x 1,029 in a strip ending at x 923 (`scrollWidth` 780 against `clientWidth` 666). The labels are still "Pre-aggregations" and "Access policy". | — |
| UX-075 | minor · prototype-mismatch | File tree | **partly** | `r-51`. **Fixed:** the selected file is a full-width `accent-soft` row. **Open:** "cubes/" and "views/" have no ▾ and no `model/` root; New cube, New view and Generate cubes are bordered buttons at the top. | T234 |
| UX-076 | minor · aesthetics | 20 px file path; no "Published" | **partly** | `r-51`, `r-56`. **Fixed:** an "Unpublished changes" state with Discard. **Open:** the path is 20/600 IBM Plex Mono; at rest the head shows a disabled "Save & reload Cube" and no "✓ Published". | T237 |
| UX-077 | minor · aesthetics | Form as a card inside the pane | **open** | `r-51`. `.model-editor__form` is padded 16 around `.model-form`, which has a 1 px border, radius 6, and a white ground. | — |
| UX-078 | polish | YAML long lines run past the pane | **open** | `r-51`, `r-54`. `us_states.yml` line 31 and `order_details.yml` line 15 are cut at the pane's edge. There is no wrap control. | — |
| UX-079 | polish · usability | Overview is a stack of cards | **open** | `r-50`. There is one card per file, with an underlined mono file link and member names. | — |

### 2.8 Jobs

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-080 | minor · usability | Name link leaves Jobs | **open** (from source) | The model declares no pre-aggregations, so no row exists (`r-61`). In `BuildPanel.tsx`:278 the name is still `<a href="/model/files/…">`, which opens the file with no tab. A row click selects it. | T239 |
| UX-081 | minor · aesthetics | Detail pane floats | **open** | `r-61`. The placeholder pane is a white card inside the page padding, at about x 1,024 and y 139–884. It is not docked under the app bar. | T239 |
| UX-082 | minor · usability | Query-log dates | **open** | `r-61c`. Every row reads "9/27/2026, 3:59:16 AM". The caption "Queries wechart has issued, newest first" is centred. Members are internal ids in Inter ("sales_lines.revenue"), not titles and not mono. | T240 |

### 2.9 Security, Data sources, Schedules

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-085 | minor · aesthetics | Security: floating pane, unpressed chip | **open** | `r-63`. The preview pane is an inset white card (from about x 1,105, y 64). "No groups" is an unpressed `btn-sm` while the JSON reads `{}`. The last field is still "Find a dashboard". | T241 |
| UX-001 | minor · usability | Data sources and Schedules are placeholders | **partly** | `r-60`, `r-62`. **Data sources is a real workspace:** filters and a table with Folder, Driver, Health and Used by (AC-157, T364, T459). **Schedules** shows its note and "The model declares no pre-aggregations." Its table (`SchedulesPage.tsx`) has Pre-aggregation, When, Owner and Edit in Model, without design 07's next runs, "as written" or Jobs link (see 07-1). AC-154 was reopened; T377 is open. | T160, T364 |

### 2.10 Dark, narrow, accessibility

| ID | Sev · class | Finding | Status | Evidence today | Built by / decision |
|---|---|---|---|---|---|
| UX-090 | minor · aesthetics | Dark: tables and native controls look worse | **partly** | `dark-10`, `dark-40`, `dark-65`. The tables are styled now. Open: the root's `color-scheme` stays `normal` in dark (measured), so native checkboxes and selects keep light chrome. New dark defects are in UX-113. | T304, T257 |
| UX-091 | major · usability | Dashboards don't stack at 390 px | **partly** | `narrow-10`. **Fixed:** tiles take one column; there is no Edit or ⚙; nothing scrolls sideways (`scrollWidth` 390). **Open:** the KPI title reads "Total Reven…" beside its badge. **Needs the user's decision:** the four filter pills wrap in place rather than becoming a sheet (backlog §5, "the filter bar as a sheet"). | T250 |
| UX-092 | minor | Shell and Explore overflow | **partly** | `narrow-01`. **Fixed:** the app bar folds into ☰ and nothing scrolls sideways (AC-304, T396). **Open:** the folder tree keeps 260 of 390 px; "+ New" wraps and the table's columns are cut (backlog §3, N16). | T396 |
| UX-093 | minor · usability | Editor squeezes three panes into 390 px | **partly** | `narrow-40`. The panes stack and nothing scrolls sideways. The header wraps onto five lines, and the preview sits below the whole field list. There is still no "needs 1,024 px" notice. | T396 |
| UX-095 | major · accessibility | Drawer tabs show no selection | **fixed** | `r-45`. The selected tab is accent `#1f6f86` with a 2 px accent underline; the others are `#5c5b57` with a transparent underline. | T257 |
| UX-096 | minor · accessibility | Native selects under 12 px in WebKit | **partly** | The wells' "+ Add to…" selects are gone (the picker). Native selects remain for the source, Sort by, the time grain, and Customize's rotation and format. Measured in Chrome only; WebKit was not run. | T257 |

---

## 3. Every approval item in designs 01–08

"Decision" says what is on record. Where nothing is, the item was asked and never answered.

| Design · item | Asked to approve | Decision | Status | Evidence today |
|---|---|---|---|---|
| **01-1** | Inspector layout and order as drawn | none recorded | **partly** | Wells, pills and Sort beside Top N match (T257). The type card, Recommended card and section rules do not (UX-050, `r-40`). |
| **01-2** | Quick picks replace "Back to recommended" | none recorded | **open** | No quick-pick row; "Back to recommended" is its own button (`r-40`). |
| **01-3** | Recommendation reasons from the signature and cardinalities | none recorded | **open** | One fixed sentence per type (UX-052, `r-42`). |
| **01-4** | Joined cubes in the field list | none recorded | **open** | The Orders cube shows only "Orders 5" (UX-060, `r-44`). |
| **01-5** | "Not drawn" on an undrawable well field; Small multiples / Table; Auto never drops a metric | none recorded | **partly** | The field is drawn now, but unreadable, and nothing is said (UX-057, `r-42`). |
| **01-6** | "Why this recommendation?" as a short checklist, full table one click away | none recorded | **open** | A 56-line rule dump (UX-059, `r-43`). |
| **02-1** | Drawer shape and default-open state | none recorded | **partly** | Open by default at 220 px, the strip always shown, collapsible. Not resizable, and no "n rows · ms" line (UX-058, `r-45`). |
| **02-2** | One shared data grid (drawer, preview Table view, table tiles) | none recorded | **fixed** | All three are the prototype's `.grid-table` (UX-024; `r-15b`, `r-40b-editor-preview-tableview`, `r-45`). |
| **02-3** | Copy and Download CSV in the drawer | none recorded | **open** | Neither is in the drawer (`r-45`, `r-46`). CSV exists only in the tile's Export › (T272). |
| **02-4** | The rollup-only warning moves into the badge tooltip and the Acceleration tab | none recorded | **open** | The banner heads every chart's canvas, and repeats in Acceleration (`r-40`, `r-47`). |
| **02-5** | *Proposal:* underlying rows by the measure's drill members, else the key and time dimension | none recorded | **open**, needs the user's decision | Underlying rows are the chart's own members (`r-45`). |
| **03-1** | Upfront comment banner, plus today's just-in-time guard | none recorded | **open** | `us_states.yml`'s comments get no banner (UX-070, `r-51`). |
| **03-2** | Member-row and expanded-form design | none recorded | **partly** | Grouped expansion and the SQL preview are built. Boxed rows and a Remove on each row remain (UX-072, `r-54`, `r-54b`). |
| **03-3** | General grouping with help lines; "SQL table \| SQL query" as one choice | none recorded | **open** | A flat form; SQL table is a textarea (UX-073, `r-51`). |
| **03-4** | Short tab labels | none recorded | **open** | "Pre-aggregations" and "Access policy"; the strip clips (UX-074). |
| **03-5** | Fix direction for New cube from `/model` | fixed by T234 | **fixed** | `r-56`. |
| **04-1** | Tile-head anatomy (title first, one badge, actions on hover, Table view in ⋯) | T252 kept Table view in the head for rule 5, and put F8 to the user (backlog §3) | **partly** | One badge and hover actions are built. Table view stays in the head; titles are cut (UX-021, UX-104, `r-10b`). |
| **04-2** | KPI styling | built by T300 | **fixed** | 32/600/36 in tabular figures (`r-10b`). |
| **04-3** | Whole-number ticks for counts; a line when time is dense | built | **fixed** | "Auto · Line", ticks 0–6 (`r-22`). |
| **04-4** | Not-yet-built menu items shown disabled | superseded: the items were built | **fixed** | Filter to / out marked and View marked rows work (`r-12b`). |
| **04-5** | *Proposal:* a coarser default grain when none was chosen | none recorded | **open**, needs the user's decision | The day grain gave 480 rows as a line (`r-22`); no default changed. |
| **05-1** | Page chrome and primary Save | built by T249 | **fixed** | `r-26b`. |
| **05-2** | Mode cards with explanations and illustrations | built by T249 without illustrations | **partly** | Descriptions and gesture lines, but no illustration and no link to each mode's configuration (`r-26b`). |
| **05-3** | Esc and Back ask the same question as Cancel | built by T249 | **fixed** | Back, with a change pending, asks "Discard your changes?" (`r-26c`). |
| **06-1** | A local chart's primary action is "Edit on ‹dashboard›", plus "Save to folders…", and an ownership line | none recorded | **open** | "✎ Edit chart" leads to the no-Save editor (UX-040, `r-30`, `r-40`). |
| **06-2** | KPI styling on the chart page | none recorded | **partly** | 32/600, not `text-kpi-solo` 40/52, and not centred (UX-041, `r-31`). |
| **06-3** | Details pane: an Add-to-dashboard picker; Delete in ⋯ | none recorded | **open** | A native select, a disabled button and a full-width Delete (UX-042, `r-30`). |
| **07-1** | Schedules layout for T160 | none recorded | **partly** (from source) | The table has Pre-aggregation, When, Owner and Edit in Model. It lacks "as written", the next runs with the five-minute note, and the Jobs link. Not observable, since there are no pre-aggregations (`r-62`). |
| **08-1** | Menu order and grouping | approved by the user, 2026-09-25 (spec F23) | **fixed** | `r-12b`. |
| **08-2** | Keep AC-096's marked drawing, not DSH-03's | approved (F23) | **fixed** | The marked bar is outlined and the rest faded (`r-13`). |
| **08-P1** | Drill by, in place, with a breadcrumb | approved (AC-236–238) | **fixed** | "Drill by ›" is in the marked menu (`r-12b`). |
| **08-P2** | View underlying rows with nothing marked | approved (AC-239) | **fixed** | "View underlying rows" is in the unmarked menu (`r-12`). |
| **08-P3** | Details panel toggle | approved (AC-240) | **fixed** | "Details panel" is a `menuitemcheckbox` (`r-12b`). |
| **08-P4** | Copy submenu | approved (AC-241–243) | **fixed** | "Copy ›" (`r-12`). |
| **08-P5** | Export › with SVG and PNG; .xlsx after research | approved (AC-244). The **.xlsx part is deferred** until a research doc exists and the user approves its package (spec F23 status). | **fixed** | "Export ›" (`r-12`). |
| **08-P6** | Data as of submenu | approved (AC-245) | **fixed** | "Answered by the database, not a pre-aggregation · Refresh now · Why not accelerated?" (`r-12c`). |
| **08-P7** | The heading's values and "of N" | approved (AC-247) | **fixed** | "● Marking · Sales lines Customer country: Austria · 1 of 21 marked" (`r-12b`). |
| **08-P8** | Right-click and Shift+F10 open the same menu | approved (AC-246) | **fixed** | A right-click on the donut's plot opened the tile menu. The browser's menu did not open (`r-12c`). |

---

## 4. New findings

These follow the phase-1 labels. Most are inconsistencies between screens, which the brief asked to focus on.

**UX-101 · major · usability: Explore's table runs off the page, and each row's ⋯ is out of reach**
- **Saw (`r-01`, `r-05`):**
  - The Owner column prints raw identity strings, such as "78688298da09:CiQwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDESBWxvY2Fs", next to "admin" and "—".
  - `table.folder-contents` measures 1,627 px inside a 1,180 px `.explore__scroll`, so the pane scrolls sideways.
  - Each row's ⋯, the only way to Rename or Move, sits at x = 1,847 on a 1,440 px screen.
- **Why:** the main list of the product hides its row actions and shows an internal id as a person.
- **Recommend:**
  - Show the owner's display name (the signed-in user's `name` is "Super Admin"), falling back to the email, never the subject id.
  - Truncate the Owner cell with a tooltip.
  - Keep the table at the pane's width, as the prototype does, so ⋯ is always on screen.

**UX-102 · major · consistency: one member, five names**
- **Saw.** For the same member:
  - the field list says "Revenue" and "Orders";
  - the well pill says "Revenue sum" and "Orders countDistinct";
  - the picker says "Σ Sales lines Orders";
  - the drawer, Table view and table tile headers say "Sales lines Revenue";
  - the filter pill says "Sales lines Order date: All time";
  - the chart page's pills say "Sales lines Revenue";
  - the ⌘K palette says "Order lines Revenue · order_details.revenue · cube order_details";
  - the Jobs query log says "sales_lines.revenue".

  In the "Top Customers" table every one of six headers starts "Sales lines" (`r-10d`, `r-41`, `r-42`, `r-16`, `r-61c`).
- **Why:**
  - Repeated cube prefixes push the distinguishing word to the end, where columns and pills truncate it.
  - Internal ids break AC-220's intent in the palette and the query log.
- **Recommend:**
  - Short title wherever the chart has one source: table headers, the picker, the chart page, and filter pills whose members all share one cube.
  - Titles, never ids, in the palette's detail line and the query log.
  - AC-220 as amended keeps full titles "elsewhere", so widening the short-title rule to tables and filter pills **needs the user's decision** (a spec change).

**UX-103 · major · aesthetics / usability: bars drawn in the "Other" grey, and one category in two colours**
- **Saw (`r-10c`, `r-10b`):**
  - Every bar of "Revenue by Customer Country" (21 paths) and "Top 10 Products" (11 paths) is filled `#b3b1ab`. That is direction.md §5's "Other / null" neutral.
  - The donut's eight categories take all eight palette slots, and a single-series bar then falls to the neutral.
  - "Monthly Revenue by Category" keeps per-series colours imported with the chart (Beverages `#1fa8c9`, Dairy Products `#454e7c`), while the donut beside it draws Beverages `#2a78d6` and Dairy Products `#eda100`.
- **Why:**
  - A grey bar reads as "Other" or "no data".
  - AC-039 fails when a member is two colours on one dashboard.
- **Recommend:**
  - A single-series chart that colours by no dimension draws in the palette's first colour (or the accent), and claims no slot.
  - A chart's own series colours either feed the dashboard's assignment, or yield to it, the same way on every tile.

**UX-104 · major · usability: titles cut while badges keep the head, differently tile to tile**
- **Saw (`r-10b`, `r-20`, `narrow-10`).** The KPI row of four identical 3-column tiles varies:
  - "Total Revenue" and "Avg Order Value" keep 180 px titles, with the badge at the foot.
  - "Orders" (46 px, "Orde…") and "Customers" (73 px, "Custome…") keep the badge in the head.
  - A second load, in Markings mode, gave all four 180 px (`r-13`), so the placement is not stable.
- **More of the same:**
  - Edit mode cuts "Avg Order Val…" and "Revenue by Catego…".
  - At 390 px the head reads "Total Reven…".
  - KPI heads show "⊞" while chart heads in the same row show the words "Table view".
- **Why:** the user answered on 2026-09-27 (question 29) that the head is the title's and badges move to the foot.
- **Recommend:**
  - Decide the placement from the title's full width, measured once the fonts have loaded.
  - Move the freshness badge to the foot whenever the title would be cut, in view and edit mode alike.
  - Use one Table-view control per dashboard.

**UX-105 · major · prototype-mismatch / usability: the data-source wizard (the user: "the ui for the wizard looks bad")**
- **Saw (`r-64`, `r-64b`, `r-65`, `dark-65`; the prototype in `proto-64`):**
  - A 560 px modal whose title "New data source" is 21/700. That is the UA's `h2`, off direction.md §3's 400/600 weights.
  - Four rounded step pills that look like buttons.
  - The Type step is eight text-only 32 px buttons, with no icon and no note. The chosen one is only faintly tinted, with no ring or check.
  - "Type" and "Connection" labels sit 2 px right of the fields.
  - "Use TLS" and "Verify the server's certificate" are native checkboxes in the browser's blue (`accent-color: auto`, measured).
  - Fields are 32/14, while the prototype's are 28/12 mono.
  - The prototype puts the whole flow in the docked 400 px inspector at 14/600, with compact type buttons, a note on community drivers, and Next in the pane's foot. The list stays visible beside it.
- **Why:** the user named this screen. It is also the phase-2 screen least like the approved prototype.
- **Recommend:**
  - The prototype's docked pane.
  - `.switch`es for the booleans.
  - `.input.sm` fields, with help lines where the driver needs them.
  - A selected type with the accent ring.
  - Step labels that are text, not buttons, until they can be visited.
  - Design it with the phase-2 designs in `ui-review.md` and `designs/` in this folder (T461, T462).

**UX-106 · minor · consistency: dialogs don't share a pattern**
- **Saw (`r-48`, `r-57`, `r-64`, `r-26c`):**

  | Dialog | Title | Buttons |
  |---|---|---|
  | Gallery | 20/700 | "Close" top right; "Use Auto" 24/12 at the foot |
  | Generate cubes | 21/700 | "Generate 0 cubes" (not styled primary) and Close, 32/14 |
  | Data-source wizard | 21/700 | Cancel and a primary Next, 32/14 |
  | Settings discard question | 21/700 | "Keep editing" and a red-outlined "Discard changes", 32/14 |

  Generate cubes' labels are 14/400 above their selects, while the wizard's are 12/600 secondary. All four dialogs have radius 6 and no shadow.
- **Recommend:**
  - One dialog: a 16/600 title (`text-md`), 14 px body, and a foot with Cancel on the left of one primary.
  - A destructive primary in `status-error`.
  - Close always in the same place.

**UX-107 · minor · consistency: form controls and labels in four sizes, with no rule**
- **Saw (measured on each workspace's page; `r-60`, `r-61c`, `r-51`, `r-08`):**
  - **28/12:** the editor inspector, Explore search, settings tables.
  - **32/14:** the wizard, Data sources' filters, the chart page's Dashboard select, Security's field.
  - **32/12:** the Model form's inputs, 32 px tall with 12 px text.
  - **24 px:** the Jobs query-log selects.
  - **Labels:** stacked 12/600 secondary (wizard, settings); inline and touching the control (Data sources: "Folder" directly left of "All folders"); inline at 14 (Access panel: "AD group", "Access").
- **Recommend:**
  - direction.md §4 already names 32 default and 28 compact. Assign each surface one of them: forms and dialogs 32/14; inspectors, panes and filter bars 28/12.
  - Always stack a 12/600 label above its control.
  - Filter bars take the Jobs pattern at 28 px with 8 px between label and control.

**UX-108 · minor · accessibility / aesthetics: the browser's blue in native checkboxes; dark leaves native chrome light**
- **Saw (`r-65`, `dark-65`):**
  - The wizard's checkboxes compute `accent-color: auto`.
  - In dark, the root computes `color-scheme: normal`.
  - UX-035 fixed the same blue on the settings radios by setting the accent.
- **Recommend:**
  - Set `accent-color: var(accent)` globally, and set `color-scheme: dark` under the dark theme.
  - Use `.switch` for on/off settings, as Customize does.

**UX-109 · minor · consistency: page frames differ by workspace**
- **Saw.** Titles and gutters:
  - Page titles start at x 16 on Data sources, Jobs, Schedules, Security and the chart page.
  - They start at x 24 on the dashboard, and at 256 and 284 inside the Model and Explore panes.
  - The prototype's Data sources title is at x 24 (`proto-60`).
  - The chart page's breadcrumb is at x 24 above a title at x 16 (`r-30`).
- **Saw.** "What this page is for" notes:
  - Data sources and Schedules use a blue info bar with a **clock** (idle) icon.
  - Security and the Model overview use a plain paragraph.
  - The prototype uses an info bar with an "i" icon.
- **Saw.** Jobs' tabs sit on a white band that runs the page's width.
- **Recommend:**
  - One page frame: 24 px gutters, and a 20/600 title row with its primary action on the right.
  - One `.info-bar` with the info icon for every page note.
  - Tabs on the page ground.

**UX-110 · minor · usability: dates and times in five formats**
- **Saw:**
  - "Sep 25" (Explore);
  - "9/27/2026, 1:12:49 AM" (Data sources and Jobs);
  - "Passed · 9/27/2026, 3:27:56 AM" (Health);
  - "as of 3:37:38 AM" in a tile's badge;
  - "Data as of 03:37", 24-hour, in the same tile's menu (`r-12`).
- **Recommend:**
  - One formatter: relative for recent ("4 min ago", as the prototype's Last test), "Sep 27, 03:27" otherwise.
  - The exact timestamp in a tooltip.
  - One clock convention.

**UX-111 · minor · usability (content): stale phase copy**
- **Saw (`r-63`, `r-62`):**
  - Security says "Users and groups come in phase 2. In phase 1, policies are authored in the model…", to a user signed in with groups.
  - Schedules says scheduling from wechart "is not part of this phase", while phase 2 plans it (T378).
- **Recommend:** state what the page does now, and drop the phase references.

**UX-112 · minor · aesthetics: drawer panels have no inset; ordinary notices use warning styling**
- **Saw (`r-47`, `r-45`, `r-25`):**
  - The Acceleration tab's text starts at x 280, the drawer's left edge, with no inset. The rollup banner repeats under it.
  - "Showing the first 100 rows. There may be more." and "Showing the first 100 of 184 rows." are 14 px with a warning icon.
  - Cube query's JSON is inset 12.
- **Recommend:**
  - One 12 px inset for every drawer panel.
  - Row-limit notes at 12 px secondary, with no warning icon, beside the row count (see 02-1).

**UX-113 · minor · accessibility: chart text and imported colours not themed in dark**
- **Saw (`dark-10`, `dark-10b-donut-labels-zoom`):**
  - The donut's data labels are ECharts' defaults in both themes: `fill="#333"` with a 2 px white stroke. In dark they read as outlined white text.
  - The imported series colour `#454e7c` (Dairy Products) is about 2.1:1 on the dark tile `#1c1c1b`, under 3:1 for a graphic.
- **Recommend:**
  - Theme pie and donut labels from the tokens, as axis text already is (T254).
  - Map a chart's own series colours to the dark palette, or validate them against the dark tile.

**UX-114 · minor · usability: Data sources table**
- **Saw (`r-60`, `proto-60`):**
  - "Used by" stacks nine "cube · Shared" lines in one cell, so the only row is about 200 px tall.
  - The source's name is plain text, with nothing to open.
  - "Shared" is an underlined link, unlike Explore's rows.
  - Updated and Health are absolute timestamps.
  - The prototype shows a Cubes count, a relative "Last test", mono names, and a row that opens a docked inspector.
- **Recommend:**
  - A count with the list in a popover or the inspector.
  - Row click opens the source (T462).
  - Relative times (UX-110).

**UX-115 · minor · aesthetics: "The rest" segmented control clips its labels**
- **Saw (`r-40`, `r-42`):** "Fold into "Other (n)"" (103 px) and "Leave out" (59 px) wrap inside 28 px buttons, and the second line is cut. The control is pale while Top N is "All".
- **Recommend:**
  - Short labels ("Fold into Other" / "Drop"), with the full wording in a tooltip.
  - Or hide the control until Top N is set.

**UX-116 · polish · usability: year series out of order**
- **Saw (`r-30`, `r-40f`):** the legend reads 1997, 1998, 1996, in arrival order.
- **Recommend:** order the series of a time-like or numeric dimension by value, unless Customize sets an order (AC-300).

**UX-117 · minor · usability: category labels silently dropped**
- **Saw (`r-10c`):** "Top 10 Products by Revenue" draws 11 bars and labels 3 of them ("Rössle Sauerkraut", "Camembert Pierrot", "Other (67)").
- **Why:** a reader cannot tell which bar is which.
- **Recommend:**
  - Rotate or wrap category labels before hiding any.
  - When more than half would be hidden, offer the horizontal bar as the type card's runner-up.

**UX-118 · minor · consistency: opening Access reflows the folder header**
- **Saw (`r-08`):**
  - With the Access panel open, "+ New" drops to its own line.
  - The table is cut behind the panel.
  - The panel's form uses inline labels, and a 32 px primary Save sits apart from the list it saves.
- **Recommend:**
  - Keep the header on one line: let the search field shrink before the action wraps.
  - Use the stacked-label form of UX-107.

**UX-119 · minor · consistency: pills and chips differ by screen**
- **Saw (`r-30`, `r-40`, `r-54`, `r-10b`):**
  - The chart page's Metrics and Dimensions pills are grey with no role tint.
  - The editor's are orange and blue.
  - Model badges are 999 px pills ("$,.0f").
  - Filter scope tags ("Dashboard") are boxed squares.
- **Recommend:**
  - Role-tinted pills wherever a member is shown as a pill.
  - Chips at 999 px for status only (direction.md §4's radius rule).

---

## 5. Cleanup list, by surface

Each entry says what to change and cites its finding. "Decision" marks an entry that needs the user's decision before it can be a task.

### Shell and cross-screen patterns
1. **One page frame.**
   - 24 px gutters.
   - A title row: 20/600 title, then a note, then the primary action on the right.
   - One `.info-bar` with the info icon for page notes.
   - Tabs on the page ground.
   - (UX-109, UX-111)
2. **One dialog pattern.**
   - A 16/600 title and 14 px body.
   - Cancel beside one primary at the foot; a destructive primary in `status-error`.
   - Close in one place.
   - Apply it to the gallery, Generate cubes, the discard question and every future dialog. (UX-106)
3. **Control sizes by context.**
   - Forms and dialogs 32/14; inspectors, panes and filter bars 28/12; labels stacked 12/600.
   - Fix the Model form's 32/12 fields and Data sources' touching labels. (UX-107, UX-118)
4. **Global `accent-color`**, `color-scheme: dark` under the dark theme, and `.switch` for booleans. (UX-108, UX-090)
5. **One date and time formatter**, with the exact time in a tooltip. (UX-110)
6. **Member names.**
   - Short titles in the picker and the chart page.
   - Titles, not ids, in the palette and the query log.
   - Short titles in table headers and filter pills too: **Decision**, since this widens AC-220. (UX-102, UX-061, UX-013, UX-082)
7. **Role-tinted member pills everywhere; round chips for status only.** (UX-119)
8. **When the list above has landed, run T406's re-critique** (AC-187).

### Explore
9. **Owner shows a display name**, never a subject id. Truncate the cell, keep the table at the pane's width, and keep ⋯ in view. (UX-101)
10. **Sortable Name / Type / Updated headers**, with `aria-sort`. (UX-012)
11. **Move to… as a menu or small dialog** of folder paths, not a native select over the row. (UX-011)
12. **⌘K groups results by kind** (Dashboards, Charts, Models, then "Fields (n)" collapsed to 3), with the cube as a group, not a detail line. (UX-013)
13. **Below 1,024 px, collapse the folder tree** into a sheet or drop-down: **Decision**, backlog §3 N16. (UX-092)

### Dashboard: view mode
14. **Tile head.**
    - Keep the title whole: move the freshness badge (and the marking badge) to the foot whenever the title would be cut, measured once fonts load, in view and edit mode.
    - One Table-view control.
    - Time to the minute in the badge, the exact time in its tooltip.
    - (UX-104, UX-021)
    - Moving "Table view" into ⋯ is **Decision**: it reverses T252's deviation (backlog §3 F8).
15. **Colours.**
    - A single-series chart draws in the first palette colour and claims no slot.
    - A chart's own series colours and the dashboard's assignment agree on every tile.
    - Theme pie and donut labels, and validate imported colours in dark.
    - (UX-103, UX-113)
16. **Table view drops the ungranular time column** when the granular one is present; the drawer too. (UX-023)
17. **The marking chip grows** to the band's free width before truncating, and shows its values. (UX-026)
18. **Header: show the dashboard's description line; a Markings button in Markings mode:** **Decision** (backlog §3 F3). (UX-027)
19. **Tab groups draw their tabs in the section band**, with no middle frame. (UX-028)
20. **The marked share on the remaining chart types**, with the stacked bar first (T453). (UX-025)
21. **Category labels:** rotate or wrap before hiding; offer the horizontal bar when most would be hidden. (UX-117)
22. **Order year-like series by value.** (UX-116)

### Dashboard: edit mode
23. **Edit-mode heads show the element's kind** ("Chart · Area"), not the freshness badge or Table view. (UX-032)
24. **Adding a filter selects it**, switches the sidebar to Properties, and puts focus in the field picker. (UX-031)
25. **Tighten Properties' button rhythm** to the prototype's section spacing. (UX-033, polish)

### Dashboard settings
26. **Add the mode cards' illustrations and a link to each mode's configuration.** (05-2)

### Chart page
27. **For a dashboard-local chart:**
    - "Lives on ‹dashboard› · only there";
    - a primary **Edit on ‹dashboard›**, which opens that dashboard in edit mode with this tile's editor;
    - **Save to folders…**.
    - In the editor, if it is ever reached this way, replace the "edit and save it there" sentence with the same two buttons. (UX-040, 06-1)
28. **A single KPI at `text-kpi-solo` 40/52, centred.** (UX-041, 06-2)
29. **Details pane:**
    - "＋ Add to a dashboard…" as a picker;
    - Delete moved into ⋯ with confirmation;
    - "Built on" in the pane's 12 px type;
    - a title in the tile.
    - (UX-042, 06-3)

### Chart editor: Data tab (design 01)
30. **The prototype's inspector order**, in three sections with rules. (UX-050, 01-1)
31. **Type card:**
    - a 28 px type icon;
    - a quick-pick row (Auto plus the recommender's top pick and runners-up), with the drawn one pressed;
    - no separate "Back to recommended".
    - (UX-051, 01-2)
32. **A Recommended card with a reason built from the signature and cardinalities**, and **Use**, shown only while the manual pick differs. It is 12 px, not 14. (UX-052, 01-3)
33. **Name the drawn form in the card:** "Bar, grouped by Order year". (UX-065)
34. **Picker:**
    - a filter box once there are more than 10 candidates;
    - groups by cube, the joined ones marked "via join";
    - each row's aggregation.
    - (UX-054)
35. **Field list lists the cubes reachable through joins**, as groups marked "via join". (UX-060, 01-4)
36. **A field the drawn form can't show:**
    - mark its pill "not drawn", with a one-line reason;
    - offer Small multiples and Table;
    - Auto never picks a form that hides a metric;
    - keep the value axis's format.
    - (UX-057, 01-5)
37. **"Why this recommendation?" as the prototype's short checklist**, with the full table behind "Show every rule for every type (n)". (UX-059, 01-6)
38. **Sort default:** "Cube's order (unsorted)". (UX-055)
39. **The time grain as a tag with a small menu**, like the aggregation. (UX-056)
40. **Disable the wells until a cube or view is chosen**, saying "Choose a cube or view first". (UX-063)
41. **"The rest" control:** short labels, or hidden until Top N is set. (UX-115)

### Chart editor: header, drawer, Customize, gallery (design 02)
42. **Header badges:** "Raw query" / "✓ Pre-aggregation" and "n rows · ms". (UX-062)
43. **Move the rollup-only sentence** into the Raw query badge's tooltip and the Acceleration tab. Escalate it to a banner only when rollup-only is known to be on. (UX-062, 02-4)
44. **Drawer:**
    - resizable from 160 px to 50 % (a `role=separator`);
    - a header line "n rows · ms" with **Copy** and **Download CSV**;
    - 12 px padding in every panel;
    - row-limit notes in 12 px secondary.
    - (UX-058, UX-112, 02-1, 02-3)
45. **Cube query:** a Copy button and a JSON / SQL switch. (UX-058)
46. **Underlying rows by drill members, else the primary key and time dimension:** **Decision** (02-5, which changes AC-036's rows).
47. **Customize:**
    - collapsible sections instead of fieldsets;
    - rotation and legend position as `.seg`;
    - a category axis shows only title, rotation and label count.
    - (UX-064)
48. **Gallery cards take the prototype's 28 px type icons.** (UX-066)

### Model workspace (design 03)
49. **The upfront comment banner** on opening a file with comments. It names each comment by its first line and its lines, with "Show in YAML" and "Edit in form anyway". Keep the just-in-time guard. (UX-070, 03-1)
50. **Member rows:**
    - rules, not boxes;
    - the SQL under the name in mono;
    - Remove inside the expanded body;
    - "+ dimension · n total" at the end.
    - (UX-072, 03-2)
51. **General:**
    - Basics / Refresh / Advanced groups with help lines;
    - "SQL table | SQL" as one choice with a single-line mono input;
    - switches showing Cube's default for booleans.
    - (UX-073, 03-3)
52. **Short tab labels** ("Pre-aggs", "Access") and muted zero counts, so the strip fits. (UX-074, 03-4)
53. **Tree:** a `model/` root, ▾ folders, 28 px rows. New cube and New view in the pane head's overflow or as ghost buttons. (UX-075)
54. **Head:** a 13/600 path; "✓ Published" at rest; Save hidden until there is a change. (UX-076)
55. **The form flat in its pane**, with no inset card. (UX-077)
56. **YAML soft wrap**, on for comments. (UX-078)
57. **The overview as a table of files**, or open the first file. (UX-079)

### Data sources
58. **The wizard as the prototype's docked pane.**
    - A 14/600 title.
    - Compact type buttons with a selected ring, and a note on drivers.
    - `.switch`es for TLS.
    - 28/12 fields with help lines.
    - Step labels as text until reachable.
    - Build it with T461 and T462 to the phase-2 design in this folder. (UX-105)
59. **List:**
    - a Cubes count instead of a stacked "Used by";
    - a row click opens the source's settings (T462);
    - relative "Last test";
    - mono names.
    - (UX-114)

### Jobs
60. **Dock the detail pane under the app bar** with a 44 px pane head. Use 24 px `btn-sm` actions. (UX-081)
61. **A row click selects; the name is not a link.** "Open in Model" deep-links to the file's Pre-aggs tab with the member expanded. (UX-080)
62. **Query log:**
    - group rows by day, or show "Today 03:59:16";
    - a left-aligned caption;
    - members by title, or ids in mono.
    - (UX-082, UX-102)

### Schedules
63. **The design 07 table:** the schedule in words and as written, the next runs with the "up to about five minutes" note, "Cube's default" and "Not scheduled", and a link to builds in Jobs. It builds on T377. (UX-001, 07-1)

### Security
64. **Security:**
    - dock the preview pane;
    - press the group chip that matches the JSON;
    - label the last field "Preview a dashboard as this context";
    - remove the phase-1 sentence.
    - (UX-085, UX-111)

### Narrow windows
65. **Below 1,024 px, the chart editor shows "The chart editor needs a window at least 1,024 px wide"** with Back. (UX-093)
66. **The dashboard's filter bar as a sheet below 1,024 px:** **Decision** (backlog §5). (UX-091)

---

## 6. What could not be checked

- **The phase-1 seed content is not in revision 30.**
  - There is no Company dashboard 01, Finance folder, library chart or `seed-chart-*`.
  - UX-010 was checked on the chart page's type chip and T243's test, not on an Explore row.
  - The phase-1 "Company dashboard" states (a 240-bar chart, an Appendix tab group) were rebuilt on Northwind: a dense count was made in an editor that cannot save, and the tab group was simulated in the browser.
- **The model declares no pre-aggregations and no access policies.** So these were not observable:
  - the Jobs detail pane with a row, and the row click (UX-080 was read from source);
  - Schedules' rows (07-1, read from source);
  - a "✓ Pre-aggregation" badge;
  - Security's chips against a policy.
- **Markings mode** was seen only through a browser-side rewrite of the dashboard document, because the dashboard uses cross-filtering and changing that needs a Save.
- **Anything that needs Save was not exercised:**
  - a chart saved from the editor;
  - Save settings;
  - Save & reload Cube;
  - publishing a new cube;
  - creating a folder ("+ Folder" writes at once);
  - New › Chart (it writes a document).
  The empty editor was reached by clearing the source instead.
- **The wizard's Test and Name steps.** Test runs a connection test that is stored even when the wizard is cancelled (T363), so only Type and Connection were seen.
- **WebKit and Firefox:** measured in Chrome only. UX-096's 11 px WebKit selects were not re-measured.

---

## 7. Screenshot index (`recheck-screens/`)

| File | Shows |
|---|---|
| r-01-explore-root | Explore › Shared: raw owner ids, table wider than the pane |
| r-03-explore-new-menu | ＋ New menu |
| r-04-explore-row-menu, r-05-explore-move-to | Row ⋯ menu (off-screen until scrolled); Move to… as a native select |
| r-06-explore-row-hover | Row hover |
| r-07-explore-rename | Folder rename in place |
| r-08-explore-access | Access panel; the header reflows |
| r-10-dashboard-view, r-10b-dashboard-view-full | Northwind view: KPI row with mixed badge placement ("Orde…", "Custome…") |
| r-10c-dashboard-view-scrolled, r-10d-dashboard-view-bottom | Grey single-series bars; pivot; table tile with "Sales lines" headers |
| r-11-dashboard-tile-hover | ↻ ✎ ⋯ on hover beside the badge and Table view |
| r-12-dashboard-tile-menu | Cross-filter tile menu |
| r-12b-dashboard-tile-menu-marked | Marked tile menu with heading (Markings simulated) |
| r-12c-tile-menu-data-as-of | Right-click menu › Data as of |
| r-13a-dashboard-markings-mode, r-13-dashboard-marked | Markings simulated: header, chip, badges, marked share |
| r-14-dashboard-tab-group-simulated | Section → tab group → Markdown (simulated): three frames |
| r-15b-dashboard-tile-table | Tile Table view: grid style, repeated time column |
| r-16-palette-results | ⌘K "order" |
| r-20-dashboard-edit, r-21-dashboard-edit-selected, r-24-dashboard-edit-add | Edit mode, Properties, Add |
| r-25-dashboard-tile-editor, r-25d-dashboard-after-editor | Tile editor overlay (Actual size / Fit `.seg`; Save dashboard) |
| r-26-dashboard-settings, r-26b-dashboard-settings-interactions, r-27-dashboard-settings-markings, r-26c-settings-discard-question | Settings page, mode cards, markings table, discard question |
| r-28-dashboard-add-filter, r-29-dashboard-filter-added | Add › Filter; the new filter's popover, sidebar still on Add |
| r-30-chart-page-local, r-31-chart-page-kpi | Chart pages: local chart with "Edit chart"; KPI at 32 px |
| r-40-editor-local-from-page | Editor from a local chart's page: no Save |
| r-40b-editor-hbar, r-40b-editor-preview-tableview | Editor on a horizontal bar; preview Table view |
| r-40f-editor-auto-grouped | "Auto · Bar" drawing grouped bars |
| r-41-editor-metric-picker, r-41c-editor-dimension-picker | Inline pickers |
| r-41-editor-no-source, r-41b-editor-after-source-switch | No source chosen; after switching source |
| r-42-editor-second-metric | Second metric drawn but invisible |
| r-43-editor-why | "Why this chart?" rule dump |
| r-44-editor-field-list-cube | Orders cube: no joined cubes |
| r-45-editor-drawer-underlying, r-46-editor-drawer-query, r-47-editor-drawer-acceleration | Drawer tabs |
| r-48-editor-gallery, r-49-editor-customize | Gallery without icons; Customize |
| r-22-editor-dense-count-over-time | Orders by day: Auto · Line, whole-number ticks |
| r-50-model, r-51-model-us-states, r-51b-model-order-details, r-54-model-measures, r-54b-model-measure-expanded, r-56-model-new-cube, r-57-model-generate-dialog | Model workspace |
| r-60-data-sources, r-64-ds-wizard-type, r-64b-ds-wizard-type-chosen, r-65-ds-wizard-connection, r-65b-ds-wizard-connection-bottom, r-65c-ds-wizard-after-cancel | Data sources and the wizard |
| r-61-jobs, r-61c-jobs-queries | Jobs |
| r-62-schedules, r-63-security | Schedules, Security |
| dark-01, dark-10, dark-10b-donut-labels-zoom, dark-40, dark-50, dark-60, dark-63, dark-65 | Dark theme |
| narrow-01, narrow-10, narrow-30, narrow-40, narrow-60 | 390 × 844 |
| proto-60-sources, proto-64-sources-new | The prototype's Data sources and its new-source pane |
