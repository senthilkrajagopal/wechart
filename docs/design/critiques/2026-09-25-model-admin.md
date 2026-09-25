# Model and admin workspaces re-critique (2026-09-25)

Produced for T225 (AC-187) by a critique agent that measured with Playwright, and saved verbatim. It re-checks `2026-09-24-model.md` and `2026-09-24-admin.md` after T233–T241 and later tasks, and measures the Model and admin surfaces against the prototype.

## What was compared

- **App:** the production build of this branch at http://localhost:5600: `/model`, `/model/files/<path>` (orders, monthly_orders, secured_orders, product_catalog), the Join diagram, the Generate cubes dialog, `/jobs` (both tabs, with a row selected), `/schedules`, `/data-sources`, `/sources` and `/security`.
- **Prototype:** http://127.0.0.1:5500/index.html, views `#model`, `#jobs` (including Run history), `#schedules`, `#sources` and `#security`.
- **Sizes and themes:** 1440×900 in light and dark, plus 1280×800 in light.
- **Method:** Playwright (Chrome) scripts that read `getComputedStyle` and `getBoundingClientRect` from matching elements in both builds, plus screenshots I looked at. Scripts and PNGs are in `/private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/critique-admin/`.
- **Differences not counted:** values that direction.md §5 or §7d replaces. These are `text-muted` #6e6c67 / #97958e against the prototype's #76746f / #8e8c86, dark `text-on-accent` #1f1f1e against #0f1d22, the status hues, and 6 px button radius.
- **Nothing shared was changed:**
  - Save, Publish, Build, Generate and Discard were never pressed on the server.
  - Two Model states (unpublished changes, a parse error) were reached with a local, unsaved draft in a throwaway browser context. Drafts live in `sessionStorage`, and the run sent no request other than GET.
  - The Generate cubes dialog was opened, a schema was chosen to list its tables (a read), and the dialog was closed with Esc.
  - A Security preset, the dashboard search and one dashboard preview were used; all three only read.
- **Not reachable without changing shared state:** a started build's in-row progress (admin 3), error states (admin 23, checked from source), and History (it needs a spec decision).

## Summary

- **Earlier findings:** 35 re-checked (12 Model, 23 admin; admin 24–27 remain deferred by scope).
  - 16 fixed, 8 partly fixed, 10 still open, 1 not re-verified.
- **New findings:** 19 (1 major, 18 minor). By class: 6 are (a), 1 is (c) and 12 are (d); none is (b). A possible (b) against AC-228 is recorded under admin 1.
  - 11 lie in the Model workspace (N1–N4, N7–N10, N12–N14).
- **AC-187 table:** 29 component/property rows, 13 do not conform.
  - The app bar and workspace navigation conform in both themes on all five surfaces.
  - Every mismatch is a button or an input.
- **Already matching:**
  - The member-form tabs: 36 px, 12/600, 0×10.
  - Jobs' tabs.
  - The `.btn-sm` and `.btn-sm.btn-primary` buttons.
  - Page titles: 20/26/600 on all five pages.
  - Admin tables as cards: header band, 34 px rows, 12 px cells, tabular numerals.
  - The code face: IBM Plex Mono is served.

## 2. Earlier findings

### Model (2026-09-24-model.md), all in the Model workspace (owned by the other session)

