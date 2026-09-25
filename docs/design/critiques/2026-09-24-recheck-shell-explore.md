# Re-critique: app shell and Explore against the design prototype (2026-09-24, after T208–T242)

Produced by the `design-critic` agent for T225 (AC-187) and saved verbatim.

**What was compared**
- **App:** http://localhost:5400/explore (production build, real API). I opened the root, Finance, an empty folder, My workspace, in-page search, the ⌘K palette, the row ⋯ menu, "+ New", Rename, "+ Folder", and a dashboard and a chart opened from Explore.
- **Prototype:** http://127.0.0.1:5500/index.html#explore.
- **How:** both at 1440×900, light and dark, plus 1280 and 390×844. Values come from `getComputedStyle`, `getBoundingClientRect` and a text-node audit. Sample content is not compared.
- **Tokens:** the prototype's own `text-muted` (#76746f / #8e8c86), `bg-hover` (#e9e8e4) and dark `text-on-accent` (#0f1d22) were replaced by direction.md §5 and §7d. The app uses the direction values, which AC-187 requires, so those differences are not counted.

**Test data created** (all in My workspace; nothing was deleted):
- **"Critique 0924b":** a dashboard with the description "Critique 0924b test data: description line check".
- **"Critique 0924b chart":** a library chart on view `order_summary` with the Count measure. It saved first as "Untitled chart" and I renamed it from Explore.
- **"Critique 0924b folder":** made with "+ Folder", then renamed.

No existing item was renamed or moved. Rename and Move to… were opened on several rows and cancelled.

**Summary:** of the 27 earlier findings, **14 are FIXED and 13 STILL OPEN** (9 of those partly fixed). There are **17 new findings**; two are major:
- chart rows show "Automatic" instead of the chart type;
- a folder's "Move to…" leaves out its sibling folders, so it can never be moved into one.

**AC-187 does not conform:** 23 measured mismatches, listed in section 3.

## 1. Earlier findings

**F1. Palette results fail contrast in dark: FIXED**
- Results are `li.palette__option` in a `role=listbox`; there are no UA-blue links left.
- Dark contrast: type label #b4b3ab on #252523 is 7.30:1, title #f2f2f0 is 13.70:1, and the active option #4fb3d1 on #173640 is 5.31:1, the lowest.
- The light page audit's lowest ratio is 4.56:1, on the trigger label.

**F2. No visible search trigger: FIXED**
- `button.app-search` is 32 px tall, `bg-subtle` #f0efec, 1 px `border-subtle`, radius 6, 13 px `text-muted`, with a ⌘K `kbd`. Clicking it opens the palette.
- Remaining size and colour differences are in N6.

**F3. No avatar: FIXED**
- `span.app-avatar` is 28×28, radius 50%, 12/600, named "Signed in as admin".
- Its colour differs from the prototype (N7).

**F4. Palette not keyboard-navigable: FIXED**
- The input is `role=combobox` with `aria-expanded=true`. ArrowDown moves `aria-activedescendant` from option-0 to option-1.
- Escape returns focus to `BUTTON.app-search`.
- Each result has a type ("Chart", "Dashboard", "Measure", "Dimension"); fields also get a detail line. No icons and no folder, but AC-191 requires only the type.

