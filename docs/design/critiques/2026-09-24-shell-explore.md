# Critique: app shell and Explore workspace against the design prototype (2026-09-24)

Produced by the `design-critic` agent and saved verbatim. The user asked for the
prototype-alignment pass after comparing the running Explore with the prototype
themselves.

**What was compared**
- **App:** http://localhost:5400/explore, a production build with the real API.
- **Prototype:** http://127.0.0.1:5500/index.html#explore (source in `docs/design/prototype/`).

**How:** both at 1440×900, light and dark. Values come from `getComputedStyle` and `getBoundingClientRect` on the matching element in each. Sample content (Northwind vs "Company dashboard NN") is not compared.

**Test data I created:** one folder in the app, "Critique empty 0924", under Operations / sss / hello, to see the empty state. Nothing was deleted.

## 1. Summary

1. **The Explore page has no folder header.** The prototype's centre column is breadcrumb, then folder title with Rename, then search box and "+ New ▾", then table, then footnote. The app has none of the breadcrumb, title, Rename, search box, "+ New" menu or footnote. Its only header is three plain buttons ("New folder", "New dashboard", "New chart") above the table. Nothing on screen names the folder you are in.
2. **The table has a different grammar.** The prototype table is Name (icon, title, description line), Type (chart type), Built on, Updated (short date), Owner. It is 12 px text in 34 px rows with no actions column. The app table is Name, Type ("Dashboard"/"Chart" only), Owner, Last updated (full locale timestamp with seconds), Actions. The Actions column puts a full-size Rename button and a "Move to…" select on every row. Text is 14 px and rows are 49 px. The actions column is the most prominent thing on the screen.
3. **The folder tree is a floating card, not a docked pane.** It has no "Folders" header, no "+ Folder", no item counts, no folder icons and no "My workspace". The root is a generic "All folders". It is 240 px wide and inset 16 px; the prototype pane is 260 px and runs full height with a rule on its right.
4. **The top bar is missing the search trigger and the avatar.** ⌘K works, but nothing on screen shows search exists. The palette it opens is unstyled: UA-blue underlined links in a bulleted list, **1.63:1 contrast in dark theme**, and no arrow-key navigation.
5. **Empty and no-result states are thin.** An empty folder removes the table and shows a bare sentence with no pointer to "+ New". There is no in-Explore search, so there is no in-page no-results state.

## 2. Findings

### Top bar and search palette

**F1. The palette result links fail contrast in dark theme**
- **Prototype:** has no palette; its trigger is static. Rule 2 and AC-005 still apply to whatever the app renders.
- **App:** results in `.palette a` use the browser default `color: rgb(0,0,238)`, underlined, on `bg-raised` `#252523` in dark theme.
- **Evidence:** measured contrast is **1.63:1** in dark (needs 4.5:1), so the results are nearly unreadable in the dark screenshot. In light they read 9.4:1, but still in a non-token colour. The palette's own hint text ("Press Escape to close.") passes at 7.3:1.
- **Severity:** blocker.
- **Class:** AC (AC-005; direction rule 2).
- **Fix direction:** style results as palette rows in `text-primary` with a type icon. Bring them into the rendered contrast audit. The audit passed because the palette was closed when it ran.

**F2. No visible search trigger in the top bar**
- **Prototype:** a 260×32 search field at the right of the top bar: icon, "Search fields, charts, models", and a ⌘K key hint. It uses `bg-subtle`, a 1 px `border-subtle`, radius 6 and 13 px text.
- **App:** the header's only children are `SPAN.app-bar__product`, `NAV.workspace-switcher` and `BUTTON.theme-toggle`. The palette is reachable only by the shortcut.
- **Severity:** major.
- **Class:** STRUCTURE. Direction §2 also puts "global search (⌘K)" on the right of the bar.
- **Fix direction:** add the trigger field left of the theme toggle. Clicking it opens the palette, and it shows the ⌘K / Ctrl+K hint for the platform.

**F3. No avatar or identity**
- **Prototype:** a 28×28 circular "AN" avatar at the far right, 12/600, with `aria-label="Signed in as Analyst"`.
- **App:** none. The theme toggle is the last element, at x=1396.
- **Severity:** minor. Phase 1 is single-user, but the prototype places the identity and direction §2 names a user menu.
- **Class:** STRUCTURE.
- **Fix direction:** add the avatar at the right edge, as the anchor for a future user menu.

