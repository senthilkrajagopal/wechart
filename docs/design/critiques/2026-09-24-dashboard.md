# Dashboard surfaces critique: view, edit, settings and markings (2026-09-24)

Produced by the `design-critic` agent and saved verbatim, as part of the
prototype-alignment pass the user asked for on 2026-09-24.

**Compared:** the app at http://localhost:5400 against the prototype at http://127.0.0.1:5500/index.html#explore ("Northwind sales"), both at 1440×900, light and dark.

**Method:** computed styles through `evaluate_script`, accessibility snapshots, and the interactions below. Screenshots were taken inline; the tool refused to write them to the scratchpad path.

**Dashboards used:**
- The seed dashboard `seed-root-dashboard-1` ("Company dashboard 01").
- A dashboard I created and saved in the root folder: **"Critique layout 0924"**, id `8dc71321-ba8d-4cba-b23f-03d039390c43`. It holds a Markdown tile, the KPI row, Two charts, a Section and Chart with notes. Nothing was deleted.

**Edits to the seed:** every edit was discarded or dropped with a reload, and the seed was never saved. The app's theme is back to light. The prototype is back in dark, which is how I found it.

**Prototype source read:** `docs/design/prototype/dashboard.js`.

## 1. Summary

1. **Two core panels are empty placeholders.**
   - Settings › Markings reads "Nothing to set here yet.": no marking list, no "+ New marking", no "Tiles and markings" table.
   - The edit sidebar's Outline tab renders an empty `tabpanel`.
   - In the prototype these are the main ways to manage markings and to find your way around a dashboard's structure.
2. **The page frame is structured differently.**
   - Page tabs and the filter bar sit inside the scrolling canvas, so they scroll away.
   - The filter bar only appears once something is marked or filtered, and then pushes every tile down 45 px.
   - The header has no breadcrumb back to the folder, no Published badge and no Markings button.
3. **Tile chrome and marking UI are thinner than the prototype's.**
   - The view-mode ⋯ menu has one item, "Download CSV".
   - The marking chip shows the raw member id (`products.category = Components`) and has no ×, no ▾ menu and no "from ‹tile›".
   - The "n marked" badge sits on its own line above the title, and also appears on a Markdown tile that cannot mark.
4. **Sections render as a nested tile card.**
   - The heading is 21 px / 700 with a 20 px line height.
   - There is no collapse chevron and no "n items" count.
   - The prototype uses a light section band with a 36 px header, a ▾ chevron and a 16/600 title.
5. **Charts ignore the dark theme.**
   - Axis and legend text is `#54555a` on `#1c1c1b`: **2.3:1**.
   - Gridlines are `#dbdee4`, and the series use the light palette (`#2a78d6`, not dark slot 1 `#3987e5`).
   - The prototype's dark charts use `#b4b3ab` labels (6.83:1), `#2c2c2a` gridlines and the dark palette.

## 2. Findings

### View mode

**F1. The page tabs and filter bar scroll away with the tiles.**
- **Prototype:** `.dash-head`, `.dash-tabs` and `.filterbar` are fixed grid rows. Only `.dash-scroll` (starting at y=226) scrolls, so the marking chips stay visible while you scroll to a details tile.
- **App:** `.page-tabs` and `section.filter-bar` are children of `[data-testid=canvas-scroll]` (overflow-y: auto).
- **Evidence:** after `scrollTop=102`, the tabs were at y=−6 and the filter bar at y=39, underneath the 48 px top bar.
- **Severity / class:** major · STRUCTURE.
- **Fix:** keep the tabs and the filter band outside the scrolling region, as fixed rows above the grid.

**F2. The filter bar is missing until something is marked, and never shows the hint.**
- **Prototype:** the filter bar is always present. The right-hand group shows "Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks" when empty, and "Marking is off while editing" in edit mode.
- **App:** `section.filter-bar` is absent on the seed until the first mark. It then appears at 45 px and pushes every tile down 45 px (tile y moved from 157 to 202). No hint text appears in either mode.
- **Severity / class:** major · STRUCTURE (direction §2 Filter bar: "When the group is empty it shows a one-line hint").
- **Fix:** always render the filter band, with the empty-state hint in the chip group.