**F5. Palette scope label: FIXED (by AC-191's scope)**
- The trigger reads "Search dashboards, charts, fields, models" and the placeholder "…fields and models". The two agree.
- The label is clipped (N6).

**F6. Pane header, "+ Folder", counts, icons: STILL OPEN (partly fixed)**
- Fixed:
  - `h2` "Folders" at 14/20/600.
  - Ghost "+ Folder", 65×24, 12 px, radius 6.
  - Recursive counts: Shared 67; Operations 9 includes sss and hello.
- Open:
  - No folder icon chips (prototype: 18×18, radius 5, `bg-subtle`).
  - The pane head is 32 px tall, padded 0 0 8 6, with no bottom rule. The prototype's is 44 px, padded 8 12, with a 1 px `border-subtle` rule.
  - Counts are `text-secondary` #5c5b57 where the prototype uses `text-muted`.

**F7. "My workspace" missing: STILL OPEN (partly fixed)**
- The "My workspace" root sits at `aria-level=1` beside "Shared" (`?folder=mine`).
- It has no distinct ◉ icon; there are no tree icons at all.

**F8. Tree is a floating card, with the wrong type and selection: STILL OPEN**
- **Pane position and surface:**
  - App: `aside.explore__tree` at x=16, y=64, 240×820, background transparent (page wallpaper #f4f4f2, dark #121211). Its right rule stops at y=884.
  - Prototype: x=0, y=48, 260×852, `bg-surface` #fff (dark #1c1c1b).
- **Row text:** 14 px, against the prototype's 12 px.
- **Selected row:**
  - App: `bg-subtle` #f0efec (dark #2a2a28) with `text-primary`, radius 4, inset (219–231 px wide).
  - Prototype: full width (259 px), `accent-soft` #e3f0f4 (dark #173640) with `accent` #1f6f86 (dark #4fb3d1), radius 0.
- Hover is `bg-hover` #efeeea, almost the same as the selection colour #f0efec, so a hovered row looks selected.
- Indent is 12 px per level; the prototype's is 14.

**F9. No breadcrumb: FIXED**
- `nav.crumbs`: 12 px `text-secondary`, gap 4. The "My workspace" crumb navigated to `?folder=mine`.
- Crumb height is in N5.

**F10. No folder title or Rename: FIXED**
- The `h1` is 20/26/600, with a ghost-sm Rename (63×24).
- Rename swaps in a 20/600 input with the text selected; Escape cancels.
- The input's height differs (N4).

**F11. No Explore search box: FIXED**
- Typing "dashboard 1" gave the title "Search", the breadcrumb `Search results for "dashboard 1"`, and 14 rows across 5 folders. Built on reads "1 tab · Archive".
- The input's size differs (N3).

**F12. Three peer buttons instead of "+ New": FIXED**
- One `.btn-primary` "＋ New ▾": 83×32, `accent`, 14/600, radius 6, padding 0 12, 8 px right of the search.
- Its menu matches the prototype's `.picker` exactly: 220 wide, radius 6, 1 px `border-strong`, padding 4, pop shadow, 28 px items at 12 px, 22×22 chips.

**F13. New-folder flow: FIXED**
- "+ Folder" creates "New folder" in the selected folder, selects it in the tree, updates the URL, and opens the title for renaming with characters 0–10 selected.

**F14. Built on, description line, chart type: STILL OPEN (partly fixed)**
- Fixed:
  - the Built on column;
  - the description line: 12/16 `text-muted` #6e6c67, aligned with the name at x=305.4;
  - "N tabs", "N items" and "view: order_summary".
  - The contents contract now carries `description`, `chartType`, `source`, `tabs` and `itemCount`.
- Open:
  - An auto chart's Type reads "Automatic" (N1).
  - A chart's source is set in Inter, not IBM Plex Mono (N2).

**F15. Per-row Actions controls: FIXED**
- Each row has a ⋯ ghost-sm button (30×24) opening Rename and Move to…, with no controls at rest. The column is 45.5 px wide, down from 323.
- Remaining differences are in N11 and N14.

**F16. "Move to…" targets: STILL OPEN (partly fixed)**
- Fixed: the item's own folder is excluded, and both roots are offered.
- Open:
  - Options are flat, with no path ("hello", "sss", "Critique empty 0924"). The app's own Settings › General folder select already shows "Operations / sss / hello".
  - A new over-exclusion defect is in N17.

**F17. Row density, type size, header: STILL OPEN (partly fixed)**
- Fixed:
  - 12 px cells;
  - a `bg-subtle` header band with 12/600 `text-primary`;
  - the table is its own card (1 px `border-subtle`, radius 6);
  - rows went from 49 px to 37.
- Open:
  - Rows are 36–37 px, and 53 px with a description; the prototype's are 34 px.
  - The header row is 29 px against 28.
  - Names are 12/400 against 12/600.
  - Type is `text-primary` where the prototype uses `text-secondary`.

**F18. No tabular numerals: FIXED**
- `tabular-nums` is set on the table, its `th` and `td`, and the tree counts.

**F19. Date format: STILL OPEN**
- Every row shows "9/21/2026, 1:53:01 PM"; the prototype shows "Sep 19".

**F20. Icons and ordering: STILL OPEN (ordering fixed)**
- Ordering is fixed: folders, then dashboards, then charts, in the root, Finance and My workspace.
- Icons:
  - Rows use `::before` glyphs 🗀, ▤ and ▦, 10–12×20, in `text-secondary`, with no chip. 🗀 renders as a stacked-lines glyph.
  - The app's own "+ New" menu draws the prototype's chips, so ▦ means Dashboard in the menu and Chart in the table (`styles.ts:1152–1155`).
- Folder rows still show an owner and a date; the prototype leaves them blank.

**F21. Cell vertical alignment: FIXED**
- Every cell is `vertical-align: middle`.

**F22. No footnote: STILL OPEN**
- `section.explore__contents` holds only the crumbs, the head row and the table.

**F23. The page scrolls, not the pane: STILL OPEN (partly fixed)**
- The top bar and tree are `position: sticky` and hold at scrollTop 600.
- The document is 1583 px tall at root, though. The breadcrumb, title, search and "+ New" scroll off (the head row reaches y=−488), and the column headers are `position: static` (they reach y=−431).
- In the prototype the document is 900 px, and the table scrolls inside `.card.tscroll` with sticky `th`.

**F24. Empty folder: STILL OPEN (partly fixed)**
- The copy is now "This folder is empty. Use ＋ New to add a dashboard or chart."
- The table and its header are removed. The sentence is a `p` at 14/20 `text-secondary`, left-aligned at x=272.
- The prototype keeps the header and draws a centred 120 px row in 12 px `text-secondary`.

**F25. Search with no results: STILL OPEN (partly fixed)**
- The in-page state exists: title "Search", breadcrumb `Search results for "zzqx"`, and "Nothing matches.".
- It has the same shape as F24: no table, 14 px, left-aligned.
- The header also jumps 16 px up when search starts, because the crumb row goes from 32 px to 16 px (title y=115 → 99).

**F26. Selected folder not in the URL: FIXED**
- The folder is in the URL: `?folder=seed-folder-0`.
- A dashboard shows "← Explore / Shared / Finance", with hrefs to `/explore?folder=seed-folder-0`. The chart page shows "← Explore / My workspace".

**F27. `aria-selected` on plain table rows: STILL OPEN**
- `table.folder-contents` has no role, all 8 of Finance's rows carry `aria-selected`, and row 1 is selected on load.

## 2. New findings

**N1. A chart's Type reads "Automatic", not its chart type**
- **Prototype:** `typeLabel()` resolves the chart, so the row reads "KPI" or "Bar, horizontal" (explore.js:38–41, 90).
- **App:**
  - "Critique 0924b chart" reads "Automatic". Its own page's badge says "KPI · auto".
  - The seed charts read "Incomplete".
- **Severity:** major.
- **Class:** AC (AC-193: "a chart's chart type"). "Automatic" is as empty as the "Chart" named in its Fails-when.
- **Fix direction:** show the resolved type, as the chart page's badge does. Keep "Incomplete" for charts that can't be drawn.

**N2. Built on typography**
- **Prototype:** a chart's source is IBM Plex Mono 12 (`.mono`). "N tabs" is `text-secondary` and "N items" is `text-muted`.
- **App:** all three are Inter 12/20 in `text-primary`. The chart page already sets the source in mono.
- **Severity:** minor.
- **Class:** VISUAL.
- **Fix direction:** the code face for sources; secondary and muted colours as in the prototype.

**N3. Explore search box size**
- **Prototype:** 260×28 (`.input.sm`), 12 px.
- **App:** 153×32, 12 px. The placeholder is 172 px of text in a 135 px box, so it reads "Search dashboards ar".
- **Cause:** the app's own rule sets 28 px and a 260 px max (`styles.ts:310`), but the broader global input rule wins.
- **Severity:** minor.
- **Class:** AC (AC-187: input height).
- **Fix direction:** let the small-input rule apply, at 260 px wide.

**N4. Folder rename input height**
- **Prototype:** 36 px tall, 20/600, max 320 px.
- **App:** 247×32, 20/600.
- **Severity:** minor.
- **Class:** AC (AC-187: input height).
- **Fix direction:** make it 36 px.

**N5. Breadcrumb button height and header rhythm**
- **Prototype:**
  - Crumb buttons are 24 px tall, 12/20.
  - Gaps are 12 px from crumbs to head and 12 px from head to table, so the table card starts at y=144.
- **App:**
  - Crumb buttons are 32 px tall, 12/16. They pick up the class-less button's 32 px minimum.
  - Gaps are 16 px and 24 px, so the table starts at y=168.
- **Severity:** minor.
- **Class:** AC (AC-187: button height) / VISUAL.
- **Fix direction:** 24 px crumbs and the prototype's 12 px rhythm. This also removes F25's jump.

**N6. Top-bar search trigger**
- **Prototype:** 260 px wide; the `kbd` inherits `text-muted` and is 16.5 px tall.
- **App:**
  - 300 px wide, and the label is still clipped: 254 px of text in 219 px ("Search dashboards, charts, fields,…").
  - The `kbd` is `text-secondary` (#5c5b57, dark #b4b3ab) and 22 px tall (line-height 20).
- **Severity:** minor.
- **Class:** AC (AC-187: app bar colour token and height) for the `kbd`; VISUAL for the width.
- **Fix direction:** 260 px with wording that fits (agree it with the AC-191 scope), and a muted `kbd` at normal line height.

**N7. Avatar colour**
- **Prototype:** `role-dim` #2d6ab4 on `role-dim-soft` #e6eef8; dark #7fb0ea on #1d2a3a.
- **App:** `accent` #1f6f86 on `accent-soft` #e3f0f4; dark #4fb3d1 on #173640.
- **Severity:** minor.
- **Class:** AC (AC-187: app bar colour token).
- **Fix direction:** use the role-dimension pair, or record the deviation in direction.md §7d.

**N8. Palette Close radius**
- **Prototype:** `.btn` radius 6, per §7d.
- **App:** `button.palette__close`, 62×32, radius 4.
- **Severity:** minor.
- **Class:** AC (AC-187: buttons).
- **Fix direction:** radius 6.

**N9. Palette layering and shadow**
- **Evidence:**
  - The backdrop's `z-index` is `auto` and the sticky top bar's is 10, so the bar stays bright and clickable above an `aria-modal` dialog.
  - Clicking "Jobs" with the palette open navigated away and left focus on `BODY`.
  - The palette has no shadow. §5 says `bg-raised` is white plus a shadow in light, and the row menus do use `--wc-shadow-pop`.
- **Severity:** minor.
- **Class:** STRUCTURE (a11y) / VISUAL.
- **Fix direction:** put the backdrop above the app bar, and give the palette the pop shadow.

**N10. The palette keeps the previous query, unselected**
- **Evidence:** after "fin", reopening with ⌘K and typing "order" gave "finorder" and "Nothing matches".
- **Severity:** minor.
- **Class:** STRUCTURE.
- **Fix direction:** clear the query on open, or select it so typing replaces it.

**N11. The row is not the click target and has no hover**
- **Prototype:** `tr[data-open]` has cursor pointer, and hover fills the cells with `bg-hover`.
- **App:** the row has cursor auto and no hover fill. Clicking the Type cell did nothing; only the name button opens the item.
- **Severity:** minor.
- **Class:** STRUCTURE.
- **Fix direction:** make the whole row open the item (except its menu), with a `bg-hover` hover.

**N12. First row painted as selected at rest**
- **Evidence:** row 1 is `bg-subtle` #f0efec on load, before any interaction. The prototype has no resting selection, and its `.sel` colour is `accent-soft`.
- **Severity:** minor.
- **Class:** VISUAL (tied to F27).
- **Fix direction:** show selection only through focus, or as `accent-soft` after user action.

**N13. Tree label underlines on hover**
- **Evidence:** the app's hover adds `text-decoration: underline`. The prototype's `.file:hover` changes only the background.
- **Severity:** minor.
- **Class:** VISUAL.
- **Fix direction:** remove the underline.

**N14. "Move to…" reflows the table**
- **Evidence:** the ⋯ becomes a 168×32 native select, every column shifts (Type moves from x=638 to x=593), and the row grows from 37 px to 41.
- **Severity:** minor.
- **Class:** STRUCTURE.
- **Fix direction:** offer destinations in a submenu or a small dialog, so the table doesn't change.

**N15. New › Dashboard opens in view mode**
- **Prototype:** opens straight into edit mode (explore.js:292, `S.editNew = true`).
- **App:** view mode with "Start editing".
- **Severity:** minor.
- **Class:** STRUCTURE.
- **Fix direction:** open new dashboards in edit mode.

**N16. The shell overflows at 390 px**
- **Evidence:** the document is 969 px wide. The search trigger (x=591) and avatar (x=941) are off-screen, and "Data sources" wraps to two lines inside its 47 px tab.
- **Context:** the prototype has no narrow layout (it renders at a 980 px layout viewport). Direction §2 says only "<1024: view mode only", with no Explore rule. At 1280 Explore fits.
- **Severity:** minor.
- **Class:** VISUAL.
- **Fix direction:** ask the user what Explore and the top bar should do below 1024. Don't invent it.

**N17. A folder's "Move to…" leaves out all its sibling folders**
- **Evidence:**
  - For Operations and for Archive (both in Shared), the only options are "My workspace" and "Critique 0924b folder". Archive, Finance and Marketing, all valid targets, are missing.
  - For "sss" in Operations the options are correct (Shared, My workspace, Archive, Critique 0924b folder, Finance, Marketing).
  - A root dashboard is offered every folder.
- **Likely cause:** the rule excludes the parent's subtree instead of the moved folder's own subtree.
- **Result:** a folder can never be moved into a sibling.
- **Severity:** major.
- **Class:** STRUCTURE (a functional defect). AC-193's Fails-when covers only offering invalid targets, not leaving out valid ones.
- **Fix direction:** exclude only the current parent, the folder itself and its descendants.

## 3. AC-187 verdict for this group: does not conform

**Conforms (measured equal to the prototype's rule):**
- **Top bar:** 48 px, padding 0 12, gap 16, `bg-surface`, 1 px `border-subtle` bottom rule. Brand block 84×22, with a 22×22 mark at radius 5.
- **Workspace navigation:**
  - active tab 75×47, 14/600 `text-primary`, 2 px `accent` underline;
  - inactive tabs 14/400 `text-secondary`, padding 0 12;
  - the same in both themes.
- **Theme toggle:** 32×32, radius 6, transparent border.
- **Buttons:**
  - primary "+ New": 32 px, padding 0 12, radius 6, 14/600, `accent` / `text-on-accent`;
  - ghost-sm "+ Folder", "Rename" and "⋯": 24 px, padding 0 8, 12 px, radius 6, transparent border;
  - secondary "Cancel" in row rename: 32 px, padding 0 12, radius 6, 1 px `border-strong`, `bg-surface`.
- **Menus:** the "+ New" and row menus match `.picker` exactly.
- **Inputs:** the Move-to select (32 px, radius 4, `border-strong`, padding 0 4 0 8), the row-rename input and the palette input match `.input` / `.select`.
- **Header:** `h1` at 20/26/600.
- **Table card:** 1 px `border-subtle`, radius 6. Header band `bg-subtle`, 12/600 `text-primary`. Cells 12 px with 8 px inline padding and `border-subtle` rules, `tabular-nums`.
- **Description line:** 12/16 `text-muted`.

**Mismatches:**

*App bar*
1. ⌘K `kbd` colour: `text-secondary`, where the prototype inherits `text-muted`.
2. ⌘K `kbd` height: 22 px against 16.5.
3. Avatar colours: `accent` / `accent-soft` against `role-dim` / `role-dim-soft`, in both themes.

*Buttons*

4. Palette Close radius: 4 against 6.
5. Breadcrumb buttons: 32 px tall with line-height 16, against 24 and 20.

*Inputs*

6. Explore search: 32 px tall against 28 (and 153 px wide against 260).
7. Folder-title rename input: 32 px tall against 36.

*Folder tree*

8. Pane background: transparent over `bg-page`, against `bg-surface`. Width 240 against 260, inset 16 px against docked.
9. Pane head: 32 px tall against 44; padding 0 0 8 6 against 8 12; no bottom border against 1 px `border-subtle`.
10. Row font size: 14 against 12.
11. Row padding 4 6 with a 12 px indent, against 0 12 with 14 px per level; radius 4 against 0; inset against full width.
12. Selected row colours: `bg-subtle` + `text-primary`, against `accent-soft` + `accent`.
13. Count colour: `text-secondary` against `text-muted`.
14. Folder icon chip (18×18, radius 5, `bg-subtle`): absent.

*Table rows*

15. Body rows: 36–37 px, and 53 with a description, against 34.
16. Header row 29 px against 28; cell padding 4 8 against 0 8.
17. Name weight: 400 against 600.
18. Type colour: `text-primary` against `text-secondary`.
19. Built on: Inter against IBM Plex Mono for charts; `text-primary` against `text-secondary` / `text-muted` for dashboards and folders.
20. Row icon: a 10–12×20 glyph in `text-secondary`, against a 22×22 radius-5 tinted chip.
21. Row 1 is filled with `bg-subtle` at rest, where the prototype has none (and its selection token is `accent-soft`).
22. Row hover: none, against `bg-hover`.

*Footnote*

23. Absent. The prototype has a 12/16 `text-muted` paragraph under the card.

The empty and no-results states (F24, F25) also differ in shape.

**Scope note:** AC-187 names only the app bar, workspace navigation, and buttons and inputs, which are mismatches 1–7. The tree, header, table and footnote were included in this group at your request; AC-192–194 and AC-231 cover them structurally.

**AC-231:** passes its Fails-when (titles are 20/600, numbers are tabular), but its SHALL's "rows of 34 pixels" is not met on Explore (mismatch 15).

## 4. What passes

- **Rule 1 / AC-004:**
  - 261 text nodes on the light root and 90 on dark Finance, with none below 12 px.
  - Tabular numerals in the table and the tree counts.
- **Rule 2 / AC-005:** no contrast failures in either theme. Lowest ratios: 4.56:1 in light (the trigger label); 5.31:1 in the dark palette.
- **Rule 17:** tree rows 28 px; primary and secondary buttons and selects 32 px; ghost-sm buttons 24 px.
- **Rule 24:** dark theme authored, not inverted:
  - wallpaper #121211, surfaces #1c1c1b, raised surfaces #252523;
  - `accent` #4fb3d1 with `text-on-accent` #1f1f1e;
  - borders rgba(255,255,255,.1) and .2.
- **Direction §2:** 48 px bar, with search and avatar on the right.
- **AC-001:** the six workspaces, no Dashboards entry.
- **AC-002 and AC-195:** the folder is in the URL; breadcrumbs return to the folder.
- **AC-003:** at scrollTop 500 a theme switch kept the URL and scroll position, and the body and table recoloured.
- **AC-006:** Meta+K and Ctrl+K both open the palette with focus in its input.
- **AC-019:** in-page search works across folders.
- **AC-020:** a new folder lands in the selected folder and opens.
- **AC-024:** ArrowDown moved focus to row 2, with a 2 px accent outline. The prototype's offset is 1 px; the app's is 2.
- **AC-190, AC-192, AC-194:** hold.
- **AC-191:** holds for dashboards, charts and Cube fields. Model files did not appear in the first results for "order", so that part is not verified.
- **AC-233:** `/sources` → `/data-sources`. Both pages have a 20/26/600 title and the phase note.

**Outside this group, not measured:** in the chart editor, a title typed into "Chart title" just before "Save chart" was not saved (the chart saved as "Untitled chart"). It's worth reproducing in the chart-editor critique.

**Relevant files**
- `/Users/srajagopal/Work/wechart/docs/design/prototype/explore.js`: browse at lines 55–97; type label at 38–41; row Enter-to-open at 354; `editNew` at 292.
- `/Users/srajagopal/Work/wechart/docs/design/prototype/index.html`:
  - top bar CSS at lines 434–528 and markup at 2351–2373;
  - `.btn` and `.input` at 551–600;
  - `.pane` at 665–695;
  - `.picker` at 955–990;
  - `.grid-table` at 1089–1124;
  - `.file` at 1429–1449;
  - `.admin-main` and `.card` at 1611–1629;
  - `.crumbs` and `.itemicon` at 2297–2337.
- `/Users/srajagopal/Work/wechart/packages/web/src/shell/styles.ts`:
  - base buttons at 69–79 and `.btn-sm` at 113;
  - the global input rule from 115;
  - `.explore` at 262;
  - `.crumbs` at 270–293;
  - `.explore__search` at 310;
  - tree at 1020–1055;
  - `.folder-contents` at 1091–1156 and 1473;
  - palette at 3209–3283.
- `/Users/srajagopal/Work/wechart/docs/design/critiques/2026-09-24-shell-explore.md`: the earlier report.
- `/Users/srajagopal/Work/wechart/docs/spec.md`: AC-187 at line 616, AC-190–195 at 626–640, AC-231 at 723.