| # | Status | Measured evidence |
|---|---|---|
| F1 No file tree | **FIXED** | `nav.model-tree` sits at [0,48,240,852]. A mouse click on `products.yml` opened it in place (the tree kept focus, no page change). New cube and New view are present. A file with errors shows a "problems" tag with an icon. Layout differences: N7, N8. |
| F2 Padded page, not panes | **PARTLY FIXED** | **Fixed:** the document is 900 px high at 1440×900, the panes are full height, and each has its own 48 px head. **Still open:** the form is an inset card inside the pane (`.model-editor__form` padding 16; `.model-form` 1 px border, 6 px radius, tabs at y=113 against the prototype's 92). The code pane has padding 8, and its CodeMirror has a 1 px `border-strong` border with a 4 px radius; the prototype is flush with no border. `.model-editor__head` is 48 px with 8/16 padding against `.editor-head`'s 44 px with 6/12. The path is `.workspace-title` at 20 px mono against the prototype's 12 px mono 600 (T238 applied AC-231 here; it needs a decision). |
| F3 Free-text references | **FIXED** | Pre-aggregation measures and dimensions are toggle chips (count and total_amount pressed). Segments and Rollups say "Nothing to pick in the model". The time dimension is a select. The join target is a "Target cube" select. A view's Includes and Excludes are chips with "All (*)". |
| F4 Member rows | **PARTLY FIXED** | **Fixed:** the `id` row shows a PK badge, the type `number`, and its SQL `id`. Expanded, it has named groups (Basics, Formatting, Sub-query, Links, Multi-stage, More) and no CASE, switch or geo fields. **Still open:** each row is a bordered card (1 px #e3e2de, 6 px radius, 6/8 padding) with a 20 px summary and the SQL right-aligned on the same line. The prototype's `.mrow-head` is at least 34 px, padded 4/12, with the SQL on a second line and a hover fill. The expanded body has no `bg-subtle` and no 4/12/12/40 inset. Groups can't be collapsed. There is no "Defined by" control. Remove sits outside the row at x=848 in `text-primary`; the prototype puts it inside in `--err`. A pre-aggregation with no type set (so a rollup) lists Rollups, Union with source data, Stream offset, Output column types and Unique key columns. The prototype's `schema.js` shows `rollups` only for rollup_join and rollup_lambda, and `union_with_source_data` only for rollup_lambda. |
| F5 No draft state | **FIXED** | After an edit, the head reads "Unpublished changes · Discard · Save & reload Cube" (Discard is a 24 px `.btn-sm`), and the tree row reads "unpublished". History is still absent, pending a spec decision. |
| F6 Problems panel | **PARTLY FIXED** | **Fixed:** the count reads "Problems · 0 errors · 0 warnings", and `.model-problems__where` is 12 px (it was 11). **Still open:** the panel is an inset card (margin 0 8 8, 1 px border, 4 px radius) whose height follows its content: 66 px empty, 124 px with one error, 150 at most. So the YAML changes height as problems come and go. The prototype's `.problems` is flush and fixed at 150 px, and names its validator. |
| F7 No enum validation | **FIXED** | `type: summ` gives "Measure total_amount: type "summ" is not one Cube accepts (…)" at `cubes/orders.yml:36`. |
| F8 Parse-error veil shifts the form | **PARTLY FIXED** | **Fixed:** the tree marks the file. **Still open:** `.model-editor__veil` renders at y=112, above the tabs, and pushes them from y=113 to y=169 (a 56 px shift). The error line has no tint (the `.cm-line` background is transparent; the prototype uses `rgba(208,59,59,.12)`). See also N12. |
| F9 General tab | **STILL OPEN** | There are no Basics or Advanced groups. Public, Calendar and Immutable are "(not set)/true/false" selects, not switches. SQL table is a 54 px textarea against the prototype's 28 px `input.sm`. There are no hints. Name is 32 px next to 28 px selects (cause: N1). |
| F10 Type tokens | **PARTLY FIXED** | **Fixed:** IBM Plex Mono is served (faces loaded: 400, 600 and 400 italic), and headings are weight 600. **Still open:** the YAML is 12 px with a 16.8 px line height; the prototype's is 12.5/19. |
| F11 Empty tabs | **STILL OPEN** | Segments 0 shows only "+ segment": no sentence and no "n total". |
| F12 Edge labels have no plate | **FIXED** | `.join-editor__relationship` uses `paint-order: stroke`, a 4 px stroke in `bg-page`, so edges don't cross the text (screenshot `app-join-light.png`). |

### Admin (2026-09-24-admin.md)

| # | Status | Measured evidence |
|---|---|---|
| 1 No job detail pane | **PARTLY FIXED** | **Fixed:** selecting a row fills a 400 px pane with State, Trigger, Type, Partition granularity, Build now and Open in Model. **Still open:** the pane floats inside the page padding at [1024,139,400,745]; the prototype's is [1040,48,400,852]. It has 12/16 padding and no 44 px `.pane-head`; the title is 14 px mono inside the body. **Possibly (b) AC-228** ("pane is not full height"): it fills 745 of the 852 px below the app bar and stops 16 px short of the bottom. |
| 2 Checklist 22 columns | **FIXED** | Columns are Pre-aggregation, Status (icon and label), Trigger and Partition granularity, and the name links to Model. The history columns are left out until AC-150 returns, as the earlier finding advised. |
| 3 Build progress away from the row | **NOT RE-VERIFIED** | Checking it needs a build. |
| 4 "Partitions" held a granularity | **FIXED** | The header now reads "Partition granularity". |
| 5 Query log had no filters, sort, sticky header or paging | **FIXED** | Outcome, Source and Time range filters; sort on When and Duration. After scrolling 220 px the header row sits at y=48. It shows 25 rows, "1–25 of 607". See N6 and N19. |
| 6 Caption | **STILL OPEN** | The `<caption>` is centred (`-webkit-center`), 14 px, `text-primary` #1f1f1e, above the header. The prototype uses a 12 px muted note below the table. |
| 7 Outcome icon sits high | **STILL OPEN** | `.status` has `align-items: flex-start`. The icon's centre is at y=234.5, the label's at 237, and the cell's at 238. |
| 8 Health shown as bare text | **STILL OPEN** | `.jobs-health .status` has a transparent background, 0 padding, 0 radius and weight 600. The prototype's `.badge` is 22 px high, padded 0 8, radius 999 px, on `bg-subtle` #f0efec, weight 400. |
| 9 Browser-default h1 | **FIXED** | The h1 is 20/26/600 on Jobs, Security, Schedules and Data sources, with no difference from `.admin-main h1`. |
| 10 Page padding | **STILL OPEN** | `main` padding is 16 on all sides against 16/24; the title sits at x=16 against x=24. |
| 11 Admin tables | **FIXED** | Card with 1 px #e3e2de border and 6 px radius, header band in `bg-subtle`, 34 px rows, 12 px cells, `tabular-nums`. The `th` is 29 px against 28. |
| 12 Context preview as a floating card | **PARTLY FIXED** | **Fixed:** it is sticky, with a left rule and no radius. **Still open:** it sits at [1104,64,320,820] against [1040,48,400,852]: 320 px wide (`.security-layout` is `1fr 320px`) and inset 16 px from the app bar and edges. The h2 sits in the body rather than a 44 px pane-head. |
| 13 Effective access and presets missing | **FIXED** | Presets: No groups, managers, sales, auditors, finance. "What this context can read" lists every cube and view with a verdict and a reason. |
| 14 Raw dashboard links | **FIXED** | 8 results in accent #1f6f86. No match reads "No dashboard matches “zzzzqq”." |
| 15 No route to Model | **PARTLY FIXED** | **Fixed:** Source cells link to `/model/files/views%2Fsecured_orders.yml`. **Still open:** there is no "Edit policies in Model" header button. |
| 16 Phase-2 note is a plain paragraph | **STILL OPEN** | `p.security-workspace__note` is 14 px `text-secondary`, with no background, border or icon. The prototype's `.warnbar` is 12 px on `accent-soft`, with a 1 px border, 6 px radius and an icon. |
| 17 No-policy cubes shown as a warning | **STILL OPEN** | `[data-testid=policies-open]` is a 14 px line with a warning icon, outside the table. The prototype puts it in a table row as neutral `td.sec`. |
| 18 Context lost after a preview | **FIXED** | The "finance" context survived Security → Jobs → Security. |
| 19 Preview banner text colour | **STILL OPEN** | `.preview-banner` text is rgb(31,31,30) against `.viewas` `crossfilter` rgb(122,63,176). Its left padding is 16 against 24. |
| 20 Schedules blank | **FIXED** | Title, info bar, and a table (Pre-aggregation, When, Owner "Cube's refresh worker", Edit in Model). |
| 21 Data sources blank | **FIXED** | Title and info bar saying connections are managed outside this phase. |
| 22 `/sources` not found | **FIXED** | It redirects to `/data-sources`, with Data sources marked current. |
| 23 Error states lack Retry and Details | **STILL OPEN** (from source) | Each is `StateLine kind="err"` with the message only: `JobsPage.tsx:37`, `BuildPanel.tsx:141,229,306`, `SchedulesPage.tsx:60`, `SecurityPage.tsx:61`, `Scopes.tsx:19`. Breaks rule 18. |
| 24–27 | Deferred by scope, unchanged | Run history and Queue, partitions and duration chart, "All data sources", Schedules and Data sources content. |

## 3. New findings

**N1. Model form text inputs are 32 px, not the 28 px compact control.** Major, **(a)** inputs: height. Model workspace (owned by the other session).
- **App:** in the General tab, Name, Extends, Data source, SQL alias, Title and Description are 32 px while the selects beside them are 28 px. The same holds in an expanded dimension (Name 32, Type 28), in the join form (Condition 32, selects 28), for the index-add field (32) and for pre-aggregation Granularity (32).
- **Textareas:** the line height is 20 against `textarea.input`'s 18, so a 2-row textarea is 54 px against 50.
- **Prototype:** `.input.sm` is 28 px.
- **Cause:** `.model-field input:not([type='checkbox']):not([type='radio'])` (styles.ts:846, specificity 0,3,1) loses to the global `input:not(…×4)` rule (styles.ts:116, 0,4,1). The same happens to `.join-editor__add input` (styles.ts:661) and `.ordered-references__add input`.

**N2. The YAML / Join diagram toggle's pressed side isn't the `accent-soft` token.** Minor, **(a)** buttons: colour token. Model workspace (owned by the other session).
- `.seg button[aria-pressed=true]` uses `color-mix(accent 12%, surface)`: rgb(228,238,240) in light and rgb(34,46,49) in dark.
- The prototype uses `--accent-soft`: #e3f0f4 in light and #173640 in dark. The token `--wc-bg-accent-soft` exists (styles.ts:602).

**N3. Member picker chips and a member's Remove aren't drawn as the prototype's buttons.** Minor, **(a)** buttons: radius and colour. Model workspace (owned by the other session).
- `.model-picker__chip` has a 4 px radius and, unpressed, a #e3e2de border. The prototype renders these as `.btn.sm.mono`: 6 px radius, #c9c7c1 border.
- Remove is `text-primary`; the prototype's is `color: var(--err)`.

**N4. The Generate cubes dialog uses browser-default type and the wrong button radius.** Minor, **(a)** buttons: radius; **(d)** direction §3 weights. Model workspace (owned by the other session). The `.dialog button` rule (styles.ts:3733) is shared by every dialog.
- **Buttons:** "Generate n cubes" and "Close" have a 4 px radius against `.btn`'s 6. "Columns" is a 32 px button inside each table row, so rows are 41 px; the prototype's in-row action is a 24 px `.btn.sm`. No action is primary.
- **Type:** the h2 is 21 px at weight 700 with a 20 px line height. The `th` is weight 700 with no header band.

**N5. The Jobs pane's actions are the wrong size and kind.** Minor, **(a)** buttons. Jobs.
- "Build now" is a full-size `.btn-primary`: 32 px, padded 0 12, 14 px. The prototype's pane action (`.btn.primary.sm`) is 24 px, padded 0 8, 12 px.
- "Open in Model" is a 14 px underlined accent link; the prototype has a 24 px bordered `.btn.sm`.

**N6. Admin inputs are off the prototype's sizes.** Minor, **(a)** inputs: height. Jobs and Security.
- The query-log filters use `.select-sm` at 24 px (styles.ts:2478, sized for table tiles). The prototype's `select.select.sm` is 28 px.
- The Security context textarea has a 20 px line height against 18, so it is 134 px against 122 for 6 rows.

**N7. Tree folder rows aren't tree rows.** Minor, **(c)** rule 17. Model workspace (owned by the other session).
- `.model-tree__dir` is 16 px high, mono, weight 400. The prototype's `.dir` is 28 px, Inter 12/600, with a caret.
- File rows are inset (x=8, radius 4, 8 px text indent). The prototype's are flush (x=0, radius 0) with a 24 px indent.

**N8. The tree head doesn't line up with the other panes' heads.** Minor, **(d)**. Model workspace (owned by the other session).
- `.model-tree__head` is 97 px high ("Files" plus three buttons wrapped over two rows), so its rule sits at y=145 while the form and code heads' rules sit at y=96.
- The prototype's 44 px `.pane-head` carries "Model" and a branch badge, and puts New cube and New view under the files.

**N9. Tags break a file name mid-word.** Minor, **(d)**. Model workspace (owned by the other session). With "unpublished" and "problems" shown, `orders.yml` wraps as "order / s.yml" (`app-draft-parse-light.png`).

**N10. A focus ring appears without keyboard use.** Minor, **(d)**. Model workspace (owned by the other session). The current file shows the 2 px accent focus ring (`:focus-visible` is true) on a direct load and after clicking "Open in Model" in Jobs. After a mouse click in the tree it doesn't.

**N11. Jobs' links into Model reload the page and land on General.** Minor, **(d)**. Jobs (`BuildPanel.tsx`).
- The row name and "Open in Model" both go to `/model/files/cubes%2Fmonthly_orders.yml`. That is a full document load (a window marker was lost), and it opens the General tab.
- Schedules' link carries `?cube=monthly_orders&tab=pre_aggregations`.

**N12. One typo floods Problems.** Minor, **(d)**. Model workspace (owned by the other session). A single `[` after `cubes:` gives "Problems · 54 errors", two messages for every following line. The prototype lists one.

**N13. A select sits far below its label.** Minor, **(d)**. Model workspace (owned by the other session). In an expanded pre-aggregation, "Partition granularity" stretches to its tall Refresh key neighbour: the label is at y=676 and the select at y=822.

**N14. Form tabs overflow with no sign of it.** Minor, **(d)**. Model workspace (owned by the other session).
- At 1440 the strip is 781 px wide in a 666 px box, and "Access policy" (x 918–1030) lies past the edge at 923.
- At 1280 the strip is 781 in 573, and "Pre-aggregations" is cut mid-word.
- The prototype shortens its labels ("Pre-aggs", "Access").

**N15. Inter isn't served.** Minor, **(d)**: AC-187 doesn't list the font family, and direction §3 allows the fallback. Shell.
- In the app, `document.fonts` loads only IBM Plex Mono, so UI text falls back to system-ui. A 14 px test string measures 350.5 px in the app against 358.0 px in the prototype's Inter, which comes from Google Fonts.
- Consequence: workspace tabs are about 1.5 px narrower each.

**N16. Admin rows have no hover fill.** Minor, **(d)**.
- Jobs, Security and Schedules rows stay transparent on hover. The prototype's `.grid-table tbody tr:hover td` turns #e9e8e4.
- Jobs rows are clickable (`cursor: pointer`) yet show nothing on hover.

**N17. Info bars don't match the prototype's `.warnbar`.** Minor, **(d)**. Schedules and Data sources (`.info-bar`, styles.ts:1280).
- They are 14 px text, `max-width: 720px`, with a clock icon.
- The prototype's `.warnbar` is 12 px, full width (992 px), and uses the info "i" icon on Data sources.

**N18. Identifiers and figures are set differently from the prototype.** Minor, **(d)**. Jobs, Security and Schedules.
- Pre-aggregation ids, cubes and groups are in Inter; the prototype sets them in `mono`.
- Jobs' Duration is left-aligned; the prototype's `td.num` is right-aligned.

**N19. The query log scrolls the whole page.** Minor, **(d)**: AC-230 is met, since the header stays at y=48. Jobs.
- The document is 1,120 px high at 1440×900, so the title, health line and tabs scroll away.
- The prototype scrolls `.admin-main` (`overflow: auto`) inside a fixed frame.

## 4. AC-187 conformance on these surfaces (1440×900, light and dark)

| Component | Property | App | Prototype | Conforms |
|---|---|---|---|---|
| App bar | height / padding | 48 / 0 12 | 48 / 0 12 | yes |
| App bar | border, background | 1 px border-subtle, bg-surface | same | yes |
| Brand mark | size, radius, type | 22×22, r5, 12/600 | same | yes (dark ink per §5) |
| Search | size, padding, radius, border, fill, type | 260×32, 0 10, r6, 1 px subtle, bg-subtle, 13 px | same | yes (muted per §5) |
| Search kbd | type, radius, border | 12/600, r4, 1 px strong | same | yes |
| Theme button | size, radius, border | 32×32, r6, transparent | same | yes |
| Avatar | size, type, colours | 28, 12/600, role-dim on role-dim-soft | same | yes |
| Workspace nav, current | height, padding, underline, type | 47, 0 12, 2 px accent, 14/600 primary | same | yes |
| Workspace nav, other | padding, type, colour | 0 12, 14/400, text-secondary | same | yes |
| `.btn-sm` (New cube, New view, Generate cubes, Build, Discard, presets, pager) | height, padding, radius, border, type | 24, 0 8, r6, 1 px strong, 12/400 | `.btn.sm` same | yes |
| Save & reload Cube | height, padding, radius, fill, type | 24, 0 8, r6, accent, 12/600 | `.btn.sm.primary` same | yes |
| Jobs pane "Build now" | height / padding / font size | 32 / 0 12 / 14 | 24 / 0 8 / 12 | **no** |
| Jobs pane "Open in Model" | border, radius, height, size, colour | none, 0, 20, 14, accent underlined | 1 px strong, r6, 24, 12, text-primary | **no** |
| Seg (YAML / Join diagram) pressed | background token | rgb(228,238,240) / rgb(34,46,49) | #e3f0f4 / #173640 | **no** |
| Seg | height, padding, type | 28, 0 10, 12 | same | yes |
| Member picker chip | radius / border colour (unpressed) | 4 / #e3e2de | 6 / #c9c7c1 | **no** |
| Member Remove | colour | #1f1f1e | `--err` #c2362f | **no** |
| Generate cubes dialog buttons | radius | 4 | 6 | **no** |
| Generate cubes "Columns" (in-row) | height / radius | 32 / 4 | 24 / 6 | **no** |
| Model form text input | height | 32 | 28 (`.input.sm`) | **no** |
| Model form select | height, size, radius, border | 28, 12, r4, 1 px strong | same | yes |
| Model form textarea | height (line height) | 54 (20) | 50 (18) | **no** |
| Join add-form Condition input | height | 32 | 28 | **no** |
| Index add input | height | 32 | 28 | **no** |
| Query-log filter select | height | 24 | 28 (`.select.sm`) | **no** |
| Security context textarea | height (line height) | 134 (20) | 122 (18) | **no** |
| Security "Find a dashboard" input | height, size, radius, border | 32, 14, r4, 1 px strong | `.input` same | yes |
| Generate cubes selects and search | height, size, radius, border | 32, 14, r4, 1 px strong | `.select` / `.input` same | yes |
| Model form select and label | label 12/600 secondary | same | same | yes |

**AC-187 therefore still fails** on buttons (6 rows) and inputs (7 rows) on these surfaces.

**Files:**
- `packages/web/src/shell/styles.ts` (lines 116, 602, 661, 846, 1280, 1365–1478, 2478, 3733)
- `packages/web/src/workspaces/model/{FileTree,ModelFilePage,GenerateCubes,ProblemsPanel}.tsx`
- `packages/web/src/workspaces/model/form/{CubeForm,ObjectForm,MemberPicker}.tsx`
- `packages/web/src/workspaces/jobs/{BuildPanel,QueryLog,JobsPage,Health}.tsx`
- `packages/web/src/workspaces/security/{SecurityPage,ContextPreview}.tsx`
- `packages/web/src/workspaces/{admin/DeferredPage,schedules/SchedulesPage}.tsx`
- `docs/design/prototype/{index.html,model.js,schema.js,admin-ops.js,admin-sources.js}`