**F4. Palette is not keyboard-navigable and loses focus on close**
- **Prototype:** no palette behaviour. Direction §7 names "⌘K for command/search".
- **App:**
  - ArrowDown in the palette leaves focus in the input, and no result becomes active: there is no `aria-activedescendant` and no listbox role. The list is a plain `ul` with `list-style: disc`.
  - After Escape, `document.activeElement` is `BODY` rather than the element focused before.
  - Results read "Company dashboard 10 · dashboard", with no icon and no folder.
- **Severity:** major.
- **Class:** STRUCTURE / VISUAL.
- **Fix direction:** make it a combobox with a listbox: arrows move the active option, Enter opens it. Each row gets a type icon, title and folder. Return focus to the trigger on close.

**F5. Palette scope label differs**
- **Prototype:** the trigger promises "Search fields, charts, models".
- **App:** the placeholder is "Search dashboards and charts".
- **Severity:** minor.
- **Class:** STRUCTURE.
- **Fix direction:** decide the palette's scope with the user and make the trigger and placeholder agree. Do not invent the scope; the prototype and the app disagree.

### Folder tree

**F6. No pane header, no "+ Folder", no counts, no icons**
- **Prototype:**
  - `.pane-head`, 44 px high, with an `h2` "Folders" (14/600) and a ghost "+ Folder" (24 px, 12 px text).
  - Each row has an 18 px folder icon chip, the name, and a right-aligned count (12 px, `text-muted`). The count is recursive, e.g. "Our analytics 11".
- **App:** `aside.explore__tree` holds only the `role=tree` list. Rows are bare name buttons.
- **Severity:** major.
- **Class:** STRUCTURE.
- **Fix direction:** add the pane header with "+ Folder", a folder icon per row, and the recursive item count right-aligned in muted 12 px.

**F7. "My workspace" is missing; the root is generic**
- **Prototype:** two roots: a named shared root ("Our analytics") and a personal "My workspace" with a distinct ◉ icon.
- **App:** a single "All folders" root at `aria-level=1`, with every folder beneath it.
- **Severity:** major. The personal space is a structural part of the accepted IA.
- **Class:** STRUCTURE.
- **Fix direction:** add a personal "My workspace" root alongside the shared root, with its own icon.

**F8. The tree is a floating card, and its type and selection don't match**
- **Prototype:**
  - Docked pane: x=0, 260 px wide, 852 px tall (full height), white, with a right rule.
  - Rows span the full width, are 28 px, and use **12 px** text.
  - The selected row fills the full width with `accent-soft` `#e3f0f4` and `accent` text `#1f6f86` at 600.
- **App:**
  - `aside.explore__tree`: 240 px wide, inset at x=16, y=64. It is a bordered card, radius 6, only 214 px tall (content height).
  - Rows are 28 px (good) but use **14 px** text.
  - The selection is a label-width chip (e.g. 80 px) in `bg-subtle` `#f0efec` with `text-primary`.
- **Severity:** major.
- **Class:** STRUCTURE (pane docking and width) and VISUAL (type size, selection colour).
- **Fix direction:**
  - Dock the tree as a full-height left pane. Direction §2 says 280 px default, resizable 220–400; the prototype shows 260.
  - Use 12 px text for tree rows (direction §3: `text-xs` for tree rows).
  - Make the selected row full width, in accent-soft with accent text.

### Folder header

**F9. No breadcrumb**
- **Prototype:** `.crumbs`, 12 px `text-secondary`, clickable ancestors: "Our analytics / Sales / New folder".
- **App:** none.
- **Severity:** major.
- **Class:** STRUCTURE.
- **Fix direction:** add a breadcrumb of folder ancestors above the title. Each crumb navigates.

**F10. No folder title and no Rename in the header**
- **Prototype:** `h1` with the folder name at 20/26, weight 600, followed by a ghost "Rename" (24 px). Rename turns the title into an in-place 20 px input.
- **App:** no heading for the folder. Folders can only be renamed from their row in the parent folder's table.
- **Severity:** major. The page never says which folder you are in.
- **Class:** STRUCTURE.
- **Fix direction:** show the folder name as the page title (`text-lg`), with Rename beside it that edits the title in place.

**F11. No Explore search box**
- **Prototype:**
  - A 260×28 input "Search dashboards and charts", right-aligned in the header row.
  - Typing searches all folders.
  - The page switches to "Search": breadcrumb "Search results for "rev"", and "Built on" gains the item's folder.
- **App:** no search input on the Explore page; only the ⌘K palette.
- **Severity:** major.
- **Class:** AC. AC-019 says "WHEN the user types in the Explore search box…", and it is unticked in `docs/spec.md`.
- **Fix direction:** add the in-page search box with the prototype's results mode: same table, "Search" title, and folder shown per row.

