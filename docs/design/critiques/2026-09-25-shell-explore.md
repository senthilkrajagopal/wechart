# Re-critique: app shell and Explore against the design prototype (2026-09-25, after T243–T250)

Produced for T225 (AC-187) by a critique agent that measured with Playwright, and saved verbatim.

**What was compared**
- **App:** http://localhost:5600, a production build of this branch with its own API and database. I opened:
  - Shared (`?folder=root`), Finance (`?folder=seed-folder-0`), and the empty My workspace (`?folder=mine`);
  - in-page search ("chart") and no-results ("zzqx");
  - the ⌘K / Ctrl+K palette;
  - "＋ New ▾", a row's ⋯ menu, Move to…, a row's Rename and the header Rename;
  - a dashboard, then back by its breadcrumb and by the Explore tab.
- **Prototype:** http://127.0.0.1:5500/index.html#explore. Sales was compared with Finance; "Our analytics" with Shared. For an empty folder I clicked "+ Folder" in the prototype, which is in memory only.
- **Sizes and themes:** 1440×900 in light and dark for every comparison. 1280×800 and 390×844 were checked for layout.
- **How:**
  - `getComputedStyle` and `getBoundingClientRect` on the matching element in each, compared property by property.
  - CDP `CSS.getPlatformFontsForNode` for the face actually painted.
  - A text-node audit (size, and contrast against the composited background under the text) in 9 states × 2 themes.
  - Scripts and screenshots are in `scratchpad/critique-shell/`.
- **Tokens not counted:** where direction.md §5 or §7d replaces the prototype's value, the difference is not counted. These are `text-muted` #6e6c67 / #97958e (prototype #76746f / #8e8c86), `bg-hover` #efeeea / #2c2c2a (prototype #e9e8e4 / #323230), and dark `text-on-accent` #1f1f1e (prototype #0f1d22).
- **Nothing in the app was saved, renamed, moved or deleted.** Both Renames and Move to… were opened and cancelled with Escape; the titles read back unchanged. The theme toggle was clicked twice inside a throwaway browser context.
- **Data note:** another process was writing to this database during the session. Shared's count went from 69 to 70, and items such as "Critique 0925 tiles" appeared. Two items with `folderId: null` ("Recommended chart dashboard", "Untitled chart") show up only in search, with no folder.

**Summary**
- **Earlier findings:** of the 44 (F1–F27 and N1–N17), **40 are FIXED, 2 PARTLY FIXED (F5, F20), 1 STILL OPEN (N16) and 1 not re-measured (N15, which would create a dashboard)**.
- **The last re-critique's 23 AC-187 mismatches all measure equal now,** either to the prototype's rule or to its §5/§7d replacement.
- **New findings:** 13, of which 2 are major. One is class (a) and is required by AC-005; the other twelve are class (d).
  - **R1:** the app never paints Inter. Every UI glyph is the platform face (SF on this Mac), where the prototype paints Inter.
  - **R2:** at 390 px the app bar overflows on every page, so even the dashboards T250 made readable scroll sideways by 455 px.
- **AC-187 for this group:** every measured height, padding, border, radius, font size and weight, and colour token of the app bar, workspace navigation, buttons, inputs and menus matches in both themes. The typeface (R1) is outside the Fails-when's property list but inside the SHALL's "tokens of direction.md §3". Section 3 has the table.

## 1. Earlier findings

**F1. Palette contrast in dark: FIXED.** The audit with the palette open, an option active, found 0 failures in either theme. The lowest ratio is 4.91:1 in light and 5.31:1 in dark, both on the active option (accent on accent-soft).

**F2. No visible search trigger: FIXED.**
- `button.app-search` measures 260×32, with padding 0 10, a 1 px `border-subtle` border, radius 6, `bg-subtle` #f0efec and 13 px `text-muted` text.
- A click opens the palette with focus in `.palette__input`.