**F3. The dashboard header is missing the breadcrumb, the status badge and the Markings button.**
- **Prototype:** the header is 80 px.
  - A breadcrumb row: `← Explore / Sales /`, 24 px ghost button, 12 px.
  - Then the title, 24/600, with a Published badge.
  - Actions: Preview as, **Markings**, Schedule, Edit, ⚙.
- **App:** `header.dashboard__header` is 48 px and holds only the h1, Edit and ⚙. There is no way back to the folder except the top bar.
- **Severity / class:** major · STRUCTURE.
  - Direction §7a: "Markings panel (the Markings button in the view-mode header)".
  - Schedule may be legitimately deferred under the "defer scheduler" scope decision.
  - Preview-as exists elsewhere (AC-166), but has no entry point here.
- **Fix:** add the breadcrumb row, and the Markings panel button when the dashboard is in Markings mode. Decide explicitly whether Preview-as and Schedule belong in this header in phase 1.

**F4. The view-mode tile ⋯ menu has one item.**
- **Prototype:**
  - Marked-rows group, headed "● Marking · n marked": Filter to marked, Filter out marked, View marked rows, Copy marked values, Invert marking, Mark all, Unmark, Create details tile.
  - Then View full screen, View as table, View query (Cube JSON + SQL), Download CSV, Edit chart.
- **App:** the popover contains only "Download CSV" (snapshot `uid=5_0`), and it has no `role=menu`.
- **Severity / class:** major · AC. AC-113, AC-114 and AC-115 are open, and "Create details tile" is in direction §7a.
- **Fix:** give the menu the prototype's two groups. The marked-rows group only needs to appear in Markings mode, but it should be visible (disabled) even with nothing marked.

**F5. The marking chip is not a real chip.**
- **Prototype:** `.mchip` is 24 px, radius 999, with a **1.5 px border in the marking colour** on `bg-surface`. It contains a swatch, the name "Marking" (600), the summary "Category: Meat/Poultry", "from Revenue by category", a ▾ menu (Filter to/out marked, View marked rows, Copy link with marks, Unmark) and ×.
- **App:** `span.mark-chip` is 24 px, radius 999, **no border**, bg `#f0efec`, and the whole text is 600. It has only the swatch and the text "Marking: products.category = Components". There are no buttons inside it.
- **Severity / class:** major · STRUCTURE. AC-098 passes because the chip names the marking and summarises it. But direction §8 lists the MarkingChip as swatch, name, value summary, source tile, menu, ×, and Principle 3 says chips "can be cleared".
- **Fix:** use the member's title rather than its id, add "from ‹tile›", and add the menu and the × to unmark.

**F6. The "n marked" badge is in the wrong place, and appears on tiles that do not mark.**
- **Prototype:** `.mbadge` is a pill in the tile-head row, right-aligned beside the title: 20 px, 12/600, `border-strong`, radius 999, "● 1 marked". The cache badge is hidden while it shows.
- **App:** `span.mark-badge` is an unbordered 12/400 text line, "■ Marking: 1 marked", placed **above** the title, which pushes the title down 65 px.
  - It also appears on the Markdown tile "Orders by status, this quarter." (x=745, y=220), which cannot mark.
  - It appears on "Orders over time by status" too.
- **Severity / class:** major · STRUCTURE. Direction §7a: the badge is shown by "every tile *using* that marking".
- **Fix:** move the badge into the header row as a pill. Show it only on chart tiles whose marking is non-empty.