**F12. Three peer buttons instead of "+ New ▾"**
- **Prototype:** one primary "+ New ▾" button (32 px, accent fill, 14/600). It opens a menu of Dashboard, Chart and Folder, each with its type icon chip.
- **App:** three secondary buttons, "New folder", "New dashboard" and "New chart" (32 px, white, `border-strong`). They sit at x=281–377, 377–505 and 505–597: **0 px gap**, borders touching. They are left-aligned above the table.
- **Severity:** major.
- **Class:** STRUCTURE (menu vs buttons) and VISUAL (spacing below the 4 px scale).
- **Fix direction:** replace them with a single primary "+ New" menu button at the right of the header row, with icons per option.

**F13. The new-folder flow differs, and its label collides with the input**
- **Prototype:** "+ Folder" creates "New folder" immediately, selects it in the tree, and puts the title into rename mode with the text selected.
- **App:**
  - A form replaces the buttons: `LABEL` "New folder in this folder", then an input, a disabled "Create" at opacity 0.5, and Cancel.
  - The label ends at x=434.96 and the input starts at x=434.96, **0 px apart**; the input's focus ring overlaps the label's last letter. The parent is `display:block` with no gap.
  - AC-020 still holds: the new folder lands in the selected folder and opens.
- **Severity:** minor.
- **Class:** STRUCTURE / VISUAL.
- **Fix direction:** follow the prototype's create-then-rename-in-title flow. Failing that, at least space the label from the input.

### Contents table

**F14. Missing "Built on" column, description line and chart-type label**
- **Prototype columns:** Name 40%, Type, Built on, Updated, Owner.
  - Dashboards show a second line with the description (12 px `text-muted`) and "N tabs" in Built on.
  - Charts show their chart type (KPI, "Bar, horizontal") and "view: sales" in IBM Plex Mono 12 px.
  - Subfolders show "Folder" and "N items".
- **App columns:** Name, Type, Owner, Last updated, Actions.
  - Type is "Dashboard", "Chart" or "Folder" only. For example, "Finance chart 3" reads "Chart".
  - There is no description line and no Built on.
- **This is an API gap, not seed data.** `GET /api/folders/{id}/contents` returns only `{kind, id, title, owner, updatedAt, localToDashboardId}`. Description, tab count, chart type and source are not in the contract.
- **Severity:** major.
- **Class:** STRUCTURE. AC-017 requires "type"; a bare "Chart" arguably meets its letter but not the prototype's meaning.
- **Fix direction:**
  - Extend the contents payload with description, tab count, resolved chart type and source (cube or view).
  - Render the description as a muted second line, and Built on in mono.
  - Show the chart type label for charts.

**F15. A per-row Actions column the prototype does not have**
- **Prototype:** no actions column. The whole row is the click target (`tr[data-open]`, `tabindex=0`, `cursor:pointer`). Rename lives on the folder header.
- **App:**
  - Every row carries a full 78×32 "Rename" button and a 106×32 native "Move to…" select.
  - With 30 dashboards that is 60 bordered controls in view, and the column takes 323 px of 1134.
  - Rename swaps the name cell for an input and Save. The table reflows: the Type column moved from x=585 to x=629. There is no Cancel button; Escape does cancel.
- **Severity:** major.
- **Class:** STRUCTURE.
- **Fix direction:** keep AC-021 (rename and move of items) reachable, but through a per-row ⋯ menu revealed on hover or focus, or a context menu. Rows then read as a list rather than a form.

**F16. "Move to…" offers invalid targets and no root**
- **Evidence:**
  - The select for folder "Archive" lists "Archive"; for the dashboard "test" inside "hello" it lists "hello".
  - Items outside the root offer no "All folders" / root option.
  - The option list is flat ("hello" and "sss" appear without their hierarchy).
- **Severity:** minor. Not exercised, to avoid corrupting data.
- **Class:** STRUCTURE.
- **Fix direction:** exclude the current folder and, for folders, the folder itself and its descendants. Include the root. Show the path in each option.

**F17. Row density, type size and header style**
- **Prototype:**
  - Header row 28 px: `th` 12/600 in `text-primary` on `bg-subtle` `#f0efec`.
  - Body rows 34 px (direction §4, default table row). Cells are 12 px; names 12/600.
  - The table sits in its own bordered card, radius 6.
- **App:**
  - Header row 37 px: `th` 12/600 in `text-secondary` `#5c5b57` on transparent.
  - Body rows **49 px** (heights 37, 49, 49 …). Cells and names are **14/400**.
  - The table shares one card with the button bar.