**F3. No avatar: FIXED.** `span.app-avatar` is 28×28 at radius 50%, 12/600, in #2d6ab4 on #e6eef8 (dark #7fb0ea on #1d2a3a). This is the prototype's pair.

**F4. Palette not keyboard-navigable: FIXED.**
- The input is `role=combobox` with `aria-expanded=true`.
- ArrowDown sets `aria-activedescendant` to `…-option-0`.
- Escape returns focus to `BUTTON.app-search`.

**F5. Palette scope label: PARTLY FIXED.**
- The trigger reads "Search wechart"; the prototype reads "Search fields, charts, models".
- T245 put the wording to the user, and it stays open until they answer. The palette's own field names all four scopes.

**F6. Pane head, "+ Folder", counts and icons: FIXED.**
- `.explore__pane-head` is 44 px, padded 8 12, with a 1 px `border-subtle` rule below. The `h2` is 14/20/600.
- "+ Folder" is a 24 px ghost-sm button.
- Counts are 12 px `text-muted` with tabular figures.
- Chips are 18×18 at radius 5, `bg-subtle`, in `text-secondary`.

**F7. "My workspace" missing: FIXED.** It is a level-1 root with the ◉ chip.

**F8. Floating tree, wrong type and selection: FIXED.**
- `.explore__tree` sits at (0,48), 260×852, on `bg-surface` with a right rule, as the prototype's `.pane.left` does.
- Rows are 28 px at 12 px and run the full 259 px.
- The indent is 14 px per level (padding-left 12 → 26).
- The selected row is #e3f0f4 with #1f6f86 at 600 (dark #173640 / #4fb3d1).

**F9. No breadcrumb: FIXED.** Crumbs are 12 px `text-secondary`. The crumb buttons are 24 px, padded 2 4, radius 4.

**F10. No folder title or Rename: FIXED.**
- The `h1` is 20/26/600, with a ghost-sm Rename beside it.
- The rename field is 36 px at 20/600, and Escape restores "Finance". Its width is R7.

**F11. No Explore search box: FIXED.** Typing "chart" gives the title "Search", the crumb "Search results for "chart"", and 12 rows across Archive, Finance, Marketing and Operations.

**F12. Three peer buttons: FIXED.** There is one "＋ New ▾" `.btn-primary`. Its menu, items and chips have zero measured differences from the prototype's `.picker`.

**F13. New-folder flow: FIXED at the last re-critique.** Not re-exercised, because it creates a folder.

**F14. Built on, description and chart type: FIXED.**
- A chart's source ("cube: orders") is IBM Plex Mono 12 in `text-primary`.
- "1 tab" is `text-secondary`, and "8 items" is `text-muted` #6e6c67.
- The description line could not be measured live: no dashboard in this database has a description. Its rule is 12/16 `text-muted`.

**F15. Per-row Actions controls: FIXED.** Each row has one ⋯ (ghost-sm, 30×24). Its menu is 220×66 with 28 px items: Rename and Move to….

**F16. Move to… targets: FIXED.** Options are named by path ("Shared / Archive"), the item's own folder is excluded, and both roots are offered.

**F17. Row density, type and header: FIXED.**
- The header row is 28 px and body rows are 34 px (Finance, Shared and search results alike).
- `th` and `td` are padded 0 8 at 12 px. Names are 12/600 and Type is `text-secondary`.

**F18. No tabular numerals: FIXED.** `tabular-nums` is set on the table, its cells and the tree counts.

**F19. Date format: FIXED.** Rows read "Sep 25".

**F20. Icons and ordering: PARTLY FIXED.**
- Chips are 22×22 at radius 5 in the prototype's tints: dashboard #7a3fb0 on #f1e9f8, chart accent on accent-soft, folder `text-secondary` on `bg-subtle`.
- The order is folders, then dashboards, then charts.
- Folder rows still show Updated and Owner ("Sep 25", "admin"), where the prototype leaves them blank. T244 reverted the blanking because it breaks AC-017. The proposal to narrow AC-017 is with the user.