**F7. Sections are nested tile cards with no collapse control.**
- **Prototype:** `.dsection` uses a subtle background, a 1 px `border-subtle`, 6 px radius and 8/12/12 px padding. `.dsection-head` is 36 px with a ▾ button (24×24), an h2 at 16/600/22 and "2 items" at 12 px muted.
- **App:** the section is a `.grid-tile` with `aria-roledescription="dashboard tile"`, 16 px padding and a white background.
  - The h2 is **21 px / 700 / line-height 20 px**. That is off the §3 scale, the weight is not allowed, and the line height is smaller than the font size.
  - There is no chevron and no count, and view-mode headers cannot collapse.
  - Its accessible name is the internal id "section-detail.", and on my dashboard "el-1790238490469-7.".
- **Severity / class:** major · STRUCTURE. Direction §2 says sections are "titled, collapsible, header can be hidden"; the heading is also a VISUAL violation of §3.
- **Fix:** render sections as a band with the prototype's header row, and a collapse toggle in both modes. Name the region by its title.

**F8. The tile header is crowded, and titles truncate.**
- **Prototype:** one status badge, "✓ 3m" (cache hit plus age). Pencil and ⋯ appear on hover (`.tile-actions` opacity 0 at rest).
- **App:** always-visible "● Live" and "as of 1:20:02 AM" pills, plus a "Table view" text button (77×24), plus hover ↻ ✎ ⋯.
- **Evidence:** at 6 of 12 columns in edit mode (538 px tile), the title truncates to "Orders by category and ...".
- **Severity / class:** minor · STRUCTURE.
- **Fix:** fold "Table view" into the ⋯ menu as "View as table", where the prototype puts it. Merge the two freshness pills into one icon-plus-age badge.

**F9. Charts leave a dead band at the bottom of the tile.**
- **Prototype:** x-axis labels at y=776 in a tile ending at y=808, which is 32 px including the 16 px padding.
- **App:** labels at y=393 in a tile ending at y=477, which is 84 px. `[data-testid=chart-canvas]` is styled 320 px high inside 286 px of content. ECharts sizes itself to 254 px and leaves about 60 px of empty grid margin.
- **Severity / class:** minor · VISUAL.
- **Fix:** size the chart to the remaining tile height, and trim the bottom grid margin.

**F10. The error state has no Retry and no Details, and reports the wrong cause.**
- **Test:** network set to Offline, then ↻ on "Orders by category and status".
- **Result:** the tile shows "⚠ Could not load this chart / This chart is no longer available." `.tile-error__actions` is empty, there is no `<details>`, and the tile title and ⋯ menu disappear.
- **Severity / class:** major · **AC-042** (Fails when: "the error state offers no Retry or no details"). Checklist 18 also fails.
- **Fix:**
  - Keep the tile header.
  - Separate "chart deleted" from "query failed".
  - Always offer Retry, plus a Details disclosure with the query and the error.

**F11. A new, empty dashboard renders a blank canvas.**
- **Prototype:** an empty page tab shows "Nothing here yet. Edit the dashboard to add charts.", and the tab bar is always present.
- **App:** "Critique layout 0924" as created shows only the h1, Edit and ⚙ over an empty page. There is no tab strip, even though edit mode reveals a "Page 1".
- **Severity / class:** major · STRUCTURE. Direction §6: "Every state has a shape".
- **Fix:** show the empty-state sentence with an Edit action, and always show the page-tab strip.

**F12. Markdown headings render literally.**
- **Prototype:** `## Title` renders as an h2, and each line is its own paragraph.
- **App:** the template Markdown tiles show "## New text Describe what this part of the dashboard shows." as one 14 px line, in both edit and view mode.
- **Severity / class:** major · STRUCTURE (the Markdown tile in direction §8).
- **Fix:** render the Markdown subset: headings, bold and line breaks.

**F13. Incomplete-chart placeholders are unstyled and use edit-only wording.**
- **Prototype:** an incomplete chart keeps its header (title, ✎, ⋯). The body shows a 12 px `sec` message plus "Use ✎ to finish it".
- **App:** there is no header at all. The body is centred 14 px text: "A kpi needs a measure in Measures; add 1 more. Add its fields in the chart editor: its ✎, or E when the tile is selected."
  - The text is shown in view mode too.
  - "kpi" is lower case.
  - On a 104 px KPI tile it runs to the bottom border: the text ends at y=216 and the tile at y=216, so the padding is lost.