- **Severity:** major. Only about 15 rows fit in 900 px, against about 20 in the prototype.
- **Class:** VISUAL (direction rule 17 and §4, table rows 34).
- **Fix direction:** 34 px rows, 12 px cells with 12/600 names, a filled header band, and the table in its own card.

**F18. No tabular numerals**
- **Prototype:** `font-variant-numeric: tabular-nums` on every `th` and `td`.
- **App:** `normal` on the table, header and cells.
- **Severity:** minor.
- **Class:** VISUAL (direction rule 1: "Tables … use tabular numerals").
- **Fix direction:** apply `tnum` to the contents table.

**F19. Date format**
- **Prototype:** Updated reads "Sep 19", 12 px.
- **App:** "9/21/2026, 1:53:01 PM", a locale string with seconds, 14 px. It uses a `<time datetime>` element, which is good. The column is 259 px wide.
- **Severity:** minor.
- **Class:** STRUCTURE / VISUAL.
- **Fix direction:** show a short relative or short date ("Sep 21", or "2:28 PM" for today) with the full timestamp in a tooltip or `title`.

**F20. Item icons and row ordering**
- **Icons:**
  - Prototype: 22×22 tinted icon chips before each name. Dashboard ▦ in violet on `#f1e9f8`, chart ◢ in accent on accent-soft, folder ▣ on `bg-subtle`.
  - App: a bare glyph in the Type cell (▤ 12 px wide, 🗀 for folders), in text colour, and nothing before the name.
- **Ordering:**
  - Prototype order is subfolders, then dashboards, then charts.
  - App sorts everything alphabetically with subfolders last. In the root, the four folders come after all 30 dashboards, and in Finance the charts come before the dashboards.
  - Folder rows in the app also show an owner and date; the prototype shows "N items" and leaves them blank.
- **Severity:** minor.
- **Class:** STRUCTURE / VISUAL.
- **Fix direction:** add the icon chip before the name, list subfolders first with an item count, and keep dashboards before charts.

**F21. Cell vertical alignment**
- **Evidence:** all `td` have `vertical-align: top`, while the name is a 28 px padded button and the actions are 32 px controls. Text centres in row 1 sit at y = 164 (name), 160 (type, owner, date) and 166 (actions). "Dashboard" visibly rides higher than the name.
- **Severity:** minor.
- **Class:** VISUAL.
- **Fix direction:** middle-align cells.

**F22. No footnote**
- **Prototype:** below the table, 12 px muted: "Charts are shared: a chart used on several dashboards is edited once, and every dashboard shows the change."
- **App:** none.
- **Severity:** minor. It carries the chart-ownership model (direction §2), which users otherwise don't learn.
- **Class:** STRUCTURE.
- **Fix direction:** add the footnote under the table.

**F23. The page scrolls, not the pane**
- **Prototype:** the view is 900 px tall; the table scrolls inside `.card.tscroll` while the tree and top bar stay put.
- **App:** `document.scrollHeight` is 1842; the whole page scrolls, including the tree card. The top bar stays fixed.
- **Severity:** minor.
- **Class:** STRUCTURE. Direction §2 describes a workbench of fixed panes.
- **Fix direction:** fix the shell to the viewport and scroll the contents region only.

### States

**F24. Empty folder**
- **Prototype:** the table header stays. One 120 px centred row reads "This folder is empty. Use ＋ New to add a dashboard or chart." The footnote stays.
- **App:** the table is removed entirely. A `<p>` "This folder is empty." at 14 px `text-secondary`, left-aligned, with no pointer to the create action.
- **Severity:** minor.
- **Class:** STRUCTURE. Direction §6: an empty state has "a sentence and a primary action".
- **Fix direction:** keep the header and render the centred empty row, naming or embedding the "+ New" action.

**F25. Search with no results**
- **Prototype:** "Search" title, breadcrumb "Search results for "zzqx"", table header kept, centred "Nothing matches." row.
- **App:** only reachable in the palette: "Nothing matches “zzqx”." There is no in-page state, because there is no in-page search (F11).
- **Severity:** minor (follows from F11).
- **Class:** AC (AC-019).
- **Fix direction:** comes with F11.

### Navigation continuity

**F26. The selected folder is not in the URL**
- **Prototype:** returning from a dashboard sets the folder back to the dashboard's own folder (`onBack` → `S.folder = d.folder`, explore.js:214).
- **App:**
  - Selecting Finance leaves the URL at `/explore`; reloading returns to "All folders".
  - The dashboard page has no "← Explore / Finance /" breadcrumb. The prototype has one (dashboard.js:582).
  - The only way back is the Explore tab, which lands on the root.