**F21. Cell alignment: FIXED.** Cells are middle-aligned. A name without a description centres at y=189.5 in its 173–207 row.

**F22. No footnote: FIXED.** The footnote is 12/16 `text-muted`, under the table.

**F23. The page scrolls, not the pane: FIXED.** The document is 900 px tall. With `.explore__scroll` at scrollTop 500, the `th` stays at y=144, the `h1` at 103 and the tree at 48.

**F24. Empty folder: FIXED.** In My workspace:
- the header is kept above one centred 120 px row in `text-secondary`: "This folder is empty. Use ＋ New to add a dashboard or chart.";
- the footnote is kept;
- the card is 150 px tall, against the prototype's 150.5.

**F25. Search with no results: FIXED.**
- "zzqx" gives "Nothing matches." in the same 120 px row.
- The title stays at y=103 when a search starts, because the crumb row keeps 24 px. The prototype's own title moves 4 px.

**F26. Folder not in the URL: FIXED.**
- A dashboard's crumbs read "← Explore / Shared / Finance", linking to `?folder=seed-folder-0`.
- "← Explore" returned to Finance.

**F27. `aria-selected` on plain rows: FIXED.** Rows carry no `aria-selected`. The selection is a roving `tabindex` on each `tr`.

**N1. "Automatic" as a chart's type: FIXED.** Drawn charts read "KPI · auto" (see R10). Charts with no fields read "Incomplete", as the prototype's `typeLabel()` does.

**N2. Built on typography: FIXED.** See F14.

**N3. Explore search box size: FIXED.** 260×28 at 12 px.

**N4. Folder rename height: FIXED.** It is 36 px. Its width is R7.

**N5. Crumb height and header rhythm: FIXED.** Crumbs are 24 px at 12/20, and the table card starts at y=144 in both.

**N6. ⌘K key hint: FIXED.** The `kbd` is 17 px tall, 12/600, `text-muted`, with a 1 px `border-strong` border at radius 4.

**N7. Avatar colour: FIXED.** See F3.

**N8. Palette Close radius: FIXED.** 32 px tall, padded 0 12, radius 6.

**N9. Palette layering and shadow: FIXED.**
- The backdrop's z-index is 20, and `elementFromPoint(400, 24)` over the app bar returns `.palette-backdrop`.
- The palette has the pop shadow in both themes, on `bg-raised` #252523 in dark.

**N10. Palette keeps the old query: FIXED.** Reopened with ⌘K, the query is "".

**N11. The row is not one target: FIXED.** The row has cursor pointer and fills with `bg-hover` #efeeea on hover. A click on the Type cell opened the dashboard.

**N12. Row painted at rest: FIXED.** At rest the cells are transparent.

**N13. Tree label underline: FIXED.** Hover gives `bg-hover` and `text-decoration: none`.

**N14. Move to… reflows the table: FIXED.** It opens as a 173×42 popover. The row stays 34 px and the Type column stays at x=775.6. Rename still reflows the table (R4).

**N15. New › Dashboard in view mode: NOT RE-MEASURED.** Checking it would create a dashboard. T245 records an e2e test for it.

**N16. The shell overflows at 390 px: STILL OPEN.** It is wider now; see R2.

**N17. A folder's Move to… misses its siblings: FIXED.** Archive's options are My workspace, Shared / Finance, Shared / Marketing and Shared / Operations.

## 2. New findings