- **Severity / class:** minor · STRUCTURE.
- **Fix:** keep the tile header, shorten the message to 12 px, and drop the keyboard hint outside edit mode.

**F14. Tile accessible names are internal ids.**
- **Prototype:** tiles are labelled "‹kind›: ‹title›".
- **App, view mode:** `group "tile-status. Arrow keys move…"`, `"tile-notes."`, `"section-detail."`.
- **App, edit mode:** `"chart tile. Arrow keys move…"`, and the menu is labelled "Actions for chart".
- **Severity / class:** minor · STRUCTURE (affects AC-176's intent).
- **Fix:** label every tile and its menu with the tile's title.

**F15. The whole dashboard shows a spinner while it loads.**
- **App:** under Slow 3G, the page shows "◌ Loading…" before any structure appears. Tiles then show a proper `tile-skeleton` with `data-shape="bars"`.
- **Severity / class:** minor · VISUAL (checklist 18's intent).
- **Fix:** render the header, tabs and tile frames immediately, with skeletons inside them.

### Edit mode

**F16. The Outline tab is empty.**
- **Prototype:** a tree of page tabs, then items (with sections and tab groups nested), each row with a kind icon. Clicking a row selects the item.
- **App:** `<div role="tabpanel" aria-labelledby="edit-sidebar-tab-outline" class="edit-sidebar__panel"></div>`, with no children.
- **Severity / class:** **blocker** · **AC-053** (the Outline must be present) and direction §2 ("Clicking a row selects and scrolls to it").
- **Fix:** populate the tree.

**F17. Discard does not leave edit mode, so there is no exit without saving.**
- **Prototype:** Discard restores the snapshot and sets `S.edit = false` (`dashboard.js` line 1442ff). Discard is always enabled.
- **App:** Discard reverts the session but stays in edit mode, and becomes disabled with 0 changes. The only way out is Save, which writes, or a reload.
- **Severity / class:** major · STRUCTURE.
- **Fix:** Discard should revert and return to view mode, and stay enabled with zero changes.

**F18. The edit-mode tile ⋯ menu is clipped, and is missing items.**
- **App:** the popover has `max-height: 200px; overflow-y: auto` and a scrollHeight of 269.
  - Items shown: "Overview › Detail", "Appendix", "Appendix › Terms", "Appendix › Terms › Measures", "Appendix › Terms › Dimensions".
  - **Duplicate (y=401) and Delete (y=433) are below the fold.** `elementFromPoint` confirms they are hidden.
  - There is no "Move to" label, no Save to folders… or Make a local copy, no Create details tile, and no `role=menu`.
- **Prototype:** Duplicate, then Save to folders… or Make a local copy, then Create details tile, then a "Move to" heading with its targets, then a rule and Delete in red.
- **Severity / class:** major · STRUCTURE (direction §2 names Duplicate, Move to, Delete, Save to folders…, Make a local copy).
- **Fix:** use the prototype's order, with Duplicate first, Delete last, and only the Move-to list scrolling.

**F19. Selecting a tile does not open its Properties, and the Properties panel is incomplete.**
- **Selection:** in the prototype, clicking a tile sets `S.side='props'` (line 1366ff). In the app the sidebar stays on Add, and its text becomes "Adds to Overview, after chart tile." using a generic name rather than the title.
- **Properties, prototype:**
  - A Chart section: title, "Stacked area · view:sales", a primary "✎ Edit chart" button, Ownership.
  - A Marking section: Marking select "(default)", a "Use separate color for marked items" switch, limit checkboxes with swatches, "Manage markings…".
  - A collapsed LAYOUT readout.
- **Properties, app:**
  - The Marking select sits at **0 px inset**: `.edit-sidebar__panel` has padding 0 and the select runs x=1141–1440. It is 24 px tall, against the prototype's 28.
  - There is no Chart section, no Edit chart button, no separate-colour switch, no swatches, no Manage markings link and no layout readout.
  - The dashboard-level "Page tabs" list (Delete buttons only) is shown under a tile's properties.
- **Severity / class:** major.
  - STRUCTURE.
  - AC-085 / §7a: "Use separate color for marked items" belongs to Tile Properties › Marking.
  - VISUAL for the padding.
- **Fix:** switch to Properties on selection, and give the panel the prototype's sections with the 12 px section inset.

**F20. The title and tab row do not change in edit mode.**
- **Prototype:** the h1 becomes "Editing Northwind sales" at 20 px with a muted "Editing", and the tab row gains a "+ Page tab" ghost button.
- **App:** the h1 stays "Company dashboard 01" at 24 px, and the tab row has no "+ Page tab".
- **Severity / class:** minor · STRUCTURE.
- **Fix:** add both.

**F21. Nothing on the canvas signals edit mode at rest.**
- **Prototype:** `.tile.editing` has a `1px dashed border-strong` outline, the ⠿ grip is always visible (opacity 1), and the resize handles are visible.
- **App:** `.grid-tile__grip` is opacity 0 until hover, and tiles have no editing outline. Only the faint grid in the gutters gives the mode away.
- **Severity / class:** minor · STRUCTURE.
- **Fix:** show the grips and the dashed outline in edit mode.

**F22. A dense time-series chart draws nothing in edit mode.**
- **App:** "Orders over time by status" renders 243 bars (81 dates × 3 series) at `getBBox().width = 0.00` once the canvas narrows for the sidebar. The plot is blank axes.
- **Severity / class:** major.
  - AC-043's failing state ("the tile renders blank axes with no message") occurs, even though rows returned.
  - The seed's data shape makes this chart dense, but it is the renderer that drops the bars.
- **Fix:** enforce a minimum bar width, or fall back to a line or aggregate. Never render an empty plot for non-empty data.

**F23. The sidebar palette and add slots are simplified.**
- **Palette:** the prototype's rows have a 24×24 kind icon (▦ ⛓ ▤ ⊟ M↓ H — ◩ ↗ ⏷); the app has none.
- **Section templates heading:** 12/600 in both, but the app sets `text-transform: uppercase`.
- **Add slots:** the prototype's "＋ Add" is 56 px / 600, and an empty tab reads "＋ Add a chart, section or text". The app's is 32 px / 400, "＋ Add here".
- **Sidebar position:** the app's sidebar starts at y=96, beside the page tabs. The prototype's starts at y=226, below the filter band.
- **Severity / class:** minor · STRUCTURE / VISUAL.
- **Fix:** follow the prototype.

### Settings page

**F24. Settings › Markings has no content.**
- **Prototype:**
  - An intro line.
  - A marking table: colour slots, name input, Default radio, "Used by n · limits n", Delete.
  - "+ New marking".
  - A "Tiles and markings" table: Marks with, and Limited by with checkboxes and swatches.
- **App:** "Markings / Nothing to set here yet."
- **Severity / class:** **blocker** · AC-084 and AC-085, plus direction §2 Settings › Markings. AC-084 is ticked, yet no marking can be created, renamed, recoloured or made default from the UI.
- **Fix:** build the two tables.

**F25. Settings › General is missing Folder and Description.**
- **Prototype:** Name and Folder side by side (280 px each), then Description as a textarea.
- **App:** Name only.
- **Severity / class:** major · STRUCTURE (direction §2: "General: name, folder, description").
- **Fix:** add the two fields.

**F26. The settings header and nav differ from the prototype.**

| Element | Prototype | App |
| --- | --- | --- |
| Bar | 41 px, 8/16 px padding, `bg-surface` | 48 px, **0 px side padding**: Back at x=0, Save settings at the right edge x=1440 |
| "Dashboard settings" title | 16 px / 700 | none |
| Back, Cancel, Save settings | 24 px buttons, 12 px | 32 px, 14 px |
| Save settings style | primary: `#1f6f86`, white, 600 | **not primary**: `#efeeea` background, 400 |
| Nav | 220 px wide, 32 px rows, 12 px text | 280 px wide, 36 px rows, 14 px text |
| Selected nav row | accent tint `#e3f0f4` and accent text | grey `#f0efec` |
| Content | flat on the page | inside a white bordered card |
| Section h2 | 18 / 700 | 21 / 700 |

- **Severity / class:** major for the unstyled primary action and the missing inset; the rest minor · VISUAL / STRUCTURE.
- **Fix:** follow the prototype's `.settings-head` and nav rules, and make Save settings the primary button.

**F27. The interaction-mode cards have no explanation.**
- **Prototype:** two side-by-side radio cards (≈432 px each) with a bold title, a descriptive paragraph and a muted provenance line ("Spotfire-style · Ctrl/⌘ adds or toggles · Esc unmarks"). The selected card has a 2 px accent border and a tint. A footnote says switching clears marks.
- **App:** two stacked 46 px one-line cards (520 px wide) with no descriptions. The selected card has a 1 px accent border on grey `#f0efec`. The native radio uses `accent-color: auto` (Chrome blue) and is white in dark mode.
- **Severity / class:** minor · STRUCTURE / VISUAL.
- **Fix:** add the descriptions and the switching note. Theme the radios with the accent colour and `color-scheme`.

**F28. The inactive section has no banner.**
- **Prototype:** the inactive Cross-filtering section opens with a warning bar: "⚠ Inactive: this dashboard uses Markings. These settings apply if you switch to cross-filtering."
- **App:** the nav label says INACTIVE, but the section itself does not.
- **Severity / class:** minor · STRUCTURE (checklist 56 is satisfied by the nav label).
- **Fix:** add the banner.

**F29. Esc does nothing on the settings page.**
- **Test:** with an unsaved mode change and focus on the page, pressing Escape did nothing. There was no prompt and the page did not close.
- **Severity / class:** minor · STRUCTURE. Direction §2: "Esc cancels, and asks first if there are unsaved changes." Cancel does ask, so AC-073 passes.
- **Fix:** bind Esc to the same path as Cancel.

### Dark theme

**F30. Charts use ECharts' light theme in dark mode.**
- **App (confirmed after reload in dark):**
  - SVG text fill `#54555a` on `#1c1c1b` = **2.3:1**.
  - Grid strokes `#dbdee4` (bright white lines).
  - Series fills `#2a78d6`, `#eb6834`, `#1baf7a` (the light palette).
  - Legend swatches carry a 2 px `#ffffff` stroke.
- **Prototype (ECharts option):** labels and legend `#b4b3ab`, split lines `#2c2c2a`, series `#3987e5` (dark slot 1).
- **Severity / class:** **blocker** for dark-mode legibility · VISUAL (checklists 2 and 24).
- **Fix:** give the chart renderer the dark theme tokens and the dark categorical palette, and re-render when the theme switches.

## 3. What already matches

- **Dashboard title:** h1 is 24/600/32 px, the same as the prototype.
- **Page tabs:** buttons are 13/600, 36 px tall with 0 12 px padding, and the tablist is 45 px with 8/24/0 px padding. Both are identical to `.dash-tabs`. They sit above the filter band with 24 px side insets (direction §7d).
- **Edit and gear buttons:** Edit is 32 px, radius 6, `#1f6f86`, 14/600, with the pencil icon. The gear is 32×32. Both match the prototype.
- **Tiles:** 16 px padding, 6 px radius, 1 px `#e3e2de` border, `box-shadow: none` (checklist 16). Tile title 14/600 (`text-sm-strong`), the same as the prototype's h3.
- **Grid:** `repeat(12, minmax(0,1fr))` with a 16 px gap. Tiles are whole columns (688 px = 6 of 12) and heights are multiples of 8 (320, 104). This covers checklist 15 and AC-054. The faint 12-column grid shows in edit mode as a repeating gradient.
- **Edit bar:**
  - Undo and Redo are 32 px icon buttons, dimmed when unavailable.
  - Discard is 32 px / 14 / 400 with a border.
  - Save is primary, 32 px / 600.
  - Discard counts changes ("Discard (1 change)", "(5 changes)"). This covers AC-053's edit bar.
- **Edit sidebar:**
  - It is 300 px with Add, Outline and Properties tabs, 36 px high at 12/600, with the accent on the selected tab. This is identical to the prototype.
  - Palette rows are 275×52 with a 1 px `border-subtle`, radius 6 and 6/8 px padding.
  - All ten element types are offered (AC-058), and Filter expands into Date range, List with search, Numeric range, and so on (AC-076).
- **Section templates:** insert empty charts that state what they need, for example "This chart has no fields yet." (AC-068).
- **Resize:** dragging the SE handle shows the live readout "7 / 12 cols · 58% · 360 px", strengthens the grid during the drag, and increments Discard. There are no size fields (AC-055, checklist 36).
- **Keyboard affordance:** edit-mode tiles describe "Arrow keys move. Shift and arrow keys resize. E edits. Enter opens its properties. Delete removes." (AC-057 surface).
- **Filter pill:** 32 px, 13 px, radius 6, `1px #c9c7c1`, padding 0 6 0 10. The "Dashboard" scope tag is 12/600, 22 px, radius 3, `border-subtle`. The filter band is 53 px with 10/24 padding and a bottom rule. All identical to the prototype's `.fw`, `.scope` and `.filterbar`. This covers checklist 14 and AC-077.
- **Marking rendering:**
  - Marked bars keep their fill and gain a 1.5 px stroke in `mk1`: `#151107` in light, `#f2f2f2` in dark.
  - Unmarked bars get `fill-opacity` 0.28 (checklist 49, AC-096).
  - The chip and badge name the marking and count it (AC-098).
  - The live region announces "Marking: 1 item marked in Orders by category and status" (AC-101).
- **Legend:** shown for the 3-series charts (checklist 4).
- **Loading:** tiles show a `tile-skeleton` with `data-shape="bars"` while loading (AC-042, loading half). A manual refresh keeps the chart and shows "Updating…".
- **Settings page:**
  - Five sections: General, Interactions, Markings, Cross-filtering, Layout (AC-069).
  - Active and Inactive labels pair an icon with text (checklist 3). Switching the mode moves the labels, and the page says the other configuration is kept (AC-070, checklist 56).
  - Cross-filtering has "Default for tile pairs" as a Filter/Highlight/None segmented control and a source × target matrix of selects (checklist 32).
  - Layout offers "Fixed width, centred at 1,440 px" or "Full width" (AC-075 control).
  - Cancel with unsaved changes asks "Discard your changes? … Keep editing / Discard changes" (AC-073).
- **Dark theme outside the charts:**
  - Tokens resolve correctly: page `#121211`, tile `#1c1c1b`, borders `rgba(255,255,255,.10)`.
  - Badges use `#b4b3ab` on `#2a2a28`.
  - The chip uses `#f2f2f0`.
  - The dark accent on Edit and Save is `#4fb3d1`.

### Gaps caused by the seed data, not the app

- The seed has no dashboard filters, KPI tiles, tab groups, image or link tiles, description, or second marking. So I could not observe:
  - view-mode filter pills with values;
  - the KPI "Marked $X · p%" badge;
  - tab-group rendering;
  - multi-marking chips.
- The time-series tile has 81 dates × 3 statuses, all with the value 1. That makes the bar chart unusually dense (see F22).
- **Not exercised:**
  - cross-filter mode clicks, which would have meant saving a mode change on the seed;
  - drag-to-move and drop markers;
  - keyboard move and resize.