- **Severity:** major. Every open-and-return trip loses your place.
- **Class:** STRUCTURE. AC-002 lists workspace, dashboard, chart and file, not folder, so this is not an AC failure.
- **Fix direction:** put the folder in the route. Add the "← Explore / ‹folder›" breadcrumb to the dashboard and chart headers, returning to that folder.

**F27. `aria-selected` on plain table rows**
- **Evidence:** rows carry `aria-selected=true` inside a plain `<table class="folder-contents">` (no `role=grid`). `aria-selected` is not supported on the implicit row role outside grid or treegrid, so screen readers may not announce the selection. Row 1 is selected on load, before any focus.
- **Severity:** minor.
- **Class:** STRUCTURE (a11y).
- **Fix direction:** give the table grid semantics (with roving focus), or drop `aria-selected` and rely on focus.

## 3. What already matches

**Workspace switcher (AC-001)**
- Explore, Model, Data sources, Jobs, Schedules and Security, in that order, with no Dashboards entry.
- Identical metrics to the prototype:
  - active item 75×47, 14/600 `text-primary`, with a 2 px accent (`#1f6f86`) bottom border;
  - inactive items 14/400 `text-secondary` `#5c5b57`, padding 0 12 px.
- The app uses `<a>` links with real routes, which is better than the prototype's buttons.

**Top bar**
- 48 px high in both (direction §2).
- White background with a 1 px `border-subtle` bottom rule.
- 12 px side padding, and the brand block is 84×22 at (12, 13) in both.

**Theme toggle**
- 32×32, radius 6, transparent border, `text-secondary` icon. It has an accessible name ("Switch to dark theme").

**Theme switch keeps route and scroll (AC-003)**
- Scrolled to y=600 on `/explore`, toggled: still y=600, same path, and the theme switched.

**Minimum text size and contrast (AC-004, AC-005)**
- Outside the palette: 228 text nodes audited in light and 72 in the dark Finance view. Minimum font size 12 px; **0 contrast failures** in either theme.
- The only failure is the palette results (F1).

**Dark theme complete (rule 24)**
- The page wallpaper is `#121211`-range, cards and tree are `bg-surface`, and the accent lightens to `#4fb3d1`.
- The dark theme is authored, not inverted; the brand mark and active tab both recolour.

**⌘K opens the palette with focus in its input (AC-006)**
- `role=dialog`, `aria-modal=true`, focus in `input.palette__input` straight away. Works with Meta+K and Ctrl+K. Escape closes it.

**Keyboard navigation of contents (AC-024)**
- With row 1 focused, ArrowDown twice moved focus and `aria-selected` to row 3.
- The focused row shows a 2 px accent outline, offset 2 px.
- Enter opened `/explore/dashboards/seed-root-dashboard-3`.
- The prototype only supports Enter.

**Creating a folder (AC-020)**
- The new folder was created inside the selected folder ("hello") and opened straight away: selected in the tree, empty contents shown.

**Contents listing (AC-017)**
- Lists dashboards, library charts and subfolders with type, owner and last-updated time. None of the rows checked had a blank value.

**Tree semantics and row height (rule 17)**
- `role=tree` and `treeitem` with `aria-level` 1–5 and `aria-selected`; nesting is indented 12 px per level.
- Rows are 28 px.

**Controls (rule 17)**
- Buttons 32 px, radius 6 (§7d); inputs and selects 32 px, radius 4.

**Tokens**
- Page `bg-page` `#f4f4f2` and cards `bg-surface` with a 1 px `border-subtle` `#e3e2de` and 6 px radius (rule 16).
- Table cells have 8 px inline padding (§4) and 1 px `border-subtle` row rules.
- The primary action uses `accent` `#1f6f86` with white text.

**Table semantics**
- A hidden `<caption>` ("Contents of this folder") and `th scope=row` on names.
- Dates use `<time datetime>`.
- Move selects carry specific labels ("Move Company dashboard 01 to").

**Relevant files**
- Prototype: `docs/design/prototype/explore.js` (browse at lines 55–97, "+ New" menu at line 82, table at lines 84–95), `docs/design/prototype/index.html` (top bar at lines 2351–2373), `docs/design/prototype/dashboard.js:582` (breadcrumb).
- Rubric: `docs/design/direction.md` (§2, §3, §4, §9 rules 1, 2, 17, 24), `docs/spec.md` (AC-001 to AC-024 at lines 38–99).