**R1. The app never paints Inter: all UI text is in the platform face**
- **Severity:** major.
- **Evidence:**
  - CDP platform fonts in the app: the workspace tab, `h1` and row name are `.SF NS`; Built on is `IBM Plex Mono (web)`. `document.fonts` loads only IBM Plex Mono 400.
  - In the prototype, the same nodes are `Inter (web)`, and Inter 400/600 load from Google Fonts (index.html:11).
  - The computed `font-family` is "Inter, system-ui, …" in both, so the difference is invisible to `getComputedStyle`.
  - `packages/web/src/shell/fonts.ts` ships only Plex Mono; styles.ts:18 says Inter is "named, as Inter is, not shipped". No task or decision records that choice.
  - **Visible result:** workspace tabs are narrower at the same 14 px, padding 0 12. Model is 63.9 px against 65.2, Data sources 108.9 against 111.1, and Security 77.2 against 79.0, so Security starts at x=515.8 against 523.1. Every glyph shape on every surface differs from what the user approved.
- **Class:** (d). AC-187's Fails-when lists size and weight, not family, and §3's stack allows `system-ui` as a fallback. But the SHALL says "in the tokens of direction.md §3", whose family is Inter.
- **Fix direction:** ask the user whether Inter is to be shipped, as Plex Mono was for AC-223. If so, it needs a `docs/research/` doc (CLAUDE.md's import gate) and a task.

**R2. At 390 px the app bar overflows on every page, including the dashboards T250 made readable**
- **Severity:** major.
- **Evidence (at 390×844):**
  - The document is 845 px wide on `/explore/dashboards/seed-root-dashboard-1` and 844 on `/jobs`.
  - `.app-bar` is 390 wide, with a `scrollWidth` of 845.
  - The search trigger (x=591, squeezed to 176 px), the theme toggle (x=783, squeezed to **18×32**) and the avatar (x=817) sit on the page ground, beyond the bar's surface and rule.
  - "Data sources" wraps to two lines.
  - Scrolled to x=400, a dashboard shows blank ground under a bar with no surface (`app-dash-390-scrolled.png`).
  - **On Explore:** the tree takes 260 of the 390 px and the contents column is 130 px. The crumbs wrap; "＋ New ▾" wraps to 82×42; the search box is 82 px ("Search da"); the table scrolls inside a 130 px scroller.
  - The prototype has no narrow layout (it renders 964 px wide). At 1280 both fit with no overflow.
- **Class:** (d). No criterion covers the shell below 1,024 px. AC-179 covers 1,280, and direction.md §2 covers only dashboards below 1,024.
- **Fix direction:** put N16 to the user again, now with the dashboard case. T250's reading mode is defeated by the bar alone.

**R3. The Name column is not held at 40%, so columns jump between folders**
- **Severity:** minor.
- **Evidence:**
  - The Type column starts at x=862 in Shared, 776 in Finance and 478 in empty My workspace.
  - In the prototype it starts at x=737 in every folder: `th style="width:40%"` in explore.js:84, with Name 452 of 1130 px. The app's Name column is 490.6 px (43%) in Finance and 193 px when empty.
- **Class:** (d).
- **Fix direction:** fix the Name header at 40%, as the prototype does.

**R4. A row's Rename reflows the table**
- **Severity:** minor.
- **Evidence:**
  - With Rename open on Finance's first row, the Type column moves from x=775.6 to 817.0.
  - The name cell becomes a 150 px input with Save and Cancel, and the item's chip disappears.
  - The row stays 34 px, and its controls are 32 px at the cell's inherited 12 px, so they conform to `.btn` and `.input`.
  - N14 fixed the same reflow for Move to…. The prototype renames only in the header.
- **Class:** (d).
- **Fix direction:** keep the column widths while renaming, or rename in a popover like Move to.

**R5. The contents table takes two Tab stops per row, and the arrows do nothing from a name**
- **Severity:** minor.
- **Evidence:**
  - From "＋ New ▾", Tab visits 25 stops inside Finance's 12-row table: the focused `tr`, then each row's `.folder-contents__open` and ⋯.
  - The roving tabindex (`FolderContents.tsx:281`) makes the rows one stop, but the buttons inside them keep `tabindex=0`. That defeats the comment's stated aim of "one stop in the page's tab order".
  - ArrowDown twice from the first name button left focus on "Archive". The handler ignores keys whose target is not the row (line 215).
  - From a focused `tr`, ArrowDown twice reached row 3, and Enter opened it (AC-024 holds).
  - The prototype has one stop per row, and no controls inside rows.
- **Class:** (d). AC-024 passes; AC-176 (T182) is still open.
- **Fix direction:** give the name button and ⋯ `tabindex=-1` except on the current row, and let the arrows work from them.

**R6. The Explore workspace tab forgets the folder**
- **Severity:** minor.
- **Evidence:**
  - From Finance, open "Finance dashboard 1", then click the "Explore" tab. It lands on `/explore`, headed "Shared".
  - The prototype keeps its folder in `S.folder` across views.
  - AC-195's breadcrumb and reload both pass; neither covers the tab.
- **Class:** (d).
- **Fix direction:** have the Explore tab link to the last folder visited.

**R7. The folder rename field is narrower than the prototype's**
- **Severity:** minor.
- **Evidence:** it is 246×36 in the app, against 320×36. The prototype's `.input` is `width: 100%` with a 320 px maximum (explore.js:79); the app sets only the maximum. Height and 20/600 type match.
- **Class:** (d).
- **Fix direction:** set the width to 100% with the 320 px maximum.

**R8. Search results set folder names in the code face**
- **Severity:** minor.
- **Evidence:**
  - In search, a chart's Built on reads "— · Archive" or "cube: orders · Finance", all in IBM Plex Mono, because the whole cell is `is-code` (`FolderContents.tsx:85`).
  - The prototype appends the folder only to dashboards ("2 tabs · Sales"), in Inter `.xs.sec`.
  - A folder name, and the "—" placeholder, are not code.
- **Class:** (d).
- **Fix direction:** set only the source in mono, and the folder name in the table's face.

**R9. The browser's search-clear ✕ appears in the Explore search box and the palette field**
- **Severity:** minor.
- **Evidence:**
  - Both inputs are `type="search"` (ExplorePage.tsx:304, SearchPalette.tsx:184).
  - Once text is typed, Chrome draws its own blue ✕ (`app-search-light.png`, `app-palette-light.png`). In the palette it sits beside the Close button.
  - The prototype's `.input.sm` is a plain field with no ✕. The ✕'s colour is the browser's, not a token.
- **Class:** (d).
- **Fix direction:** hide the native clear control, or style it in the tokens.

**R10. A drawn chart's Type reads "KPI · auto" rather than "KPI"**
- **Severity:** minor.
- **Evidence:** the prototype's table shows the bare type (explore.js:90, `typeLabel`). Its "· auto" appears only on the chart page's badge (explore.js:108). AC-193 is met either way.
- **Class:** (d).
- **Fix direction:** confirm the wording with the user, or keep "· auto" to the chart page's badge.

**R11. The focus ring is offset 2 px, where the prototype's is 1 px**
- **Severity:** minor.
- **Evidence:** `:focus-visible` has `outline-offset: 2px` (styles.ts:4481) against `1px` in the prototype (index.html:397), measured on the Explore search box and a focused row. Both rings are 2 px solid `accent`. Outline is not among AC-187's properties.
- **Class:** (d).
- **Fix direction:** align the offset if strict parity is wanted.

**R12. Muted text on the accent tint is raised to `text-secondary`, and direction.md §7d does not record it**
- **Severity:** minor.
- **Evidence:**
  - The selected folder's count is #5c5b57 (dark #b4b3ab) in the app; the prototype's is `text-muted` #76746f (dark #8e8c86).
  - A focused row's description and a focused folder's count get the same rule (styles.ts:1799–1800, T244).
  - The reason holds: `text-muted` on dark `accent-soft` is 4.28:1, below AA, and 4.50:1 in light.
- **Class:** (a), on AC-187's colour-token clause for the tree and table, but required by AC-005 and rule 2.
- **Fix direction:** record the exception in direction.md §7d with the other AC-187 exceptions.

**R13. The last row's bottom rule is dropped**
- **Severity:** minor.
- **Evidence:** the last `td` has `border-bottom: 0` in the app. The prototype keeps its 1 px `border-subtle` rule inside the card's border, so its table ends in a doubled line (y=377 and y=378).
- **Class:** (d). The app's single line is arguably cleaner.
- **Fix direction:** none needed unless strict parity is wanted.

**Not counted, noted:**
- **Ghost-button hover:** ghost-sm buttons (+ Folder, Rename, ⋯) fill with `bg-hover` on hover. The prototype's never fill, because `.btn.ghost { background: none }` comes after `.btn:hover` at equal specificity. §7d names `bg-hover` "for a hovered button", so this is not counted.
- **Search trigger hover:** the trigger is a button and fills with `bg-hover` too. The prototype's `.search` is a div with no hover rule. The change is #f0efec to #efeeea, a 1.01:1 difference.
- **Theme toggle padding:** it computes padding 0; the prototype's `.iconbtn` declares none, so the browser's 1px 6px applies there. The icon's rect is identical in both.

## 3. AC-187 conformance for this surface (1440×900; light values, with dark where a colour differs)

"yes (§5)" or "yes (§7d)" means equal to the prototype's rule after direction.md's replacement.

| Component | Property | App | Prototype | Conforms |
|---|---|---|---|---|
| App bar | height, padding, bottom rule, ground | 48; 0 12; 1 px #e3e2de (dark rgba(255,255,255,.1)); #fff (dark #1c1c1b) | same | yes |
| Brand / mark | size, radius, type, colours | 22×22 r5, 12/600, #fff on #1f6f86 (dark #1f1f1e on #4fb3d1); name 14/600 | same (dark ink #0f1d22) | yes (§5 `text-on-accent`) |
| Search trigger | size, padding, border, radius, ground, type, ink | 260×32, 0 10, 1 px #e3e2de, r6, #f0efec, 13 px, #6e6c67 | same; ink #76746f | yes (§5 `text-muted`) |
| Search trigger | hover ground | `bg-hover` #efeeea | no hover (#f0efec) | yes (§7d, "hovered button") |
| ⌘K kbd | height, padding, border, radius, type, ink | 17, 0 4, 1 px #c9c7c1, r4, 12/600, #6e6c67 | same; ink #76746f | yes (§5) |
| Theme toggle | size, radius, border, ink | 32×32, r6, 1 px transparent, #5c5b57 | same | yes |
| Theme toggle | padding | 0 | UA 1px 6px (no rule) | yes (no prototype rule; icon rect identical) |
| Avatar | size, radius, type, colours | 28×28, 50%, 12/600, #2d6ab4 on #e6eef8 (dark #7fb0ea on #1d2a3a) | same | yes |
| Workspace tab, current | height, padding, underline, type, ink | 47, 0 12, 2 px #1f6f86, 14/600, #1f1f1e | same | yes |
| Workspace tab, other | height, padding, type, ink | 47, 0 12, 14/400, #5c5b57 | same | yes (widths differ: R1) |
| Primary button (＋ New ▾) | height, padding, border, radius, type, colours | 32, 0 12, 1 px accent, r6, 14/600, #fff on #1f6f86 | same | yes |
| Ghost-sm (+ Folder, Rename, ⋯) | height, padding, border, radius, type | 24, 0 8, 1 px transparent, r6, 12/400 | same | yes |
| Crumb button | height, padding, radius, type, ink | 24, 2 4, r4, 12/20, #5c5b57 | same | yes |
| Palette Close | height, padding, border, radius | 32, 0 12, 1 px #c9c7c1, r6 | `.btn` same | yes |
| Menus (New, row ⋯) | width, padding, border, radius, shadow; items; chips | 220, 4, 1 px #c9c7c1, r6, pop; 28 px, 0 6, r4, 12 px; 22×22 r5 | `.picker` same | yes |
| Explore search | size, padding, border, radius, type | 260×28, 0 8, 1 px #c9c7c1, r4, 12 px | `.input.sm` same | yes (✕: R9) |
| Folder rename field | height, type, radius | 36, 20/600, r4 | same | yes (width 246 vs 320: R7) |
| Palette input | height, padding, border, radius, type | 32, 0 8, 1 px #c9c7c1, r4, 14 px | `.input` same | yes |
| Move-to select | height, padding, border, radius | 32, 0 4 0 8, 1 px #c9c7c1, r4 | `.select` same | yes |
| Folders pane | position, size, ground, rule | (0,48) 260×852, #fff, 1 px right #e3e2de | same | yes |
| Pane head / h2 | height, padding, rule; type | 44, 8 12, 1 px #e3e2de; 14/20/600 | same | yes |
| Tree row | height, padding, indent, type, radius | 28, 0 12, +14/level, 12 px, r0, 259 wide | same | yes |
| Tree row, selected | colours, weight | #e3f0f4 / #1f6f86, 600 (dark #173640 / #4fb3d1) | same | yes |
| Tree chip / count | size, radius, colours; count type | 18×18 r5 #f0efec / #5c5b57; 12 px #6e6c67 | same; count #76746f | yes (§5) |
| Tree count, selected row | ink | #5c5b57 (dark #b4b3ab) | #76746f (dark #8e8c86) | **no** (R12, required by AC-005) |
| Tree hover | ground, decoration | #efeeea, none | #e9e8e4, none | yes (§7d) |
| Folder title | type | 20/26/600 | same | yes |
| Table card | border, radius, ground | 1 px #e3e2de, r6, #fff | same | yes |
| Header row / th | height, padding, type, colours | 28, 0 8, 12/600, #1f1f1e on #f0efec, 1 px rule | same | yes |
| Body row / td | height, padding, type, rule | 34, 0 8, 12 px tnum, 1 px #e3e2de | same | yes |
| Last row | bottom rule | 0 | 1 px #e3e2de | **no** (R13) |
| Name / row chip | type; chip size, radius, tints | 12/600; 22×22 r5, dash #7a3fb0 on #f1e9f8, chart accent on accent-soft | same | yes |
| Type / Built on | ink, face | #5c5b57; tabs #5c5b57, items #6e6c67, source Plex Mono #1f1f1e | same | yes (§5) |
| Name column | width | 43% (490.6 px), 193 px when empty | 40% (452 px) | **no** (R3) |
| Row hover / focus / rest | ground | #efeeea / #e3f0f4 / none | #e9e8e4 / (`.sel` #e3f0f4) / none | yes (§7d) |
| Footnote | type, ink | 12/16, #6e6c67 | same, #76746f | yes (§5) |
| Empty / no-result row | height, alignment, ink | 120, centred, #5c5b57 | same | yes |
| All text | painted face | SF (`.SF NS`) | Inter (web) | outside the Fails-when's list (R1) |

**Verdict:**
- For the components AC-187 names that are on this surface (the app bar, workspace navigation, and buttons and inputs), no measured property differs from the prototype's rule or its §5/§7d replacement, in either theme. The Fails-when is not met on this surface.
- The three "no" rows are in the tree and table, outside AC-187's named list.
- **R1 is the open question for ticking.** The SHALL's "tokens of direction.md §3" includes the Inter family, which the app never paints. Whether that blocks the tick is for the user.

## 4. What passes

- **Rule 1 and AC-004:** 9 states × 2 themes were audited, from 25 to 159 text nodes each. None is below 12 px. The table and tree counts use tabular figures.
- **Rule 2 and AC-005:** 0 contrast failures in all 18 audits. The states were Finance at rest, a hovered row, a focused row, the New menu, the row menu, the palette with an option active, search, the empty folder, and a tree hover.
  - Lowest light ratio: 4.52:1 (tree count on `bg-hover`).
  - Lowest dark ratio: 4.67:1.
- **Rule 17 (at 1440 and 1280):** tree rows are 28 px; primary, secondary, input and select controls are 32 px; ghost-sm buttons and crumbs are 24 px.
- **Rule 24:** the dark theme is authored: wallpaper #121211, surfaces #1c1c1b, raised #252523, accent #4fb3d1, and translucent white borders.
- **1280×800:** nothing overflows (the document is 1280 wide). The table card is 972 px wide in both, and the search, toggle and avatar sit at the same x in both.
- **AC-001:** the six workspaces, with no Dashboards entry.
- **AC-002:** the folder is in the URL.
- **AC-003:** at list scrollTop 400, switching the theme kept the URL and the scroll, and the table ground went from #fff to #1c1c1b.
- **AC-006:** Meta+K and Ctrl+K both open the palette with focus in `.palette__input`.
- **AC-017 and AC-019:** the listing columns are present, and the in-page search finds items across folders.
- **AC-024:** from a focused row, ArrowDown twice reached row 3 and Enter opened the folder. R5 covers the name-button case.
- **AC-190, AC-191:** the palette search for "order" gave Chart ×1, Measure ×6, Dimension ×6 and Model file ×4, each with its type; arrows and focus return work.
- **AC-192, AC-193, AC-194, AC-195:** all hold.
- **AC-231:** titles are 20/600, rows 34 px, cells 12 px, figures tabular.

**Relevant files**
- **Prototype:** `docs/design/prototype/index.html`
  - fonts at line 11;
  - `:focus-visible` at 397, `.topbar` at 434, `.search` at 484, `.avatar` at 518;
  - `.btn` at 551, `.btn.ghost` at 574, `.input` at 583;
  - `.pane-head` at 677, `.picker` at 955, `.grid-table` at 1089, `.file` at 1429;
  - `.crumbs` at 2297, `.itemicon` at 2316.
- **Prototype Explore:** `docs/design/prototype/explore.js`: tree at 43–55, browse at 57–97, the 40% header at 84, the type label at 38–41.
- **App styles:** `packages/web/src/shell/styles.ts`
  - body font at 49 and buttons at 70;
  - inputs at 116 and `.app-search` at 212;
  - Explore at 271–357;
  - tree at 1118–1195;
  - table at 1224–1345 and 1794–1812;
  - palette at 4401–4475;
  - `:focus-visible` at 4481.
- **App components and fonts:**
  - `packages/web/src/shell/fonts.ts` ships Plex Mono only (R1).
  - `packages/web/src/workspaces/explore/FolderContents.tsx`: `is-code` at 85, the key handler at 211–243, the roving `tabIndex` at 281, the name button at 349.
  - `packages/web/src/workspaces/explore/ExplorePage.tsx:304` and `packages/web/src/shell/SearchPalette.tsx:184`: `type="search"`.
- **Measurement scripts and screenshots:** `/private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/critique-shell/`
  - scripts: `cmp-main.mjs`, `cells.mjs`, `hover.mjs`, `tree.mjs`, `menus.mjs`, `palette.mjs`, `states.mjs`, `audit.mjs`, `fonts.mjs`, `narrow.mjs`, `bar390.mjs`, `keys.mjs`, `tabstops.mjs`, `rowrename.mjs`, `folderrow.mjs`, `theme.mjs`;
  - screenshots: `app-finance-1440-{light,dark}.png`, `proto-sales-1440-{light,dark}.png`, `app-palette-light.png`, `app-search-light.png`, `app-empty-light.png`, `app-390-full.png`, `app-dash-390-scrolled.png`, `app-rowrename.png`.
- **Earlier reports:** `docs/design/critiques/2026-09-24-shell-explore.md` and `docs/design/critiques/2026-09-24-recheck-shell-explore.md`.
