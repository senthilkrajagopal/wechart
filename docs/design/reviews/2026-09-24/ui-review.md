# wechart UI review: usability and aesthetics, every screen (2026-09-24)

**Reviewer's brief:** look at every screen as a senior designer of enterprise BI tools, recommend usability and aesthetic changes, document them all, and design the most valuable ones for the user to approve.

**What was compared**

- **App:** http://localhost:5400 (fresh production build, real Cube API), driven with Playwright 1.63 and system Chrome at 1440 × 900, light and dark, and 390 × 844. Values quoted as "measured" come from `getComputedStyle` / `getBoundingClientRect`.
- **Approved prototype:** http://localhost:5500 (`docs/design/prototype/*`), the same way.
- **Rules:** `docs/design/direction.md` (tokens, §7d prototype rules, checklist) and the open items in `docs/design/critiques/2026-09-24-recheck-*.md`. Where a recheck item is still open it is confirmed below with today's evidence, not just repeated.
- **Screenshots:** `docs/design/reviews/2026-09-24/screens/` (96 files, index at the end). `app-*` is the app, `proto-*` the prototype, `dark-*` and `narrow-*` the dark theme and 390 px checks.
- **Designs:** `docs/design/reviews/2026-09-24/designs/` (7 mockups plus `index.md`).

**Nothing was saved.** Every edit made during the review (a second metric in the editor, a dashboard filter, New cube / New view drafts) was discarded. No items were created in Explore, and nothing was deleted.

