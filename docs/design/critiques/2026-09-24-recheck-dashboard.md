# Re-critique: dashboard view, edit and settings against the design prototype (2026-09-24, after T208–T242)

Produced by the `design-critic` agent for T225 (AC-187) and saved verbatim.

**What was compared**
- **App:** http://localhost:5400 (production build, real API).
  - `seed-root-dashboard-1` ("Company dashboard 01") for view, marking, edit, Outline, Properties, tile menus, sections, the Appendix tab group and Settings.
  - `seed-folder-0-item-1` ("Finance dashboard 1", Shared › Finance, empty) for the empty state.
  - "Critique layout 0924" (made by the earlier critique) for Markdown and incomplete charts. I only viewed it.
- **Prototype:** http://127.0.0.1:5500/index.html#explore, then "Northwind sales" in view, edit, Properties, Outline and Settings.
- **How:** both at 1440×900 in light and dark, plus 390×844.
  - Values come from `getComputedStyle` and `getBoundingClientRect` on the matching element in each.
  - The prototype draws charts on canvas, so its chart values come from `echarts.getInstanceByDom().getOption()`.
  - Screenshots were taken inline only; none were saved.
- **Tokens:** where direction.md §5/§7d replaces a prototype value (for example `text-muted` #6e6c67 for #76746f), that difference is not counted.

**Nothing was saved or deleted, and I did not need to create "Critique 0924c".** Every edit was thrown away:
- a keyboard resize and an added "List with search" filter were discarded with Discard;
- an interaction-mode change in Settings was dropped with Cancel › Discard changes.

Both apps are back in light theme at 1440×900.

**Summary:**
- Of the 30 earlier findings, **16 are FIXED and 14 STILL OPEN**, 6 of those partly fixed.
- There are **10 new findings**. Three are major:
  - tab-group tabs show no selected state;
  - below 1024 px the tiles don't stack and chart titles disappear;
  - a linked tile says "Marking: 1 marked" but draws all 240 bars faded.
- **AC-187 does not conform:** 35 measured mismatches, listed in section 3.

## 1. Earlier findings

**F1. Tabs and filter bar scroll away: FIXED**
- `.dashboard__fixed` is `position: sticky; top: 0` with a `bg-page` fill.
- At canvas `scrollTop` 107, the tab row stayed at y=124 and the filter bar at y=169, and tiles scroll under them.
- The canvas scrollbar still runs up beside the tabs, because the sticky band sits inside the scroll container. The prototype's `.dash-scroll` starts at y=226.

**F2. Filter bar missing until marked; no hint: FIXED**
- `section.filter-bar` is always present.
  - View mode shows "Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks".
  - Edit mode shows "Marking is off while editing".
- Remaining differences: the hint colour and line height (mismatch 6) and the bar's changing height (N8).

**F3. Header lacks breadcrumb, status badge and Markings button: STILL OPEN (partly fixed)**
- Fixed: the breadcrumb "← Explore / Shared".
- Still open:
  - no Published badge;
  - no **Markings** button, which direction §7a requires;
  - Preview as and Schedule are still undecided.
- The header is 76 px against 80 (mismatch 1).

**F4. View-mode ⋯ menu has one item: STILL OPEN (partly fixed)**
- The menu now reads, in order:
  - "● Marking · 1 marked" (shown as "0 marked" when nothing is marked);
  - Invert marking, Mark all, Unmark (disabled when nothing is marked);
  - View as table, View query, Download CSV, Edit chart.
- Missing against the prototype: Filter to marked, Filter out marked, View marked rows, Copy marked values, Create details tile, View full screen.
- There is still no `role=menu` or `menuitem`.
- **AC-199 still fails**: the marked-rows actions are incomplete.

**F5. Marking chip not a real chip: FIXED**
- `span.mark-chip` is 24 px, radius 999, with a 1.5 px `mk1` border (#151107 light, #f2f2f2 dark) on `bg-surface`.
- It holds the name "Marking" (600), the summary "Products Category: Components" (the member's title), "from Orders by category and status", a ▾ menu and × (named "Unmark Marking"). AC-200 passes.
- The ▾ menu holds only "Unmark" (N10). Colour and size differences are mismatch 8.

**F6. Badge in the wrong place and on Markdown: FIXED**
- `span.mark-badge` sits in `.tile-head` beside the title. The Markdown tile no longer shows it. AC-201 passes.
- Style differences are mismatch 11.

**F7. Sections are nested cards with no collapse: FIXED**
- The band is padded 8 12 12, with a 1 px `border-subtle` border and radius 6.
- The head is 36 px: a 24×24 ▾ toggle, an h2 at 16/22/600, and "1 item".
- In view mode "Collapse Detail" shrinks the section from 386 px to 58, and the toggle becomes "Expand Detail". Its name is "Section: Detail."
- The band colour, count colour and toggle radius differ (mismatch 15).

**F8. Crowded tile header, truncated titles: STILL OPEN**
- "● Live" (54×22) and "as of 5:50:35 PM" (113×22) are both still there, plus "Table view" (77×24).
- Once marked, the title "Orders by category …" shows only 147 of its 205 px, in a 688 px tile in view mode.
- The prototype has a single "✓ 3m" badge, which is hidden while the marking badge shows, and "View as table" lives in the menu.

**F9. Dead band under charts: STILL OPEN**
- The x-axis labels end at y=470, but the chart body runs to y=529, leaving **59 px** of empty grid.
- The prototype's option is `grid.bottom: 8` with `containLabel: true`.

**F10. Error state: STILL OPEN (partly fixed)**
- Tested offline, then ↻.
- Fixed:
  - the title stays;
  - the cause is right: "Could not reach the server to read this chart. Check the connection, then retry.";
  - Retry recovered the chart once back online.
- Still open:
  - no `<details>` disclosure with the query and error (direction §6, checklist 18);
  - the ⋯ menu disappears in the error state (no `.tile-menu`).

**F11. Empty dashboard renders blank: FIXED**
- Finance dashboard 1 shows "Nothing here yet. Edit the dashboard to add charts." at 14/20 `text-secondary`, centred.
- Below it is a primary "Start editing" button (32 px), and the "Page 1" tab strip shows. AC-207 passes.

**F12. Markdown headings shown literally: FIXED**
- `## New text` now renders as a heading followed by its own paragraph. AC-208 passes for headings.
- The heading level and size differ from the prototype (N6).

**F13. Incomplete-chart placeholders: STILL OPEN (partly fixed)**
- "kpi" is now "KPI".
- Still open:
  - no tile header or title;
  - centred 14/20 `text-secondary` text;
  - the edit-only hint "…its ✎, or E when the tile is selected." shows in view mode;
  - on a 104 px KPI tile the text starts 10 px from the top (y=236 in a tile at 226), so the 16 px padding is lost.

**F14. Tile names are internal ids: FIXED**
- Tiles are named, for example:
  - "Chart: Orders by category and status. Arrow keys…";
  - "Markdown: Orders by status, this quarter..";
  - "Section: Detail.".
- Menus are "Actions for Orders by category and status" in view mode and "Actions for Chart: …" in edit mode. AC-209 passes.
- A leftover issue is N9.

**F15. Page-level spinner while loading: STILL OPEN**
- On Slow 3G, only "◌ Loading…" at (16,80) shows until the dashboard arrives. No header, tabs or tile frames are drawn first.

**F16. Outline is empty: FIXED**
- The tree shows:
  - page headings "Page: Overview" and "Page: Appendix";
  - 28 px rows at 12/20 with kind glyphs;
  - sections indented 26 → 40 px, and tab-group tabs down to "Empty".
- The selected row is `accent-soft` #e3f0f4 with `accent` 600 text.
- Clicking "Chart: Orders over time by status" selected that tile (2 px accent outline) and switched to Properties.
- Styling differences are mismatch 26.

**F17. Discard doesn't leave edit mode: FIXED**
- With 0 changes, Discard is enabled and returns to view mode.
- After a Shift+→ resize (538 → 630 px), "Discard (1 change)" put the tile back at 688 px in view mode. AC-204 passes.

**F18. Edit-mode ⋯ menu clipped and incomplete: STILL OPEN (partly fixed; AC-205 now passes)**
- The order is right:
  - Duplicate, then Save to folders…;
  - a "Move to" heading, with only its targets scrolling (`.tile-menu__targets` shows 168 of 192 px);
  - Delete last, at y=547, visible.
- Still missing: Create details tile, `role=menu`, and Delete in `status-error`. The style differs (mismatch 14).

**F19. Selection doesn't open Properties; Properties incomplete: STILL OPEN (partly fixed)**
- Fixed:
  - clicking a tile opens Properties;
  - Chart shows the title, "Bar · `orders`" and ✎ Edit chart;
  - then Ownership, Marking (select offering "(None)" and "Marking"), and a Layout readout "6 / 12 columns · 320 px tall";
  - the 12 px inset is correct.
- Still open:
  - no "Use separate color for marked items" switch (direction §7a);
  - no swatches in the limit list;
  - no "Manage markings…";
  - the dashboard-level "Page tabs" list (with Delete buttons) still appears under a tile's properties.
- Sizes differ (mismatch 25).

**F20. Title and tab row unchanged in edit mode: FIXED**
- The page shows "Editing Company dashboard 01" and a "+ Page tab" button. AC-206 passes.
- The size and colour differ (mismatches 3 and 5).

**F21. Nothing signals edit mode at rest: FIXED**
- Every tile has `outline: 1px dashed #c9c7c1; outline-offset: 2px`, the same as `.dtile.editing`.
- The ⠿ grip is at opacity 1.
- The grip's position differs (mismatch 19).

**F22. Dense chart draws nothing: FIXED**
- In edit mode, at a chart width of 1032 px, all 243 bars are at least 1 px wide and none is 0. AC-210 passes.

**F23. Palette, add slots and sidebar position simplified: STILL OPEN**
- There are still no 24×24 kind icons in the palette rows.
- The add slot reads "＋ Add here" at 32 px, 14/400.
- The sidebar still starts at y=124, beside the tabs, and cuts the filter band to 1140 px. The prototype's starts at y=226 under a full-width band.
- **Correction to the earlier report:** the prototype's "Section templates" heading *is* uppercase (`.section > h3 { text-transform: uppercase; letter-spacing: .04em }`). The app's 12/600 uppercase heading at 0.48 px letter-spacing matches it.

**F24. Settings › Markings empty: FIXED**
- The section has an intro line and a table: colour slots, a name input, a Default radio, "Used by 2 · limits 0", and Delete (disabled on the only marking).
- Below it are "+ New marking" and a "Tiles and markings" table with a "Marks with" select and "Limited by" checkboxes with swatches. AC-198 is reachable.
- The style differs (mismatch 34).

**F25. General lacks Folder and Description: FIXED**
- Name, a Folder select ("Shared") and a Description textarea are present.
- The layout and labels differ (mismatch 32).

**F26. Settings header and nav: STILL OPEN**
- This is unchanged, measured in mismatches 27–31:
  - the bar is 48 px with no padding: Back sits at x=0 and Save settings runs to x=1440;
  - there is no "Dashboard settings" title;
  - the buttons are 32 px at 14 px, radius 4;
  - **Save settings is not primary** (#fff, weight 400);
  - the nav is 280 px with 36 px rows;
  - the content sits in a white card;
  - the h2 is 21 px.

**F27. Mode cards have no explanation: STILL OPEN**
- There are two stacked 520×46 cards with one line each.
- The selected card has a 1 px accent border on `bg-subtle`.
- The radios use `accent-color: auto` (Chrome blue) and `color-scheme: normal`.
- There are no descriptions or provenance lines.

**F28. Inactive section has no banner: STILL OPEN**
- Cross-filtering opens straight on "Default for tile pairs". The inactive state is shown only by the nav's "◷ INACTIVE" label.

**F29. Esc does nothing on settings: STILL OPEN**
- Escape did nothing, both with no changes and with an unsaved mode change.
- Cancel does ask "Discard your changes?" with Keep editing / Discard changes, so AC-073 passes.

**F30. Charts ignore dark theme: FIXED**
- In dark:
  - axis and legend text is #b4b3ab;
  - series are #3987e5, #d95926 and #199e70;
  - legend icons are stroked #1c1c1b;
  - marked outlines are #f2f2f2.
- Gridlines are white at 0.1 opacity, which comes out near #333332; the prototype uses #2c2c2a. That is close enough that I haven't counted it. AC-211 passes.

## 2. New findings

**N1. Tab-group tabs have no selected state**
- **Where:** Appendix › Terms.
- **Prototype:** tab groups reuse `.dash-tabs`: 36 px, 13/600, selected tab `text-primary` with a 2 px `accent` underline, others `text-secondary`, all inside a `.dsection` band (dashboard.js:359–361).
- **App:** "Measures" (`aria-selected=true`) and "Dimensions" (false) are class-less 32 px bordered buttons at 14/400, radius 6, both `bg-surface`. A computed-style diff of 10 properties, plus `::before` and `::after`, shows no difference between them. The group is also wrapped in an extra white tile card inside the section.
- **Severity:** major.
- **Class:** STRUCTURE (a sighted user can't tell which tab is showing).
- **Fix direction:** style tab-group tabs with the page-tab rule, inside the section band, with no nested card.

**N2. Below 1024 px, tiles don't stack and chart titles vanish**
- **App at 390×844:**
  - Tiles stay side by side, each 163 px wide (x=24 and x=203).
  - In "Orders by category and status" the title is gone entirely.
  - The "Live" and "as of" pills overlap ↻ and ✎, and "Table view" wraps onto ✎.
  - Edit is still offered, and the gear wraps to its own line.
- **Direction §2:** "<1024: view mode only. Dashboards stack to one column, and the filter bar becomes a sheet." The prototype has no narrow layout, so this is measured against direction, not the prototype.
- **Severity:** major.
- **Class:** STRUCTURE (direction).
- **Fix direction:** below 1024, stack tiles to 12 columns, hide Edit, and keep the title as the one element that never gets squeezed out.

**N3. A linked tile claims marked items but draws none**
- **Steps:** after marking "Components" in "Orders by category and status", look at "Orders over time by status".
- **App:** it shows "■ Marking: 1 marked", but its 240 bars are all `fill-opacity: 0.28` with no outline. The only 3 paths at full opacity are the legend icons. About half the orders are Components, so a marked share should appear.
- **Why:** AC-097 (marked share) and AC-104 (the extra query) are still unticked. The problem is that the badge and chip say something is marked while the plot shows nothing marked.
- **Severity:** major.
- **Class:** AC (AC-097 and AC-104 open; checklist 49).
- **Fix direction:** until the marked-share query ships, draw the linked tile unfaded with a "Marked share not available yet" note rather than fading everything.

**N4. Tile ⋯ menus don't use the prototype's `.picker` rule**
- **Prototype:** 250 px wide, 1 px `border-strong`, `--shadow-pop`, 28 px items at 12/20, padding 0 6, radius 4, `role=menu`.
- **App:** `ul.tile-menu__list` is 180 px, 1 px `border-subtle`, no shadow, with 32 px items at 14/20, padding 4 8, radius 6, and no roles.
- The app's own marking-chip menu already matches `.picker` exactly (220 px, border-strong, pop shadow, 28 px / 12 px, `role=menu`).
- **Severity:** minor.
- **Class:** VISUAL (AC-187 tiles).
- **Fix direction:** reuse the chip menu's picker for both tile menus.

**N5. The Header element is drawn as a tile with a browser-default heading**
- **Prototype:** `.dplain`: no border, background or padding, and an h2 at 16, 20 or 24 px (by size), weight 600, line height 1.3.
- **App:** "Definitions" sits in an 87 px white tile with a 1 px border and 16 px padding. Its h3 is **16.38/20/700**, the browser's 1.17em bold. That size is off the §3 scale and 700 is outside the allowed weights.
- **Severity:** minor.
- **Class:** VISUAL / STRUCTURE.
- **Fix direction:** render Header without tile chrome, using the `text-md`, `text-lg` or `text-xl` tokens.

**N6. Markdown heading levels and body colour**
- **Prototype:** `##` gives an h2 at 20/26/600 (`text-lg`, "Markdown H2" in references.md). Body `p` is 14/22 `text-secondary`.
- **App:** `##` gives an **h3 at 16/22/600**. Body `p` is 14/20 `text-primary`.
- **Severity:** minor.
- **Class:** VISUAL (AC-187 tile body).
- **Fix direction:** map `#`/`##`/`###` to xl/lg/md, and use the prototype's body style.

**N7. Chart text isn't in Inter, and axes lack tabular numerals**
- **App:** SVG text is styled `font-family: sans-serif` with `font-variant-numeric: normal`.
- **Prototype:** `textStyle.fontFamily: "Inter, system-ui, sans-serif"`.
- **Severity:** minor.
- **Class:** VISUAL, plus checklist 1 ("axes use tabular numerals").
- **Fix direction:** pass the UI font to ECharts' `textStyle`, and set `tnum` on axis labels.

**N8. The filter band changes height with its contents**
- **App:** 41 px with only the hint, 45 px with a marking chip, 53 px with a filter pill. Tiles jump 4 px and 12 px.
- **Prototype:** always 53 px.
- **Severity:** minor.
- **Class:** STRUCTURE (layout shift).
- **Fix direction:** fix the band's minimum height at the height with a pill (53 px), and use the hint's 12/16 line height.

**N9. Markdown accessible names carry raw markup**
- **App:** "Markdown: ## New text\nDescribe what this part of t….", and "Markdown: Orders by status, this quarter.." with a double period.
- **Severity:** minor.
- **Class:** STRUCTURE (the intent of AC-209).
- **Fix direction:** build the name from the rendered text's first line, and don't append a period after one that's already there.

**N10. The chip ▾ menu holds only "Unmark"**
- **Prototype:** Filter to marked, Filter out marked, View marked rows, Copy link with marks, Unmark.
- **Severity:** minor.
- **Class:** AC-open (AC-113, AC-114).
- **Fix direction:** add those items as they land. Until then, show them disabled so the structure matches.

Also noted, minor VISUAL: Settings › Cross-filtering's segmented control stretches its bordered container to 420 px (`display: flex`), while its three buttons take 173 px. The prototype's `.seg` is `inline-flex`.

## 3. AC-187 verdict for this group: does not conform

**Conforms (measured equal to the prototype's rule):**
- **Dashboard title:** h1 24/32/600, letter-spacing −0.24 px.
- **Header buttons:**
  - Edit: primary, 32 px, padding 0 12, radius 6, 14/600, `accent` / `text-on-accent`;
  - gear: 32×32, radius 6;
  - Discard: 32 px, 14/400, `border-strong`;
  - Save: primary.
  - Dark `accent` is #4fb3d1.
- **Page tabs:** tablist 45 px, padding 8 24 0, 1 px `border-subtle`. Tabs are 36 px, padding 0 12, 13/600; selected `text-primary` with a 2 px `accent` underline, others `text-secondary`. The same in both themes.
- **Filter bar:** padding 10 24, `bg-page`, 1 px `border-subtle` bottom, gap 8; 53 px with a pill.
  - Pill: 32 px, padding 0 6 0 10, 1 px `border-strong`, radius 6, 13 px, `bg-surface`.
  - Scope tag: 22 px, 12/600 `text-muted`, 1 px `border-subtle`, radius 3, padding 0 4.
  - Summary: 13/600.
- **Marking chip:** 24 px, radius 999, 1.5 px marking-colour border, `bg-surface`, 12 px text, name at 600.
- **Tiles:**
  - 16 px padding, radius 6, 1 px `border-subtle`, no shadow, `bg-surface`, in both themes;
  - title h3 14/20/600; head gap 8, bottom margin 8;
  - action buttons 26×26, radius 6, hidden at rest;
  - grid of 12 columns with a 16 px gap, padded 16 24 40.
- **Marking badge:** 20 px, radius 999, 1 px `border-strong`, 12/600.
- **Section:** padding 8 12 12, 1 px `border-subtle`, radius 6; head 36 px, gap 8; toggle 24×24; h2 16/22/600.
- **Edit mode:** tile outline 1 px dashed `border-strong`, offset 2.
- **Edit sidebar:**
  - 300 px wide, 1 px left rule, `bg-surface`;
  - tablist 37 px, padding 0 8;
  - tabs 36 px, padding 0 10, 12/600; selected `accent` with a 2 px underline;
  - sections inset 12, headings uppercase 12/600;
  - palette rows have a 1 px `border-subtle` border, radius 6, padding 6 8, label 14/600, hint 12/16 `text-muted`;
  - template rows have a dashed `border-strong` border.
- **Properties controls:** select 28 px at 12 px, radius 4; Edit chart and Save to folders… are 24 px at 12 px, radius 6.
- **Outline:** rows 28 px at 12/20; selected row `accent-soft` / `accent` / 600.
- **Settings inputs:**
  - Name input: 32 px, radius 4, `border-strong`, padding 0 8;
  - selects: 32 px, padding 0 4 0 8;
  - textarea: radius 4, padding 6 8;
  - "+ New marking" and Delete: 24 px, radius 6;
  - segmented buttons: 28 px, 12 px, pressed in `accent` at 600.

**Mismatches:**

*Dashboard header and page tabs*
1. Header height 76 against 80. The breadcrumb is a 20 px link (padding 2 4, radius 4) against a 24 px ghost-sm button (padding 0 8, radius 6).
2. Breadcrumb colours: "← Explore" is `text-secondary` against `text-primary`, and the folder crumb is `text-secondary` against `text-muted`, in both themes.
3. Edit-mode title: 24 px against 20; "Editing" is `text-secondary` against `text-muted`.
4. Undo and Redo: a 16 px glyph in `text-muted` at opacity 0.5, against 14 px `text-secondary` at opacity 0.4.
5. "+ Page tab": 12/400 `text-primary`, against 12/600 `text-secondary`.

*Filter bar*

6. Hint: 12/20 `text-secondary`, against 12/16 `text-muted`, in both themes. This is why the empty band is 41 px (N8).
7. Band in edit mode: 1140 px wide beside the sidebar, against full width above it.
8. Chip:
   - padding 0 4 0 10 against 0 2 0 8;
   - summary `text-primary` against `text-secondary`;
   - "from" `text-secondary` at 12/20 against `text-muted` at 12/16;
   - swatch 8×8, radius 2, no ring, against 10×10, radius 3, with an inset `border-strong` ring;
   - buttons 18×18 with no padding, against 20×20 with padding 0 4.

*Tiles*

9. Tile head 24 px (because of "Table view", a 24 px button) against 20–22 px.
10. Freshness: two grey pills against one status-coloured cache badge. The cache badge is not hidden while the marking badge shows.
11. Marking badge: `text-primary` on a transparent background with padding 0 8, against `text-secondary` on `bg-subtle` with padding 0 6. Its swatch has radius 2 and no ring.
12. Chart body: 59 px of empty space below the axis labels, against an 8 px grid bottom.
13. Chart font: `sans-serif` against Inter (N7).
14. Tile ⋯ menus (view and edit):
    - 180 px, `border-subtle`, no shadow, against the picker's 250 px, `border-strong`, pop shadow;
    - 32 px items at 14/400, padding 4 8, radius 6, against 28 px at 12/400, padding 0 6, radius 4;
    - heading 12/20/600 `text-secondary` against 12/16/400 `text-muted`;
    - Delete in `text-primary` against `status-error` #c2362f.
15. Section:
    - band `bg-subtle` #f0efec (dark #2a2a28, lighter than the tiles), against a surface/page mix of about #fafaf9 (dark about #181817);
    - count `text-secondary` at 12/20 against `text-muted` at 12/16;
    - toggle radius 4 against 6.
16. Markdown: `##` becomes an h3 at 16/22 against an h2 at 20/26; the paragraph is `text-primary` at 14/20 against `text-secondary` at 14/22.
17. Header element: tile chrome and 16.38/20/700, against no chrome and weight 600 (N5).
18. Tab-group tabs: 32 px bordered buttons at 14/400 with no selected state, against 36 px at 13/600 with an `accent` underline (N1).
19. Grip: absolute, 20×20, `text-secondary`, in the tile corner, against inline in the head at 14/14 with padding 2 4 in `text-muted`.
20. Edit grid: 1 px `border-subtle` column lines, against column bands tinted 4% `accent`.
21. Incomplete-chart placeholder: no head and 14 px centred text, against a head plus a 12 px `text-secondary` message.

*Edit sidebar*

22. Sidebar top at y=124, beside the tabs and filter band, against y=226, below them.
23. Palette rows: 52 px with no kind chip (gap 2), against 50 px with a 24×24 chip (radius 4, `role-dim` on `role-dim-soft`, gap 10).
24. Add slot: "＋ Add here" at 32 px, 14/400, against "＋ Add" at 56 px, 14/600.
25. Properties:
    - chart title 13 px against 14;
    - Edit chart 92 px and Save to folders… 112 px wide, against full width (275);
    - "Limit data using markings" at 14/20/600 `text-primary`, against 12/16/600 `text-secondary`;
    - limit rows at 14/400, against 12/600 rows 28 px tall;
    - select padding 0 6 against 0 4 0 8;
    - selection outline offset −1 against 2.
26. Outline: kind glyph with no chip, against an 18×18 tinted chip; row padding 1 6 1 26 against 0 12 0 26.

*Settings page (buttons and inputs)*

27. Bar: 48 px, no padding, transparent, no rule, against 41 px, padding 8 16, `bg-surface`, 1 px `border-subtle`. The "Dashboard settings" title (16/700) is absent.
28. Back, Cancel and Save: 32 px at 14 px with **radius 4**, against 24 px at 12 px with radius 6. Radius 4 also breaks §7d's 6 px rule for buttons.
29. Save settings: `bg-surface` at 400, against primary (`accent` at 600).
30. Nav:
    - 280 px wide against 220;
    - rows 36 px at 14 px with radius 4, against 32 px at 12 px with radius 0 and padding 0 12 0 24;
    - selected row `bg-subtle` / `text-primary` / 600, against `accent-soft` / `accent` / 600;
    - other rows `text-secondary` against `text-primary`.
31. Content: an h2 at 21/20/700 against 18/20/700, inside a white card (1 px border, radius 6, 16 px padding), against flat content padded 16 24 48.
32. General: labels 14/20/400 `text-primary`, against 12/16/600 `text-secondary`. Fields are stacked at 420 px, against Name and Folder side by side at 280 px each with Description at full width.
33. Mode cards: 520×46, radius 6, selected with 1 px `accent` on `bg-subtle`, against about 432 px, radius 8, 1 px `accent` plus a 1 px ring and a 40% `accent-soft` tint. The radios use `accent-color: auto` against `accent`.
34. Markings tables:
    - rows 40 px (markings) and 34 px (tiles) against 29;
    - name input 32 px against 28;
    - "Marks with" select 24 px against 28;
    - colour slots are native radios plus swatches, against 22×24 `.mk-slot` buttons with an `accent` ring;
    - limit items are plain, against 25 px `.chk` pills (1 px `border-subtle`, radius 6);
    - intro `text-primary` against `text-secondary`.
35. Segmented control container: `flex` at 420 px, against `inline-flex`.

**AC-231, as it applies here:**
- The settings tables are cards with a `bg-subtle` header band and 12 px cells.
- The tiles table's rows are 34 px, but the markings table's rows are 40 px.
- I did not measure tabular numerals there.

## 4. Checklist rules that pass

- **Rule 1:** no text under 12 px.
  - Light view: 38 text nodes. Edit mode: 118. Chart SVG text is 12 px at its smallest.
  - Tabular numerals on axes fail (N7).
- **Rule 2:** no contrast failures.
  - Light view: lowest 4.56:1 (the search trigger).
  - Dark edit mode: 79 nodes, lowest 4.80:1.
- **Rule 3:** "✔ ACTIVE" and "◷ INACTIVE" in the settings nav, and "⚠ Could not load this chart", each pair an icon with a label.
- **Rule 4:** legend shown for the 3-series charts.
- **Rules 13 and 56:** one mode (Markings), set in Settings › Interactions. The inactive configuration is kept: "The configuration of the mode you are not using is kept, not cleared."
- **Rule 14:** "Dashboard" scope tag on the filter pill.
- **Rules 15 and 16:** tiles span whole columns (688, 538 and 1392 px) on a 12-column, 16 px-gap grid; heights are 320 and 386; tile padding 16, radius 6, no shadow.
- **Rule 17:** controls are 32 px; Properties select and Outline rows are 28 px; chips are 24 px.
- **Rule 18:** partial. Retry is present; Details is not (F10).
- **Rule 24:** dark is authored, not inverted: #121211, #1c1c1b, the dark series palette and #b4b3ab chart text.
- **Rule 36:** no size fields. Properties › Layout reads "6 / 12 columns · 320 px tall".
- **Rule 39 (partial):** Shift+→ resized a tile by one column (538 → 630 px).
- **Rules 43, 44, 45 and 57:**
  - one marking, "Marking", set as Default;
  - the Marking select offers "(None)" and "Marking";
  - the tile's own marking is disabled in its limit list, with the reason "This tile marks with this, so it cannot also be limited by it."
- **Rules 47, 49, 50 and 52 (source tile):**
  - a click replaced the marking;
  - marked bars have a 1.5 px `mk1` outline and unmarked bars `fill-opacity` 0.28;
  - the badge and chip name the marking;
  - the live region announced "Marking: 1 item marked in Orders by category and status".
  - The linked tile fails (N3).
- **AC-196, 198, 200–202, 204–211:** hold as described above.
  - AC-203 holds on its Fails-when; F19's gaps are prototype structure, not AC-203.
  - AC-208 was checked for headings only.
- **AC-199:** fails (F4).

**Not exercised:**
- cross-filter mode clicks (this would mean saving a mode change on a seed);
- drag-to-move and drop markers;
- undo toasts;
- KPI tiles with data;
- Image and Link tiles.

## Relevant files
- `/Users/srajagopal/Work/wechart/docs/design/prototype/index.html`:
  - `.btn`/`.input`/`.seg` at 551–630;
  - `.tabs`/`.section` at 702–739;
  - `.tile` at 1039–1066;
  - `.dash*`/`.filterbar`/`.fw` at 1217–1330;
  - dashboard v3 at 1736–1957;
  - markings (`.mchip`, `.mbadge`) at 1958–2106;
  - settings at 2107–2205;
  - `.dsection-head`/`.dadd` at 2228–2257.
- `/Users/srajagopal/Work/wechart/docs/design/prototype/dashboard.js`:
  - item rendering (Header, Tabs, sections) at 290–366;
  - header and tab row at 581–592;
  - filter bar and chip menu at 620–647;
  - click-to-select at 1357–1371.
- `/Users/srajagopal/Work/wechart/docs/design/critiques/2026-09-24-dashboard.md`: the earlier report.
- `/Users/srajagopal/Work/wechart/docs/spec.md`: AC-042 at line 150; AC-096/097/104 at 327–344; AC-187 at 616; AC-196–211 at 644–675.