**Labels.** Severity is *critical* (a core task breaks or work is lost), *major* (real friction or confusion on a main path, or one of the user's stated priorities), *minor*, or *polish*. Class is *usability*, *aesthetics*, *consistency*, *accessibility* or *prototype-mismatch*. A recommendation that would add a feature not in `docs/spec.md` is marked **proposal — needs the user's approval**.

---

## 1. Summary

**Overall state.** The shell, Explore, the dashboard canvas and edit mode have converged on the prototype since the rechecks: Explore rows are 34 px with hover and an empty-state row, the filter band holds its 53 px, chart text is in Inter, tab-group tabs show their selection, the palette dims the app bar. The product now *looks* like the prototype wherever the prototype's component CSS was reused.

The gaps are concentrated where the app built its own components instead:

- **The chart editor's inspector and results drawer** are functionally complete but visually and structurally unlike the prototype the user approved, which is exactly what the user noticed. Wells are big solid cards with browser-default headings, the "+" is a native select, the recommendation sits unstyled under Top N, "Why this chart?" is a 70-line dump of rule ids, and the drawer is a lone "Results" button that opens onto an unstyled HTML table.
- **Every data table outside Explore is unstyled** (editor drawer, editor Table view, dashboard tile Table view): 14 px, 1 px cell padding, centred headers, left-aligned numbers, no tabular numerals. KPI values are 14 px body text.
- **Three flows break or dead-end:** New cube from the Model overview opens an error; "Edit chart" on a dashboard-local chart's page opens an editor with no way to save; a second metric added to a chart is queried but silently not drawn.
- **The Model workspace** has the prototype's three-pane structure but not its finish: no upfront comment warning, member rows without the SQL line, a flat General form, a clipped tab strip.

**The 10 most important changes**

1. **Rebuild the chart editor's Data tab to the prototype's inspector** (UX-050 … UX-056). Design 01.
2. **Give the editor the prototype's results drawer**, always showing its tabs, open by default, with a formatted grid (UX-058). Design 02.
3. **One shared data-grid style for every table** — drawer, preview Table view, tile Table view (UX-024) — and real KPI type (UX-020). Designs 02, 04, 06.
4. **Never drop a field silently.** When the drawn form can't show a metric, say so on its pill and offer the form that can (UX-057). Design 01.
5. **Fix the three broken flows:** New cube from the Model overview (UX-071), Edit chart on a local chart's page (UX-040), and the Jobs row that navigates away (UX-080). Design 06 covers the chart page.
6. **Make the recommendation explain itself in data terms**: a reason built from the fields ("2 categories × 3 statuses × 1 measure → grouped bars") and a readable "Why this recommendation?" checklist (UX-052, UX-059). Design 01.
7. **Show joined cubes in the field list** ("via join", as the prototype does) and give fields their tinted role chips (UX-060, UX-061). Design 01.
8. **De-clutter the tile header** (one freshness badge, Table view into the ⋯ menu) and fix dense time charts (sensible bars vs line, integer ticks for counts) (UX-021, UX-022). Design 04.
9. **Finish the Model workspace to the prototype** the user prefers: upfront comment banner, member rows with SQL previews, grouped General form, compact tabs (UX-070 … UX-079). Design 03.
10. **Finish the dashboard settings page** (still open from the recheck: no title bar, Save not primary, Chrome-blue radios, no mode explanations) (UX-035). Design 05.

**Confirmed fixed since the rechecks** (not repeated as findings): Explore rows 34 px with `bg-hover` and pointer (recheck shell F17, N11); empty-folder and no-results rows inside the table (F24, F25); footnote under the table (F22); Explore search 260 px (N3); the top-bar trigger no longer clipped ("Search wechart"); palette backdrop above the app bar with the pop shadow (N9); the filter band a constant 53 px (dashboard N8); chart text in Inter (N7, font only); Header element without tile chrome (N5); tab-group tabs with an accent underline (N1); "Live · as of" merged into one pill (F8, partly); view-mode ⋯ menu with Create details tile (F4, partly); the editor's Back button and ownership note (chart-editor N2, T256; seen in app-40 and app-41). The title-lost-on-Save bug (chart-editor N1) was fixed by T255 per the git log; this review did not save a chart, so it did not re-test it.

---

## 2. Findings by screen

### 2.1 Chart editor — the user's first priority

The user compared the editor with the prototype (`proto-40` … `proto-47`) and preferred the prototype's inspector and drawer. The app's editor is `app-40` (library entry), `app-25` (from a dashboard tile), `app-41` (blank).

**UX-050 · major · prototype-mismatch — The Data tab's order and structure differ from the prototype**
- **Saw (app-40, app-42):** Chart type card → Back to recommended → Metrics / Dimensions / Time / Filters as four separate cards → Top N → "Recommended: Bar" paragraph → "Or" bulleted list → "Why this chart?" → Sort, at the very bottom (y ≈ 870 after scrolling). The source select lives at the top of the *field* pane.
- **Prototype (editor.js 248–310):** Cube or view → Chart type card with quick-pick icons → Recommended card (only when the pick differs) → *section rule* → Metrics · Dimensions (group by) · Time + grain · Filters as compact dashed wells → Sort by + Top N side by side → *section rule* → ▸ Why this recommendation?
- **Why it matters:** an analyst reads the inspector top-down as "what am I looking at → what is it made of → how is it ordered". Today the type decision is split into three places (card at the top, recommendation below Top N, sort at the bottom), and the wells take ~120 px each, so the Sort control that changes the chart the most is two screens down.
- **Recommend:** the prototype's order and grouping exactly, in three `.section` blocks. Keep the source select in the field pane head too (it names the source the fields belong to), as the prototype does ("View: sales"). **Design 01.**

**UX-051 · major · prototype-mismatch — Chart type card lacks the icon and the quick picks**
- **Saw:** a text-only card "Bar / Chosen manually · Change…" (295 × 56, measured) and a separate "Back to recommended" button, even when the chosen type *is* the recommended one (app-40: manual Bar, Recommended: Bar).
- **Prototype:** a 28 px type icon tile, "Bar, horizontal", "Chosen manually · Change…", then a row of 24 px icon buttons — Auto plus the recommender's top pick and runners-up — with the drawn one pressed in `accent-soft`, and "Suggested for these fields".
- **Why:** switching between the 2–4 sensible forms is the most common editor action. Today it needs the gallery (two clicks and a modal); the quick row makes it one click, and the icons teach the forms.
- **Recommend:** the prototype card plus quick-pick row. The "Auto" button in the row replaces "Back to recommended" (AC-217 wording can stay as its accessible name). Hide it when the manual pick equals the recommendation. **Design 01.**

**UX-052 · major · usability — The recommendation's reason is a fixed blurb, and it is not actionable**
- **Saw:** "Recommended: Bar — Compares a measure across categories by length." The same sentence for every bar chart (`recommender/src/recommend.ts` `REASONS`), in an unstyled paragraph with a bulleted "Or" list, no button.
- **Prototype:** a `pinned` card "Recommended: Bar, horizontal · 75 categories: top 15 + "Other", sorted" with a **Use** button, shown only while the manual pick differs.
- **Why:** direction.md §6 and checklist 9 ask for a reason from the data ("Time × 1 measure, 184 dense points → line"). A generic sentence tells an analyst nothing they can act on, and without "Use" the card is prose.
- **Recommend:** build the reason from the signature and cardinalities (e.g. "2 categories × 3 statuses × 1 measure → grouped bars", ≤ 80 characters, AC-028), show it in the card with **Use**, and show runners-up only as the quick-pick icons (their reasons in each icon's tooltip). **Design 01.**

**UX-053 · major · aesthetics / prototype-mismatch — Wells are heavy cards with browser-default headings**
- **Measured:** `.well` 295 × 119 px, 1 px *solid* `border-subtle`, padding 8; its label is an `h3` at **16.38 px / 700** (the UA's 1.17 em bold, off the type scale and outside the allowed weights); pills 24 px, **radius 12**, grey `bg-subtle` with a border, weight 400.
- **Prototype (index.html 857–941):** a 12/600 `text-secondary` label *above* a dashed `border-strong` well (min-height 36, radius 6); pills radius 4, 12/600, `role-dim-soft`/`role-dim` or `role-measure-soft`/`role-measure`, aggregation tag at 400.
- **Why:** four 119 px cards push everything below the fold, the 16 px bold labels shout louder than the chart title, and grey pills lose the blue/orange role coding that the field list and every other BI tool (Looker, Tableau) use to tell dimensions from measures at a glance.
- **Recommend:** the prototype well and pill; label "Dimensions (group by)". **Design 01.**

**UX-054 · major · prototype-mismatch / usability — "+" is a native select, not the inline picker**
- **Saw:** "+ Add to Metrics…" `select-sm` (170 × 24) under each well; options are flat titles ("Orders Total Amount").
- **Prototype:** a borderless "+ metric" `addbtn` inside the well that opens a 240 px `.picker` menu listing measures with orange Σ chips (proto-41), or dimensions with blue Aa/#/◷ chips.
- **Why:** the user called this out. A select can't show role chips, types or cardinality, can't be searched, and in WebKit renders at 11 px (direction §3 exception). The picker is also the keyboard path (checklist 11), so it needs to be good.
- **Recommend:** the prototype picker, with a filter box at the top once a cube has more than ~10 candidates, each row showing chip · title · aggregation, and joined-cube members grouped under their cube. **Design 01** (picker open).

**UX-055 · minor · usability — Sort is last, and "Cube's order" is an unclear default**
- **Saw:** Sort select at the bottom after the trace; default label "Cube's order".
- **Prototype:** "Sort by" and "Top N (+ Other)" side by side under the wells; default "Default".
- **Recommend:** the prototype row. Keep the app's richer options (label Z→A) but word the default as what it does for this chart ("Cube's order (unsorted)"), so a reader understands why bars aren't ranked. **Design 01.**

**UX-056 · minor · usability — Time well has no grain control until a field is in it**
- **Saw:** "Time" card with "+ Add to Time…"; the grain lives inside the pill as a borderless select.
- **Prototype:** one row: time-dimension select + Month / Quarter / Year segmented control.
- **Recommend:** keep the grain on the pill (it scales to several time fields), but render it as the pill's tag with a small menu rather than a raw select, matching the aggregation tag. Minor; shown in Design 01.

**UX-057 · major · usability — A second metric is queried but silently not drawn**
- **Saw (app-40d, app-40e):** adding Total Amount to Metrics re-ran the query (the drawer shows *Orders Count* and *Orders Total Amount* for all 6 rows) but the chart kept showing Count only. The type card still read "Bar", in both manual and Auto states (app-40f); nothing said Total Amount was ignored. The same happened in the dashboard overlay (app-25c).
- **Why:** the analyst concludes the add failed, or worse, trusts a chart that isn't showing what the wells claim. Every serious BI tool either draws the field or says why not.
- **Recommend:** never drop a well field silently. Mark the pill "not drawn" (dashed outline, muted) with a one-line reason under the wells — "Bar draws one metric. Total Amount is in the query but not on the chart." — and offer the forms that do draw it as buttons: **Small multiples** (one panel per metric, direction §6 "two measures with different scales become small multiples") and **Table**. In Auto, the recommender should not pick a form that drops a metric. **Design 01** shows this state.

**UX-058 · major · prototype-mismatch — The results drawer (the user: "totally missing")**
- **Saw (app-40, app-44 … app-47):** closed by default to a single 73 × 32 "Results" button at y 860. Opened, it shows a *second* row of four bordered buttons (Result rows, Underlying rows, Query, Acceleration) with **no visible selected state** — all four are identical `bg-surface` buttons although `aria-selected` differs. The table is browser-default (measured `td` padding 1 px, 14 px, `th` centred, no background, `font-variant-numeric: normal`, not sticky); numbers are left-aligned; there is no row count, timing, copy or export. The drawer grows the section upward and shrinks the chart instead of being a resizable pane.
- **Underlying rows (app-45):** only the chart's own members (Status, Category, Count = 1 per row), so a row can't be traced to a record — no order id, no date.
- **Cube query (app-46):** raw `JSON.stringify` in a `pre`, no copy.
- **Prototype (editor.js 416–479):** a 220 px pane, open by default, a `.tabs` strip (36 px, 12/600, accent underline on the selected tab), and `.grid-table` (12 px, sticky 28 px `bg-subtle` header, 24 px rows, numbers right-aligned with tabular figures, formatted as the model says: $82.0K). Underlying rows show "2,653 line items · first 200" with Order, Date, Product, Category, Revenue.
- **Why:** the drawer is how an analyst checks that the chart is right — the numbers behind each bar, the records behind a number, the query to hand to an engineer. Unformatted, unselected and hidden, it isn't used.
- **Recommend:**
  - The prototype drawer: tab strip always visible (so the drawer is discoverable when collapsed), open by default at 240 px, resizable 160 px–50 % (direction §2), a collapse chevron, and the header line "6 rows · 39 ms · Raw query" with **Copy** and **Download CSV** on the right.
  - Keep the app's fourth tab, **Acceleration** (AC-144), in the same strip.
  - One shared data grid (UX-024).
  - Underlying rows: add the measure's **drill members** when the model declares them — Cube returns `drillMembers` in `/v1/meta` (`docs/research/cube/data-apis.md` line 25) — and otherwise the cube's primary key and time dimension, so each row is traceable. This changes the underlying query's members, so it needs a check against AC-036's wording ("the underlying rows … for the current chart"); **proposal — needs the user's approval**.
  - Cube query: syntax-highlighted JSON with Copy, plus the SQL Cube generated if available (the app already asks `/v1/sql` for acceleration).
  - **Design 02.**

**UX-059 · major · usability — "Why this chart?" is a raw rule dump**
- **Saw (app-43):** a nested list of every candidate × every rule: "Pie — allowed, cost 8 / ✓ no_encodings passed / ✓ no_dual_value_axis passed / ✓ high_cardinality_color passed …", ~70 lines, internal ids and costs. Recheck F16, still open.
- **Prototype (proto-43):** a short checklist with status icons: "Signature: 0 time × 1 category × 1 measure (from Cube /v1/meta member types)", "Product: 75 distinct values", "⚠ Colour channel: 75 ≤ 8? illegal → facet or top-k", "Trellis panels: 75 ≤ 20? pages of 20", "Picked Bar, horizontal: 75 categories: top 15 + "Other", sorted".
- **Why:** AC-029 needs every hard rule's verdict, but the reader's question is "why not the chart I expected". Rule ids and costs answer nothing.
- **Recommend:** the prototype's checklist as the default view — signature, one line per field with its distinct count, then only the rules that *decided* (each capacity check with its numbers, pass ✓ / fail ⚠), then "Picked …". Put the full per-candidate table behind "Show every rule for every type (n)" so AC-029's completeness stays one click away. Human wording for each rule id (e.g. `high_cardinality_color` → "Colour: 3 statuses ≤ 8 colours"). **Design 01** shows it collapsed at the bottom of the tab; its expanded form is drawn in the design's side note.

**UX-060 · major · prototype-mismatch — The field list hides joined cubes**
- **Saw (app-40):** the chart uses *Products Category*, but the field list shows only "Orders 6"; "+ Add to Dimensions…" offers only Orders members. Products' other fields can't be added without switching the whole chart to a view.
- **Prototype (editor.js 210):** every reachable cube is its own group, marked "via join" (orders 6 · products 2 · customers 3 …).
- **Why:** Cube's joins are the point of a semantic layer; an analyst on the Orders cube expects Product and Customer attributes to be one click away, as in Looker's explore or Superset's dataset columns.
- **Recommend:** list the cubes reachable from the chosen cube through its joins as further groups labelled "via join", collapsed by default after the first, with the same search. Reachability comes from the model's joins (the join diagram already computes them). **Design 01.**

**UX-061 · minor · consistency — Field rows: no role chips, a ✓ for "used", three sub-headings, two names per field**
- **Saw:** Σ / Aa / ◷ as bare glyphs; "used" as a ✓ after the meta; the group split into MEASURES / DIMENSIONS / TIME DIMENSIONS headings; the list says "Count" while the pill says "Orders Count count" (the aggregation twice). Recheck F5 / N5, still open.
- **Prototype:** 18 × 18 radius-4 role chips (`role-*-soft`), a 6 px accent dot after the name, one group per cube, the same short title in the list and the pill ("Revenue sum").
- **Recommend:** the prototype rows and one naming rule: the short title everywhere inside the editor (the cube is already the group heading), the aggregation only as the pill's tag. **Design 01.**

**UX-062 · minor · prototype-mismatch — Header: bordered title field, text Undo/Redo, the rollup warning on every chart**
- **Measured:** title input 420 × 32, 1 px `border-strong` on white (prototype: transparent border and background, 15/600); Undo/Redo 48 × 24 text buttons (prototype: 32 × 32 ↶ ↷ `iconbtn`s). There is no "Raw query" / "✓ Pre-aggregation" badge or "n rows · ms" badge; the source and row count are plain text ("Orders · 6 rows").
- **Saw (app-40, app-25):** a yellow ⚠ banner "Depends on the source database: in rollup-only mode, Cube would refuse this chart." heads the canvas of every unaccelerated chart.
- **Why:** the title should read as the page's title, not a form field; icon undo/redo save ~70 px of a crowded row. The rollup banner is correct content (the capability inventory calls for a per-chart warning) but it is phrased cryptically and styled as an alarm on charts that work — analysts learn to ignore yellow.
- **Recommend:** the prototype's header (borderless title that shows its field on hover/focus, ↶ ↷, badges "Raw query" and "6 rows · 39 ms"). Move the rollup note into the Raw query badge's tooltip and the Acceleration tab ("Not served by a pre-aggregation. If Cube runs in rollup-only mode it would refuse this chart. Build one: …"), and escalate it to a warning banner only when rollup-only is known to be on. **Designs 01, 02.**

**UX-063 · minor · prototype-mismatch — Preview not framed as a tile; plain empty state**
- **Saw:** the chart draws straight on the grey canvas (app-40); the blank editor shows only "Add a field to see data." (app-41) while the wells are live before a cube is chosen. Recheck N3 and F18, still open.
- **Recommend:** the prototype's tile frame and empty state ("Add at least one metric or dimension" / "Click fields on the left, or use the + buttons under Metrics and Dimensions"); before a cube is chosen, disable the wells with "Choose a cube or view first". **Design 01** uses the tile frame.

**UX-064 · minor · prototype-mismatch — Customize tab uses raw form controls, and offers settings a category axis can't use**
- **Saw (app-49, app-49b):** fieldsets with legends, native checkboxes, "auto" lower-case in selects, rotation as a select. For a bar chart the **X (category) axis** offers Minimum, Maximum and Logarithmic scale, which can't apply to categories.
- **Prototype (proto-47):** collapsible AXES / LEGEND / SERIES / VALUES sections, switches, segmented 0°/45°/90° and Top/Right/Bottom.
- **Recommend:** the prototype controls; show only title, label rotation and label count for a category axis.

**UX-065 · minor · consistency — The type's name doesn't match what is drawn**
- **Saw:** the card says "Bar" while three coloured series are drawn side by side — a grouped bar, which the gallery lists separately as "Grouped bar".
- **Recommend:** name the drawn form ("Bar, grouped by Status") so the name, the gallery and the drawing agree.

**UX-066 · polish · prototype-mismatch — Gallery cards have no type icons** (app-48 vs proto-46). Add the prototype's 28 px icons; they make the grid scannable.

**UX-067 · minor · usability — Actual size / Fit is styled as a primary button** (app-25: "Actual size" filled `accent`). Primary means "the main action"; a view toggle is a `.seg` (prototype editor.js 414).

### 2.2 Chart page

**UX-040 · critical · usability — "Edit chart" on a dashboard-local chart opens an editor that can't save**
- **Saw (app-30 → app-40):** `/explore/charts/seed-chart-status` (Used in: Company dashboard 01) offers a primary "✎ Edit chart". The editor opens with "Local to a dashboard" and, in place of Save, the sentence "This chart belongs to a dashboard; edit and save it there." Undo and Discard work, so the user can make changes and then has no way to keep them.
- **Why:** a dead end after work is the most frustrating failure a tool can have; the page itself invited the edit.
- **Recommend:** on a local chart's page, say where it lives and make that the action: "Lives on Company dashboard 01 · only there" and a primary **Edit on Company dashboard 01** (opens the dashboard in edit mode with this tile's editor, the path that can save), plus **Save to folders…** to make it shared. In the editor, if it is ever reached this way, offer the same two buttons in place of the sentence. **Design 06.**

**UX-041 · major · aesthetics — The KPI renders as body text**
- **Measured (app-31):** `.kpi__value` "240" at **14 px / 400**, `font-variant-numeric: normal`; the label "Order summary Count" also 14/400 beneath it.
- **Direction §3:** `text-kpi-solo` 40/52/600 with tabular figures (a single KPI), `text-kpi` 32/40 in a KPI row; the prototype's `.kpi-val` is 32/40/600 tnum with a 12 px comparison line.
- **Why:** KPIs are what business readers look at first; at body size the number doesn't read as the headline, and the tile looks broken.
- **Recommend:** KPI type per direction, value formatted by the member's format ($1.84M), label above in 14/600 like a tile title, centred in the tile when solo. **Designs 04, 06.**

**UX-042 · minor · prototype-mismatch — Details pane controls are raw** (app-30, app-31): a "Dashboard" label + native select + disabled "Add to dashboard", and a full-width "Delete chart" button in its own section. The prototype has "＋ Add to a dashboard…" opening a picker, an Updated row, and no destructive button at rest. **Recommend:** the prototype pane; Delete in an overflow menu with confirmation. **Design 06.**

### 2.3 Dashboard — view mode

**UX-020 · major · aesthetics — KPI tiles**: the same unstyled KPI as UX-041 wherever a KPI tile draws. **Design 04.**

**UX-021 · major · usability — The tile header is crowded and truncates titles**
- **Saw:** each chart tile head carries "● Live · as of 11:12:06 PM" (pill), a "Table view" text button, and on hover ↻ ✎ ⋯ (app-11). Once marked, "Marking: 1 marked" joins them and the title truncates to "Orders by category a…" in a 688 px tile (app-13); in edit mode it truncates unmarked (app-20). "Table view" duplicates the ⋯ menu's "View as table" (app-12). Recheck F8: partly fixed (the two pills merged), still open.
- **Prototype:** title, then one status-coloured cache badge ("✓ 3m"), hidden while the marking badge shows; actions appear on hover/focus; table view lives in the menu.
- **Why:** the title is the one thing a reader must see; timestamps to the second are noise on a dashboard.
- **Recommend:** title first and never truncated before badges; one compact freshness badge ("● Live" / "✓ Pre-agg · 3m") with the exact time in its tooltip; "Table view" only in ⋯; badges collapse into the menu when the head is narrow. **Design 04.**

**UX-022 · major · usability — A dense time series drawn as 240 bars of 1 with fractional ticks**
- **Saw (app-10b):** "Orders over time by status" draws one bar per day per status (240 hair-thin bars, all height 1) on a y-axis of 0, 0.2, 0.4 … 1 for a *count*.
- **Why:** the chart communicates nothing; fractional ticks on a count are wrong on their face.
- **Recommend:** (a) integer ticks for `count` / `count_distinct` measures (ECharts `minInterval: 1`); (b) when a time axis has more than ~60 buckets per series, the recommender prefers a line (direction §6's own example: "Time × 1 measure, 184 dense points → line") and bars are drawn only at coarser grains; (c) if the grain was the default rather than a choice, default to a grain that yields ≤ ~60 buckets over the data's range (week here). (c) changes a default — **proposal — needs the user's approval**. **Design 04.**

**UX-023 · minor · usability — Table view repeats the time column** (app-15b): "Orders Ordered at (day)" and "Orders Ordered at" with identical values. Drop the ungranular key when the granular one is present.

**UX-024 · major · aesthetics / accessibility — Every table except Explore's is unstyled**
- **Measured:** tile Table view `td` 14 px, padding 1 px, no rules; `th` centred, transparent; `font-variant-numeric: normal` (app-15b). The same in the editor preview (app-40b) and drawer (app-44), and in dark (dark-40).
- **Direction:** checklist 1 (tabular numerals in tables), §4 dense rows 24 px, cell padding 8 px; prototype `.grid-table`.
- **Recommend:** one DataGrid (direction §8) used everywhere: 12 px, sticky 28 px `bg-subtle` header at 600, 24 px rows with `border-subtle` rules, measures right-aligned in tabular figures and formatted by the model, dimensions left. **Designs 02, 04.**

**UX-025 · major · usability (AC-open) — Linked tile says "1 marked" but fades every bar** (app-13; recheck N3, still open, AC-097/AC-104 unticked). Until the marked-share query lands, draw a linked tile unfaded with its badge reading "Marking · share not shown yet", so badge and plot agree.

**UX-026 · minor · usability — The marking chip truncates with room to spare** (app-13): "Products Category: Compone…" in a chip that leaves ~870 px of the band empty. Let the summary grow to the band's free width; truncate only past that, full text in a tooltip.

**UX-027 · minor · prototype-mismatch — Header lacks the Markings button and a description line** (recheck F3, still open). Direction §7a puts the Markings panel behind a header button. **Design 04.**

**UX-028 · minor · aesthetics — Three nested frames in a tab group** (app-14): section band → white tab-group card → white Markdown tile. The prototype puts the tabs straight in the section band. Remove the middle card.

**UX-029 · minor · prototype-mismatch (AC-open) — The view-mode ⋯ menu still lacks Filter to marked, Filter out marked, View marked rows** (app-12; AC-113/AC-114 open). Show them disabled with "Coming with markings actions" until they land, so the menu's shape is stable.

### 2.4 Dashboard — edit mode

**UX-031 · minor · usability — Adding a Filter doesn't open it** (app-28, app-29): Add › Filter › List with search puts "List with search: choose a field…" in the band, but the sidebar stays on Add and nothing asks for the field. Select the new filter and open its configuration with focus in the field picker, as adding a tile selects it.

**UX-032 · minor · consistency — Edit-mode tile heads keep the freshness badge and "Table view"** (app-20), which compete with the grip and title while arranging. Hide both in edit mode; show the kind ("Chart · Bar") instead.

**UX-033 · polish · aesthetics — Properties' "Edit chart" is a full-width primary bar** (app-21) next to a full-width secondary "Save to folders…"; two full-width buttons in a 300 px sidebar read as a form footer. Prototype: the same, but the section rhythm is tighter (recheck mismatch 25). Low priority.

### 2.5 Dashboard settings

**UX-035 · major · prototype-mismatch / usability — The settings page is unfinished (recheck F26–F29 still open)**
- **Saw (app-26, app-27):** no "Dashboard settings" title; "← Back to Company dashboard 01" flush at x 0 and "Save settings" flush at x 1440 with no bar padding or rule; **Save settings is not primary**; content in a white card; the nav selection is grey; Markings uses native radios in Chrome blue (`accent-color: auto`) for colour slots and Default; the mode cards (Interactions) are one-line boxes with no explanation; Esc does nothing.
- **Why:** Save being secondary makes the page's outcome ambiguous; Chrome-blue radios are the one off-brand colour in the product; the Interactions choice is the most consequential setting on a dashboard and has no explanation of what each mode does.
- **Recommend:** the prototype's settings page: a 44 px title bar with Back, title, Cancel and primary Save; a 220 px nav with `accent-soft` selection and Active/Inactive tags; flat content; radio *cards* with a description and "what readers do" line for each mode; `mk-slot` colour buttons. **Design 05** (Interactions section).

### 2.6 Explore and search

**UX-010 · major · usability — Chart Type reads "Automatic" or "Incomplete"** (app-02, app-09b; recheck N1, still open). A reader scanning a folder learns nothing from "Automatic". Show the resolved type ("Bar, grouped"), "(auto)" as a muted suffix, and "Incomplete" only for charts that can't draw.

**UX-011 · minor · usability — "Move to…" is still an inline native select** (app-05; recheck N14 / F16, still open): the ⋯ becomes a 380 px select across the row, with flat folder names. Use a submenu or small dialog showing folder paths ("Shared / Operations / sss").

**UX-012 · minor · usability — 68 items in one unsortable list** (app-01): the Shared root lists 4 folders and 64 dashboards with no column sorting or type filter. Sortable Name / Type / Updated headers are direction §8's DataGrid ("sortable, filterable"); use the shared grid.

**UX-013 · minor · usability — The ⌘K palette ranks fields above dashboards** (app-16): for "order", one chart then seven measures and dimensions; the type sits in a text column with no icon. **Recommend:** group results by kind — Dashboards, Charts, then "Fields (n)" collapsed to 3 — with Explore's item chips; fields show their cube as the group, not in every detail line.

### 2.7 Model workspace — the user's third priority

The user sent the prototype's Model screen (`proto-50`, `proto-51`) and prefers it. The app (`app-50` … `app-57`) has the same three panes, tabs with counts, YAML with line numbers, the join diagram and a Problems panel, so the structure is right; the differences are in how the form reads and what it tells the engineer.

**UX-071 · critical · usability — New cube / New view from the Model overview opens an error**
- **Saw (app-56), reproduced twice:** on `/model`, "New cube" goes to `/model/files/cubes%2Fnew_cube_1.yml` and shows "✖ There is no model file cubes/new_cube_1.yml." From a file page the same button works (app-57).
- **Likely cause (code, not verified by test):** `ModelFilePage.tsx` keeps the new file in component state (`made`, ~line 868) and the overview → file navigation mounts a new page, which loses it.
- **Why:** the overview is where a semantic-layer engineer lands; the first "create" they try fails.
- **Recommend:** persist the draft before navigating (the drafts store already exists). A test that clicks New cube on `/model` and expects the form.

**UX-070 · major · prototype-mismatch — No upfront notice that the file has comments the form would drop**
- **Saw (app-51):** `orders.yml` has a four-line comment (YAML lines 19–22), and the form shows nothing about it. The app warns only at the moment of an edit ("This edit would drop the comment … Apply anyway / Keep the file", `LossWarning.tsx`).
- **Prototype (proto-50):** a `warnbar` under the tabs: "This file has 1 comment. Editing in the form rewrites the YAML and **drops them**; they stay intact while you edit in Code. [Edit in form anyway]".
- **Direction §7b:** "switching to the form when the file has comments, Jinja blocks or YAML anchors shows a warning that names exactly what the form can't represent."
- **Why:** the engineer should know *before* choosing where to edit; discovering it mid-edit forces a decision under pressure.
- **Recommend:** both: the upfront banner on opening the file (naming the comment by its first line and its lines, with "Edit in form anyway" and "Show in YAML" that scrolls the code to them), and keep the just-in-time guard. **Design 03.**

**UX-072 · major · prototype-mismatch — Member rows are boxed, with Remove beside every row and no SQL line**
- **Saw (app-52, app-54):** each member is a bordered box with ▸, name, badges, type, SQL right-aligned in mono on the same line, and a "Remove" button outside the box on every row.
- **Prototype (proto-51):** 34 px rows separated by rules: ▸/▾, name 600 with PK/format badges, type on the right, the SQL in mono *under* the name; expanding opens the full field set in place on `bg-subtle`; "+ dimension · 4 total" in a bar at the end.
- **Why:** a Remove on every row is visual noise and an accidental-deletion risk; the SQL under the name is what an engineer scans for.
- **Recommend:** the prototype rows; Remove moves into the expanded body (with Undo via the file's Discard). **Design 03.**

**UX-073 · major · usability — The General form is flat and unguided**
- **Saw (app-51):** Name, then **SQL table as a 3-line textarea**, SQL, Extends, Data source, SQL alias, Title, Description, **Public as a select "(not set)"**, Meta, Calendar select, a Refresh key fieldset … all equally prominent, no help text.
- **Prototype (proto-50):** BASICS (Name*, SQL table / SQL "set exactly one", Data source "passed to driverFactory()", Title, Description, Public as a switch showing its default) and a collapsible ADVANCED (Extends, SQL alias, calendar cube, refresh key), each with a one-line help from the schema.
- **Why:** the engineer's common edits are 4 fields; the rare ones shouldn't have equal weight. Help lines stop round-trips to Cube's docs.
- **Recommend:** the prototype's grouping, `sql_table` as a single-line mono input with a "SQL table | SQL" segmented choice (Cube accepts exactly one), switches for booleans showing Cube's default ("Public · default on"), help text from `docs/research/cube/data-modeling.md`. Shown in Design 03's side note.

**UX-074 · minor · usability — The tab strip clips "Access policy"** (measured: tabs run to x 1030 in a 666 px strip ending at x 923; "Access policy 0" is off-screen with no scroll affordance). Use the prototype's short labels ("Pre-aggs", "Access") and muted zero counts. **Design 03.**

**UX-075 · minor · prototype-mismatch — File tree** (app-51): "cubes/" and "views/" without ▾ or the `model/` root; New cube / New view as bordered buttons at the top; the selected file drawn as a 2 px accent-ringed box. **Recommend:** the prototype's `.dir` / `.file` rows (28 px, full-width `accent-soft` selection) and the model's draft state in the pane head. **Design 03.**

**UX-076 · minor · aesthetics — The file path is a 20 px title** (measured 20/600 IBM Plex Mono) in a 48 px header; prototype 13/600 mono in a 44 px editor head. When clean, nothing says the file is published. **Recommend:** 13/600 path, "✓ Published" or "◷ Unpublished changes", Discard, primary Save & reload Cube. (The prototype's History button is out of phase 1 and its "main · dev mode" badge is Cube Cloud's; neither is recommended.) **Design 03.**

**UX-077 · minor · aesthetics — The form is a card inside the pane** (app-51): a white card inset 16 px on grey, costing 32 px of the narrowest pane. Flat, as the prototype.

**UX-078 · polish — YAML long lines run past the pane** (app-51: line 4 and the comment lines 19–22 cut at the edge). Offer soft wrap, on by default for comments.

**UX-079 · polish · usability — The overview is a stack of cards** (app-50) with underlined mono links. For more than a handful of files a table (file · kind · object · measures · dimensions · joins · pre-aggs · problems) scans faster; or open the first file directly as the prototype does.

### 2.8 Jobs

**UX-080 · minor · usability — One row, two outcomes** (app-61 → app-61b): clicking the pre-aggregation *name* (the only link-styled text) leaves Jobs for Model, on the General tab rather than the pre-aggregation; clicking elsewhere selects the row. **Recommend:** row click selects; "Open in Model" in the detail pane deep-links to the Pre-aggs tab with the member expanded; names in mono without underline.

**UX-081 · minor · aesthetics — Detail pane floats** (app-61b): a white card inset on grey with 40 px "Build now" beside an underlined link, versus the prototype's docked 400 px pane with a pane head. Dock it; buttons 24 px `btn sm`.

**UX-082 · minor · usability — Queries tab dates** (app-61c): "9/24/2026, 11:16:00 PM" on every row and a centred caption. Group by day or use "Today 23:16:00"; left-align the caption; member ids in mono.

### 2.9 Security, Data sources, Schedules

**UX-085 · minor · aesthetics — Security's preview pane floats and its group chips show no pressed state** (app-63): the JSON `{}` corresponds to "No groups" but no chip reads as selected; "Find a dashboard" at the bottom has no stated purpose. Dock the pane; press the chip that matches the JSON; label the last field "Preview a dashboard as this context".

**UX-001 · minor · usability — Two workspaces are placeholders** (app-60, app-62): Data sources and Schedules are one paragraph each (AC-233). Schedules gets Cube-owned schedules with AC-154 (T160); **Design 07** proposes its layout. For Data sources, a read-only list of the `data_source` names the model uses and the cubes on each would make the page useful without managing connections — **proposal — needs the user's approval**.

### 2.10 Dark theme

**UX-090 · minor · aesthetics — Dark is authored and complete** (dark-01 … dark-61): surfaces, borders, accent and chart palette switch correctly. The unstyled tables (UX-024) and raw form controls (UX-058, UX-064) look worse in dark because native controls keep their own chrome. No dark-only defects found.

### 2.11 Narrow window (390 × 844)

**UX-091 · major · usability — Dashboards don't stack** (narrow-10; recheck N2, still open): tiles stay side by side at ~160 px, titles vanish, legends paginate ("ship 1/3"). Direction §2: below 1024, view only, one column, filter bar as a sheet.

**UX-092 · minor — The shell and Explore overflow** (narrow-01; recheck N16, still open): the nav clips, search and avatar are off-screen, the tree keeps 260 of 390 px. Needs the user's decision on a narrow shell (as the recheck said).

**UX-093 · minor · usability — The chart editor squeezes three panes into 390 px** (narrow-40, document 845 px wide). Below 1024 px, show "The chart editor needs a window at least 1024 px wide" with Back, consistent with "view mode only".

### 2.12 Accessibility (cross-cutting)

**UX-095 · major · accessibility — Selected state missing on the drawer's tabs** (app-44): four identical bordered buttons; only `aria-selected` differs. Sighted users can't tell which view is showing (the same defect the recheck found for tab groups). Fixed by the `.tabs` style in Design 02.

**UX-096 · minor · accessibility — Native selects under the 12 px floor in WebKit**: the wells' "+ Add to …" selects and filter pill selects are native (11 px in WebKit, direction §3). The custom picker in Design 01 removes the largest group of them.

---

## 3. Screenshot index

| File | Shows |
|---|---|
| app-01-explore-root | Explore › Shared root, 68 items, unsortable |
| app-02-explore-finance | Finance folder; charts typed "Incomplete" |
| app-03-explore-new-menu | ＋ New menu |
| app-04-explore-row-menu | Row ⋯ menu |
| app-05-explore-move-to | Move to… as an inline native select |
| app-06-explore-row-hover | Row hover (34 px, `bg-hover`) |
| app-07-explore-search / app-08-explore-search-empty | In-page search, results and no results |
| app-09-explore-empty-folder | Empty folder row inside the table |
| app-09b-explore-my-workspace | My workspace; charts typed "Automatic" |
| app-10-dashboard-view / app-10b-dashboard-view-full | Company dashboard 01, view mode; 240-bar time chart |
| app-11-dashboard-tile-hover | Tile head with badge, Table view, ↻ ✎ ⋯ |
| app-12-dashboard-tile-menu | View-mode ⋯ menu |
| app-13-dashboard-marked | Marked: chip, badge, truncated title, fully faded linked tile |
| app-14-dashboard-appendix | Appendix: header, section, tab group (three frames) |
| app-15-palette-open / app-16-palette-results | ⌘K palette, empty and "order" |
| app-15b-dashboard-tile-table | Tile Table view: unstyled, duplicate time column |
| app-20-dashboard-edit | Edit mode, Add tab |
| app-21-dashboard-edit-selected | Tile selected, Properties |
| app-22-dashboard-edit-tile-menu | Edit-mode ⋯ menu with Move to |
| app-23-dashboard-edit-outline / app-24-dashboard-edit-add | Outline and Add tabs |
| app-25 … app-25e | Chart editor from a tile (Actual size / Fit, second metric, back, discard) |
| app-26-dashboard-settings / app-27-dashboard-settings-markings | Settings: General, Markings |
| app-28-dashboard-add-filter / app-29-dashboard-filter-popover | Adding a list filter in edit mode |
| app-30-chart-page | Local chart's page with "Edit chart" |
| app-31-chart-page-library | Library KPI chart page, KPI at 14 px |
| app-40-editor-status | Editor for a local chart: no Save |
| app-40b-editor-tableview | Preview Table view, unstyled |
| app-40d / app-40e / app-40f | Second metric added: queried, not drawn; Back to recommended |
| app-41-editor-empty | Blank editor |
| app-42-editor-inspector-bottom | Recommendation, Why, Sort at the bottom of Data |
| app-43-editor-why | "Why this chart?" rule dump |
| app-44 … app-47 | Drawer: Result rows, Underlying rows, Query, Acceleration |
| app-48-editor-gallery | Chart type gallery |
| app-49 / app-49b | Customize tab |
| app-50-model | Model overview |
| app-51-model-orders | orders.yml General tab (file has comments, no banner) |
| app-52-model-dimensions / app-54-model-measures | Member rows |
| app-55-model-diagram | Join diagram |
| app-56-model-new-cube | New cube from the overview: error |
| app-57-model-new-cube-from-file | New cube from a file page: works |
| app-60-sources, app-62-schedules | Placeholder pages |
| app-61-jobs / app-61b-jobs-detail / app-61c-jobs-queries | Jobs |
| app-63-security | Security |
| dark-01, dark-10, dark-40, dark-50, dark-61 | Dark theme: Explore, dashboard, editor with drawer, Model, Jobs |
| narrow-01, narrow-10, narrow-30, narrow-40 | 390 × 844: Explore, dashboard, chart page, editor |
| proto-01-home, proto-10, proto-20, proto-21 | Prototype Explore, dashboard view, edit, selected |
| proto-30-chart-page | Prototype chart page |
| proto-40 … proto-47 | Prototype editor: default, metric picker, manual type + Recommended card, Why, drawer rows, query, gallery, Customize |
| proto-50, proto-51, proto-52 | Prototype Model: General with comment banner, Dimensions rows, join diagram |
| proto-6x-sources, -jobs, -schedules, -security | Prototype admin screens |

## 4. Designs

See `designs/index.md`. Seven mockups: 01 chart editor inspector, 02 results drawer, 03 Model workspace, 04 dashboard view, 05 dashboard settings, 06 chart page, 07 Schedules.
